import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { leagueTierForXp, previousWeekKey, rankLeague, weekKeyOfDay, LEAGUE_COHORT_SIZE } from "../lib/crea-leagues";
import { isDayKey } from "../lib/crea-streak";
import { ensureLeagueMember, publicNameOf, requireCommunityActor, weekXpOf } from "./creaCommunityCore";
import { currentUserId, effectiveRoleForProfile } from "./helpers";
import { isLeaderboardEligibleRole } from "./leaderboardCore";

/**
 * Nedeljne lige Cree (K27, G9; pravila u `lib/crea-leagues.ts`). U ligu se ulazi
 * prvim radom u nedelji (kuka `onCommunityWorkFinished`) ili dugmetom; liga je nivo
 * aktivnosti iz XP-a prošle nedelje, rang u grupi je XP ove nedelje. Krediti nigde ne
 * ulaze u računicu, pa se mesto u ligi ne može kupiti.
 */

async function cohortTable(ctx: QueryCtx, member: Doc<"creaLeagueMembers">, viewerId: Id<"users">) {
  const rows = await ctx.db
    .query("creaLeagueMembers")
    .withIndex("by_weekKey_and_tier_and_cohort", (q) =>
      q.eq("weekKey", member.weekKey).eq("tier", member.tier).eq("cohort", member.cohort),
    )
    .take(LEAGUE_COHORT_SIZE + 5);
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const [user, xp] = await Promise.all([ctx.db.get("users", row.userId), weekXpOf(ctx, row.userId, row.weekKey)]);
      return { userId: row.userId, joinedAt: row.joinedAt, xp, name: user ? publicNameOf(user) : "", isMe: row.userId === viewerId };
    }),
  );
  return rankLeague(enriched).map((row) => ({ rank: row.rank, xp: row.xp, name: row.name, isMe: row.isMe }));
}

/** Moja liga ove nedelje (`todayKey` = beogradski dan klijenta) i mesto prošle nedelje. */
export const myLeague = query({
  args: { todayKey: v.string() },
  handler: async (ctx, args) => {
    if (!isDayKey(args.todayKey)) throw new Error("NEISPRAVAN_DAN");
    const userId = await currentUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    if (!isLeaderboardEligibleRole(effectiveRoleForProfile(String(user.email ?? "").toLowerCase(), user.role))) {
      return { eligible: false as const };
    }
    const weekKey = weekKeyOfDay(args.todayKey);
    const lastWeekKey = previousWeekKey(weekKey);
    const [member, lastMember, myXp, lastWeekXp] = await Promise.all([
      ctx.db
        .query("creaLeagueMembers")
        .withIndex("by_weekKey_and_userId", (q) => q.eq("weekKey", weekKey).eq("userId", userId))
        .unique(),
      ctx.db
        .query("creaLeagueMembers")
        .withIndex("by_weekKey_and_userId", (q) => q.eq("weekKey", lastWeekKey).eq("userId", userId))
        .unique(),
      weekXpOf(ctx, userId, weekKey),
      weekXpOf(ctx, userId, lastWeekKey),
    ]);
    const lastWeek = lastMember
      ? { tier: lastMember.tier, rank: (await cohortTable(ctx, lastMember, userId)).find((row) => row.isMe)?.rank ?? null }
      : null;
    return {
      eligible: true as const,
      weekKey,
      myXp,
      // Liga u koju bi ušao danas i liga za sledeću nedelju (po XP-u ove nedelje).
      joinTier: leagueTierForXp(lastWeekXp),
      nextTier: leagueTierForXp(myXp),
      member: member ? { tier: member.tier, cohort: member.cohort } : null,
      table: member ? await cohortTable(ctx, member, userId) : [],
      lastWeek,
    };
  },
});

/** Uđi u ligu ove nedelje (bez rada). Osoblje i nalozi van rang-liste nisu u ligama. */
export const joinLeague = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireCommunityActor(ctx);
    const member = await ensureLeagueMember(ctx, userId, Date.now());
    if (!member) throw new Error("LIGA_NIJE_DOSTUPNA");
    return { tier: member.tier, cohort: member.cohort };
  },
});
