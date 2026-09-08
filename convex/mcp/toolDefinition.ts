/**
 * Ugovor jednog MCP alata (MCP-P2-STUDIO): tipovi koje deli registar
 * (`tools.ts`) sa modulima koji alate definišu (`studioTools.ts`), i dva
 * pomoćnika za oblik rezultata. LIST modul bez zavisnosti ka registru -
 * inače bi `tools.ts` i `studioTools.ts` uvozili jedan drugog, a ESM ciklus
 * pada na neinicijalizovan `const` kod onog koji se učita drugi.
 */

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { ToolResult } from "./protocol";

export type McpPrincipal = {
  /**
   * Subjekt prigušivača (rate limit): id API ključa (`mcpApiKeys`) ili, za
   * OAuth, id ODOBRENJA (`oauthAuthCodes`) - ne reda tokena, jer rotacija
   * refresh tokena upisuje nov red u `oauthTokens` i resetovala bi brojače
   * (MCP-P4b, BLOKER 2). Ne tumači se dalje.
   */
  keyId: Id<"mcpApiKeys"> | Id<"oauthAuthCodes">;
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
