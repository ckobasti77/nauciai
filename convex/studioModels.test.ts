/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api } from "./_generated/api";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";
import { parseParamSpec } from "./studioParamSpec";
import { parsePriceRule } from "./studioPricing";

const modules = import.meta.glob("./**/*.ts");
/** Redovi koje katalog povlači (`isEnabled: false`) - ne izlaze korisniku. */
const RETIRED = STUDIO_MODELS.filter((seed) => seed.isEnabled === false).length;
const previousSyncSecret = process.env.WEBHOOK_SYNC_SECRET;
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;
const SYNC_SECRET = "test-sync-secret";

beforeAll(() => {
  process.env.WEBHOOK_SYNC_SECRET = SYNC_SECRET;
  // Uloga "admin" se ne dodeljuje upisom u red nego preko `INITIAL_ADMIN_EMAILS`
  // (`helpers.effectiveRoleForProfile`) - isti obrazac kao `modelCatalog.test.ts`.
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
});

afterAll(() => {
  if (previousSyncSecret === undefined) delete process.env.WEBHOOK_SYNC_SECRET;
  else process.env.WEBHOOK_SYNC_SECRET = previousSyncSecret;
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

function createTest() {
  return convexTest(schema, modules);
}

test("seed upisuje ceo katalog i sva složena polja prežive put kroz bazu kao JSON", async () => {
  const t = createTest();

  const result = await t.mutation(api.studioModels.seedStudioModels, { syncSecret: SYNC_SECRET });
  expect(result).toEqual({ inserted: STUDIO_MODELS.length, updated: 0, total: STUDIO_MODELS.length });

  const rows = await t.run((ctx) => ctx.db.query("models").collect());
  expect(rows).toHaveLength(STUDIO_MODELS.length);

  for (const seed of STUDIO_MODELS) {
    const row = rows.find((candidate) => candidate.slug === seed.slug);
    expect(row, seed.slug).toBeDefined();
    if (!row) continue;

    expect(row.provider).toBe(seed.provider);
    expect(row.kind).toBe(seed.kind);
    expect(row.family).toBe(seed.family);
    expect(row.isEnabled, seed.slug).toBe(seed.isEnabled ?? true);
    expect(row.sortOrder).toBe(seed.sortOrder);

    // Pravilo i kontrole moraju da se pročitaju NAZAD onim istim funkcijama
    // kojima ih čita server kad naplaćuje - inače je seed tačan a naplata nije.
    expect(parsePriceRule(row.priceRule)).toEqual(seed.priceRule);
    expect(parseParamSpec(row.paramSpec)).toEqual(seed.paramSpec);
    expect(JSON.parse(row.inputModes)).toEqual(seed.inputModes);
    expect(JSON.parse(row.inputSpec)).toEqual(seed.inputSpec);
    expect(JSON.parse(row.endpoints)).toEqual(seed.endpoints);
    expect(JSON.parse(row.capabilities)).toEqual(seed.capabilities);
  }
});

test("ponovljen seed ne pravi duplikate i NE pali model koji je admin ugasio", async () => {
  const t = createTest();
  await t.mutation(api.studioModels.seedStudioModels, { syncSecret: SYNC_SECRET });

  // Admin gasi jedan model (kvota, sporan račun, model povučen kod provajdera).
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", "gemini-omni"))
      .unique();
    if (row) await ctx.db.patch(row._id, { isEnabled: false });
  });

  const second = await t.mutation(api.studioModels.seedStudioModels, { syncSecret: SYNC_SECRET });
  expect(second).toEqual({ inserted: 0, updated: STUDIO_MODELS.length, total: STUDIO_MODELS.length });

  const rows = await t.run((ctx) => ctx.db.query("models").collect());
  expect(rows).toHaveLength(STUDIO_MODELS.length);
  expect(rows.find((row) => row.slug === "gemini-omni")?.isEnabled).toBe(false);
  // Ostali su i dalje uključeni - Jovan traži pun katalog, minus ono što je
  // katalog povukao.
  expect(rows.filter((row) => row.isEnabled)).toHaveLength(STUDIO_MODELS.length - 1 - RETIRED);
});

test("sedam modela sa merenom dužinom seed upisuje UKLJUČENE", async () => {
  const t = createTest();
  await t.mutation(api.studioModels.seedStudioModels, { syncSecret: SYNC_SECRET });

  const rows = await t.run((ctx) => ctx.db.query("models").collect());
  for (const slug of [
    "kling-avatar",
    "kling-lipsync",
    "kling-motion",
    "stt",
    "voice-changer",
    "audio-isolation",
    "dubbing",
  ]) {
    expect(rows.find((row) => row.slug === slug)?.isEnabled, slug).toBe(true);
  }

  // W3 ih je povukao markerom `isEnabled: false`, jer je dužinu snimka merio
  // klijent; W5 ih vraća, jer je meri server iz zaglavlja fajla. Katalog trenutno
  // ne povlači nijedan model - grana u `seedStudioModels` koja gasi već upisan
  // red je time bez subjekta, a ne uklonjena: prvi sledeći marker je ponovo pali.
  expect(RETIRED).toBe(0);
});

test("seed bez tačnog sync secreta ne upisuje ništa", async () => {
  const t = createTest();

  await expect(
    t.mutation(api.studioModels.seedStudioModels, { syncSecret: "pogrešan" }),
  ).rejects.toThrow(/Forbidden/);

  const rows = await t.run((ctx) => ctx.db.query("models").collect());
  expect(rows).toHaveLength(0);
});

test("getModelBySlug čita red iz v4 kataloga, a nepoznat slug daje null", async () => {
  const t = createTest();
  await t.mutation(api.studioModels.seedStudioModels, { syncSecret: SYNC_SECRET });

  const found = await t.run(async (ctx) =>
    ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", "minimax-h3"))
      .unique(),
  );
  expect(found?.labelEn).toBe("MiniMax H3");

  const missing = await t.run(async (ctx) =>
    ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", "nema-me"))
      .unique(),
  );
  expect(missing).toBeNull();
});

// ── citanje i admin izmene (S7) ────────────────────────────────────────────

async function seedStudent(t: ReturnType<typeof createTest>, role: "student" | "admin" = "student") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: `${role}@example.com`,
      name: role,
      username: role,
      role,
      language: "sr" as const,
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

test("listModels trazi prijavu i ne izlaze rute kod provajdera", async () => {
  const t = createTest();
  await t.mutation(api.studioModels.seedStudioModels, { syncSecret: SYNC_SECRET });

  // `priceRule` nosi nabavnu cenu, a katalog 1.3 trazi da se ista funkcija
  // racuna i u browseru - zato je upit iza prijave, a ne javan.
  await expect(t.query(api.studioModels.listModels, {})).rejects.toThrow();

  const asUser = await seedStudent(t);
  const rows = await asUser.query(api.studioModels.listModels, {});
  expect(rows).toHaveLength(STUDIO_MODELS.length - RETIRED);
  expect(Object.hasOwn(rows[0], "endpoints")).toBe(false);
  expect(rows[0].priceRule).toBeTypeOf("string");
  // Sortirano po `sortOrder`-u, isto kao u seed-u.
  expect(rows.map((row) => row.sortOrder)).toEqual([...rows.map((row) => row.sortOrder)].sort((a, b) => a - b));
});

test("iskljucen model ne izlazi korisniku, ali izlazi adminu", async () => {
  const t = createTest();
  await t.mutation(api.studioModels.seedStudioModels, { syncSecret: SYNC_SECRET });
  const asAdmin = await seedStudent(t, "admin");
  const asUser = await seedStudent(t);

  const all = await asAdmin.query(api.studioModels.listAllModels, {});
  const target = all.find((row) => row.slug === "nano-banana-2");
  if (!target) throw new Error("nema reda");

  await asAdmin.mutation(api.studioModels.setModelEnabled, { modelId: target._id, isEnabled: false });

  const visible = await asUser.query(api.studioModels.listModels, {});
  expect(visible.some((row) => row.slug === "nano-banana-2")).toBe(false);
  expect((await asAdmin.query(api.studioModels.listAllModels, {})).length).toBe(STUDIO_MODELS.length);

  // Korisnik ne sme ni da gasi ni da menja cenu.
  await expect(
    asUser.mutation(api.studioModels.setModelEnabled, { modelId: target._id, isEnabled: true }),
  ).rejects.toThrow();
});

test("izmena nabavne cene menja pravilo u redu, a tabela cena ostaje netaknuta", async () => {
  const t = createTest();
  await t.mutation(api.studioModels.seedStudioModels, { syncSecret: SYNC_SECRET });
  const asAdmin = await seedStudent(t, "admin");
  const all = await asAdmin.query(api.studioModels.listAllModels, {});

  const flat = all.find((row) => row.slug === "seedream-45");
  if (!flat) throw new Error("nema seedream-45");
  await asAdmin.mutation(api.studioModels.setModelPrice, { modelId: flat._id, baseUsd: 0.05 });

  const updated = await t.run((ctx) => ctx.db.get(flat._id));
  expect(parsePriceRule(updated?.priceRule ?? "")?.baseUsd).toBe(0.05);

  // Pravilo koje cenu cita iz tabele odbija izmenu osnove umesto da je primi
  // i ne primeni.
  const lookup = all.find((row) => row.slug === "gpt-image-2");
  if (!lookup) throw new Error("nema gpt-image-2");
  await expect(
    asAdmin.mutation(api.studioModels.setModelPrice, { modelId: lookup._id, baseUsd: 0.1 }),
  ).rejects.toThrow("CENA_IZ_TABELE");
});

