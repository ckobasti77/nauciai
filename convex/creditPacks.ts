import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getCurrentProfile, requireAdmin } from "./helpers";

const creditPackKind = v.union(v.literal("pack"), v.literal("plan"));
const planTier = v.union(v.literal("basic"), v.literal("premium"));

// Katalog je namerno mali (par planova + par paketa), pa je jedan bounded
// scan + sortiranje u memoriji dovoljno - nema potrebe za dodatnim indeksom.
const MAX_PACKS = 200;

export const listPacks = query({
  args: { kind: v.optional(creditPackKind) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("creditPacks").take(MAX_PACKS);
    return rows
      .filter((pack) => pack.isActive && (!args.kind || pack.kind === args.kind))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((pack) => ({
        _id: pack._id,
        slug: pack.slug,
        titleSr: pack.titleSr,
        titleEn: pack.titleEn,
        priceEurCents: pack.priceEurCents,
        credits: pack.credits,
        bonusPercent: pack.bonusPercent,
        stripePriceId: pack.stripePriceId,
        kind: pack.kind,
        planTier: pack.planTier,
        sortOrder: pack.sortOrder,
      }));
  },
});

/**
 * Admin varijanta `listPacks`-a: svi paketi/planovi, uključujući ugašene, i
 * bez `.map` projekcije - admin uređuje `stripePriceId` koje `listPacks`
 * namerno vraća ali ovde treba puno stanje za upsert nazad.
 */
export const listAllPacks = query({
  args: {},
  handler: async (ctx) => {
    // Vidi napomenu u `modelCatalog.listAllModels`: `requireAdmin` traži
    // pisiv kontekst, pa se u query-ju koristi `getCurrentProfile` direktno.
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") throw new Error("Forbidden");
    const rows = await ctx.db.query("creditPacks").take(MAX_PACKS);
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const getPackBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("creditPacks")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const upsertPack = mutation({
  args: {
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    priceEurCents: v.number(),
    credits: v.number(),
    bonusPercent: v.number(),
    stripePriceId: v.optional(v.string()),
    kind: creditPackKind,
    planTier: v.optional(planTier),
    sortOrder: v.number(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("creditPacks")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert("creditPacks", args);
  },
});

export const setPackActive = mutation({
  args: { packId: v.id("creditPacks"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const pack = await ctx.db.get(args.packId);
    if (!pack) throw new Error("Paket nije pronađen.");
    await ctx.db.patch(args.packId, { isActive: args.isActive });
    return null;
  },
});
