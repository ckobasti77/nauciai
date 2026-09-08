/// <reference types="vite/client" />

/**
 * Studio alati kroz CEO put (MCP-P2-STUDIO, tačka 6): HTTP `/mcp` -> Bearer
 * ključ -> protokol -> alat -> interne studio funkcije -> baza. Testovi idu
 * preko `t.fetch`, a ne direktno preko `bindTools`, da bi pokrili i opseg
 * ključa i granice po opsegu tačno onako kako ih vidi klijent.
 */

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MIN_PLAUSIBLE_BITRATE_BPS } from "../../lib/media-duration";
import { studioModelBySlug } from "../providers/catalogModels";
import schema from "../schema";
import { MAX_ACTIVE_JOBS } from "../studioCore";
import { MAX_SLOT_BYTES } from "../studioJobCore";
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
async function setup(ownerOverrides: Record<string, unknown> = {}) {
  const t = convexTest(schema, modules);
  // `undefined` u override-u BRIŠE podrazumevano polje (nepotvrđen email, bez
  // pečata uslova) - Convex red ne sme da nosi ključ sa `undefined`.
  const ownerRow = Object.fromEntries(
    Object.entries({
      email: "owner@example.com",
      name: "Owner",
      role: "moderator",
      acceptedStudioTermsAt: 1,
      emailVerificationTime: 1,
      ...ownerOverrides,
    }).filter(([, value]) => value !== undefined),
  );
  const { ownerId, otherId } = await t.run(async (ctx) => ({
    ownerId: await ctx.db.insert("users", ownerRow as { email: string; name: string }),
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

/** Red v4 kataloga u bazi - ista polja koja upisuje `seedStudioModels` (kao u `studioCatalogJob.test.ts`). */
async function seedCatalogModel(t: TestConvexWithSchema, slug: string) {
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
      isEnabled: true,
      sortOrder: seed.sortOrder,
      updatedAt: 1,
    }),
  );
}

function grantCredits(t: TestConvexWithSchema, userId: Id<"users">, amount: number) {
  return t.mutation(internal.credits.grantCredits, {
    userId,
    amount,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });
}

async function balanceOf(t: TestConvexWithSchema, userId: Id<"users">) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );

  return row?.balance ?? 0;
}

function jobsOf(t: TestConvexWithSchema, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("generationJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

/**
 * Lažan red `studioUploads` bez merenja: fajl okačen i prijavljen mimo MCP-a,
 * kome server (još) nije pročitao trajanje. `mimeType` se upisuje ručno jer
 * `convex-test` ne prenosi `contentType` u `_storage` metapodatke.
 */
async function seedUpload(t: TestConvexWithSchema, userId: Id<"users">, mimeType: string, slot: string, bytes = 64) {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["x".repeat(bytes)], { type: mimeType }));
    await ctx.db.insert("studioUploads", {
      userId,
      storageId,
      slot,
      bytes,
      mimeType,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1,
    });

    return storageId;
  });
}

/**
 * MP4 čiji `mvhd` atom tvrdi zadato trajanje, dopunjen nulama do veličine koju
 * donja granica bitrate-a čini mogućom (kopija fixture-a iz `studioCatalogJob.test.ts`).
 */
function mp4Bytes(seconds: number, type: string): Uint8Array<ArrayBuffer> {
  const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  const chars = (text: string) => [...text].map((letter) => letter.charCodeAt(0));
  const mvhd = [...u32(108), ...chars("mvhd"), 0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(Math.round(seconds * 1000)), ...new Array(80).fill(0)];
  const header = Uint8Array.from([...u32(16), ...chars("ftyp"), ...chars("isom"), ...u32(512), ...u32(mvhd.length + 8), ...chars("moov"), ...mvhd]);
  const minBytes = Math.ceil((seconds * (MIN_PLAUSIBLE_BITRATE_BPS[type] ?? 0)) / 8) + 1;
  const padded = new Uint8Array(Math.max(minBytes, header.length));
  padded.set(header, 0);

  return padded;
}

/** `fetch` koji poštuje `Range` zaglavlje i vraća 206, kao Convex storage. */
function rangeServer(data: Uint8Array) {
  return (_url: string, init?: { headers?: Record<string, string> }) => {
    const range = /bytes=(\d+)-(\d+)/.exec(init?.headers?.Range ?? "");
    if (!range) return Promise.resolve(new Response(null, { status: 400 }));

    return Promise.resolve(new Response(data.slice(Number(range[1]), Number(range[2]) + 1), { status: 206 }));
  };
}

/**
 * Fajl u skladištu SA zabeleženim tipom, kako ga Convex upiše kad klijent
 * pošalje `Content-Type` (dev provera: bez zaglavlja ostaje bez tipa).
 * `convex-test` tip ne prenosi iz `Blob`-a, pa se `_storage` red dopunjuje
 * ručno - isti razlog iz kog `studioCatalogJob.test.ts` dopunjuje `mimeType`.
 * `type: null` je upload bez zaglavlja; `size` prepisuje veličinu bez
 * pravljenja fajla od 10 MB.
 */
function storeBlob(
  t: TestConvexWithSchema,
  bytes: Uint8Array<ArrayBuffer> | string,
  type: string | null,
  size?: number,
) {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([bytes], { type: type ?? "" }));
    const meta: Record<string, unknown> = {};
    if (type !== null) meta.contentType = type;
    if (size !== undefined) meta.size = size;
    // `_storage` je sistemska tabela; u produkciji je nepromenljiva, u
    // `convex-test`-u je obična mapa pa `patch` prolazi.
    if (Object.keys(meta).length > 0) await ctx.db.patch(storageId as unknown as Id<"studioUploads">, meta);

    return storageId;
  });
}

async function storageHas(t: TestConvexWithSchema, storageId: Id<"_storage">) {
  return (await t.run((ctx) => ctx.db.system.get("_storage", storageId))) !== null;
}

// ── tools/list ─────────────────────────────────────────────────────────────

test("tools/list vraća svih deset studio alata, svaki sa strogom JSON Schemom", async () => {
  const { t, rw } = await setup();

  const { result } = await post(t, rw, rpc("tools/list"));
  const tools = result.tools as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;

  expect(STUDIO_TOOL_NAMES).toEqual([
    "list_models",
    "get_studio_state",
    "list_projects",
    "create_upload_url",
    "register_upload",
    "create_generation",
    "get_job",
    "wait_for_job",
    "get_output_url",
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
    // Oblik `inputs` van šeme je protokolska greška, ne domenska.
    ["create_generation", { modelSlug: "kling-3", params: {}, inputs: { image: "x" } }],
    ["create_generation", { modelSlug: "kling-3", params: {}, inputs: { image: [1] } }],
    ["create_generation", { modelSlug: "kling-3", params: {}, inputs: "x" }],
    ["wait_for_job", { jobId: "x", timeoutSeconds: 61 }],
    ["wait_for_job", { jobId: "x", timeoutSeconds: 0 }],
    ["register_upload", { storageId: "x", grantId: "y" }],
    ["create_upload_url", {}],
    ["get_output_url", { jobId: 1 }],
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

// ── kapije koje P2 nije pokrio: interna putanja PROLAZI kroz iste provere ──

test("običan korisnik bez potvrđenog emaila -> create_generation daje EMAIL_NIJE_POTVRDJEN, bez posla", async () => {
  const { t, rw, ownerId } = await setup({ role: "student", emailVerificationTime: undefined });
  await seedCatalogModel(t, "seedream-45");
  await grantCredits(t, ownerId, 1000);
  // Javni fleg: bez njega bi student pao na NEMA_PRISTUPA pre provere emaila.
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: "studio_public", enabled: true }));

  const response = await call(t, rw, "create_generation", { modelSlug: "seedream-45", params: { prompt: "lisica" } });
  expect(response.error).toBeUndefined();
  expect(response.result?.isError).toBe(true);
  expect(textOf(response)).toContain("EMAIL_NIJE_POTVRDJEN");

  expect(await jobsOf(t, ownerId)).toEqual([]);
  expect(await balanceOf(t, ownerId)).toBe(1000);
});

test("korisnik bez prihvaćenih uslova -> USLOVI_NEPRIHVACENI, bez posla", async () => {
  const { t, rw, ownerId } = await setup({ acceptedStudioTermsAt: undefined });
  await seedCatalogModel(t, "seedream-45");
  await grantCredits(t, ownerId, 1000);

  const response = await call(t, rw, "create_generation", { modelSlug: "seedream-45", params: { prompt: "lisica" } });
  expect(response.result?.isError).toBe(true);
  expect(textOf(response)).toContain("USLOVI_NEPRIHVACENI");

  expect(await jobsOf(t, ownerId)).toEqual([]);
  expect(await balanceOf(t, ownerId)).toBe(1000);
});

test("uspešan create_generation STVARNO skida creditCost sa creditBalances", async () => {
  const { t, rw, ownerId } = await setup();
  await seedCatalogModel(t, "seedream-45");
  await grantCredits(t, ownerId, 1000);

  const created = JSON.parse(textOf(await call(t, rw, "create_generation", { modelSlug: "seedream-45", params: { prompt: "lisica u snegu" } })));
  expect(created).toMatchObject({ status: "reserved", modelSlug: "seedream-45" });
  expect(created.creditCost).toBeGreaterThan(0);

  const [job] = await jobsOf(t, ownerId);
  expect(job._id).toBe(created.jobId);
  expect(job.creditCost).toBe(created.creditCost);
  expect(await balanceOf(t, ownerId)).toBe(1000 - created.creditCost);
});

test(`korisnik sa ${MAX_ACTIVE_JOBS} aktivna posla -> PREVISE_POSLOVA, krediti netaknuti`, async () => {
  const { t, rw, ownerId } = await setup();
  await seedCatalogModel(t, "seedream-45");
  await grantCredits(t, ownerId, 1000);
  for (let index = 0; index < MAX_ACTIVE_JOBS; index += 1) {
    await seedJob(t, ownerId, index + 1, { status: "running", completedAt: undefined });
  }

  const response = await call(t, rw, "create_generation", { modelSlug: "seedream-45", params: { prompt: "lisica" } });
  expect(response.result?.isError).toBe(true);
  expect(textOf(response)).toContain("PREVISE_POSLOVA");

  expect(await jobsOf(t, ownerId)).toHaveLength(MAX_ACTIVE_JOBS);
  expect(await balanceOf(t, ownerId)).toBe(1000);
});

// ── P3: okačivanje fajlova ─────────────────────────────────────────────────

test("create_upload_url i register_upload kraj-do-kraja: video se izmeri, slika ne, dozvola se troši", async () => {
  const { t, rw, ownerId } = await setup();

  const grant = JSON.parse(textOf(await call(t, rw, "create_upload_url", { slot: "video" })));
  expect(grant).toMatchObject({ slot: "video", grantExpiresInSeconds: 3600 });
  expect(grant.uploadUrl).toMatch(/^https?:\/\//);
  expect(grant.instructions).toContain("POST");

  const video = mp4Bytes(4.2, "video/mp4");
  const storageId = await storeBlob(t, video, "video/mp4");
  vi.stubGlobal("fetch", rangeServer(video));
  let registered: Record<string, unknown>;
  try {
    registered = JSON.parse(textOf(await call(t, rw, "register_upload", { storageId, grantId: grant.grantId, slot: "video" })));
  } finally {
    vi.unstubAllGlobals();
  }
  expect(registered).toMatchObject({ storageId, slot: "video", bytes: video.length, durationS: 4.2, measured: true });
  expect(registered).not.toHaveProperty("measureError");

  const [upload] = await t.run((ctx) => ctx.db.query("studioUploads").collect());
  expect(upload).toMatchObject({ userId: ownerId, storageId, slot: "video", durationS: 4.2 });
  const [usedGrant] = await t.run((ctx) => ctx.db.query("studioUploadGrants").collect());
  expect(typeof usedGrant.usedAt).toBe("number");

  // Ista dozvola drugi put je potrošena - novi fajl ne prolazi.
  const again = await call(t, rw, "register_upload", { storageId: await storeBlob(t, "x", "video/mp4"), grantId: grant.grantId, slot: "video" });
  expect(again.result?.isError).toBe(true);
  expect(textOf(again)).toContain("NEDOZVOLJEN_UPLOAD");

  // Slika: prijava bez merenja, `durationS` je null a ne greška.
  const imageGrant = JSON.parse(textOf(await call(t, rw, "create_upload_url", { slot: "image" })));
  const imageId = await storeBlob(t, "slika", "image/png");
  const image = JSON.parse(textOf(await call(t, rw, "register_upload", { storageId: imageId, grantId: imageGrant.grantId, slot: "image" })));
  expect(image).toMatchObject({ storageId: imageId, slot: "image", bytes: 5, durationS: null, measured: false });
});

test("register_upload sa pogrešnim slotom se odbija PRE nego što potroši dozvolu", async () => {
  const { t, rw } = await setup();
  const grant = JSON.parse(textOf(await call(t, rw, "create_upload_url", { slot: "image" })));
  const storageId = await storeBlob(t, "slika", "image/png");

  const response = await call(t, rw, "register_upload", { storageId, grantId: grant.grantId, slot: "video" });
  expect(response.result?.isError).toBe(true);
  expect(textOf(response)).toContain("NEISPRAVAN_SLOT");

  expect(await t.run((ctx) => ctx.db.query("studioUploads").collect())).toEqual([]);
  const [row] = await t.run((ctx) => ctx.db.query("studioUploadGrants").collect());
  expect(row.usedAt).toBeUndefined();

  // Sa pravim slotom ista dozvola i dalje radi.
  const ok = JSON.parse(textOf(await call(t, rw, "register_upload", { storageId, grantId: grant.grantId, slot: "image" })));
  expect(ok.slot).toBe("image");
});

test("register_upload sa tuđim storageId -> TUDJI_FAJL; tuđa dozvola i nepostojeći fajl -> odbijeni", async () => {
  const { t, rw, ownerId, otherId } = await setup();
  const foreign = await seedUpload(t, otherId, "image/png", "image");
  const grant = JSON.parse(textOf(await call(t, rw, "create_upload_url", { slot: "image" })));

  const stolen = await call(t, rw, "register_upload", { storageId: foreign, grantId: grant.grantId, slot: "image" });
  expect(stolen.error).toBeUndefined();
  expect(stolen.result?.isError).toBe(true);
  expect(textOf(stolen)).toContain("TUDJI_FAJL");
  const [row] = await t.run((ctx) => ctx.db.query("studioUploads").collect());
  expect(row.userId).toBe(otherId);

  const bogus = await call(t, rw, "register_upload", { storageId: await storeBlob(t, "x", "image/png"), grantId: "nije-dozvola", slot: "image" });
  expect(bogus.result?.isError).toBe(true);
  expect(textOf(bogus)).toContain("NEDOZVOLJEN_UPLOAD");

  const missing = await call(t, rw, "register_upload", { storageId: "nije-fajl", grantId: grant.grantId, slot: "image" });
  expect(missing.result?.isError).toBe(true);
  expect(textOf(missing)).toContain("FAJL_NE_POSTOJI");

  // Dozvola je i dalje neiskorišćena - nijedan odbijen pokušaj je nije potrošio.
  const [ownGrant] = await t.run((ctx) => ctx.db.query("studioUploadGrants").collect());
  expect(ownGrant.usedAt).toBeUndefined();
  expect(await jobsOf(t, ownerId)).toEqual([]);
});

// ── P3b: ulazna kapija po tipu i veličini ──────────────────────────────────

test("register_upload odbija i BRIŠE fajl pogrešnog tipa - scenario 'zvuk u slotu za sliku'", async () => {
  const { t, rw, ownerId } = await setup();
  await seedCatalogModel(t, "kling-3");
  await grantCredits(t, ownerId, 1000);
  const grant = JSON.parse(textOf(await call(t, rw, "create_upload_url", { slot: "image" })));
  expect(grant).toMatchObject({ accept: ["image/png", "image/jpeg", "image/webp"], maxBytes: MAX_SLOT_BYTES.image });
  expect(grant.instructions).toContain("OBAVEZNO");

  const audio = await storeBlob(t, "ID3 nije slika", "audio/mpeg");
  const response = await call(t, rw, "register_upload", { storageId: audio, grantId: grant.grantId, slot: "image" });
  expect(response.error).toBeUndefined();
  expect(response.result?.isError).toBe(true);
  expect(textOf(response)).toContain("NEISPRAVAN_TIP_FAJLA");
  expect(textOf(response)).toContain("PNG, JPEG, WEBP");

  // Ništa nije ostalo: ni red, ni fajl u skladištu, ni potrošena dozvola.
  expect(await t.run((ctx) => ctx.db.query("studioUploads").collect())).toEqual([]);
  expect(await storageHas(t, audio)).toBe(false);
  const [row] = await t.run((ctx) => ctx.db.query("studioUploadGrants").collect());
  expect(row.usedAt).toBeUndefined();

  // Posao sa tim id-jem ne može da krene - fajl nikad nije prijavljen.
  const job = await call(t, rw, "create_generation", { modelSlug: "kling-3", params: { prompt: "x" }, inputMode: "image", inputs: { image: [audio] } });
  expect(job.result?.isError).toBe(true);
  expect(textOf(job)).toContain("TUDJI_FAJL");
  expect(await jobsOf(t, ownerId)).toEqual([]);
  expect(await balanceOf(t, ownerId)).toBe(1000);
});

test("register_upload odbija upload bez Content-Type zaglavlja, prevelik fajl i prazan fajl", async () => {
  const { t, rw } = await setup();

  const cases: Array<[Id<"_storage">, string, string]> = [
    [await storeBlob(t, "bez tipa", null), "image", "NEISPRAVAN_TIP_FAJLA"],
    [await storeBlob(t, "png", "image/png", MAX_SLOT_BYTES.image + 1), "image", "FAJL_PREVELIK"],
    [await storeBlob(t, "mp4", "video/mp4", MAX_SLOT_BYTES.video + 1), "video", "FAJL_PREVELIK"],
    [await storeBlob(t, "", "image/png"), "image", "PRAZAN_FAJL"],
  ];
  for (const [storageId, slot, expected] of cases) {
    const grant = JSON.parse(textOf(await call(t, rw, "create_upload_url", { slot })));
    const response = await call(t, rw, "register_upload", { storageId, grantId: grant.grantId, slot });
    expect(response.result?.isError, expected).toBe(true);
    expect(textOf(response), expected).toContain(expected);
    expect(textOf(response), expected).toContain("obrisan");
    expect(await storageHas(t, storageId), expected).toBe(false);
  }
  expect(await t.run((ctx) => ctx.db.query("studioUploads").collect())).toEqual([]);

  // Video do granice prolazi: veličina se meri po vrsti slota, ne po slici.
  const grant = JSON.parse(textOf(await call(t, rw, "create_upload_url", { slot: "video" })));
  const big = await storeBlob(t, mp4Bytes(4.2, "video/mp4"), "video/mp4", MAX_SLOT_BYTES.video);
  vi.stubGlobal("fetch", rangeServer(mp4Bytes(4.2, "video/mp4")));
  try {
    const ok = JSON.parse(textOf(await call(t, rw, "register_upload", { storageId: big, grantId: grant.grantId, slot: "video" })));
    expect(ok).toMatchObject({ slot: "video", bytes: MAX_SLOT_BYTES.video, mimeType: "video/mp4" });
  } finally {
    vi.unstubAllGlobals();
  }
});

test("ključ sa samo mcp:read ne može create_upload_url ni register_upload", async () => {
  const { t, ro } = await setup();

  for (const [name, args] of [
    ["create_upload_url", { slot: "image" }],
    ["register_upload", { storageId: "x", grantId: "y", slot: "image" }],
  ] as const) {
    const response = await call(t, ro, name, args);
    expect(response.result?.isError, name).toBe(true);
    expect(textOf(response), name).toContain('"mcp:write"');
  }
});

// ── P3: create_generation sa ulazom ────────────────────────────────────────

test("create_generation sa inputs bez izmerenog durationS na modelu po trajanju -> errorResult, posao NIJE kreiran", async () => {
  const { t, rw, ownerId } = await setup();
  await seedCatalogModel(t, "stt");
  await grantCredits(t, ownerId, 1000);
  const audio = await seedUpload(t, ownerId, "audio/mpeg", "audio");

  const response = await call(t, rw, "create_generation", {
    modelSlug: "stt",
    params: {},
    inputMode: "audio",
    inputs: { audio: [audio] },
  });
  expect(response.error).toBeUndefined();
  expect(response.result?.isError).toBe(true);
  expect(textOf(response)).toContain("MERENJE_NIJE_DOSTUPNO");
  expect(textOf(response)).toContain("register_upload");

  expect(await jobsOf(t, ownerId)).toEqual([]);
  expect(await balanceOf(t, ownerId)).toBe(1000);
});

test("create_generation sa izmerenim ulazom prolazi i pamti inputMode i inputs uz posao", async () => {
  const { t, rw, ownerId } = await setup();
  await seedCatalogModel(t, "stt");
  await grantCredits(t, ownerId, 1000);
  // 40 kB je dovoljno da 30 s zvuka bude fizički moguće (granica iz X1).
  const audio = await seedUpload(t, ownerId, "audio/mpeg", "audio", 40_000);
  await t.run(async (ctx) => {
    const [upload] = await ctx.db.query("studioUploads").collect();
    await ctx.db.patch(upload._id, { durationS: 30 });
  });

  const created = JSON.parse(textOf(await call(t, rw, "create_generation", { modelSlug: "stt", params: {}, inputMode: "audio", inputs: { audio: [audio] } })));
  expect(created.status).toBe("reserved");
  const [job] = await jobsOf(t, ownerId);
  expect(job).toMatchObject({ modelSlug: "stt", inputMode: "audio", inputs: JSON.stringify({ audio: [audio] }) });
  expect(await balanceOf(t, ownerId)).toBe(1000 - created.creditCost);
});

test("neispravan ulaz za model se prevodi u čitljivu poruku PRE poziva u Convex", async () => {
  const { t, rw, ownerId } = await setup();
  await seedCatalogModel(t, "kling-3");
  await grantCredits(t, ownerId, 1000);
  const image = await seedUpload(t, ownerId, "image/png", "image");

  const cases: Array<[Record<string, unknown>, string]> = [
    [{ modelSlug: "kling-3", params: { prompt: "x" }, inputMode: "audio" }, "NEISPRAVAN_REZIM"],
    [{ modelSlug: "kling-3", params: { prompt: "x" }, inputMode: "image" }, 'traži ulaz tipa image u slotu "image"'],
    [{ modelSlug: "kling-3", params: { prompt: "x" }, inputMode: "image", inputs: { video: [image] } }, "NEISPRAVNI_ULAZI"],
    [{ modelSlug: "kling-3", params: { prompt: "x" }, inputMode: "image", inputs: { image: [image, image] } }, "najviše 1"],
    [{ modelSlug: "kling-3", params: { prompt: "x", nepoznat: 1 }, inputMode: "image", inputs: { image: [image] } }, 'nema parametar "nepoznat"'],
    [{ modelSlug: "kling-3", params: { prompt: "x", resolution: "8K" }, inputMode: "image", inputs: { image: [image] } }, 'prima samo: 720p, 1080p, 4K'],
    [{ modelSlug: "kling-3", params: { prompt: "x" }, inputMode: "image", inputs: { image: [image] }, sourceJobId: "x" }, "IZVOR_NIJE_PODRZAN"],
    [{ modelSlug: "flux-2-flash", params: { prompt: "x" }, inputMode: "image" }, "MODEL_NEDOSTUPAN"],
  ];
  for (const [args, expected] of cases) {
    const response = await call(t, rw, "create_generation", args);
    expect(response.error, JSON.stringify(args)).toBeUndefined();
    expect(response.result?.isError, JSON.stringify(args)).toBe(true);
    expect(textOf(response), JSON.stringify(args)).toContain(expected);
  }
  expect(await jobsOf(t, ownerId)).toEqual([]);
});

// ── P3: čekanje i izlaz ────────────────────────────────────────────────────

test("wait_for_job na poslu koji ostane running -> timedOut: true, bez izuzetka; gotov posao vraća izlaz", async () => {
  const { t, rw, ownerId } = await setup();
  const running = await seedJob(t, ownerId, 10, { status: "running", completedAt: undefined });

  const waited = JSON.parse(textOf(await call(t, rw, "wait_for_job", { jobId: running, timeoutSeconds: 1 })));
  expect(waited).toMatchObject({ jobId: running, status: "running", creditCost: 20, timedOut: true });
  expect(waited.message).toContain("wait_for_job");
  expect(waited).not.toHaveProperty("outputs");

  // Gotov posao SA sačuvanim izlazom je završno stanje: potpisan URL odmah.
  const output = await storeBlob(t, "slika", "image/png");
  const done = await seedJob(t, ownerId, 20, { outputStorageId: output, expiresAt: 999 });
  const finished = JSON.parse(textOf(await call(t, rw, "wait_for_job", { jobId: done })));
  expect(finished).toMatchObject({ jobId: done, status: "done", creditCost: 20, timedOut: false });
  expect(finished.outputs.outputUrl).toMatch(/^https?:\/\//);
  expect(finished.outputs).toMatchObject({ posterUrl: null, expiresAt: 999 });

  // Neuspeo posao je završno stanje sa greškom, bez izlaza.
  const failed = await seedJob(t, ownerId, 30, { status: "refunded", error: "MOCK_NEUSPEH" });
  const refunded = JSON.parse(textOf(await call(t, rw, "wait_for_job", { jobId: failed })));
  expect(refunded).toMatchObject({ status: "refunded", error: "MOCK_NEUSPEH", timedOut: false });

  const unknown = await call(t, rw, "wait_for_job", { jobId: "nije-id" });
  expect(unknown.result?.isError).toBe(true);
  expect(textOf(unknown)).toBe("Posao nije pronađen.");
});

test("get_output_url za tuđi posao -> 'Posao nije pronađen.'; sopstveni gotov posao daje potpisan URL", async () => {
  const { t, rw, ownerId, otherId } = await setup();
  const output = await storeBlob(t, "slika", "image/png");
  const foreign = await seedJob(t, otherId, 10, { outputStorageId: output });

  const denied = await call(t, rw, "get_output_url", { jobId: foreign });
  expect(denied.error).toBeUndefined();
  expect(denied.result?.isError).toBe(true);
  expect(textOf(denied)).toBe("Posao nije pronađen.");

  const own = await seedJob(t, ownerId, 20, { outputStorageId: output, expiresAt: 999 });
  const links = JSON.parse(textOf(await call(t, rw, "get_output_url", { jobId: own })));
  expect(links).toMatchObject({ jobId: own, kind: "image", posterUrl: null, expiresAt: 999 });
  expect(links.outputUrl).toMatch(/^https?:\/\//);

  // Gotov, ali izlaz još nije preuzet od provajdera - čitljiv razlog, ne 500.
  const pending = await seedJob(t, ownerId, 30);
  const early = await call(t, rw, "get_output_url", { jobId: pending });
  expect(early.result?.isError).toBe(true);
  expect(textOf(early)).toContain("IZLAZ_U_PRIPREMI");

  const running = await seedJob(t, ownerId, 40, { status: "running", completedAt: undefined });
  expect(textOf(await call(t, rw, "get_output_url", { jobId: running }))).toContain("POSAO_NIJE_GOTOV");
});
