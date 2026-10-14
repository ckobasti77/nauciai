"use client";

import { useMutation } from "convex/react";
import { ArrowRight, CircleCheck, CircleX, GraduationCap, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CreaStamp } from "@/components/crea/game/crea-stamp";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_LESSON_COPY } from "@/lib/crea-game-copy";
import type { CreaMiniLesson } from "@/lib/crea-mini-lessons";
import { creaShellQuery } from "@/lib/crea-shell";
import { toolById } from "@/lib/crea-tools";
import { withLocale, type Locale } from "@/lib/i18n";

type Result = { first: boolean; freeTry: { granted: number } | { skipped: string } | null };

/**
 * Mini-lekcija (K26, G6): tri kartice pa tri pitanja, oko dva minuta. „Test" preskače
 * kartice. Odgovori se proveravaju odmah na uređaju (uz objašnjenje), pa još jednom na
 * serveru; tek tad se alati otključaju, a lekcija sa probom donosi besplatnu probu.
 */
export function CreaLessonPlayer({
  locale,
  lesson,
  startWithTest,
  appPath,
  onClose,
}: {
  locale: Locale;
  lesson: CreaMiniLesson;
  startWithTest: boolean;
  /** Kanonska putanja radionice (za „Probaj alate"). */
  appPath: string;
  onClose: () => void;
}) {
  const complete = useMutation(api.creaGame.completeMiniLesson);
  const [step, setStep] = useState<number>(startWithTest ? lesson.cards.length : 0);
  const [answers, setAnswers] = useState<Array<number | null>>(() => lesson.quiz.map(() => null));
  const [checked, setChecked] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viaTest = startWithTest;

  const inQuiz = step >= lesson.cards.length;
  const allAnswered = answers.every((a) => a !== null);
  const allRight = answers.every((a, i) => a === lesson.quiz[i]!.correct);

  async function check() {
    setChecked(true);
    if (!allRight) {
      setError(CREA_LESSON_COPY.failed[locale]);
      return;
    }
    setError(null);
    setSending(true);
    try {
      const outcome = await complete({ lessonId: lesson.id, answers: answers as number[], via: viaTest ? "test" : "lekcija" });
      if (outcome.ok) setResult({ first: outcome.first, freeTry: outcome.freeTry });
      else setError(CREA_LESSON_COPY.failed[locale]);
    } catch {
      setError(CREA_LESSON_COPY.sendFailed[locale]);
    } finally {
      setSending(false);
    }
  }

  const firstTool = lesson.unlocks.map((id) => toolById(id)).find((tool) => tool?.status === "ready");
  const toolHref = firstTool
    ? `${withLocale(locale, appPath)}?${creaShellQuery({ area: firstTool.area, mode: firstTool.mode, tool: firstTool.id }, new URLSearchParams())}`
    : withLocale(locale, appPath);

  return (
    <section
      aria-labelledby="crea-lekcija-naslov"
      className="surface-card relative border-2 border-ink bg-paper-strong p-4 text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-6"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={CREA_LESSON_COPY.close[locale]}
        className="absolute right-2 top-2 inline-grid size-11 place-items-center rounded-full transition hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
      <p className="flex items-center gap-2 pr-12 text-xs font-black text-muted">
        <GraduationCap aria-hidden="true" className="size-4" />
        {inQuiz ? fillCopy(CREA_LESSON_COPY.quizHeader[locale], { n: lesson.quiz.length }) : fillCopy(CREA_LESSON_COPY.card[locale], { n: step + 1, total: lesson.cards.length })}
      </p>
      <h2 id="crea-lekcija-naslov" className="mt-1 pr-12 type-h2">
        {lesson.title[locale]}
      </h2>

      {result ? (
        <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <CreaStamp locale={locale} size="lg" slam />
          <div className="min-w-0 space-y-2">
            <p className="type-h3">{result.first ? CREA_LESSON_COPY.passedTitle[locale] : CREA_LESSON_COPY.alreadyPassed[locale]}</p>
            <div>
              <p className="type-body-sm font-black">{CREA_LESSON_COPY.unlockedTools[locale]}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {lesson.unlocks.map((id) => (
                  <li key={id} className="rounded-full bg-surface-b px-2.5 py-1 text-xs font-black">
                    {toolById(id)?.title[locale]}
                  </li>
                ))}
              </ul>
            </div>
            {result.freeTry && "granted" in result.freeTry && lesson.freeTry ? (
              <p className="type-body-sm font-bold">{fillCopy(CREA_LESSON_COPY.freeTryGranted[locale], { where: lesson.freeTry.where[locale] })}</p>
            ) : result.freeTry && "skipped" in result.freeTry ? (
              <p className="type-body-sm font-bold text-muted">{CREA_LESSON_COPY.freeTrySkipped[locale]}</p>
            ) : null}
            {lesson.course ? (
              <Link
                href={withLocale(locale, lesson.course.slug ? `/courses/${lesson.course.slug}` : "/courses")}
                className="inline-flex min-h-11 items-center text-sm font-black underline decoration-yellow decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {fillCopy(CREA_LESSON_COPY.course[locale], { title: lesson.course.title[locale] })}
              </Link>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href={toolHref}
                className="igra-press igra-shadow-yellow inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {CREA_LESSON_COPY.openTools[locale]}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="igra-press inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {CREA_LESSON_COPY.backToMap[locale]}
              </button>
            </div>
          </div>
        </div>
      ) : !inQuiz ? (
        <div className="mt-4">
          <div className="surface-inset bg-surface-a p-5">
            <h3 className="type-h3">{lesson.cards[step]!.title[locale]}</h3>
            <p className="mt-2 type-body type-measure font-semibold">{lesson.cards[step]!.body[locale]}</p>
          </div>
          <div aria-hidden="true" className="mt-3 flex gap-1.5">
            {lesson.cards.map((card, i) => (
              <span key={card.title.sr} className={cn("h-1.5 w-8 rounded-full", i <= step ? "bg-ink" : "bg-surface-b")} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="igra-press igra-shadow-yellow inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-ink px-5 text-sm font-black text-paper-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {step === lesson.cards.length - 1 ? CREA_LESSON_COPY.toQuiz[locale] : CREA_LESSON_COPY.next[locale]}
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
            {step < lesson.cards.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(lesson.cards.length)}
                className="inline-flex min-h-11 items-center px-3 text-sm font-black text-ink underline decoration-line decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {CREA_LESSON_COPY.skipToTest[locale]}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {lesson.quiz.map((q, qi) => {
            const picked = answers[qi];
            const right = picked === q.correct;
            return (
              <fieldset key={q.question.sr} className="surface-inset bg-surface-a p-4">
                <legend className="sr-only">{fillCopy(CREA_LESSON_COPY.quiz[locale], { n: qi + 1, total: lesson.quiz.length })}</legend>
                <p className="type-body font-black">
                  {qi + 1}. {q.question[locale]}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {q.options.map((option, oi) => (
                    <button
                      key={option.sr}
                      type="button"
                      aria-pressed={picked === oi}
                      onClick={() => {
                        setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)));
                        setChecked(false);
                        setError(null);
                      }}
                      className={cn(
                        "min-h-11 rounded-full border-2 border-ink px-4 py-2 text-left text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
                        picked === oi ? "bg-ink text-paper-strong" : "igra-press bg-paper-strong text-ink",
                      )}
                    >
                      {option[locale]}
                    </button>
                  ))}
                </div>
                {checked && picked !== null ? (
                  <p className={cn("mt-2 flex items-start gap-1.5 type-body-sm font-bold", right ? "text-ink" : "text-muted")}>
                    {right ? <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                    <span>
                      {right ? CREA_LESSON_COPY.correct[locale] : CREA_LESSON_COPY.wrong[locale]}{" "}
                      {right ? <span className="font-semibold text-muted">{q.why[locale]}</span> : null}
                    </span>
                  </p>
                ) : null}
              </fieldset>
            );
          })}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!allAnswered || sending}
              onClick={() => void check()}
              className="igra-press igra-shadow-ink inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black text-ink disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {CREA_LESSON_COPY.check[locale]}
            </button>
            {error ? (
              <p role="alert" className="type-body-sm font-bold">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
