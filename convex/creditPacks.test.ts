/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
  return t.mutation(api.seed.seedCreditPacks, { syncSecret: SYNC_SECRET });
}

test("seedCreditPacks upisuje svih 5 redova i ponovljen seed ne duplira", async () => {
  const t = convexTest(schema, modules);

  await runSeed(t);
  const firstRun = await t.run((ctx) => ctx.db.query("creditPacks").collect());
  expect(firstRun).toHaveLength(5);
  expect(new Set(firstRun.map((row) => row.slug))).toEqual(
    new Set(["basic", "premium", "starter", "creator", "pro"]),
  );

  await runSeed(t);
  const secondRun = await t.run((ctx) => ctx.db.query("creditPacks").collect());
  expect(secondRun).toHaveLength(5);
  expect(new Set(secondRun.map((row) => row._id))).toEqual(new Set(firstRun.map((row) => row._id)));
});

test("listPacks vraća samo aktivne pakete sortirane po sortOrder i poštuje kind filter", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);
  const admin = await seedAdmin(t);

  const all = await t.query(api.creditPacks.listPacks, {});
  expect(all.map((pack) => pack.slug)).toEqual(["basic", "premium", "starter", "creator", "pro"]);

  const plans = await t.query(api.creditPacks.listPacks, { kind: "plan" });
  expect(plans.map((pack) => pack.slug)).toEqual(["basic", "premium"]);
  const packs = await t.query(api.creditPacks.listPacks, { kind: "pack" });
  expect(packs.map((pack) => pack.slug)).toEqual(["starter", "creator", "pro"]);

  const premium = await t.query(api.creditPacks.getPackBySlug, { slug: "premium" });
  expect(premium).toMatchObject({ slug: "premium", credits: 2000, priceEurCents: 2499 });

  await admin.mutation(api.creditPacks.setPackActive, { packId: premium!._id, isActive: false });
  const afterDeactivate = await t.query(api.creditPacks.listPacks, {});
  expect(afterDeactivate.map((pack) => pack.slug)).toEqual(["basic", "starter", "creator", "pro"]);
});

test("listAllPacks vraća i ugašene pakete, zaštićen requireAdmin", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);
  const admin = await seedAdmin(t);
  const student = await seedStudent(t);
  const premium = await t.query(api.creditPacks.getPackBySlug, { slug: "premium" });
  await admin.mutation(api.creditPacks.setPackActive, { packId: premium!._id, isActive: false });

  await expect(student.query(api.creditPacks.listAllPacks, {})).rejects.toThrow("Forbidden");

  const all = await admin.query(api.creditPacks.listAllPacks, {});
  expect(all.map((pack) => pack.slug)).toEqual(["basic", "premium", "starter", "creator", "pro"]);
  expect(all.find((pack) => pack.slug === "premium")?.isActive).toBe(false);
});

test("upsertPack i setPackActive su zaštićeni sa requireAdmin", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);
  const student = await seedStudent(t);
  const starter = await t.query(api.creditPacks.getPackBySlug, { slug: "starter" });

  await expect(
    student.mutation(api.creditPacks.setPackActive, { packId: starter!._id, isActive: false }),
  ).rejects.toThrow("Forbidden");
  await expect(
    student.mutation(api.creditPacks.upsertPack, {
      slug: "starter",
      titleSr: "Starter",
      titleEn: "Starter",
      priceEurCents: 500,
      credits: 500,
      bonusPercent: 0,
      kind: "pack",
      sortOrder: 30,
      isActive: true,
    }),
  ).rejects.toThrow("Forbidden");
});

test("upsertPack menja postojeći red po slug-u umesto da ga duplira", async () => {
  const t = convexTest(schema, modules);
  await runSeed(t);
  const admin = await seedAdmin(t);
  const before = await t.query(api.creditPacks.getPackBySlug, { slug: "creator" });

  const updatedId: Id<"creditPacks"> = await admin.mutation(api.creditPacks.upsertPack, {
    slug: "creator",
    titleSr: "Creator",
    titleEn: "Creator",
    priceEurCents: 1500,
    credits: 1800,
    bonusPercent: 20,
    kind: "pack",
    sortOrder: 40,
    isActive: true,
  });

  expect(updatedId).toBe(before!._id);
  const rows = await t.run((ctx) => ctx.db.query("creditPacks").collect());
  expect(rows.filter((row) => row.slug === "creator")).toHaveLength(1);
  const after = await t.query(api.creditPacks.getPackBySlug, { slug: "creator" });
  expect(after).toMatchObject({ credits: 1800, bonusPercent: 20 });
});
