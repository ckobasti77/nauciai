import { v } from "convex/values";

import { internalQuery } from "./_generated/server";

/**
 * Čitanje v4 kataloga (`models`). Namerno odvojeno od `modelCatalog.ts`: stara
 * tabela živi još jedan ciklus (STUDIO-CATALOG-V4 sekcija 1.1), pa dva modula
 * drže dve tabele umesto da jedan grana po tome koja je u igri.
 *
 * Javni upiti (`listModels` sa projekcijom, admin ekran) dolaze sa seed-om
 * kataloga; ovde je samo ono što provajderi traže da bi predali posao.
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
