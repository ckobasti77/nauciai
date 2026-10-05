import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { localModelSlug } from "../lib/crea-tools";
import {
  LOCAL_RESULT_LIMITS,
  localLimitProblem,
  localResultProblem,
  localToolProblem,
  MINUTE_MS,
  sanitizeLocalParams,
  type LocalRejectReason,
} from "./creaLocalCore";
import { requireStudioAccess } from "./studio";
import { dayStart, outputExpiresAt, promptHash, UPLOAD_GRANT_CLOCK_SLACK_MS, UPLOAD_GRANT_TTL_MS } from "./studioCore";

/**
 * Rezultati lokalnih alata u galeriji (Crea K04, plan K01 §4.2-4.4).
 *
 * Alat radi u browseru i košta 0 kredita; ovde se samo ČUVA rezultat:
 *   1. `createLocalResultUploadUrl({ kind })` → upload URL + dozvola (`studioUploadGrants`)
 *   2. POST bloba na URL → `storageId`
 *   3. `saveLocalResult(...)` → red u `generationJobs` sa `provider: "local"`,
 *      `creditCost: 0`, status `done`; galerija ga vidi odmah (Convex pretplata).
 *
 * Kapija je ista kao za upload ulaza (`requireStudioAccess`, K01-7): ko ne sme
 * da kači fajlove u Creu, ne puni ni storage - njemu UI nudi samo „Preuzmi".
 * Ništa od ovoga ne dira kredite, `studioUsageDaily` ni globalni plafon troška.
 */

const localResultKind = v.union(v.literal("image"), v.literal("video"), v.literal("audio"));

/** Slot dozvole za lokalni rezultat; `registerInputUpload` ga ne poznaje kao ulazni slot. */
function localGrantSlot(kind: "image" | "video" | "audio"): string {
  return `local:${kind}`;
}

/** Koliko je korisnik lokalnih rezultata sačuvao u poslednjem minutu i danas (UTC). */
async function localUsage(ctx: MutationCtx, userId: Id<"users">, now: number) {
  const lastMinute = await ctx.db
    .query("generationJobs")
    .withIndex("by_user_provider_created", (q) =>
      q.eq("userId", userId).eq("provider", "local").gt("createdAt", now - MINUTE_MS),
    )
    .take(LOCAL_RESULT_LIMITS.perMinute);
  const today = await ctx.db
    .query("generationJobs")
    .withIndex("by_user_provider_created", (q) =>
      q.eq("userId", userId).eq("provider", "local").gte("createdAt", dayStart(now)),
    )
    .take(LOCAL_RESULT_LIMITS.perDay);
  return {
    lastMinute: lastMinute.length,
    today: today.length,
    todayBytes: today.reduce((sum, job) => sum + (job.outputBytes ?? 0), 0),
  };
}

/**
 * Upload URL za jedan lokalni rezultat. Limit se proverava već ovde (bez upisa
 * posla), da korisnik preko limita ne bi uopšte slao fajl; konačna provera je u
 * `saveLocalResult`, u istoj transakciji koja upisuje.
 */
export const createLocalResultUploadUrl = mutation({
  args: { kind: localResultKind },
  handler: async (ctx, args) => {
    const { userId } = await requireStudioAccess(ctx);
    const now = Date.now();
    const problem = localLimitProblem({ ...(await localUsage(ctx, userId, now)), addBytes: 0 });
    if (problem) throw new Error(problem);

    const grantId = await ctx.db.insert("studioUploadGrants", {
      userId,
      slot: localGrantSlot(args.kind),
      createdAt: now,
      expiresAt: now + UPLOAD_GRANT_TTL_MS,
    });
    return { uploadUrl: await ctx.storage.generateUploadUrl(), grantId };
  },
});

/**
 * Upis rezultata. Dok vlasništvo nad fajlom nije dokazano (dozvola + fajl
 * nastao posle nje), odbijanje BACA i ništa ne briše - tuđi `storageId` se ne
 * sme ni dirati. Posle toga je fajl dokazano ovog korisnika, pa se svako
 * odbijanje VRAĆA kao vrednost (union-return, kao `moderationBlocked`): blob se
 * briše, dozvola troši, i to se commit-uje - bačena greška bi ostavila siroče u
 * storage-u.
 */
export const saveLocalResult = mutation({
  args: {
    grantId: v.id("studioUploadGrants"),
    storageId: v.id("_storage"),
    toolId: v.string(),
    kind: localResultKind,
    params: v.optional(v.string()),
    projectId: v.optional(v.id("studioProjects")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; jobId: Id<"generationJobs"> } | { ok: false; reason: LocalRejectReason }> => {
    const { userId } = await requireStudioAccess(ctx);
    const now = Date.now();

    const grant = await ctx.db.get(args.grantId);
    if (
      !grant ||
      grant.userId !== userId ||
      grant.usedAt !== undefined ||
      grant.expiresAt <= now ||
      grant.slot !== localGrantSlot(args.kind)
    ) {
      throw new Error("NEDOZVOLJEN_UPLOAD");
    }
    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) throw new Error("FAJL_NE_POSTOJI");
    // Isto pravilo kao `registerInputUpload`: fajl stariji od dozvole nije nastao iz nje.
    if (meta._creationTime < grant.createdAt - UPLOAD_GRANT_CLOCK_SLACK_MS) throw new Error("NEDOZVOLJEN_UPLOAD");

    // ── Od ove tačke je blob dokazano ovog korisnika. ──
    const reject = async (reason: LocalRejectReason) => {
      await ctx.storage.delete(args.storageId);
      await ctx.db.patch(grant._id, { usedAt: now });
      return { ok: false as const, reason };
    };

    const toolProblem = localToolProblem(args.toolId, args.kind);
    if (toolProblem) return reject(toolProblem);
    const fileProblem = localResultProblem({ kind: args.kind, contentType: meta.contentType, size: meta.size });
    if (fileProblem) return reject(fileProblem);
    const limitProblem = localLimitProblem({ ...(await localUsage(ctx, userId, now)), addBytes: meta.size });
    if (limitProblem) return reject(limitProblem);
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.userId !== userId || project.archivedAt !== undefined) {
        return reject("PROJEKAT_NIJE_DOSTUPAN");
      }
    }

    await ctx.db.patch(grant._id, { usedAt: now });
    const jobId = await ctx.db.insert("generationJobs", {
      userId,
      ...(args.projectId ? { projectId: args.projectId } : {}),
      modelSlug: localModelSlug(args.toolId),
      kind: args.kind,
      provider: "local",
      params: sanitizeLocalParams(args.params),
      promptHash: promptHash(""),
      status: "done",
      creditCost: 0,
      estimatedCostUsd: 0,
      actualCostUsd: 0,
      outputStorageId: args.storageId,
      outputBytes: meta.size,
      // Isti rok kao za plaćene radove: `crons.expireGenerationFiles` briše fajl, red ostaje.
      expiresAt: outputExpiresAt(args.kind, now),
      createdAt: now,
      completedAt: now,
    });
    return { ok: true as const, jobId };
  },
});
