/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousSyncSecret = process.env.WEBHOOK_SYNC_SECRET;
const SYNC_SECRET = "test-sync-secret";
const EMAIL = "demo@example.com";

beforeAll(() => {
  process.env.WEBHOOK_SYNC_SECRET = SYNC_SECRET;
});

afterAll(() => {
  if (previousSyncSecret === undefined) delete process.env.WEBHOOK_SYNC_SECRET;
  else process.env.WEBHOOK_SYNC_SECRET = previousSyncSecret;
});

type TestConvex = ReturnType<typeof convexTest>;

function createTest() {
  return convexTest(schema, modules);
}

async function seedUser(t: TestConvex, email = EMAIL) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Demo Korisnik",
      username: "demo_korisnik",
      role: "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

async function readLots(t: TestConvex) {
  return await t.run((ctx) => ctx.db.query("creditLots").collect());
}

test("grantDemoCredits otvara admin_grant lot i podiže balans", async () => {
  const t = createTest();
  const userId = await seedUser(t);

  await t.mutation(api.seed.grantDemoCredits, {
    syncSecret: SYNC_SECRET,
    email: EMAIL,
    amount: 2000,
  });

  const lots = await readLots(t);
  expect(lots).toHaveLength(1);
  expect(lots[0].userId).toBe(userId);
  expect(lots[0].source).toBe("admin_grant");
  expect(lots[0].granted).toBe(2000);
  expect(lots[0].remaining).toBe(2000);

  const balance = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );
  expect(balance?.balance).toBe(2000);
  // Demo krediti nisu plaćeni, pa ne smeju da uđu u `lifetimePurchased`.
  expect(balance?.lifetimePurchased).toBe(0);

  const transactions = await t.run((ctx) => ctx.db.query("creditTransactions").collect());
  expect(transactions).toHaveLength(1);
  expect(transactions[0].type).toBe("admin_adjust");
  expect(transactions[0].amount).toBe(2000);
});

test("grantDemoCredits se sme ponoviti - drugi poziv otvara drugi lot", async () => {
  const t = createTest();
  const userId = await seedUser(t);

  await t.mutation(api.seed.grantDemoCredits, {
    syncSecret: SYNC_SECRET,
    email: EMAIL,
    amount: 500,
  });
  await t.mutation(api.seed.grantDemoCredits, {
    syncSecret: SYNC_SECRET,
    email: EMAIL,
    amount: 500,
  });

  const lots = await readLots(t);
  expect(lots).toHaveLength(2);
  expect(new Set(lots.map((lot) => lot.stripeSessionId)).size).toBe(2);

  const balance = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );
  expect(balance?.balance).toBe(1000);
});

test("grantDemoCredits nalazi korisnika i kad se mejl razlikuje po velikim slovima", async () => {
  const t = createTest();
  await seedUser(t);

  await t.mutation(api.seed.grantDemoCredits, {
    syncSecret: SYNC_SECRET,
    email: "  Demo@Example.COM ",
    amount: 100,
  });

  expect(await readLots(t)).toHaveLength(1);
});

test("grantDemoCredits odbija pogrešan syncSecret i ne upisuje ništa", async () => {
  const t = createTest();
  await seedUser(t);

  await expect(
    t.mutation(api.seed.grantDemoCredits, {
      syncSecret: "pogresan",
      email: EMAIL,
      amount: 2000,
    }),
  ).rejects.toThrow("Forbidden");

  expect(await readLots(t)).toHaveLength(0);
});

test("grantDemoCredits baca KORISNIK_NIJE_NADJEN za nepoznat mejl", async () => {
  const t = createTest();
  await seedUser(t);

  await expect(
    t.mutation(api.seed.grantDemoCredits, {
      syncSecret: SYNC_SECRET,
      email: "niko@example.com",
      amount: 2000,
    }),
  ).rejects.toThrow("KORISNIK_NIJE_NADJEN");

  expect(await readLots(t)).toHaveLength(0);
});

test("grantDemoCredits odbija iznos koji nije pozitivan ceo broj", async () => {
  const t = createTest();
  await seedUser(t);

  for (const amount of [0, -50, 2.5]) {
    await expect(
      t.mutation(api.seed.grantDemoCredits, { syncSecret: SYNC_SECRET, email: EMAIL, amount }),
    ).rejects.toThrow("NEVALIDAN_IZNOS");
  }

  expect(await readLots(t)).toHaveLength(0);
});
