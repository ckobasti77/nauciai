/**
 * API ključevi za MCP server (MCP-P1-SKELET, tačka 2). Pun ključ postoji samo
 * u povratnoj vrednosti `createKey` - baza čuva `sha256` heks i `prefix` za
 * prikaz. Korisnik vidi i gasi isključivo svoje ključeve; `resolveKey` je
 * interni i vraća `null` za nepostojeći I za revokovan ključ (ista poruka,
 * tačka 6), a transport oba pretvara u isti 401.
 */

import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUserId } from "./helpers";
import {
  DEFAULT_KEY_SCOPES,
  generateApiKey,
  keyDisplayPrefix,
  sha256Hex,
  timingSafeEqual,
} from "./mcp/apiKey";

export const MAX_KEY_NAME_LENGTH = 64;

export const createKey = mutation({
  args: { name: v.string() },
  returns: v.object({ keyId: v.id("mcpApiKeys"), key: v.string(), prefix: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = args.name.trim();
    if (name.length === 0 || name.length > MAX_KEY_NAME_LENGTH) throw new Error("NEISPRAVNO_IME");

    const key = generateApiKey();
    const prefix = keyDisplayPrefix(key);
    const keyId = await ctx.db.insert("mcpApiKeys", {
      userId,
      name,
      keyHash: await sha256Hex(key),
      prefix,
      scopes: [...DEFAULT_KEY_SCOPES],
      createdAt: Date.now(),
    });

    // Jedini trenutak u kom pun ključ napušta server.
    return { keyId, key, prefix };
  },
});

export const listMyKeys = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("mcpApiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);

    return rows.map((row) => ({
      keyId: row._id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt ?? null,
      revokedAt: row.revokedAt ?? null,
    }));
  },
});

export const revokeKey = mutation({
  args: { keyId: v.id("mcpApiKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.keyId);
    // Tuđi i nepostojeći ključ daju istu grešku - ne otkriva se da red postoji.
    if (!row || row.userId !== userId) throw new Error("NEMA_PRISTUPA");
    if (row.revokedAt === undefined) await ctx.db.patch(args.keyId, { revokedAt: Date.now() });

    return null;
  },
});

/**
 * Hash -> pozivalac. Indeks `by_hash` nalazi red, a `timingSafeEqual` je
 * odbrana u dubinu: ulaz je sha256 tajne, pa vreme pretrage po indeksu ne
 * govori ništa o samoj tajni, ali poređenje stringa svejedno ne sme da izađe
 * na prvom bajtu.
 */
export const resolveKey = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mcpApiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (!row || !timingSafeEqual(row.keyHash, args.keyHash) || row.revokedAt !== undefined) return null;

    const user = await ctx.db.get(row.userId);
    if (!user) return null;

    return {
      keyId: row._id,
      userId: row.userId,
      email: user.email ?? null,
      keyName: row.name,
      scopes: row.scopes,
      lastUsedAt: row.lastUsedAt ?? null,
    };
  },
});

export const touchLastUsed = internalMutation({
  args: { keyId: v.id("mcpApiKeys"), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.keyId);
    if (row && row.revokedAt === undefined) await ctx.db.patch(args.keyId, { lastUsedAt: args.now });

    return null;
  },
});
