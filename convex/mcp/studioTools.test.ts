/// <reference types="vite/client" />

/**
 * Studio alati kroz CEO put (MCP-P2-STUDIO, tačka 6): HTTP `/mcp` -> Bearer
 * ključ -> protokol -> alat -> interne studio funkcije -> baza. Testovi idu
 * preko `t.fetch`, a ne direktno preko `bindTools`, da bi pokrili i opseg
 * ključa i granice po opsegu tačno onako kako ih vidi klijent.
 */

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { MCP_WRITE_RATE_LIMIT } from "./rateLimit";
import { STUDIO_TOOL_NAMES } from "./studioTools";

const modules = import.meta.glob("../**/*.ts");

type TestConvexWithSchema = TestConvex<typeof schema>;

/**
 * Brojači rate limita žive u memoriji modula i dele se između testova (isti
 * keyId iz convex-test-a), pa svaki test dobija svoj, nov minutni prozor.
 */
let clock = Date.now();
beforeEach(() => {
  clock += 600_000;
  vi.spyOn(Date, "now").mockReturnValue(clock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function asUser(t: TestConvexWithSchema, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

function rpc(method: string, params?: unknown, id: string | number = 1) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
}

async function post(t: TestConvexWithSchema, key: string, body: string) {
  const response = await t.fetch("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body,
  });
  expect(response.status).toBe(200);

  return response.json();
}

type ToolCall = { result?: { content: Array<{ text: string }>; isError?: boolean }; error?: { code: number; data?: unknown } };

async function call(t: TestConvexWithSchema, key: string, name: string, args: unknown = {}): Promise<ToolCall> {
  return post(t, key, rpc("tools/call", { name, arguments: args }));
}

function textOf(response: ToolCall): string {
  return response.result?.content[0]?.text ?? "";
}

/**
 * Vlasnik je `moderator` iz istog razloga kao `seedWorld` u `studio.test.ts`:
 * dok je `STUDIO_STAFF_ONLY` upaljeno, samo osoblje prolazi
 * `decideStudioAccess` - a ovi testovi mere alate, ne kapiju. Uslovi su
 * prihvaćeni da `createJob` stigne do provere modela.
 */
async function setup() {
  const t = convexTest(schema, modules);
  const { ownerId, otherId } = await t.run(async (ctx) => ({
    ownerId: await ctx.db.insert("users", {
      email: "owner@example.com",
      name: "Owner",
      role: "moderator",
      acceptedStudioTermsAt: 1,
      emailVerificationTime: 1,
    }),
    otherId: await ctx.db.insert("users", { email: "other@example.com", name: "Other" }),
  }));
  const owner = asUser(t, ownerId);
  const readWrite = await owner.mutation(api.mcpKeys.createKey, {
    name: "Claude Code",
    scopes: ["mcp:read", "mcp:write"],
  });
  const readOnly = await owner.mutation(api.mcpKeys.createKey, { name: "Samo čitanje" });

  return { t, ownerId, otherId, rw: readWrite.key, ro: readOnly.key };
}

function seedJob(t: TestConvexWithSchema, userId: Id<"users">, createdAt: number, extra: Record<string, unknown> = {}) {
  return t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "flux-2-flash",
      kind: "image",
      params: JSON.stringify({ prompt: `posao ${createdAt}` }),
      promptHash: "0123456789abcdef",
      status: "done",
      creditCost: 20,
      createdAt,
      completedAt: createdAt + 1,
      ...extra,
    }),
  );
}

// ── tools/list ─────────────────────────────────────────────────────────────

test("tools/list vraća svih šest studio alata, svaki sa strogom JSON Schemom", async () => {
  const { t, rw } = await setup();

  const { result } = await post(t, rw, rpc("tools/list"));
  const tools = result.tools as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;

  expect(STUDIO_TOOL_NAMES).toEqual([
    "list_models",
    "get_studio_state",
    "list_projects",
    "create_generation",
    "get_job",
    "list_my_jobs",
  ]);
  expect(tools.map((tool) => tool.name)).toEqual(["whoami", ...STUDIO_TOOL_NAMES]);

  for (const tool of tools.filter((candidate) => STUDIO_TOOL_NAMES.includes(candidate.name))) {
    expect(tool.description.length, tool.name).toBeGreaterThan(0);
    expect(tool.inputSchema.type, tool.name).toBe("object");
    expect(typeof tool.inputSchema.properties, tool.name).toBe("object");
    expect(Array.isArray(tool.inputSchema.required), tool.name).toBe(true);
    expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
  }
});

// ── opseg ključa ───────────────────────────────────────────────────────────

test("ključ sa samo mcp:read ne može create_generation - errorResult o opsegu, ne izuzetak", async () => {
  const { t, ro } = await setup();

  const response = await call(t, ro, "create_generation", { modelSlug: "flux-2-flash", params: { prompt: "lisica" } });
  expect(response.error).toBeUndefined();
  expect(response.result?.isError).toBe(true);
  expect(textOf(response)).toContain('"mcp:write"');

  // Isti ključ čita bez problema.
  const state = await call(t, ro, "get_studio_state");
  expect(state.result?.isError).toBeUndefined();
});

// ── create_generation ──────────────────────────────────────────────────────

test("create_generation sa nepostojećim modelSlug -> errorResult sa kodom, bez posla i bez 500", async () => {
  const { t, rw } = await setup();

  const response = await call(t, rw, "create_generation", { modelSlug: "ne-postoji", params: { prompt: "lisica" } });
  expect(response.error).toBeUndefined();
  expect(response.result?.isError).toBe(true);
  expect(textOf(response)).toContain("MODEL_NEDOSTUPAN");

  expect(await t.run((ctx) => ctx.db.query("generationJobs").collect())).toEqual([]);
});

test("create_generation kad je kill switch ugašen -> errorResult STUDIO_PAUZIRAN", async () => {
  const { t, rw } = await setup();
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: "studio_enabled", enabled: false }));

  const response = await call(t, rw, "create_generation", { modelSlug: "flux-2-flash", params: { prompt: "lisica" } });
  expect(response.error).toBeUndefined();
  expect(response.result?.isError).toBe(true);
  expect(textOf(response)).toContain("STUDIO_PAUZIRAN");
});

test(`${MCP_WRITE_RATE_LIMIT.limit + 1}. write poziv u minutu -> -32002, čitanje i dalje prolazi`, async () => {
  const { t, rw } = await setup();

  for (let index = 0; index < MCP_WRITE_RATE_LIMIT.limit; index += 1) {
    const response = await call(t, rw, "create_generation", { modelSlug: "ne-postoji", params: {} });
    expect(response.result?.isError).toBe(true);
  }

  const denied = await call(t, rw, "create_generation", { modelSlug: "ne-postoji", params: {} });
  expect(denied.error?.code).toBe(-32002);
  expect(denied.error?.data).toEqual({ retryAfterSeconds: 60 });

  expect((await call(t, rw, "list_projects")).result?.isError).toBeUndefined();
});

// ── get_job ────────────────────────────────────────────────────────────────

test("get_job za tuđi, nepostojeći i neparsiv posao -> ista poruka; sopstveni vraća detalj", async () => {
  const { t, rw, ownerId, otherId } = await setup();
  const foreign = await seedJob(t, otherId, 10);
  const own = await seedJob(t, ownerId, 20, { error: undefined });

  for (const jobId of [foreign, "nije-id"]) {
    const response = await call(t, rw, "get_job", { jobId });
    expect(response.error).toBeUndefined();
    expect(response.result?.isError).toBe(true);
    expect(textOf(response)).toBe("Posao nije pronađen.");
  }

  const detail = JSON.parse(textOf(await call(t, rw, "get_job", { jobId: own })));
  expect(detail).toMatchObject({
    jobId: own,
    status: "done",
    modelSlug: "flux-2-flash",
    kind: "image",
    creditCost: 20,
    createdAt: 20,
    completedAt: 21,
    params: { prompt: "posao 20" },
    // Nema `outputStorageId`, pa ni potpisanog URL-a - ali polje postoji.
    outputUrl: null,
  });
  expect(detail).not.toHaveProperty("outputStorageId");
});

// ── list_my_jobs ───────────────────────────────────────────────────────────

test("list_my_jobs poštuje limit, vraća nextCursor i drugom stranom završava", async () => {
  const { t, rw, ownerId, otherId } = await setup();
  await seedJob(t, ownerId, 1);
  await seedJob(t, ownerId, 2);
  await seedJob(t, ownerId, 3);
  await seedJob(t, otherId, 4);

  const first = JSON.parse(textOf(await call(t, rw, "list_my_jobs", { limit: 2 })));
  expect(first.jobs.map((job: { createdAt: number }) => job.createdAt)).toEqual([3, 2]);
  expect(first.isDone).toBe(false);
  expect(typeof first.nextCursor).toBe("string");

  const second = JSON.parse(textOf(await call(t, rw, "list_my_jobs", { limit: 2, cursor: first.nextCursor })));
  expect(second.jobs.map((job: { createdAt: number }) => job.createdAt)).toEqual([1]);
  expect(second.isDone).toBe(true);
  expect(second.nextCursor).toBeNull();

  // Podrazumevani limit (20) obuhvata sva tri; tuđi posao se ne vidi.
  const all = JSON.parse(textOf(await call(t, rw, "list_my_jobs")));
  expect(all.jobs).toHaveLength(3);
});

// ── validacija ulaza ───────────────────────────────────────────────────────

test("neispravan ulaz -> -32602 pre ijednog poziva u Convex", async () => {
  const { t, rw } = await setup();

  const cases: Array<[string, unknown]> = [
    ["list_my_jobs", { limit: "5" }],
    ["list_my_jobs", { limit: 51 }],
    ["list_my_jobs", { kind: "gif" }],
    ["list_my_jobs", { nepoznato: true }],
    ["get_job", {}],
    ["get_job", { jobId: 42 }],
    ["create_generation", { modelSlug: "flux-2-flash" }],
    ["create_generation", { modelSlug: "flux-2-flash", params: "prompt" }],
    ["list_models", { bilo: "šta" }],
  ];

  for (const [name, args] of cases) {
    const response = await call(t, rw, name, args);
    expect(response.result, `${name} ${JSON.stringify(args)}`).toBeUndefined();
    expect(response.error?.code, `${name} ${JSON.stringify(args)}`).toBe(-32602);
  }
});

// ── čitanja ────────────────────────────────────────────────────────────────

test("list_models vraća samo uključene modele sa parsiranim JSON poljima", async () => {
  const { t, rw } = await setup();
  const row = (slug: string, isEnabled: boolean, sortOrder: number) => ({
    slug,
    provider: "fal" as const,
    kind: "image" as const,
    family: "flux",
    labelSr: slug,
    labelEn: slug,
    taglineSr: "Brz",
    taglineEn: "Fast",
    descriptionSr: "Opis",
    descriptionEn: "Description",
    endpoints: JSON.stringify({ text: "fal-ai/flux-2/flash" }),
    inputModes: JSON.stringify(["text"]),
    inputSpec: JSON.stringify({}),
    paramSpec: JSON.stringify([{ key: "prompt", kind: "prompt" }]),
    priceRule: JSON.stringify({ mode: "fixed", baseUsd: 0.005 }),
    capabilities: JSON.stringify({}),
    isEnabled,
    sortOrder,
    updatedAt: 1,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("models", row("b-model", true, 2));
    await ctx.db.insert("models", row("a-model", true, 1));
    await ctx.db.insert("models", row("ugasen", false, 0));
  });

  const models = JSON.parse(textOf(await call(t, rw, "list_models")));
  expect(models.map((model: { slug: string }) => model.slug)).toEqual(["a-model", "b-model"]);
  expect(models[0]).toMatchObject({
    kind: "image",
    provider: "fal",
    inputModes: ["text"],
    paramSpec: [{ key: "prompt", kind: "prompt" }],
    priceRule: { mode: "fixed", baseUsd: 0.005 },
  });
  expect(models[0]).not.toHaveProperty("endpoints");
});

test("get_studio_state spaja stanje pristupa i saldo kredita; list_projects skriva arhivirane", async () => {
  const { t, rw, ownerId } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("studioProjects", { userId: ownerId, name: "Aktivan", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("studioProjects", { userId: ownerId, name: "Arhiviran", createdAt: 2, updatedAt: 2, archivedAt: 3 });
  });

  const state = JSON.parse(textOf(await call(t, rw, "get_studio_state")));
  expect(state).toMatchObject({
    enabled: true,
    hasStudioAccess: true,
    accessReason: null,
    hasAcceptedTerms: true,
    activeJobs: 0,
    credits: { balance: 0, lifetimePurchased: 0, lifetimeSpent: 0 },
  });

  const { projects } = JSON.parse(textOf(await call(t, rw, "list_projects")));
  expect(projects).toEqual([{ id: expect.any(String), name: "Aktivan", createdAt: 1 }]);
});
