import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  AUTHOR_REWARD_CREDITS,
  AUTHOR_REWARDS_PER_DAY,
  AUTHOR_REWARDS_PER_MONTH,
  authorRewardBlock,
  cleanPublicTitle,
  monthKeyOfDay,
  PENDING_MAX,
  type RemixTarget,
  PUBLIC_TITLE_MAX,
  PUBLISH_PER_DAY,
  type AuthorRewardKind,
} from "../lib/crea-community";
import { LEAGUE_COHORT_SIZE, leagueTierForXp, previousWeekKey } from "../lib/crea-leagues";
import { modeOfModel, type CreaKind } from "../lib/crea-shell";
import { toolById, toolIdFromModelSlug } from "../lib/crea-tools";
import { applyGrant } from "./credits";
import { validatePrompt } from "./creditsCore";
import { CREA_FLAG_KEYS, readCreaFlag } from "./creaFlags";
import { awardCreaXp, creaRewardKey, creaRewardProblem } from "./creaGameCore";
import { belgradeOffsetMs } from "./creaNightCore";
import { effectiveRoleForProfile, requireUserId } from "./helpers";
import { belgradeDayKey, belgradeWeekKey, isLeaderboardEligibleRole } from "./leaderboardCore";
import { avatarUrlForProfile } from "./leaderboardReadCore";
import { isStudioStaff, parseParams } from "./studioCore";

/**
 * Zajednica Cree (K27): zajednički delovi galerije (G8), izazova (G3), lige (G9),
 * para (G10) i nagrada autorima (G11). Javne funkcije su u `creaGallery`,
 * `creaChallenges`, `creaLeagues` i `creaPairs`.
 *
 * Sve što pokazuje TUĐ rad drugim ljudima (galerija, izazov, deljeni stilovi, remiks)
 * stoji iza flega `crea_public_gallery` (O6): isključen fleg = ništa od toga se ne vidi
 * i ništa se ne može objaviti. Liga i par ne pokazuju radove, pa rade uvek.
 */

type Ctx = QueryCtx | MutationCtx;

export async function galleryEnabled(ctx: Ctx): Promise<boolean> {
  return readCreaFlag(ctx, CREA_FLAG_KEYS.publicGallery);
}

export async function requireGallery(ctx: Ctx) {
  if (!(await galleryEnabled(ctx))) throw new Error("GALERIJA_ISKLJUCENA");
}

/**
 * Prijavljen korisnik koji sme da učestvuje u zajednici: postoji, nije spojen ni
 * anonimizovan i nije suspendovan (ista provera kao čet, `chatCore.requireChatActor`).
 */
export async function requireCommunityActor(ctx: Ctx) {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user || user.mergedInto || user.anonymizedAt) throw new Error("Unauthorized");
  const suspension = await ctx.db
    .query("accountSuspensions")
    .withIndex("by_userId_and_active_and_createdAt", (q) => q.eq("userId", user._id).eq("active", true))
    .order("desc")
    .first();
  if (suspension && (suspension.permanent || !suspension.endsAt || suspension.endsAt > Date.now())) {
    throw new Error("NALOG_SUSPENDOVAN");
  }
  const role = effectiveRoleForProfile(String(user.email ?? "").toLowerCase(), user.role);
  return { user, userId: user._id, role, isStaff: isStudioStaff(role) };
}

/**
 * Moderator ili admin - isti krug ljudi kao „Svi korisnici" u moderation grid-u. Bez
 * provere suspenzije (ona čita sat, a ovo zove i upit reda za moderaciju).
 */
export async function requireStaff(ctx: Ctx) {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user || user.mergedInto || !isStudioStaff(effectiveRoleForProfile(String(user.email ?? "").toLowerCase(), user.role))) {
    throw new Error("Forbidden");
  }
  return { userId: user._id };
}

/** Javno ime: ime + inicijal prezimena (kao javna knjižica), ili korisničko ime. */
export function publicNameOf(user: Doc<"users">): string {
  const first = typeof user.firstName === "string" ? user.firstName.trim() : "";
  const last = typeof user.lastName === "string" ? user.lastName.trim() : "";
  if (first) return last ? `${first} ${last.charAt(0)}.` : first;
  return user.username ?? "";
}

export type PublicAuthor = { name: string; username: string | null; avatarUrl: string | null };

export async function publicAuthor(ctx: QueryCtx, userId: Id<"users">): Promise<PublicAuthor | null> {
  const user = await ctx.db.get("users", userId);
  if (!user || user.mergedInto || user.anonymizedAt) return null;
  return { name: publicNameOf(user), username: user.username ?? null, avatarUrl: (await avatarUrlForProfile(ctx, user)) ?? null };
}

/** Ponoć beogradskog dana `YYYY-MM-DD` u ms (za opsege po `createdAt`/`rewardedAt`). */
export function belgradeDayStartMs(dayKey: string): number {
  const utcMidnight = Date.parse(`${dayKey}T00:00:00Z`);
  return utcMidnight - belgradeOffsetMs(utcMidnight);
}

// ── Javni rad (G8) ───────────────────────────────────────────────────────────


async function remixTargetOf(ctx: QueryCtx, job: Doc<"generationJobs">): Promise<RemixTarget | null> {
  const tool = toolById(toolIdFromModelSlug(job.modelSlug));
  if (tool) return { area: tool.area, mode: tool.mode, modelSlug: null, toolId: tool.id };
  const model = await ctx.db
    .query("models")
    .withIndex("by_slug", (q) => q.eq("slug", job.modelSlug))
    .unique();
  if (!model || !model.isEnabled) return null;
  const inputModes = (() => {
    try {
      const parsed: unknown = JSON.parse(model.inputModes);
      return Array.isArray(parsed) ? parsed.filter((mode): mode is string => typeof mode === "string") : [];
    } catch {
      return [];
    }
  })();
  // Svoja verzija kreće od opisa (bez tuđih ulaznih fajlova), pa se prvo traži tekstualni režim.
  const target = modeOfModel(
    { slug: model.slug, kind: model.kind as CreaKind, inputModes, capabilities: parseParams(model.capabilities) ?? {} },
    inputModes.includes("text") ? "text" : undefined,
  );
  return target ? { area: target.area, mode: target.mode, modelSlug: model.slug, toolId: null } : null;
}

async function modelLabelOf(ctx: QueryCtx, slug: string): Promise<{ sr: string; en: string } | null> {
  const tool = toolById(toolIdFromModelSlug(slug));
  if (tool) return tool.title;
  const model = await ctx.db
    .query("models")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  return model ? { sr: model.labelSr, en: model.labelEn } : null;
}

/**
 * Javni rad kakav vide drugi: potpisan izlaz (iz posla - nikad kopija), naslov, autor,
 * opis SAMO uz `sharePrompt`, brojevi. `null` kad posao ili izlaz više ne postoje
 * (obrisan ili istekao rad nestaje iz galerije sam).
 */
export async function publicWorkView(
  ctx: QueryCtx,
  work: Doc<"creaPublicWorks">,
  viewerId: Id<"users"> | null,
  opts: { withRemix?: boolean } = {},
) {
  const job = await ctx.db.get("generationJobs", work.jobId);
  if (!job || job.status !== "done" || !job.outputStorageId) return null;
  const [author, outputUrl, posterUrl, liked, modelLabel, remix] = await Promise.all([
    publicAuthor(ctx, work.userId),
    ctx.storage.getUrl(job.outputStorageId),
    job.posterStorageId ? ctx.storage.getUrl(job.posterStorageId) : Promise.resolve(null),
    viewerId
      ? ctx.db
          .query("creaLikes")
          .withIndex("by_workId_and_userId", (q) => q.eq("workId", work._id).eq("userId", viewerId))
          .unique()
      : Promise.resolve(null),
    modelLabelOf(ctx, work.modelSlug),
    opts.withRemix ? remixTargetOf(ctx, job) : Promise.resolve(null),
  ]);
  if (!author || !outputUrl) return null;
  return {
    _id: work._id,
    kind: work.kind,
    title: work.title ?? null,
    prompt: work.sharePrompt ? (work.prompt ?? null) : null,
    modelSlug: work.modelSlug,
    modelLabel,
    outputUrl,
    posterUrl,
    author,
    isMine: viewerId === work.userId,
    likes: work.likes,
    likedByMe: liked !== null,
    remixes: work.remixes,
    remixOfWorkId: work.remixOfWorkId ?? null,
    publishedAt: work.publishedAt,
    challenge: work.challengeDayKey && work.challengeGroup ? { dayKey: work.challengeDayKey, group: work.challengeGroup } : null,
    votes: work.votes,
    remix,
  };
}

/** Opis rada za kopiju uz `sharePrompt` (najviše 2 000 znakova, kao `?opis=`). */
export function promptOfJob(job: Doc<"generationJobs">): string | null {
  const params = parseParams(job.params) ?? {};
  for (const key of ["prompt", "text"]) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 2000);
  }
  return null;
}

/**
 * Objava (ili ponovna objava) sopstvenog gotovog rada - uvek ide na moderaciju, pa i
 * izmena naslova ili deljenja opisa već odobrenog rada vraća rad na čekanje. Plafoni:
 * `PUBLISH_PER_DAY` objava u 24 h i `PENDING_MAX` radova na čekanju.
 */
export async function publishJobFor(
  ctx: MutationCtx,
  userId: Id<"users">,
  jobId: Id<"generationJobs">,
  opts: { title?: string; sharePrompt: boolean },
): Promise<{ work: Doc<"creaPublicWorks">; job: Doc<"generationJobs"> }> {
  const job = await ctx.db.get("generationJobs", jobId);
  if (!job || job.userId !== userId) throw new Error("NEMA_PRISTUPA");
  if (job.status !== "done" || !job.outputStorageId) throw new Error("RAD_NIJE_GOTOV");
  const title = cleanPublicTitle(opts.title);
  if (title && !validatePrompt(title, PUBLIC_TITLE_MAX).ok) throw new Error("NEPRIKLADAN_NASLOV");
  const prompt = opts.sharePrompt ? promptOfJob(job) : null;

  const now = Date.now();
  const existing = await ctx.db
    .query("creaPublicWorks")
    .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
    .unique();
  const unchanged =
    existing !== null &&
    (existing.status === "pending" || existing.status === "approved") &&
    (existing.title ?? null) === title &&
    existing.sharePrompt === opts.sharePrompt;
  if (existing && unchanged) return { work: existing, job };

  const [recent, pending] = await Promise.all([
    ctx.db
      .query("creaPublicWorks")
      .withIndex("by_userId_and_publishedAt", (q) => q.eq("userId", userId).gte("publishedAt", now - 86_400_000))
      .take(PUBLISH_PER_DAY),
    ctx.db
      .query("creaPublicWorks")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "pending"))
      .take(PENDING_MAX),
  ]);
  if (recent.length >= PUBLISH_PER_DAY) throw new Error("DNEVNI_LIMIT_OBJAVA");
  if (pending.length >= PENDING_MAX && existing?.status !== "pending") throw new Error("PREVISE_NA_CEKANJU");

  if (existing) {
    // `undefined` u patch-u briše polje: stara moderacija i stari naslov/opis ne ostaju.
    await ctx.db.patch("creaPublicWorks", existing._id, {
      status: "pending",
      sharePrompt: opts.sharePrompt,
      title: title ?? undefined,
      prompt: prompt ?? undefined,
      publishedAt: now,
      moderatedBy: undefined,
      moderatedAt: undefined,
      rejectReason: undefined,
    });
    return { work: (await ctx.db.get("creaPublicWorks", existing._id))!, job };
  }
  const id = await ctx.db.insert("creaPublicWorks", {
    status: "pending",
    sharePrompt: opts.sharePrompt,
    ...(title ? { title } : {}),
    ...(prompt ? { prompt } : {}),
    publishedAt: now,
    jobId: job._id,
    userId,
    kind: job.kind,
    modelSlug: job.modelSlug,
    likes: 0,
    remixes: 0,
    votes: 0,
    ...(job.remixOfWorkId ? { remixOfWorkId: job.remixOfWorkId } : {}),
  });
  return { work: (await ctx.db.get("creaPublicWorks", id))!, job };
}

/** Brisanje rada (`studio.deleteJobForUser`) povlači i njegovu javnu verziju. */
export async function withdrawPublicWorkOfJob(ctx: MutationCtx, jobId: Id<"generationJobs">) {
  const work = await ctx.db
    .query("creaPublicWorks")
    .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
    .unique();
  if (work && work.status !== "withdrawn") await ctx.db.patch("creaPublicWorks", work._id, { status: "withdrawn" });
}

/**
 * Zasluga autoru na novom poslu (`createJob`): javni rad koji se remiksuje i podeljen
 * stil. Važi samo za ODOBREN rad/stil DRUGOG autora dok je galerija upaljena; sve
 * ostalo tiho otpada (oznaka nikad ne obara posao, isto kao tehnike albuma u K26).
 */
export async function resolveCommunityRefs(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { remixOfWorkId?: Id<"creaPublicWorks">; creaStyleId?: Id<"creaUserStyles"> },
): Promise<{ remixOfWorkId?: Id<"creaPublicWorks">; creaStyleId?: Id<"creaUserStyles"> }> {
  if (!args.remixOfWorkId && !args.creaStyleId) return {};
  if (!(await galleryEnabled(ctx))) return {};
  const out: { remixOfWorkId?: Id<"creaPublicWorks">; creaStyleId?: Id<"creaUserStyles"> } = {};
  if (args.remixOfWorkId) {
    const work = await ctx.db.get("creaPublicWorks", args.remixOfWorkId);
    if (work && work.status === "approved" && work.userId !== userId) out.remixOfWorkId = work._id;
  }
  if (args.creaStyleId) {
    const style = await ctx.db.get("creaUserStyles", args.creaStyleId);
    if (style && style.isPublic && style.publicStatus === "approved" && style.userId !== userId) out.creaStyleId = style._id;
  }
  return out;
}

// ── Nagrade autorima (G11) ───────────────────────────────────────────────────

/**
 * Mala nagrada autoru čiji je recept ili stil drugi upotrebio u GOTOVOM, plaćenom
 * radu. Jedna nagrada po poslu; isti korisnik autoru donosi nagradu jednom po
 * receptu/stilu; autor ima dnevni i mesečni plafon; oba naloga moraju da prođu
 * zaštitu od farmovanja (potvrđen email, jedinstveno sanduče).
 */
export async function grantAuthorReward(
  ctx: MutationCtx,
  args: { authorId: Id<"users">; job: Doc<"generationJobs">; kind: AuthorRewardKind; itemId: string; now: number },
): Promise<boolean> {
  const { authorId, job } = args;
  const already = await ctx.db
    .query("creaAuthorRewards")
    .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
    .first();
  if (already) return false;
  const dayKey = belgradeDayKey(args.now);
  const monthKey = monthKeyOfDay(dayKey);
  const [forUser, today, month] = await Promise.all([
    ctx.db
      .query("creaAuthorRewards")
      .withIndex("by_authorId_and_userId_and_itemId", (q) =>
        q.eq("authorId", authorId).eq("userId", job.userId).eq("itemId", args.itemId),
      )
      .first(),
    ctx.db
      .query("creaAuthorRewards")
      .withIndex("by_authorId_and_dayKey", (q) => q.eq("authorId", authorId).eq("dayKey", dayKey))
      .take(AUTHOR_REWARDS_PER_DAY),
    ctx.db
      .query("creaAuthorRewards")
      .withIndex("by_authorId_and_monthKey", (q) => q.eq("authorId", authorId).eq("monthKey", monthKey))
      .take(AUTHOR_REWARDS_PER_MONTH),
  ]);
  const block = authorRewardBlock({
    sameUser: authorId === job.userId,
    paidCredits: job.freeTryLessonId ? 0 : job.creditCost,
    alreadyForUser: forUser !== null,
    todayCount: today.length,
    monthCount: month.length,
  });
  if (block) return false;
  if ((await creaRewardProblem(ctx, authorId)) || (await creaRewardProblem(ctx, job.userId))) return false;

  const lotId = await applyGrant(ctx, {
    userId: authorId,
    amount: AUTHOR_REWARD_CREDITS,
    source: "reward",
    idempotencyKey: { field: "stripeInvoiceId", value: creaRewardKey("autor", authorId, job._id) },
    meta: { note: args.kind === "recept" ? "Crea: neko je napravio svoju verziju tvog rada" : "Crea: neko je koristio tvoj stil" },
  });
  await ctx.db.insert("creaAuthorRewards", {
    authorId,
    userId: job.userId,
    kind: args.kind,
    itemId: args.itemId,
    jobId: job._id,
    credits: AUTHOR_REWARD_CREDITS,
    dayKey,
    monthKey,
    lotId,
    createdAt: args.now,
  });
  return true;
}

// ── Liga (G9) ────────────────────────────────────────────────────────────────

export async function weekXpOf(ctx: QueryCtx, userId: Id<"users">, weekKey: string): Promise<number> {
  const row = await ctx.db
    .query("leaderboardStats")
    .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
      q.eq("userId", userId).eq("scopeKey", "global").eq("period", "week").eq("periodKey", weekKey),
    )
    .unique();
  return row?.xp ?? 0;
}

/**
 * Članstvo u ligi ove nedelje (pravi ga ako ga nema). Liga = nivo aktivnosti iz XP-a
 * PROŠLE nedelje; grupa = poslednja grupa te lige dok ne dostigne 30 ljudi. Osoblje i
 * nalozi van rang-liste nisu u ligama (`null`).
 */
export async function ensureLeagueMember(ctx: MutationCtx, userId: Id<"users">, now: number) {
  const user = await ctx.db.get("users", userId);
  if (!user || user.mergedInto) return null;
  if (!isLeaderboardEligibleRole(effectiveRoleForProfile(String(user.email ?? "").toLowerCase(), user.role))) return null;
  const weekKey = belgradeWeekKey(now);
  const existing = await ctx.db
    .query("creaLeagueMembers")
    .withIndex("by_weekKey_and_userId", (q) => q.eq("weekKey", weekKey).eq("userId", userId))
    .unique();
  if (existing) return existing;
  const tier = leagueTierForXp(await weekXpOf(ctx, userId, previousWeekKey(weekKey)));
  const last = await ctx.db
    .query("creaLeagueMembers")
    .withIndex("by_weekKey_and_tier_and_cohort", (q) => q.eq("weekKey", weekKey).eq("tier", tier))
    .order("desc")
    .first();
  let cohort = last?.cohort ?? 1;
  if (last) {
    const members = await ctx.db
      .query("creaLeagueMembers")
      .withIndex("by_weekKey_and_tier_and_cohort", (q) => q.eq("weekKey", weekKey).eq("tier", tier).eq("cohort", cohort))
      .take(LEAGUE_COHORT_SIZE);
    if (members.length >= LEAGUE_COHORT_SIZE) cohort += 1;
  }
  const id = await ctx.db.insert("creaLeagueMembers", { weekKey, userId, tier, cohort, joinedAt: now });
  return ctx.db.get("creaLeagueMembers", id);
}

// ── Kuka: rad je gotov ───────────────────────────────────────────────────────

/**
 * Zove je `studio.finalizeOutput` i `creaLocal.saveLocalResult`, posle K26 kuke:
 * ulazak u ligu ove nedelje, i - za remiks ili deljen stil drugog autora - brojač,
 * XP autoru (`crea_remix_received`, dnevni limit) i nagrada autoru (G11).
 */
export async function onCommunityWorkFinished(ctx: MutationCtx, job: Doc<"generationJobs">) {
  if (job.status !== "done") return;
  const now = Date.now();
  await ensureLeagueMember(ctx, job.userId, now);

  if (job.remixOfWorkId) {
    const work = await ctx.db.get("creaPublicWorks", job.remixOfWorkId);
    if (work && work.userId !== job.userId) {
      await ctx.db.patch("creaPublicWorks", work._id, { remixes: work.remixes + 1 });
      await awardCreaXp(ctx, { userId: work.userId, type: "crea_remix_received", sourceId: job._id, occurredAt: now });
      if (work.sharePrompt) await grantAuthorReward(ctx, { authorId: work.userId, job, kind: "recept", itemId: work._id, now });
    }
  }
  if (job.creaStyleId) {
    const style = await ctx.db.get("creaUserStyles", job.creaStyleId);
    if (style && style.userId !== job.userId) {
      await ctx.db.patch("creaUserStyles", style._id, { uses: style.uses + 1 });
      await grantAuthorReward(ctx, { authorId: style.userId, job, kind: "stil", itemId: style._id, now });
    }
  }
}
