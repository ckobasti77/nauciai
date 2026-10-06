import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireUserId } from "./helpers";

/**
 * Tabla Cree (K28, U13): beskonačna tabla (moodboard) jednog korisnika - radovi
 * iz galerije (i okačene reference, koje su lokalni radovi od 0 kr) i beleške.
 * Raspored (x, y, širina) se čuva po korisniku; tuđa tabla se ne vidi i ne pomera.
 * Rad na tabli NIJE kopija: kartica pokazuje izlaz posla, a obrisan rad ostaje
 * prazna kartica dok je korisnik ne skloni.
 */

export const BOARD_LIMITS = { items: 200, noteChars: 400, coord: 100_000, minWidth: 120, maxWidth: 640 } as const;

const clampCoord = (value: number) =>
  Number.isFinite(value) ? Math.round(Math.max(-BOARD_LIMITS.coord, Math.min(BOARD_LIMITS.coord, value))) : 0;
const clampWidth = (value: number) =>
  Number.isFinite(value) ? Math.round(Math.max(BOARD_LIMITS.minWidth, Math.min(BOARD_LIMITS.maxWidth, value))) : 220;

async function ownItem(ctx: MutationCtx, itemId: Id<"creaBoardItems">) {
  const userId = await requireUserId(ctx);
  const item = await ctx.db.get("creaBoardItems", itemId);
  if (!item || item.userId !== userId) throw new Error("NEMA_PRISTUPA");
  return item;
}

async function assertRoom(ctx: MutationCtx, userId: Id<"users">) {
  const items = await ctx.db
    .query("creaBoardItems")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(BOARD_LIMITS.items);
  if (items.length >= BOARD_LIMITS.items) throw new Error("TABLA_PUNA");
}

/** Cela tabla korisnika (najviše 200 stavki) sa potpisanim izlazima radova. */
export const listBoard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const items = await ctx.db
      .query("creaBoardItems")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(BOARD_LIMITS.items);
    return Promise.all(
      items.map(async (item) => {
        const job = item.jobId ? await ctx.db.get("generationJobs", item.jobId) : null;
        const own = job !== null && job.userId === userId;
        return {
          _id: item._id,
          kind: item.kind,
          x: item.x,
          y: item.y,
          w: item.w,
          text: item.text ?? null,
          jobId: item.jobId ?? null,
          mediaKind: own ? job.kind : null,
          outputUrl: own && job.status === "done" && job.outputStorageId ? await ctx.storage.getUrl(job.outputStorageId) : null,
        };
      }),
    );
  },
});

/** Rad iz SVOJE galerije na tablu. Isti rad drugi put samo pomera postojeću karticu. */
export const addWork = mutation({
  args: { jobId: v.id("generationJobs"), x: v.number(), y: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId) throw new Error("IZVOR_NIJE_DOSTUPAN");
    const existing = await ctx.db
      .query("creaBoardItems")
      .withIndex("by_userId_and_jobId", (q) => q.eq("userId", userId).eq("jobId", args.jobId))
      .first();
    if (existing) {
      await ctx.db.patch("creaBoardItems", existing._id, { x: clampCoord(args.x), y: clampCoord(args.y) });
      return existing._id;
    }
    await assertRoom(ctx, userId);
    return ctx.db.insert("creaBoardItems", {
      userId,
      kind: "work",
      jobId: args.jobId,
      x: clampCoord(args.x),
      y: clampCoord(args.y),
      w: 220,
      createdAt: Date.now(),
    });
  },
});

export const addNote = mutation({
  args: { text: v.string(), x: v.number(), y: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertRoom(ctx, userId);
    return ctx.db.insert("creaBoardItems", {
      userId,
      kind: "note",
      text: args.text.slice(0, BOARD_LIMITS.noteChars),
      x: clampCoord(args.x),
      y: clampCoord(args.y),
      w: 200,
      createdAt: Date.now(),
    });
  },
});

/** Raspored: položaj (i širina) jedne stavke. */
export const moveItem = mutation({
  args: { itemId: v.id("creaBoardItems"), x: v.number(), y: v.number(), w: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const item = await ownItem(ctx, args.itemId);
    await ctx.db.patch("creaBoardItems", item._id, {
      x: clampCoord(args.x),
      y: clampCoord(args.y),
      ...(args.w !== undefined ? { w: clampWidth(args.w) } : {}),
    });
    return null;
  },
});

export const updateNote = mutation({
  args: { itemId: v.id("creaBoardItems"), text: v.string() },
  handler: async (ctx, args) => {
    const item = await ownItem(ctx, args.itemId);
    if (item.kind !== "note") throw new Error("NEMA_PRISTUPA");
    await ctx.db.patch("creaBoardItems", item._id, { text: args.text.slice(0, BOARD_LIMITS.noteChars) });
    return null;
  },
});

/** Skida stavku sa table; rad ostaje u galeriji. */
export const removeItem = mutation({
  args: { itemId: v.id("creaBoardItems") },
  handler: async (ctx, args) => {
    const item = await ownItem(ctx, args.itemId);
    await ctx.db.delete("creaBoardItems", item._id);
    return null;
  },
});
