import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const LEADERBOARD_XP = {
  lesson: 100,
  required_task: 20,
  helpful_comment: 10,
} as const;

export type LeaderboardSourceType = keyof typeof LEADERBOARD_XP;

const BELGRADE_TIME_ZONE = "Europe/Belgrade";
const HELPFUL_XP_DAILY_LIMIT = 5;
const ALL_TIME_PERIOD_KEY = "all";

const belgradeDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BELGRADE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

function belgradeDateParts(timestamp: number) {
  const parts = belgradeDateFormatter.formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
  };
}

export function belgradeDayKey(timestamp: number) {
  const { year, month, day } = belgradeDateParts(timestamp);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function belgradeWeekKey(timestamp: number) {
  const { year, month, day, weekday } = belgradeDateParts(timestamp);
  const weekdayIndex = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }[weekday] ?? 0;
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  calendarDate.setUTCDate(calendarDate.getUTCDate() - weekdayIndex);
  return calendarDate.toISOString().slice(0, 10);
}

type ScopeRef = {
  kind: "global" | "track" | "course";
  key: string;
  trackId?: Id<"courseTracks">;
  courseId?: Id<"courses">;
};

type SyncLeaderboardSourceArgs = {
  userId: Id<"users">;
  sourceType: LeaderboardSourceType;
  sourceId: string;
  active: boolean;
  occurredAt?: number;
  courseId?: Id<"courses">;
  trackId?: Id<"courseTracks">;
  postId?: Id<"communityPosts">;
  commentId?: Id<"comments">;
};

export function isLeaderboardEligibleRole(role: unknown) {
  return role === "student" || role === "pro_student";
}

async function userIsEligible(ctx: MutationCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return isLeaderboardEligibleRole(profile?.role);
}

async function resolveScopeRefs(
  ctx: MutationCtx,
  courseId?: Id<"courses">,
  explicitTrackId?: Id<"courseTracks">,
) {
  let trackId = explicitTrackId;
  if (courseId) {
    const course = await ctx.db.get(courseId);
    if (!course) {
      throw new Error("Leaderboard course source was not found.");
    }
    trackId = course.trackId ?? trackId;
  }

  const scopes: ScopeRef[] = [{ kind: "global", key: "global" }];
  if (trackId) {
    scopes.push({ kind: "track", key: `track:${trackId}`, trackId });
  }
  if (courseId) {
    scopes.push({
      kind: "course",
      key: `course:${courseId}`,
      courseId,
      ...(trackId ? { trackId } : {}),
    });
  }
  return { scopes, trackId };
}

function sourceCounterDelta(sourceType: LeaderboardSourceType, direction: 1 | -1) {
  return {
    completedLessons: sourceType === "lesson" ? direction : 0,
    completedTasks: sourceType === "required_task" ? direction : 0,
    helpfulAnswers: sourceType === "helpful_comment" ? direction : 0,
  };
}

async function applyStatsDelta(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    sourceType: LeaderboardSourceType;
    points: number;
    weekKey: string;
    direction: 1 | -1;
    courseId?: Id<"courses">;
    trackId?: Id<"courseTracks">;
  },
) {
  if (args.points === 0) return;

  const { scopes } = await resolveScopeRefs(ctx, args.courseId, args.trackId);
  const eligible = await userIsEligible(ctx, args.userId);
  const counterDelta = sourceCounterDelta(args.sourceType, args.direction);
  const periods = [
    { period: "all_time" as const, periodKey: ALL_TIME_PERIOD_KEY },
    { period: "week" as const, periodKey: args.weekKey },
  ];
  const now = Date.now();

  for (const scope of scopes) {
    for (const period of periods) {
      const existing = await ctx.db
        .query("leaderboardStats")
        .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
          q
            .eq("userId", args.userId)
            .eq("scopeKey", scope.key)
            .eq("period", period.period)
            .eq("periodKey", period.periodKey),
        )
        .unique();

      const xpDelta = args.points * args.direction;
      if (existing) {
        await ctx.db.patch(existing._id, {
          xp: Math.max(0, existing.xp + xpDelta),
          completedLessons: Math.max(0, existing.completedLessons + counterDelta.completedLessons),
          completedTasks: Math.max(0, existing.completedTasks + counterDelta.completedTasks),
          helpfulAnswers: Math.max(0, existing.helpfulAnswers + counterDelta.helpfulAnswers),
          eligible,
          updatedAt: now,
        });
      } else if (args.direction > 0) {
        await ctx.db.insert("leaderboardStats", {
          userId: args.userId,
          scopeKind: scope.kind,
          scopeKey: scope.key,
          trackId: scope.trackId,
          courseId: scope.courseId,
          period: period.period,
          periodKey: period.periodKey,
          xp: args.points,
          completedLessons: counterDelta.completedLessons,
          completedTasks: counterDelta.completedTasks,
          helpfulAnswers: counterDelta.helpfulAnswers,
          eligible,
          updatedAt: now,
        });
      }
    }
  }
}

async function rewardingHelpfulEventsForDay(
  ctx: MutationCtx,
  userId: Id<"users">,
  dayKey: string,
) {
  const events = await ctx.db
    .query("leaderboardEvents")
    .withIndex("by_userId_and_sourceType_and_dayKey_and_active_and_points", (q) =>
      q
        .eq("userId", userId)
        .eq("sourceType", "helpful_comment")
        .eq("dayKey", dayKey)
        .eq("active", true),
    )
    .order("desc")
    .take(HELPFUL_XP_DAILY_LIMIT);
  return events.filter((event) => event.points > 0).length;
}

export async function syncLeaderboardSourceEvent(
  ctx: MutationCtx,
  args: SyncLeaderboardSourceArgs,
) {
  const existing = await ctx.db
    .query("leaderboardEvents")
    .withIndex("by_userId_and_sourceType_and_sourceId", (q) =>
      q.eq("userId", args.userId).eq("sourceType", args.sourceType).eq("sourceId", args.sourceId),
    )
    .unique();

  if (existing) {
    if (existing.active === args.active) {
      return { eventId: existing._id, awardedXp: existing.active ? existing.points : 0 };
    }

    if (args.active) {
      let reactivatedPoints = existing.points;
      if (args.sourceType === "helpful_comment" && existing.points > 0) {
        const rewardingCount = await rewardingHelpfulEventsForDay(ctx, args.userId, existing.dayKey);
        if (rewardingCount >= HELPFUL_XP_DAILY_LIMIT) {
          reactivatedPoints = 0;
        }
      }
      await ctx.db.patch(existing._id, {
        active: true,
        points: reactivatedPoints,
        updatedAt: Date.now(),
      });
      await applyStatsDelta(ctx, {
        userId: existing.userId,
        sourceType: existing.sourceType,
        points: reactivatedPoints,
        weekKey: existing.weekKey,
        direction: 1,
        courseId: existing.courseId,
        trackId: existing.trackId,
      });
      return { eventId: existing._id, awardedXp: reactivatedPoints };
    }

    await ctx.db.patch(existing._id, { active: false, updatedAt: Date.now() });
    await applyStatsDelta(ctx, {
      userId: existing.userId,
      sourceType: existing.sourceType,
      points: existing.points,
      weekKey: existing.weekKey,
      direction: -1,
      courseId: existing.courseId,
      trackId: existing.trackId,
    });
    return { eventId: existing._id, awardedXp: 0 };
  }

  if (!args.active) {
    return { eventId: null, awardedXp: 0 };
  }

  const occurredAt = args.occurredAt ?? Date.now();
  const dayKey = belgradeDayKey(occurredAt);
  const weekKey = belgradeWeekKey(occurredAt);
  const { trackId } = await resolveScopeRefs(ctx, args.courseId, args.trackId);
  let points: number = LEADERBOARD_XP[args.sourceType];
  if (args.sourceType === "helpful_comment") {
    const rewardingCount = await rewardingHelpfulEventsForDay(ctx, args.userId, dayKey);
    if (rewardingCount >= HELPFUL_XP_DAILY_LIMIT) {
      points = 0;
    }
  }

  const now = Date.now();
  const eventId = await ctx.db.insert("leaderboardEvents", {
    userId: args.userId,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    points,
    active: true,
    occurredAt,
    dayKey,
    weekKey,
    courseId: args.courseId,
    trackId,
    postId: args.postId,
    commentId: args.commentId,
    createdAt: now,
    updatedAt: now,
  });

  await applyStatsDelta(ctx, {
    userId: args.userId,
    sourceType: args.sourceType,
    points,
    weekKey,
    direction: 1,
    courseId: args.courseId,
    trackId,
  });

  return { eventId, awardedXp: points };
}

export async function syncLeaderboardEligibilityForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  eligible: boolean,
) {
  const stats = await ctx.db
    .query("leaderboardStats")
    .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
    .take(500);
  const now = Date.now();
  for (const stat of stats) {
    if (stat.eligible !== eligible) {
      await ctx.db.patch(stat._id, { eligible, updatedAt: now });
    }
  }
  return stats.length;
}
