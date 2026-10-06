import { describe, expect, test } from "vitest";

import {
  CHALLENGE_BEGINNER_MAX_XP,
  CHALLENGE_MIN_ENTRIES,
  CHALLENGE_MIN_VOTES,
  CHALLENGE_THEMES,
  challengeForDay,
  challengeGroupForXp,
  pickWinner,
  resultsDayFor,
  votingDayFor,
} from "./crea-challenges";
import { seasonById } from "./crea-seasons";

describe("dnevni izazov (G3)", () => {
  test("teme: jedinstvene, srpski i engleski, dovoljno za mesec i po", () => {
    expect(CHALLENGE_THEMES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CHALLENGE_THEMES.map((theme) => theme.id)).size).toBe(CHALLENGE_THEMES.length);
    for (const theme of CHALLENGE_THEMES) {
      expect(theme.id).toMatch(/^[a-z0-9-]+$/);
      expect(theme.label.sr && theme.label.en && theme.hint.sr && theme.hint.en, theme.id).toBeTruthy();
    }
  });

  test("isti dan = ista tema; uzastopni dani = različite teme; sezona daje svoje teme", () => {
    expect(challengeForDay("2026-10-06")).toEqual(challengeForDay("2026-10-06"));
    const month = Array.from({ length: CHALLENGE_THEMES.length }, (_, index) =>
      challengeForDay(new Date(Date.parse("2026-02-01T00:00:00Z") + index * 86_400_000).toISOString().slice(0, 10)).theme.id,
    );
    expect(new Set(month).size).toBe(CHALLENGE_THEMES.length);
    // Datum pre početka brojanja i dalje daje temu.
    expect(challengeForDay("2025-12-01").theme.id).toBeTruthy();
    const christmas = challengeForDay("2026-12-26");
    expect(christmas.seasonId).toBe("nova-godina");
    expect(christmas.theme).toEqual(seasonById("nova-godina")!.themes[0]);
    expect(challengeForDay("2026-10-06").seasonId).toBeNull();
  });

  test("grupa po ukupnom XP-u", () => {
    expect(challengeGroupForXp(0)).toBe("pocetnici");
    expect(challengeGroupForXp(CHALLENGE_BEGINNER_MAX_XP - 1)).toBe("pocetnici");
    expect(challengeGroupForXp(CHALLENGE_BEGINNER_MAX_XP)).toBe("svi");
  });

  test("dani: glasa se za jučerašnje prijave, rezultati su od prekjuče (i preko meseca)", () => {
    expect(votingDayFor("2026-11-01")).toBe("2026-10-31");
    expect(resultsDayFor("2026-11-01")).toBe("2026-10-30");
  });

  test("pobednik: najviše glasova, nerešeno - ranija prijava; bez dovoljno prijava ili glasova nema pobednika", () => {
    const entries = [
      { id: "a", votes: 4, enteredAt: 30 },
      { id: "b", votes: 4, enteredAt: 10 },
      { id: "c", votes: 1, enteredAt: 5 },
    ];
    expect(pickWinner(entries)).toEqual({ winnerId: "b", votes: 4 });
    expect(pickWinner(entries.slice(0, CHALLENGE_MIN_ENTRIES - 1))).toEqual({ winnerId: null, reason: "MALO_PRIJAVA" });
    expect(pickWinner(entries.map((entry) => ({ ...entry, votes: CHALLENGE_MIN_VOTES - 1 })))).toEqual({ winnerId: null, reason: "MALO_GLASOVA" });
  });
});
