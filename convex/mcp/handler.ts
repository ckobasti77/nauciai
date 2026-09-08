/**
 * MCP transport (MCP-P1-SKELET, tačka 5): Streamable HTTP na `POST /mcp`.
 *
 * Redosled u handleru: Bearer format -> veličina tela -> hash i `resolveKey`
 * -> rate limit -> `lastUsedAt` (best-effort) -> protokolski sloj -> JSON ili
 * SSE okvir, prema `Accept` zaglavlju. Server je bez stanja: ne izdaje
 * `Mcp-Session-Id`, a `GET /mcp` je 405 jer nema server-strane SSE struje.
 */

import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { parseBearerKey, sha256Hex } from "./apiKey";
import { handleMcpRequest, httpStatusFor, type McpDispatchResult } from "./protocol";
import { mcpRateLimiter } from "./rateLimit";
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

/** Jedan te isti odgovor za odsutno, neispravno, nepostojeće i revokovano - bez razloga (tačka 6). */
function unauthorized() {
  return transportError(401, TRANSPORT_ERROR.UNAUTHORIZED, "Unauthorized", {
    "WWW-Authenticate": 'Bearer realm="nauciai-mcp"',
  });
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
    const key = parseBearerKey(request.headers.get("authorization"));
    if (!key) return unauthorized();

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_BODY_BYTES) {
      return transportError(413, TRANSPORT_ERROR.PAYLOAD_TOO_LARGE, "Payload too large");
    }
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return transportError(413, TRANSPORT_ERROR.PAYLOAD_TOO_LARGE, "Payload too large");
    }

    const principal = await ctx.runQuery(internal.mcpKeys.resolveKey, { keyHash: await sha256Hex(key) });
    if (!principal) return unauthorized();

    const now = Date.now();
    const decision = mcpRateLimiter.check(principal.keyId, now);
    if (!decision.allowed) {
      return transportError(429, TRANSPORT_ERROR.RATE_LIMITED, "Rate limit exceeded", {
        "Retry-After": String(decision.retryAfterSeconds),
      });
    }

    if (principal.lastUsedAt === null || now - principal.lastUsedAt >= LAST_USED_THROTTLE_MS) {
      try {
        await ctx.runMutation(internal.mcpKeys.touchLastUsed, { keyId: principal.keyId, now });
      } catch (error) {
        // Best-effort: statistika upotrebe ne sme da obori zahtev.
        logInternal("lastUsedAt", error);
      }
    }

    const result = await handleMcpRequest(new TextDecoder().decode(body), {
      serverInfo: SERVER_INFO,
      tools: bindTools({ principal, convex: ctx }),
      onError: (error) => logInternal("tools/call", error),
    });

    return respond(result, (request.headers.get("accept") ?? "").includes("text/event-stream"));
  } catch (error) {
    // Nikad stack trace klijentu (tačka 6) - i Convex-ov 500 bi ga nosio.
    logInternal("handler", error);

    return transportError(500, TRANSPORT_ERROR.INTERNAL, "Internal error");
  }
});
