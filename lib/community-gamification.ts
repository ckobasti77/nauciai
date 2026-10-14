/**
 * Blaga gamifikacija zajednice (N12) — ČISTA logika, bez React-a i bez ijednog
 * upita ka bazi.
 *
 * Značke ulaze iz polja koja zajednica VEĆ čita (`activity.days` za teme, komentare i
 * niz dana, `helpfulAnswers` iz leaderboardStats). Nivo i traka napretka su od IGRA-e
 * u `lib/igra-level.ts`. Nema nove tabele, nema novog upita, nema zahteva po redu liste.
 */

export type CommunityBadgeKey = "first_thread" | "ten_comments" | "first_helpful" | "week_streak";

/**
 * Signali za značke. Polje koje je `undefined` znači „taj podatak ovde ne postoji" —
 * značka se tada PRESKAČE, ne prikazuje se kao neosvojena. (Lista članova, na primer,
 * zna broj korisnih odgovora ali ne i podelu tema/komentara.)
 */
export type BadgeSignals = {
  threads?: number;
  comments?: number;
  helpfulAnswers?: number;
  streakDays?: number;
};

const BADGE_RULES: Array<{ key: CommunityBadgeKey; read: (s: BadgeSignals) => number | undefined; min: number }> = [
  { key: "first_thread", read: (s) => s.threads, min: 1 },
  { key: "ten_comments", read: (s) => s.comments, min: 10 },
  { key: "first_helpful", read: (s) => s.helpfulAnswers, min: 1 },
  { key: "week_streak", read: (s) => s.streakDays, min: 7 },
];

export function communityBadges(signals: BadgeSignals): CommunityBadgeKey[] {
  return BADGE_RULES.filter((rule) => {
    const value = rule.read(signals);
    return typeof value === "number" && value >= rule.min;
  }).map((rule) => rule.key);
}
