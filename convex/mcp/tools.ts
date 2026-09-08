/**
 * Registar MCP alata (MCP-P1-SKELET, tačka 4): naziv -> {opis, JSON Schema
 * ulaza, opseg, handler}. P1 registruje TAČNO JEDAN alat (`whoami`) da se
 * transport dokaže kraj-do-kraja; studio alati (P2) se dodaju kao novi
 * `toolRegistry.set(...)` unosi, bez prepravke ovog fajla ni `handler.ts`.
 *
 * Handler alata dobija `ToolContext`: ko zove (`principal`, izveden iz API
 * ključa) i Convex `ActionCtx` za `runQuery`/`runMutation`/`scheduler`.
 */

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { MCP_SCOPE_READ } from "./apiKey";
import { JSON_RPC_ERROR, McpError, type ToolDescriptor, type ToolProvider, type ToolResult } from "./protocol";

export type McpPrincipal = {
  keyId: Id<"mcpApiKeys">;
  userId: Id<"users">;
  email: string | null;
  keyName: string;
  scopes: string[];
};

export type ToolContext = {
  principal: McpPrincipal;
  convex: ActionCtx;
};

export type ToolDefinition = {
  description: string;
  /** JSON Schema objekat za `arguments` u `tools/call`. */
  inputSchema: Record<string, unknown>;
  /** Opseg koji ključ mora da nosi da bi pozvao alat. */
  scope: string;
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

/** Tekstualni rezultat sa JSON sadržajem - oblik koji svi alati vraćaju. */
export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

/** Greška alata koju model treba da VIDI (nije protokolska): `isError: true`. */
export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const NO_INPUT_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;

// `Map`, ne običan objekat: `registry["constructor"]` bi na objektu pogodio
// prototip, pa bi nepoznato ime "našlo" alat.
export const toolRegistry = new Map<string, ToolDefinition>();

toolRegistry.set("whoami", {
  description: "Ko je pozivalac: id i email korisnika, ime API ključa i njegovi opsezi.",
  inputSchema: NO_INPUT_SCHEMA,
  scope: MCP_SCOPE_READ,
  handler: async (_input, ctx) => {
    const { userId, email, keyName, scopes } = ctx.principal;

    return jsonResult({ userId, email, keyName, scopes });
  },
});

/** Registar vezan za jednog pozivaoca - oblik koji `protocol.ts` traži. */
export function bindTools(ctx: ToolContext): ToolProvider {
  return {
    list: () =>
      Array.from(toolRegistry, ([name, tool]): ToolDescriptor => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    call: async (name, args) => {
      const tool = toolRegistry.get(name);
      if (!tool) throw new McpError(JSON_RPC_ERROR.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
      if (!ctx.principal.scopes.includes(tool.scope)) {
        return errorResult(`Key is missing scope "${tool.scope}" required by tool "${name}".`);
      }

      return tool.handler(args, ctx);
    },
  };
}
