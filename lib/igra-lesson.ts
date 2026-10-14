import { IGRA_CLASSROOM_COPY } from "./igra-copy";
import type { Locale, LocalizedText } from "./i18n";
import { lessonStepLabel } from "./lesson-position";

/**
 * Lekcija u učionici (K09, plan K07 §2.2) - čista logika: traka koraka, „+N XP" posle
 * završetka i sledeća lekcija. Crtaju je `components/igra/lesson-steps-bar.tsx` i
 * `lesson-done.tsx`; napredak i dalje upisuje samo `courses.markProgress`.
 */

// ── Traka koraka ─────────────────────────────────────────────────────────────

/** Linija čitanja: blok čiji je vrh iznad 40 % visine ekrana je „stigao". */
const READING_LINE = 0.4;

/**
 * Korak do kog je čitalac stigao (indeks od 0): poslednji blok čiji je vrh prešao liniju
 * čitanja. Kad strana nema više kuda da skroluje (`atPageEnd`), to je poslednji korak -
 * kratak završni blok inače nikad ne bi stigao do linije.
 */
export function activeLessonStep(tops: readonly number[], viewportHeight: number, atPageEnd: boolean): number {
  if (tops.length === 0) return 0;
  if (atPageEnd) return tops.length - 1;
  const line = viewportHeight * READING_LINE;
  let active = 0;
  tops.forEach((top, index) => {
    if (top <= line) active = index;
  });
  return active;
}

/** Sve što traka koraka crta i izgovara; `step` je od 1 i steže se na 1..total. */
export function lessonStepsView(step: number, total: number, locale: Locale) {
  const safeTotal = Number.isFinite(total) ? Math.max(1, Math.trunc(total)) : 1;
  const safeStep = Number.isFinite(step) ? Math.min(safeTotal, Math.max(1, Math.trunc(step))) : 1;
  const label = lessonStepLabel(locale, safeStep, safeTotal);
  return {
    label,
    progress: safeStep / safeTotal,
    a11y: {
      role: "progressbar",
      "aria-label": IGRA_CLASSROOM_COPY.stepsLabel[locale],
      "aria-valuemin": 1,
      "aria-valuemax": safeTotal,
      "aria-valuenow": safeStep,
      "aria-valuetext": label,
    } as const,
  };
}

// ── „+N XP" ──────────────────────────────────────────────────────────────────

/** Porast XP-a između klika i odgovora; bez porasta ili uz loš ulaz → 0. */
export function xpGain(before: number, after: number): number {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return Math.max(0, Math.round(after - before));
}

// ── Sledeća lekcija ──────────────────────────────────────────────────────────

export type LessonRef = { slug: string; title: LocalizedText; completed: boolean };

/** Kurs iz `courses:getAppNavigation`, samo ono što redosled lekcija traži. */
type NavigationCourse = {
  modules?: ReadonlyArray<{
    sortOrder: number;
    lessons?: ReadonlyArray<{
      slug: string;
      titleSr: string;
      titleEn: string;
      isPublished: boolean;
      sortOrder: number;
      progress?: { completed?: boolean } | null;
    }>;
  }>;
};

/** Objavljene lekcije kursa redom kojim ih student prelazi (moduli, pa lekcije u njima). */
export function lessonRefs(course: NavigationCourse | null | undefined): LessonRef[] {
  return [...(course?.modules ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((module) => [...(module.lessons ?? [])].sort((a, b) => a.sortOrder - b.sortOrder))
    .filter((lesson) => lesson.isPublished)
    .map((lesson) => ({ slug: lesson.slug, title: { sr: lesson.titleSr, en: lesson.titleEn }, completed: Boolean(lesson.progress?.completed) }));
}

export type LessonNext = {
  /** Kuda dalje; `null` kad nema kuda. */
  lesson: LessonRef | null;
  /** Posle ove lekcije u kursu nema nijedne nezavršene. */
  courseDone: boolean;
};

/**
 * Šta sledi posle lekcije `currentSlug`, koja se računa kao završena: naredna lekcija po
 * redu; posle poslednje prva koja je ostala nezavršena; ako takve nema, kurs je završen.
 * `null` kad lekcije nema u spisku (spisak još nije stigao ili je lekcija skinuta) -
 * izmišljen sledeći korak je gori od nikakvog.
 */
export function nextLessonAfter(lessons: readonly LessonRef[], currentSlug: string): LessonNext | null {
  const index = lessons.findIndex((lesson) => lesson.slug === currentSlug);
  if (index < 0) return null;
  const open = lessons.filter((lesson, at) => at !== index && !lesson.completed);
  return { lesson: lessons[index + 1] ?? open[0] ?? null, courseDone: open.length === 0 };
}
