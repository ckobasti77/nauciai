import { describe, expect, it } from "vitest";

import { isValidUsername, normalizeUsername } from "./helpers";
import {
  LEADERBOARD_XP,
  belgradeDayKey,
  belgradeWeekKey,
  isLeaderboardEligibleRole,
} from "./leaderboardCore";

describe("community identity primitives", () => {
  it("normalizes usernames and enforces the public format", () => {
    expect(normalizeUsername("  Fox_123 ")).toBe("fox_123");
    expect(normalizeUsername("   ")).toBeUndefined();
    expect(isValidUsername("fox123")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("hello world")).toBe(false);
  });
});

describe("leaderboard primitives", () => {
  it("keeps staff out of XP ranking and uses the configured weights", () => {
    expect(isLeaderboardEligibleRole("student")).toBe(true);
    expect(isLeaderboardEligibleRole("pro_student")).toBe(true);
    expect(isLeaderboardEligibleRole("moderator")).toBe(false);
    expect(isLeaderboardEligibleRole("admin")).toBe(false);
    expect(LEADERBOARD_XP.lesson).toBe(100);
    expect(LEADERBOARD_XP.required_task).toBe(20);
    expect(LEADERBOARD_XP.helpful_comment).toBe(10);
  });

  it("starts weeks on Monday in Belgrade", () => {
    const monday = Date.UTC(2026, 6, 6, 10);
    const sunday = Date.UTC(2026, 6, 12, 10);
    expect(belgradeWeekKey(monday)).toBe("2026-07-06");
    expect(belgradeWeekKey(sunday)).toBe("2026-07-06");
    expect(belgradeDayKey(monday)).toBe("2026-07-06");
  });
});
