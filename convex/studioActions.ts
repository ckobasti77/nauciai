import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { submitToFal } from "../lib/fal";

/**
 * `markJobRunning` i `failJob` bi po konvenciji repoa (mutacije nad
 * `generationJobs`) pripadale `convex/studio.ts`, ali taj fajl još ne postoji
 * - `createJob` dolazi tek u A9. `submitJob` ne može da radi bez njih, pa žive
 * ovde dok A9 ne otvori `studio.ts` i po potrebi ih preseli.
 */
export const getJobForSubmit = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.jobId);
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
 * Predaje rezervisan posao fal.ai queue API-ju. Uspeh -> `markJobRunning`.
 * Bilo koja greška (fali FAL_KEY/CONVEX_SITE_URL, fal vrati ne-2xx, mrežna
 * greška) -> `failJob`, koja odmah refundira. Ne baca dalje - poziv je uvek
 * "obrađen", ili je posao `running` ili je `refunded`.
 */
export const submitJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    // Sve od učitavanja do fal poziva ide u JEDAN try: posao ne sme da ostane
    // zaglavljen u "reserved" (krediti već skinuti) ako bilo šta ovde padne -
    // fali model u katalogu, fali FAL_KEY, malformisan JSON, mrežna greška.
    try {
      const job = await ctx.runQuery(internal.studioActions.getJobForSubmit, { jobId: args.jobId });
      if (!job) throw new Error("Posao nije pronađen.");

      const model = await ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: job.modelSlug });
      if (!model) throw new Error("Model nije pronađen u katalogu.");

      const apiKey = process.env.FAL_KEY;
      if (!apiKey) throw new Error("FAL_KEY nije postavljen");

      const siteUrl = process.env.CONVEX_SITE_URL;
      if (!siteUrl) throw new Error("CONVEX_SITE_URL nije postavljen");

      const input: Record<string, unknown> = {
        ...JSON.parse(model.defaultParams),
        ...JSON.parse(job.params),
      };

      const result = await submitToFal({
        endpoint: model.falEndpoint,
        input,
        webhookUrl: `${siteUrl}/fal/webhook`,
        apiKey,
      });

      await ctx.runMutation(internal.studioActions.markJobRunning, {
        jobId: args.jobId,
        falRequestId: result.requestId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.studioActions.failJob, { jobId: args.jobId, error: message });
    }

    return null;
  },
});
