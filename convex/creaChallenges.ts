import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  CHALLENGE_GROUPS,
  CHALLENGE_WINNER_CREDITS,
  challengeForDay,
  challengeGroupForXp,
  pickWinner,
  resultsDayFor,
  votingDayFor,
  type ChallengeGroup,
} from "../lib/crea-challenges";
import { isDayKey, shiftDayKey } from "../lib/crea-streak";
import { applyGrant } from "./credits";
import {
  belgradeDayStartMs,
  galleryEnabled,
  publicWorkView,
  publishJobFor,
  requireCommunityActor,
  requireGallery,
} from "./creaCommunityCore";
import { awardCreaXp, creaRewardKey, creaRewardProblem } from "./creaGameCore";
import { currentUserId } from "./helpers";
import { belgradeDayKey } from "./leaderboardCore";

/**
 * Dnevni izazov Cree (K27, G3; pravila u `lib/crea-challenges.ts`). Prijava = objava
 * rada u javnu galeriju sa oznakom izazova, pa prolazi istu moderaciju (moderation
 * grid), a glasa se samo za ODOBRENE prijave. Zato je izazov iza istog flega kao
 * galerija (`crea_public_gallery`, ODLUKA K27): bez flega se ne vidi i ne radi.
 *
 * Zaštita: jedna prijava po osobi i danu; jedan glas po osobi, danu i grupi; nikad za
 * svoj rad; glasa samo nalog sa potvrđenim emailom i jedinstvenim sandučetom; glasanje
 * samo dan posle prijava; rezultat i nagrada jednom po danu i grupi (red + ključ lota).
 */

const groupValidator = v.union(v.literal("pocetnici"), v.literal("svi"));

function assertDayKey(dayKey: string) {
  if (!isDayKey(dayKey)) throw new Error("NEISPRAVAN_DAN");
}

async function allTimeXpOf(ctx: QueryCtx, userId: Id<"users">): Promise<number> {
  const row = await ctx.db
    .query("leaderboardStats")
    .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
      q.eq("userId", userId).eq("scopeKey", "global").eq("period", "all_time").eq("periodKey", "all"),
    )
    .unique();
  return row?.xp ?? 0;
}

async function entriesOf(ctx: QueryCtx, dayKey: string, group: ChallengeGroup) {
  return ctx.db
    .query("creaPublicWorks")
    .withIndex("by_challengeDayKey_and_challengeGroup_and_status", (q) =>
      q.eq("challengeDayKey", dayKey).eq("challengeGroup", group).eq("status", "approved"),
    )
    .take(500);
}

/** Stabilan, ali za svaki dan drugačiji redosled prijava na glasanju (bez prednosti za prve). */
function shuffleKey(dayKey: string, id: string): number {
  let hash = 2166136261;
  for (const char of `${dayKey}:${id}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function myEntryOf(ctx: QueryCtx, userId: Id<"users">, dayKey: string) {
  const rows = await ctx.db
    .query("creaPublicWorks")
    .withIndex("by_userId_and_challengeDayKey", (q) => q.eq("userId", userId).eq("challengeDayKey", dayKey))
    .take(10);
  return rows.find((row) => row.status === "pending" || row.status === "approved") ?? null;
}

/**
 * Ceo ekran izazova za `todayKey` (beogradski dan klijenta; upit ne čita sat): današnja
 * tema i moja prijava, glasanje za jučerašnje prijave (bez broja glasova - da prvi ne
 * vuku ostale) i rezultati prekjučerašnjeg izazova. Isključen fleg = `{ enabled: false }`.
 */
export const challengeBoard = query({
  args: { todayKey: v.string() },
  handler: async (ctx, args) => {
    assertDayKey(args.todayKey);
    if (!(await galleryEnabled(ctx))) return { enabled: false as const };
    const viewerId = await currentUserId(ctx);
    const today = challengeForDay(args.todayKey);
    const votingDay = votingDayFor(args.todayKey);
    const resultsDay = resultsDayFor(args.todayKey);

    const myEntryRow = viewerId ? await myEntryOf(ctx, viewerId, args.todayKey) : null;
    const myGroup = viewerId ? challengeGroupForXp(await allTimeXpOf(ctx, viewerId)) : null;

    const voting = await Promise.all(
      CHALLENGE_GROUPS.map(async (group) => {
        const rows = (await entriesOf(ctx, votingDay, group)).sort(
          (a, b) => shuffleKey(votingDay, a._id) - shuffleKey(votingDay, b._id),
        );
        const views = await Promise.all(rows.map((row) => publicWorkView(ctx, row, viewerId)));
        const myVote = viewerId
          ? await ctx.db
              .query("creaChallengeVotes")
              .withIndex("by_dayKey_and_group_and_voterId", (q) =>
                q.eq("dayKey", votingDay).eq("group", group).eq("voterId", viewerId),
              )
              .unique()
          : null;
        return {
          group,
          // Broj glasova se ne pokazuje dok glasanje traje.
          entries: views.filter((view): view is NonNullable<typeof view> => view !== null).map((view) => ({ ...view, votes: 0 })),
          myVote: myVote?.workId ?? null,
        };
      }),
    );

    const results = await Promise.all(
      CHALLENGE_GROUPS.map(async (group) => {
        const row = await ctx.db
          .query("creaChallengeResults")
          .withIndex("by_dayKey_and_group", (q) => q.eq("dayKey", resultsDay).eq("group", group))
          .unique();
        if (!row) return { group, closed: false as const };
        const winnerRow = row.winnerWorkId ? await ctx.db.get("creaPublicWorks", row.winnerWorkId) : null;
        const winner = winnerRow ? await publicWorkView(ctx, winnerRow, viewerId) : null;
        return {
          group,
          closed: true as const,
          entries: row.entries,
          votesTotal: row.votesTotal,
          winner: winner ? { ...winner, votes: row.winnerVotes ?? 0 } : null,
          noWinnerReason: row.noWinnerReason ?? null,
        };
      }),
    );

    const badges = viewerId
      ? (
          await ctx.db
            .query("creaChallengeResults")
            .withIndex("by_winnerUserId_and_dayKey", (q) => q.eq("winnerUserId", viewerId))
            .order("desc")
            .take(30)
        ).map((row) => ({ dayKey: row.dayKey, group: row.group, theme: challengeForDay(row.dayKey).theme.label, rewardCredits: row.rewardCredits }))
      : [];

    return {
      enabled: true as const,
      signedIn: viewerId !== null,
      today: {
        dayKey: args.todayKey,
        theme: today.theme,
        seasonId: today.seasonId,
        myGroup,
        myEntry: myEntryRow
          ? { workId: myEntryRow._id, status: myEntryRow.status, group: myEntryRow.challengeGroup ?? null, title: myEntryRow.title ?? null }
          : null,
      },
      voting: { dayKey: votingDay, theme: challengeForDay(votingDay).theme, groups: voting },
      results: { dayKey: resultsDay, theme: challengeForDay(resultsDay).theme, groups: results },
      badges,
    };
  },
});

/** Moji gotovi radovi od danas (za prijavu sa ekrana izazova). */
export const myWorksForToday = query({
  args: { todayKey: v.string() },
  handler: async (ctx, args) => {
    assertDayKey(args.todayKey);
    const userId = await currentUserId(ctx);
    if (!userId || !(await galleryEnabled(ctx))) return [];
    const from = belgradeDayStartMs(args.todayKey);
    const to = belgradeDayStartMs(shiftDayKey(args.todayKey, 1));
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId).gte("createdAt", from).lt("createdAt", to))
      .order("desc")
      .take(40);
    const done = jobs.filter((job) => job.status === "done" && job.outputStorageId);
    return Promise.all(
      done.slice(0, 24).map(async (job) => {
        const thumb = job.kind === "image" ? job.outputStorageId : job.posterStorageId;
        return { jobId: job._id, kind: job.kind, thumbUrl: thumb ? await ctx.storage.getUrl(thumb) : null };
      }),
    );
  },
});

/**
 * Prijava rada na današnji izazov: samo rad napravljen DANAS (plaćen ili besplatan -
 * kredit ne daje prednost), jedan po osobi i danu. Rad se objavljuje u galeriju (na
 * moderaciju); grupa („Početnici"/„Svi") se određuje po ukupnom XP-u u trenutku prijave.
 */
export const enterChallenge = mutation({
  args: { jobId: v.id("generationJobs"), title: v.optional(v.string()), sharePrompt: v.boolean() },
  handler: async (ctx, args) => {
    await requireGallery(ctx);
    const { userId } = await requireCommunityActor(ctx);
    const now = Date.now();
    const today = belgradeDayKey(now);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId) throw new Error("NEMA_PRISTUPA");
    if (belgradeDayKey(job.createdAt) !== today) throw new Error("RAD_NIJE_OD_DANAS");
    const current = await myEntryOf(ctx, userId, today);
    if (current && current.jobId !== job._id) throw new Error("VEC_PRIJAVLJEN");

    const { work } = await publishJobFor(ctx, userId, job._id, { title: args.title, sharePrompt: args.sharePrompt });
    const group = work.challengeDayKey === today && work.challengeGroup ? work.challengeGroup : challengeGroupForXp(await allTimeXpOf(ctx, userId));
    await ctx.db.patch("creaPublicWorks", work._id, {
      challengeDayKey: today,
      challengeGroup: group,
      challengeEnteredAt: work.challengeDayKey === today && work.challengeEnteredAt ? work.challengeEnteredAt : now,
    });
    // Već odobren rad je odmah na izazovu - XP učešća stiže sada (inače pri odobrenju).
    if (work.status === "approved") {
      await awardCreaXp(ctx, { userId, type: "crea_challenge", sourceId: today, occurredAt: now });
    }
    return { workId: work._id, status: work.status, group };
  },
});

/**
 * Glas za jednu jučerašnju prijavu u njenoj grupi. Jednom po danu i grupi, nikad za
 * svoj rad, samo nalog koji prolazi zaštitu od farmovanja.
 */
export const vote = mutation({
  args: { workId: v.id("creaPublicWorks") },
  handler: async (ctx, args) => {
    await requireGallery(ctx);
    const { userId } = await requireCommunityActor(ctx);
    const work = await ctx.db.get("creaPublicWorks", args.workId);
    if (!work || work.status !== "approved" || !work.challengeDayKey || !work.challengeGroup) throw new Error("PRIJAVA_NIJE_PRONADJENA");
    const now = Date.now();
    if (work.challengeDayKey !== votingDayFor(belgradeDayKey(now))) throw new Error("GLASANJE_ZATVORENO");
    if (work.userId === userId) throw new Error("SVOJ_RAD");
    const problem = await creaRewardProblem(ctx, userId);
    if (problem) throw new Error(`GLAS_NIJE_DOZVOLJEN:${problem}`);
    const dayKey = work.challengeDayKey;
    const group = work.challengeGroup;
    const existing = await ctx.db
      .query("creaChallengeVotes")
      .withIndex("by_dayKey_and_group_and_voterId", (q) => q.eq("dayKey", dayKey).eq("group", group).eq("voterId", userId))
      .unique();
    if (existing) throw new Error("VEC_GLASAO");
    await ctx.db.insert("creaChallengeVotes", { dayKey, group, voterId: userId, workId: work._id, createdAt: now });
    await ctx.db.patch("creaPublicWorks", work._id, { votes: work.votes + 1 });
    return null;
  },
});

/**
 * Zatvaranje jedne grupe jednog dana (idempotentno: postoji red rezultata = ništa).
 * Pobednik dobija bedž (red rezultata) i - ako prođe zaštitu od farmovanja - male
 * kredite kroz lot sa ključem `crea:izazov:<korisnik>:<dan>:<grupa>`.
 */
async function closeGroup(ctx: MutationCtx, dayKey: string, group: ChallengeGroup, now: number) {
  const existing = await ctx.db
    .query("creaChallengeResults")
    .withIndex("by_dayKey_and_group", (q) => q.eq("dayKey", dayKey).eq("group", group))
    .unique();
  if (existing) return existing._id;
  const entries = await entriesOf(ctx, dayKey, group);
  const outcome = pickWinner(entries.map((row) => ({ id: row._id, votes: row.votes, enteredAt: row.challengeEnteredAt ?? row.publishedAt })));
  const base = {
    dayKey,
    group,
    themeId: challengeForDay(dayKey).theme.id,
    entries: entries.length,
    votesTotal: entries.reduce((sum, row) => sum + row.votes, 0),
    closedAt: now,
  };
  if (outcome.winnerId === null) {
    return ctx.db.insert("creaChallengeResults", { ...base, rewardCredits: 0, noWinnerReason: outcome.reason });
  }
  const winner = entries.find((row) => row._id === outcome.winnerId) as Doc<"creaPublicWorks">;
  const problem = await creaRewardProblem(ctx, winner.userId);
  const rewardLotId = problem
    ? undefined
    : await applyGrant(ctx, {
        userId: winner.userId,
        amount: CHALLENGE_WINNER_CREDITS,
        source: "reward",
        idempotencyKey: { field: "stripeInvoiceId", value: creaRewardKey("izazov", winner.userId, `${dayKey}:${group}`) },
        meta: { note: `Crea izazov: ${challengeForDay(dayKey).theme.label.sr}` },
      });
  return ctx.db.insert("creaChallengeResults", {
    ...base,
    winnerWorkId: winner._id,
    winnerUserId: winner.userId,
    winnerVotes: outcome.votes,
    rewardCredits: rewardLotId ? CHALLENGE_WINNER_CREDITS : 0,
    ...(rewardLotId ? { rewardLotId } : problem ? { rewardSkipped: problem } : {}),
  });
}

export const closeChallengeDay = internalMutation({
  args: { dayKey: v.string(), group: v.optional(groupValidator) },
  handler: async (ctx, args) => {
    assertDayKey(args.dayKey);
    const now = Date.now();
    // Samo izazov čije je glasanje gotovo (dan posle glasanja ili kasnije).
    if (args.dayKey > resultsDayFor(belgradeDayKey(now))) throw new Error("GLASANJE_JOS_TRAJE");
    for (const group of args.group ? [args.group] : CHALLENGE_GROUPS) await closeGroup(ctx, args.dayKey, group, now);
    return null;
  },
});

/**
 * Cron (svaki sat): zatvara izazove kojima je glasanje prošlo - i nadoknađuje 2 propuštena
 * dana. Dok je galerija isključena ne radi ništa (izazova tada nema, pa ni praznih rezultata).
 */
export const closeDueChallenges = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!(await galleryEnabled(ctx))) return null;
    const now = Date.now();
    const newest = resultsDayFor(belgradeDayKey(now));
    for (const dayKey of [newest, shiftDayKey(newest, -1), shiftDayKey(newest, -2)]) {
      for (const group of CHALLENGE_GROUPS) await closeGroup(ctx, dayKey, group, now);
    }
    return null;
  },
});
