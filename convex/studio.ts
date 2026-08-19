import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { validatePrompt } from "./creditsCore";
import { requireUserId } from "./helpers";
import {
  computeCreditCost,
  dayKey,
  extractPrompt,
  MAX_ACTIVE_JOBS,
  MAX_DAILY_GENERATIONS,
  parseParams,
  promptHash,
} from "./studioCore";

/** Kill switch iz STUDIO-PLAN 4.4; red živi u `platformFlags`. */
const STUDIO_FLAG_KEY = "studio_enabled";

/**
 * Rezervacija posla iz koraka 1 sekcije 4.2 STUDIO-PLAN-a. Sve provere idu
 * PRE prvog upisa, a rezervacija posla i skidanje kredita su u istoj
 * transakciji - ne sme da ostane ni skinut kredit bez posla, ni posao bez
 * skinutog kredita.
 */
export const createJob = mutation({
  args: { modelSlug: v.string(), params: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    // Kill switch se čita prvi, pre svega ostalog. Red koji ne postoji znači
    // "nikad nije ni gašen" - podrazumevana vrednost seed-a je `true`.
    const flag = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", STUDIO_FLAG_KEY))
      .unique();
    if (flag && !flag.enabled) throw new Error("STUDIO_PAUZIRAN");

    // Studio je samo za upisane (STUDIO-PLAN 4.4). Dovoljan je jedan aktivan
    // upis - posao nije vezan za konkretan kurs.
    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!enrollment) throw new Error("NIJE_UPISAN");

    // Moderacija pre svake provere koja košta čitanje ledgera.
    const params = parseParams(args.params);
    if (!params) throw new Error("NEISPRAVNI_PARAMETRI");
    const prompt = extractPrompt(params);
    const promptCheck = validatePrompt(prompt);
    if (!promptCheck.ok) throw new Error(`NEISPRAVAN_PROMPT:${promptCheck.reason}`);

    // Model koji ne postoji i model koji je admin isključio su za korisnika
    // ista stvar: ne može se generisati na njemu.
    const model = await ctx.db
      .query("modelCatalog")
      .withIndex("by_slug", (q) => q.eq("slug", args.modelSlug))
      .unique();
    if (!model || !model.isEnabled) throw new Error("MODEL_NEDOSTUPAN");

    const reserved = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "reserved"))
      .take(MAX_ACTIVE_JOBS);
    const running = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "running"))
      .take(MAX_ACTIVE_JOBS);
    if (reserved.length + running.length >= MAX_ACTIVE_JOBS) throw new Error("PREVISE_POSLOVA");

    const now = Date.now();
    const day = dayKey(now);
    const usage = await ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .unique();
    if ((usage?.generations ?? 0) >= MAX_DAILY_GENERATIONS) throw new Error("DNEVNI_LIMIT");

    const creditCost = computeCreditCost(model, params);

    // Upis posla ide PRE potrošnje jer `credits.spendCredits` (A2) traži
    // `jobId` - to je ključ pod kojim se refund kasnije prepoznaje. Sve je i
    // dalje jedna transakcija: ako potrošnja pukne (NEDOVOLJNO_KREDITA), ovaj
    // insert se poništava sam, bez ručnog rollback-a.
    const jobId = await ctx.db.insert("generationJobs", {
      userId,
      modelSlug: model.slug,
      kind: model.kind,
      params: args.params,
      promptHash: promptHash(prompt),
      status: "reserved",
      creditCost,
      createdAt: now,
    });

    await ctx.runMutation(internal.credits.spendCredits, {
      userId,
      amount: creditCost,
      jobId,
    });

    if (usage) {
      await ctx.db.patch(usage._id, {
        generations: usage.generations + 1,
        creditsSpent: usage.creditsSpent + creditCost,
        costUsd: usage.costUsd + model.estimatedCostUsd,
      });
    } else {
      await ctx.db.insert("studioUsageDaily", {
        userId,
        day,
        generations: 1,
        creditsSpent: creditCost,
        costUsd: model.estimatedCostUsd,
      });
    }

    await ctx.scheduler.runAfter(0, internal.studioActions.submitJob, { jobId });

    return jobId;
  },
});

export const markJobRunning = internalMutation({
  args: { jobId: v.id("generationJobs"), falRequestId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Posao nije pronađen.");
    await ctx.db.patch(args.jobId, { status: "running", falRequestId: args.falRequestId });
    return null;
  },
});

/**
 * Označava posao kao neuspeo i odmah refundira preko `credits.refundCredits`
 * (idempotentno preko `by_job_type` - videti `convex/credits.ts`). Poziva se
 * kad `submitJob` ne uspe da preda zahtev fal-u, pre nego što je bilo šta
 * poslato - posao nikad nije ušao u `running`.
 */
export const failJob = internalMutation({
  args: { jobId: v.id("generationJobs"), error: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Posao nije pronađen.");
    await ctx.db.patch(args.jobId, { status: "failed", error: args.error, completedAt: Date.now() });
    await ctx.runMutation(internal.credits.refundCredits, { jobId: args.jobId });
    await ctx.db.patch(args.jobId, { status: "refunded" });
    return null;
  },
});

/**
 * Poslovi prijavljenog korisnika, najnoviji prvi. Convex query je već
 * realtime pretplata - UI dobija nov status čim ga webhook upiše, bez
 * pollinga (STUDIO-PLAN 4.2, korak 5).
 */
export const listMyJobs = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const result = await ctx.db
      .query("generationJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      // `falRequestId` i `actualCostUsd` su naša interna cena i trag ka fal-u;
      // korisniku ne trebaju i ne izlaze iz backend-a.
      page: result.page.map((job) => ({
        _id: job._id,
        modelSlug: job.modelSlug,
        kind: job.kind,
        params: job.params,
        status: job.status,
        creditCost: job.creditCost,
        outputStorageId: job.outputStorageId,
        posterStorageId: job.posterStorageId,
        error: job.error,
        expiresAt: job.expiresAt,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      })),
    };
  },
});
