"use client";

import { ArrowRight, Check, Pause, Play, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_LEARN_COPY } from "@/lib/crea-experience-copy";
import { learnDeck, seedFrom, type CreaTipArea } from "@/lib/crea-tips";
import type { Locale } from "@/lib/i18n";
import { creaMotion, type CreaMotionParams } from "@/lib/motion-contract";

const TICK_MS = 500;

/**
 * „Dok čekaš, nauči" (K25, U6): savet od 20 sekundi ili kviz pitanje. Smena staje dok je
 * miš ili fokus na kartici i na dugme „Zaustavi"; nerešeno pitanje dobija duplo vremena.
 * Nova kartica se okrene kao list sveske (oko gornje ivice); uz smanjen pokret samo se zameni.
 * Kviz ne daje XP (ODLUKA K25: pitanje postoji samo dok se čeka plaćen rad).
 */
export function LearnCard({
  locale,
  area,
  seed,
  motion: motionParams,
  className,
}: {
  locale: Locale;
  area: CreaTipArea;
  /** Npr. id posla - svako čekanje kreće od drugog saveta. */
  seed: string;
  motion: CreaMotionParams;
  className?: string;
}) {
  const deck = useMemo(() => learnDeck(area, seedFrom(seed)), [area, seed]);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const card = deck[index % deck.length]!;
  const cardId = card.type === "tip" ? card.tip.id : card.quiz.id;
  const answered = card.type === "quiz" ? answers[cardId] : undefined;
  const duration = card.type === "quiz" && answered === undefined ? creaMotion.tipRotateMs * 2 : creaMotion.tipRotateMs;
  const holding = paused || hovered;

  function next() {
    setIndex((value) => value + 1);
    setElapsed(0);
  }

  useEffect(() => {
    if (holding) return;
    const interval = setInterval(() => setElapsed((value) => value + TICK_MS), TICK_MS);
    return () => clearInterval(interval);
  }, [holding]);

  // Smena kad istekne vreme kartice (prelaz stanja u renderu, bez efekta koji samo prepisuje stanje).
  if (elapsed >= duration) next();

  const turn = motionParams.isReduced
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, rotateX: -70 },
        animate: { opacity: 1, rotateX: 0 },
        exit: { opacity: 0, rotateX: 40 },
        transition: { duration: motionParams.sheetFlip.duration, ease: motionParams.sheetFlip.ease },
      };

  return (
    <section
      aria-labelledby="crea-learn-title"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
      }}
      className={cn("surface-card relative overflow-hidden border-2 border-ink bg-paper-strong text-ink shadow-[4px_4px_0_0_var(--shadow-hard-14)]", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 border-b border-line px-4 py-2">
        <h3 id="crea-learn-title" className="whitespace-nowrap font-display type-display-sm text-ink">
          {CREA_LEARN_COPY.title[locale]}
        </h3>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-pressed={paused}
            aria-label={paused ? CREA_LEARN_COPY.resume[locale] : CREA_LEARN_COPY.pause[locale]}
            title={paused ? CREA_LEARN_COPY.resume[locale] : CREA_LEARN_COPY.pause[locale]}
            className="grid size-11 place-items-center rounded-full text-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-black text-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {CREA_LEARN_COPY.next[locale]}
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative min-h-[132px] px-4 py-3 [perspective:900px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${index}:${cardId}`} {...turn} style={{ transformOrigin: "50% 0%" }}>
            <p className="text-xs font-black uppercase text-muted">{card.type === "tip" ? CREA_LEARN_COPY.tip[locale] : CREA_LEARN_COPY.quiz[locale]}</p>
            {card.type === "tip" ? (
              <p className="mt-1 type-body font-bold text-ink">{card.tip.text[locale]}</p>
            ) : (
              <div className="mt-1">
                <p id={`crea-quiz-${cardId}`} className="type-body font-black text-ink">
                  {card.quiz.question[locale]}
                </p>
                <div role="group" aria-labelledby={`crea-quiz-${cardId}`} className="mt-2 flex flex-wrap gap-2">
                  {card.quiz.options.map((option, optionIndex) => {
                    const picked = answered === optionIndex;
                    const correct = optionIndex === card.quiz.answer;
                    return (
                      <button
                        key={optionIndex}
                        type="button"
                        disabled={answered !== undefined}
                        aria-pressed={picked}
                        onClick={() => {
                          setAnswers((current) => ({ ...current, [cardId]: optionIndex }));
                          setElapsed(0);
                        }}
                        className={cn(
                          "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-black transition-[translate] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                          answered === undefined
                            ? "border-ink bg-paper text-ink hover:-translate-y-0.5"
                            : correct
                              ? "paper-island border-ink bg-yellow text-ink"
                              : picked
                                ? "border-ink bg-paper text-ink line-through"
                                : "border-line bg-paper text-muted",
                        )}
                      >
                        {answered !== undefined && correct ? <Check aria-hidden="true" className="size-4" /> : null}
                        {answered !== undefined && picked && !correct ? <X aria-hidden="true" className="size-4" /> : null}
                        {option[locale]}
                      </button>
                    );
                  })}
                </div>
                {answered !== undefined ? (
                  <p role="status" className="mt-2 type-body-sm font-bold text-ink">
                    <span className="font-black">{answered === card.quiz.answer ? CREA_LEARN_COPY.correct[locale] : CREA_LEARN_COPY.wrong[locale]}</span>{" "}
                    {answered === card.quiz.answer ? null : <span>{fillCopy(CREA_LEARN_COPY.answerIs[locale], { a: card.quiz.options[card.quiz.answer]![locale] })} </span>}
                    {card.quiz.why[locale]}
                  </p>
                ) : null}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Koliko je ostalo do sledeće kartice; staje zajedno sa smenom. */}
      <div aria-hidden="true" className="h-1 bg-line/60">
        <div
          className="h-full origin-left bg-yellow transition-transform duration-500 ease-linear motion-reduce:transition-none"
          style={{ transform: `scaleX(${Math.max(0, 1 - elapsed / duration)})` }}
        />
      </div>
    </section>
  );
}
