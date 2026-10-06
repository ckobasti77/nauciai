"use client";

import { useConvex } from "convex/react";
import { Maximize2 } from "lucide-react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { StudioMediaSkeletonTile, StudioMediaTile, type StudioTileJob } from "@/components/app/studio-media-tile";
import { CreaInspiration } from "@/components/crea/inspiration/crea-inspiration";
import type { QuickActionLink } from "@/components/crea/quick-actions-menu";
import { CreaLogo } from "@/components/crea/crea-logo";
import { fireConfetti } from "@/components/crea/reveal/fire-confetti";
import { StageCompanion } from "@/components/crea/wait/stage-companion";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { CreaMoment } from "@/convex/creaMomentsCore";
import { CREA_STAGE_COPY } from "@/lib/crea-copy";
import { CREA_MASCOT_MOOD_MS, mascotLine, mascotMoodFor } from "@/lib/crea-mascot";
import { momentMessage } from "@/lib/crea-reveal";
import type { CreaArea, CreaModeDef } from "@/lib/crea-shell";
import { isWaitingStatus } from "@/lib/crea-wait";
import type { Locale } from "@/lib/i18n";
import { creaMotionFor } from "@/lib/motion-contract";
import { jobStatusText } from "@/lib/studio-form";

/**
 * Sredina radionice: poslednji rad ove oblasti, uživo. Dok se radi - ekran čekanja (olovka,
 * koraci, procena) i ispod maskota sa „Dok čekaš, nauči" (K25). Kad rad stigne - otkrivanje
 * (polaroid / traka / kaseta), maskota slavi, a konfete pucaju samo za poseban trenutak
 * (prvi rad, prvi video ili zvuk, jubilej). Bez čekanja ispod stoji inspiracija (U11).
 */
export function CreaStage({
  locale,
  area,
  mode,
  job,
  history = [],
  waitingMore = 0,
  isLoading,
  composerDocked,
  guest = false,
  onOpenDetail,
  onReuse,
  onExtend,
  onToggleFavorite,
  quickActionsFor,
  modelName,
}: {
  locale: Locale;
  area: CreaArea;
  mode: CreaModeDef;
  job: StudioTileJob | null;
  /** Učitani radovi (procena čekanja i mesto u redu). */
  history?: readonly StudioTileJob[];
  /** Varijacije koje čekaju slobodno mesto na klijentu. */
  waitingMore?: number;
  isLoading: boolean;
  composerDocked: boolean;
  guest?: boolean;
  onOpenDetail: (job: StudioTileJob) => void;
  onReuse: (job: StudioTileJob) => void;
  onExtend: (job: StudioTileJob) => void;
  onToggleFavorite?: (job: StudioTileJob) => void;
  /** Brze akcije (K16, S44) i na poslednjem radu. */
  quickActionsFor?: (job: StudioTileJob) => QuickActionLink[];
  /** Ime modela iz kataloga (za „Kako je napravljeno" u inspiraciji). */
  modelName?: (slug: string) => string | undefined;
}) {
  const convex = useConvex();
  const crea = creaMotionFor(Boolean(useReducedMotion()));
  const [finished, setFinished] = useState<{ jobId: string; outcome: "done" | "failed" } | null>(null);
  const [moment, setMoment] = useState<{ jobId: string; value: CreaMoment } | null>(null);

  // Noćna tura čeka do jutra - maskota i saveti su za čekanje od par sekundi ili minuta.
  const working = job !== null && isWaitingStatus(job.status) && job.status !== "queued";
  const recent = finished && job && finished.jobId === job._id ? finished.outcome : null;
  const mood = mascotMoodFor({ working, justFinished: recent === "done", justFailed: recent === "failed" });

  // Slavlje i tuga traju par sekundi, pa se scena smiri (i vrati inspiraciju).
  useEffect(() => {
    if (!finished) return;
    const timeout = setTimeout(() => setFinished(null), CREA_MASCOT_MOOD_MS[finished.outcome === "done" ? "slavi" : "tuzna"]);
    return () => clearTimeout(timeout);
  }, [finished]);

  function handleFinished(done: StudioTileJob, outcome: "done" | "failed", element: HTMLElement | null) {
    setFinished({ jobId: done._id, outcome });
    if (outcome !== "done" || guest) return;
    void convex
      .query(api.creaMoments.momentForJob, { jobId: done._id as Id<"generationJobs"> })
      .then((value) => {
        if (!value) return;
        setMoment({ jobId: done._id, value });
        if (crea.confetti) void fireConfetti(element, value.id !== "prvi-od-vrste");
      })
      .catch(() => {
        // Bez trenutka nema konfeta - rad je svejedno stigao.
      });
  }

  const message =
    mood === "slavi" && job
      ? (momentMessage(moment && moment.jobId === job._id ? moment.value : null, locale) ?? mascotLine("slavi", locale))
      : mood === "tuzna" && job
        ? jobStatusText(job, locale)
        : null;

  return (
    <section aria-labelledby="crea-stage-title" className="@container min-w-0">
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
            waitHistory={history}
            waitingMore={waitingMore}
            waitSize="stage"
            revealOnFinish
            onFinished={handleFinished}
            {...(onToggleFavorite ? { onToggleFavorite } : {})}
            {...(quickActionsFor ? { quickActions: quickActionsFor(job) } : {})}
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

      <AnimatePresence initial={false}>
        {job && mood !== "miruje" ? (
          <StageCompanion key={`companion:${job._id}`} locale={locale} mood={mood} kind={job.kind} seed={job._id} message={message} motion={crea} />
        ) : null}
      </AnimatePresence>

      {!working && mood === "miruje" ? (
        <CreaInspiration
          locale={locale}
          target={`${area}:${mode.id}`}
          motion={crea}
          className="mx-auto mt-6 max-w-[640px]"
          {...(modelName ? { modelName } : {})}
        />
      ) : null}
    </section>
  );
}
