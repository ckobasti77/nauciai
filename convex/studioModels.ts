import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { getCurrentProfile, requireAdmin, requireSyncSecret, requireUserId } from "./helpers";
import { STUDIO_MODELS } from "./providers/catalogModels";
import type { StudioModelSeed } from "./providers/modelSeed";
import { applyPriceEdit, parsePriceRule } from "./studioPricing";

// Katalog raste kroz seed i admin ekran, ne kroz korisnički unos - ograničeno
// čitanje je dovoljno bez posebnog indeksa, isto kao u `modelCatalog.ts`.
const MAX_MODELS = 200;

/**
 * Čitanje v4 kataloga (`models`). Namerno odvojeno od `modelCatalog.ts`: stara
 * tabela živi još jedan ciklus (STUDIO-CATALOG-V4 sekcija 1.1), pa dva modula
 * drže dve tabele umesto da jedan grana po tome koja je u igri.
 *
 * Javni upiti (`listModels` sa projekcijom, admin ekran) dolaze sa UI-jem
 * kataloga; ovde je samo ono što provajderi traže da bi predali posao, i seed.
 */
export const getModelBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

/**
 * Red kataloga -> red tabele. Sva složena polja idu kao JSON string, isto kao
 * `paramSchema` u staroj tabeli: oblik im se razlikuje po modelu, pa bi Convex
 * validator za uniju svih oblika bio duži od kataloga koji opisuje.
 */
function toRow(seed: StudioModelSeed, now: number) {
  return {
    slug: seed.slug,
    provider: seed.provider,
    kind: seed.kind,
    family: seed.family,
    labelSr: seed.labelSr,
    labelEn: seed.labelEn,
    taglineSr: seed.taglineSr,
    taglineEn: seed.taglineEn,
    descriptionSr: seed.descriptionSr,
    descriptionEn: seed.descriptionEn,
    endpoints: JSON.stringify(seed.endpoints),
    inputModes: JSON.stringify(seed.inputModes),
    inputSpec: JSON.stringify(seed.inputSpec),
    paramSpec: JSON.stringify(seed.paramSpec),
    priceRule: JSON.stringify(seed.priceRule),
    capabilities: JSON.stringify(seed.capabilities),
    sortOrder: seed.sortOrder,
    updatedAt: now,
  };
}

/**
 * Seed celog kataloga v4 (STUDIO-CATALOG-V4 sekcija 8). Idempotentan: model se
 * traži po slugu i patchuje, pa ponovljen seed ne pravi duplikate.
 *
 * **`isEnabled` se postavlja SAMO pri prvom upisu.** Isti razlog zbog kojeg
 * `seedPlatformFlags` ne pali kill switch nazad: ako je Jovan model ugasio iz
 * admin ekrana (kvota, sporan račun, model povučen kod provajdera), ponovno
 * pokretanje seed-a ne sme tiho da ga vrati korisnicima.
 */
export const seedStudioModels = mutation({
  args: { syncSecret: v.string() },
  handler: async (ctx, args) => {
    requireSyncSecret(args.syncSecret);
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const seed of STUDIO_MODELS) {
      const existing = await ctx.db
        .query("models")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .unique();
      const row = toRow(seed, now);

      if (existing) {
        await ctx.db.patch(existing._id, row);
        updated += 1;
      } else {
        await ctx.db.insert("models", { ...row, isEnabled: true });
        inserted += 1;
      }
    }

    return { inserted, updated, total: STUDIO_MODELS.length };
  },
});

/**
 * Katalog za playground i galeriju. Iza prijave, ne javno: `priceRule` nosi
 * NABAVNU cenu (`baseUsd`), a katalog 1.3 traži da se ista funkcija računa i
 * u browseru - dakle pravilo mora do klijenta. Stara javna ruta
 * (`modelCatalog.listModels`) ostaje netaknuta za stranice bez naloga.
 *
 * `endpoints` ne izlazi - to je jedino polje reda koje klijentu ne treba ni za
 * šta, a napolju je spisak ruta kod provajdera.
 */
export const listModels = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const rows = await ctx.db.query("models").take(MAX_MODELS);

    return rows
      .filter((model) => model.isEnabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toClientRow);
  },
});

function toClientRow(model: Doc<"models">) {
  return {
    slug: model.slug,
    provider: model.provider,
    kind: model.kind,
    family: model.family,
    labelSr: model.labelSr,
    labelEn: model.labelEn,
    taglineSr: model.taglineSr,
    taglineEn: model.taglineEn,
    descriptionSr: model.descriptionSr,
    descriptionEn: model.descriptionEn,
    inputModes: model.inputModes,
    inputSpec: model.inputSpec,
    paramSpec: model.paramSpec,
    priceRule: model.priceRule,
    capabilities: model.capabilities,
    ...(model.badge ? { badge: model.badge } : {}),
    sortOrder: model.sortOrder,
  };
}

/**
 * Admin varijanta: i isključeni modeli, jer admin mora da vidi (i vrati) ono
 * što je sam ugasio. `requireAdmin` upisuje profil i zato ne sme iz query-ja -
 * isti obrazac kao `modelCatalog.listAllModels`.
 */
export const listAllModels = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") throw new Error("Forbidden");
    const rows = await ctx.db.query("models").take(MAX_MODELS);

    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const setModelEnabled = mutation({
  args: { modelId: v.id("models"), isEnabled: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const model = await ctx.db.get(args.modelId);
    if (!model) throw new Error("Model nije pronađen.");
    await ctx.db.patch(args.modelId, { isEnabled: args.isEnabled, updatedAt: Date.now() });

    return null;
  },
});

/**
 * Inline izmena nabavne cene (S7). Menja se JEDAN broj u `priceRule`-u, a cena
 * cele porodice varijanti prati - zato se cena nigde ne prepisuje ručno.
 * Pravilo koje cenu čita iz tabele odbija izmenu osnove umesto da je primi i
 * ne primeni (`applyPriceEdit`).
 */
export const setModelPrice = mutation({
  args: {
    modelId: v.id("models"),
    baseUsd: v.optional(v.number()),
    addUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const model = await ctx.db.get(args.modelId);
    if (!model) throw new Error("Model nije pronađen.");

    const rule = parsePriceRule(model.priceRule);
    if (!rule) throw new Error("NEISPRAVNO_PRAVILO");

    const edited = applyPriceEdit(rule, {
      ...(args.baseUsd !== undefined ? { baseUsd: args.baseUsd } : {}),
      ...(args.addUsd !== undefined ? { addUsd: args.addUsd } : {}),
    });
    if (!edited.ok) throw new Error(edited.reason);

    await ctx.db.patch(args.modelId, {
      priceRule: JSON.stringify(edited.rule),
      updatedAt: Date.now(),
    });

    return null;
  },
});
