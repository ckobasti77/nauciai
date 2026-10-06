import type { LocalizedText } from "./i18n";

/**
 * Nedeljne lige Cree (K27, G9). Liga se bira po NIVOU AKTIVNOSTI - XP-u iz prošle
 * nedelje (G1: lekcije, radovi, izazovi; nikad kupljeni krediti) - pa se iz lige ne
 * može izaći kupovinom, samo radom. U ligi su grupe do 30 ljudi; rang u grupi je XP
 * ove nedelje. Ko ove nedelje skupi više, sledeće ide u višu ligu (i obrnuto).
 *
 * Nedelja počinje ponedeljkom po Beogradu (`leaderboardCore.belgradeWeekKey`).
 */

export type LeagueTier = { id: string; minXp: number; label: LocalizedText };

/** Školski pribor, od olovke do pera. `minXp` = XP prošle nedelje. */
export const LEAGUE_TIERS: readonly LeagueTier[] = [
  { id: "olovka", minXp: 0, label: { sr: "Olovka", en: "Pencil" } },
  { id: "bojica", minXp: 50, label: { sr: "Bojica", en: "Crayon" } },
  { id: "flomaster", minXp: 150, label: { sr: "Flomaster", en: "Marker" } },
  { id: "cetkica", minXp: 350, label: { sr: "Četkica", en: "Brush" } },
  { id: "pero", minXp: 700, label: { sr: "Pero", en: "Fountain pen" } },
];

export const LEAGUE_COHORT_SIZE = 30;
/** Prva tri mesta grupe dobijaju oznaku na tabeli (bez kredita - XP se ne kupuje, liga se ne plaća). */
export const LEAGUE_PODIUM = 3;

export function leagueTierForXp(weekXp: number): number {
  let tier = 0;
  for (let index = 0; index < LEAGUE_TIERS.length; index += 1) {
    if (weekXp >= LEAGUE_TIERS[index]!.minXp) tier = index;
  }
  return tier;
}

export function leagueTier(index: number): LeagueTier {
  return LEAGUE_TIERS[Math.max(0, Math.min(LEAGUE_TIERS.length - 1, index))]!;
}

/** Ponedeljak nedelje kojoj dan pripada (`YYYY-MM-DD`), isto kao `belgradeWeekKey`. */
export function weekKeyOfDay(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7; // ponedeljak = 0
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

export function previousWeekKey(weekKey: string): string {
  const date = new Date(`${weekKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

export type LeagueRow<T> = T & { rank: number };

/**
 * Rang u grupi: više XP-a = bolje; isti XP deli mesto (1, 2, 2, 4), a redosled unutar
 * istog mesta ide po ranijem ulasku u ligu.
 */
export function rankLeague<T extends { xp: number; joinedAt: number }>(members: readonly T[]): Array<LeagueRow<T>> {
  const sorted = [...members].sort((a, b) => b.xp - a.xp || a.joinedAt - b.joinedAt);
  let rank = 0;
  return sorted.map((member, index) => {
    if (index === 0 || member.xp !== sorted[index - 1]!.xp) rank = index + 1;
    return { ...member, rank };
  });
}
