/**
 * Registar MCP alata (MCP-P1-SKELET, tačka 4): naziv -> {opis, JSON Schema
 * ulaza, opseg, handler}. Ovde živi jedan trivijalan alat (`whoami`) kojim se
 * transport dokazuje kraj-do-kraja; studio alati (MCP-P2-STUDIO) žive u
 * `studioTools.ts` i upisuju se u registar pozivom `registerStudioTools`
 * ispod, bez prepravke `handler.ts`.
 *
 * Handler alata dobija `ToolContext`: ko zove (`principal`, izveden iz API
 * ključa) i Convex `ActionCtx` za `runQuery`/`runMutation`/`scheduler`. Sam
 * ugovor alata i pomoćnici za rezultat žive u `toolDefinition.ts` (list
 * modul), da moduli sa alatima ne bi uvozili registar koji ih uvozi.
 */

import { MCP_SCOPE_READ } from "./apiKey";
import { JSON_RPC_ERROR, McpError, type ToolDescriptor, type ToolProvider } from "./protocol";
import { RATE_LIMIT_ERROR_CODE, rateLimiterForScope } from "./rateLimit";
import { registerStudioTools } from "./studioTools";
import { errorResult, jsonResult, type ToolContext, type ToolDefinition } from "./toolDefinition";

export { errorResult, jsonResult } from "./toolDefinition";
export type { McpPrincipal, ToolContext, ToolDefinition } from "./toolDefinition";

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

// Studio alati (MCP-P2-STUDIO). Poziv, a ne side-effect `import "./studioTools"`
// koji bi sam upisivao u registar: takav modul mora da uveze `toolRegistry`
// odavde, a ESM ciklus pada na neinicijalizovan `const` kod onog modula koji
// se učita drugi. `studioTools.ts` zato uvozi samo `toolDefinition.ts`.
registerStudioTools(toolRegistry);

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

      // Druga granica, po opsegu alata (MCP-P2-STUDIO, tačka 4): transport je
      // ovaj zahtev već ubrojao u 60/min, a write alati imaju svojih 10/min.
      // Isti JSON-RPC kod kao transportni 429 - klijent ima jedan kod za "sačekaj".
      const limiter = rateLimiterForScope(tool.scope);
      if (limiter) {
        const decision = limiter.check(ctx.principal.keyId, Date.now());
        if (!decision.allowed) {
          throw new McpError(RATE_LIMIT_ERROR_CODE, "Rate limit exceeded", {
            retryAfterSeconds: decision.retryAfterSeconds,
          });
        }
      }

      return tool.handler(args, ctx);
    },
  };
}
