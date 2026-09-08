import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { handleFalWebhook } from "./falWebhook";
import { mcpHandler, mcpNoEventStream, mcpPreflight } from "./mcp/handler";
import { handleBytePlusWebhook } from "./providers/byteplus";

const http = httpRouter();

auth.addHttpRoutes(http);

// fal webhook živi na Convexu, a ne na Vercelu: fal ne prati redirekcije
// (3xx = trajni neuspeh), a `httpAction` daje sirovo telo bez body parser-a
// (STUDIO-PLAN 4.2).
http.route({
  path: "/fal/webhook",
  method: "POST",
  handler: handleFalWebhook,
});

// BytePlus callback za Seedance (STUDIO-CATALOG-V4 3.4/3.5). Ista putanja prima
// i jednokratni verifikacioni zahtev sa `challenge` poljem i svaku kasniju
// promenu statusa. Poruke NISU potpisane - videti `convex/providers/bytePlusCore.ts`.
http.route({
  path: "/byteplus/webhook",
  method: "POST",
  handler: handleBytePlusWebhook,
});

// MCP server (MCP-P1-SKELET): Streamable HTTP transport, JSON-RPC 2.0, Bearer
// API ključ. Sve živi u `convex/mcp/`; ovde su samo rute. OPTIONS je CORS
// preflight, a GET vraća 405 jer server nema server-stranu SSE struju.
http.route({
  path: "/mcp",
  method: "POST",
  handler: mcpHandler,
});

http.route({
  path: "/mcp",
  method: "OPTIONS",
  handler: mcpPreflight,
});

http.route({
  path: "/mcp",
  method: "GET",
  handler: mcpNoEventStream,
});

export default http;
