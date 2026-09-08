/// <reference types="vite/client" />

/**
 * OAuth 2.1 tok za MCP kraj-do-kraja (MCP-P4-OAUTH, tačka 5): metapodaci ->
 * registracija -> ekran pristanka (`describe`/`approve` kao prijavljen
 * korisnik) -> `/oauth/token` sa PKCE -> `/mcp` sa access tokenom -> refresh
 * -> opoziv. HTTP endpointi se gađaju preko `t.fetch`, tačno kako ih klijent
 * vidi. Bearer put (`nai_live_`) ostaje pokriven u `mcpKeys.test.ts`
 * neizmenjen; ovde je samo regresija da još radi pored OAuth grane.
 */

import { convexTest, type TestConvex } from "convex-test";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
  AUTH_CODE_TTL_MS,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_MS,
} from "./core";

// Glob od korena projekta, ne `../**/*.ts`: Vite ključeve fajlova iz ISTOG
// foldera kao test skraćuje na `./server.ts`, pa convex-test (prefiks iz
// putanje `_generated`) ne bi našao `oauth/server` koji `/mcp` handler zove.
const modules = import.meta.glob("/convex/**/*.ts");

type TestConvexWithSchema = TestConvex<typeof schema>;

const ISSUER = "https://example.convex.site";
const APP_ORIGIN = "http://localhost:3000";
const REDIRECT = "http://localhost:6274/callback";
const OTHER_REDIRECT = "http://localhost:6274/other";
const STATE = "st@te/ü&x=1";
// RFC 7636, dodatak B.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const WRONG_VERIFIER = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const previousEnv = { CONVEX_SITE_URL: process.env.CONVEX_SITE_URL, SITE_URL: process.env.SITE_URL };
beforeAll(() => {
  process.env.CONVEX_SITE_URL = ISSUER;
  process.env.SITE_URL = APP_ORIGIN;
});
afterAll(() => {
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** Sat pod kontrolom testa: istek koda (60 s), access (1 h) i refresh (30 d) tokena. */
let clock = Date.now();
beforeEach(() => {
  clock += 600_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function asUser(t: TestConvexWithSchema, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "owner@example.com", name: "Owner" }));

  return { t, userId };
}

function register(t: TestConvexWithSchema, body: unknown) {
  return t.fetch("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function registerClaude(t: TestConvexWithSchema): Promise<string> {
  const response = await register(t, {
    client_name: "Claude Desktop",
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
  expect(response.status).toBe(201);

  return (await response.json()).client_id as string;
}

function authorizeParams(clientId: string, overrides: Record<string, string | undefined> = {}) {
  const params: Record<string, string | undefined> = {
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "mcp:read mcp:write",
    state: STATE,
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: `${ISSUER}/mcp`,
    ...overrides,
  };

  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) as Record<string, string>;
}

async function approve(t: TestConvexWithSchema, userId: Id<"users">, clientId: string) {
  const result = await asUser(t, userId).mutation(api.oauth.server.approveAuthorization, { params: authorizeParams(clientId) });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  const url = new URL(result.redirect);

  return { code: url.searchParams.get("code") ?? "", state: url.searchParams.get("state"), url };
}

function tokenRequest(t: TestConvexWithSchema, form: Record<string, string>) {
  return t.fetch("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
}

function exchange(t: TestConvexWithSchema, clientId: string, code: string, overrides: Record<string, string> = {}) {
  return tokenRequest(t, {
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
    code_verifier: VERIFIER,
    resource: `${ISSUER}/mcp`,
    ...overrides,
  });
}

type Tokens = { access_token: string; refresh_token: string; token_type: string; expires_in: number; scope: string };

async function exchangeOk(t: TestConvexWithSchema, clientId: string, code: string): Promise<Tokens> {
  const response = await exchange(t, clientId, code);
  expect(response.status).toBe(200);

  return response.json();
}

function whoami(t: TestConvexWithSchema, bearer: string | null) {
  return t.fetch("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }),
  });
}

async function whoamiText(t: TestConvexWithSchema, bearer: string): Promise<string> {
  const response = await whoami(t, bearer);
  expect(response.status).toBe(200);

  return (await response.json()).result.content[0].text;
}

/** Ceo srećan put do access tokena - osnova za testove koji kreću odatle. */
async function connect() {
  const { t, userId } = await setup();
  const clientId = await registerClaude(t);
  const { code } = await approve(t, userId, clientId);
  const tokens = await exchangeOk(t, clientId, code);

  return { t, userId, clientId, code, tokens };
}

// ── otkrivanje ─────────────────────────────────────────────────────────────

test("metapodaci: zaštićeni resurs (koren i /mcp) pokazuje na autorizacioni server; AS metapodaci nose PKCE S256 i registraciju", async () => {
  const { t } = await setup();

  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    const response = await t.fetch(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({
      resource: `${ISSUER}/mcp`,
      authorization_servers: [ISSUER],
      scopes_supported: ["mcp:read", "mcp:write"],
      bearer_methods_supported: ["header"],
      resource_name: "Nauci AI MCP",
    });
  }

  const response = await t.fetch("/.well-known/oauth-authorization-server");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    issuer: ISSUER,
    authorization_endpoint: `${APP_ORIGIN}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp:read", "mcp:write"],
  });

  expect((await t.fetch("/oauth/token", { method: "OPTIONS" })).status).toBe(204);
});

test("401 bez tokena nosi WWW-Authenticate sa resource_metadata i scope; nepoznat OAuth token daje isti 401", async () => {
  const { t } = await setup();

  const missing = await whoami(t, null);
  expect(missing.status).toBe(401);
  const header = missing.headers.get("www-authenticate") ?? "";
  expect(header).toContain(`resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"`);
  expect(header).toContain('scope="mcp:read mcp:write"');
  expect(header.startsWith("Bearer ")).toBe(true);

  const unknown = await whoami(t, `${ACCESS_TOKEN_PREFIX}${"A".repeat(43)}`);
  expect(unknown.status).toBe(401);
  expect(await unknown.text()).toBe(await missing.text());
  expect([...unknown.headers.entries()]).toEqual([...missing.headers.entries()]);
});

// ── registracija ───────────────────────────────────────────────────────────

test("registracija: 201 sa client_id za javnog klijenta; loš redirect, bez imena i tajna se odbijaju", async () => {
  const { t } = await setup();

  const response = await register(t, { client_name: "Claude Desktop", redirect_uris: [REDIRECT] });
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body).toMatchObject({
    client_name: "Claude Desktop",
    redirect_uris: [REDIRECT],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(clock / 1000),
  });
  expect(typeof body.client_id).toBe("string");
  expect(body.client_secret).toBeUndefined();
  const row = await t.run((ctx) => ctx.db.get(body.client_id as Id<"oauthClients">));
  expect(row).toMatchObject({ clientName: "Claude Desktop", redirectUris: [REDIRECT] });

  const badRedirect = await register(t, { client_name: "X", redirect_uris: ["http://evil.example/callback"] });
  expect(badRedirect.status).toBe(400);
  expect(await badRedirect.json()).toMatchObject({ error: "invalid_redirect_uri" });

  const noName = await register(t, { redirect_uris: [REDIRECT] });
  expect(noName.status).toBe(400);
  expect(await noName.json()).toMatchObject({ error: "invalid_client_metadata" });

  const secret = await register(t, { client_name: "X", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" });
  expect(secret.status).toBe(400);

  const notJson = await t.fetch("/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  expect(notJson.status).toBe(400);
});

// ── ekran pristanka ────────────────────────────────────────────────────────

test("authorize traži prijavu: describe i approve bez identiteta padaju", async () => {
  const { t } = await setup();
  const clientId = await registerClaude(t);

  await expect(t.query(api.oauth.server.describeAuthorizeRequest, { params: authorizeParams(clientId) })).rejects.toThrow();
  await expect(t.mutation(api.oauth.server.approveAuthorization, { params: authorizeParams(clientId) })).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.query("oauthAuthCodes").take(1))).toEqual([]);
});

test("describe: ime klijenta, opsezi, host povratka, odbijanje sa access_denied i nepromenjenim state", async () => {
  const { t, userId } = await setup();
  const clientId = await registerClaude(t);

  const described = await asUser(t, userId).query(api.oauth.server.describeAuthorizeRequest, { params: authorizeParams(clientId) });
  expect(described.ok).toBe(true);
  if (!described.ok) throw new Error("unreachable");
  expect(described).toMatchObject({
    clientName: "Claude Desktop",
    scopes: ["mcp:read", "mcp:write"],
    redirectHost: "localhost:6274",
    email: "owner@example.com",
  });
  const deny = new URL(described.denyRedirect);
  expect(`${deny.origin}${deny.pathname}`).toBe(REDIRECT);
  expect(deny.searchParams.get("error")).toBe("access_denied");
  expect(deny.searchParams.get("state")).toBe(STATE);
});

test("authorize: nepoznat klijent i neregistrovan redirect_uri ne preusmeravaju; neispravan zahtev vraća error klijentu sa state", async () => {
  const { t, userId } = await setup();
  const clientId = await registerClaude(t);
  const user = asUser(t, userId);
  const describe = (params: Record<string, string>) => user.query(api.oauth.server.describeAuthorizeRequest, { params });

  expect(await describe(authorizeParams("nepostojeci"))).toEqual({ ok: false, code: "UNKNOWN_CLIENT", redirect: null });
  expect(await describe(authorizeParams(clientId, { redirect_uri: OTHER_REDIRECT }))).toEqual({
    ok: false,
    code: "REDIRECT_NOT_REGISTERED",
    redirect: null,
  });

  const cases: Array<[Record<string, string | undefined>, string]> = [
    [{ code_challenge: undefined }, "invalid_request"],
    [{ code_challenge_method: "plain" }, "invalid_request"],
    [{ code_challenge_method: undefined }, "invalid_request"],
    [{ response_type: "token" }, "unsupported_response_type"],
    [{ scope: "mcp:read admin" }, "invalid_scope"],
    [{ resource: "https://other.example/mcp" }, "invalid_target"],
  ];
  for (const [overrides, error] of cases) {
    const result = await describe(authorizeParams(clientId, overrides));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("INVALID_REQUEST");
    const url = new URL(result.redirect ?? "");
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
    expect(url.searchParams.get("error")).toBe(error);
    expect(url.searchParams.get("state")).toBe(STATE);
  }

  // Odbijen zahtev ne izdaje kod ni preko `approve`.
  const approved = await user.mutation(api.oauth.server.approveAuthorization, {
    params: authorizeParams(clientId, { code_challenge_method: "plain" }),
  });
  expect(approved.ok).toBe(false);
  expect(await t.run((ctx) => ctx.db.query("oauthAuthCodes").take(1))).toEqual([]);
});

// ── ceo tok ────────────────────────────────────────────────────────────────

test("ceo tok: odobrenje -> kod + nepromenjen state -> razmena sa PKCE -> tokeni -> /mcp daje ISTI principal kao Bearer ključ", async () => {
  const { t, userId } = await setup();
  const clientId = await registerClaude(t);

  const { code, state, url } = await approve(t, userId, clientId);
  expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
  expect(state).toBe(STATE);
  expect(code.startsWith("nai_oac_")).toBe(true);

  const response = await exchange(t, clientId, code);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const tokens: Tokens = await response.json();
  expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mcp:read mcp:write" });
  expect(tokens.access_token.startsWith(ACCESS_TOKEN_PREFIX)).toBe(true);
  expect(tokens.refresh_token.startsWith(REFRESH_TOKEN_PREFIX)).toBe(true);

  // U bazi samo heševi: ni kod ni tokeni se ne pojavljuju u redovima.
  const rows = await t.run(async (ctx) => ({
    codes: await ctx.db.query("oauthAuthCodes").take(10),
    tokens: await ctx.db.query("oauthTokens").take(10),
  }));
  const dump = JSON.stringify(rows);
  expect(dump).not.toContain(code);
  expect(dump).not.toContain(tokens.access_token);
  expect(dump).not.toContain(tokens.refresh_token);
  expect(dump).not.toContain(VERIFIER);
  expect(rows.codes[0]).toMatchObject({ usedAt: clock, expiresAt: clock + AUTH_CODE_TTL_MS, scopes: ["mcp:read", "mcp:write"] });
  expect(rows.tokens[0]).toMatchObject({
    userId,
    clientId,
    expiresAt: clock + ACCESS_TOKEN_TTL_MS,
    refreshExpiresAt: clock + REFRESH_TOKEN_TTL_MS,
  });

  const viaOAuth = await whoamiText(t, tokens.access_token);
  const key = await asUser(t, userId).mutation(api.mcpKeys.createKey, { name: "Claude Desktop", scopes: ["mcp:read", "mcp:write"] });
  const viaKey = await whoamiText(t, key.key);
  expect(JSON.parse(viaOAuth)).toEqual(JSON.parse(viaKey));
  expect(JSON.parse(viaOAuth)).toEqual({ userId, email: "owner@example.com", keyName: "Claude Desktop", scopes: ["mcp:read", "mcp:write"] });

  // `lastUsedAt` se upisuje na red tokena, kao za ključ.
  const tokenRow = (await t.run((ctx) => ctx.db.query("oauthTokens").take(1)))[0];
  expect(tokenRow?.lastUsedAt).toBe(clock);
});

test("postojeći Bearer ključ i dalje radi pored OAuth grane (regresija)", async () => {
  const { t, userId } = await setup();
  const key = await asUser(t, userId).mutation(api.mcpKeys.createKey, { name: "Claude Code" });

  expect(JSON.parse(await whoamiText(t, key.key))).toMatchObject({ userId, keyName: "Claude Code", scopes: ["mcp:read"] });
});

// ── token endpoint: odbijanja ──────────────────────────────────────────────

test("token bez code_verifier -> odbijen; pogrešan code_verifier -> odbijen; ispravan posle toga prolazi", async () => {
  const { t, userId } = await setup();
  const clientId = await registerClaude(t);
  const { code } = await approve(t, userId, clientId);

  const missing = await tokenRequest(t, { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId });
  expect(missing.status).toBe(400);
  expect(await missing.json()).toMatchObject({ error: "invalid_request" });

  const wrong = await exchange(t, clientId, code, { code_verifier: WRONG_VERIFIER });
  expect(wrong.status).toBe(400);
  expect(await wrong.json()).toMatchObject({ error: "invalid_grant" });

  expect((await exchange(t, clientId, code)).status).toBe(200);
});

test("isti authorization code dvaput -> drugi put odbijen I svi tokeni tog koda opozvani", async () => {
  const { t, clientId, code, tokens } = await connect();
  expect((await whoami(t, tokens.access_token)).status).toBe(200);

  const again = await exchange(t, clientId, code);
  expect(again.status).toBe(400);
  expect(await again.json()).toMatchObject({ error: "invalid_grant" });

  expect((await whoami(t, tokens.access_token)).status).toBe(401);
  const refresh = await tokenRequest(t, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
  expect(refresh.status).toBe(400);
});

test("redirect_uri koji nije registrovan / ne poklapa se -> odbijen na token endpointu; tuđ client_id takođe", async () => {
  const { t, userId } = await setup();
  const clientId = await registerClaude(t);
  const { code } = await approve(t, userId, clientId);

  const mismatch = await exchange(t, clientId, code, { redirect_uri: OTHER_REDIRECT });
  expect(mismatch.status).toBe(400);
  expect(await mismatch.json()).toMatchObject({ error: "invalid_grant" });

  const otherClient = (await (await register(t, { client_name: "Drugi", redirect_uris: [REDIRECT] })).json()).client_id;
  const stolen = await exchange(t, otherClient, code);
  expect(stolen.status).toBe(400);
  expect(await stolen.json()).toMatchObject({ error: "invalid_grant" });

  const unknownClient = await exchange(t, "nepostojeci", code);
  expect(unknownClient.status).toBe(401);
  expect(await unknownClient.json()).toMatchObject({ error: "invalid_client" });

  const wrongResource = await exchange(t, clientId, code, { resource: "https://other.example/mcp" });
  expect(wrongResource.status).toBe(400);
  expect(await wrongResource.json()).toMatchObject({ error: "invalid_target" });

  // Ništa od toga nije potrošilo kod.
  expect((await exchange(t, clientId, code)).status).toBe(200);
});

test("istekao kod (61 s) -> odbijen; 59 s -> prolazi", async () => {
  const { t, userId } = await setup();
  const clientId = await registerClaude(t);

  const expired = await approve(t, userId, clientId);
  clock += 61_000;
  const late = await exchange(t, clientId, expired.code);
  expect(late.status).toBe(400);
  expect(await late.json()).toMatchObject({ error: "invalid_grant" });

  const fresh = await approve(t, userId, clientId);
  clock += 59_000;
  expect((await exchange(t, clientId, fresh.code)).status).toBe(200);
});

test("nepoznat grant_type i telo bez client_id -> 400", async () => {
  const { t } = await setup();
  const clientId = await registerClaude(t);

  expect((await tokenRequest(t, { grant_type: "client_credentials", client_id: clientId })).status).toBe(400);
  expect((await tokenRequest(t, { grant_type: "authorization_code", code: "x" })).status).toBe(400);
  expect((await t.fetch("/oauth/token", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" })).status).toBe(400);
});

// ── životni vek tokena ─────────────────────────────────────────────────────

test("istekao access token (1 h) -> 401; refresh daje nov par; stari access odmah 401; replay starog refresh gasi porodicu", async () => {
  const { t, clientId, tokens } = await connect();

  clock += ACCESS_TOKEN_TTL_MS + 1;
  expect((await whoami(t, tokens.access_token)).status).toBe(401);

  const refreshed = await tokenRequest(t, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
  expect(refreshed.status).toBe(200);
  const next: Tokens = await refreshed.json();
  expect(next.access_token).not.toBe(tokens.access_token);
  expect(next.refresh_token).not.toBe(tokens.refresh_token);
  expect(next.scope).toBe("mcp:read mcp:write");
  expect((await whoami(t, next.access_token)).status).toBe(200);

  // Replay rotiranog refresh tokena: odbijen, a nov par (ista porodica) opozvan.
  const replay = await tokenRequest(t, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
  expect(replay.status).toBe(400);
  expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
  expect((await whoami(t, next.access_token)).status).toBe(401);
});

test("istekao refresh token (30 dana) -> odbijen", async () => {
  const { t, clientId, tokens } = await connect();

  clock += REFRESH_TOKEN_TTL_MS + 1;
  const refreshed = await tokenRequest(t, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
  expect(refreshed.status).toBe(400);
  expect(await refreshed.json()).toMatchObject({ error: "invalid_grant" });
});

// ── povezane aplikacije ────────────────────────────────────────────────────

test("povezane aplikacije: lista pokazuje klijenta; opoziv -> lista prazna, OAuth token 401, refresh odbijen", async () => {
  const { t, userId, clientId, tokens } = await connect();
  const user = asUser(t, userId);

  const before = await user.query(api.oauth.server.listMyConnections, { now: clock });
  expect(before).toEqual([
    { clientId, clientName: "Claude Desktop", scopes: ["mcp:read", "mcp:write"], connectedAt: expect.any(Number), lastUsedAt: null },
  ]);

  await user.mutation(api.oauth.server.revokeConnection, { clientId: clientId as Id<"oauthClients"> });
  expect(await user.query(api.oauth.server.listMyConnections, { now: clock })).toEqual([]);
  expect((await whoami(t, tokens.access_token)).status).toBe(401);
  expect((await tokenRequest(t, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId })).status).toBe(400);
});

test("tuđ korisnik ne vidi vezu i ne može da je opozove", async () => {
  const { t, clientId, tokens } = await connect();
  const otherId = await t.run((ctx) => ctx.db.insert("users", { email: "other@example.com", name: "Other" }));
  const other = asUser(t, otherId);

  expect(await other.query(api.oauth.server.listMyConnections, { now: clock })).toEqual([]);
  await other.mutation(api.oauth.server.revokeConnection, { clientId: clientId as Id<"oauthClients"> });
  expect((await whoami(t, tokens.access_token)).status).toBe(200);
});
