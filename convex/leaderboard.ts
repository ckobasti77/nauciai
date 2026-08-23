import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { query } from "./_generated/server";
import { communityScopeValidator, resolveCommunityScope } from "./communityScope";
import { getCurrentProfile } from "./helpers";
import {
  enrichLeaderboardRow,
  getViewerLeaderboardRowCore,
  periodKeyFor,
  xpLevelsAhead,
} from "./leaderboardReadCore";

const leaderboardPeriodValidator = v.union(v.literal("week"), v.literal("all_time"));

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
    const core = await getViewerLeaderboardRowCore(ctx, userId, {
      scope,
      period: args.period,
      role: profile.role,
    });
    return { ...core, scope };
  },
});
