import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { cleanBrandColors, cleanBrandName, cleanBrandTone, isBrandFont } from "../lib/crea-brand-kit";
import { releaseImages } from "./creaElements";
import { requireUserId } from "./helpers";
import { IMAGE_ACCEPT } from "./providers/modelControls";
import { requireStudioAccess } from "./studio";

/**
 * Brend kit (Crea K15, S38; plan K01 §7.3): jedan po korisniku. Logo je SVOJ
 * prijavljen upload slike koji se pri čuvanju „pinuje" (`studioUploads.pinnedAt`,
 * kao slike Lika, K14) - bez roka, i ni brisanje rada ni noćni cron ga ne diraju.
 * Zamena ili brisanje logoa ga oslobađa istim putem kao element
 * (`creaElements.releaseImages`): fajl koji je ušao u neki rad ostaje uz taj rad.
 *
 * Recept šalje logo kao referentnu sliku kroz POSTOJEĆI `studio.createJob` - upload
 * je ovog korisnika, pa ga `createJob` prima.
 */

async function myKit(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("creaBrandKits")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

/** Moj brend kit (sa potpisanim URL-om logoa) ili `null`. */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const kit = await myKit(ctx, userId);
    if (!kit) return null;
    const logoMeta = kit.logoStorageId ? await ctx.db.system.get("_storage", kit.logoStorageId) : null;
    return {
      name: kit.name,
      colors: kit.colors,
      fonts: { heading: isBrandFont(kit.fonts.heading) ? kit.fonts.heading : "nunito", body: isBrandFont(kit.fonts.body) ? kit.fonts.body : "nunito" },
      tone: kit.tone ?? "",
      logoStorageId: logoMeta ? (kit.logoStorageId as string) : null,
      logoUrl: logoMeta && kit.logoStorageId ? await ctx.storage.getUrl(kit.logoStorageId) : null,
      updatedAt: kit.updatedAt,
    };
  },
});

/**
 * Novi kit ili izmena postojećeg. `logoStorageId: null` briše logo; izostavljen
 * ga ne menja. Ime, boje, fontovi i ton prolaze iste provere kao u UI-ju.
 */
export const saveMine = mutation({
  args: {
    name: v.string(),
    colors: v.array(v.string()),
    fonts: v.object({ heading: v.string(), body: v.string() }),
    tone: v.string(),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStudioAccess(ctx);
    const name = cleanBrandName(args.name);
    if (!name) throw new Error("NEISPRAVNO_IME_BRENDA");
    const colors = cleanBrandColors(args.colors);
    if (!colors) throw new Error("NEISPRAVNE_BOJE_BRENDA");
    if (!isBrandFont(args.fonts.heading) || !isBrandFont(args.fonts.body)) throw new Error("NEISPRAVAN_FONT_BRENDA");
    const tone = cleanBrandTone(args.tone);
    if (tone === null) throw new Error("PREDUG_TON_BRENDA");

    const existing = await myKit(ctx, userId);
    const before = existing?.logoStorageId ?? null;
    const next = args.logoStorageId === undefined ? before : args.logoStorageId;

    const now = Date.now();
    if (next && next !== before) {
      const upload = await ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", next))
        .first();
      // Samo svoj, prijavljen upload slike - ne alias nad izlazom rada (K05) i ne fajl drugog Lika.
      if (!upload || upload.userId !== userId) throw new Error("TUDJI_FAJL");
      if (upload.sourceJobId || !upload.mimeType || !IMAGE_ACCEPT.includes(upload.mimeType)) throw new Error("NEISPRAVAN_LOGO");
      if (upload.pinnedAt !== undefined) throw new Error("SLIKA_ZAUZETA");
      await ctx.db.patch("studioUploads", upload._id, { pinnedAt: now, expiresAt: undefined });
    }

    const fields = {
      name,
      colors,
      fonts: { heading: args.fonts.heading, body: args.fonts.body },
      tone: tone || undefined,
      logoStorageId: next ?? undefined,
      updatedAt: now,
    };
    if (existing) await ctx.db.patch("creaBrandKits", existing._id, fields);
    else await ctx.db.insert("creaBrandKits", { userId, ...fields });

    if (before && before !== next) await releaseImages(ctx, userId, [before]);
    return null;
  },
});

/** Briše kit i oslobađa logo. */
export const deleteMine = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const kit = await myKit(ctx, userId);
    if (!kit) return false;
    await ctx.db.delete("creaBrandKits", kit._id);
    if (kit.logoStorageId) await releaseImages(ctx, userId, [kit.logoStorageId]);
    return true;
  },
});
