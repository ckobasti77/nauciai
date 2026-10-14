import { describe, expect, it } from "vitest";

import { communityBadges } from "./community-gamification";

describe("communityBadges", () => {
  it("dodeljuje znacku tek kad je prag dostignut", () => {
    expect(communityBadges({ threads: 0, comments: 9, helpfulAnswers: 0, streakDays: 6 })).toEqual([]);
    expect(communityBadges({ threads: 1, comments: 10, helpfulAnswers: 1, streakDays: 7 })).toEqual([
      "first_thread",
      "ten_comments",
      "first_helpful",
      "week_streak",
    ]);
  });

  it("preskace znacku za koju podatak ne postoji", () => {
    // Lista clanova zna korisne odgovore, ali ne i podelu tema/komentara.
    expect(communityBadges({ helpfulAnswers: 3 })).toEqual(["first_helpful"]);
    expect(communityBadges({})).toEqual([]);
  });
});
