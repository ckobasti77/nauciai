import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { CREA_ALBUM_STICKER_COUNT } from "../lib/crea-album";
import { CREA_MINI_LESSONS, miniLessonById, quizPassed } from "../lib/crea-mini-lessons";
import { buildReportCard, type ReportCard } from "../lib/crea-report-card";
import { isDayKey } from "../lib/crea-streak";
import { normalizeUsername } from "../lib/username-policy";
import {
  awardCreaXp,
  claimAlbumRewardFor,
  creaProfileOf,
  creaRewardProblem,
  grantStickers,
  onCreaWorkFinished,
  seesAllToolsByDefault,
  streakFor,
  upsertCreaProfile,
} from "./creaGameCore";
import { onCommunityWorkFinished } from "./creaCommunityCore";
import { currentUserId, requireUserId } from "./helpers";
import { levelForXp } from "./leaderboardReadCore";

/**
 * Javni API gejmifikacije Cree (K26): stanje igre, album, mini-lekcije, otključavanje,
 * pečati i đačka knjižica. Dodela sličica i XP-a za radove živi u `creaGameCore`
 * (kuka iz `finalizeOutput` i `saveLocalResult`) - klijent ih ne može sam upisati.
 */

const todayKeyArg = v.string();

function assertDayKey(todayKey: string) {
  if (!isDayKey(todayKey)) throw new Error("NEISPRAVAN_DAN");
}

async function allStickerRows(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("creaStickers")
    .withIndex("by_userId_and_stickerId", (q) => q.eq("userId", userId))
    .take(CREA_ALBUM_STICKER_COUNT + 50);
}

async function lessonRows(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("creaMiniLessonProgress")
    .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId))
    .take(CREA_MINI_LESSONS.length + 10);
}

async function allTimeXp(ctx: QueryCtx, userId: Id<"users">) {
  const row = await ctx.db
    .query("leaderboardStats")
    .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
      q.eq("userId", userId).eq("scopeKey", "global").eq("period", "all_time").eq("periodKey", "all"),
    )
    .unique();
  return row?.xp ?? 0;
}

/** Stanje igre za traku u radionici, svesku i otključavanje alata. Gost dobija `null`. */
/**
 * Kuke gotovog rada (K26 gejmifikacija + K27 zajednica). `studio.finalizeOutput`
 * i `creaLocal.saveLocalResult` je zovu kao PODtransakciju (K30, nalaz K29-10):
 * greška ovde vraća samo svoje upise, a isporuka rada ostaje.
 */
export const onWorkFinished = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job) return null;
    await onCreaWorkFinished(ctx, job);
    await onCommunityWorkFinished(ctx, job);
    return null;
  },
});

export const myGame = query({
  args: { todayKey: todayKeyArg },
  handler: async (ctx, args) => {
    assertDayKey(args.todayKey);
    const userId = await currentUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    const [xp, streak, stickers, lessons, profile, autoAll, freeTries] = await Promise.all([
      allTimeXp(ctx, userId),
      streakFor(ctx, userId, args.todayKey),
      allStickerRows(ctx, userId),
      lessonRows(ctx, userId),
      creaProfileOf(ctx, userId),
      seesAllToolsByDefault(ctx, user),
      ctx.db
        .query("creaFreeTries")
        .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId))
        .take(CREA_MINI_LESSONS.length + 10),
    ]);
    return {
      xp,
      level: levelForXp(xp),
      streak,
      album: { owned: stickers.length, total: CREA_ALBUM_STICKER_COUNT },
      unlock: {
        // `auto`: osoblje i raniji korisnici vide sve bez prekidača; `chosen`: sam je uključio.
        auto: autoAll,
        chosen: profile?.unlockAll === true,
        lessons: lessons.map((row) => row.lessonId),
      },
      // Modeli i plafon probe idu sa servera, da radionica ne vuče ceo registar lekcija (K29-17).
      freeTries: freeTries
        .filter((row) => row.remaining > 0)
        .flatMap((row) => {
          const freeTry = miniLessonById(row.lessonId)?.freeTry;
          return freeTry ? [{ lessonId: row.lessonId, remaining: row.remaining, models: [...freeTry.models], maxCredits: freeTry.maxCredits }] : [];
        }),
      reportCardPublic: profile?.reportCardPublic === true,
      // Knjižica se traži po korisničkom imenu (profil, link za deljenje).
      username: user.username ?? null,
    };
  },
});

/** Album: sve skupljene sličice i strane (sa stanjem nagrade). */
export const myAlbum = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const [stickers, pages, rewardProblem] = await Promise.all([
      allStickerRows(ctx, userId),
      ctx.db
        .query("creaAlbumPages")
        .withIndex("by_userId_and_pageId", (q) => q.eq("userId", userId))
        .take(200),
      creaRewardProblem(ctx, userId),
    ]);
    return {
      stickers: stickers.map((row) => ({ stickerId: row.stickerId, earnedAt: row.earnedAt })),
      pages: pages.map((row) => ({
        pageId: row.pageId,
        completedAt: row.completedAt,
        rewardCredits: row.rewardCredits,
        rewardedAt: row.rewardedAt ?? null,
      })),
      // Zašto nagrada ne bi prošla (potvrda emaila, dupli nalog) - da dugme to kaže unapred.
      rewardProblem,
    };
  },
});

export const claimAlbumReward = mutation({
  args: { pageId: v.string() },
  handler: async (ctx, args) => claimAlbumRewardFor(ctx, await requireUserId(ctx), args.pageId),
});

/** Novi pečati: sličice i pune strane koje korisnik još nije video. */
export const unseenMoments = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return null;
    const [stickers, pages] = await Promise.all([
      ctx.db
        .query("creaStickers")
        .withIndex("by_userId_and_seenAt", (q) => q.eq("userId", userId).eq("seenAt", undefined))
        .take(12),
      ctx.db
        .query("creaAlbumPages")
        .withIndex("by_userId_and_seenAt", (q) => q.eq("userId", userId).eq("seenAt", undefined))
        .take(6),
    ]);
    return {
      stickers: stickers.map((row) => ({ id: row._id, stickerId: row.stickerId, earnedAt: row.earnedAt })),
      pages: pages.map((row) => ({ id: row._id, pageId: row.pageId, completedAt: row.completedAt })),
    };
  },
});

export const markMomentsSeen = mutation({
  args: {
    stickerIds: v.array(v.id("creaStickers")),
    pageIds: v.array(v.id("creaAlbumPages")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    for (const id of args.stickerIds.slice(0, 50)) {
      const row = await ctx.db.get("creaStickers", id);
      if (row && row.userId === userId && row.seenAt === undefined) await ctx.db.patch("creaStickers", id, { seenAt: now });
    }
    for (const id of args.pageIds.slice(0, 50)) {
      const row = await ctx.db.get("creaAlbumPages", id);
      if (row && row.userId === userId && row.seenAt === undefined) await ctx.db.patch("creaAlbumPages", id, { seenAt: now });
    }
    return null;
  },
});

/**
 * Položena mini-lekcija ili test (G6, U10). Server ponovo proverava odgovore. Prvi put:
 * otključava alate lekcije, XP (`crea_mini_lesson`, dnevni limit), sličica „Prva
 * mini-lekcija" i - ako lekcija ima probu i nalog prolazi zaštitu od farmovanja -
 * besplatna proba. Ponovno polaganje ne daje ništa novo.
 */
export const completeMiniLesson = mutation({
  args: {
    lessonId: v.string(),
    answers: v.array(v.number()),
    via: v.union(v.literal("lekcija"), v.literal("test")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const lesson = miniLessonById(args.lessonId);
    if (!lesson) throw new Error("NEPOZNATA_LEKCIJA");
    if (!quizPassed(lesson, args.answers)) return { ok: false as const, reason: "NETACNI_ODGOVORI" as const };

    const existing = await ctx.db
      .query("creaMiniLessonProgress")
      .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId).eq("lessonId", lesson.id))
      .unique();
    if (existing) return { ok: true as const, first: false, freeTry: null };

    const now = Date.now();
    await ctx.db.insert("creaMiniLessonProgress", { userId, lessonId: lesson.id, via: args.via, completedAt: now });
    await awardCreaXp(ctx, { userId, type: "crea_mini_lesson", sourceId: lesson.id, occurredAt: now });
    await grantStickers(ctx, userId, ["prvi:lekcija"], { now });

    let freeTry: { granted: number } | { skipped: string } | null = null;
    if (lesson.freeTry) {
      const problem = await creaRewardProblem(ctx, userId);
      const already = await ctx.db
        .query("creaFreeTries")
        .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", userId).eq("lessonId", lesson.id))
        .unique();
      if (problem) freeTry = { skipped: problem };
      else if (!already) {
        await ctx.db.insert("creaFreeTries", {
          userId,
          lessonId: lesson.id,
          granted: lesson.freeTry.count,
          remaining: lesson.freeTry.count,
          createdAt: now,
          updatedAt: now,
        });
        freeTry = { granted: lesson.freeTry.count };
      }
    }
    return { ok: true as const, first: true, freeTry };
  },
});

/** „Otključaj sve" (U10) - i nazad na postepeno. Nikad ne košta. */
export const setUnlockAll = mutation({
  args: { unlockAll: v.boolean() },
  handler: async (ctx, args) => {
    await upsertCreaProfile(ctx, await requireUserId(ctx), { unlockAll: args.unlockAll });
    return null;
  },
});

/** Da li drugi (i link za deljenje) vide đačku knjižicu. Podrazumevano: ne. */
export const setReportCardPublic = mutation({
  args: { reportCardPublic: v.boolean() },
  handler: async (ctx, args) => {
    await upsertCreaProfile(ctx, await requireUserId(ctx), { reportCardPublic: args.reportCardPublic });
    return null;
  },
});

async function reportCardOf(ctx: QueryCtx, user: Doc<"users">, todayKey: string): Promise<ReportCard & { streak: number; bestStreak: number; xp: number }> {
  const [stickers, lessons, streak, xp] = await Promise.all([
    allStickerRows(ctx, user._id),
    lessonRows(ctx, user._id),
    streakFor(ctx, user._id, todayKey),
    allTimeXp(ctx, user._id),
  ]);
  return {
    ...buildReportCard({ stickerIds: stickers.map((s) => s.stickerId), lessonsDone: lessons.length, bestStreak: streak.best }),
    streak: streak.current,
    bestStreak: streak.best,
    xp,
  };
}

async function userByUsername(ctx: QueryCtx, username: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("username", (q) => q.eq("username", normalizeUsername(username)))
    .unique();
  return user && !user.mergedInto && user.username ? user : null;
}

function displayNameOf(user: Doc<"users">): string {
  const first = typeof user.firstName === "string" ? user.firstName.trim() : "";
  const last = typeof user.lastName === "string" ? user.lastName.trim() : "";
  if (first) return last ? `${first} ${last.charAt(0)}.` : first;
  return user.username ?? "";
}

/**
 * Knjižica na profilu (prijavljeni): vlasnik je uvek vidi; drugi samo kad je javna.
 */
export const reportCardFor = query({
  args: { username: v.string(), todayKey: todayKeyArg },
  handler: async (ctx, args) => {
    assertDayKey(args.todayKey);
    const viewerId = await requireUserId(ctx);
    const user = await userByUsername(ctx, args.username);
    if (!user) return null;
    const isOwner = user._id === viewerId;
    const profile = await creaProfileOf(ctx, user._id);
    const isPublic = profile?.reportCardPublic === true;
    if (!isOwner && !isPublic) return null;
    return { isOwner, isPublic, name: displayNameOf(user), username: user.username!, card: await reportCardOf(ctx, user, args.todayKey) };
  },
});

/**
 * Deljiva knjižica (stranica za deljenje i OG slika) - bez prijave, SAMO kad ju je
 * vlasnik uključio. Vraća samo ime (ime + inicijal), korisničko ime i ocene.
 */
export const publicReportCard = query({
  args: { username: v.string(), todayKey: todayKeyArg },
  handler: async (ctx, args) => {
    assertDayKey(args.todayKey);
    const user = await userByUsername(ctx, args.username);
    if (!user) return null;
    const profile = await creaProfileOf(ctx, user._id);
    if (profile?.reportCardPublic !== true) return null;
    return { name: displayNameOf(user), username: user.username!, card: await reportCardOf(ctx, user, args.todayKey) };
  },
});
