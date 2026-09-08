/**
 * Convex funkcije OAuth toka (MCP-P4-OAUTH): registracija klijenta, ekran
 * pristanka (opis zahteva + odobrenje), razmena koda, rotacija refresh
 * tokena, razrešavanje access tokena za `/mcp`, i spisak/opoziv povezanih
 * aplikacija. HTTP omotači žive u `oauth/http.ts`; ovde nema parsiranja tela.
 *
 * Tajne: kod, access i refresh token ulaze ovde ISKLJUČIVO kao sha256 heš
 * (`code_verifier` kao već izračunat S256 izazov) - argument funkcije nikad ne
 * nosi vrednost koja bi bila opasna u logu. Jedini izuzetak je povratna
 * vrednost `approveAuthorization`, koja nosi kod u redirect URL-u (kao što
 * `createKey` vraća pun ključ).
 */

import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireUserId } from "../helpers";
import { sha256Hex, timingSafeEqual } from "../mcp/apiKey";
import { parseAuthorizeParams, type AuthorizeParams, type AuthorizeRequest } from "./authorizeRequest";
import {
  ACCESS_TOKEN_TTL_MS,
  appendRedirectParams,
  AUTH_CODE_PREFIX,
  AUTH_CODE_TTL_MS,
  generateOpaqueSecret,
  REFRESH_TOKEN_TTL_MS,
  resourceMatches,
} from "./core";
import { issuerOriginFromEnv } from "./urls";

const authorizeParamsValidator = v.object({
  client_id: v.optional(v.string()),
  redirect_uri: v.optional(v.string()),
  response_type: v.optional(v.string()),
  scope: v.optional(v.string()),
  state: v.optional(v.string()),
  code_challenge: v.optional(v.string()),
  code_challenge_method: v.optional(v.string()),
  resource: v.optional(v.string()),
});

const grantResultValidator = v.union(
  v.object({ ok: v.literal(true), scopes: v.array(v.string()) }),
  v.object({ ok: v.literal(false), error: v.union(v.literal("invalid_grant"), v.literal("invalid_client")) }),
);

/**
 * Neuspeh autorizacionog zahteva. `redirect` postoji SAMO kad su klijent i
 * `redirect_uri` provereni - tek tada sme da se preusmeri sa `error` (OAuth
 * 2.1, "Open Redirection"); za nepoznat klijent ili neregistrovan URI ekran
 * pokazuje grešku i ne šalje korisnika nikud.
 */
export type AuthorizeFailure = {
  ok: false;
  code: "UNKNOWN_CLIENT" | "REDIRECT_NOT_REGISTERED" | "INVALID_REQUEST";
  redirect: string | null;
};

type ValidatedAuthorize = { ok: true; client: Doc<"oauthClients">; request: AuthorizeRequest } | AuthorizeFailure;

async function findClient(ctx: QueryCtx | MutationCtx, clientId: string): Promise<Doc<"oauthClients"> | null> {
  const normalized = clientId === "" ? null : ctx.db.normalizeId("oauthClients", clientId);

  return normalized ? ctx.db.get(normalized) : null;
}

async function validateAuthorizeRequest(ctx: QueryCtx | MutationCtx, params: AuthorizeParams): Promise<ValidatedAuthorize> {
  const client = await findClient(ctx, params.client_id?.trim() ?? "");
  if (!client) return { ok: false, code: "UNKNOWN_CLIENT", redirect: null };

  const redirectUri = params.redirect_uri ?? "";
  // Znak-za-znak, bez wildcard-a (tačka 3).
  if (!client.redirectUris.includes(redirectUri)) return { ok: false, code: "REDIRECT_NOT_REGISTERED", redirect: null };

  const parsed = parseAuthorizeParams(params);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      redirect: appendRedirectParams(redirectUri, { error: parsed.error, error_description: parsed.description, state: params.state }),
    };
  }

  // RFC 8707: `resource` mora da bude ovaj MCP server. Bez `CONVEX_SITE_URL`-a
  // nema sa čim da se poredi - odbija se glasno, ne preskače.
  if (parsed.request.resource !== undefined) {
    const issuer = issuerOriginFromEnv();
    if (issuer === null || !resourceMatches(parsed.request.resource, issuer)) {
      return {
        ok: false,
        code: "INVALID_REQUEST",
        redirect: appendRedirectParams(redirectUri, {
          error: "invalid_target",
          error_description: "resource does not identify this MCP server",
          state: params.state,
        }),
      };
    }
  }

  return { ok: true, client, request: parsed.request };
}

async function revokeTokensForCode(ctx: MutationCtx, codeId: Id<"oauthAuthCodes">, now: number) {
  const rows = await ctx.db
    .query("oauthTokens")
    .withIndex("by_code", (q) => q.eq("codeId", codeId))
    .take(1000);
  for (const row of rows) {
    if (row.revokedAt === undefined) await ctx.db.patch(row._id, { revokedAt: now });
  }
}

// ── registracija (RFC 7591) ───────────────────────────────────────────────

export const registerClient = internalMutation({
  args: { clientName: v.string(), redirectUris: v.array(v.string()), now: v.number() },
  returns: v.id("oauthClients"),
  handler: async (ctx, args) =>
    ctx.db.insert("oauthClients", { clientName: args.clientName, redirectUris: args.redirectUris, createdAt: args.now }),
});

// ── ekran pristanka ───────────────────────────────────────────────────────

/** Šta ekran pristanka prikazuje: ime klijenta, opsezi, host povratka, ko je prijavljen. */
export const describeAuthorizeRequest = query({
  args: { params: authorizeParamsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const validated = await validateAuthorizeRequest(ctx, args.params);
    if (!validated.ok) return validated;
    const user = await ctx.db.get(userId);

    return {
      ok: true as const,
      clientName: validated.client.clientName,
      scopes: validated.request.scopes,
      redirectHost: new URL(validated.request.redirectUri).host,
      email: user?.email ?? null,
      denyRedirect: appendRedirectParams(validated.request.redirectUri, {
        error: "access_denied",
        state: validated.request.state,
      }),
    };
  },
});

/** Korisnik je kliknuo „Dozvoli": izdaje kod (60 s, jednokratan) i vraća gde da se ode. */
export const approveAuthorization = mutation({
  args: { params: authorizeParamsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const validated = await validateAuthorizeRequest(ctx, args.params);
    if (!validated.ok) return validated;

    const now = Date.now();
    const code = generateOpaqueSecret(AUTH_CODE_PREFIX);
    await ctx.db.insert("oauthAuthCodes", {
      codeHash: await sha256Hex(code),
      clientId: validated.client._id,
      userId,
      scopes: validated.request.scopes,
      codeChallenge: validated.request.codeChallenge,
      redirectUri: validated.request.redirectUri,
      expiresAt: now + AUTH_CODE_TTL_MS,
    });

    return {
      ok: true as const,
      redirect: appendRedirectParams(validated.request.redirectUri, { code, state: validated.request.state }),
    };
  },
});

// ── token endpoint ────────────────────────────────────────────────────────

/**
 * `grant_type=authorization_code`. Sve provere u jednoj transakciji: kod
 * postoji, nije korišćen, nije istekao, isti klijent, isti `redirect_uri`,
 * PKCE izazov se poklapa. Ponovna upotreba koda opoziva sve tokene tog koda
 * (OAuth 2.1 §4.1.2). Iste greške za sve slučajeve - klijent ne saznaje koji.
 */
export const exchangeAuthorizationCode = internalMutation({
  args: {
    codeHash: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    /** S256 izazov izračunat iz `code_verifier` u HTTP sloju. */
    codeChallenge: v.string(),
    tokenHash: v.string(),
    refreshHash: v.string(),
    now: v.number(),
  },
  returns: grantResultValidator,
  handler: async (ctx, args) => {
    const client = await findClient(ctx, args.clientId);
    if (!client) return { ok: false as const, error: "invalid_client" as const };

    const code = await ctx.db
      .query("oauthAuthCodes")
      .withIndex("by_hash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    if (!code || !timingSafeEqual(code.codeHash, args.codeHash)) return { ok: false as const, error: "invalid_grant" as const };
    if (code.usedAt !== undefined) {
      await revokeTokensForCode(ctx, code._id, args.now);

      return { ok: false as const, error: "invalid_grant" as const };
    }
    if (
      code.expiresAt <= args.now ||
      code.clientId !== client._id ||
      code.redirectUri !== args.redirectUri ||
      !timingSafeEqual(code.codeChallenge, args.codeChallenge)
    ) {
      return { ok: false as const, error: "invalid_grant" as const };
    }

    await ctx.db.patch(code._id, { usedAt: args.now });
    await ctx.db.insert("oauthTokens", {
      tokenHash: args.tokenHash,
      refreshHash: args.refreshHash,
      codeId: code._id,
      clientId: client._id,
      userId: code.userId,
      scopes: code.scopes,
      expiresAt: args.now + ACCESS_TOKEN_TTL_MS,
      refreshExpiresAt: args.now + REFRESH_TOKEN_TTL_MS,
      createdAt: args.now,
    });

    return { ok: true as const, scopes: code.scopes };
  },
});

/**
 * `grant_type=refresh_token` sa rotacijom (obavezna za javne klijente): stari
 * red se opoziva, nov nasleđuje `codeId`, opsege i korisnika. Ponovna upotreba
 * već rotiranog refresh tokena znači da ga ima neko ko ne bi smeo - gasi se
 * cela porodica.
 */
export const refreshTokens = internalMutation({
  args: {
    refreshHash: v.string(),
    clientId: v.string(),
    newTokenHash: v.string(),
    newRefreshHash: v.string(),
    now: v.number(),
  },
  returns: grantResultValidator,
  handler: async (ctx, args) => {
    const client = await findClient(ctx, args.clientId);
    if (!client) return { ok: false as const, error: "invalid_client" as const };

    const row = await ctx.db
      .query("oauthTokens")
      .withIndex("by_refresh_hash", (q) => q.eq("refreshHash", args.refreshHash))
      .unique();
    if (!row || !timingSafeEqual(row.refreshHash, args.refreshHash)) return { ok: false as const, error: "invalid_grant" as const };
    if (row.revokedAt !== undefined) {
      await revokeTokensForCode(ctx, row.codeId, args.now);

      return { ok: false as const, error: "invalid_grant" as const };
    }
    if (row.refreshExpiresAt <= args.now || row.clientId !== client._id) {
      return { ok: false as const, error: "invalid_grant" as const };
    }

    await ctx.db.patch(row._id, { revokedAt: args.now });
    await ctx.db.insert("oauthTokens", {
      tokenHash: args.newTokenHash,
      refreshHash: args.newRefreshHash,
      codeId: row.codeId,
      clientId: row.clientId,
      userId: row.userId,
      scopes: row.scopes,
      expiresAt: args.now + ACCESS_TOKEN_TTL_MS,
      refreshExpiresAt: args.now + REFRESH_TOKEN_TTL_MS,
      createdAt: args.now,
    });

    return { ok: true as const, scopes: row.scopes };
  },
});

// ── /mcp: druga grana autentikacije ───────────────────────────────────────

/**
 * Hash access tokena -> ISTI oblik pozivaoca kao `mcpKeys.resolveKey`:
 * `keyId` je id reda tokena (subjekt rate limita), `keyName` je ime klijenta.
 * `null` za nepostojeći, opozvan i istekao token - transport sva tri pretvara
 * u isti 401. `now` dolazi spolja: upit ne sme da čita sat.
 */
export const resolveAccessToken = internalQuery({
  args: { tokenHash: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("oauthTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!row || !timingSafeEqual(row.tokenHash, args.tokenHash) || row.revokedAt !== undefined || row.expiresAt <= args.now) {
      return null;
    }
    const [user, client] = await Promise.all([ctx.db.get(row.userId), ctx.db.get(row.clientId)]);
    if (!user || !client) return null;

    return {
      keyId: row._id,
      userId: row.userId,
      email: user.email ?? null,
      keyName: client.clientName,
      scopes: row.scopes,
      lastUsedAt: row.lastUsedAt ?? null,
    };
  },
});

export const touchLastUsed = internalMutation({
  args: { tokenId: v.id("oauthTokens"), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenId);
    if (row && row.revokedAt === undefined) await ctx.db.patch(args.tokenId, { lastUsedAt: args.now });

    return null;
  },
});

// ── povezane aplikacije (UI) ──────────────────────────────────────────────

/**
 * Jedan red po klijentu: važeći (neopozvan, refresh nije istekao) tokeni
 * korisnika grupisani po `clientId`. „Povezano" je trenutak prvog odobrenja
 * (kod), ne poslednje rotacije. `now` šalje klijent (upit ne čita sat).
 */
export const listMyConnections = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("oauthTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);

    type Group = { scopes: string[]; codeIds: Set<Id<"oauthAuthCodes">>; lastUsedAt: number | null; createdAt: number };
    const groups = new Map<Id<"oauthClients">, Group>();
    for (const row of rows) {
      if (row.revokedAt !== undefined || row.refreshExpiresAt <= args.now) continue;
      // Redovi stižu od najnovijeg: prvi viđen nosi aktuelne opsege.
      const group = groups.get(row.clientId) ?? { scopes: row.scopes, codeIds: new Set(), lastUsedAt: null, createdAt: row.createdAt };
      group.codeIds.add(row.codeId);
      group.createdAt = Math.min(group.createdAt, row.createdAt);
      if (row.lastUsedAt !== undefined && (group.lastUsedAt === null || row.lastUsedAt > group.lastUsedAt)) {
        group.lastUsedAt = row.lastUsedAt;
      }
      groups.set(row.clientId, group);
    }

    const connections = [];
    for (const [clientId, group] of groups) {
      const client = await ctx.db.get(clientId);
      let connectedAt = group.createdAt;
      for (const codeId of group.codeIds) {
        const code = await ctx.db.get(codeId);
        if (code) connectedAt = Math.min(connectedAt, code._creationTime);
      }
      connections.push({
        clientId,
        clientName: client?.clientName ?? "?",
        scopes: group.scopes,
        connectedAt,
        lastUsedAt: group.lastUsedAt,
      });
    }

    return connections.sort((a, b) => b.connectedAt - a.connectedAt);
  },
});

/** Opoziva sve tokene korisnika za dati klijent; tuđ ili nepoznat klijent nema šta da opozove. */
export const revokeConnection = mutation({
  args: { clientId: v.id("oauthClients") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("oauthTokens")
      .withIndex("by_user_and_client", (q) => q.eq("userId", userId).eq("clientId", args.clientId))
      .take(1000);
    const now = Date.now();
    for (const row of rows) {
      if (row.revokedAt === undefined) await ctx.db.patch(row._id, { revokedAt: now });
    }

    return null;
  },
});
