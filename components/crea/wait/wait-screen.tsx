"use client";

import { Check, Moon } from "lucide-react";
import { useEffect, useState } from "react";

import { CreaLogo } from "@/components/crea/crea-logo";
import { SketchPaper } from "@/components/crea/wait/sketch-paper";
import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_WAIT_COPY, CREA_WAIT_STEP_DETAIL, CREA_WAIT_STEP_LABEL } from "@/lib/crea-experience-copy";
import {
  CREA_WAIT_STEPS,
  formatAbout,
  remainingText,
  waitState,
  type CreaWaitEstimate,
  type CreaWaitJob,
} from "@/lib/crea-wait";
import type { Locale } from "@/lib/i18n";
import { formatElapsedTime } from "@/lib/studio-motion";

/**
 * Ekran čekanja Cree (K25, U3) - sadržaj tamnog bunara dok se rad pravi: list sveske na
 * kojem olovka crta skicu, koraci U redu → Crta → Boji → Gotovo, mesto u redu, procena i
 * protekli sat. `stage` je velik (scena i pun prikaz), `tile` sažet (kartica u istoriji).
 *
 * Čitač ekrana dobija samo promenu koraka (`role="status"`), ne svaki otkucaj sata.
 */
export function CreaWaitScreen({
  job,
  locale,
  estimate,
  place,
  waitingMore = 0,
  prompt,
  size,
  animated,
}: {
  job: CreaWaitJob;
  locale: Locale;
  estimate: CreaWaitEstimate;
  /** Mesto u redu (`queuePlace`), ili `null` kad se već radi. */
  place: number | null;
  /** Poslovi koji čekaju slobodno mesto na klijentu (varijacije, K13). */
  waitingMore?: number;
  prompt: string;
  size: "tile" | "stage";
  animated: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const state = waitState(job, now, estimate.ms);
  const ticking = state !== null && !state.night && state.phase !== "gotovo";

  useEffect(() => {
    if (!ticking) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [ticking]);

  if (!state) return null;
  const big = size === "stage";
  const label = CREA_WAIT_STEP_LABEL[state.phase][locale];
  const detail = state.night ? CREA_WAIT_COPY.night[locale] : CREA_WAIT_STEP_DETAIL[state.phase][job.kind][locale];
  const timing = state.night
    ? null
    : state.phase === "red"
      ? fillCopy((estimate.basis === "history" ? CREA_WAIT_COPY.typicalHistory : CREA_WAIT_COPY.typicalKind)[locale], { t: formatAbout(estimate.ms, locale) })
      : remainingText(estimate.ms, state.elapsedMs, locale);

  return (
    <div className={cn("flex w-full flex-col items-center text-center", big ? "gap-4 px-4 py-6 sm:px-6" : "gap-3 p-4")}>
      <div className={cn("relative w-full", big ? "max-w-[300px]" : "max-w-[200px]")}>
        {/* List sveske na tamnom stolu: svetlo ostrvo u obe teme, tvrda senka bez zamućenja. */}
        <div className="paper-island surface-inset -rotate-[1.5deg] overflow-hidden bg-paper p-2 shadow-[4px_4px_0_0_var(--yellow)]">
          <SketchPaper kind={job.kind} progress={state.progress} animated={animated && !state.night} label={CREA_WAIT_COPY.sketchLabel[locale]} />
        </div>
        {big ? (
          <span className="absolute -right-3 -top-4 grid size-11 place-items-center rounded-full border-2 border-white/25 bg-studio-well" aria-hidden="true">
            {state.night ? (
              <Moon className="size-5 fill-yellow text-yellow" />
            ) : (
              // `data-theme="dark"`: znak stoji na tamnom bunaru u obe teme, pa mu treba svetlo mastilo.
              <span data-theme="dark" className="contents">
                <CreaLogo variant="znak" animated={animated} className="size-8" title="" />
              </span>
            )}
          </span>
        ) : null}
      </div>

      {big ? (
        <ol aria-label={CREA_WAIT_COPY.steps[locale]} className="flex flex-wrap items-center justify-center gap-1">
          {CREA_WAIT_STEPS.map((step, index) => {
            const done = index < state.step;
            const current = index === state.step;
            return (
              <li key={step} className="flex items-center gap-1">
                <span
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-0.5 rounded-full border-2 px-2 text-xs font-black",
                    current
                      ? "paper-island border-yellow bg-yellow text-ink"
                      : done
                        ? "border-white/40 text-white/90"
                        : "border-white/15 text-white/55",
                  )}
                >
                  {done ? <Check aria-hidden="true" className="size-3" /> : null}
                  {CREA_WAIT_STEP_LABEL[step][locale]}
                </span>
                {index < CREA_WAIT_STEPS.length - 1 ? (
                  <span aria-hidden="true" className={cn("h-0.5 w-2 rounded-full", done ? "bg-white/50" : "bg-white/15")} />
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="max-w-[320px]">
        <p role="status" className={cn("font-extrabold leading-snug text-white", big ? "text-base" : "text-sm")}>
          {big ? detail : `${label} · ${detail}`}
        </p>
        <p className="mt-1 text-xs font-bold text-white/70">
          {place !== null ? <span>{fillCopy(CREA_WAIT_COPY.place[locale], { n: place })} · </span> : null}
          {timing}
          {!state.night ? (
            <span className="font-mono text-white/55">
              {" · "}
              {CREA_WAIT_COPY.elapsed[locale]} {formatElapsedTime(job.createdAt, now)}
            </span>
          ) : null}
        </p>
        {waitingMore > 0 ? (
          <p className="mt-1 text-xs font-bold text-yellow">
            {locale === "sr" ? `Još ${waitingMore} čeka slobodno mesto` : `${waitingMore} more waiting for a free slot`}
          </p>
        ) : null}
        {prompt ? <p className="mt-2 line-clamp-2 text-xs font-semibold text-white/55">&bdquo;{prompt}&ldquo;</p> : null}
      </div>
    </div>
  );
}
