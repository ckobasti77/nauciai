import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  ALBUM_PAGE_REWARD_CREDITS,
  ALBUM_REWARDS_PER_DAY,
  albumPageById,
  areaOfWork,
  isPageComplete,
  pageOfSticker,
  recipesOfWork,
  stickersForWork,
  type CreaWorkFacts,
} from "../lib/crea-album";
import { freeTryFits, miniLessonById } from "../lib/crea-mini-lessons";
import { CREA_DISCLOSURE_SINCE } from "../lib/crea-skills";
import { computeStreak, shiftDayKey, STREAK_WINDOW_DAYS, type StreakSummary } from "../lib/crea-streak";
import { applyGrant } from "./credits";
import { canonicalizeEmailForAntiFarm } from "./creditsCore";
import { belgradeDayKey, syncLeaderboardSourceEvent, type LeaderboardSourceType } from "./leaderboardCore";
import { adjustProfileActivity } from "./profileActivityCore";
import { isEmailVerifiedForStudio, isStudioStaff } from "./studioCore";
import { effectiveRoleForProfile } from "./helpers";

/**
 * Gejmifikacija Cree (K26): XP, niz dana, album sličica, besplatne probe i nagrade.
 *
 * Jedina ulazna tačka iz Studija je `onCreaWorkFinished` - zove je `finalizeOutput`
 * (plaćen rad stigao u storage) i `creaLocal.saveLocalResult` (rezultat besplatnog
 * alata). Krediti se NIGDE ne čitaju: nagrada zavisi od toga ŠTA je urađeno, nikad
 * od toga koliko je plaćeno.
 */

export type CreaXpType = Extract<LeaderboardSourceType, `crea_${string}`>;

export async function awardCreaXp(
  ctx: MutationCtx,
  args: { userId: Id<"users">; type: CreaXpType; sourceId: string; occurredAt?: number },
) {
  return syncLeaderboardSourceEvent(ctx, {
    userId: args.userId,
    sourceType: args.type,
    sourceId: args.sourceId,
    active: true,
    ...(args.occurredAt !== undefined ? { occurredAt: args.occurredAt } : {}),
  });
}

/** Ključ idempotencije nagrade u kreditima: `crea:<vrsta>:<userId>:<id>`. */
export function creaRewardKey(kind: string, userId: Id<"users">, id: string): string {
  return `crea:${kind}:${userId}:${id}`;
}

/**
 * Dodela sličica (samo novih). Za svaku novu tehniku (ne „prvi koraci") ide i XP,
 * a strana kojoj je sličica bila poslednja se upisuje kao puna. Vraća nove id-jeve.
 */
export async function grantStickers(
  ctx: MutationCtx,
  userId: Id<"users">,
  stickerIds: readonly string[],
  opts: { now: number; jobId?: Id<"generationJobs"> },
): Promise<string[]> {
  const added: string[] = [];
  for (const stickerId of new Set(stickerIds)) {
    const page = pageOfSticker(stickerId);
    if (!page) continue;
    const existing = await ctx.db
      .query("creaStickers")
      .withIndex("by_userId_and_stickerId", (q) => q.eq("userId", userId).eq("stickerId", stickerId))
      .unique();
    if (existing) continue;
    await ctx.db.insert("creaStickers", {
      userId,
      stickerId,
      pageId: page.id,
      earnedAt: opts.now,
      ...(opts.jobId ? { jobId: opts.jobId } : {}),
    });
    added.push(stickerId);
    if (page.family !== "prvi") await awardCreaXp(ctx, { userId, type: "crea_technique", sourceId: stickerId, occurredAt: opts.now });
  }
  const touched = new Set(added.map((id) => pageOfSticker(id)!.id));
  for (const pageId of touched) await completePageIfFull(ctx, userId, pageId, opts.now);
  return added;
}

async function completePageIfFull(ctx: MutationCtx, userId: Id<"users">, pageId: string, now: number) {
  const page = albumPageById(pageId);
  if (!page) return;
  const rows = await ctx.db
    .query("creaStickers")
    .withIndex("by_userId_and_pageId", (q) => q.eq("userId", userId).eq("pageId", pageId))
    .take(page.stickers.length + 20);
  if (!isPageComplete(page, new Set(rows.map((row) => row.stickerId)))) return;
  const existing = await ctx.db
    .query("creaAlbumPages")
    .withIndex("by_userId_and_pageId", (q) => q.eq("userId", userId).eq("pageId", pageId))
    .unique();
  if (existing) return;
  await ctx.db.insert("creaAlbumPages", { userId, pageId, completedAt: now, rewardCredits: 0 });
  await awardCreaXp(ctx, { userId, type: "crea_album_page", sourceId: pageId, occurredAt: now });
}

/**
 * Rad je gotov (plaćen ili besplatan - isto se broji): dan u nizu, XP za prvi rad
 * dana i prvi rad u oblasti, XP za recept (jednom po receptu) i sličice tehnika.
 */
export async function onCreaWorkFinished(ctx: MutationCtx, job: Doc<"generationJobs">) {
  if (job.status !== "done") return;
  const now = Date.now();
  const facts: CreaWorkFacts = {
    kind: job.kind,
    modelSlug: job.modelSlug,
    ...(job.provider ? { provider: job.provider } : {}),
    params: job.params,
    ...(job.creaTechniques ? { creaTechniques: job.creaTechniques } : {}),
    ...(job.parentJobId ? { parentJobId: job.parentJobId } : {}),
    ...(job.freeTryLessonId ? { freeTryLessonId: job.freeTryLessonId } : {}),
  };
  await adjustProfileActivity(ctx, { userId: job.userId, timestamp: now, kind: "creaWorks", delta: 1 });
  await awardCreaXp(ctx, { userId: job.userId, type: "crea_daily_work", sourceId: belgradeDayKey(now), occurredAt: now });
  await awardCreaXp(ctx, { userId: job.userId, type: "crea_first_work", sourceId: areaOfWork(facts), occurredAt: now });
  for (const recipeId of recipesOfWork(facts)) {
    await awardCreaXp(ctx, { userId: job.userId, type: "crea_recipe", sourceId: recipeId, occurredAt: now });
  }
  await grantStickers(ctx, job.userId, stickersForWork(facts), { now, jobId: job._id });
}

// ── Nagrade u kreditima i besplatne probe: zaštita od farmovanja ─────────────

export type CreaRewardProblem = "NALOG_NEDOSTUPAN" | "EMAIL_NIJE_POTVRDJEN" | "DUPLIRAN_EMAIL";

/**
 * Isti pragovi kao bonus javne Cree (`studio.claimSignupBonus`): potvrđen email i
 * nijedan drugi živ nalog iz istog sandučeta (kanonski oblik: bez `+tag`, bez tačaka
 * u Gmail-u). Bez ovoga bi svaki novi nalog besplatnim alatima napunio strane.
 */
export async function creaRewardProblem(ctx: QueryCtx, userId: Id<"users">): Promise<CreaRewardProblem | null> {
  const user = await ctx.db.get("users", userId);
  if (!user || user.mergedInto) return "NALOG_NEDOSTUPAN";
  if (!isEmailVerifiedForStudio(user as Record<string, unknown>)) return "EMAIL_NIJE_POTVRDJEN";
  const canonical = canonicalizeEmailForAntiFarm(typeof user.email === "string" ? user.email : "");
  if (!canonical) return "DUPLIRAN_EMAIL";
  const [byCanonical, byEmail] = await Promise.all([
    ctx.db.query("users").withIndex("email_canonical", (q) => q.eq("emailCanonical", canonical)).take(5),
    ctx.db.query("users").withIndex("email", (q) => q.eq("email", canonical)).take(5),
  ]);
  const duplicate = [...byCanonical, ...byEmail].some((row) => row._id !== userId && !row.mergedInto);
  return duplicate ? "DUPLIRAN_EMAIL" : null;
}

export type AlbumRewardResult =
  | { ok: true; credits: number }
  | { ok: false; reason: "STRANA_NIJE_PUNA" | "VEC_PREUZETO" | "DNEVNI_LIMIT_NAGRADA" | CreaRewardProblem };

/**
 * Preuzimanje nagrade za punu stranu. Tri sloja protiv dvostruke isplate: red strane
 * (`rewardLotId`), ključ idempotencije lota `crea:album:<userId>:<strana>` i provera
 * pune strane iz samih sličica. Dnevni plafon: `ALBUM_REWARDS_PER_DAY`.
 */
export async function claimAlbumRewardFor(
  ctx: MutationCtx,
  userId: Id<"users">,
  pageId: string,
): Promise<AlbumRewardResult> {
  const page = albumPageById(pageId);
  const row = page
    ? await ctx.db
        .query("creaAlbumPages")
        .withIndex("by_userId_and_pageId", (q) => q.eq("userId", userId).eq("pageId", pageId))
        .unique()
    : null;
  if (!page || !row) return { ok: false, reason: "STRANA_NIJE_PUNA" };
  if (row.rewardLotId || row.rewardCredits > 0) return { ok: false, reason: "VEC_PREUZETO" };
  const owned = await ctx.db
    .query("creaStickers")
    .withIndex("by_userId_and_pageId", (q) => q.eq("userId", userId).eq("pageId", pageId))
    .take(page.stickers.length + 20);
  if (!isPageComplete(page, new Set(owned.map((s) => s.stickerId)))) return { ok: false, reason: "STRANA_NIJE_PUNA" };

  const problem = await creaRewardProblem(ctx, userId);
  if (problem) return { ok: false, reason: problem };

  const now = Date.now();
  const dayKey = belgradeDayKey(now);
  const today = await ctx.db
    .query("creaAlbumPages")
    .withIndex("by_userId_and_rewardDayKey", (q) => q.eq("userId", userId).eq("rewardDayKey", dayKey))
    .take(ALBUM_REWARDS_PER_DAY);
  if (today.length >= ALBUM_REWARDS_PER_DAY) return { ok: false, reason: "DNEVNI_LIMIT_NAGRADA" };

  const lotId = await applyGrant(ctx, {
    userId,
    amount: ALBUM_PAGE_REWARD_CREDITS,
    source: "reward",
    idempotencyKey: { field: "stripeInvoiceId", value: creaRewardKey("album", userId, pageId) },
    meta: { note: `Crea album: ${page.title.sr}` },
  });
  await ctx.db.patch("creaAlbumPages", row._id, {
    rewardCredits: ALBUM_PAGE_REWARD_CREDITS,
    rewardLotId: lotId,
    rewardedAt: now,
    rewardDayKey: dayKey,
  });
  return { ok: true, credits: ALBUM_PAGE_REWARD_CREDITS };
}

/**
 * Besplatna proba iz mini-lekcije ide uz ovaj posao: skida jednu probu ili baca pre
 * ijednog upisa (sve je u transakciji `createJob`-a, pa se i skidanje poništava).
 */
export async function claimFreeTry(
  ctx: MutationCtx,
  args: { userId: Id<"users">; lessonId: string; modelSlug: string; creditCost: number; night: boolean },
) {
  const lesson = miniLessonById(args.lessonId);
  if (!lesson?.freeTry) throw new Error("PROBA_NEDOSTUPNA");
  const row = await ctx.db
    .query("creaFreeTries")
    .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", args.userId).eq("lessonId", args.lessonId))
    .unique();
  if (!row || row.remaining <= 0) throw new Error("PROBA_ISKORISCENA");
  if (!freeTryFits(lesson.freeTry, args)) throw new Error("PROBA_NE_VAZI");
  await ctx.db.patch("creaFreeTries", row._id, { remaining: row.remaining - 1, updatedAt: Date.now() });
}

/** Neuspeo posao besplatne probe vraća probu (ne kredite - nije ni plaćen). */
export async function restoreFreeTry(ctx: MutationCtx, job: Doc<"generationJobs">) {
  if (!job.freeTryLessonId) return;
  const lessonId = job.freeTryLessonId;
  const row = await ctx.db
    .query("creaFreeTries")
    .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", job.userId).eq("lessonId", lessonId))
    .unique();
  if (!row) return;
  await ctx.db.patch("creaFreeTries", row._id, { remaining: Math.min(row.granted, row.remaining + 1), updatedAt: Date.now() });
}

// ── Čitanja ──────────────────────────────────────────────────────────────────

export async function streakFor(ctx: QueryCtx, userId: Id<"users">, todayKey: string): Promise<StreakSummary> {
  const rows = await ctx.db
    .query("profileActivityDays")
    .withIndex("by_userId_and_dayKey", (q) =>
      q.eq("userId", userId).gte("dayKey", shiftDayKey(todayKey, -STREAK_WINDOW_DAYS)).lte("dayKey", todayKey),
    )
    .take(STREAK_WINDOW_DAYS + 1);
  return computeStreak(rows, todayKey);
}

/**
 * Da li korisnik podrazumevano vidi sve alate: osoblje (proverava Creu) i ko je Creu
 * koristio pre postepenog otkrivanja (ne sakrivamo mu ono na šta je navikao).
 */
export async function seesAllToolsByDefault(ctx: QueryCtx, user: Doc<"users">): Promise<boolean> {
  const role = effectiveRoleForProfile(String(user.email ?? "").toLowerCase(), user.role);
  if (isStudioStaff(role)) return true;
  const legacy = await ctx.db
    .query("generationJobs")
    .withIndex("by_user", (q) => q.eq("userId", user._id).lt("createdAt", CREA_DISCLOSURE_SINCE))
    .first();
  return legacy !== null;
}

export async function creaProfileOf(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("creaProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function upsertCreaProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: { unlockAll?: boolean; reportCardPublic?: boolean },
) {
  const existing = await creaProfileOf(ctx, userId);
  const now = Date.now();
  if (existing) await ctx.db.patch("creaProfiles", existing._id, { ...patch, updatedAt: now });
  else await ctx.db.insert("creaProfiles", { userId, ...patch, updatedAt: now });
}
