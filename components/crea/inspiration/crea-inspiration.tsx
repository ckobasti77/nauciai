"use client";

import { ArrowRight, BookOpen, Undo2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type MouseEvent } from "react";

import { PromptSegmentsView } from "@/components/crea/prompt-parts";
import { SketchPaper } from "@/components/crea/wait/sketch-paper";
import { cn } from "@/components/ui/primitives";
import { CREA_INSPIRATION_COPY as T } from "@/lib/crea-experience-copy";
import { inspirationsFor, makeLikeThisQuery, modeTarget, type CreaInspiration } from "@/lib/crea-inspiration";
import { CREA_AREA_KIND, parseCreaShellState, type CreaArea } from "@/lib/crea-shell";
import { toolById } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";
import type { CreaMotionParams } from "@/lib/motion-contract";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-2 border-ink px-3.5 text-sm font-black text-ink transition-[translate,box-shadow] duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/**
 * Inspiracija uz alat ili režim (K25, U11): primeri iz `lib/crea-inspiration.ts`. Kartica se
 * okrene kao list sveske - spreda je primer i „Napravi ovako", pozadi „Kako je napravljeno"
 * (koraci, opis po delovima, model). Uz smanjen pokret strana se samo zameni.
 *
 * „Napravi ovako" je pravi link (`?opis=`, `?model=`, `?alat=`). Za alat koji traži tvoj fajl
 * link vodi na isti alat, a klik ga dovede u vid i fokusira (`#crea-tool-root`).
 */
export function CreaInspiration({
  locale,
  target,
  motion: motionParams,
  modelName,
  className,
}: {
  locale: Locale;
  /** `oblast:režim` ili id alata. */
  target: string;
  motion: CreaMotionParams;
  modelName?: (slug: string) => string | undefined;
  className?: string;
}) {
  const examples = inspirationsFor(target);
  if (examples.length === 0) return null;
  return (
    <section aria-labelledby={`crea-inspiration-${target}`} className={cn("min-w-0", className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 id={`crea-inspiration-${target}`} className="type-h4 text-ink">
            {T.title[locale]}
          </h3>
          <p className="mt-0.5 type-body-sm font-semibold text-muted">{T.body[locale]}</p>
        </div>
      </div>
      <ul className="mt-3 grid gap-4 @min-[560px]:grid-cols-2">
        {examples.map((example) => (
          <li key={example.id} className="min-w-0">
            <InspirationCard example={example} locale={locale} motion={motionParams} {...(modelName ? { modelName } : {})} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function InspirationCard({
  example,
  locale,
  motion: motionParams,
  modelName,
}: {
  example: CreaInspiration;
  locale: Locale;
  motion: CreaMotionParams;
  modelName?: (slug: string) => string | undefined;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [flipped, setFlipped] = useState(false);
  const isMode = modeTarget(example.target) !== null;
  // Sličica je skica iz sveske za vrstu rada (ista kao na ekranu čekanja), ne izmišljen rezultat.
  const area: CreaArea = modeTarget(example.target)?.area ?? toolById(example.target)?.area ?? "slika";
  const href = `${pathname}?${makeLikeThisQuery(example, locale, new URLSearchParams(searchParams.toString()))}`;
  const model = example.modelSlug ? (modelName?.(example.modelSlug) ?? example.modelSlug) : null;
  const backId = `crea-inspiration-back-${example.id}`;
  const turn = motionParams.isReduced ? { duration: 0 } : { duration: motionParams.pageTurn.duration, ease: motionParams.pageTurn.ease };

  // Alat koji traži tvoj fajl: već si u njemu - samo ga dovedi u vid i fokusiraj ulaz.
  function focusTool(event: MouseEvent<HTMLAnchorElement>) {
    if (isMode || example.prompt || parseCreaShellState(searchParams).tool !== example.target) return;
    const root = document.getElementById("crea-tool-root");
    if (!root) return;
    event.preventDefault();
    root.scrollIntoView({ behavior: motionParams.isReduced ? "auto" : "smooth", block: "start" });
    root.querySelector<HTMLElement>("input, button, select, textarea, [tabindex='0']")?.focus({ preventScroll: true });
  }

  const face = "surface-card col-start-1 row-start-1 flex min-h-[220px] flex-col border-2 border-ink bg-paper-strong p-4 text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] [backface-visibility:hidden]";

  return (
    <div className="grid [perspective:1200px]">
      <motion.div
        className="col-start-1 row-start-1 grid [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: flipped && !motionParams.isReduced ? 180 : 0 }}
        transition={turn}
      >
        {/* Prednja strana: primer */}
        <div className={cn(face, flipped && motionParams.isReduced && "invisible")} aria-hidden={flipped} inert={flipped}>
          <div className="flex items-start gap-3">
            <div aria-hidden="true" className="paper-island surface-media w-24 shrink-0 -rotate-2 bg-paper p-1 shadow-[2px_2px_0_0_var(--yellow)]">
              <SketchPaper kind={CREA_AREA_KIND[area]} progress={1} animated={false} label="" />
            </div>
            <p className="type-h4 text-ink">{example.title[locale]}</p>
          </div>
          {example.prompt ? (
            <p className="mt-2 line-clamp-4 type-body-sm font-bold text-ink">„{example.prompt[locale]}“</p>
          ) : (
            <ol className="mt-2 list-decimal space-y-1 pl-5 type-body-sm font-semibold text-ink">
              {example.steps.map((step, index) => (
                <li key={index}>{step[locale]}</li>
              ))}
            </ol>
          )}
          {model ? (
            <p className="mt-2 text-xs font-bold text-muted">
              {T.model[locale]}: <span className="font-black text-ink">{model}</span>
            </p>
          ) : null}
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Link href={href} scroll={false} onClick={focusTool} className={cn(BUTTON, "paper-island bg-yellow shadow-[3px_3px_0_0_var(--ink)]")}>
              {T.makeLikeThis[locale]}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <button type="button" onClick={() => setFlipped(true)} aria-controls={backId} aria-expanded={flipped} className={cn(BUTTON, "bg-paper")}>
              <BookOpen aria-hidden="true" className="size-4" />
              {T.howMade[locale]}
            </button>
          </div>
        </div>

        {/* Zadnja strana: kako je napravljeno */}
        <div
          id={backId}
          className={cn(face, !motionParams.isReduced && "[transform:rotateY(180deg)]", !flipped && "invisible")}
          aria-hidden={!flipped}
          inert={!flipped}
        >
          <p className="type-h4 text-ink">{T.howMade[locale]}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 type-body-sm font-semibold text-ink">
            {example.steps.map((step, index) => (
              <li key={index}>{step[locale]}</li>
            ))}
          </ol>
          {example.prompt ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1 text-xs font-black text-muted">{T.description[locale]}</p>
              <PromptSegmentsView locale={locale} prompt={example.prompt[locale]} legendLabel={T.parts[locale]} />
            </div>
          ) : null}
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <button type="button" onClick={() => setFlipped(false)} className={cn(BUTTON, "bg-paper")}>
              <Undo2 aria-hidden="true" className="size-4" />
              {T.back[locale]}
            </button>
            <Link href={href} scroll={false} onClick={focusTool} className={cn(BUTTON, "paper-island bg-yellow shadow-[3px_3px_0_0_var(--ink)]")}>
              {T.makeLikeThis[locale]}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
