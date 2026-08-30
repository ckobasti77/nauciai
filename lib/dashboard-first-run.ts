/**
 * Cista logika "prvih koraka" - pozdravnog heroa na komandnoj tabli (`/app`) i u
 * Ucionici (`/app/classroom`).
 *
 * Do U4 je `DashboardFirstRun` bio ZAMENA za celu tablu: dok student nema kurs,
 * komandna tabla se uopste nije renderovala. Sada je to kompaktan hero na vrhu,
 * a njegov checklist se stiklira iz stvarnih podataka - ne iz pretpostavke.
 * Ovde ne zivi nijedan React ni Convex poziv, samo odluke; tekst koraka bira
 * komponenta kroz `lib/i18n`.
 */

export type FirstRunStepId = "course" | "lesson" | "community";

export type FirstRunSignals = {
  /** Student je otkljucao bar jedan kurs (aktivan upis ili staff rola). */
  hasUnlockedCourse: boolean;
  /** `overview.progress.completedLessons` - broj zavrsenih lekcija. */
  completedLessons: number;
  /**
   * Da li je student vec pisao u zajednici. `undefined` znaci "ova povrsina taj
   * podatak nema" (Ucionica ga ne dobija, njen payload je `getAppNavigation`) -
   * korak tada stoji neodstikliran, sto je isto sto i "jos nije uradjeno".
   */
  hasCommunityPost?: boolean;
};

export type FirstRunStep = {
  id: FirstRunStepId;
  /** Korak je zavrsen prema stvarnim podacima. */
  done: boolean;
  /** Prvi nezavrsen korak - jedini koji je istaknut kao "sad ovo". */
  next: boolean;
};

/** Fiksan redosled: kurs -> lekcija -> zajednica. Nema smisla obrnuto. */
const FIRST_RUN_ORDER: readonly FirstRunStepId[] = ["course", "lesson", "community"];

export function buildFirstRunChecklist(signals: FirstRunSignals): FirstRunStep[] {
  const done: Record<FirstRunStepId, boolean> = {
    course: signals.hasUnlockedCourse,
    lesson: signals.completedLessons > 0,
    // Namerno `=== true`: `undefined` (podatak ne postoji na ovoj povrsini) ne sme
    // da se procita kao "uradjeno".
    community: signals.hasCommunityPost === true,
  };
  const nextId = FIRST_RUN_ORDER.find((id) => !done[id]) ?? null;
  return FIRST_RUN_ORDER.map((id) => ({ id, done: done[id], next: id === nextId }));
}

export function firstRunDoneCount(steps: readonly FirstRunStep[]): number {
  return steps.filter((step) => step.done).length;
}

/**
 * Zona A komandne table: `ResumeHero` ili pozdravni hero.
 *
 * Uslov nije samo "ima kurs": administrator (kome je svaki kurs otkljucan) na
 * praznoj bazi nema sta da nastavi, a `ResumeHero` bi mu tada napisao "Sve
 * lekcije su zavrsene" - sto nije tacno. Zato hero trazi i da postoji ijedna
 * lekcija.
 */
export function shouldShowResumeHero(view: {
  hasUnlockedCourse: boolean;
  hasResume: boolean;
  totalLessons: number;
}): boolean {
  return view.hasUnlockedCourse && (view.hasResume || view.totalLessons > 0);
}
