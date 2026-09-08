/**
 * MCP protokolski sloj (MCP-P1-SKELET, tačka 3): JSON-RPC 2.0 parsiranje,
 * validacija i dispatch. NAMERNO bez ijedne Convex zavisnosti - prima sirov
 * tekst tela i "provajdera alata", vraća JSON-RPC odgovor(e). Zato se testira
 * izolovano (`protocol.test.ts`), a transport (`handler.ts`) je tanak omotač.
 *
 * Podržane metode: `initialize`, `notifications/initialized`, `ping`,
 * `tools/list`, `tools/call`. Batch (niz zahteva) radi po JSON-RPC 2.0 spec-u.
 */

export const JSON_RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Verzije MCP spec-a koje server razume. Klijentu se VRAĆA verzija koju je
 * tražio ako je na spisku (skup koji P1 koristi - initialize/ping/tools - nije
 * menjan između ovih revizija), inače `DEFAULT_PROTOCOL_VERSION`, koju svaki
 * današnji klijent zna da pregovara naniže.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;
export const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

export type JsonRpcId = string | number | null;

export type JsonRpcErrorShape = { code: number; message: string; data?: unknown };

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: JsonRpcErrorShape };

/** Opis alata kakav ide u `tools/list` - `inputSchema` je JSON Schema objekat. */
export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolContent = { type: "text"; text: string };
export type ToolResult = { content: ToolContent[]; isError?: boolean };

/**
 * Greška koju protokolski sloj prevodi u JSON-RPC `error` sa datim kodom.
 * Sve ostale (neočekivane) greške postaju -32603 sa GENERIČKOM porukom - detalji
 * idu isključivo u `onError` (interni log), nikad klijentu (tačka 6).
 */
export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "McpError";
  }
}

/** Šta protokol traži od registra alata - `call` baca `McpError` za nepoznat alat. */
export type ToolProvider = {
  list(): ToolDescriptor[];
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
};

export type McpServerOptions = {
  serverInfo: { name: string; version: string };
  tools: ToolProvider;
  /** Interni log za neočekivane greške; klijent dobija samo -32603. */
  onError?: (error: unknown) => void;
};

/** Jedan odgovor, niz odgovora (batch) ili `null` kad su sve poruke notifikacije. */
export type McpDispatchResult = JsonRpcResponse | JsonRpcResponse[] | null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || typeof value === "number";
}

function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

function resultResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function negotiateProtocolVersion(requested: unknown): string {
  if (typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)) {
    return requested;
  }

  return DEFAULT_PROTOCOL_VERSION;
}

async function callMethod(
  method: string,
  params: unknown,
  options: McpServerOptions,
): Promise<unknown> {
  switch (method) {
    case "initialize": {
      const requested = isPlainObject(params) ? params.protocolVersion : undefined;

      return {
        protocolVersion: negotiateProtocolVersion(requested),
        capabilities: { tools: {} },
        serverInfo: options.serverInfo,
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: options.tools.list() };
    case "tools/call": {
      if (!isPlainObject(params) || typeof params.name !== "string" || params.name.length === 0) {
        throw new McpError(JSON_RPC_ERROR.INVALID_PARAMS, "Invalid params: `name` is required");
      }
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isPlainObject(args)) {
        throw new McpError(JSON_RPC_ERROR.INVALID_PARAMS, "Invalid params: `arguments` must be an object");
      }

      return options.tools.call(params.name, args);
    }
    default:
      throw new McpError(JSON_RPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}

/** Jedna JSON-RPC poruka -> odgovor, ili `null` za notifikaciju. */
export async function dispatchMessage(message: unknown, options: McpServerOptions): Promise<JsonRpcResponse | null> {
  if (!isPlainObject(message)) {
    return errorResponse(null, JSON_RPC_ERROR.INVALID_REQUEST, "Invalid Request");
  }

  // JSON-RPC 2.0: poruka BEZ `id` člana je notifikacija (`id: null` je i dalje zahtev).
  const isNotification = !("id" in message);
  const id: JsonRpcId = isNotification ? null : isValidId(message.id) ? message.id : null;

  if (message.jsonrpc !== "2.0" || typeof message.method !== "string" || (!isNotification && !isValidId(message.id))) {
    return isNotification ? null : errorResponse(id, JSON_RPC_ERROR.INVALID_REQUEST, "Invalid Request");
  }
  if (message.params !== undefined && !isPlainObject(message.params) && !Array.isArray(message.params)) {
    return isNotification ? null : errorResponse(id, JSON_RPC_ERROR.INVALID_REQUEST, "Invalid Request");
  }

  // Notifikacije (`notifications/initialized`, `notifications/cancelled`, ...) nemaju
  // odgovor - i nepoznate se ćutke preskaču, po spec-u.
  if (isNotification) return null;

  try {
    return resultResponse(id, await callMethod(message.method, message.params, options));
  } catch (error) {
    if (error instanceof McpError) return errorResponse(id, error.code, error.message, error.data);
    options.onError?.(error);

    return errorResponse(id, JSON_RPC_ERROR.INTERNAL_ERROR, "Internal error");
  }
}

/**
 * Sirovo telo HTTP zahteva -> JSON-RPC odgovor(i). Ne baca: loš JSON je -32700,
 * prazan batch -32600, a sve neočekivano -32603 (uz `onError`).
 */
export async function handleMcpRequest(rawBody: string, options: McpServerOptions): Promise<McpDispatchResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return errorResponse(null, JSON_RPC_ERROR.PARSE_ERROR, "Parse error");
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return errorResponse(null, JSON_RPC_ERROR.INVALID_REQUEST, "Invalid Request");

    const responses: JsonRpcResponse[] = [];
    for (const message of parsed) {
      const response = await dispatchMessage(message, options);
      if (response) responses.push(response);
    }

    return responses.length === 0 ? null : responses;
  }

  return dispatchMessage(parsed, options);
}

/** HTTP status za odgovor protokolskog sloja: neispravan zahtev/JSON je 400, sve ostalo 200. */
export function httpStatusFor(result: McpDispatchResult): number {
  if (result === null) return 202;
  if (Array.isArray(result)) return 200;
  if ("error" in result && (result.error.code === JSON_RPC_ERROR.PARSE_ERROR || result.error.code === JSON_RPC_ERROR.INVALID_REQUEST)) {
    return 400;
  }

  return 200;
}
