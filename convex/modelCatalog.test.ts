/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;
const previousSyncSecret = process.env.WEBHOOK_SYNC_SECRET;
const SYNC_SECRET = "test-sync-secret";

beforeAll(() => {
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
  process.env.WEBHOOK_SYNC_SECRET = SYNC_SECRET;
});

afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
  if (previousSyncSecret === undefined) delete process.env.WEBHOOK_SYNC_SECRET;
  else process.env.WEBHOOK_SYNC_SECRET = previousSyncSecret;
});

type TestConvex = ReturnType<typeof convexTest>;

async function seedAdmin(t: TestConvex) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "admin@example.com",
      name: "Studio Admin",
      username: "studio_admin",
      role: "admin",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return t.withIdentity({ subject: adminId, tokenIdentifier: `test|${adminId}` });
}

async function seedStudent(t: TestConvex) {
  const studentId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "student@example.com",
      name: "Studio Student",
      username: "studio_student",
      role: "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return t.withIdentity({ subject: studentId, tokenIdentifier: `test|${studentId}` });
}

async function runSeed(t: TestConvex) {
  return t.mutation(api.seed.seedModelCatalog, { syncSecret: SYNC_SECRET });
}

test("seedModelCatalog upisuje sve modele i ponovljen seed ne duplira", async () => {
  const t = convexTest(schema, modules);

  await runSeed(t);
  const firstRun = await t.run((ctx) => ctx.db.query("modelCatalog").collect());
  // FLUX je izbačen iz `modelCatalogSeeds` (R5, W7): 22 - 2 = 20.
  expect(firstRun).toHaveLength(20);

  await runSeed(t);
  const secondRun = await t.run((ctx) => ctx.db.query("modelCatalog").collect());
  expect(secondRun).toHaveLength(firstRun.length);
  expect(new Set(secondRun.map((row) => row._id))).toEqual(new Set(firstRun.map((row) => row._id)));
});

test("listModels vraća samo isEnabled modele, sortirane po sortOrder, i poštuje kind filter", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);

  // Svaki red starog kataloga se sad seed-uje ugašen (R5, W7) - v4 katalog
  // pokriva svaku porodicu. Prazan javni spisak je zato TAČNO stanje, ne
  // propust testa.
  const seeded = await t.run((ctx) => ctx.db.query("modelCatalog").collect());
  expect(seeded.length).toBeGreaterThan(0);
  expect(seeded.every((model) => !model.isEnabled)).toBe(true);
  expect(await t.query(api.modelCatalog.listModels, {})).toEqual([]);
  expect(await t.query(api.modelCatalog.listModels, { kind: "video" })).toHaveLength(0);
  expect(await t.query(api.modelCatalog.listModels, { kind: "audio" })).toHaveLength(0);

  // Filter i sortiranje se i dalje proveravaju - samo je ovde uslov da red bude
  // vidljiv naveden eksplicitno, umesto da se osloni na seed koji više ne
  // uključuje nijedan legacy red.
  const nanoBanana2 = seeded.find((model) => model.slug === "nano-banana-2");
  await t.run((ctx) => ctx.db.patch(nanoBanana2!._id, { isEnabled: true }));

  const all = await t.query(api.modelCatalog.listModels, {});
  expect(all).toHaveLength(1);
  expect(all[0]?.slug).toBe("nano-banana-2");
  expect(all[0]?.badge).toBe("preporuceno");
  expect(all.every((model) => model.kind === "image")).toBe(true);
  const sortOrders = all.map((model) => model.sortOrder);
  expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
});

test("listModels ne vraća falEndpoint ni estimatedCostUsd - upit je javan", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);
  // Svi legacy redovi su sad ugašeni (R5) - da bi se testirala projekcija
  // javnog upita, jedan red se ovde ručno pali, kao u testu iznad.
  const nanoBanana2 = await t.run(async (ctx) =>
    (await ctx.db.query("modelCatalog").collect()).find((model) => model.slug === "nano-banana-2"),
  );
  await t.run((ctx) => ctx.db.patch(nanoBanana2!._id, { isEnabled: true }));

  const all = await t.query(api.modelCatalog.listModels, {});
  expect(all.length).toBeGreaterThan(0);

  // `NEXT_PUBLIC_CONVEX_URL` je u browser bundle-u, pa je ovo doslovno ono što
  // može da pročita bilo ko sa interneta, bez naloga. Nabavna cena, endpoint,
  // provajder i pinovana rezolucija iz `defaultParams` ostaju unutra.
  for (const model of all) {
    const row = model as Record<string, unknown>;
    expect(row.falEndpoint).toBeUndefined();
    expect(row.estimatedCostUsd).toBeUndefined();
    expect(row.provider).toBeUndefined();
    expect(row.defaultParams).toBeUndefined();
  }

  // A ono što ekran crta i dalje stiže.
  const nanoBanana2Public = all.find((model) => model.slug === "nano-banana-2");
  expect(nanoBanana2Public).toMatchObject({ kind: "image", badge: "preporuceno" });
  expect(nanoBanana2Public?.creditCost).toBeGreaterThan(0);
  expect(typeof nanoBanana2Public?.paramSchema).toBe("string");
  expect(typeof nanoBanana2Public?.labelSr).toBe("string");
  expect(typeof nanoBanana2Public?.descriptionEn).toBe("string");

  // Admin i dalje vidi nabavnu cenu - bez nje P8 ne može da izračuna maržu.
  const admin = await seedAdmin(t);
  const adminRows = await admin.query(api.modelCatalog.listAllModels, {});
  expect(adminRows.every((model) => typeof model.estimatedCostUsd === "number")).toBe(true);
  expect(adminRows.every((model) => typeof model.falEndpoint === "string")).toBe(true);
});

test("getModelBySlug vraća cenu koja se poklapa sa STUDIO-PLAN §2.3 za bar 3 nasumična modela", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);

  // FLUX je izbačen iz `modelCatalogSeeds` (R5, W7) - katalog §7 ga isključuje
  // i nema svog naslednika u v4, pa ne postoji ni ovde.
  const flux2Flash = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "flux-2-flash" }),
  );
  expect(flux2Flash).toBeNull();

  const seedream45 = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "seedream-45" }),
  );
  expect(seedream45).toMatchObject({
    falEndpoint: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    creditCost: 10,
    estimatedCostUsd: 0.04,
    isEnabled: false,
  });

  const veo31Lite = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "veo-31-lite-720p" }),
  );
  expect(veo31Lite).toMatchObject({
    falEndpoint: "fal-ai/veo3.1/lite",
    creditCost: 55,
    estimatedCostUsd: 0.25,
    isEnabled: false,
  });

  const klingV3Pro = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "kling-v3-pro-audio" }),
  );
  expect(klingV3Pro).toMatchObject({
    falEndpoint: "fal-ai/kling-video/v3/pro",
    creditCost: 185,
    estimatedCostUsd: 0.84,
    badge: "skupo",
  });

  const missing = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "does-not-exist" }),
  );
  expect(missing).toBeNull();
});

test("listAllModels vraća i isključene modele, zaštićen requireAdmin", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);
  const admin = await seedAdmin(t);
  const student = await seedStudent(t);

  await expect(student.query(api.modelCatalog.listAllModels, {})).rejects.toThrow("Forbidden");

  const all = await admin.query(api.modelCatalog.listAllModels, {});
  expect(all).toHaveLength(20);
  expect(all.some((model) => !model.isEnabled)).toBe(true);
  const sortOrders = all.map((model) => model.sortOrder);
  expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
});

test("upsertModel, setModelEnabled i setModelCost su zaštićeni sa requireAdmin", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);
  const student = await seedStudent(t);
  const seedream45 = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "seedream-45" }),
  );

  await expect(
    student.mutation(api.modelCatalog.setModelEnabled, {
      modelId: seedream45!._id,
      isEnabled: false,
    }),
  ).rejects.toThrow("Forbidden");
  await expect(
    student.mutation(api.modelCatalog.setModelCost, {
      modelId: seedream45!._id,
      creditCost: 1,
    }),
  ).rejects.toThrow("Forbidden");
  await expect(
    student.mutation(api.modelCatalog.upsertModel, {
      slug: "seedream-45",
      kind: "image",
      labelSr: "x",
      labelEn: "x",
      descriptionSr: "x",
      descriptionEn: "x",
      provider: "fal",
      falEndpoint: "fal-ai/bytedance/seedream/v4.5/text-to-image",
      defaultParams: "{}",
      paramSchema: "[]",
      creditCost: 1,
      estimatedCostUsd: 0.001,
      isEnabled: true,
      sortOrder: 10,
    }),
  ).rejects.toThrow("Forbidden");
});

test("setModelEnabled i setModelCost menjaju postojeći red bez dupliranja", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);
  const admin = await seedAdmin(t);
  const before = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "seedance-20-mini-480p" }),
  );
  expect(before?.isEnabled).toBe(false);

  await admin.mutation(api.modelCatalog.setModelEnabled, {
    modelId: before!._id,
    isEnabled: true,
  });
  await admin.mutation(api.modelCatalog.setModelCost, {
    modelId: before!._id,
    creditCost: 99,
    estimatedCostUsd: 0.5,
  });

  const after = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "seedance-20-mini-480p" }),
  );
  expect(after).toMatchObject({ _id: before!._id, isEnabled: true, creditCost: 99, estimatedCostUsd: 0.5 });

  const rows = await t.run((ctx) => ctx.db.query("modelCatalog").collect());
  expect(rows.filter((row) => row.slug === "seedance-20-mini-480p")).toHaveLength(1);
});

test("slugovi koji dele endpoint razlikuju se rezolucijom iz defaultParams, ne iz šeme", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);

  const bySlug = async (slug: string) =>
    t.run((ctx) => ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug }));

  const pairs = [
    ["nano-banana-2", "nano-banana-2-2k", "1K", "2K"],
    ["nano-banana-pro", "nano-banana-pro-4k", "1K", "4K"],
  ] as const;

  for (const [cheapSlug, expensiveSlug, cheapResolution, expensiveResolution] of pairs) {
    const cheap = await bySlug(cheapSlug);
    const expensive = await bySlug(expensiveSlug);

    // Isti endpoint, različita cena - jedina razlika mora da bude serverska.
    expect(cheap?.falEndpoint).toBe(expensive?.falEndpoint);
    expect(expensive!.creditCost).toBeGreaterThan(cheap!.creditCost);
    expect(JSON.parse(cheap!.defaultParams).resolution).toBe(cheapResolution);
    expect(JSON.parse(expensive!.defaultParams).resolution).toBe(expensiveResolution);

    // Da je `resolution` u šemi, jeftiniji slug bi se plaćao a skuplji dobijao.
    const schemaKeys = (JSON.parse(cheap!.paramSchema) as { key: string }[]).map(
      (field) => field.key,
    );
    expect(schemaKeys).not.toContain("resolution");
  }
});
