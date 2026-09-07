/**
 * Blaga gamifikacija zajednice (N12) — ČISTA logika, bez React-a i bez ijednog
 * upita ka bazi.
 *
 * Sve ulazi iz polja koja zajednica VEĆ čita:
 *   · `xp` (leaderboardStats) → nivo, traka napretka, akcent nivoa,
 *   · `activity.days` (profileActivityDays, već na profilu člana) → broj tema,
 *     broj komentara i niz dana zaredom,
 *   · `helpfulAnswers` (leaderboardStats) → značka „prvi koristan odgovor".
 * Nema nove tabele, nema novog upita, nema zahteva po redu liste.
 */

/** XP po nivou. Isti prag kao `levelForXp` u `convex/leaderboardReadCore.ts`. */
export const XP_PER_LEVEL = 500;

/** Zatvoren set akcenata nivoa; tokeni `--level-accent-1..4` u `app/globals.css`. */
export const LEVEL_ACCENT_COUNT = 4;

export type LevelProgress = {
  level: number;
  /** XP osvojen unutar tekućeg nivoa (0 … XP_PER_LEVEL - 1). */
  intoLevel: number;
  /** Koliko XP još fali do sledećeg nivoa (1 … XP_PER_LEVEL). */
  xpToNext: number;
  /** Popunjenost trake, ceo broj 0…100. */
  percent: number;
};

export function levelProgress(xp: number | undefined): LevelProgress {
  const safeXp = typeof xp === "number" && Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const intoLevel = safeXp % XP_PER_LEVEL;
  return {
    level: Math.floor(safeXp / XP_PER_LEVEL) + 1,
    intoLevel,
    xpToNext: XP_PER_LEVEL - intoLevel,
    percent: Math.round((intoLevel / XP_PER_LEVEL) * 100),
  };
}

/** CSS promenljiva akcenta za dati nivo; boja se vrti kroz set od četiri tona. */
export function levelAccentVar(level: number): string {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.trunc(level)) : 1;
  return `var(--level-accent-${((safeLevel - 1) % LEVEL_ACCENT_COUNT) + 1})`;
}

/** Akcent po mestu na rang listi (1., 2., 3.). Van prva tri mesta nema akcenta. */
export function podiumAccentVar(rank: number): string | undefined {
  if (rank === 1) return "var(--level-accent-3)";
  if (rank === 2) return "var(--level-accent-1)";
  if (rank === 3) return "var(--level-accent-4)";
  return undefined;
}

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

export type ActivityDay = { dayKey: string; total: number };

function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Niz dana ZAREDOM koji se završava danas ili juče. Ako danas još nema aktivnosti,
 * niz se meri od juče — inače bi svaki niz izgledao prekinut do prve akcije u danu.
 * `days` su ključevi „YYYY-MM-DD" u istoj zoni u kojoj ih upisuje `profileActivityDays`.
 */
export function activityStreakDays(days: ActivityDay[], todayKey: string): number {
  const active = new Set(days.filter((day) => day.total > 0).map((day) => day.dayKey));
  let cursor = active.has(todayKey) ? todayKey : shiftDayKey(todayKey, -1);
  let streak = 0;
  while (active.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

/** Zbir jednog polja aktivnosti kroz sve dane (broj tema, broj komentara). */
export function activityTotal(days: Array<Record<string, number | string>>, field: "threads" | "comments"): number {
  return days.reduce((sum, day) => {
    const value = day[field];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}
