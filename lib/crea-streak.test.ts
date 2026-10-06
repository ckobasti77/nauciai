import { describe, expect, it } from "vitest";

import { computeStreak, isDayKey, shiftDayKey, STREAK_FREEZE_MAX, STREAK_RECENT_DAYS, type StreakDay } from "./crea-streak";

const TODAY = "2026-10-06";

/** Aktivni dani unazad od danas: `0` = danas, `1` = juče… */
function days(offsets: number[], kind: "lessons" | "creaWorks" = "creaWorks"): StreakDay[] {
  return offsets.map((offset) => ({
    dayKey: shiftDayKey(TODAY, -offset),
    lessons: kind === "lessons" ? 1 : 0,
    creaWorks: kind === "creaWorks" ? 1 : 0,
  }));
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("ključevi dana", () => {
  it("pomera kroz mesece i prestupnu godinu", () => {
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDayKey("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("prepoznaje samo pravi datum", () => {
    expect(isDayKey("2026-10-06")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("06.10.2026")).toBe(false);
  });
});

describe("niz dana", () => {
  it("broji lekciju ILI rad u Crei", () => {
    const mixed = [...days([1, 3], "lessons"), ...days([2], "creaWorks")];
    expect(computeStreak(mixed, TODAY).current).toBe(3);
  });

  it("dan bez lekcije i bez rada ne broji (komentari i zadaci se ne računaju)", () => {
    const quiet: StreakDay[] = [{ dayKey: shiftDayKey(TODAY, -1), lessons: 0, creaWorks: 0 }];
    expect(computeStreak(quiet, TODAY).current).toBe(0);
  });

  it("današnji dan ne prekida niz dok ne prođe ponoć", () => {
    const summary = computeStreak(days([1, 2, 3]), TODAY);
    expect(summary).toMatchObject({ current: 3, todayDone: false });
    expect(summary.recent.at(-1)).toEqual({ dayKey: TODAY, state: "today" });
  });

  it("propušten dan bez zamrzavanja prekida niz", () => {
    expect(computeStreak(days([0, 1, 3, 4, 5]), TODAY).current).toBe(2);
  });

  it("zamrzavanje: 7 dana zaredom daje jedno, propušten dan ga troši i niz ostaje", () => {
    // 9..3 = 7 aktivnih dana, 2 propušten, 1 i 0 aktivni.
    const summary = computeStreak(days([...range(3, 9), 1, 0]), TODAY);
    expect(summary.current).toBe(9);
    expect(summary.freezes).toBe(0);
    expect(summary.recent.find((day) => day.dayKey === shiftDayKey(TODAY, -2))?.state).toBe("frozen");
  });

  it("zamrzavanja se skupljaju najviše do dva", () => {
    const summary = computeStreak(days(range(0, 34)), TODAY);
    expect(summary.current).toBe(35);
    expect(summary.freezes).toBe(STREAK_FREEZE_MAX);
  });

  it("dva propuštena dana troše dva zamrzavanja; treći prekida", () => {
    const twoFrozen = computeStreak(days([...range(4, 17), 1, 0]), TODAY); // 14 dana → 2 zamrzavanja, 3 i 2 propušteni
    expect(twoFrozen.current).toBe(16);
    expect(twoFrozen.freezes).toBe(0);
    const broken = computeStreak(days([...range(5, 18), 1, 0]), TODAY); // 4, 3 i 2 propušteni
    expect(broken.current).toBe(2);
  });

  it("cilj 7/30/100 se javlja samo onog dana kad je dostignut", () => {
    expect(computeStreak(days(range(0, 6)), TODAY)).toMatchObject({ current: 7, milestoneToday: 7, nextMilestone: 30 });
    expect(computeStreak(days(range(1, 7)), TODAY)).toMatchObject({ current: 7, milestoneToday: null });
    expect(computeStreak(days(range(0, 29)), TODAY).milestoneToday).toBe(30);
    expect(computeStreak(days(range(0, 99)), TODAY)).toMatchObject({ current: 100, milestoneToday: 100, nextMilestone: null });
  });

  it("traka ima poslednjih 14 dana, od najstarijeg", () => {
    const recent = computeStreak(days([0, 1]), TODAY).recent;
    expect(recent).toHaveLength(STREAK_RECENT_DAYS);
    expect(recent[0]!.dayKey).toBe(shiftDayKey(TODAY, -(STREAK_RECENT_DAYS - 1)));
    expect(recent.at(-1)).toEqual({ dayKey: TODAY, state: "active" });
  });

  it("najbolji niz ostaje zapamćen posle prekida", () => {
    const summary = computeStreak(days([...range(20, 31), 0]), TODAY);
    expect(summary.best).toBe(12);
    expect(summary.current).toBe(1);
  });
});
