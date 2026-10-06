/**
 * Niz dana (Crea K26, G2). Dan je aktivan kad je korisnik završio lekciju ILI
 * napravio rad u Crei (`profileActivityDays.lessons` / `creaWorks`, beogradski dan).
 *
 * Zamrzavanje (pravila, bez kupovine):
 *  - svakih 7 aktivnih dana zaredom dobiješ 1 zamrzavanje, najviše 2 u zalihi;
 *  - propušten dan potroši jedno zamrzavanje i niz ostaje (taj dan se ne broji);
 *  - propušten dan bez zamrzavanja prekida niz;
 *  - današnji dan nikad ne prekida niz - imaš do ponoći.
 * Sve je izvedeno iz istorije, pa se zamrzavanje ne može ni kupiti ni uzeti dvaput.
 */

export const STREAK_MILESTONES = [7, 30, 100] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];
export const STREAK_FREEZE_EVERY = 7;
export const STREAK_FREEZE_MAX = 2;
/** Koliko dana istorije se čita (pokriva i niz od 100 dana uz zamrzavanja). */
export const STREAK_WINDOW_DAYS = 400;
/** Koliko poslednjih dana traka niza prikazuje. */
export const STREAK_RECENT_DAYS = 14;

export type StreakDay = { dayKey: string; lessons: number; creaWorks?: number };
export type StreakDayState = "active" | "frozen" | "missed" | "today";

export type StreakSummary = {
  current: number;
  best: number;
  todayDone: boolean;
  freezes: number;
  /** Poslednjih `STREAK_RECENT_DAYS` dana, od najstarijeg; poslednji je danas. */
  recent: Array<{ dayKey: string; state: StreakDayState }>;
  /** Sledeći cilj (7/30/100) ili `null` posle 100. */
  nextMilestone: StreakMilestone | null;
  /** Cilj koji je dostignut BAŠ danas (za animaciju). */
  milestoneToday: StreakMilestone | null;
};

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string): boolean {
  if (!DAY_KEY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** `2026-10-06` ± n dana (kalendarski, bez vremenske zone). */
export function shiftDayKey(dayKey: string, delta: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function isActiveDay(day: StreakDay | undefined): boolean {
  return Boolean(day && (day.lessons > 0 || (day.creaWorks ?? 0) > 0));
}

export function computeStreak(days: readonly StreakDay[], todayKey: string): StreakSummary {
  const byKey = new Map(days.map((day) => [day.dayKey, day]));
  const windowStart = shiftDayKey(todayKey, -STREAK_WINDOW_DAYS);
  const firstActive = days
    .filter((day) => isActiveDay(day) && day.dayKey >= windowStart && day.dayKey < todayKey)
    .map((day) => day.dayKey)
    .sort()[0];

  const states = new Map<string, StreakDayState>();
  let current = 0;
  let best = 0;
  let freezes = 0;
  const countActive = () => {
    current += 1;
    best = Math.max(best, current);
    if (current % STREAK_FREEZE_EVERY === 0) freezes = Math.min(STREAK_FREEZE_MAX, freezes + 1);
  };

  if (firstActive) {
    for (let key = firstActive; key < todayKey; key = shiftDayKey(key, 1)) {
      if (isActiveDay(byKey.get(key))) {
        countActive();
        states.set(key, "active");
      } else if (current > 0 && freezes > 0) {
        freezes -= 1;
        states.set(key, "frozen");
      } else {
        current = 0;
        states.set(key, "missed");
      }
    }
  }

  const todayDone = isActiveDay(byKey.get(todayKey));
  if (todayDone) countActive();

  const recent: StreakSummary["recent"] = [];
  for (let i = STREAK_RECENT_DAYS - 1; i >= 0; i -= 1) {
    const key = shiftDayKey(todayKey, -i);
    recent.push({ dayKey: key, state: i === 0 ? (todayDone ? "active" : "today") : (states.get(key) ?? "missed") });
  }

  return {
    current,
    best,
    todayDone,
    freezes,
    recent,
    nextMilestone: STREAK_MILESTONES.find((m) => m > current) ?? null,
    milestoneToday: todayDone ? (STREAK_MILESTONES.find((m) => m === current) ?? null) : null,
  };
}
