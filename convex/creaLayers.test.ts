/// <reference types="vite/client" />

/**
 * K12: više izlaza jednog posla i lokalni koraci plaćenih alata.
 * - Slojevi (S20): Seedream 5 Pro „layerize" vraća jedan URL po sloju; prvi je
 *   izlaz posla, ostali postaju zasebni radovi (dete, `derivation: "sloj"`, 0 kr).
 *   Bez ključa DEMO daje providne SVG slojeve.
 * - Uglovi (S19): mreža 3×3 isečena na uređaju daje 9 zasebnih radova, svaki je
 *   dete mreže u stablu.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CAMERA_ANGLES, gridCells } from "../lib/crea-grid-crop";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { layerNumberOf, mockLayerDataUrls } from "./creaLayersCore";
import { SEEDREAM_5_PRO } from "./providers/bytePlusModels";
import schema from "./schema";
import { MOCK_REQUEST_PREFIX, mockJobSucceeds } from "./studioCore";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

/** Otisak koji klijent najavljuje uz dozvolu za lokalni rezultat (K29-01). */
async function localDigest(t: TestConvex, storageId: Id<"_storage">) {
  return t.run(async (ctx) => {
    const meta = await ctx.db.system.get("_storage", storageId);
    if (!meta) throw new Error("nema fajla");
    return { sha256: meta.sha256, size: meta.size };
  });
}

const BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const LAYER_URLS = [1, 2, 3, 4].map((n) => `https://byteplus.example/sloj-${n}.png`);
const JOB_COST = 7;

const previous = {
  base: process.env.BYTEPLUS_BASE_URL,
  key: process.env.BYTEPLUS_API_KEY,
  site: process.env.CONVEX_SITE_URL,
  mock: process.env.STUDIO_MOCK,
};

beforeEach(() => {
  delete process.env.BYTEPLUS_BASE_URL;
  delete process.env.BYTEPLUS_API_KEY;
  delete process.env.STUDIO_MOCK;
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of [
    ["BYTEPLUS_BASE_URL", previous.base],
    ["BYTEPLUS_API_KEY", previous.key],
    ["CONVEX_SITE_URL", previous.site],
    ["STUDIO_MOCK", previous.mock],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** Zakazane funkcije (`persistOutput`, poravnanje) se puštaju do kraja. */
async function settle(t: TestConvex) {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function seedSeedream(t: TestConvex) {
  const seed = SEEDREAM_5_PRO;
  await t.run((ctx) =>
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

async function seedUser(t: TestConvex, email = "slojevi@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Slojevi",
      username: email.split("@")[0],
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 1000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

/** Isto što `createJob` uradi atomski: rezervisan posao razlaganja i skinut kredit. */
async function seedLayerizeJob(t: TestConvex, userId: Id<"users">, layers = 4) {
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: SEEDREAM_5_PRO.slug,
      kind: "image",
      provider: "byteplus",
      params: JSON.stringify({ prompt: "rastavi na slojeve", resolution: "1.5K", layers }),
      promptHash: "abcdef0123456789",
      status: "reserved" as const,
      creditCost: JOB_COST,
      inputMode: "layerize",
      createdAt: Date.now(),
    }),
  );
  await t.mutation(internal.credits.spendCredits, { userId, amount: JOB_COST, jobId });
  return jobId;
}

function stubBytePlus(urls: readonly string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/images/generations")) {
        return new Response(JSON.stringify({ data: urls.map((entry) => ({ url: entry })) }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { "Content-Type": "image/png" } });
    }) as unknown as typeof fetch,
  );
}

async function balanceOf(t: TestConvex, userId: Id<"users">) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );
  return row?.balance ?? 0;
}

async function childrenOf(t: TestConvex, parentJobId: Id<"generationJobs">) {
  const jobs = await t.run((ctx) => ctx.db.query("generationJobs").collect());
  return jobs.filter((job) => job.parentJobId === parentJobId);
}

describe("slojevi (S20): više izlaza jednog razlaganja", () => {
  test("BytePlus vrati 4 sloja: glavni rad + 3 deteta (sloj 2-4), bez kredita, u stablu razlaganja", async () => {
    process.env.BYTEPLUS_BASE_URL = BASE_URL;
    process.env.BYTEPLUS_API_KEY = "test-key";
    const t = makeT();
    const { userId } = await seedUser(t);
    await seedSeedream(t);
    const jobId = await seedLayerizeJob(t, userId);
    const before = await balanceOf(t, userId);
    stubBytePlus(LAYER_URLS);

    await t.action(internal.studioActions.submitJob, { jobId });
    await settle(t);

    const main = await t.run((ctx) => ctx.db.get(jobId));
    expect(main).toMatchObject({ status: "done", falOutputUrl: LAYER_URLS[0], extraOutputUrls: LAYER_URLS.slice(1) });
    expect(main?.outputStorageId).toBeDefined();

    const children = await childrenOf(t, jobId);
    expect(children.map((job) => layerNumberOf(job.params)).sort()).toEqual([2, 3, 4]);
    for (const child of children) {
      expect(child).toMatchObject({
        userId,
        status: "done",
        creditCost: 0,
        estimatedCostUsd: 0,
        provider: "byteplus",
        inputMode: "layerize",
        modelSlug: "seedream-5-pro",
        rootJobId: jobId,
        derivation: "sloj",
      });
      expect(child.outputStorageId).toBeDefined();
      expect(child.expiresAt).toBeGreaterThan(Date.now());
      // Pravi posao ne pozajmljuje `falRequestId` (webhook ga traži kao jedinstven).
      expect(child.falRequestId).toBeUndefined();
    }
    // Plaćen je samo glavni posao (cena po sloju je u njegovoj rezervaciji).
    expect(await balanceOf(t, userId)).toBe(before);
  });

  test("getLayers vraća slojeve odozdo nagore za glavni rad i za svaki sloj; tuđ rad i obično slika nisu razlaganje", async () => {
    process.env.BYTEPLUS_BASE_URL = BASE_URL;
    process.env.BYTEPLUS_API_KEY = "test-key";
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedSeedream(t);
    const jobId = await seedLayerizeJob(t, userId);
    stubBytePlus(LAYER_URLS);
    await t.action(internal.studioActions.submitJob, { jobId });
    await settle(t);

    const layers = await asUser.query(api.creaLayers.getLayers, { jobId });
    expect(layers).toMatchObject({ mainJobId: jobId, status: "done", requested: 4, isMock: false });
    expect(layers!.layers.map((layer) => layer.number)).toEqual([1, 2, 3, 4]);
    expect(layers!.layers.every((layer) => typeof layer.url === "string")).toBe(true);

    const child = (await childrenOf(t, jobId))[0]!;
    const fromChild = await asUser.query(api.creaLayers.getLayers, { jobId: child._id });
    expect(fromChild?.mainJobId).toBe(jobId);
    expect(fromChild?.layers).toHaveLength(4);

    expect(await other.asUser.query(api.creaLayers.getLayers, { jobId })).toBeNull();
    const plain = await t.run((ctx) =>
      ctx.db.insert("generationJobs", {
        userId,
        modelSlug: "nano-banana-2",
        kind: "image",
        params: "{}",
        promptHash: "0",
        status: "done",
        creditCost: 16,
        inputMode: "image_multi",
        createdAt: Date.now(),
      }),
    );
    expect(await asUser.query(api.creaLayers.getLayers, { jobId: plain })).toBeNull();
    await expect(t.query(api.creaLayers.getLayers, { jobId })).rejects.toThrow();

    // K29-13: 120 starijih radova u istom stablu ne sakriva slojeve (traže se po roditelju).
    await t.run(async (ctx) => {
      for (let index = 0; index < 120; index += 1) {
        await ctx.db.insert("generationJobs", {
          userId,
          modelSlug: "nano-banana-2",
          kind: "image",
          params: "{}",
          promptHash: "0",
          status: "done",
          creditCost: 0,
          rootJobId: jobId,
          parentJobId: jobId,
          derivation: "regeneracija",
          createdAt: 1,
        });
      }
    });
    expect((await asUser.query(api.creaLayers.getLayers, { jobId }))!.layers).toHaveLength(4);
  });

  test("ponovljen upis istog sloja i ponovljen persistOutput ne prave duple radove", async () => {
    process.env.BYTEPLUS_BASE_URL = BASE_URL;
    process.env.BYTEPLUS_API_KEY = "test-key";
    const t = makeT();
    const { userId } = await seedUser(t);
    await seedSeedream(t);
    const jobId = await seedLayerizeJob(t, userId);
    stubBytePlus(LAYER_URLS);
    await t.action(internal.studioActions.submitJob, { jobId });
    await settle(t);

    await t.action(internal.studioActions.persistOutput, { jobId });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    expect(
      await t.mutation(internal.creaLayers.insertExtraOutput, { parentJobId: jobId, layerNumber: 3, storageId, byteSize: 1 }),
    ).toBe(false);
    // Van opsega slojeva se ne upisuje.
    expect(
      await t.mutation(internal.creaLayers.insertExtraOutput, { parentJobId: jobId, layerNumber: 99, storageId, byteSize: 1 }),
    ).toBe(false);
    expect(await childrenOf(t, jobId)).toHaveLength(3);
  });

  test("provajder sme da vrati najviše 16 dodatnih izlaza", async () => {
    process.env.BYTEPLUS_BASE_URL = BASE_URL;
    process.env.BYTEPLUS_API_KEY = "test-key";
    const t = makeT();
    const { userId } = await seedUser(t);
    await seedSeedream(t);
    const jobId = await seedLayerizeJob(t, userId, 17);
    stubBytePlus(Array.from({ length: 40 }, (_, index) => `https://byteplus.example/s-${index}.png`));
    await t.action(internal.studioActions.submitJob, { jobId });
    await settle(t);

    const main = await t.run((ctx) => ctx.db.get(jobId));
    expect(main?.extraOutputUrls).toHaveLength(16);
    expect(await childrenOf(t, jobId)).toHaveLength(16);
  });

  test("DEMO bez ključa: razlaganje stiže kao providni SVG slojevi, i deca su DEMO", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedSeedream(t);
    // DEMO posao namerno pada u ~15 % slučajeva (po id-ju) - uzima se prvi koji uspeva.
    let jobId = await seedLayerizeJob(t, userId, 3);
    for (let attempt = 0; attempt < 20 && !mockJobSucceeds(jobId); attempt += 1) jobId = await seedLayerizeJob(t, userId, 3);
    expect(mockJobSucceeds(jobId)).toBe(true);

    await t.action(internal.studioActions.submitJob, { jobId });
    const running = await t.run((ctx) => ctx.db.get(jobId));
    expect(running?.falRequestId?.startsWith(MOCK_REQUEST_PREFIX)).toBe(true);
    await t.action(internal.studioActions.completeMockJob, { jobId });
    await settle(t);

    const main = await t.run((ctx) => ctx.db.get(jobId));
    expect(main?.status).toBe("done");
    expect(main?.extraOutputUrls).toHaveLength(2);
    const children = await childrenOf(t, jobId);
    expect(children).toHaveLength(2);
    for (const child of children) expect(child.falRequestId?.startsWith(MOCK_REQUEST_PREFIX)).toBe(true);

    const layers = await asUser.query(api.creaLayers.getLayers, { jobId });
    expect(layers).toMatchObject({ isMock: true });
    expect(layers!.layers.map((layer) => layer.number)).toEqual([1, 2, 3]);
  });

  test("DEMO slojevi: prvi je pun, ostali providni, broj se svodi na 2-17", () => {
    const layers = mockLayerDataUrls("rastavi", "abcd", 4).map((url) => decodeURIComponent(url.split(",")[1]!));
    expect(layers).toHaveLength(4);
    expect(layers[0]).toContain("<rect");
    for (const layer of layers.slice(1)) {
      expect(layer).not.toContain("<rect");
      expect(layer).toContain("<circle");
    }
    expect(mockLayerDataUrls("x", "0", 1)).toHaveLength(2);
    expect(mockLayerDataUrls("x", "0", 99)).toHaveLength(17);
    expect(decodeURIComponent(mockLayerDataUrls("<b>&", "0", 2)[0]!)).toContain("&lt;b&gt;&amp;");
  });
});

describe("uglovi kamere (S19): mreža → 9 radova", () => {
  async function storeJpeg(t: TestConvex) {
    return t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["jpeg-bajtovi"]));
      // `convex-test` iz `Blob`-a ne prenosi tip, pa se `_storage` red dopunjuje (isti obrazac kao `creaLocal.test.ts`).
      const meta: Record<string, unknown> = { contentType: "image/jpeg" };
      await ctx.db.patch(id as unknown as Id<"studioUploads">, meta);
      return id;
    });
  }

  test("9 isečaka mreže se čuva kao 9 zasebnih radova, svaki dete mreže, 0 kr", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const gridJobId = await t.run((ctx) =>
      ctx.db.insert("generationJobs", {
        userId,
        modelSlug: "nano-banana-2",
        kind: "image",
        provider: "google",
        params: JSON.stringify({ prompt: "Mreža 3×3 od devet kadrova istog subjekta.", resolution: "4K", aspect_ratio: "1:1" }),
        promptHash: "0",
        status: "done",
        creditCost: 33,
        inputMode: "image_multi",
        createdAt: Date.now(),
      }),
    );
    const before = await balanceOf(t, userId);

    // Isto što radi alat: mreža 4096² → 9 polja → svako polje jedan upload + upis.
    const cells = gridCells(4096, 4096);
    expect(cells).toHaveLength(9);
    for (const cell of cells) {
      const storageId = await storeJpeg(t);
      const { grantId } = await asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image", ...(await localDigest(t, storageId)) });
      const result = await asUser.mutation(api.creaLocal.saveLocalResult, {
        grantId,
        storageId,
        toolId: "slika.uglovi",
        kind: "image",
        params: JSON.stringify({ ugao: CAMERA_ANGLES[cell.index]!.id, polje: cell.index + 1 }),
        parentJobId: gridJobId,
      });
      expect(result, `polje ${cell.index + 1}`).toMatchObject({ ok: true });
    }

    const children = await childrenOf(t, gridJobId);
    expect(children).toHaveLength(9);
    expect(new Set(children.map((job) => job._id)).size).toBe(9);
    expect(new Set(children.map((job) => job.outputStorageId)).size).toBe(9);
    for (const child of children) {
      expect(child).toMatchObject({
        modelSlug: "local:slika.uglovi",
        provider: "local",
        creditCost: 0,
        status: "done",
        rootJobId: gridJobId,
        derivation: "lokalni-alat",
      });
    }
    expect(children.map((job) => JSON.parse(job.params).polje).sort((a: number, b: number) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(await balanceOf(t, userId)).toBe(before);
  });

  test("plaćeni alati bez lokalnog koraka i dalje ne smeju kroz `saveLocalResult`", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    for (const toolId of ["slika.svetlo", "slika.cetkica"]) {
      const storageId = await storeJpeg(t);
      const { grantId } = await asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image", ...(await localDigest(t, storageId)) });
      const result = await asUser.mutation(api.creaLocal.saveLocalResult, { grantId, storageId, toolId, kind: "image" });
      expect(result, toolId).toEqual({ ok: false, reason: "NEPOZNAT_ALAT" });
    }
  });
});
