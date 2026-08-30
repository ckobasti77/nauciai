"use client";

import { usePaginatedQuery } from "convex/react";
import { Check } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { jobPrompt } from "@/lib/studio-form";

const PICKER_COUNT = 12;

type PickableJob = {
  _id: Id<"generationJobs">;
  status: string;
  outputUrl: string | null;
  params: string;
};

/**
 * Bira prethodnu generaciju OVOG modela kao ulaz sledećeg zahteva
 * (STUDIO-CATALOG-V4 3.8, nalaz S3): Gemini Omni "video" režim ne prima
 * upload - izmena OKAČENOG videa nije dozvoljena iz EEA/CH/UK - nego IZBOR iz
 * sopstvene galerije, jer izmena klipa koji je model sam napravio jeste
 * dozvoljena. `listMyJobs` već filtrira na prijavljenog korisnika i model.
 */
export function SourceJobPicker({
  modelSlug,
  kind,
  value,
  onChange,
  locale,
  disabled,
}: {
  modelSlug: string;
  kind: "image" | "video" | "audio";
  value: Id<"generationJobs"> | null;
  onChange: (jobId: Id<"generationJobs"> | null) => void;
  locale: Locale;
  disabled: boolean;
}) {
  const jobs = usePaginatedQuery(
    api.studio.listMyJobs,
    { modelSlug, kind },
    { initialNumItems: PICKER_COUNT },
  );
  const results = (jobs.results ?? []) as unknown as PickableJob[];
  const done = results.filter(
    (job): job is PickableJob & { outputUrl: string } => job.status === "done" && job.outputUrl !== null,
  );

  if (jobs.status === "LoadingFirstPage") {
    return (
      <div className="surface-inset border-2 border-dashed border-ink bg-paper p-4 text-center text-sm font-bold text-muted">
        {locale === "sr" ? "Učitavanje ranijih radova..." : "Loading your earlier work..."}
      </div>
    );
  }

  if (done.length === 0) {
    return (
      <div className="surface-inset border-2 border-dashed border-ink bg-paper p-4 text-center text-sm font-bold text-muted">
        {locale === "sr"
          ? "Ovim alatom još nisi napravio/la ništa što bi mogao/la da menjaš. Prvo napravi jednu stvar, pa je posle doradi ovde."
          : "You have not made anything with this tool yet, so there is nothing to edit. Make something first, then come back and rework it here."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-black text-ink">
        {locale === "sr" ? "Izaberi rad koji menjaš" : "Pick the work you are editing"}
      </p>
      <div role="group" className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {done.map((job) => {
          const selected = value === job._id;

          return (
            <button
              key={job._id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(selected ? null : job._id)}
              title={jobPrompt(job.params) || modelSlug}
              className={cn(
                "surface-media relative aspect-square overflow-hidden border-2 bg-paper transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60",
                selected ? "border-ink" : "border-ink/30 hover:border-ink",
              )}
            >
              <video
                preload="metadata"
                muted
                playsInline
                className="h-full w-full object-cover"
                src={`${job.outputUrl}#t=0.1`}
              />
              {selected ? (
                <span className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full border-2 border-ink bg-yellow text-ink">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
