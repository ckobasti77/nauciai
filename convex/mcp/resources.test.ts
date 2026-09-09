/// <reference types="vite/client" />

/**
 * Resursi kroz CEO put (MCP-P5-PRIMITIVI, tačka 5): HTTP `/mcp` -> Bearer
 * ključ -> protokol -> resurs -> interne studio funkcije -> baza. Kao i
 * `studioTools.test.ts`, ide preko `t.fetch` da bi opseg ključa i vlasništvo
 * bili provereni tačno onako kako ih vidi klijent.
 */

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { studioModelBySlug } from "../providers/catalogModels";
import schema from "../schema";
import { parseParamSpec, sanitizeSpecParams } from "../studioParamSpec";
import { parsePriceRule } from "../studioPricing";
import { sha256Hex } from "./apiKey";
import { MISSING_SCOPE_ERROR_CODE, RESOURCE_TEMPLATES, RESOURCES } from "./resources";

const modules = import.meta.glob("../**/*.ts");

type TestConvexWithSchema = TestConvex<typeof schema>;

/** Brojači rate limita dele memoriju modula; svaki test dobija nov minutni prozor. */
let clock = Date.now();
beforeEach(() => {
  clock += 600_000;
  vi.spyOn(Date, "now").mockReturnValue(clock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function rpc(method: string, params?: unknown, id: string | number = 1) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
}

type Rpc = { result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown } };

async function post(t: TestConvexWithSchema, key: string, body: string): Promise<Rpc> {
  const response = await t.fetch("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body,
  });
  expect(response.status).toBe(200);

  return response.json();
}

async function read(t: TestConvexWithSchema, key: string, uri: string): Promise<Rpc> {
  return post(t, key, rpc("resources/read", { uri }));
}

type Contents = Array<{ uri: string; mimeType?: string; text: string }>;

function contentsOf(response: Rpc): Contents {
  expect(response.error).toBeUndefined();

  return response.result?.contents as Contents;
}

/** Vlasnik je `moderator` iz istog razloga kao u `studioTools.test.ts` (STUDIO_STAFF_ONLY kapija). */
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
  const owner = t.withIdentity({ subject: ownerId, tokenIdentifier: `test|${ownerId}` });
  const readOnly = await owner.mutation(api.mcpKeys.createKey, { name: "Samo čitanje" });

  return { t, ownerId, otherId, ro: readOnly.key };
}

/** Ključ bez ijednog opsega: `createKey` ga ne pravi, pa red ide direktno u tabelu. */
async function keyWithoutScopes(t: TestConvexWithSchema, userId: Id<"users">) {
  const key = "nai_live_" + "0".repeat(43);
  await t.run(async (ctx) => {
    await ctx.db.insert("mcpApiKeys", {
      userId,
      name: "Bez opsega",
      keyHash: await sha256Hex(key),
      prefix: key.slice(0, 12),
      scopes: [],
      createdAt: 1,
    });
  });

  return key;
}

async function seedCatalogModel(t: TestConvexWithSchema, slug: string, isEnabled = true) {
  const seed = studioModelBySlug(slug);
  if (!seed) throw new Error(`Nema modela ${slug} u katalogu`);

  return t.run((ctx) =>
    ctx.db.insert("models", {
      slug: seed.slug,
      provider: seed.provider,
      kind: seed.kind,
      family: seed.family,
      labelSr: seed.labelSr,
      labelEn: seed.labelEn,
      taglineSr: seed.taglineSr,
      taglineEn: seed.taglineEn,
      descriptionSr: seed.descriptionSr,
      descriptionEn: seed.descriptionEn,
      endpoints: JSON.stringify(seed.endpoints),
      inputModes: JSON.stringify(seed.inputModes),
      inputSpec: JSON.stringify(seed.inputSpec),
      paramSpec: JSON.stringify(seed.paramSpec),
      priceRule: JSON.stringify(seed.priceRule),
      capabilities: JSON.stringify(seed.capabilities),
      isEnabled,
      sortOrder: seed.sortOrder,
      updatedAt: 1,
    }),
  );
}

function seedJob(t: TestConvexWithSchema, userId: Id<"users">, createdAt: number) {
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
    }),
  );
}

// ── initialize ─────────────────────────────────────────────────────────────

test("initialize prijavljuje tools, resources i prompts u capabilities", async () => {
  const { t, ro } = await setup();

  const { result } = await post(t, ro, rpc("initialize", { protocolVersion: "2025-06-18" }));
  expect(result?.capabilities).toEqual({ tools: {}, resources: {}, prompts: {} });
});

// ── resources/list, resources/templates/list ───────────────────────────────

test("resources/list vraća dva statička resursa, templates/list dva šablona - četiri unosa ukupno", async () => {
  const { t, ro } = await setup();

  const list = (await post(t, ro, rpc("resources/list"))).result?.resources as Array<{ uri: string; name: string }>;
  const templates = (await post(t, ro, rpc("resources/templates/list"))).result?.resourceTemplates as Array<{
    uriTemplate: string;
  }>;

  expect(list.map((resource) => resource.uri)).toEqual(["nauciai://models", "nauciai://credits"]);
  expect(templates.map((template) => template.uriTemplate)).toEqual(["nauciai://models/{slug}", "nauciai://jobs/{jobId}"]);
  expect(list.length + templates.length).toBe(4);

  // Oblik po spec-u: uri/uriTemplate, name, opis i MIME na svakom unosu.
  for (const entry of [...RESOURCES, ...RESOURCE_TEMPLATES]) {
    expect(entry.name.length).toBeGreaterThan(0);
    expect(entry.description?.length ?? 0).toBeGreaterThan(0);
    expect(entry.mimeType).toBe("application/json");
  }
});

// ── resources/read ─────────────────────────────────────────────────────────

test("resources/read nauciai://models vraća validan JSON sa bar jednim modelom, bez ugašenih", async () => {
  const { t, ro } = await setup();
  await seedCatalogModel(t, "kling-3");
  await seedCatalogModel(t, "kling-3-turbo", false);

  const contents = contentsOf(await read(t, ro, "nauciai://models"));
  expect(contents).toHaveLength(1);
  expect(contents[0].uri).toBe("nauciai://models");
  expect(contents[0].mimeType).toBe("application/json");

  const models = JSON.parse(contents[0].text) as Array<Record<string, unknown>>;
  expect(models.length).toBeGreaterThanOrEqual(1);
  expect(models.map((model) => model.slug)).toEqual(["kling-3"]);
  expect(models[0]).toMatchObject({ kind: "video", provider: "fal", inputModes: ["text", "image"] });
  expect(Array.isArray(models[0].paramSpec)).toBe(true);
  expect(models[0]).not.toHaveProperty("endpoints");
});

test("resources/read nauciai://models/{slug} daje model i primer params koji prolazi validaciju", async () => {
  const { t, ro } = await setup();
  await seedCatalogModel(t, "kling-3");

  const [content] = contentsOf(await read(t, ro, "nauciai://models/kling-3"));
  const model = JSON.parse(content.text) as {
    slug: string;
    paramSpec: unknown;
    priceRule: unknown;
    example: { inputMode?: string; params: Record<string, unknown> };
  };
  expect(model.slug).toBe("kling-3");
  expect(model.example.inputMode).toBe("text");
  expect(typeof model.example.params.prompt).toBe("string");
  expect((model.example.params.prompt as string).length).toBeGreaterThan(0);

  // Primer prolazi ISTU proveru kojom server čisti narudžbinu.
  const spec = parseParamSpec(JSON.stringify(model.paramSpec));
  const rule = parsePriceRule(JSON.stringify(model.priceRule));
  if (!spec || !rule) throw new Error("katalog red nije parsiv");
  expect(sanitizeSpecParams(spec, rule, model.example.params, model.example.inputMode).ok).toBe(true);
});

test("nepostojeći i ugašen model -> -32602, ne 500", async () => {
  const { t, ro } = await setup();
  await seedCatalogModel(t, "kling-3-turbo", false);

  for (const uri of ["nauciai://models/nema-takvog", "nauciai://models/kling-3-turbo"]) {
    const response = await read(t, ro, uri);
    expect(response.result).toBeUndefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.data).toEqual({ uri });
  }
});

test("resources/read nauciai://credits vraća saldo i limite pozivaoca", async () => {
  const { t, ro, ownerId } = await setup();
  await t.run((ctx) =>
    ctx.db.insert("creditBalances", { userId: ownerId, balance: 120, lifetimePurchased: 200, lifetimeSpent: 80, updatedAt: 5 }),
  );

  const [content] = contentsOf(await read(t, ro, "nauciai://credits"));
  const credits = JSON.parse(content.text);
  expect(credits.credits).toEqual({ balance: 120, lifetimePurchased: 200, lifetimeSpent: 80, updatedAt: 5 });
  expect(credits.limits.activeJobs).toBe(0);
  expect(credits.limits.maxActiveJobs).toBeGreaterThan(0);
  expect(credits.studio).toMatchObject({ enabled: true, hasStudioAccess: true, accessReason: null, hasAcceptedTerms: true });
});

test("resources/read nauciai://jobs/{jobId}: sopstveni daje detalj, tuđi i nepostojeći 'Posao nije pronađen.'", async () => {
  const { t, ro, ownerId, otherId } = await setup();
  const own = await seedJob(t, ownerId, 20);
  const foreign = await seedJob(t, otherId, 10);

  const [content] = contentsOf(await read(t, ro, `nauciai://jobs/${own}`));
  expect(JSON.parse(content.text)).toMatchObject({ jobId: own, status: "done", modelSlug: "flux-2-flash", creditCost: 20 });

  for (const jobId of [foreign, "nije-id"]) {
    const response = await read(t, ro, `nauciai://jobs/${jobId}`);
    expect(response.result).toBeUndefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toBe("Posao nije pronađen.");
  }
});

test("nepoznat URI ili read bez uri -> -32602", async () => {
  const { t, ro } = await setup();

  for (const uri of ["nauciai://nema", "nauciai://jobs", "nauciai://credits/x", "file:///etc/passwd", "nauciai://models/a/b", ""]) {
    const response = await read(t, ro, uri);
    expect(response.error?.code, uri).toBe(-32602);
  }
  expect((await post(t, ro, rpc("resources/read", {}))).error?.code).toBe(-32602);
  expect((await post(t, ro, rpc("resources/read", { uri: 5 }))).error?.code).toBe(-32602);
});

// ── opseg ──────────────────────────────────────────────────────────────────

test("ključ bez mcp:read ne može da pročita nijedan resurs, ni sopstveni posao", async () => {
  const { t, ownerId } = await setup();
  await seedCatalogModel(t, "kling-3");
  const own = await seedJob(t, ownerId, 20);
  const key = await keyWithoutScopes(t, ownerId);

  for (const uri of ["nauciai://models", "nauciai://models/kling-3", "nauciai://credits", `nauciai://jobs/${own}`]) {
    const response = await read(t, key, uri);
    expect(response.result, uri).toBeUndefined();
    expect(response.error?.code, uri).toBe(MISSING_SCOPE_ERROR_CODE);
    expect(response.error?.message, uri).toContain("mcp:read");
  }

  // Spisak resursa je metapodatak, kao `tools/list` - ostaje čitljiv.
  expect((await post(t, key, rpc("resources/list"))).error).toBeUndefined();
});
