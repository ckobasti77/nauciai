import { isDayKey, shiftDayKey, type StreakDayState } from "./crea-streak";
import { t, type Locale } from "./i18n";

/**
 * Mastilo-kalendar na kontrolnoj tabli (K08, plan K07 §1.5): poslednje nedelje kao mreža
 * dana, tamnije mastilo za više završenih lekcija. Čista funkcija; crta je
 * `components/igra/ink-calendar.tsx`.
 *
 * Dva izvora, oba već na tabli: `overview.activity` (završene lekcije po UTC danu, cela
 * istorija) i `streak.recent` (poslednjih 14 beogradskih dana, računa i rad u Crei). Drugi
 * samo dopunjuje prvi: dan koji je u nizu aktivan dobija bar najsvetliji stepen.
 */

/** Koliko nedelja mreža ima (pola godine); na telefonu se vidi poslednjih 13. */
export const INK_CALENDAR_WEEKS = 26;
export const INK_CALENDAR_PHONE_WEEKS = 13;

/** 0 = prazno, 1-3 = sve tamnije mastilo. */
export type InkLevel = 0 | 1 | 2 | 3;

export type InkCalendarCell = {
  dayKey: string;
  level: InkLevel;
  today: boolean;
  /** Dan posle današnjeg u tekućoj nedelji: mesto u mreži postoji, ali se ne crta. */
  future: boolean;
  /** Redni broj nedelje u mreži, od najstarije (0). */
  week: number;
};

export type InkCalendarView = {
  weeks: number;
  /** `weeks × 7` ćelija, po kolonama: nedelja po nedelja, od ponedeljka do nedelje. */
  cells: InkCalendarCell[];
  activeDays: number;
  /** Prvi dan mreže (ponedeljak najstarije nedelje). */
  startKey: string;
  /** Rečenica za čitač ekrana umesto 182 ćelije. */
  label: string;
};

export function inkLevel(lessons: number): InkLevel {
  if (!Number.isFinite(lessons) || lessons <= 0) return 0;
  if (lessons >= 3) return 3;
  return lessons >= 2 ? 2 : 1;
}

/** 0 = ponedeljak … 6 = nedelja. */
function mondayIndex(dayKey: string): number {
  return (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function inkCalendarView(
  input: {
    activity: ReadonlyArray<{ day: string; completed: number }>;
    recent?: ReadonlyArray<{ dayKey: string; state: StreakDayState }>;
    todayKey: string;
    weeks?: number;
  },
  locale: Locale,
): InkCalendarView {
  const weeks = Math.max(1, Math.trunc(input.weeks ?? INK_CALENDAR_WEEKS));
  const label = (activeDays: number) =>
    t(locale, `Aktivnih dana u poslednjih ${weeks} nedelja: ${activeDays}.`, `Active days in the last ${weeks} weeks: ${activeDays}.`);
  if (!isDayKey(input.todayKey)) return { weeks, cells: [], activeDays: 0, startKey: input.todayKey, label: label(0) };

  const lessons = new Map(input.activity.map((item) => [item.day, item.completed]));
  const inStreak = new Set((input.recent ?? []).filter((day) => day.state === "active").map((day) => day.dayKey));
  const startKey = shiftDayKey(input.todayKey, -(mondayIndex(input.todayKey) + (weeks - 1) * 7));

  let activeDays = 0;
  const cells: InkCalendarCell[] = Array.from({ length: weeks * 7 }, (_, index) => {
    const dayKey = shiftDayKey(startKey, index);
    const future = dayKey > input.todayKey;
    const base = inkLevel(lessons.get(dayKey) ?? 0);
    const level: InkLevel = future ? 0 : base === 0 && inStreak.has(dayKey) ? 1 : base;
    if (level > 0) activeDays += 1;
    return { dayKey, level, today: dayKey === input.todayKey, future, week: Math.floor(index / 7) };
  });

  return { weeks, cells, activeDays, startKey, label: label(activeDays) };
}
