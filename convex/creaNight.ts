import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, mutation, query, type QueryCtx } from "./_generated/server";
import { schedulePersistentActivityPush } from "./chatCore";
import {
  canAdvanceBatch,
  groupNightJobs,
  morningPushAt,
  NIGHT_BATCH_MAX_REQUESTS,
  NIGHT_ERRORS,
  NIGHT_NOTIFICATION_KIND,
  NIGHT_PREPARING_STALE_MS,
  NIGHT_PUSH_URL_PATH,
  type NightBatchSpec,
  type NightCandidate,
  nightActualCost,
  nightDeadlineAt,
  nightNotificationCopy,
  nightProviderStatus,
  parseNightBatch,
} from "./creaNightCore";
import { currentUserId, requireUserId } from "./helpers";
import { parseJobInputs } from "./providers/jobInputs";
import { recordActualCostReason, recordJobActualCost, tokenUsageValidator } from "./studioActualCost";
import { ACTUAL_COST_REASON, parseTokenRates } from "./studioActualCostCore";
import { parseParams } from "./studioCore";
import { jobInputStorageIds } from "./studioJobCore";

/**
 * Noćna tura (Crea K08, C2) - upisni deo. Mreža je u `creaNightActions.ts`
 * (Node akcije koje cron zove), čista logika u `creaNightCore.ts`.
 *
 * Idempotencija stoji na dva mesta: rezultat se upisuje samo poslu koji je još
 * `queued` I pripada tom batch-u (drugo čitanje istog fajla ne radi ništa), a
 * stanje batch-a ide samo napred (`canAdvanceBatch`). Refund je `studio.failJob`,
 * koji je i sam idempotentan.
 */

/** Koliko poslova koji čekaju predaju se pročita u jednom prolazu (ostali sledeći put). */
const CLAIM_SCAN_LIMIT = 200;

/** Koliko batch-eva jedan prolaz praćenja pogleda po stanju. */
const POLL_BATCH_LIMIT = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bajtovi ulaznih slika jednog posla, iz `_storage` (ne iz onoga što je klijent rekao). */
async function inputBytesOf(ctx: MutationCtx, job: Doc<"generationJobs">): Promise<number> {
  let total = 0;
  for (const rawId of jobInputStorageIds(parseJobInputs(job.inputs))) {
    const storageId = ctx.db.system.normalizeId("_storage", rawId);
    const file = storageId ? await ctx.db.system.get(storageId) : null;
    total += file?.size ?? 0;
  }

  return total;
}

async function specOfModel(ctx: MutationCtx, slug: string): Promise<{ spec: NightBatchSpec | null; capabilities: Record<string, unknown> | null }> {
  const model = await ctx.db
    .query("models")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  const capabilities = model ? parseParams(model.capabilities) : null;

  return { spec: parseNightBatch(capabilities), capabilities };
}

/**
 * Refund jednog noćnog posla. Ugnježdena mutacija je podtransakcija (isti obrazac
 * kao `crons.reapStuckJobs`): pokvaren red ne obara ceo prolaz.
 */
async function refundNightJob(ctx: MutationCtx, jobId: Id<"generationJobs">, error: string): Promise<boolean> {
  try {
    await ctx.runMutation(internal.studio.failJob, { jobId, error });

    return true;
  } catch (thrown) {
    console.error(`creaNight: posao ${jobId} nije refundiran`, thrown);

    return false;
  }
}

/**
 * Jutarnje iznenađenje (G13): kad korisniku više nijedan noćni posao ne čeka,
 * jedno obaveštenje sa brojem radova koji su stigli od prethodnog, i push (između
 * 23 h i 8 h po Beogradu tek u 08:00).
 *
 * Idempotentno samo od sebe: broje se radovi napravljeni POSLE poslednjeg takvog
 * obaveštenja (dok je ono pravljeno, korisnik nije imao nijedan `queued` posao, pa
 * je svaki kasniji noćni rad naručen posle njega). Drugi poziv za istu turu nađe
 * nulu i ne radi ništa. Tura u kojoj ništa nije stiglo (sve vraćeno) ne šalje ništa -
 * vraćeni krediti se vide u galeriji.
 */
async function announceIfRoundDone(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const waiting = await ctx.db
    .query("generationJobs")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "queued"))
    .first();
  if (waiting) return;

  const now = Date.now();
  const previous = await ctx.db
    .query("notifications")
    .withIndex("by_userId_and_kind_and_createdAt", (q) => q.eq("userId", userId).eq("kind", NIGHT_NOTIFICATION_KIND))
    .order("desc")
    .first();
  // Noćni posao živi najviše 36 h, pa nedelja unazad pokriva svaku turu.
  const since = Math.max(previous?.createdAt ?? 0, now - 7 * DAY_MS);
  const recent = await ctx.db
    .query("generationJobs")
    .withIndex("by_user", (q) => q.eq("userId", userId).gt("createdAt", since))
    .take(500);
  const count = recent.filter((job) => job.deliveryMode === "night" && job.status === "done").length;
  if (count === 0) return;

  const user = await ctx.db.get(userId);
  const locale = user?.language === "en" ? "en" : "sr";
  const copy = nightNotificationCopy(count, locale);
  const notificationId = await ctx.db.insert("notifications", {
    userId,
    kind: NIGHT_NOTIFICATION_KIND,
    title: copy.title,
    body: copy.body,
    count,
    eventKey: `crea-nocna:${now}`,
    createdAt: now,
  });

  const at = morningPushAt(now);
  if (at === null) await ctx.scheduler.runAfter(0, internal.creaNight.sendMorningPush, { notificationId });
  else await ctx.scheduler.runAt(at, internal.creaNight.sendMorningPush, { notificationId });
}

/**
 * Push jutarnjeg iznenađenja. Kad je odložen za 08:00, a korisnik je u
 * međuvremenu već otvorio radove (obaveštenje pročitano), push se ne šalje.
 */
export const sendMorningPush = internalMutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.readAt !== undefined) return null;

    await schedulePersistentActivityPush(ctx, {
      category: "crea",
      recipientIds: [notification.userId],
      title: notification.title,
      body: notification.body,
      urlPath: NIGHT_PUSH_URL_PATH,
      eventKey: notification.eventKey ?? `crea-nocna:${notification.createdAt}`,
    });

    return null;
  },
});

/**
 * Preuzimanje poslova koji čekaju u batch-eve (cron predaje, K06-5). Posao stariji
 * od 36 h ide na refund umesto u batch. Posao čiji provajder batch-a trenutno nema
 * ključ ostaje da čeka - ako ključ ne stigne, rok ga refundira.
 *
 * Svaki batch se upisuje kao `preparing` i poslovi dobijaju `batchId` u ISTOJ
 * transakciji, pa dva prolaza nikad ne predaju isti posao dvaput.
 */
export const claimNightJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const waiting = await ctx.db
      .query("generationJobs")
      .withIndex("by_batch_status_created", (q) => q.eq("batchId", undefined).eq("status", "queued"))
      .take(CLAIM_SCAN_LIMIT);

    const providers = nightProviderStatus(process.env);
    const specs = new Map<string, NightBatchSpec | null>();
    const candidates: NightCandidate[] = [];
    const expiredUsers = new Set<Id<"users">>();
    for (const job of waiting) {
      if (now >= nightDeadlineAt(job.createdAt)) {
        if (await refundNightJob(ctx, job._id, NIGHT_ERRORS.deadline)) expiredUsers.add(job.userId);
        continue;
      }
      if (!specs.has(job.modelSlug)) specs.set(job.modelSlug, (await specOfModel(ctx, job.modelSlug)).spec);
      const spec = specs.get(job.modelSlug) ?? null;
      if (!spec || !providers[spec.provider]) continue;
      candidates.push({
        jobId: job._id,
        modelSlug: job.modelSlug,
        spec,
        inputBytes: await inputBytesOf(ctx, job),
        createdAt: job.createdAt,
      });
    }

    const batchIds: Array<Id<"creaBatches">> = [];
    for (const group of groupNightJobs(candidates)) {
      const batchId = await ctx.db.insert("creaBatches", {
        provider: group.spec.provider,
        modelSlug: group.modelSlug,
        providerModel: group.spec.model,
        state: "preparing",
        requestCount: group.jobIds.length,
        createdAt: now,
        deadlineAt: nightDeadlineAt(group.oldestCreatedAt),
      });
      for (const jobId of group.jobIds) await ctx.db.patch(jobId as Id<"generationJobs">, { batchId });
      batchIds.push(batchId);
    }

    for (const userId of expiredUsers) await announceIfRoundDone(ctx, userId);

    return { batchIds, expired: expiredUsers.size };
  },
});

/** Poslovi jednog batch-a koji još čekaju (najviše `NIGHT_BATCH_MAX_REQUESTS`). */
async function queuedJobsOf(ctx: QueryCtx | MutationCtx, batchId: Id<"creaBatches">) {
  return ctx.db
    .query("generationJobs")
    .withIndex("by_batch_status_created", (q) => q.eq("batchId", batchId).eq("status", "queued"))
    .take(NIGHT_BATCH_MAX_REQUESTS + 1);
}

/** Šta akcija treba da pošalje za jedan batch: model i poslovi sa parametrima i ulazima. */
export const getBatchForSubmit = internalQuery({
  args: { batchId: v.id("creaBatches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.state !== "preparing") return null;
    const jobs = await queuedJobsOf(ctx, args.batchId);

    return {
      provider: batch.provider,
      providerModel: batch.providerModel,
      jobs: jobs.map((job) => ({
        jobId: job._id,
        params: job.params,
        inputMode: job.inputMode ?? "text",
        inputs: job.inputs ?? null,
      })),
    };
  },
});

/** `preparing` → `submitted`. `false` = batch je u međuvremenu oboren (akcija tada otkazuje kod provajdera). */
export const markBatchSubmitted = internalMutation({
  args: {
    batchId: v.id("creaBatches"),
    providerBatchId: v.string(),
    inputFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || !canAdvanceBatch(batch.state, "submitted")) return false;
    await ctx.db.patch(args.batchId, {
      state: "submitted",
      providerBatchId: args.providerBatchId,
      ...(args.inputFileName ? { inputFileName: args.inputFileName } : {}),
      submittedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Predaja nije uspela prolaznom greškom (429/5xx): batch se gasi, a poslovi se
 * vraćaju u red bez `batchId`-ja i idu u sledeći prolaz. Krediti ostaju
 * rezervisani; rok od 36 h važi i dalje.
 */
export const releaseBatch = internalMutation({
  args: { batchId: v.id("creaBatches"), error: v.string() },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || !canAdvanceBatch(batch.state, "failed")) return 0;
    await ctx.db.patch(args.batchId, { state: "failed", error: args.error.slice(0, 500) });
    const jobs = await queuedJobsOf(ctx, args.batchId);
    for (const job of jobs) await ctx.db.patch(job._id, { batchId: undefined });

    return jobs.length;
  },
});

/**
 * Ceo batch je pao, istekao ili nikad nije predat: svaki posao koji još čeka ide
 * na refund. Prelaz stanja proverava `canAdvanceBatch`, pa ponovljen poziv ne
 * radi ništa.
 */
export const failBatch = internalMutation({
  args: {
    batchId: v.id("creaBatches"),
    state: v.union(v.literal("failed"), v.literal("expired")),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || !canAdvanceBatch(batch.state, args.state)) return 0;
    await ctx.db.patch(args.batchId, { state: args.state, error: args.error.slice(0, 500) });

    const users = new Set<Id<"users">>();
    let refunded = 0;
    for (const job of await queuedJobsOf(ctx, args.batchId)) {
      if (await refundNightJob(ctx, job._id, args.error)) {
        refunded += 1;
        users.add(job.userId);
      }
    }
    for (const userId of users) await announceIfRoundDone(ctx, userId);

    return refunded;
  },
});

/** Batch-evi koje prolaz praćenja gleda: predati, preuzeti a nedovršeni, i zaglavljeni u pripremi. */
export const listBatchesToPoll = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const take = (state: "submitted" | "succeeded") =>
      ctx.db
        .query("creaBatches")
        .withIndex("by_state", (q) => q.eq("state", state))
        .take(POLL_BATCH_LIMIT);
    const stale = await ctx.db
      .query("creaBatches")
      .withIndex("by_state", (q) => q.eq("state", "preparing").lt("createdAt", args.now - NIGHT_PREPARING_STALE_MS))
      .take(POLL_BATCH_LIMIT);
    const rows = [...(await take("submitted")), ...(await take("succeeded"))];

    return {
      stalePreparing: stale.map((batch) => batch._id),
      active: rows.map((batch) => ({
        batchId: batch._id,
        provider: batch.provider,
        state: batch.state,
        providerBatchId: batch.providerBatchId ?? null,
        resultFiles: batch.resultFiles ? (JSON.parse(batch.resultFiles) as string[]) : [],
        deadlineAt: batch.deadlineAt,
      })),
    };
  },
});

export const touchBatch = internalMutation({
  args: { batchId: v.id("creaBatches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (batch) await ctx.db.patch(args.batchId, { lastPolledAt: Date.now() });

    return null;
  },
});

/** `submitted` → `succeeded` sa fajlovima rezultata. Već `succeeded` (ponovljeno preuzimanje) je takođe u redu. */
export const markBatchSucceeded = internalMutation({
  args: { batchId: v.id("creaBatches"), resultFiles: v.array(v.string()) },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) return false;
    if (batch.state === "succeeded") return true;
    if (!canAdvanceBatch(batch.state, "succeeded")) return false;
    await ctx.db.patch(args.batchId, { state: "succeeded", resultFiles: JSON.stringify(args.resultFiles) });

    return true;
  },
});

/**
 * Rezultat jednog reda: slika je već u storage-u, ovde posao postaje `done`,
 * upisuje se stvaran trošak (batch cena), izlaz i zakazuje poravnanje - isti
 * kraj kao sinhroni Google posao (`completeGoogleImageJob`).
 *
 * Upis samo za posao koji je još `queued` i pripada OVOM batch-u; inače `false`,
 * a pozivalac briše bajtove koje je upravo stavio u storage.
 */
export const completeNightJob = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    batchId: v.id("creaBatches"),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    byteSize: v.number(),
    usage: v.optional(tokenUsageValidator),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "queued" || job.batchId !== args.batchId) return false;

    const batch = await ctx.db.get(args.batchId);
    await ctx.db.patch(args.jobId, {
      status: "done",
      completedAt: Date.now(),
      ...(batch?.providerBatchId ? { providerRequestId: batch.providerBatchId } : {}),
    });

    const done = await ctx.db.get(args.jobId);
    if (done) {
      const { spec, capabilities } = await specOfModel(ctx, job.modelSlug);
      const outcome = spec
        ? nightActualCost(args.usage ?? null, spec, parseTokenRates(capabilities))
        : { ok: false as const, reason: ACTUAL_COST_REASON.noCatalogRow };
      if (outcome.ok) await recordJobActualCost(ctx, done, outcome.usd);
      else await recordActualCostReason(ctx, done, outcome.reason);
    }

    const finalized: boolean = await ctx.runMutation(internal.studio.finalizeOutput, {
      jobId: args.jobId,
      storageId: args.storageId,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
    });
    // Poravnanje se ZAKAZUJE: naplata razlike ne sme da povuče isporuku sa sobom.
    await ctx.scheduler.runAfter(0, internal.studio.settleJobCredits, { jobId: args.jobId });
    await announceIfRoundDone(ctx, job.userId);

    return finalized;
  },
});

/** Red sa greškom za jedan posao: refund tog posla (samo ako još čeka u ovom batch-u). */
export const failNightJob = internalMutation({
  args: { jobId: v.id("generationJobs"), batchId: v.id("creaBatches"), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "queued" || job.batchId !== args.batchId) return false;
    const refunded = await refundNightJob(ctx, args.jobId, args.error.slice(0, 500));
    if (refunded) await announceIfRoundDone(ctx, job.userId);

    return refunded;
  },
});

/** Kraj preuzimanja: posao bez svog reda u rezultatu ide na refund, batch je `ingested`. */
export const finishBatchIngest = internalMutation({
  args: { batchId: v.id("creaBatches") },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch || !canAdvanceBatch(batch.state, "ingested")) return 0;

    const users = new Set<Id<"users">>();
    let refunded = 0;
    for (const job of await queuedJobsOf(ctx, args.batchId)) {
      if (await refundNightJob(ctx, job._id, NIGHT_ERRORS.missing)) {
        refunded += 1;
        users.add(job.userId);
      }
    }
    await ctx.db.patch(args.batchId, { state: "ingested" });
    for (const userId of users) await announceIfRoundDone(ctx, userId);

    return refunded;
  },
});

// ── Značka u radionici (G13) ───────────────────────────────────────────────────

/** Nepročitana jutarnja iznenađenja: koliko radova je stiglo iz noćne ture. */
export const getMorningArrivals = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return { count: 0 };
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_kind_and_readAt_and_createdAt", (q) =>
        q.eq("userId", userId).eq("kind", NIGHT_NOTIFICATION_KIND).eq("readAt", undefined),
      )
      .take(20);

    return { count: unread.reduce((sum, row) => sum + (row.count ?? 0), 0) };
  },
});

/** Korisnik je otvorio radove - značka nestaje, a odložen push se više ne šalje. */
export const markMorningArrivalsSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_kind_and_readAt_and_createdAt", (q) =>
        q.eq("userId", userId).eq("kind", NIGHT_NOTIFICATION_KIND).eq("readAt", undefined),
      )
      .take(20);
    const now = Date.now();
    for (const row of unread) await ctx.db.patch(row._id, { readAt: now });

    return unread.length;
  },
});
