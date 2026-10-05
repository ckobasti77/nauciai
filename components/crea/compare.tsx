"use client";

import { Volume2, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { StudioTileJob } from "@/components/app/studio-media-tile";
import { cn } from "@/components/ui/primitives";
import { CREA_LIBRARY_COPY as L } from "@/lib/crea-library-copy";
import { toolOfJob } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";
import { jobPrompt } from "@/lib/studio-form";
import { isDemoPoster } from "@/lib/studio-gallery";
import { formatCreditsLong } from "@/lib/studio-params";

/**
 * Poređenje 2-4 rada jedan pored drugog (K16, S43): isti okvir za svaki, medij u
 * punoj visini kolone, ispod model, cena i opis. Na telefonu dve kolone (ili jedna
 * kad su dva rada), na računaru svi u redu. Plutajući sloj = svoj okvir (AGENTS.md).
 */
export function CreaCompare({
  locale,
  jobs,
  modelName,
  onClose,
  onOpen,
}: {
  locale: Locale;
  jobs: readonly StudioTileJob[];
  modelName: (slug: string) => string;
  onClose: () => void;
  onOpen: (job: StudioTileJob) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink/40 p-2 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crea-compare-title"
        onClick={(event) => event.stopPropagation()}
        className="surface-card flex max-h-full w-full max-w-[1400px] flex-col overflow-hidden border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-16)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id="crea-compare-title" className="type-h3 text-ink">
            {L.compareTitle[locale]} · {jobs.length}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={L.compareClose[locale]}
            className="inline-flex size-11 items-center justify-center rounded-full border-2 border-ink bg-paper text-ink transition hover:-translate-y-0.5 studio-focus-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <ul
          className={cn(
            "grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 sm:gap-4 sm:p-4",
            jobs.length === 2 ? "grid-cols-1 min-[480px]:grid-cols-2" : "grid-cols-2",
            jobs.length === 3 && "lg:grid-cols-3",
            jobs.length === 4 && "lg:grid-cols-4",
          )}
        >
          {jobs.map((job) => {
            const tool = toolOfJob(job);
            const prompt = jobPrompt(job.params);
            const poster = isDemoPoster(job);
            return (
              <li key={job._id} className="flex min-w-0 flex-col gap-2">
                <div className="surface-media relative grid min-h-40 flex-1 place-items-center overflow-hidden bg-studio-well shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]">
                  {job.outputUrl && (job.kind === "image" || poster) ? (
                    // Lokalni potpisan URL iz Convex storage-a - isti kao u kartici (bez `next/image` optimizacije).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={job.outputUrl} alt={prompt || tool?.title[locale] || job.modelSlug} className="max-h-[62vh] w-full object-contain" />
                  ) : job.outputUrl && job.kind === "video" ? (
                    <video src={job.outputUrl} controls muted playsInline loop className="max-h-[62vh] w-full object-contain" />
                  ) : job.outputUrl && job.kind === "audio" ? (
                    <div className="flex w-full flex-col items-center gap-3 p-4 text-white/80">
                      <Volume2 aria-hidden="true" className="size-6" />
                      <audio src={job.outputUrl} controls className="w-full" />
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1 px-1">
                  <p className="truncate text-sm font-black text-ink">{tool ? tool.title[locale] : modelName(job.modelSlug)}</p>
                  <p className="font-mono text-xs font-black text-muted">
                    {job.creditCost === 0 ? L.free[locale] : formatCreditsLong(job.creditCost, locale)}
                  </p>
                  {prompt ? <p className="line-clamp-3 text-xs font-semibold text-ink">{prompt}</p> : null}
                  <button
                    type="button"
                    onClick={() => onOpen(job)}
                    className="inline-flex min-h-11 items-center text-xs font-black text-ink underline underline-offset-2 hover:text-muted studio-focus-ink"
                  >
                    {L.compareOpen[locale]}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
