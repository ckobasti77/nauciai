/**
 * HTTP sloj OAuth toka (MCP-P4-OAUTH): metapodaci za otkrivanje (RFC 9728 i
 * RFC 8414), dinamička registracija (RFC 7591) i token endpoint (OAuth 2.1 sa
 * PKCE). Rute su u `convex/http.ts`; funkcije baze u `oauth/server.ts`.
 *
 * Tajne ne napuštaju ovaj sloj u logovima: kod, refresh token i
 * `code_verifier` se ovde hešuju i dalje putuju samo kao heš/izazov, a
 * `logInternal` beleži samo tip i poruku greške - nikad telo zahteva.
 */

import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { sha256Hex } from "../mcp/apiKey";
import { createMemoryRateLimiter } from "../mcp/rateLimit";
import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_PREFIX,
  canonicalResource,
  CODE_CHALLENGE_METHODS_SUPPORTED,
  generateOpaqueSecret,
  GRANT_TYPES_SUPPORTED,
  hasOpaqueFormat,
  isValidCodeVerifier,
  parseClientRegistration,
  REFRESH_TOKEN_PREFIX,
  REGISTER_PATH,
  resourceMatches,
  RESPONSE_TYPES_SUPPORTED,
  s256Challenge,
  SCOPES_SUPPORTED,
  TOKEN_ENDPOINT_AUTH_METHODS_SUPPORTED,
  TOKEN_PATH,
} from "./core";
import { authorizeUrl, issuerOrigin } from "./urls";

const MAX_BODY_BYTES = 16_384;

/**
 * Registracija je javna i bez autentikacije - prigušivač po izolatu, iste
 * prirode kao MCP rate limit (vidi `mcp/rateLimit.ts`): brana protiv
 * bezumnog punjenja tabele, ne tačna brojka.
 */
const registerRateLimiter = createMemoryRateLimiter({ limit: 30, windowMs: 60_000 });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
} as const;

/** Odgovori sa tokenima i greškama se ne keširaju (OAuth 2.1 §3.2.3). */
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;
const METADATA_CACHE = { "Cache-Control": "public, max-age=3600" } as const;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...headers, "Content-Type": "application/json" },
  });
}

function oauthError(status: number, error: string, description: string, headers: Record<string, string> = {}) {
  return json(status, { error, error_description: description }, { ...NO_STORE, ...headers });
}

function logInternal(where: string, error: unknown) {
  const summary = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[oauth] ${where}: ${summary}`);
}

export const oauthPreflight = httpAction(async () => new Response(null, { status: 204, headers: CORS_HEADERS }));

// ── otkrivanje ────────────────────────────────────────────────────────────

/** RFC 9728: ko je autorizacioni server za `/mcp`. Isti dokument na korenu i na `/mcp` putanji. */
export const protectedResourceMetadata = httpAction(async (_ctx, request) => {
  const issuer = issuerOrigin(request);

  return json(
    200,
    {
      resource: canonicalResource(issuer),
      authorization_servers: [issuer],
      scopes_supported: SCOPES_SUPPORTED,
      bearer_methods_supported: ["header"],
      resource_name: "Nauci AI MCP",
    },
    METADATA_CACHE,
  );
});

/** RFC 8414: endpointi i mogućnosti. `authorization_endpoint` je Next stranica na `SITE_URL`. */
export const authorizationServerMetadata = httpAction(async (_ctx, request) => {
  try {
    const issuer = issuerOrigin(request);

    return json(
      200,
      {
        issuer,
        authorization_endpoint: authorizeUrl(),
        token_endpoint: `${issuer}${TOKEN_PATH}`,
        registration_endpoint: `${issuer}${REGISTER_PATH}`,
        response_types_supported: RESPONSE_TYPES_SUPPORTED,
        grant_types_supported: GRANT_TYPES_SUPPORTED,
        code_challenge_methods_supported: CODE_CHALLENGE_METHODS_SUPPORTED,
        token_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS_SUPPORTED,
        scopes_supported: SCOPES_SUPPORTED,
      },
      METADATA_CACHE,
    );
  } catch (error) {
    logInternal("metadata", error);

    return oauthError(500, "server_error", "Internal error");
  }
});

// ── registracija (RFC 7591) ───────────────────────────────────────────────

export const registerEndpoint = httpAction(async (ctx, request) => {
  try {
    const now = Date.now();
    const decision = registerRateLimiter.check("register", now);
    if (!decision.allowed) {
      return oauthError(429, "too_many_requests", "Rate limit exceeded", { "Retry-After": String(decision.retryAfterSeconds) });
    }

    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return oauthError(413, "invalid_client_metadata", "Payload too large");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return oauthError(400, "invalid_client_metadata", "body must be JSON");
    }
    const parsed = parseClientRegistration(body);
    if (!parsed.ok) return oauthError(400, parsed.error, parsed.description);

    const clientId = await ctx.runMutation(internal.oauth.server.registerClient, { ...parsed.registration, now });

    return json(
      201,
      {
        client_id: clientId,
        client_name: parsed.registration.clientName,
        redirect_uris: parsed.registration.redirectUris,
        grant_types: GRANT_TYPES_SUPPORTED,
        response_types: RESPONSE_TYPES_SUPPORTED,
        token_endpoint_auth_method: "none",
        client_id_issued_at: Math.floor(now / 1000),
      },
      NO_STORE,
    );
  } catch (error) {
    logInternal("register", error);

    return oauthError(500, "server_error", "Internal error");
  }
});

// ── token endpoint ────────────────────────────────────────────────────────

/** Telo je `application/x-www-form-urlencoded` (OAuth), a JSON se prihvata radi klijenata koji ga šalju. */
async function parseTokenBody(request: Request): Promise<URLSearchParams | null> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  if (contentType.includes("application/x-www-form-urlencoded")) return new URLSearchParams(text);
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return null;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(body as Record<string, unknown>)) {
      if (typeof value === "string") params.set(name, value);
    }

    return params;
  }

  return null;
}

async function issueTokens() {
  const accessToken = generateOpaqueSecret(ACCESS_TOKEN_PREFIX);
  const refreshToken = generateOpaqueSecret(REFRESH_TOKEN_PREFIX);

  return {
    accessToken,
    refreshToken,
    tokenHash: await sha256Hex(accessToken),
    refreshHash: await sha256Hex(refreshToken),
  };
}

function tokenResponse(issued: { accessToken: string; refreshToken: string }, scopes: string[]) {
  return json(
    200,
    {
      access_token: issued.accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: issued.refreshToken,
      scope: scopes.join(" "),
    },
    NO_STORE,
  );
}

function grantError(error: "invalid_grant" | "invalid_client") {
  return error === "invalid_client"
    ? oauthError(401, "invalid_client", "unknown client")
    : oauthError(400, "invalid_grant", "authorization grant is invalid, expired, revoked or already used");
}

export const tokenEndpoint = httpAction(async (ctx, request) => {
  try {
    const params = await parseTokenBody(request);
    if (!params) return oauthError(400, "invalid_request", "body must be application/x-www-form-urlencoded or JSON");

    const clientId = params.get("client_id")?.trim() ?? "";
    if (clientId === "") return oauthError(400, "invalid_request", "client_id is required");
    const resource = params.get("resource");
    if (resource !== null && !resourceMatches(resource, issuerOrigin(request))) {
      return oauthError(400, "invalid_target", "resource does not identify this MCP server");
    }

    const now = Date.now();
    const grantType = params.get("grant_type");

    if (grantType === "authorization_code") {
      const codeVerifier = params.get("code_verifier") ?? "";
      if (codeVerifier === "") return oauthError(400, "invalid_request", "code_verifier is required (PKCE)");
      if (!isValidCodeVerifier(codeVerifier)) return oauthError(400, "invalid_request", "code_verifier is malformed");
      const redirectUri = params.get("redirect_uri") ?? "";
      if (redirectUri === "") return oauthError(400, "invalid_request", "redirect_uri is required");
      const code = params.get("code") ?? "";
      if (!hasOpaqueFormat(code, AUTH_CODE_PREFIX)) return grantError("invalid_grant");

      const issued = await issueTokens();
      const result = await ctx.runMutation(internal.oauth.server.exchangeAuthorizationCode, {
        codeHash: await sha256Hex(code),
        clientId,
        redirectUri,
        codeChallenge: await s256Challenge(codeVerifier),
        tokenHash: issued.tokenHash,
        refreshHash: issued.refreshHash,
        now,
      });
      if (!result.ok) return grantError(result.error);

      return tokenResponse(issued, result.scopes);
    }

    if (grantType === "refresh_token") {
      const refreshToken = params.get("refresh_token") ?? "";
      if (!hasOpaqueFormat(refreshToken, REFRESH_TOKEN_PREFIX)) return grantError("invalid_grant");

      const issued = await issueTokens();
      const result = await ctx.runMutation(internal.oauth.server.refreshTokens, {
        refreshHash: await sha256Hex(refreshToken),
        clientId,
        newTokenHash: issued.tokenHash,
        newRefreshHash: issued.refreshHash,
        now,
      });
      if (!result.ok) return grantError(result.error);

      return tokenResponse(issued, result.scopes);
    }

    return oauthError(400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
  } catch (error) {
    logInternal("token", error);

    return oauthError(500, "server_error", "Internal error");
  }
});
