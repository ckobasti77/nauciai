import { describe, expect, test } from "vitest";

import { belgradeDayKey, belgradeWeekKey } from "../convex/leaderboardCore";
import { LEAGUE_TIERS, leagueTier, leagueTierForXp, previousWeekKey, rankLeague, weekKeyOfDay } from "./crea-leagues";

describe("nedeljne lige (G9)", () => {
  test("liga po XP-u prošle nedelje, od olovke do pera", () => {
    expect(LEAGUE_TIERS.map((tier) => tier.minXp)).toEqual([...LEAGUE_TIERS.map((tier) => tier.minXp)].sort((a, b) => a - b));
    expect(leagueTierForXp(0)).toBe(0);
    expect(leagueTierForXp(49)).toBe(0);
    expect(leagueTierForXp(50)).toBe(1);
    expect(leagueTierForXp(699)).toBe(3);
    expect(leagueTierForXp(100_000)).toBe(LEAGUE_TIERS.length - 1);
    expect(leagueTier(99).id).toBe("pero");
    expect(leagueTier(-1).id).toBe("olovka");
  });

  test("ključ nedelje iz dana = ključ nedelje sa servera (ponedeljak po Beogradu)", () => {
    expect(weekKeyOfDay("2026-10-05")).toBe("2026-10-05");
    expect(weekKeyOfDay("2026-10-11")).toBe("2026-10-05");
    expect(weekKeyOfDay("2026-10-12")).toBe("2026-10-12");
    expect(previousWeekKey("2026-10-05")).toBe("2026-09-28");
    // Ponoć i letnje vreme: dan sa klijenta daje istu nedelju kao server.
    for (const iso of ["2026-10-04T22:30:00Z", "2026-10-25T00:30:00Z", "2026-03-29T00:30:00Z", "2026-12-31T23:30:00Z"]) {
      const at = Date.parse(iso);
      expect(weekKeyOfDay(belgradeDayKey(at)), iso).toBe(belgradeWeekKey(at));
    }
  });

  test("rang: više XP-a je bolje, isti XP deli mesto, redosled po ulasku", () => {
    const ranked = rankLeague([
      { id: "a", xp: 40, joinedAt: 3 },
      { id: "b", xp: 90, joinedAt: 2 },
      { id: "c", xp: 40, joinedAt: 1 },
      { id: "d", xp: 0, joinedAt: 0 },
    ]);
    expect(ranked.map((row) => [row.id, row.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 2],
      ["d", 4],
    ]);
  });
});
