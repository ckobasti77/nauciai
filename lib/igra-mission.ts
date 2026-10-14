import { courseCatalogPath, lessonPath } from "./app-routes";
import type { IgraLik, IgraPoza } from "./igra-art";
import { IGRA_DASHBOARD_COPY } from "./igra-copy";
import { localized, t, withLocale, type Locale, type LocalizedText } from "./i18n";

/**
 * Misija dana na kontrolnoj tabli (K08, plan K07 §1.4): JEDAN sledeći korak, izabran iz
 * podataka koje tabla već ima. Ovo je vodič, ne zadatak: nema XP-a, roka ni brojača (O9).
 * Čista funkcija; crta je `components/igra/dashboard/dashboard-hero.tsx`.
 */

const COPY = IGRA_DASHBOARD_COPY;

export type DailyMissionKind = "course" | "lesson" | "crea" | "community" | "lesson-more";

export type DailyMissionResume = {
  courseSlug: string;
  lessonSlug: string;
  courseTitle: LocalizedText;
  lessonTitle: LocalizedText;
  /** Redni broj lekcije u kursu (od 1) i ukupan broj lekcija. */
  position: number;
  total: number;
};

export type DailyMissionInput = {
  /** Ima kurs koji sme da otvori (aktivan upis ili tim). */
  hasUnlockedCourse: boolean;
  resume: DailyMissionResume | null;
  completedLessons: number;
  /** `undefined` = podatak nije poznat; pravilo se tada preskače. */
  hasCommunityPost?: boolean;
  hasCreaWork?: boolean;
  /** Današnji dan je već upisan u niz (lekcija ili rad). */
  todayDone: boolean;
};

export type DailyMission = {
  kind: DailyMissionKind;
  title: string;
  body: string;
  cta: string;
  /** Gotov javni URL. */
  href: string;
  lik: IgraLik;
  poza: IgraPoza;
  /** Samo za lekciju: mesto u kursu za prsten napretka. */
  ring: { position: number; total: number } | null;
};

function lessonLine(resume: DailyMissionResume, locale: Locale): string {
  return t(
    locale,
    `Lekcija ${resume.position} od ${resume.total}: ${localized(resume.lessonTitle, locale)}.`,
    `Lesson ${resume.position} of ${resume.total}: ${localized(resume.lessonTitle, locale)}.`,
  );
}

/**
 * Prvo pravilo koje važi pobeđuje:
 *  1. nema otključan kurs → izaberi kurs;
 *  2. ima lekciju koja čeka, a dan još nije upisan → nastavi (ili započni prvu);
 *  3. još nema rada u Crei → prvi rad;
 *  4. još nema objave u zajednici → javi se;
 *  5. ima lekciju koja čeka (dan je već upisan) → još jedna, ako ti se uči;
 *  6. inače `null`: za danas je sve na mestu.
 * Nepoznat podatak (`undefined`) preskače svoje pravilo: ne predlažemo ono što je možda
 * već urađeno.
 */
export function pickDailyMission(input: DailyMissionInput, locale: Locale): DailyMission | null {
  const { resume } = input;

  if (!input.hasUnlockedCourse) {
    return {
      kind: "course",
      title: COPY.missionCourseTitle[locale],
      body: COPY.missionCourseBody[locale],
      cta: COPY.missionCourseCta[locale],
      href: courseCatalogPath(locale),
      lik: "sova",
      poza: "mase",
      ring: null,
    };
  }

  if (resume && !input.todayDone) {
    const first = input.completedLessons <= 0;
    return {
      kind: "lesson",
      title: first
        ? COPY.missionLessonFirstTitle[locale]
        : t(locale, `Nastavi: ${localized(resume.courseTitle, locale)}`, `Continue: ${localized(resume.courseTitle, locale)}`),
      body: lessonLine(resume, locale),
      cta: resume.position <= 1 ? COPY.missionLessonStartCta[locale] : COPY.missionLessonCta[locale],
      href: lessonPath(locale, resume.courseSlug, resume.lessonSlug),
      lik: "sova",
      poza: "misli",
      ring: { position: resume.position, total: resume.total },
    };
  }

  if (input.hasCreaWork === false) {
    return {
      kind: "crea",
      title: COPY.missionCreaTitle[locale],
      body: COPY.missionCreaBody[locale],
      cta: COPY.missionCreaCta[locale],
      href: `${withLocale(locale, "/app/studio")}?oblast=slika`,
      lik: "piksi",
      poza: "mase",
      ring: null,
    };
  }

  if (input.hasCommunityPost === false) {
    return {
      kind: "community",
      title: COPY.missionCommunityTitle[locale],
      body: COPY.missionCommunityBody[locale],
      cta: COPY.missionCommunityCta[locale],
      href: withLocale(locale, "/app/community/discussions"),
      lik: "iskra",
      poza: "mase",
      ring: null,
    };
  }

  if (resume) {
    return {
      kind: "lesson-more",
      title: COPY.missionMoreTitle[locale],
      body: t(
        locale,
        `Današnji korak je upisan. Ako ti se uči još: lekcija ${resume.position} od ${resume.total}.`,
        `Today's step is logged. If you feel like more: lesson ${resume.position} of ${resume.total}.`,
      ),
      cta: COPY.missionLessonCta[locale],
      href: lessonPath(locale, resume.courseSlug, resume.lessonSlug),
      lik: "sova",
      poza: "mase",
      ring: { position: resume.position, total: resume.total },
    };
  }

  return null;
}

/** Udeo pređenog dela kursa za prsten misije (0..1): lekcije PRE one koja čeka. */
export function missionRingProgress(ring: { position: number; total: number }): number {
  if (!Number.isFinite(ring.position) || !Number.isFinite(ring.total) || ring.total <= 0) return 0;
  return Math.min(1, Math.max(0, (ring.position - 1) / ring.total));
}

/** Naziv prstena za čitač ekrana: „Lekcija 4 od 9". */
export function missionRingLabel(ring: { position: number; total: number }, locale: Locale): string {
  return t(locale, `Lekcija ${ring.position} od ${ring.total}`, `Lesson ${ring.position} of ${ring.total}`);
}
