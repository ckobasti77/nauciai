/* eslint-disable @next/next/no-img-element -- sličice su radovi iz galerije (Convex storage), koje next/image ne obrađuje. */
"use client";

import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { Check, Image as ImageIcon, Music, Plus, Upload, Video } from "lucide-react";
import { useRef, useState } from "react";

import type { MediaKind } from "@/components/crea/video/engine/media";
import { IgraState } from "@/components/igra/igra-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fillCopy } from "@/lib/crea-copy";
import { MONTAGE_COPY as T } from "@/lib/crea-montage-copy";
import type { Locale } from "@/lib/i18n";
import { jobPrompt } from "@/lib/studio-form";
import { isDemoPoster } from "@/lib/studio-gallery";

/**
 * Dodavanje u montažu (K19): radovi iz galerije (više odjednom, redom izbora) i
 * fajlovi sa uređaja. DEMO radovi (SVG plakat) se ne nude - nemaju pravi medij.
 * Prevlačenje fajlova preko celog ekrana prima sam alat (AGENTS.md).
 */

export type PickedGalleryItem = { jobId: Id<"generationJobs">; kind: MediaKind; url: string; name: string };

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const PAGE = 24;
const ACCEPT: Record<MediaKind, string> = {
  video: "video/mp4,video/quicktime,video/webm,video/*",
  image: "image/*",
  audio: "audio/*",
};

type Row = { _id: Id<"generationJobs">; kind: string; status: string; outputUrl: string | null; isMock?: boolean; params: string; modelSlug: string };

function GalleryGrid({
  locale,
  kind,
  selected,
  onToggle,
}: {
  locale: Locale;
  kind: MediaKind;
  selected: readonly PickedGalleryItem[];
  onToggle: (item: PickedGalleryItem) => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const jobs = usePaginatedQuery(api.studio.listMyJobs, isAuthenticated ? { kind } : "skip", { initialNumItems: PAGE });
  const rows = (jobs.results ?? []) as unknown as Row[];
  const done = rows.filter((job): job is Row & { outputUrl: string } => job.status === "done" && job.outputUrl !== null && !isDemoPoster(job));

  if (isAuthenticated && jobs.status === "LoadingFirstPage") {
    return <IgraState compact variant="ucitavanje" locale={locale} title={T.loading[locale]} />;
  }
  if (done.length === 0) {
    return <IgraState compact variant="prazno" art="prazno.radovi" locale={locale} title={T.noGallery[locale]} />;
  }
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {done.map((job) => {
          const order = selected.findIndex((item) => item.jobId === job._id);
          const prompt = jobPrompt(job.params) || job.modelSlug;
          return (
            <li key={job._id}>
              <button
                type="button"
                aria-pressed={order >= 0}
                title={prompt}
                aria-label={prompt}
                onClick={() => onToggle({ jobId: job._id, kind, url: job.outputUrl, name: prompt })}
                className={cn(
                  "surface-media relative block aspect-square w-full overflow-hidden border-2 bg-surface-b text-left transition",
                  order >= 0 ? "border-ink" : "border-ink/25 hover:border-ink",
                  FOCUS,
                )}
              >
                {kind === "video" ? (
                  <video preload="metadata" muted playsInline className="pointer-events-none size-full object-cover" src={`${job.outputUrl}#t=0.1`} />
                ) : kind === "image" ? (
                  <img src={job.outputUrl} alt="" loading="lazy" className="pointer-events-none size-full object-cover" />
                ) : (
                  <span className="flex size-full flex-col justify-between p-2">
                    <Music aria-hidden="true" className="size-5 text-ink" />
                    <span className="line-clamp-3 text-[11px] font-bold leading-tight text-ink">{prompt}</span>
                  </span>
                )}
                {order >= 0 ? (
                  <span className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full border-2 border-ink bg-yellow text-[11px] font-black text-ink">
                    {selected.length > 1 ? order + 1 : <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {jobs.status === "CanLoadMore" ? (
        <Button variant="secondary" onClick={() => jobs.loadMore(PAGE)}>
          {T.loadMore[locale]}
        </Button>
      ) : null}
    </div>
  );
}

export function MediaPicker({
  locale,
  kinds,
  busy,
  allowPip = false,
  onAddGallery,
  onAddFiles,
}: {
  locale: Locale;
  kinds: readonly MediaKind[];
  busy: boolean;
  allowPip?: boolean;
  onAddGallery: (items: PickedGalleryItem[], options: { asPip: boolean }) => void;
  onAddFiles: (files: File[], options: { asPip: boolean }) => void;
}) {
  const [tab, setTab] = useState<MediaKind>(kinds[0]);
  const [selected, setSelected] = useState<PickedGalleryItem[]>([]);
  const [asPip, setAsPip] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const icons: Record<MediaKind, typeof Video> = { video: Video, image: ImageIcon, audio: Music };

  const toggle = (item: PickedGalleryItem) =>
    setSelected((current) => (current.some((entry) => entry.jobId === item.jobId) ? current.filter((entry) => entry.jobId !== item.jobId) : [...current, item]));

  return (
    <div className="space-y-4">
      {kinds.length > 1 ? (
        <div role="tablist" aria-label={T.pickerTitle[locale]} className="flex flex-wrap gap-2">
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
                  "inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-black",
                  tab === kind ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                  FOCUS,
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {T.tabs[kind][locale]}
              </button>
            );
          })}
        </div>
      ) : null}

      <GalleryGrid locale={locale} kind={tab} selected={selected.filter((item) => item.kind === tab)} onToggle={toggle} />

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button
          onClick={() => {
            onAddGallery(selected, { asPip });
            setSelected([]);
          }}
          disabled={busy || selected.length === 0}
          icon={<Plus aria-hidden="true" className="size-4" />}
          className="shadow-[4px_4px_0_0_var(--ink)]"
        >
          {fillCopy(T.addSelected[locale], { n: selected.length })}
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={kinds.map((kind) => ACCEPT[kind]).join(",")}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.currentTarget.value = "";
            if (files.length > 0) onAddFiles(files, { asPip });
          }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} icon={<Upload aria-hidden="true" className="size-4" />}>
          {T.fromDevice[locale]}
        </Button>
        {allowPip && tab !== "audio" ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 type-body-sm font-black text-ink">
            <input type="checkbox" checked={asPip} onChange={(event) => setAsPip(event.target.checked)} className="size-5 accent-ink" />
            {T.addAsPip[locale]}
          </label>
        ) : null}
      </div>
      <p className="type-body-sm font-semibold text-muted">{T.dropHint[locale]}</p>
    </div>
  );
}
