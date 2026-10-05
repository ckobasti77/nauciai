"use client";

import { Maximize2 } from "lucide-react";

import { StudioMediaSkeletonTile, StudioMediaTile, type StudioTileJob } from "@/components/app/studio-media-tile";
import { CreaLogo } from "@/components/crea/crea-logo";
import { CREA_STAGE_COPY } from "@/lib/crea-copy";
import type { CreaModeDef } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

/**
 * Sredina radionice: poslednji rad ove oblasti, uživo (status, protekli tajmer,
 * gotov medij). Klik otvara pun prikaz. Dok nema ničega, scena kaže šta sad da
 * uradiš - i gde je polje za opis (levo na širokom ekranu, dole na telefonu).
 */
export function CreaStage({
  locale,
  mode,
  job,
  isLoading,
  composerDocked,
  guest = false,
  onOpenDetail,
  onReuse,
  onExtend,
}: {
  locale: Locale;
  mode: CreaModeDef;
  job: StudioTileJob | null;
  isLoading: boolean;
  composerDocked: boolean;
  guest?: boolean;
  onOpenDetail: (job: StudioTileJob) => void;
  onReuse: (job: StudioTileJob) => void;
  onExtend: (job: StudioTileJob) => void;
}) {
  return (
    <section aria-labelledby="crea-stage-title" className="min-w-0">
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <h2 id="crea-stage-title" className="type-h3 text-ink">
          {CREA_STAGE_COPY.latest[locale]}
        </h2>
        {job ? (
          <button
            type="button"
            onClick={() => onOpenDetail(job)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-black text-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <Maximize2 aria-hidden="true" className="size-4" />
            {CREA_STAGE_COPY.open[locale]}
          </button>
        ) : null}
      </div>

      {job ? (
        <div className="mx-auto max-w-[640px]">
          <StudioMediaTile
            key={job._id}
            job={job}
            locale={locale}
            domId={`stage-${job._id}`}
            onOpenDetail={onOpenDetail}
            onReuse={onReuse}
            onExtend={onExtend}
          />
        </div>
      ) : isLoading ? (
        <div className="mx-auto max-w-[640px]">
          <StudioMediaSkeletonTile />
        </div>
      ) : (
        <div className="surface-card grid min-h-[280px] place-items-center border-2 border-dashed border-line bg-paper/70 px-6 py-10 text-center">
          <div className="max-w-sm">
            <CreaLogo variant="znak" className="mx-auto size-14" />
            <p className="mt-4 type-h3 text-ink">{CREA_STAGE_COPY.emptyTitle[locale]}</p>
            <p className="mt-2 type-body-sm font-semibold text-muted">{mode.blurb[locale]}</p>
            <p className="mt-3 type-body-sm font-bold text-ink">
              {guest
                ? CREA_STAGE_COPY.emptyGuest[locale]
                : composerDocked
                  ? CREA_STAGE_COPY.emptyDocked[locale]
                  : CREA_STAGE_COPY.emptyFloating[locale]}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
