import { describe, expect, it } from "vitest";

import {
  activityStreakDays,
  activityTotal,
  communityBadges,
  levelAccentVar,
  levelProgress,
  podiumAccentVar,
  XP_PER_LEVEL,
} from "./community-gamification";

describe("levelProgress", () => {
  it("prati isti prag kao leaderboardReadCore.levelForXp", () => {
    expect(levelProgress(0).level).toBe(1);
    expect(levelProgress(499).level).toBe(1);
    expect(levelProgress(500).level).toBe(2);
    expect(levelProgress(1499).level).toBe(3);
  });

  it("popunjenost i ostatak se slazu sa XP unutar nivoa", () => {
    const progress = levelProgress(625);
    expect(progress.intoLevel).toBe(125);
    expect(progress.xpToNext).toBe(375);
    expect(progress.percent).toBe(25);
  });

  it("tek dostignut nivo pocinje na 0%, a ostatak je pun nivo", () => {
    const progress = levelProgress(XP_PER_LEVEL);
    expect(progress.percent).toBe(0);
    expect(progress.xpToNext).toBe(XP_PER_LEVEL);
  });

  it("nedostajuci ili neispravan XP daje nivo 1 bez pada", () => {
    expect(levelProgress(undefined).level).toBe(1);
    expect(levelProgress(-40).percent).toBe(0);
    expect(levelProgress(Number.NaN).xpToNext).toBe(XP_PER_LEVEL);
  });
});

describe("levelAccentVar", () => {
  it("vrti se kroz zatvoren set od cetiri tokena", () => {
    expect(levelAccentVar(1)).toBe("var(--level-accent-1)");
    expect(levelAccentVar(4)).toBe("var(--level-accent-4)");
    expect(levelAccentVar(5)).toBe("var(--level-accent-1)");
    expect(levelAccentVar(9)).toBe("var(--level-accent-1)");
  });

  it("nikad ne izlazi iz seta ni za besmislen nivo", () => {
    for (const level of [0, -3, 1.7, Number.NaN]) {
      expect(levelAccentVar(level)).toMatch(/^var\(--level-accent-[1-4]\)$/);
    }
  });
});

describe("podiumAccentVar", () => {
  it("boji samo prva tri mesta", () => {
    expect(podiumAccentVar(1)).toBe("var(--level-accent-3)");
    expect(podiumAccentVar(2)).toBe("var(--level-accent-1)");
    expect(podiumAccentVar(3)).toBe("var(--level-accent-4)");
    expect(podiumAccentVar(4)).toBeUndefined();
  });
});

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

describe("activityStreakDays", () => {
  const day = (dayKey: string, total: number) => ({ dayKey, total });

  it("broji dane zaredom koji se zavrsavaju danas", () => {
    const days = [day("2026-09-05", 2), day("2026-09-06", 1), day("2026-09-07", 4)];
    expect(activityStreakDays(days, "2026-09-07")).toBe(3);
  });

  it("niz ostaje ziv i kad danas jos nema aktivnosti", () => {
    const days = [day("2026-09-04", 1), day("2026-09-05", 1), day("2026-09-06", 1)];
    expect(activityStreakDays(days, "2026-09-07")).toBe(3);
  });

  it("prazan dan prekida niz", () => {
    const days = [day("2026-09-01", 3), day("2026-09-02", 0), day("2026-09-03", 1)];
    expect(activityStreakDays(days, "2026-09-03")).toBe(1);
  });

  it("preskace granicu meseca", () => {
    const days = [day("2026-08-30", 1), day("2026-08-31", 1), day("2026-09-01", 1)];
    expect(activityStreakDays(days, "2026-09-01")).toBe(3);
  });

  it("bez aktivnosti nema niza", () => {
    expect(activityStreakDays([], "2026-09-07")).toBe(0);
  });
});

describe("activityTotal", () => {
  it("sabira jedno polje kroz sve dane", () => {
    const days = [
      { dayKey: "2026-09-06", threads: 1, comments: 4, total: 5 },
      { dayKey: "2026-09-07", threads: 0, comments: 7, total: 7 },
    ];
    expect(activityTotal(days, "threads")).toBe(1);
    expect(activityTotal(days, "comments")).toBe(11);
  });
});
