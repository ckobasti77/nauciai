"use client";

import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { Check, Music, RefreshCw, Upload, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ToolSource } from "@/components/crea/tools/types";
import { IgraState } from "@/components/igra/igra-state";
import { FullScreenDropOverlay, useFullScreenDrop } from "@/components/studio/drop-slot";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import { CREA_SOUND_COPY as T } from "@/lib/crea-sound-copy";
import type { Locale } from "@/lib/i18n";
import { jobPrompt } from "@/lib/studio-form";
import { isDemoPoster } from "@/lib/studio-gallery";

/** Isto kao slotovi `audio` i `video` (`MAX_SLOT_BYTES`). */
export const SOUND_INPUT_MAX_BYTES = { audio: 50 * 1024 * 1024, video: 200 * 1024 * 1024 } as const;

export type SoundKind = "audio" | "video";

/** Izabran snimak ili video: fajl sa uređaja ili rad iz galerije (adresa Convex storage-a). */
export type PickedSound = {
  kind: SoundKind;
  source: Blob | string;
  url: string;
  name: string;
  key: string;
  bytes: number | null;
  sourceJobId?: Id<"generationJobs">;
};

type Problem = "notSound" | "tooBig";

function kindOf(file: File): SoundKind | null {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

/**
 * Jedan ulaz zvuka ILI videa (Crea K23: promena glasa, prevod, trake). Alat ima
 * tačno jednu metu, pa ceo ekran prima prevučen fajl (AGENTS.md) - tek posle
 * provere da je zvuk ili video u granici slota.
 */
export function useSoundInput(source?: ToolSource | null) {
  const [picked, setPicked] = useState<PickedSound | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(
    () => () => {
      if (picked && typeof picked.source !== "string") URL.revokeObjectURL(picked.url);
    },
    [picked],
  );

  const chooseFile = useCallback((file: File | undefined) => {
    if (!file) return;
    const kind = kindOf(file);
    if (!kind) return setProblem("notSound");
    if (file.size > SOUND_INPUT_MAX_BYTES[kind]) return setProblem("tooBig");
    setProblem(null);
    setPicked({ kind, source: file, url: URL.createObjectURL(file), name: file.name, key: `${file.name}:${file.size}:${file.lastModified}`, bytes: file.size });
  }, []);

  const chooseJob = useCallback((jobId: Id<"generationJobs">, url: string, kind: SoundKind, name: string) => {
    setProblem(null);
    setPicked({ kind, source: url, url, name, key: `job:${jobId}`, bytes: null, sourceJobId: jobId });
  }, []);

  // Rad iz `?ulaz=` se bira jednom, kad stigne.
  const sourceKey = source && (source.kind === "audio" || source.kind === "video") ? `${source.jobId}:${source.url}` : null;
  const [takenSource, setTakenSource] = useState<string | null>(null);
  if (source && sourceKey && sourceKey !== takenSource && (source.kind === "audio" || source.kind === "video")) {
    setTakenSource(sourceKey);
    chooseJob(source.jobId, source.url, source.kind, T.input.fromGallery.sr);
  }

  return { picked, problem, chooseFile, chooseJob };
}

type Row = { _id: Id<"generationJobs">; status: string; outputUrl: string | null; isMock?: boolean; params: string; modelSlug: string };

function GalleryList({ locale, kind, value, disabled, onPick }: { locale: Locale; kind: SoundKind; value: string | null; disabled: boolean; onPick: (row: Row & { outputUrl: string }) => void }) {
  const { isAuthenticated } = useConvexAuth();
  const jobs = usePaginatedQuery(api.studio.listMyJobs, isAuthenticated ? { kind } : "skip", { initialNumItems: 12 });
  const rows = (jobs.results ?? []) as unknown as Row[];
  const done = rows.filter((job): job is Row & { outputUrl: string } => job.status === "done" && job.outputUrl !== null && !isDemoPoster(job));
  if (isAuthenticated && jobs.status === "LoadingFirstPage") return <IgraState compact variant="ucitavanje" locale={locale} title={T.input.loading[locale]} />;
  if (done.length === 0) return <IgraState compact variant="prazno" art="prazno.radovi" locale={locale} title={T.input.empty[kind][locale]} />;
  return (
    <ul className="divide-y divide-line">
      {done.map((job) => {
        const selected = value === job._id;
        const label = jobPrompt(job.params).trim() || T.input.fromGallery[locale];
        return (
          <li key={job._id}>
            <button
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onPick(job)}
              className="flex min-h-11 w-full items-center gap-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2", selected ? "border-ink bg-ink text-paper-strong" : "border-ink/30 text-transparent")}>
                <Check aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate type-body-sm font-bold text-ink">{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SoundInput({ locale, input, disabled, kinds = ["video", "audio"] }: { locale: Locale; input: ReturnType<typeof useSoundInput>; disabled: boolean; kinds?: readonly SoundKind[] }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { picked, problem } = input;
  const [browsing, setBrowsing] = useState(false);
  const [tab, setTab] = useState<SoundKind>(kinds[0]!);
  const dragging = useFullScreenDrop(!disabled, (files) => input.chooseFile(files[0]));
  const showPicker = picked === null || browsing;
  const icons = { video: Video, audio: Music } as const;

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept={kinds.map((kind) => (kind === "audio" ? "audio/*" : "video/mp4,video/quicktime,video/webm,video/*")).join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          input.chooseFile(event.target.files?.[0]);
          setBrowsing(false);
          event.currentTarget.value = "";
        }}
      />

      {picked && !browsing ? (
        <div className="flex flex-wrap items-center gap-4">
          {picked.kind === "video" ? (
            <video
              src={picked.url}
              muted
              playsInline
              controls
              preload="metadata"
              crossOrigin={typeof picked.source === "string" ? "anonymous" : undefined}
              className="surface-media aspect-video w-full max-w-xs shrink-0 bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
            />
          ) : (
            <audio src={picked.url} controls preload="metadata" className="h-11 w-full max-w-xs" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate type-body-sm font-black text-ink">{picked.sourceJobId ? T.input.fromGallery[locale] : picked.name}</p>
            {picked.bytes !== null ? <p className="font-mono text-xs font-bold text-muted">{formatBytes(picked.bytes, locale)}</p> : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setBrowsing(true)}
              className="igra-press mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              {T.input.other[locale]}
            </button>
          </div>
        </div>
      ) : null}

      {showPicker ? (
        <div className="space-y-3">
          {kinds.length > 1 ? (
            <div role="tablist" aria-label={T.input.galleryLegend[locale]} className="flex flex-wrap gap-2">
              {kinds.map((kind) => {
                const Icon = icons[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={tab === kind}
                    onClick={() => setTab(kind)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                      tab === kind ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {T.input.tabs[kind][locale]}
                  </button>
                );
              })}
            </div>
          ) : null}
          <GalleryList
            locale={locale}
            kind={tab}
            value={picked?.sourceJobId ?? null}
            disabled={disabled}
            onPick={(job) => {
              input.chooseJob(job._id, job.outputUrl, tab, jobPrompt(job.params).trim() || T.input.fromGallery[locale]);
              setBrowsing(false);
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            className="igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
          >
            <Upload aria-hidden="true" className="size-4" />
            {T.input.fromDevice[locale]}
          </button>
          <p className="type-body-sm font-semibold text-muted">{T.input.dropHint[locale]}</p>
        </div>
      ) : null}

      {problem ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {T.input.problems[problem][locale]}
        </p>
      ) : null}

      {dragging ? <FullScreenDropOverlay label={T.input.drop[locale]} hint={T.input.dropHint[locale]} /> : null}
    </div>
  );
}
