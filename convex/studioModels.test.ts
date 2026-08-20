/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api } from "./_generated/api";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";
import { parseParamSpec } from "./studioParamSpec";
import { parsePriceRule } from "./studioPricing";

const modules = import.meta.glob("./**/*.ts");
const previousSyncSecret = process.env.WEBHOOK_SYNC_SECRET;
const SYNC_SECRET = "test-sync-secret";

beforeAll(() => {
  process.env.WEBHOOK_SYNC_SECRET = SYNC_SECRET;
});

afterAll(() => {
  if (previousSyncSecret === undefined) delete process.env.WEBHOOK_SYNC_SECRET;
  else process.env.WEBHOOK_SYNC_SECRET = previousSyncSecret;
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
    expect(row.isEnabled).toBe(true);
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
  // Ostali su i dalje uključeni - Jovan traži pun katalog.
  expect(rows.filter((row) => row.isEnabled)).toHaveLength(STUDIO_MODELS.length - 1);
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
