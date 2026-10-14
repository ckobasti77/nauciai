import type { StreakDayState } from "./crea-streak";
import { formatXp, levelName, streakFlameView, xpBarA11y, xpBarFraction } from "./igra-a11y";
import { IGRA_DAY_FORMS, IGRA_SHELL_COPY } from "./igra-copy";
import { levelFromXp } from "./igra-level";
import { formatOdometer } from "./igra-motion";
import { pluralize, t, type Locale } from "./i18n";

/**
 * Ljuska aplikacije (K06, plan K01 §6.1): šta red napretka u sidebaru, krug u rail-u, čip
 * u mobilnom zaglavlju i panel „Moj napredak" prikazuju i kažu. Čiste funkcije bez DOM-a;
 * crtaju ih `components/igra/shell-progress.tsx` i `progress-panel.tsx`.
 */

const COPY = IGRA_SHELL_COPY;

// ── Prsten nivoa ─────────────────────────────────────────────────────────────

export type LevelRingGeometry = {
  center: number;
  radius: number;
  /** Obim kruga = `stroke-dasharray`. */
  circumference: number;
  /** `stroke-dashoffset`: ceo obim za prazan prsten, 0 za pun. */
  offset: number;
};

/** Krug prečnika `size` sa linijom debljine `stroke` koja ne izlazi iz kutije. */
export function levelRingGeometry(size: number, stroke: number, progress: number): LevelRingGeometry {
  const radius = Math.max(0, (size - stroke) / 2);
  const circumference = 2 * Math.PI * radius;
  const value = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return { center: size / 2, radius, circumference, offset: circumference * (1 - value) };
}

// ── Red napretka, krug u rail-u i čip zaglavlja ──────────────────────────────

export type ShellProgressInput = { xp: number; streak: { current: number; todayDone: boolean } };

export type ShellProgressView = {
  level: number;
  levelName: string;
  /** 0..1 kroz tekući nivo (prsten i traka). */
  progress: number;
  /** „490 / 1.000 XP" kroz tekući nivo; na poslednjem nivou ukupan XP. */
  xpText: string;
  streakCount: string;
  /** Danas je upisano: plamen gori; inače tinja. */
  streakBurning: boolean;
  /** Naziv dugmeta: „Moj napredak: Graditelj. Nivo 5, 490 od 1.000 XP. Niz: 6 dana. …" */
  label: string;
};

export function shellProgressView(input: ShellProgressInput, locale: Locale): ShellProgressView {
  const info = levelFromXp(input.xp);
  const streak = streakFlameView(input.streak.current, input.streak.todayDone, locale);
  const name = levelName(info.level, locale);
  return {
    level: info.level,
    levelName: name,
    progress: info.progress,
    xpText: xpBarFraction(input.xp, locale) ?? formatXp(input.xp, locale),
    streakCount: streak.count,
    streakBurning: streak.burning,
    label: `${COPY.panelTitle[locale]}: ${name}. ${xpBarA11y(input.xp, locale)["aria-valuetext"]}. ${streak.label}`,
  };
}

// ── Panel: traka poslednjih dana ─────────────────────────────────────────────

/** Rečenica za čitač ekrana umesto 14 tačaka: „Aktivno 6 od poslednjih 14 dana." */
export function streakStripLabel(recent: ReadonlyArray<{ state: StreakDayState }>, locale: Locale): string {
  const active = recent.filter((day) => day.state === "active").length;
  const total = recent.length;
  return t(
    locale,
    `Aktivno ${active} od poslednjih ${total} ${pluralize(locale, total, IGRA_DAY_FORMS[locale])}.`,
    `Active on ${active} of the last ${total} ${pluralize(locale, total, IGRA_DAY_FORMS[locale])}.`,
  );
}

/** „Najduži niz: 9 dana". */
export function bestStreakText(best: number, locale: Locale): string {
  const days = Number.isFinite(best) ? Math.max(0, Math.floor(best)) : 0;
  return `${COPY.streakBest[locale]}: ${formatOdometer(days, locale)} ${pluralize(locale, days, IGRA_DAY_FORMS[locale])}`;
}

// ── Panel: nedeljna lista ────────────────────────────────────────────────────

export type WeekRankInput = { weekXp: number; weekRank: number | null; eligible: boolean };

/**
 * Rečenica uz mesto na nedeljnoj listi kad mesta nema (`weekRank === null`): osoblje se
 * ne rangira, bez XP-a ove nedelje je blag poziv, a dalje od 100. mesta upućuje na listu.
 * `null` kad mesto postoji (čip govori sam). Bez pretnje i bez odbrojavanja (O9).
 */
export function weekRankHint(input: WeekRankInput, locale: Locale): string | null {
  if (!input.eligible) return COPY.weekStaff[locale];
  if (input.weekRank !== null) return null;
  return input.weekXp > 0 ? COPY.weekBeyond[locale] : COPY.weekEmpty[locale];
}
