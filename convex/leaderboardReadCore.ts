import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { ResolvedCommunityScope } from "./communityScope";
import { belgradeWeekKey, isLeaderboardEligibleRole } from "./leaderboardCore";

// Read-core za leaderboard: čiste read funkcije koje voze i `getViewerLeaderboardRow`
// i `listLeaderboard` (convex/leaderboard.ts) i agregat `getDashboardOverview`
// (convex/dashboard.ts). `leaderboardCore.ts` je write/sync core (XP award) i ne pomaže ovde.

export type LeaderboardPeriod = "week" | "all_time";

export function periodKeyFor(period: LeaderboardPeriod) {
  return period === "week" ? belgradeWeekKey(Date.now()) : "all";
}

export function levelForXp(xp: number) {
  return Math.max(1, Math.floor(Math.max(0, xp) / 500) + 1);
}

export async function avatarUrlForProfile(ctx: QueryCtx, profile: Doc<"users"> | null) {
  if (!profile) return undefined;
  if (profile.avatarStorageId) {
    return (await ctx.storage.getUrl(profile.avatarStorageId)) ?? profile.avatarUrl;
  }
  return profile.avatarUrl;
}

export async function xpLevelsAhead(
  ctx: QueryCtx,
  scopeKey: string,
  period: LeaderboardPeriod,
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

export type EnrichedLeaderboardRow = {
  userId: Id<"users">;
  rank: number;
  xp: number;
  level: number;
  completedLessons: number;
  completedTasks: number;
  helpfulAnswers: number;
  name: string | undefined;
  username: string | undefined;
  role: Doc<"users">["role"];
  avatarUrl: string | undefined;
  isViewer: boolean;
};

export async function enrichLeaderboardRow(
  ctx: QueryCtx,
  stat: Doc<"leaderboardStats">,
  viewerId: Id<"users">,
  higherXpLevels: Set<number>,
): Promise<EnrichedLeaderboardRow | null> {
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

/**
 * Rang viewer-a za dati (već razrešen) scope i period. Isti helper vozi javni
 * `getViewerLeaderboardRow` query i dashboard agregat, pa ekstrakcija ne menja ponašanje.
 * `role` se prosleđuje spolja (pozivalac ga već ima iz `getCurrentProfile`), da helper ne
 * mora ponovo da čita profil.
 */
export async function getViewerLeaderboardRowCore(
  ctx: QueryCtx,
  userId: Id<"users">,
  args: { scope: ResolvedCommunityScope; period: LeaderboardPeriod; role: unknown },
): Promise<{ eligible: boolean; row: EnrichedLeaderboardRow | null; periodKey: string }> {
  const periodKey = periodKeyFor(args.period);
  if (!isLeaderboardEligibleRole(args.role)) {
    return { eligible: false, row: null, periodKey };
  }

  const stat = await ctx.db
    .query("leaderboardStats")
    .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
      q
        .eq("userId", userId)
        .eq("scopeKey", args.scope.scopeKey)
        .eq("period", args.period)
        .eq("periodKey", periodKey),
    )
    .unique();
  if (!stat || stat.xp <= 0) {
    return { eligible: true, row: null, periodKey };
  }

  const higherXpLevels = await xpLevelsAhead(
    ctx,
    args.scope.scopeKey,
    args.period,
    periodKey,
    stat.xp,
  );
  const row = await enrichLeaderboardRow(ctx, stat, userId, higherXpLevels);
  return { eligible: true, row, periodKey };
}
