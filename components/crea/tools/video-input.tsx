"use client";

import { RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ToolSource } from "@/components/crea/tools/types";
import { VideoJobGrid } from "@/components/crea/video/video-job-grid";
import { FullScreenDropOverlay, useFullScreenDrop } from "@/components/studio/drop-slot";
import type { Id } from "@/convex/_generated/dataModel";
import { formatBytes } from "@/lib/crea-local-ai/progress";
import { CREA_VIDEO_COPY as T } from "@/lib/crea-video-copy";
import type { Locale } from "@/lib/i18n";

/** Najveći video sa uređaja - ista granica kao slot `video` (`MAX_SLOT_BYTES`). */
export const VIDEO_INPUT_MAX_BYTES = 200 * 1024 * 1024;

/**
 * Izabran video: fajl sa uređaja (ostaje na disku, čita se po delovima) ili rad iz
 * galerije (adresa Convex storage-a; `sourceJobId` = rezultat postaje njegova verzija).
 */
export type PickedVideo = {
  source: Blob | string;
  /** Za `<video>` pregled. */
  url: string;
  name: string;
  key: string;
  bytes: number | null;
  sourceJobId?: Id<"generationJobs">;
};

/**
 * Jedan ulaz videa za video alate (K18). Alat ima tačno jednu metu za video, pa ceo
 * ekran prima prevučen fajl (AGENTS.md), a tek posle provere da je to video do 200 MB.
 * `source` (`?ulaz=`, brza akcija „Nastavi"): rad iz galerije ulazi kao da je izabran.
 */
export function useVideoInput(source?: ToolSource | null) {
  const [picked, setPicked] = useState<PickedVideo | null>(null);
  const [problem, setProblem] = useState<"notVideo" | "videoTooBig" | null>(null);

  useEffect(
    () => () => {
      if (picked && typeof picked.source !== "string") URL.revokeObjectURL(picked.url);
    },
    [picked],
  );

  const chooseFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setProblem("notVideo");
      return;
    }
    if (file.size > VIDEO_INPUT_MAX_BYTES) {
      setProblem("videoTooBig");
      return;
    }
    setProblem(null);
    setPicked({ source: file, url: URL.createObjectURL(file), name: file.name, key: `${file.name}:${file.size}:${file.lastModified}`, bytes: file.size });
  }, []);

  const chooseJob = useCallback((jobId: Id<"generationJobs">, url: string) => {
    setProblem(null);
    setPicked({ source: url, url, name: T.galleryVideo.sr, key: `job:${jobId}`, bytes: null, sourceJobId: jobId });
  }, []);

  // Rad iz `?ulaz=` se bira jednom, kad stigne (a ne posle svakog rendera).
  const sourceKey = source ? `${source.jobId}:${source.url}` : null;
  const [takenSource, setTakenSource] = useState<string | null>(null);
  if (source && sourceKey && sourceKey !== takenSource) {
    setTakenSource(sourceKey);
    chooseJob(source.jobId, source.url);
  }

  return { picked, problem, chooseFile, chooseJob };
}

export function VideoInput({
  locale,
  input,
  disabled,
}: {
  locale: Locale;
  input: ReturnType<typeof useVideoInput>;
  disabled: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { picked, problem } = input;
  const [browsing, setBrowsing] = useState(false);
  const dragging = useFullScreenDrop(!disabled, (files) => input.chooseFile(files[0]));
  const showPicker = picked === null || browsing;

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*"
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
          <video
            src={picked.url}
            muted
            playsInline
            controls
            preload="metadata"
            crossOrigin={typeof picked.source === "string" ? "anonymous" : undefined}
            className="surface-media aspect-video w-full max-w-xs shrink-0 bg-paper object-contain shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate type-body-sm font-black text-ink">{picked.sourceJobId ? T.galleryVideo[locale] : picked.name}</p>
            {picked.bytes !== null ? <p className="font-mono text-xs font-bold text-muted">{formatBytes(picked.bytes, locale)}</p> : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setBrowsing(true)}
              className="igra-press mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              {T.otherVideo[locale]}
            </button>
          </div>
        </div>
      ) : null}

      {showPicker ? (
        <div className="space-y-3">
          <p className="type-body-sm font-black text-ink">{T.fromGallery[locale]}</p>
          <VideoJobGrid
            locale={locale}
            value={picked?.sourceJobId ?? null}
            disabled={disabled}
            onPick={(job) => {
              input.chooseJob(job._id, job.outputUrl);
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
            {T.chooseVideo[locale]}
          </button>
          <p className="type-body-sm font-semibold text-muted">{T.dropVideoHint[locale]}</p>
        </div>
      ) : null}

      {problem ? (
        <p role="alert" className="type-body-sm font-black text-red-700 dark:text-red-300">
          {T[problem][locale]}
        </p>
      ) : null}

      {dragging ? <FullScreenDropOverlay label={T.dropVideo[locale]} hint={T.dropVideoHint[locale]} /> : null}
    </div>
  );
}
