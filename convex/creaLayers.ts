import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import {
  extraOutputKind,
  isLayerizeJob,
  LAYER_COUNT_RANGE,
  layerChildParams,
  layerNumberOf,
  orderLayers,
  STEM_PARAM,
  STEMS_MODEL_SLUG,
  type ExtraOutputDerivation,
} from "./creaLayersCore";
import { STEM_KEYS, type StemKey } from "./providers/falAudioModels";
import { lineageFrom, VERSION_TREE_MAX_NODES } from "./creaVersionsCore";
import { requireUserId } from "./helpers";
import { isMockRequestId, MOCK_REQUEST_PREFIX, outputExpiresAt, parseParams } from "./studioCore";

/**
 * Slojevi (Crea K12, S20): razlaganje Seedream-a 5 Pro vraća jedan fajl po
 * sloju. Prvi je izlaz posla; ostali su zasebni radovi - dete glavnog posla
 * (`derivation: "sloj"`), bez kredita (plaćen je glavni posao). Editor slojeva
 * ih čita zajedno kroz `getLayers`.
 */

/**
 * Deca jednog poziva: isti koren, roditelj = glavni posao, izvođenje „sloj"
 * (razlaganje, K12) ili „varijacija" (više slika jednog poziva, K13).
 */
export async function extraOutputChildren(
  ctx: QueryCtx,
  main: Doc<"generationJobs">,
  derivation: ExtraOutputDerivation = "sloj",
): Promise<Doc<"generationJobs">[]> {
  const rootJobId = main.rootJobId ?? main._id;
  const tree = await ctx.db
    .query("generationJobs")
    .withIndex("by_root_created", (q) => q.eq("rootJobId", rootJobId))
    .take(VERSION_TREE_MAX_NODES);
  return tree.filter((job) => job.parentJobId === main._id && job.derivation === derivation);
}

const layerChildren = (ctx: QueryCtx, main: Doc<"generationJobs">) => extraOutputChildren(ctx, main, "sloj");

/**
 * Upis jednog dodatnog izlaza (`studioActions.persistOutput`): sloj razlaganja
 * ili varijacija (K13, `num_images`), po ulaznom režimu glavnog posla.
 * Idempotentno po rednom broju (`layerNumber` = redni broj izlaza, od 2):
 * ponovljen upis istog broja vraća `false`, pa akcija briše suvišan fajl.
 */
export const insertExtraOutput = internalMutation({
  args: {
    parentJobId: v.id("generationJobs"),
    layerNumber: v.number(),
    storageId: v.id("_storage"),
    mimeType: v.optional(v.string()),
    byteSize: v.number(),
  },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get("generationJobs", args.parentJobId);
    if (!parent || parent.status !== "done" || !parent.outputStorageId) return false;
    if (!Number.isInteger(args.layerNumber) || args.layerNumber < 2 || args.layerNumber > LAYER_COUNT_RANGE.max) return false;
    const kind = extraOutputKind(parent);
    const existing = await extraOutputChildren(ctx, parent, kind.derivation);
    if (existing.some((job) => layerNumberOf(job.params, kind.param) === args.layerNumber)) return false;

    const now = Date.now();
    const mock = isMockRequestId(parent.falRequestId);
    await ctx.db.insert("generationJobs", {
      userId: parent.userId,
      ...(parent.projectId ? { projectId: parent.projectId } : {}),
      modelSlug: parent.modelSlug,
      kind: parent.kind,
      params: layerChildParams(parent.params, args.layerNumber, kind.param),
      ...(parent.searchText ? { searchText: parent.searchText } : {}),
      promptHash: parent.promptHash,
      status: "done",
      // Plaćen je glavni posao (cena po sloju / po slici); dete ne skida kredite i ne ulazi u dnevni zbir.
      creditCost: 0,
      estimatedCostUsd: 0,
      ...(parent.provider ? { provider: parent.provider } : {}),
      ...(parent.inputMode ? { inputMode: parent.inputMode } : {}),
      // DEMO dete nosi sopstvenu mock oznaku (galerija ga prepoznaje kao DEMO); stvarni
      // `falRequestId` roditelja se ne kopira jer ga webhook traži kao jedinstven.
      ...(mock ? { falRequestId: `${MOCK_REQUEST_PREFIX}${parent._id}:${kind.param}${args.layerNumber}` } : {}),
      outputStorageId: args.storageId,
      ...lineageFrom(parent),
      derivation: kind.derivation,
      expiresAt: outputExpiresAt(parent.kind, now),
      createdAt: now,
      completedAt: now,
    });
    return true;
  },
});

/**
 * Slojevi jednog razlaganja za editor, odozdo nagore. Prima glavni posao ili
 * bilo koji njegov sloj. `null` za tuđ rad i za rad koji nije razlaganje.
 */
export const getLayers = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId || !isLayerizeJob(job)) return null;
    const main: Doc<"generationJobs"> | null =
      job.derivation === "sloj" && job.parentJobId ? await ctx.db.get("generationJobs", job.parentJobId) : job;
    if (!main || main.userId !== userId || !isLayerizeJob(main)) return null;

    const children = main.status === "done" ? await layerChildren(ctx, main) : [];
    const entries = await Promise.all(
      [main, ...children].map(async (layer) => ({
        jobId: layer._id as Id<"generationJobs">,
        number: layer._id === main._id ? 1 : layerNumberOf(layer.params),
        url: layer.outputStorageId ? await ctx.storage.getUrl(layer.outputStorageId) : null,
        createdAt: layer.createdAt,
      })),
    );
    const requested = parseParams(main.params)?.layers;
    return {
      mainJobId: main._id,
      status: main.status,
      error: main.error ?? null,
      requested: typeof requested === "number" ? requested : null,
      isMock: isMockRequestId(main.falRequestId),
      layers: orderLayers(entries).filter((layer) => layer.url !== null),
    };
  },
});

/**
 * Trake jednog razdvajanja (Crea K23, A18): glas je izlaz posla, a bubanj, bas i
 * ostalo su njegova deca (`derivation: "traka"`, broj u `params.traka`). Prima
 * glavni posao ili bilo koju njegovu traku. `null` za tuđ rad i za rad koji nije
 * razdvajanje.
 */
export const getStems = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId || job.modelSlug !== STEMS_MODEL_SLUG) return null;
    const main: Doc<"generationJobs"> | null =
      job.derivation === "traka" && job.parentJobId ? await ctx.db.get("generationJobs", job.parentJobId) : job;
    if (!main || main.userId !== userId || main.modelSlug !== STEMS_MODEL_SLUG) return null;

    const children = main.status === "done" ? await extraOutputChildren(ctx, main, "traka") : [];
    const tracks: Array<{ key: StemKey; jobId: Id<"generationJobs">; url: string }> = [];
    for (const entry of [main, ...children]) {
      const number = entry._id === main._id ? 1 : layerNumberOf(entry.params, STEM_PARAM);
      const key = STEM_KEYS[number - 1];
      const url = entry.outputStorageId ? await ctx.storage.getUrl(entry.outputStorageId) : null;
      if (key && url && !tracks.some((track) => track.key === key)) tracks.push({ key, jobId: entry._id, url });
    }
    tracks.sort((a, b) => STEM_KEYS.indexOf(a.key) - STEM_KEYS.indexOf(b.key));
    return {
      mainJobId: main._id,
      status: main.status,
      error: main.error ?? null,
      isMock: isMockRequestId(main.falRequestId),
      tracks,
    };
  },
});
