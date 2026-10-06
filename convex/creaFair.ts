import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  CANCELLED_ERROR,
  cancelRouteOf,
  FAIR_UNLIMITED,
  falQueueStatus,
  falRequestUrl,
  FREE_REDO_LIMITS,
  FREE_REDO_WINDOW_MS,
  freeRedoBlock,
  normalizeDailyLimit,
} from "./creaFairCore";
import { countFreeJobs, hasPremiumPlan, personalDailyLimit } from "./creaFairDb";
import { CREA_FLAG_KEYS, readCreaFlag } from "./creaFlags";
import { creaRewardProblem } from "./creaGameCore";
import { requireUserId } from "./helpers";
import { resolveEndpointTier } from "./providers/falInputs";
import { createJobForUser } from "./studio";
import { dayKey, parseParams } from "./studioCore";

/**
 * Pošteni krediti Cree (K28): lični dnevni limit (U7), besplatno ponavljanje
 * pokvarenog rada (U7), otkazivanje uz povraćaj (U7) i pošteno „neograničeno"
 * (C8, iza flega `crea_fair_unlimited`). Pravila su u `creaFairCore.ts`; sama
 * naplata ostaje u `studio.createJobForUser` / `studio.failJob`, pa povraćaj ide
 * postojećim putem i ne može da se desi dvaput (`failJob` + `refundCredits`).
 */

async function redoCounts(ctx: QueryCtx | MutationCtx, userId: Id<"users">, now: number) {
  return {
    usedToday: await countFreeJobs(ctx, userId, "redo", now - FREE_REDO_WINDOW_MS.day, FREE_REDO_LIMITS.perDay),
    used30Days: await countFreeJobs(ctx, userId, "redo", now - FREE_REDO_WINDOW_MS.month, FREE_REDO_LIMITS.per30Days),
  };
}

async function alreadyRedone(ctx: QueryCtx | MutationCtx, jobId: Id<"generationJobs">): Promise<boolean> {
  const row = await ctx.db
    .query("creaFreeJobs")
    .withIndex("by_originalJobId", (q) => q.eq("originalJobId", jobId))
    .first();
  return row !== null;
}

/** Stanje za composer, kredite i detalj rada. `now` šalje klijent (upit ne čita sat). */
export const getFairState = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const usage = await ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayKey(args.now)))
      .unique();
    const redo = await redoCounts(ctx, userId, args.now);
    const fairOn = (await readCreaFlag(ctx, CREA_FLAG_KEYS.fairUnlimited)) && (await hasPremiumPlan(ctx, userId));
    return {
      dailyLimit: await personalDailyLimit(ctx, userId),
      spentToday: usage?.creditsSpent ?? 0,
      redo: {
        leftToday: Math.max(0, FREE_REDO_LIMITS.perDay - redo.usedToday),
        left30Days: Math.max(0, FREE_REDO_LIMITS.per30Days - redo.used30Days),
      },
      fairUnlimited: fairOn
        ? {
            models: [...FAIR_UNLIMITED.models],
            left: Math.max(
              0,
              FAIR_UNLIMITED.monthlyJobs -
                (await countFreeJobs(ctx, userId, "fair", args.now - FAIR_UNLIMITED.windowMs, FAIR_UNLIMITED.monthlyJobs)),
            ),
            monthly: FAIR_UNLIMITED.monthlyJobs,
          }
        : null,
    };
  },
});

/** Lični dnevni limit potrošnje; `null` ga briše. Važi odmah, za sve puteve (composer, MCP, pomoćnik). */
export const setDailySpendLimit = mutation({
  args: { credits: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const credits = normalizeDailyLimit(args.credits);
    const row = await ctx.db
      .query("creaSpendLimits")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (credits === null) {
      if (row) await ctx.db.delete("creaSpendLimits", row._id);
    } else if (row) {
      await ctx.db.patch("creaSpendLimits", row._id, { dailyCredits: credits, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("creaSpendLimits", { userId, dailyCredits: credits, updatedAt: Date.now() });
    }
    return credits;
  },
});

/** Sme li ovaj rad da se ponovi besplatno (dugme u detalju). */
export const getRedoOffer = query({
  args: { jobId: v.id("generationJobs"), now: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    // Iza flega (K29-09): dok je isključen, dugme se ne prikazuje.
    if (!(await readCreaFlag(ctx, CREA_FLAG_KEYS.freeRedo))) return null;
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId) return null;
    const counts = await redoCounts(ctx, userId, args.now);
    const block = freeRedoBlock({
      job,
      reason: "prazno",
      now: args.now,
      alreadyRedone: await alreadyRedone(ctx, job._id),
      ...counts,
    });
    return { ok: block === null, block, leftToday: Math.max(0, FREE_REDO_LIMITS.perDay - counts.usedToday) };
  },
});

/**
 * U7: rad je očigledno pokvaren → isti zahtev još jednom, za 0 kredita. Sve
 * provere (vlasništvo, starost, jedno ponavljanje po radu, limiti) su u ISTOJ
 * transakciji kao i nov posao, pa dva brza klika ne prave dva besplatna posla.
 */
export const redoBroken = mutation({
  args: { jobId: v.id("generationJobs"), reason: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!(await readCreaFlag(ctx, CREA_FLAG_KEYS.freeRedo))) throw new Error("PONAVLJANJE_ISKLJUCENO");
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId) throw new Error("IZVOR_NIJE_DOSTUPAN");
    // Ista zaštita od farmovanja kao ostale besplatne pogodnosti (K29-09).
    if (await creaRewardProblem(ctx, userId)) throw new Error("PONAVLJANJE_NEDOSTUPNO");
    const now = Date.now();
    const block = freeRedoBlock({
      job,
      reason: args.reason,
      now,
      alreadyRedone: await alreadyRedone(ctx, job._id),
      ...(await redoCounts(ctx, userId, now)),
    });
    if (block) throw new Error(block);

    const result = await createJobForUser(
      ctx,
      userId,
      {
        modelSlug: job.modelSlug,
        params: job.params,
        ...(job.inputMode ? { inputMode: job.inputMode } : {}),
        ...(job.inputs ? { inputs: job.inputs } : {}),
        ...(job.projectId ? { projectId: job.projectId } : {}),
        parentJobId: job._id,
        derivation: "regeneracija",
      },
      { freeRedo: { originalJobId: job._id, reason: args.reason }, ...(job.faceVerified ? { faceVerified: true as const } : {}) },
    );
    if (typeof result !== "string") throw new Error("NEISPRAVAN_PROMPT:ZABRANJEN_POJAM");
    return result;
  },
});

// ── Otkazivanje (U7) ─────────────────────────────────────────────────────────

type CancelStart =
  | { kind: "done" }
  | { kind: "no" }
  | { kind: "fal"; endpoint: string; requestId: string };

/**
 * Prvi korak otkaza: vlasništvo i put. Posao za koji provajder još ne zna
 * (`local`) se odmah obara kroz `failJob` - isti povraćaj kao svaki neuspeh.
 */
export const beginCancel = internalMutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args): Promise<CancelStart> => {
    const userId = await requireUserId(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId) throw new Error("IZVOR_NIJE_DOSTUPAN");
    const route = cancelRouteOf(job);
    if (route === null) return { kind: "no" };
    if (route === "local") {
      await ctx.runMutation(internal.studio.failJob, { jobId: job._id, error: CANCELLED_ERROR });
      return { kind: "done" };
    }

    // fal: ruta posla (ista kao pri predaji). Posao koji je na fal stigao rezervnom
    // rutom (C3) ili model bez rute se ne otkazuje - bolje „ne može" nego pogrešan zahtev.
    const model = await ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", job.modelSlug))
      .unique();
    let endpoint: string | null = null;
    if (model) {
      if (model.provider !== "fal") return { kind: "no" };
      const endpoints = parseParams(model.endpoints) ?? {};
      const raw = endpoints[job.inputMode ?? Object.keys(endpoints)[0] ?? ""];
      if (typeof raw === "string") {
        try {
          endpoint = resolveEndpointTier(raw, parseParams(job.params) ?? {}, parseParams(model.capabilities) ?? {});
        } catch {
          endpoint = null;
        }
      }
    } else {
      const legacy = await ctx.db
        .query("modelCatalog")
        .withIndex("by_slug", (q) => q.eq("slug", job.modelSlug))
        .unique();
      endpoint = legacy?.falEndpoint ?? null;
    }
    if (!endpoint || !job.falRequestId) return { kind: "no" };
    return { kind: "fal", endpoint, requestId: job.falRequestId };
  },
});

/** fal je prihvatio otkaz posla koji nije počeo: povraćaj, ako je posao i dalje isti i u toku. */
export const finishCancel = internalMutation({
  args: { jobId: v.id("generationJobs"), requestId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.status !== "running" || job.falRequestId !== args.requestId) return false;
    await ctx.runMutation(internal.studio.failJob, { jobId: job._id, error: CANCELLED_ERROR });
    return true;
  },
});

export type CancelReply = { ok: true } | { ok: false; reason: "NE_MOZE" | "VEC_RADI" | "GRESKA" };

/**
 * Otkaži posao uz povraćaj gde provajder dozvoljava. Povraćaj je uvek
 * `studio.failJob` (idempotentan: drugi otkaz, zakasneli webhook ili reaper ne
 * vraćaju ništa po drugi put).
 */
export const cancelJob = action({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args): Promise<CancelReply> => {
    const start: CancelStart = await ctx.runMutation(internal.creaFair.beginCancel, { jobId: args.jobId });
    if (start.kind === "done") return { ok: true };
    if (start.kind === "no") return { ok: false, reason: "NE_MOZE" };

    const apiKey = process.env.FAL_KEY;
    if (!apiKey) return { ok: false, reason: "NE_MOZE" };
    const headers = { Authorization: `Key ${apiKey}` };
    try {
      // Samo posao koji fal još drži u redu: počet posao fal naplaćuje i posle otkaza.
      const statusResponse = await fetch(falRequestUrl(start.endpoint, start.requestId, "status"), { headers });
      if (!statusResponse.ok) return { ok: false, reason: "GRESKA" };
      if (falQueueStatus(await statusResponse.json()) !== "IN_QUEUE") return { ok: false, reason: "VEC_RADI" };
      const cancelResponse = await fetch(falRequestUrl(start.endpoint, start.requestId, "cancel"), { method: "PUT", headers });
      if (cancelResponse.status !== 202) return { ok: false, reason: "VEC_RADI" };
    } catch (error) {
      console.warn(`Otkaz: mreža - ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, reason: "GRESKA" };
    }
    const done: boolean = await ctx.runMutation(internal.creaFair.finishCancel, { jobId: args.jobId, requestId: start.requestId });
    return done ? { ok: true } : { ok: false, reason: "VEC_RADI" };
  },
});
