import { v } from "convex/values";

import { internalQuery, mutation } from "./_generated/server";
import { requireSyncSecret } from "./helpers";
import { STUDIO_MODELS } from "./providers/catalogModels";
import type { StudioModelSeed } from "./providers/modelSeed";

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
