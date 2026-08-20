import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { submitToFal } from "../lib/fal";
import { submitBytePlusJob } from "./providers/byteplus";
import { submitGoogleJob } from "./providers/google";
import { googleDownloadHeaders } from "./providers/googleCore";
import {
  extractPrompt,
  MOCK_REQUEST_PREFIX,
  mockJobSucceeds,
  mockOutputDataUrl,
  parseParams,
} from "./studioCore";

export const getJobForSubmit = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.jobId);
  },
});

/** Koliko dugo "traje" mock generacija pre nego što se javi ishod. */
const MOCK_JOB_DELAY_MS = 3000;

/**
 * Predaje rezervisan posao fal.ai queue API-ju. Uspeh -> `studio.markJobRunning`.
 * Bilo koja greška (fali FAL_KEY/CONVEX_SITE_URL, fal vrati ne-2xx, mrežna
 * greška) -> `studio.failJob`, koja odmah refundira. Ne baca dalje - poziv je
 * uvek "obrađen", ili je posao `running` ili je `refunded`.
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

      // Druga predaja istog posla (dvostruko zakazivanje, ručni poziv, budući
      // retry wrapper) platila bi fal-u dvaput na jedan naplaćen kredit, i
      // ostavila webhook prve predaje bez posla. Izlazak je bez ikakvog
      // dejstva - posao je već `running`, `done` ili refundiran.
      if (job.status !== "reserved") return null;

      // Rutiranje po provajderu (STUDIO-CATALOG-V4 sekcija 7). v4 katalog
      // (`models`) zna svog provajdera; stari `modelCatalog` je uvek fal, pa
      // model kojeg u `models` nema pada na fal put nepromenjen.
      const v4Model = await ctx.runQuery(internal.studioModels.getModelBySlug, {
        slug: job.modelSlug,
      });
      if (v4Model?.provider === "byteplus") {
        await submitBytePlusJob(ctx, args.jobId);

        return null;
      }
      if (v4Model?.provider === "google") {
        await submitGoogleJob(ctx, args.jobId);

        return null;
      }

      const model = await ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: job.modelSlug });
      if (!model) throw new Error("Model nije pronađen u katalogu.");

      const apiKey = process.env.FAL_KEY;

      // Mock provajder (STUDIO-PLAN dan, P4): dok Jovan nema FAL_KEY, posao i
      // dalje prolazi kroz IDENTIČAN ledger put (reserved -> running ->
      // done/refunded) - samo fal poziv zamenjuje zakazana simulacija.
      // `STUDIO_MOCK=1` je izričit override za ručno testiranje i kad ključ
      // već postoji; odsustvo ključa SAMO PO SEBI je uvek dovoljno za mock.
      if (!apiKey || process.env.STUDIO_MOCK === "1") {
        await ctx.runMutation(internal.studio.markJobRunning, {
          jobId: args.jobId,
          providerRequestId: `${MOCK_REQUEST_PREFIX}${args.jobId}`,
        });
        await ctx.scheduler.runAfter(MOCK_JOB_DELAY_MS, internal.studioActions.completeMockJob, {
          jobId: args.jobId,
        });

        return null;
      }

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

      await ctx.runMutation(internal.studio.markJobRunning, {
        jobId: args.jobId,
        providerRequestId: result.requestId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.studio.failJob, { jobId: args.jobId, error: message });
    }

    return null;
  },
});

/**
 * Simulira fal webhook za mock posao, zakazana iz `submitJob` na
 * `MOCK_JOB_DELAY_MS`. Ishod ide kroz ISTU internu mutaciju kao pravi fal
 * webhook (`falWebhook.applyWebhookResult`) - dakle isti refund, isti
 * `persistOutput`, ista idempotencija na `job.status !== "running"`. Ovo je
 * demo PROVAJDERA, ne demo ledgera.
 */
export const completeMockJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.studioActions.getJobForSubmit, { jobId: args.jobId });
    if (!job || job.status !== "running" || !job.falRequestId?.startsWith(MOCK_REQUEST_PREFIX)) return null;

    if (mockJobSucceeds(args.jobId)) {
      await ctx.runMutation(internal.falWebhook.applyWebhookResult, {
        falRequestId: job.falRequestId,
        status: "OK",
        outputUrl: mockOutputDataUrl(extractPrompt(parseParams(job.params) ?? {}), job.promptHash),
      });
    } else {
      await ctx.runMutation(internal.falWebhook.applyWebhookResult, {
        falRequestId: job.falRequestId,
        status: "ERROR",
        error: "MOCK_NEUSPEH: demo posao je namerno neuspeo (deterministički po jobId-u, ~15% poslova).",
      });
    }

    return null;
  },
});

/**
 * Skida gotov izlaz sa fal-a u Convex storage. Webhook je zakazuje čim posao
 * stigne kao uspešan, da se skidanje ne bi radilo u samom handleru - fal daje
 * 15 s na prvi pokušaj, a fal URL živi kratko: bez ovog koraka korisnik ne
 * može da dodje do onoga što je platio.
 *
 * Ceo upis radi `studio.finalizeOutput` u jednoj transakciji. Neuspeh se ne
 * refundira (videti `studio.markOutputFailed`).
 */
export const persistOutput = internalAction({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.studioActions.getJobForSubmit, { jobId: args.jobId });
    // fal ponavlja isti webhook do 31 put, a webhook zakazuje ovu akciju -
    // dakle svaki ulaz posle prvog mora da izadje bez ijednog dejstva.
    if (!job || job.status !== "done" || !job.falOutputUrl || job.outputStorageId) return null;

    try {
      // Google-ov izlaz stoji na `generativelanguage.googleapis.com` i traži
      // ključ; fal i BytePlus daju potpisan URL i ne smeju da ga vide. Bez ovog
      // zaglavlja bi Google posao ostao `done` bez fajla, a plaćen je.
      const response = await fetch(job.falOutputUrl, {
        headers: googleDownloadHeaders(job.falOutputUrl, process.env.GOOGLE_AI_API_KEY),
      });
      if (!response.ok) {
        throw new Error(`fal je vratio ${response.status} pri preuzimanju izlaza.`);
      }

      const blob = await response.blob();
      const storageId = await ctx.storage.store(blob);
      const stored = await ctx.runMutation(internal.studio.finalizeOutput, {
        jobId: args.jobId,
        storageId,
        // Prazan `type` je "ne znam", a ne "prazan MIME": polje je opciono, pa
        // se ne upisuje umesto da se izmišlja.
        mimeType: blob.type || undefined,
        byteSize: blob.size,
      });
      if (!stored) await ctx.storage.delete(storageId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.studio.markOutputFailed, {
        jobId: args.jobId,
        error: `IZLAZ_NIJE_SACUVAN: ${message}`,
      });
    }

    return null;
  },
});
