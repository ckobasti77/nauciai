"use client";

import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { Check } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_VIDEO_COPY as T } from "@/lib/crea-video-copy";
import type { Locale } from "@/lib/i18n";
import { jobPrompt } from "@/lib/studio-form";
import { isDemoPoster } from "@/lib/studio-gallery";

const COUNT = 12;

export type PickedVideoJob = { _id: Id<"generationJobs">; outputUrl: string; modelSlug: string; params: string };

type Row = PickedVideoJob & { status: string; isMock?: boolean; outputUrl: string | null };

/**
 * Tvoji gotovi video radovi kao mreža za izbor (K18: poslednji kadar, produži).
 * DEMO radovi (SVG plakat) se ne nude - nemaju pravi video.
 */
export function VideoJobGrid({
  locale,
  value,
  onPick,
  disabled = false,
}: {
  locale: Locale;
  value: string | null;
  onPick: (job: PickedVideoJob) => void;
  disabled?: boolean;
}) {
  // Bez prijave nema galerije (upit bi bacio `Unauthorized`) - ostaje izbor sa uređaja.
  const { isAuthenticated } = useConvexAuth();
  const jobs = usePaginatedQuery(api.studio.listMyJobs, isAuthenticated ? { kind: "video" } : "skip", { initialNumItems: COUNT });
  const rows = (jobs.results ?? []) as unknown as Row[];
  const done = rows.filter(
    (job): job is Row & { outputUrl: string } => job.status === "done" && job.outputUrl !== null && !isDemoPoster(job),
  );

  if (isAuthenticated && jobs.status === "LoadingFirstPage") {
    return <p className="type-body-sm font-bold text-muted">{T.loadingVideos[locale]}</p>;
  }
  if (done.length === 0) {
    return <p className="surface-inset border border-dashed border-line bg-paper p-3 type-body-sm font-bold text-muted">{T.noVideos[locale]}</p>;
  }

  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {done.map((job) => {
        const selected = value === job._id;
        return (
          <li key={job._id}>
            <button
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onPick(job)}
              title={jobPrompt(job.params) || job.modelSlug}
              aria-label={jobPrompt(job.params) || job.modelSlug}
              className={cn(
                "surface-media relative block aspect-square w-full overflow-hidden border-2 bg-paper transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60",
                selected ? "border-ink" : "border-ink/25 hover:border-ink",
              )}
            >
              <video preload="metadata" muted playsInline className="pointer-events-none size-full object-cover" src={`${job.outputUrl}#t=0.1`} />
              {selected ? (
                <span className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full border-2 border-ink bg-yellow text-ink">
                  <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
