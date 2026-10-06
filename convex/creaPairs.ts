import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  INVITE_NEW_ACCOUNT_DAYS,
  INVITE_REWARD_CREDITS,
  INVITE_REWARDS_PER_MONTH,
  inviteRewardBlock,
  isInviteCode,
  makeInviteCode,
  PAIR_WINDOW_DAYS,
  pairStreakDays,
  pairWindowStart,
} from "../lib/crea-community";
import { computeStreak, isActiveDay, isDayKey } from "../lib/crea-streak";
import { applyGrant } from "./credits";
import { belgradeDayStartMs, publicAuthor, requireCommunityActor } from "./creaCommunityCore";
import { creaProfileOf, creaRewardKey, creaRewardProblem } from "./creaGameCore";
import { currentUserId } from "./helpers";
import { belgradeDayKey } from "./leaderboardCore";

/**
 * Kreativni par i pozivi (K27, G10). Svako ima lični link `/crea/poziv/<kod>`. Ko ga
 * prihvati postaje par sa pozivaocem (ako nijedno nema drugi par): zajednički niz raste
 * svaki dan kad OBOJE urade lekciju ili rad. Pozivaocu sleduje mala nagrada kad NOV
 * prijatelj završi prvu lekciju I prvi rad - nikad za kupovinu (krediti se ne gledaju).
 */

const DAY_MS = 86_400_000;

async function activePairOf(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"creaPairs"> | null> {
  const asA = await ctx.db
    .query("creaPairs")
    .withIndex("by_userAId_and_endedAt", (q) => q.eq("userAId", userId).eq("endedAt", undefined))
    .first();
  if (asA) return asA;
  return ctx.db
    .query("creaPairs")
    .withIndex("by_userBId_and_endedAt", (q) => q.eq("userBId", userId).eq("endedAt", undefined))
    .first();
}

async function lessonDone(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const events = await ctx.db
    .query("leaderboardEvents")
    .withIndex("by_userId_and_sourceType_and_sourceId", (q) => q.eq("userId", userId).eq("sourceType", "lesson"))
    .take(20);
  return events.some((event) => event.active);
}

async function workDone(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const job = await ctx.db
    .query("generationJobs")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "done"))
    .first();
  return job !== null;
}

/** Početak beogradskog meseca dana `dayKey` (za mesečni plafon nagrada). */
function monthStartMs(dayKey: string): number {
  return belgradeDayStartMs(`${dayKey.slice(0, 7)}-01`);
}

async function rewardsThisMonth(ctx: QueryCtx, inviterId: Id<"users">, dayKey: string): Promise<number> {
  const rows = await ctx.db
    .query("creaInvites")
    .withIndex("by_inviterId_and_rewardedAt", (q) => q.eq("inviterId", inviterId).gte("rewardedAt", monthStartMs(dayKey)))
    .take(INVITE_REWARDS_PER_MONTH);
  return rows.length;
}

async function activityDays(ctx: QueryCtx, userId: Id<"users">, from: string, to: string) {
  return ctx.db
    .query("profileActivityDays")
    .withIndex("by_userId_and_dayKey", (q) => q.eq("userId", userId).gte("dayKey", from).lte("dayKey", to))
    .take(PAIR_WINDOW_DAYS + 2);
}

/** Moj par (zajednički niz), moj kod poziva i pozvani prijatelji sa napretkom. */
export const myPair = query({
  args: { todayKey: v.string() },
  handler: async (ctx, args) => {
    if (!isDayKey(args.todayKey)) throw new Error("NEISPRAVAN_DAN");
    const userId = await currentUserId(ctx);
    if (!userId) return null;
    const [profile, pair, inviteRows, rewardProblem, monthCount] = await Promise.all([
      creaProfileOf(ctx, userId),
      activePairOf(ctx, userId),
      ctx.db
        .query("creaInvites")
        .withIndex("by_inviterId_and_acceptedAt", (q) => q.eq("inviterId", userId))
        .order("desc")
        .take(20),
      creaRewardProblem(ctx, userId),
      rewardsThisMonth(ctx, userId, args.todayKey),
    ]);

    let pairView = null;
    if (pair) {
      const partnerId = pair.userAId === userId ? pair.userBId : pair.userAId;
      const since = belgradeDayKey(pair.createdAt);
      const from = pairWindowStart(args.todayKey, since);
      const [partner, mine, theirs] = await Promise.all([
        publicAuthor(ctx, partnerId),
        activityDays(ctx, userId, from, args.todayKey),
        activityDays(ctx, partnerId, from, args.todayKey),
      ]);
      pairView = {
        partner,
        since,
        streak: computeStreak(pairStreakDays(mine, theirs, since), args.todayKey),
        todayMe: isActiveDay(mine.find((day) => day.dayKey === args.todayKey)),
        todayPartner: isActiveDay(theirs.find((day) => day.dayKey === args.todayKey)),
      };
    }

    const invites = await Promise.all(
      inviteRows.map(async (invite) => {
        const [friend, lesson, work] = await Promise.all([
          publicAuthor(ctx, invite.inviteeId),
          lessonDone(ctx, invite.inviteeId),
          workDone(ctx, invite.inviteeId),
        ]);
        return {
          inviteId: invite._id,
          friend: friend?.name ?? "",
          acceptedAt: invite.acceptedAt,
          lessonDone: lesson,
          workDone: work,
          rewardEligible: invite.rewardEligible,
          rewardCredits: invite.rewardCredits,
          rewarded: invite.rewardedAt !== undefined,
          block: inviteRewardBlock({
            rewardEligible: invite.rewardEligible,
            rewarded: invite.rewardedAt !== undefined,
            friendLessonDone: lesson,
            friendWorkDone: work,
            rewardsThisMonth: monthCount,
          }),
        };
      }),
    );

    return { inviteCode: profile?.inviteCode ?? null, pair: pairView, invites, rewardProblem };
  },
});

/** Moj kod poziva (pravi ga prvi put). Kod je slučajan i jedinstven. */
export const ensureInviteCode = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireCommunityActor(ctx);
    const profile = await creaProfileOf(ctx, userId);
    if (profile?.inviteCode) return profile.inviteCode;
    let code = makeInviteCode(Math.random);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const taken = await ctx.db
        .query("creaProfiles")
        .withIndex("by_inviteCode", (q) => q.eq("inviteCode", code))
        .first();
      if (!taken) break;
      code = makeInviteCode(Math.random);
    }
    if (profile) await ctx.db.patch("creaProfiles", profile._id, { inviteCode: code, updatedAt: Date.now() });
    else await ctx.db.insert("creaProfiles", { userId, inviteCode: code, updatedAt: Date.now() });
    return code;
  },
});

async function inviterByCode(ctx: QueryCtx, code: string) {
  if (!isInviteCode(code)) return null;
  const profile = await ctx.db
    .query("creaProfiles")
    .withIndex("by_inviteCode", (q) => q.eq("inviteCode", code))
    .first();
  if (!profile) return null;
  const user = await ctx.db.get("users", profile.userId);
  return user && !user.mergedInto && !user.anonymizedAt ? user : null;
}

/** Stranica poziva: čiji je link (ime + inicijal) i šta se desi kad ga prihvatim. */
export const inviteByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const inviter = await inviterByCode(ctx, args.code);
    if (!inviter) return null;
    const author = await publicAuthor(ctx, inviter._id);
    const viewerId = await currentUserId(ctx);
    if (!viewerId) return { inviter: author, viewer: null };
    const [myPairRow, theirPair, invited] = await Promise.all([
      activePairOf(ctx, viewerId),
      activePairOf(ctx, inviter._id),
      ctx.db
        .query("creaInvites")
        .withIndex("by_inviteeId", (q) => q.eq("inviteeId", viewerId))
        .unique(),
    ]);
    const pairedTogether =
      myPairRow !== null && (myPairRow.userAId === inviter._id || myPairRow.userBId === inviter._id);
    return {
      inviter: author,
      viewer: {
        isInviter: viewerId === inviter._id,
        pairedTogether,
        hasOtherPair: myPairRow !== null && !pairedTogether,
        inviterHasOtherPair: theirPair !== null && !pairedTogether,
        alreadyInvited: invited !== null,
      },
    };
  },
});

async function hasHistory(ctx: MutationCtx, userId: Id<"users">) {
  return (await lessonDone(ctx, userId)) || (await workDone(ctx, userId));
}

/**
 * Prihvatanje poziva: (1) zapis ko je koga pozvao - samo prvi poziv važi, i nagradu
 * nosi samo nalog koji je tada nov (do 7 dana, bez lekcija i radova); (2) par, ako
 * nijedno od dvoje nema drugi par.
 */
export const acceptInvite = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireCommunityActor(ctx);
    const inviter = await inviterByCode(ctx, args.code);
    if (!inviter) throw new Error("POZIV_NE_POSTOJI");
    if (inviter._id === user._id) throw new Error("SVOJ_POZIV");
    const now = Date.now();

    const existingInvite = await ctx.db
      .query("creaInvites")
      .withIndex("by_inviteeId", (q) => q.eq("inviteeId", user._id))
      .unique();
    let invited = false;
    if (!existingInvite) {
      const isNew = user._creationTime >= now - INVITE_NEW_ACCOUNT_DAYS * DAY_MS && !(await hasHistory(ctx, user._id));
      await ctx.db.insert("creaInvites", {
        inviterId: inviter._id,
        inviteeId: user._id,
        acceptedAt: now,
        rewardEligible: isNew,
        rewardCredits: 0,
      });
      invited = true;
    }

    const [mine, theirs] = await Promise.all([activePairOf(ctx, user._id), activePairOf(ctx, inviter._id)]);
    const together = mine !== null && (mine.userAId === inviter._id || mine.userBId === inviter._id);
    let paired = together;
    if (!mine && !theirs) {
      await ctx.db.insert("creaPairs", { userAId: inviter._id, userBId: user._id, createdAt: now });
      paired = true;
    }
    return { invited, paired };
  },
});

/** Raskini par (zajednički niz prestaje; poziv i nagrada ostaju). */
export const leavePair = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireCommunityActor(ctx);
    const pair = await activePairOf(ctx, userId);
    if (pair) await ctx.db.patch("creaPairs", pair._id, { endedAt: Date.now() });
    return null;
  },
});

export type InviteRewardResult =
  | { ok: true; credits: number }
  | { ok: false; reason: string };

/**
 * Nagrada za poziv (pozivaocu): prijatelj je nov nalog i završio je prvu lekciju I prvi
 * rad. Oba naloga prolaze zaštitu od farmovanja; najviše 3 nagrade mesečno; lot sa
 * ključem `crea:poziv:<pozivalac>:<prijatelj>` se ne može isplatiti dvaput.
 */
export const claimInviteReward = mutation({
  args: { inviteId: v.id("creaInvites") },
  handler: async (ctx, args): Promise<InviteRewardResult> => {
    const { userId } = await requireCommunityActor(ctx);
    const invite = await ctx.db.get("creaInvites", args.inviteId);
    if (!invite || invite.inviterId !== userId) throw new Error("NEMA_PRISTUPA");
    const now = Date.now();
    const dayKey = belgradeDayKey(now);
    const block = inviteRewardBlock({
      rewardEligible: invite.rewardEligible,
      rewarded: invite.rewardedAt !== undefined,
      friendLessonDone: await lessonDone(ctx, invite.inviteeId),
      friendWorkDone: await workDone(ctx, invite.inviteeId),
      rewardsThisMonth: await rewardsThisMonth(ctx, userId, dayKey),
    });
    if (block) return { ok: false, reason: block };
    const problem = (await creaRewardProblem(ctx, userId)) ?? (await creaRewardProblem(ctx, invite.inviteeId));
    if (problem) return { ok: false, reason: problem };

    const lotId = await applyGrant(ctx, {
      userId,
      amount: INVITE_REWARD_CREDITS,
      source: "reward",
      idempotencyKey: { field: "stripeInvoiceId", value: creaRewardKey("poziv", userId, invite.inviteeId) },
      meta: { note: "Crea: prijatelj je završio prvu lekciju i prvi rad" },
    });
    await ctx.db.patch("creaInvites", invite._id, { rewardedAt: now, rewardLotId: lotId, rewardCredits: INVITE_REWARD_CREDITS });
    return { ok: true, credits: INVITE_REWARD_CREDITS };
  },
});
