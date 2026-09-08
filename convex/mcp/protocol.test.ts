import { expect, test, vi } from "vitest";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  DEFAULT_PROTOCOL_VERSION,
  handleMcpRequest,
  httpStatusFor,
  JSON_RPC_ERROR,
  type JsonRpcResponse,
  type McpServerOptions,
} from "./protocol";
import { bindTools, type McpPrincipal } from "./tools";

const principal: McpPrincipal = {
  keyId: "key_1" as Id<"mcpApiKeys">,
  userId: "user_1" as Id<"users">,
  email: "jovan@example.com",
  keyName: "Claude Desktop",
  scopes: ["mcp:read"],
};

// Protokolski sloj nema Convex zavisnosti, a `whoami` ne dira ctx - prazan je dovoljan.
const convex = {} as ActionCtx;

function options(overrides: Partial<McpServerOptions> = {}): McpServerOptions {
  return {
    serverInfo: { name: "nauciai", version: "0.1.0" },
    tools: bindTools({ principal, convex }),
    ...overrides,
  };
}

function request(method: string, params?: unknown, id: string | number = 1) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
}

async function single(body: string, opts = options()): Promise<JsonRpcResponse> {
  const result = await handleMcpRequest(body, opts);
  if (result === null || Array.isArray(result)) throw new Error("očekivan jedan odgovor");

  return result;
}

function errorOf(response: JsonRpcResponse) {
  if (!("error" in response)) throw new Error("očekivana greška");

  return response.error;
}

function resultOf(response: JsonRpcResponse) {
  if (!("result" in response)) throw new Error("očekivan rezultat");

  return response.result as Record<string, unknown>;
}

// ── initialize ─────────────────────────────────────────────────────────────

test("initialize vraća traženu verziju kad je podržana, inače podrazumevanu", async () => {
  const echoed = resultOf(await single(request("initialize", { protocolVersion: "2025-03-26" })));
  expect(echoed.protocolVersion).toBe("2025-03-26");
  expect(echoed.capabilities).toEqual({ tools: {} });
  expect(echoed.serverInfo).toEqual({ name: "nauciai", version: "0.1.0" });

  const unknown = resultOf(await single(request("initialize", { protocolVersion: "1999-01-01" })));
  expect(unknown.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);

  const missing = resultOf(await single(request("initialize")));
  expect(missing.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);
});

test("notifications/initialized nema odgovor -> null -> HTTP 202", async () => {
  const result = await handleMcpRequest(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    options(),
  );
  expect(result).toBeNull();
  expect(httpStatusFor(result)).toBe(202);
});

test("ping vraća prazan objekat", async () => {
  expect(resultOf(await single(request("ping", undefined, "p-1")))).toEqual({});
});

// ── tools/list ─────────────────────────────────────────────────────────────

test("tools/list vraća whoami i studio alate sa validnom JSON Schema", async () => {
  const { tools } = resultOf(await single(request("tools/list"))) as {
    tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  };

  // P1 je imao samo `whoami`; P2 (MCP-P2-STUDIO) dodaje šest studio alata.
  expect(tools.map((tool) => tool.name)).toEqual([
    "whoami",
    "list_models",
    "get_studio_state",
    "list_projects",
    "create_generation",
    "get_job",
    "list_my_jobs",
  ]);
  for (const tool of tools) {
    expect(typeof tool.name).toBe("string");
    expect(tool.description.length).toBeGreaterThan(0);
    expect(tool.inputSchema.type).toBe("object");
    expect(typeof tool.inputSchema.properties).toBe("object");
    expect(tool.inputSchema.additionalProperties).toBe(false);
  }
});

// ── tools/call ─────────────────────────────────────────────────────────────

test("tools/call whoami vraća userId, email, ime ključa i opsege", async () => {
  const result = resultOf(await single(request("tools/call", { name: "whoami", arguments: {} }))) as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };

  expect(result.isError).toBeUndefined();
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  expect(JSON.parse(result.content[0].text)).toEqual({
    userId: "user_1",
    email: "jovan@example.com",
    keyName: "Claude Desktop",
    scopes: ["mcp:read"],
  });
});

test("tools/call bez `arguments` radi kao sa praznim objektom", async () => {
  const result = resultOf(await single(request("tools/call", { name: "whoami" }))) as { isError?: boolean };
  expect(result.isError).toBeUndefined();
});

test("nepoznat alat -> -32601, ne interna greška", async () => {
  const error = errorOf(await single(request("tools/call", { name: "nema_takvog", arguments: {} })));
  expect(error.code).toBe(JSON_RPC_ERROR.METHOD_NOT_FOUND);
});

test("ime alata koje postoji na prototipu objekta NIJE alat", async () => {
  const error = errorOf(await single(request("tools/call", { name: "constructor" })));
  expect(error.code).toBe(JSON_RPC_ERROR.METHOD_NOT_FOUND);
});

test("tools/call bez imena ili sa `arguments` koji nije objekat -> -32602", async () => {
  expect(errorOf(await single(request("tools/call", {}))).code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
  expect(errorOf(await single(request("tools/call", { name: "whoami", arguments: [1] }))).code).toBe(
    JSON_RPC_ERROR.INVALID_PARAMS,
  );
});

test("ključ bez traženog opsega dobija isError rezultat, ne protokolsku grešku", async () => {
  const opts = options({ tools: bindTools({ principal: { ...principal, scopes: [] }, convex }) });
  const result = resultOf(await single(request("tools/call", { name: "whoami" }), opts)) as {
    isError?: boolean;
    content: Array<{ text: string }>;
  };

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("mcp:read");
});

test("neočekivana greška alata -> -32603 sa generičkom porukom, detalji samo u onError", async () => {
  const onError = vi.fn();
  const opts = options({
    tools: {
      list: () => [],
      call: async () => {
        throw new Error("tajni detalj iz baze");
      },
    },
    onError,
  });

  const error = errorOf(await single(request("tools/call", { name: "whoami" }), opts));
  expect(error.code).toBe(JSON_RPC_ERROR.INTERNAL_ERROR);
  expect(error.message).toBe("Internal error");
  expect(JSON.stringify(error)).not.toContain("tajni detalj");
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
});

// ── JSON-RPC greške ────────────────────────────────────────────────────────

test("nepoznata metoda -> -32601", async () => {
  const response = await single(request("resources/list", undefined, 7));
  expect(response.id).toBe(7);
  expect(errorOf(response).code).toBe(JSON_RPC_ERROR.METHOD_NOT_FOUND);
});

test("loš JSON -> -32700 sa id null -> HTTP 400", async () => {
  const response = await single("{ nije json");
  expect(response.id).toBeNull();
  expect(errorOf(response).code).toBe(JSON_RPC_ERROR.PARSE_ERROR);
  expect(httpStatusFor(response)).toBe(400);
});

test("neispravan zahtev (pogrešna verzija, bez metode, nije objekat) -> -32600", async () => {
  expect(errorOf(await single(JSON.stringify({ jsonrpc: "1.0", id: 1, method: "ping" }))).code).toBe(
    JSON_RPC_ERROR.INVALID_REQUEST,
  );
  expect(errorOf(await single(JSON.stringify({ jsonrpc: "2.0", id: 1 }))).code).toBe(JSON_RPC_ERROR.INVALID_REQUEST);
  expect(errorOf(await single("42")).code).toBe(JSON_RPC_ERROR.INVALID_REQUEST);
  expect(errorOf(await single(JSON.stringify({ jsonrpc: "2.0", id: { nested: true }, method: "ping" }))).code).toBe(
    JSON_RPC_ERROR.INVALID_REQUEST,
  );
});

// ── batch ──────────────────────────────────────────────────────────────────

test("batch od 3 zahteva vraća 3 odgovora sa istim id-jevima", async () => {
  const body = `[${request("ping", undefined, "a")},${request("tools/list", undefined, 2)},${request("nema", undefined, 3)}]`;
  const result = await handleMcpRequest(body, options());

  expect(Array.isArray(result)).toBe(true);
  const responses = result as JsonRpcResponse[];
  expect(responses.map((response) => response.id)).toEqual(["a", 2, 3]);
  expect("result" in responses[0]).toBe(true);
  expect("result" in responses[1]).toBe(true);
  expect(errorOf(responses[2]).code).toBe(JSON_RPC_ERROR.METHOD_NOT_FOUND);
  expect(httpStatusFor(result)).toBe(200);
});

test("notifikacije u batch-u ne daju odgovor; batch samih notifikacija -> null", async () => {
  const notification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
  const mixed = (await handleMcpRequest(`[${notification},${request("ping")}]`, options())) as JsonRpcResponse[];
  expect(mixed).toHaveLength(1);
  expect(mixed[0].id).toBe(1);

  expect(await handleMcpRequest(`[${notification}]`, options())).toBeNull();
});

test("prazan batch -> jedan -32600", async () => {
  expect(errorOf(await single("[]")).code).toBe(JSON_RPC_ERROR.INVALID_REQUEST);
});
