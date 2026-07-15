import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { communityScopeValidator, resolveCommunityScope } from "./communityScope";
import { getCurrentProfile } from "./helpers";
import { belgradeWeekKey, isLeaderboardEligibleRole } from "./leaderboardCore";

const leaderboardPeriodValidator = v.union(v.literal("week"), v.literal("all_time"));

function periodKeyFor(period: "week" | "all_time") {
  return period === "week" ? belgradeWeekKey(Date.now()) : "all";
}

function levelForXp(xp: number) {
  return Math.max(1, Math.floor(Math.max(0, xp) / 500) + 1);
}

async function avatarUrlForProfile(ctx: QueryCtx, profile: Doc<"users"> | null) {
  if (!profile) return undefined;
  if (profile.avatarStorageId) {
    return (await ctx.storage.getUrl(profile.avatarStorageId)) ?? profile.avatarUrl;
  }
  return profile.avatarUrl;
}

async function xpLevelsAhead(
  ctx: QueryCtx,
  scopeKey: string,
  period: "week" | "all_time",
  periodKey: string,
  minimumXp: number,
) {
  const rows = await ctx.db
    .query("leaderboardStats")
    .withIndex("by_scopeKey_and_period_and_periodKey_and_eligible_and_xp", (q) =>
      q
        .eq("scopeKey", scopeKey)
        .eq("period", period)
        .eq("periodKey", periodKey)
        .eq("eligible", true)
        .gt("xp", minimumXp),
    )
    .order("desc")
    .take(1000);
  return new Set(rows.map((row) => row.xp));
}

async function enrichLeaderboardRow(
  ctx: QueryCtx,
  stat: Doc<"leaderboardStats">,
  viewerId: Id<"users">,
  higherXpLevels: Set<number>,
) {
  const profile = await ctx.db.get(stat.userId);
  if (!profile || !isLeaderboardEligibleRole(profile.role)) {
    return null;
  }

  return {
    userId: stat.userId,
    rank: 1 + [...higherXpLevels].filter((xp) => xp > stat.xp).length,
    xp: stat.xp,
    level: levelForXp(stat.xp),
    completedLessons: stat.completedLessons,
    completedTasks: stat.completedTasks,
    helpfulAnswers: stat.helpfulAnswers,
    name: profile.name,
    username: profile.username,
    role: profile.role,
    avatarUrl: await avatarUrlForProfile(ctx, profile),
    isViewer: stat.userId === viewerId,
  };
}

export const listLeaderboard = query({
  args: {
    paginationOpts: paginationOptsValidator,
    scope: communityScopeValidator,
    period: leaderboardPeriodValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentProfile(ctx);
    const scope = await resolveCommunityScope(ctx, args.scope);
    const periodKey = periodKeyFor(args.period);
    const result = await ctx.db
      .query("leaderboardStats")
      .withIndex("by_scopeKey_and_period_and_periodKey_and_eligible_and_xp", (q) =>
        q
          .eq("scopeKey", scope.scopeKey)
          .eq("period", args.period)
          .eq("periodKey", periodKey)
          .eq("eligible", true),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const visibleStats = result.page.filter((row) => row.xp > 0);
    const minimumXp = Math.min(...visibleStats.map((row) => row.xp), Number.POSITIVE_INFINITY);
    const higherXpLevels = Number.isFinite(minimumXp)
      ? await xpLevelsAhead(ctx, scope.scopeKey, args.period, periodKey, minimumXp)
      : new Set<number>();
    const enriched = await Promise.all(
      visibleStats.map((row) => enrichLeaderboardRow(ctx, row, userId, higherXpLevels)),
    );

    return {
      ...result,
      page: enriched.filter((row) => row !== null),
      scope,
      period: args.period,
      periodKey,
    };
  },
});

export const getViewerLeaderboardRow = query({
  args: {
    scope: communityScopeValidator,
    period: leaderboardPeriodValidator,
  },
  handler: async (ctx, args) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const scope = await resolveCommunityScope(ctx, args.scope);
    const periodKey = periodKeyFor(args.period);
    if (!isLeaderboardEligibleRole(profile.role)) {
      return { eligible: false, row: null, scope, periodKey };
    }

    const stat = await ctx.db
      .query("leaderboardStats")
      .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
        q
          .eq("userId", userId)
          .eq("scopeKey", scope.scopeKey)
          .eq("period", args.period)
          .eq("periodKey", periodKey),
      )
      .unique();
    if (!stat || stat.xp <= 0) {
      return { eligible: true, row: null, scope, periodKey };
    }

    const higherXpLevels = await xpLevelsAhead(
      ctx,
      scope.scopeKey,
      args.period,
      periodKey,
      stat.xp,
    );
    const row = await enrichLeaderboardRow(ctx, stat, userId, higherXpLevels);
    return { eligible: true, row, scope, periodKey };
  },
});
