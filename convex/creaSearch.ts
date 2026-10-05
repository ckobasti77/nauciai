import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { CLIP_DIMENSIONS, semanticHits } from "../lib/crea-clip";
import { searchQueryText } from "../lib/crea-search-text";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./helpers";
import { toGalleryJob } from "./studio";
import { isMockRequestId } from "./studioCore";

/**
 * Pametna biblioteka (Crea K16, S43, plan K01 §8 K16).
 *
 * 1. Pretraga na srpskom za SVE uređaje: Convex search indeks nad `searchText`
 *    (opis, model/alat, vrsta - normalizovano, `lib/crea-search-text.ts`).
 * 2. Semantička pretraga na računaru sa WebGPU-om: CLIP vektori slika se računaju
 *    na uređaju korisnika i čuvaju ovde (`creaEmbeddings`); upit (srpska rečenica
 *    kroz višejezični CLIP) se traži vektorskim indeksom - samo u akciji, a radovi
 *    se čitaju kroz internu query, redom sličnosti.
 */

const kindValidator = v.union(v.literal("image"), v.literal("video"), v.literal("audio"));
const costValidator = v.union(v.literal("free"), v.literal("paid"));

/** Najviše pogodaka tekstualne pretrage (jedna strana biblioteke, bez straničenja). */
export const SEARCH_RESULTS_MAX = 60;
/** Koliko poslednjih radova se gleda kad se traže slike bez vektora. */
const EMBED_SCAN = 300;
/** Najviše vektora u jednom upisu. */
export const EMBED_BATCH_MAX = 16;
export const CLIP_MODEL_ID = "clip-vit-b32";

type LibraryFilters = {
  projectId?: Id<"studioProjects">;
  modelSlug?: string;
  favorite?: boolean;
  cost?: "free" | "paid";
  createdAfter?: number;
};

const libraryFilterArgs = {
  projectId: v.optional(v.id("studioProjects")),
  modelSlug: v.optional(v.string()),
  favorite: v.optional(v.boolean()),
  cost: v.optional(costValidator),
  createdAfter: v.optional(v.number()),
};

/** Isti filteri kao `studio.listMyJobs`, primenjeni posle pretrage (search indeks filtrira samo korisnika i vrstu). */
function matchesFilters(job: Doc<"generationJobs">, filters: LibraryFilters): boolean {
  if (filters.projectId !== undefined && job.projectId !== filters.projectId) return false;
  if (filters.modelSlug !== undefined && job.modelSlug !== filters.modelSlug) return false;
  if (filters.favorite === true && job.favoriteAt === undefined) return false;
  if (filters.cost === "free" && job.creditCost !== 0) return false;
  if (filters.cost === "paid" && job.creditCost <= 0) return false;
  if (filters.createdAfter !== undefined && job.createdAt < filters.createdAfter) return false;
  return true;
}

/** Tekstualna pretraga radova prijavljenog korisnika; najbolji pogoci prvi. */
export const searchMyJobs = query({
  args: { query: v.string(), kind: v.optional(kindValidator), ...libraryFilterArgs },
  handler: async (ctx, { query: text, kind, ...filters }) => {
    const userId = await requireUserId(ctx);
    const terms = searchQueryText(text);
    if (!terms) return [];
    const rows = await ctx.db
      .query("generationJobs")
      .withSearchIndex("search_searchText", (q) => {
        const base = q.search("searchText", terms).eq("userId", userId);
        return kind ? base.eq("kind", kind) : base;
      })
      .take(SEARCH_RESULTS_MAX);
    return await Promise.all(rows.filter((job) => matchesFilters(job, filters)).map((job) => toGalleryJob(ctx, job)));
  },
});

function isEmbeddable(job: Doc<"generationJobs">): boolean {
  return job.kind === "image" && job.status === "done" && job.outputStorageId !== undefined && !isMockRequestId(job.falRequestId);
}

/**
 * Slike bez vektora među poslednjih `EMBED_SCAN` radova (najnovije prve) - uređaj
 * ih preuzme, izračuna vektor i vrati kroz `saveEmbeddings`. Pretplata se sama
 * osveži posle upisa, pa sledeća tura stiže bez dodatnog poziva.
 */
export const pendingEmbeddings = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = Math.max(1, Math.min(EMBED_BATCH_MAX, Math.floor(args.limit ?? 8)));
    const recent = await ctx.db
      .query("generationJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(EMBED_SCAN);
    const pending: Array<{ jobId: Id<"generationJobs">; url: string }> = [];
    let embedded = 0;
    let total = 0;
    for (const job of recent) {
      if (!isEmbeddable(job)) continue;
      total += 1;
      const existing = await ctx.db
        .query("creaEmbeddings")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .unique();
      if (existing) {
        embedded += 1;
        continue;
      }
      if (pending.length >= limit) continue;
      const url = await ctx.storage.getUrl(job.outputStorageId!);
      if (url) pending.push({ jobId: job._id, url });
    }
    return { pending, embedded, total };
  },
});

/** Upis vektora slika (samo svoji, gotovi radovi; tačno 512 konačnih brojeva). Postojeći vektor se zameni. */
export const saveEmbeddings = mutation({
  args: { items: v.array(v.object({ jobId: v.id("generationJobs"), embedding: v.array(v.float64()) })) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.items.length > EMBED_BATCH_MAX) throw new Error("PREVISE_STAVKI");
    let saved = 0;
    for (const item of args.items) {
      if (item.embedding.length !== CLIP_DIMENSIONS || !item.embedding.every(Number.isFinite)) throw new Error("NEISPRAVAN_VEKTOR");
      const job = await ctx.db.get("generationJobs", item.jobId);
      if (!job || job.userId !== userId || !isEmbeddable(job)) continue;
      const existing = await ctx.db
        .query("creaEmbeddings")
        .withIndex("by_job", (q) => q.eq("jobId", item.jobId))
        .unique();
      if (existing) await ctx.db.patch("creaEmbeddings", existing._id, { embedding: item.embedding, model: CLIP_MODEL_ID });
      else await ctx.db.insert("creaEmbeddings", { userId, jobId: item.jobId, model: CLIP_MODEL_ID, embedding: item.embedding });
      saved += 1;
    }
    return { saved };
  },
});

/** Pogoci vektorske pretrage → radovi (redom sličnosti), samo vlasnikovi i samo tražene vrste/filtera. */
export const hydrateHits = internalQuery({
  args: {
    userId: v.id("users"),
    hits: v.array(v.object({ id: v.id("creaEmbeddings"), score: v.number() })),
    ...libraryFilterArgs,
  },
  handler: async (ctx, { userId, hits, ...filters }) => {
    const out = [];
    for (const hit of hits) {
      const row = await ctx.db.get("creaEmbeddings", hit.id);
      if (!row || row.userId !== userId) continue;
      const job = await ctx.db.get("generationJobs", row.jobId);
      if (!job || job.userId !== userId || !matchesFilters(job, filters)) continue;
      out.push({ ...(await toGalleryJob(ctx, job)), score: hit.score });
    }
    return out;
  },
});

/**
 * Semantička pretraga: vektor upita (srpski tekst kroz višejezični CLIP, računat na
 * uređaju) → najsličnije slike korisnika. `semanticHits` odseca slabe pogotke.
 */
export const semanticSearch = action({
  args: { embedding: v.array(v.float64()), ...libraryFilterArgs },
  handler: async (ctx, { embedding, ...filters }): Promise<Array<Awaited<ReturnType<typeof toGalleryJob>> & { score: number }>> => {
    const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
    if (!userId) throw new Error("Unauthorized");
    if (embedding.length !== CLIP_DIMENSIONS || !embedding.every(Number.isFinite)) throw new Error("NEISPRAVAN_VEKTOR");
    const results = await ctx.vectorSearch("creaEmbeddings", "by_embedding", {
      vector: embedding,
      limit: 64,
      filter: (q) => q.eq("userId", userId),
    });
    const hits = semanticHits(results.map((result) => ({ id: result._id, score: result._score })));
    if (hits.length === 0) return [];
    return await ctx.runQuery(internal.creaSearch.hydrateHits, { userId, hits, ...filters });
  },
});
