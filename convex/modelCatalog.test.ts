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
  expect(firstRun).toHaveLength(22);

  await runSeed(t);
  const secondRun = await t.run((ctx) => ctx.db.query("modelCatalog").collect());
  expect(secondRun).toHaveLength(firstRun.length);
  expect(new Set(secondRun.map((row) => row._id))).toEqual(new Set(firstRun.map((row) => row._id)));
});

test("listModels vraća samo isEnabled modele, sortirane po sortOrder, i poštuje kind filter", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);

  const all = await t.query(api.modelCatalog.listModels, {});
  expect(all.length).toBeGreaterThan(0);
  expect(all.every((model) => model.isEnabled)).toBe(true);
  expect(all.every((model) => model.kind === "image")).toBe(true);
  const sortOrders = all.map((model) => model.sortOrder);
  expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));

  const video = await t.query(api.modelCatalog.listModels, { kind: "video" });
  expect(video).toHaveLength(0);
  const audio = await t.query(api.modelCatalog.listModels, { kind: "audio" });
  expect(audio).toHaveLength(0);

  const nanoBanana2 = all.find((model) => model.slug === "nano-banana-2");
  expect(nanoBanana2?.badge).toBe("preporuceno");
});

test("getModelBySlug vraća cenu koja se poklapa sa STUDIO-PLAN §2.3 za bar 3 nasumična modela", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);

  const flux2Flash = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "flux-2-flash" }),
  );
  expect(flux2Flash).toMatchObject({
    falEndpoint: "fal-ai/flux-2/flash",
    creditCost: 3,
    estimatedCostUsd: 0.005,
    isEnabled: true,
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

test("upsertModel, setModelEnabled i setModelCost su zaštićeni sa requireAdmin", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);
  const student = await seedStudent(t);
  const flux2Flash = await t.run((ctx) =>
    ctx.runQuery(internal.modelCatalog.getModelBySlug, { slug: "flux-2-flash" }),
  );

  await expect(
    student.mutation(api.modelCatalog.setModelEnabled, {
      modelId: flux2Flash!._id,
      isEnabled: false,
    }),
  ).rejects.toThrow("Forbidden");
  await expect(
    student.mutation(api.modelCatalog.setModelCost, {
      modelId: flux2Flash!._id,
      creditCost: 1,
    }),
  ).rejects.toThrow("Forbidden");
  await expect(
    student.mutation(api.modelCatalog.upsertModel, {
      slug: "flux-2-flash",
      kind: "image",
      labelSr: "x",
      labelEn: "x",
      descriptionSr: "x",
      descriptionEn: "x",
      provider: "fal",
      falEndpoint: "fal-ai/flux-2/flash",
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
