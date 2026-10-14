import type { LocalizedText } from "./i18n";

/**
 * Nivoi IGRA-e (K04, plan K01 §5.2): 12 nivoa nad postojećim XP-om, SAMO za prikaz (O6).
 * Ništa se ne dobija nivoom - ni krediti, ni popust. XP pravila (`LEADERBOARD_XP`) i
 * serverski `levelForXp` (500 XP po nivou) ostaju kakvi jesu; UI nivo računa odavde.
 *
 * Kriva: prva lekcija (100 XP) = nivo 2 prvog dana, dve nedelje redovnog rada (oko 655 XP
 * nedeljno + 90 XP za prve radove) = nivo 5, a nivo 12 je retkost (oko 30 nedelja).
 * Scenarije zaključava `lib/igra-level.test.ts` nad uvezenim `LEADERBOARD_XP`.
 */

export type IgraLevel = { level: number; minXp: number; name: LocalizedText };

export const IGRA_LEVELS: readonly IgraLevel[] = [
  { level: 1, minXp: 0, name: { sr: "Početnik", en: "Beginner" } },
  { level: 2, minXp: 100, name: { sr: "Radoznalac", en: "Curious" } },
  { level: 3, minXp: 300, name: { sr: "Skicar", en: "Sketcher" } },
  { level: 4, minXp: 700, name: { sr: "Istraživač", en: "Explorer" } },
  { level: 5, minXp: 1400, name: { sr: "Graditelj", en: "Builder" } },
  { level: 6, minXp: 2400, name: { sr: "Pronalazač", en: "Inventor" } },
  { level: 7, minXp: 3800, name: { sr: "Kreator", en: "Creator" } },
  { level: 8, minXp: 5600, name: { sr: "Majstor", en: "Master" } },
  { level: 9, minXp: 8000, name: { sr: "Vizionar", en: "Visionary" } },
  { level: 10, minXp: 11000, name: { sr: "Mentor", en: "Mentor" } },
  { level: 11, minXp: 15000, name: { sr: "Šampion", en: "Champion" } },
  { level: 12, minXp: 20000, name: { sr: "Legenda", en: "Legend" } },
];

export const IGRA_MAX_LEVEL = IGRA_LEVELS.length;

export type IgraLevelInfo = {
  level: number;
  name: LocalizedText;
  /** Prag tekućeg nivoa. */
  minXp: number;
  /** Prag sledećeg nivoa; `null` na poslednjem. */
  nextMinXp: number | null;
  /** Koliko je XP-a skupljeno unutar tekućeg nivoa. */
  xpIntoLevel: number;
  /** Koliko još fali do sledećeg nivoa; `null` na poslednjem. */
  xpForNext: number | null;
  /** 0..1 kroz tekući nivo; 1 na poslednjem. */
  progress: number;
};

/** Nivo za dati XP. Negativan, `NaN` ili beskonačan XP je 0; razlomak se zaokružuje nadole. */
export function levelFromXp(xp: number): IgraLevelInfo {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let index = 0;
  for (let i = 1; i < IGRA_LEVELS.length; i += 1) {
    if (safeXp >= IGRA_LEVELS[i]!.minXp) index = i;
  }
  const current = IGRA_LEVELS[index]!;
  const next = IGRA_LEVELS[index + 1];
  const xpIntoLevel = safeXp - current.minXp;
  return {
    level: current.level,
    name: current.name,
    minXp: current.minXp,
    nextMinXp: next ? next.minXp : null,
    xpIntoLevel,
    xpForNext: next ? next.minXp - safeXp : null,
    progress: next ? xpIntoLevel / (next.minXp - current.minXp) : 1,
  };
}
