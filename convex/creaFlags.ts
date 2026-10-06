import { v } from "convex/values";

import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * Flegovi Cree (K01 §6.1) u postojećoj tabeli `platformFlags`. Za SVE važi:
 * **odsutan red = ISKLJUČEN** (isto kao `studio_public`), i nijedan se ne
 * seeduje - pali ih Jovan ručno:
 *
 *   npx convex run creaFlags:setCreaFlag '{"key":"crea_pricing_v2","enabled":true}'
 */
export const CREA_FLAG_KEYS = {
  /** Cene v2: marža po kategoriji (C1, O1). */
  pricingV2: "crea_pricing_v2",
  /** Javna galerija, remiks, dnevni izazov i deljeni stilovi (G8, G3, G11; O6). */
  publicGallery: "crea_public_gallery",
  /** Pošteno „neograničeno" na jeftinim modelima za plan od €24,99 (C8, K28). */
  fairUnlimited: "crea_fair_unlimited",
  /**
   * Besplatno ponavljanje pokvarenog rada (U7, K28). Iza flega od K30 (nalaz
   * K29-09): to je nova politika novca (novo seme = besplatna varijacija), a
   * pravilo runa traži da sve što menja cenu čeka Jovanovu odluku (O1).
   */
  freeRedo: "crea_free_redo",
} as const;

export type CreaFlagKey = (typeof CREA_FLAG_KEYS)[keyof typeof CREA_FLAG_KEYS];

const creaFlagKeyValidator = v.union(
  v.literal(CREA_FLAG_KEYS.pricingV2),
  v.literal(CREA_FLAG_KEYS.publicGallery),
  v.literal(CREA_FLAG_KEYS.fairUnlimited),
  v.literal(CREA_FLAG_KEYS.freeRedo),
);

/** Jedno indeksno čitanje; red koji ne postoji ili nije `enabled: true` je isključen fleg. */
export async function readCreaFlag(ctx: QueryCtx | MutationCtx, key: CreaFlagKey): Promise<boolean> {
  const row = await ctx.db
    .query("platformFlags")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  return row?.enabled === true;
}

/** Samo interno (CLI ili druga Convex funkcija) - nikad iz browsera. */
export const setCreaFlag = internalMutation({
  args: { key: creaFlagKeyValidator, enabled: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (row) await ctx.db.patch(row._id, { enabled: args.enabled });
    else await ctx.db.insert("platformFlags", { key: args.key, enabled: args.enabled });

    return null;
  },
});
