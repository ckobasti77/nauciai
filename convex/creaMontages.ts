import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  cleanMontageTitle,
  jobUsableInMontage,
  MONTAGE_LIMITS,
  parseMontageDoc,
  type MontageRejectReason,
} from "./creaMontagesCore";
import { requireUserId } from "./helpers";
import { requireStudioAccess } from "./studio";
import { isMockRequestId } from "./studioCore";

/**
 * Projekti montaže (Crea K19, V24; plan K17-6 i §2.3). Nacrt je na uređaju
 * (IndexedDB), a ovde se čuva tek na „Sačuvaj projekat": dokument vremenske
 * linije sa REFERENCAMA na radove iz galerije - nikad kopija medija.
 *
 * Kapije su iste kao kod brend kita (K15): čitanje traži prijavu, upis i
 * `requireStudioAccess`. Svaki rad iz dokumenta mora biti korisnikov, gotov i
 * pravi (ne DEMO), i baš one vrste kako ga montaža koristi.
 */

const montageOrigin = v.union(
  v.literal("rucno"),
  v.literal("strip"),
  v.literal("objasnjenje"),
  v.literal("reklama"),
  v.literal("ritam"),
  v.literal("shorts"),
);

export type MontageMedia = Record<string, { url: string | null; kind: Doc<"generationJobs">["kind"]; expired: boolean }>;

/**
 * Potpisane adrese radova za montažu, samo za vlasnika. Rad kojem je istekao
 * fajl (30 dana za video) ili koji je obrisan vraća `expired: true` - montaža
 * tada pokazuje „klip je istekao" sa „Ukloni".
 */
async function mediaForJobs(ctx: QueryCtx, userId: Id<"users">, rawIds: readonly string[]): Promise<MontageMedia> {
  const media: MontageMedia = {};
  for (const rawId of rawIds.slice(0, MONTAGE_LIMITS.jobIds)) {
    const jobId = ctx.db.normalizeId("generationJobs", rawId);
    const job = jobId ? await ctx.db.get("generationJobs", jobId) : null;
    if (!job || job.userId !== userId) {
      media[rawId] = { url: null, kind: "video", expired: true };
      continue;
    }
    const url = job.outputStorageId ? await ctx.storage.getUrl(job.outputStorageId) : null;
    media[rawId] = { url, kind: job.kind, expired: url === null };
  }
  return media;
}

/** Moji projekti, najnoviji prvi - bez dokumenta (spisak ostaje mali). */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("creaMontages")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MONTAGE_LIMITS.perUser);
    return rows.map((row) => ({
      _id: row._id,
      title: row.title,
      durationS: row.durationS,
      origin: row.origin,
      updatedAt: row.updatedAt,
      ...(row.projectId ? { projectId: row.projectId } : {}),
      ...(row.lastExportJobId ? { lastExportJobId: row.lastExportJobId } : {}),
    }));
  },
});

/** Jedan projekat sa dokumentom i adresama radova; tuđ ili nepostojeći = `null`. */
export const getMontage = query({
  args: { id: v.id("creaMontages") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("creaMontages", args.id);
    if (!row || row.userId !== userId) return null;
    return {
      _id: row._id,
      title: row.title,
      doc: row.doc,
      origin: row.origin,
      durationS: row.durationS,
      updatedAt: row.updatedAt,
      ...(row.projectId ? { projectId: row.projectId } : {}),
      ...(row.lastExportJobId ? { lastExportJobId: row.lastExportJobId } : {}),
      media: await mediaForJobs(ctx, userId, row.jobIds),
    };
  },
});

/** Adrese radova za nacrt sa uređaja (nacrt nije sačuvan na serveru, a radove poznaje po id-ju). */
export const resolveMedia = query({
  args: { jobIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return mediaForJobs(ctx, userId, [...new Set(args.jobIds)]);
  },
});

/**
 * Sačuvaj nov projekat (`id` izostavljen) ili izmeni postojeći. Loš dokument,
 * tuđ / DEMO / nezavršen rad i limit od 50 projekata vraćaju `{ ok: false }`
 * (ništa nije upisano).
 */
export const saveMontage = mutation({
  args: {
    id: v.optional(v.id("creaMontages")),
    title: v.string(),
    doc: v.string(),
    projectId: v.optional(v.id("studioProjects")),
    origin: montageOrigin,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; id: Id<"creaMontages"> } | { ok: false; reason: MontageRejectReason }> => {
    const { userId } = await requireStudioAccess(ctx);
    const parsed = parseMontageDoc(args.doc);
    if (!parsed.ok) return parsed;
    const { montage } = parsed;

    const jobIds: Id<"generationJobs">[] = [];
    for (const rawId of montage.jobIds) {
      const jobId = ctx.db.normalizeId("generationJobs", rawId);
      const job = jobId ? await ctx.db.get("generationJobs", jobId) : null;
      const usable = jobUsableInMontage(
        job ? { userId: job.userId, status: job.status, kind: job.kind, isMock: isMockRequestId(job.falRequestId) } : null,
        userId,
        montage.needs.get(rawId) ?? new Set(),
      );
      if (!usable || !jobId) return { ok: false, reason: "RAD_NIJE_DOSTUPAN" };
      jobIds.push(jobId);
    }
    if (args.projectId) {
      const project = await ctx.db.get("studioProjects", args.projectId);
      if (!project || project.userId !== userId || project.archivedAt !== undefined) return { ok: false, reason: "PROJEKAT_NIJE_DOSTUPAN" };
    }

    const now = Date.now();
    const fields = {
      title: cleanMontageTitle(args.title),
      doc: JSON.stringify(montage.timeline),
      jobIds,
      durationS: montage.durationS,
      origin: args.origin,
      updatedAt: now,
      ...(args.projectId ? { projectId: args.projectId } : {}),
    };
    if (args.id) {
      const existing = await ctx.db.get("creaMontages", args.id);
      if (!existing || existing.userId !== userId) return { ok: false, reason: "PROJEKAT_NIJE_DOSTUPAN" };
      await ctx.db.patch("creaMontages", args.id, fields);
      return { ok: true, id: args.id };
    }
    const mine = await ctx.db
      .query("creaMontages")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .take(MONTAGE_LIMITS.perUser);
    if (mine.length >= MONTAGE_LIMITS.perUser) return { ok: false, reason: "LIMIT_PROJEKATA" };
    const id = await ctx.db.insert("creaMontages", { userId, ...fields, createdAt: now });
    return { ok: true, id };
  },
});

/** Zapamti poslednji izvoz projekta (rad u galeriji, napravljen montažom). */
export const markExported = mutation({
  args: { id: v.id("creaMontages"), jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const { userId } = await requireStudioAccess(ctx);
    const row = await ctx.db.get("creaMontages", args.id);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!row || row.userId !== userId || !job || job.userId !== userId) return { ok: false as const };
    await ctx.db.patch("creaMontages", args.id, { lastExportJobId: args.jobId });
    return { ok: true as const };
  },
});

/** Briše SAMO projekat - radovi u galeriji ostaju netaknuti. */
export const deleteMontage = mutation({
  args: { id: v.id("creaMontages") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("creaMontages", args.id);
    if (!row || row.userId !== userId) return { ok: false as const };
    await ctx.db.delete("creaMontages", args.id);
    return { ok: true as const };
  },
});
