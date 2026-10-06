import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { normalizeCamera } from "../lib/crea-camera";
import { normalizePalette, styleById } from "../lib/crea-styles";
import { requireUserId } from "./helpers";
import { requireStudioAccess } from "./studio";

/**
 * „Moji stilovi" (Crea K13, S8; K01 §7.4): sačuvan izbor stila, kamere, palete
 * i sopstvenog dodatka opisu, pod imenom koje korisnik bira. Samo vlasnik ih
 * vidi, osim stila koji podeli sa zajednicom (K27, G11: `creaGallery.setStyleShared`).
 */

export const MY_STYLES_MAX = 30;
export const MY_STYLE_NAME_MAX = 40;
export const MY_STYLE_FRAGMENT_MAX = 300;

const cameraValidator = v.object({ body: v.string(), lens: v.string(), focal: v.number(), aperture: v.string() });

export const listMyStyles = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("creaUserStyles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MY_STYLES_MAX);
    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      styleId: row.styleId ?? null,
      camera: row.camera ?? null,
      palette: row.palette ?? [],
      promptFragment: row.promptFragment,
      createdAt: row.createdAt,
      // Deljenje sa zajednicom (K27, G11): `null` = privatan.
      shared: row.isPublic ? (row.publicStatus ?? "pending") : null,
      uses: row.uses,
    }));
  },
});

export const saveMyStyle = mutation({
  args: {
    name: v.string(),
    styleId: v.optional(v.string()),
    camera: v.optional(cameraValidator),
    palette: v.optional(v.array(v.string())),
    promptFragment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStudioAccess(ctx);
    const name = args.name.trim().replace(/\s+/g, " ");
    if (name.length === 0 || name.length > MY_STYLE_NAME_MAX) throw new Error("NEISPRAVNO_IME_STILA");
    if (args.styleId !== undefined && !styleById(args.styleId)) throw new Error("NEPOZNAT_STIL");
    const fragment = (args.promptFragment ?? "").trim().replace(/\s+/g, " ");
    if (fragment.length > MY_STYLE_FRAGMENT_MAX) throw new Error("PREDUG_DODATAK_STILA");
    const palette = normalizePalette(args.palette ?? []);
    if (!args.styleId && !args.camera && palette.length === 0 && fragment.length === 0) throw new Error("PRAZAN_STIL");

    const existing = await ctx.db
      .query("creaUserStyles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MY_STYLES_MAX);
    if (existing.length >= MY_STYLES_MAX) throw new Error("PREVISE_STILOVA");

    return await ctx.db.insert("creaUserStyles", {
      userId,
      name,
      ...(args.styleId ? { styleId: args.styleId } : {}),
      ...(args.camera ? { camera: normalizeCamera(args.camera) } : {}),
      ...(palette.length > 0 ? { palette } : {}),
      promptFragment: fragment,
      uses: 0,
      isPublic: false,
      createdAt: Date.now(),
    });
  },
});

export const deleteMyStyle = mutation({
  args: { styleId: v.id("creaUserStyles") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("creaUserStyles", args.styleId);
    if (!row || row.userId !== userId) return false;
    await ctx.db.delete("creaUserStyles", args.styleId);
    return true;
  },
});
