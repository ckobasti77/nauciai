import { v } from "convex/values";

import { internalQuery, mutation, query } from "./_generated/server";
import { getCurrentProfile, requireAdmin } from "./helpers";

const studioModelKind = v.union(v.literal("image"), v.literal("video"), v.literal("audio"));
const modelCatalogBadge = v.union(
  v.literal("preporuceno"),
  v.literal("skupo"),
  v.literal("novo"),
);

// Katalog raste ručno preko admin mutacija i seed-a, ne preko korisničkog
// unosa - bounded scan je dovoljan bez dodatnog indeksa.
const MAX_MODELS = 200;

/**
 * Javan upit: `NEXT_PUBLIC_CONVEX_URL` je po definiciji u browser bundle-u, pa
 * ovo čita bilo ko sa interneta, bez naloga. Zato ide `.map` projekcija, isti
 * obrazac kao `creditPacks.listPacks` - napolje izlazi samo ono što ekran
 * crta. `falEndpoint`, `estimatedCostUsd`, `provider` i `defaultParams` (u
 * kojima je pinovana rezolucija) ostaju unutra: zajedno su kalkulacija marže i
 * spisak poluga koje množe fal račun. Admin ih vidi kroz `listAllModels`, iza
 * provere uloge.
 */
export const listModels = query({
  args: { kind: v.optional(studioModelKind) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("modelCatalog").take(MAX_MODELS);
    return rows
      .filter((model) => model.isEnabled && (!args.kind || model.kind === args.kind))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((model) => ({
        slug: model.slug,
        kind: model.kind,
        labelSr: model.labelSr,
        labelEn: model.labelEn,
        descriptionSr: model.descriptionSr,
        descriptionEn: model.descriptionEn,
        creditCost: model.creditCost,
        badge: model.badge,
        paramSchema: model.paramSchema,
        sortOrder: model.sortOrder,
      }));
  },
});

/**
 * Admin varijanta `listModels`-a: svi modeli, uključujući isključene, jer
 * admin mora da vidi (i ponovo uključi) ono što je sam ugasio. `listModels`
 * ostaje javan i filtriran - ovaj je iza `requireAdmin`.
 */
export const listAllModels = query({
  args: {},
  handler: async (ctx) => {
    // `requireAdmin` (iz `helpers.ts`) upisuje profil (bootstrap) i zato traži
    // pisiv kontekst - ne sme se pozvati iz query-ja. `getCurrentProfile` je
    // isti obrazac koji koristi `contentHierarchy.getAdminHierarchy`.
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") throw new Error("Forbidden");
    const rows = await ctx.db.query("modelCatalog").take(MAX_MODELS);
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const getModelBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("modelCatalog")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const upsertModel = mutation({
  args: {
    slug: v.string(),
    kind: studioModelKind,
    labelSr: v.string(),
    labelEn: v.string(),
    descriptionSr: v.string(),
    descriptionEn: v.string(),
    provider: v.string(),
    falEndpoint: v.string(),
    defaultParams: v.string(),
    paramSchema: v.string(),
    creditCost: v.number(),
    costPerSecond: v.optional(v.number()),
    estimatedCostUsd: v.number(),
    badge: v.optional(modelCatalogBadge),
    isEnabled: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("modelCatalog")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    const patch = { ...args, updatedAt: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert("modelCatalog", patch);
  },
});

export const setModelEnabled = mutation({
  args: { modelId: v.id("modelCatalog"), isEnabled: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const model = await ctx.db.get(args.modelId);
    if (!model) throw new Error("Model nije pronađen.");
    await ctx.db.patch(args.modelId, { isEnabled: args.isEnabled, updatedAt: Date.now() });
    return null;
  },
});

export const setModelCost = mutation({
  args: {
    modelId: v.id("modelCatalog"),
    creditCost: v.number(),
    estimatedCostUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const model = await ctx.db.get(args.modelId);
    if (!model) throw new Error("Model nije pronađen.");
    await ctx.db.patch(args.modelId, {
      creditCost: args.creditCost,
      ...(args.estimatedCostUsd !== undefined ? { estimatedCostUsd: args.estimatedCostUsd } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});
