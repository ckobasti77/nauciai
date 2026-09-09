/**
 * MCP transport (MCP-P1-SKELET, tačka 5): Streamable HTTP na `POST /mcp`.
 *
 * Redosled u handleru: Bearer format -> veličina tela -> hash i razrešavanje
 * pozivaoca -> rate limit -> `lastUsedAt` (best-effort) -> protokolski sloj ->
 * JSON ili SSE okvir, prema `Accept` zaglavlju. Server je bez stanja: ne izdaje
 * `Mcp-Session-Id`, a `GET /mcp` je 405 jer nema server-strane SSE struje.
 *
 * Dva kredencijala na istom zaglavlju (MCP-P4-OAUTH): `nai_live_` API ključ
 * (`mcpKeys.resolveKey`, nepromenjen) i `nai_oat_` OAuth access token
 * (`oauth.server.resolveAccessToken`). Oba daju ISTI `principal`, pa ostatak
 * lanca (bindTools, opsezi, rate limit) ne zna kojim putem je pozivalac došao.
 */

import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import { parseBearerCredential, type BearerCredential } from "../oauth/core";
import { protectedResourceMetadataUrl } from "../oauth/urls";
import { MCP_SCOPES, sha256Hex } from "./apiKey";
import { promptProvider } from "./prompts";
import { handleMcpRequest, httpStatusFor, type McpDispatchResult } from "./protocol";
import { mcpRateLimiter } from "./rateLimit";
import { bindResources } from "./resources";
import type { McpPrincipal } from "./toolDefinition";
import { bindTools } from "./tools";

export const MAX_BODY_BYTES = 1_048_576;
/** `lastUsedAt` se osvežava najviše jednom u ovom razmaku - 60 zahteva/min ne treba 60 upisa. */
const LAST_USED_THROTTLE_MS = 60_000;

const SERVER_INFO = { name: "nauciai", version: "0.1.0" } as const;

/** Kodovi iz JSON-RPC opsega za servere (-32000..-32099) - transportne, ne protokolske greške. */
const TRANSPORT_ERROR = {
  UNAUTHORIZED: -32001,
  RATE_LIMITED: -32002,
  PAYLOAD_TOO_LARGE: -32003,
  INTERNAL: -32603,
} as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
} as const;

function transportError(status: number, code: number, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code, message } }), {
    status,
    headers: { ...CORS_HEADERS, ...headers, "Content-Type": "application/json" },
  });
}

/**
 * Jedan te isti odgovor za odsutno, neispravno, nepostojeće i revokovano - bez
 * razloga (tačka 6). `resource_metadata` (RFC 9728) kaže klijentu gde je
 * autorizacioni server, a `scope` koje opsege da traži (MCP-P4-OAUTH).
 */
function unauthorized(request: Request) {
  return transportError(401, TRANSPORT_ERROR.UNAUTHORIZED, "Unauthorized", {
    "WWW-Authenticate": `Bearer realm="nauciai-mcp", resource_metadata="${protectedResourceMetadataUrl(request)}", scope="${MCP_SCOPES.join(" ")}"`,
  });
}

type ResolvedPrincipal = {
  principal: McpPrincipal;
  lastUsedAt: number | null;
  touchLastUsed: () => Promise<null>;
};

/**
 * Kredencijal -> pozivalac. Ključ i OAuth token daju isti oblik; razlikuju se
 * samo tabela u kojoj žive i koji `lastUsedAt` se osvežava. Tajna se hešuje
 * ovde, pa upit dobija samo heš.
 */
async function resolvePrincipal(ctx: ActionCtx, credential: BearerCredential, now: number): Promise<ResolvedPrincipal | null> {
  const hash = await sha256Hex(credential.secret);
  if (credential.kind === "apiKey") {
    const row = await ctx.runQuery(internal.mcpKeys.resolveKey, { keyHash: hash });
    if (!row) return null;
    const { lastUsedAt, ...principal } = row;

    return {
      principal,
      lastUsedAt,
      touchLastUsed: () => ctx.runMutation(internal.mcpKeys.touchLastUsed, { keyId: row.keyId, now }),
    };
  }

  const row = await ctx.runQuery(internal.oauth.server.resolveAccessToken, { tokenHash: hash, now });
  if (!row) return null;
  // `keyId` je id odobrenja (subjekt prigušivača, preživljava rotaciju);
  // `lastUsedAt` se upisuje na konkretan red tokena.
  const { lastUsedAt, tokenId, ...principal } = row;

  return {
    principal,
    lastUsedAt,
    touchLastUsed: () => ctx.runMutation(internal.oauth.server.touchLastUsed, { tokenId, now }),
  };
}

function respond(result: McpDispatchResult, wantsEventStream: boolean) {
  const status = httpStatusFor(result);
  if (result === null) return new Response(null, { status, headers: CORS_HEADERS });

  if (wantsEventStream) {
    const frames = (Array.isArray(result) ? result : [result])
      .map((response) => `event: message\ndata: ${JSON.stringify(response)}\n\n`)
      .join("");

    return new Response(frames, {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  return new Response(JSON.stringify(result), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/**
 * Interni log bez ikakve šanse da nosi ključ: ključ nikad ne ulazi u poruke
 * grešaka (resolve dobija hash), a ovde se svejedno loguje samo tip i poruka.
 */
function logInternal(where: string, error: unknown) {
  const summary = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[mcp] ${where}: ${summary}`);
}

export const mcpPreflight = httpAction(async () => new Response(null, { status: 204, headers: CORS_HEADERS }));

export const mcpNoEventStream = httpAction(
  async () => new Response(null, { status: 405, headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" } }),
);

export const mcpHandler = httpAction(async (ctx, request) => {
  try {
    const credential = parseBearerCredential(request.headers.get("authorization"));
    if (!credential) return unauthorized(request);

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BODY_BYTES) {
      return transportError(413, TRANSPORT_ERROR.PAYLOAD_TOO_LARGE, "Payload too large");
    }
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return transportError(413, TRANSPORT_ERROR.PAYLOAD_TOO_LARGE, "Payload too large");
    }

    const now = Date.now();
    const resolved = await resolvePrincipal(ctx, credential, now);
    if (!resolved) return unauthorized(request);
    const { principal, lastUsedAt, touchLastUsed } = resolved;

    const decision = mcpRateLimiter.check(principal.keyId, now);
    if (!decision.allowed) {
      return transportError(429, TRANSPORT_ERROR.RATE_LIMITED, "Rate limit exceeded", {
        "Retry-After": String(decision.retryAfterSeconds),
      });
    }

    if (lastUsedAt === null || now - lastUsedAt >= LAST_USED_THROTTLE_MS) {
      try {
        await touchLastUsed();
      } catch (error) {
        // Best-effort: statistika upotrebe ne sme da obori zahtev.
        logInternal("lastUsedAt", error);
      }
    }

    // Resursi i promptovi (MCP-P5-PRIMITIVI) dele isti `principal` i isti
    // Convex ctx kao alati - nijedan ne zna kojim putem je pozivalac došao.
    const bound = { principal, convex: ctx };
    const result = await handleMcpRequest(new TextDecoder().decode(body), {
      serverInfo: SERVER_INFO,
      tools: bindTools(bound),
      resources: bindResources(bound),
      prompts: promptProvider,
      onError: (error) => logInternal("dispatch", error),
    });

    return respond(result, (request.headers.get("accept") ?? "").includes("text/event-stream"));
  } catch (error) {
    // Nikad stack trace klijentu (tačka 6) - i Convex-ov 500 bi ga nosio.
    logInternal("handler", error);

    return transportError(500, TRANSPORT_ERROR.INTERNAL, "Internal error");
  }
});
