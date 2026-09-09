/**
 * Javni katalog MCP servera (MCP-P6-JAVNA-STRANA): isti alati, resursi i
 * promptovi koje `tools/list`/`resources/list`/`prompts/list` vraćaju kroz
 * protokol, ali kao JEDNA javna Convex query bez autentikacije - javna strana
 * (`/mcp`) ih prikazuje bez ručnog prepisivanja u JSX. Otkriva SAMO metapodatke
 * (ime, opis, opseg, JSON Schema) - nikad ništa vezano za pozivaoca, jer ovde
 * pozivaoca i nema.
 */

import { query } from "../_generated/server";
import { promptProvider } from "./prompts";
import { RESOURCES, RESOURCE_TEMPLATES } from "./resources";
import { toolRegistry } from "./tools";

export const publicCatalog = query({
  args: {},
  handler: async () => {
    const tools = Array.from(toolRegistry, ([name, tool]) => ({
      name,
      description: tool.description,
      scope: tool.scope,
      inputSchema: tool.inputSchema,
    }));

    return {
      tools,
      resources: RESOURCES,
      resourceTemplates: RESOURCE_TEMPLATES,
      prompts: promptProvider.list(),
    };
  },
});
