import { describe, expect, it } from "vitest";

import type { Id } from "./_generated/dataModel";
import { globalCommunityScope, scopeFields } from "./communityScope";
import {
  LEADERBOARD_XP,
  belgradeDayKey,
  belgradeWeekKey,
  isLeaderboardEligibleRole,
} from "./leaderboardCore";

describe("leaderboard calendar keys", () => {
  it("uses Europe/Belgrade local dates around the Monday boundary", () => {
    expect(belgradeDayKey(Date.parse("2026-01-04T23:30:00.000Z"))).toBe("2026-01-05");
    expect(belgradeWeekKey(Date.parse("2026-01-04T23:30:00.000Z"))).toBe("2026-01-05");
  });

  it("handles the summer-time Sunday boundary", () => {
    expect(belgradeDayKey(Date.parse("2026-07-05T21:30:00.000Z"))).toBe("2026-07-05");
    expect(belgradeWeekKey(Date.parse("2026-07-05T21:30:00.000Z"))).toBe("2026-06-29");
    expect(belgradeDayKey(Date.parse("2026-07-05T22:30:00.000Z"))).toBe("2026-07-06");
    expect(belgradeWeekKey(Date.parse("2026-07-05T22:30:00.000Z"))).toBe("2026-07-06");
  });
});

describe("leaderboard policy", () => {
  it("keeps the approved XP weights", () => {
    expect(LEADERBOARD_XP).toEqual({ lesson: 100, required_task: 20, helpful_comment: 10 });
  });

  it("allows Lite and Pro students but excludes staff", () => {
    expect(isLeaderboardEligibleRole("student")).toBe(true);
    expect(isLeaderboardEligibleRole("pro_student")).toBe(true);
    expect(isLeaderboardEligibleRole("moderator")).toBe(false);
    expect(isLeaderboardEligibleRole("admin")).toBe(false);
  });
});

describe("community scope fields", () => {
  it("derives stable keys without trusting a client-provided course track", () => {
    const trackId = "track-id" as Id<"courseTracks">;
    const courseId = "course-id" as Id<"courses">;
    expect(scopeFields(globalCommunityScope())).toMatchObject({
      scopeKind: "global",
      scopeKey: "global",
    });
    expect(scopeFields({ kind: "track", scopeKey: `track:${trackId}`, trackId })).toMatchObject({
      scopeKind: "track",
      scopeKey: `track:${trackId}`,
      trackId,
    });
    expect(
      scopeFields({ kind: "course", scopeKey: `course:${courseId}`, courseId, trackId }),
    ).toEqual({
      scopeKind: "course",
      scopeKey: `course:${courseId}`,
      courseId,
      trackId,
    });
  });
});
