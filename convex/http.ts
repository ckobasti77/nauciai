import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { handleFalWebhook } from "./falWebhook";
import { mcpHandler, mcpNoEventStream, mcpPreflight } from "./mcp/handler";
import {
  authorizationServerMetadata,
  oauthPreflight,
  protectedResourceMetadata,
  registerEndpoint,
  tokenEndpoint,
} from "./oauth/http";
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

// OAuth 2.1 za MCP (MCP-P4-OAUTH): otkrivanje (RFC 9728 na korenu I na `/mcp`
// putanji, RFC 8414), dinamička registracija (RFC 7591) i token endpoint. Ekran
// pristanka (`/oauth/authorize`) je Next stranica na `SITE_URL`, ne ruta ovde.
// Convex Auth već drži `/.well-known/openid-configuration` i `jwks.json` - te
// putanje se ne diraju; MCP klijent prvo traži `oauth-authorization-server`.
const oauthRoutes = [
  { path: "/.well-known/oauth-protected-resource", handler: protectedResourceMetadata, method: "GET" as const },
  { path: "/.well-known/oauth-protected-resource/mcp", handler: protectedResourceMetadata, method: "GET" as const },
  { path: "/.well-known/oauth-authorization-server", handler: authorizationServerMetadata, method: "GET" as const },
  { path: "/oauth/register", handler: registerEndpoint, method: "POST" as const },
  { path: "/oauth/token", handler: tokenEndpoint, method: "POST" as const },
];

for (const route of oauthRoutes) {
  http.route(route);
  http.route({ path: route.path, method: "OPTIONS", handler: oauthPreflight });
}

export default http;
