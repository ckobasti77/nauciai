/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { KEY_PREFIX, sha256Hex } from "./mcp/apiKey";
import { MAX_BODY_BYTES } from "./mcp/handler";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type TestConvexWithSchema = TestConvex<typeof schema>;

async function seedUsers(t: TestConvexWithSchema) {
  return t.run(async (ctx) => ({
    ownerId: await ctx.db.insert("users", { email: "owner@example.com", name: "Owner" }),
    otherId: await ctx.db.insert("users", { email: "other@example.com", name: "Other" }),
  }));
}

function asUser(t: TestConvexWithSchema, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

function rpc(method: string, params?: unknown, id: string | number = 1) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
}

function post(t: TestConvexWithSchema, body: string, headers: Record<string, string> = {}) {
  return t.fetch("/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
}

async function setup() {
  const t = convexTest(schema, modules);
  const { ownerId, otherId } = await seedUsers(t);
  const created = await asUser(t, ownerId).mutation(api.mcpKeys.createKey, { name: "Claude Desktop" });

  return { t, ownerId, otherId, created, bearer: { Authorization: `Bearer ${created.key}` } };
}

// ── ključevi ───────────────────────────────────────────────────────────────

test("createKey vraća pun ključ tačno jednom; u bazi i u listi stoji samo hash/prefix", async () => {
  const { t, ownerId, created } = await setup();

  expect(created.key.startsWith(KEY_PREFIX)).toBe(true);
  expect(created.key).toHaveLength(KEY_PREFIX.length + 43);
  expect(created.prefix).toBe(created.key.slice(0, 12));

  const row = await t.run((ctx) => ctx.db.get(created.keyId));
  expect(row).not.toBeNull();
  expect(row?.keyHash).toBe(await sha256Hex(created.key));
  expect(JSON.stringify(row)).not.toContain(created.key);
  expect(row).toMatchObject({ userId: ownerId, name: "Claude Desktop", prefix: created.prefix, scopes: ["mcp:read"] });

  const listed = await asUser(t, ownerId).query(api.mcpKeys.listMyKeys, {});
  expect(JSON.stringify(listed)).not.toContain(created.key);
  expect(listed).toMatchObject([
    { keyId: created.keyId, name: "Claude Desktop", prefix: created.prefix, scopes: ["mcp:read"], lastUsedAt: null, revokedAt: null },
  ]);
});

test("createKey traži prijavu i odbija prazno ime", async () => {
  const t = convexTest(schema, modules);
  const { ownerId } = await seedUsers(t);

  await expect(t.mutation(api.mcpKeys.createKey, { name: "x" })).rejects.toThrow("Unauthorized");
  await expect(asUser(t, ownerId).mutation(api.mcpKeys.createKey, { name: "   " })).rejects.toThrow("NEISPRAVNO_IME");
});

test("korisnik ne može da revokuje tuđi ključ, a tuđi ključ mu ni ne vidi", async () => {
  const { t, ownerId, otherId, created } = await setup();

  await expect(asUser(t, otherId).mutation(api.mcpKeys.revokeKey, { keyId: created.keyId })).rejects.toThrow(
    "NEMA_PRISTUPA",
  );
  expect((await t.run((ctx) => ctx.db.get(created.keyId)))?.revokedAt).toBeUndefined();
  expect(await asUser(t, otherId).query(api.mcpKeys.listMyKeys, {})).toEqual([]);

  await asUser(t, ownerId).mutation(api.mcpKeys.revokeKey, { keyId: created.keyId });
  const row = await t.run((ctx) => ctx.db.get(created.keyId));
  expect(typeof row?.revokedAt).toBe("number");
  expect(row?.keyHash).toBeDefined();
});

// ── transport: autentikacija ───────────────────────────────────────────────

test("zahtev bez Bearer zaglavlja -> 401 sa JSON-RPC greškom bez razloga", async () => {
  const { t } = await setup();

  const response = await post(t, rpc("ping"));
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain("Bearer");
  expect(await response.json()).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } });
});

test("nepostojeći i revokovan ključ daju IDENTIČAN 401", async () => {
  const { t, ownerId, created, bearer } = await setup();
  const unknownKey = `${KEY_PREFIX}${"A".repeat(43)}`;

  const unknown = await post(t, rpc("ping"), { Authorization: `Bearer ${unknownKey}` });
  expect(unknown.status).toBe(401);

  expect((await post(t, rpc("ping"), bearer)).status).toBe(200);
  await asUser(t, ownerId).mutation(api.mcpKeys.revokeKey, { keyId: created.keyId });

  const revoked = await post(t, rpc("ping"), bearer);
  expect(revoked.status).toBe(401);
  expect(await revoked.text()).toBe(await unknown.text());
  expect([...revoked.headers.entries()]).toEqual([...unknown.headers.entries()]);
});

test("neispravan format zaglavlja -> 401", async () => {
  const { t, created } = await setup();

  expect((await post(t, rpc("ping"), { Authorization: `Basic ${created.key}` })).status).toBe(401);
  expect((await post(t, rpc("ping"), { Authorization: "Bearer nesto-kratko" })).status).toBe(401);
});

// ── transport: protokol kraj-do-kraja ──────────────────────────────────────

test("initialize + tools/call whoami preko HTTP-a vraćaju userId i upisuju lastUsedAt", async () => {
  const { t, ownerId, created, bearer } = await setup();

  const init = await post(t, rpc("initialize", { protocolVersion: "2025-06-18" }), bearer);
  expect(init.status).toBe(200);
  expect(init.headers.get("content-type")).toBe("application/json");
  expect(init.headers.get("access-control-allow-origin")).toBe("*");
  expect((await init.json()).result.protocolVersion).toBe("2025-06-18");

  const call = await post(t, rpc("tools/call", { name: "whoami", arguments: {} }, 2), bearer);
  const body = await call.json();
  expect(body.id).toBe(2);
  expect(JSON.parse(body.result.content[0].text)).toEqual({
    userId: ownerId,
    email: "owner@example.com",
    keyName: "Claude Desktop",
    scopes: ["mcp:read"],
  });

  expect(typeof (await t.run((ctx) => ctx.db.get(created.keyId)))?.lastUsedAt).toBe("number");
});

test("Accept: text/event-stream -> SSE okvir sa istim JSON-RPC odgovorom", async () => {
  const { t, bearer } = await setup();

  const response = await post(t, rpc("ping", undefined, "s1"), { ...bearer, Accept: "application/json, text/event-stream" });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");

  const text = await response.text();
  expect(text.startsWith("event: message\ndata: ")).toBe(true);
  expect(text.endsWith("\n\n")).toBe(true);
  expect(JSON.parse(text.slice("event: message\ndata: ".length, -2))).toEqual({ jsonrpc: "2.0", id: "s1", result: {} });
});

test("batch od 3 zahteva preko HTTP-a -> 3 odgovora", async () => {
  const { t, bearer } = await setup();

  const response = await post(t, `[${rpc("ping", undefined, 1)},${rpc("tools/list", undefined, 2)},${rpc("ping", undefined, 3)}]`, bearer);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.map((entry: { id: number }) => entry.id)).toEqual([1, 2, 3]);
});

test("notifikacija -> 202 bez tela; loš JSON -> 400 sa -32700; nepoznata metoda -> -32601", async () => {
  const { t, bearer } = await setup();

  const notification = await post(t, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), bearer);
  expect(notification.status).toBe(202);
  expect(await notification.text()).toBe("");

  const parse = await post(t, "{ nije json", bearer);
  expect(parse.status).toBe(400);
  expect((await parse.json()).error.code).toBe(-32700);

  const unknown = await post(t, rpc("resources/list"), bearer);
  expect(unknown.status).toBe(200);
  expect((await unknown.json()).error.code).toBe(-32601);
});

// ── transport: granice ─────────────────────────────────────────────────────

test("telo veće od 1 MB -> 413", async () => {
  const { t, bearer } = await setup();

  const response = await post(t, "x".repeat(MAX_BODY_BYTES + 1), bearer);
  expect(response.status).toBe(413);
  expect((await response.json()).error.code).toBe(-32003);
});

test("61. zahtev u minutu -> 429 sa Retry-After", async () => {
  const { t, bearer } = await setup();
  // Brojač živi u memoriji modula i deli se između testova ovog fajla (convex-test
  // daje isti keyId svakoj instanci), pa se sat pomera u nov, prazan prozor.
  const now = vi.spyOn(Date, "now").mockReturnValue(new Date().getTime() + 120_000);

  try {
    for (let index = 0; index < 60; index += 1) {
      expect((await post(t, rpc("ping"), bearer)).status).toBe(200);
    }

    const denied = await post(t, rpc("ping"), bearer);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("60");
    expect((await denied.json()).error.code).toBe(-32002);
  } finally {
    now.mockRestore();
  }
});

test("OPTIONS -> 204 sa CORS zaglavljima; GET -> 405", async () => {
  const { t } = await setup();

  const preflight = await t.fetch("/mcp", { method: "OPTIONS" });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  expect(preflight.headers.get("access-control-allow-headers")).toBe(
    "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  );

  expect((await t.fetch("/mcp", { method: "GET" })).status).toBe(405);
});
