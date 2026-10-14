"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { useCreaGame } from "@/components/crea/game/crea-game-context";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_LOCKED_COPY } from "@/lib/crea-game-copy";
import type { CreaMiniLesson } from "@/lib/crea-mini-lessons";
import { withLocale, type Locale } from "@/lib/i18n";

/** Link na mini-lekciju u svesci (mapa veština, lekcija otvorena). */
export function useLessonHref(locale: Locale) {
  const { notebookPath } = useCreaGame();
  return (lessonId: string) => `${withLocale(locale, notebookPath)}?deo=mapa&lekcija=${encodeURIComponent(lessonId)}`;
}

/**
 * Postepeno otkrivanje (K26, U10): umesto zaključanih alata u spisku stoji jedna
 * kartica - koliko ih čeka i koja mini-lekcija ih otvara. Nikad cena.
 */
export function CreaLockedTools({ locale, count, lessons }: { locale: Locale; count: number; lessons: readonly CreaMiniLesson[] }) {
  const lessonHref = useLessonHref(locale);
  if (count === 0) return null;
  return (
    <div className="surface-inset bg-paper p-3 text-ink">
      <p className="flex items-center gap-2 type-body font-black">
        <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
        {fillCopy(CREA_LOCKED_COPY.title[locale], { n: count })}
      </p>
      <p className="mt-0.5 type-body-sm font-semibold text-muted">{CREA_LOCKED_COPY.body[locale]}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link
              href={lessonHref(lesson.id)}
              className="igra-press inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-3 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {fillCopy(CREA_LOCKED_COPY.lesson[locale], { title: lesson.title[locale] })}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
