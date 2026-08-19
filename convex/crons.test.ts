/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { usableBalance } from "./creditsCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type TestConvex = ReturnType<typeof convexTest>;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const JOB_COST = 20;
const GRANTED = 100;

type JobStatus = "reserved" | "running" | "done" | "failed" | "refunded";

async function seedUser(t: TestConvex) {
  return t.run((ctx) => ctx.db.insert("users", { email: "studio@example.com", name: "Student" }));
}

/** Posao sa skinutim kreditima, tačno kako ga `createJob` ostavlja. */
async function seedJob(
  t: TestConvex,
  opts: { status?: JobStatus; ageMinutes?: number; spend?: boolean } = {},
) {
  const userId = await seedUser(t);
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: GRANTED,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });

  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "flux-2-flash",
      kind: "image" as const,
      params: JSON.stringify({ prompt: "lisica u snegu" }),
      promptHash: "0123456789abcdef",
      status: opts.status ?? ("running" as const),
      creditCost: JOB_COST,
      createdAt: Date.now() - (opts.ageMinutes ?? 31) * MINUTE,
    }),
  );

  if (opts.spend !== false) {
    await t.mutation(internal.credits.spendCredits, { userId, amount: JOB_COST, jobId });
  }

  return { userId, jobId };
}

function jobOf(t: TestConvex, jobId: Id<"generationJobs">) {
  return t.run((ctx) => ctx.db.get(jobId));
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

function transactionsOf(t: TestConvex, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

// ── 1. reaper zaglavljenih poslova ─────────────────────────────────────────

test("running star 31 minut se refundira sa porukom ISTEKAO_BEZ_ODGOVORA", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedJob(t, { ageMinutes: 31 });
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);

  const result = await t.mutation(internal.crons.reapStuckJobs, {});

  expect(result).toEqual({ reaped: 1 });
  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("ISTEKAO_BEZ_ODGOVORA");
  expect(await balanceOf(t, userId)).toBe(GRANTED);
  const refunds = (await transactionsOf(t, userId)).filter((row) => row.type === "refund");
  expect(refunds).toHaveLength(1);
  expect(refunds[0].amount).toBe(JOB_COST);
});

test("running star 29 minuta se ne dira", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedJob(t, { ageMinutes: 29 });

  const result = await t.mutation(internal.crons.reapStuckJobs, {});

  expect(result).toEqual({ reaped: 0 });
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);
  expect((await transactionsOf(t, userId)).some((row) => row.type === "refund")).toBe(false);
});

test("reserved star 6 minuta se refundira, star 4 minuta ne", async () => {
  const t = convexTest(schema, modules);
  const stuck = await seedJob(t, { status: "reserved", ageMinutes: 6 });
  const fresh = await seedJob(t, { status: "reserved", ageMinutes: 4 });

  const result = await t.mutation(internal.crons.reapStuckJobs, {});

  expect(result).toEqual({ reaped: 1 });
  expect((await jobOf(t, stuck.jobId))?.status).toBe("refunded");
  expect(await balanceOf(t, stuck.userId)).toBe(GRANTED);
  expect((await jobOf(t, fresh.jobId))?.status).toBe("reserved");
  expect(await balanceOf(t, fresh.userId)).toBe(GRANTED - JOB_COST);
});

test("posao koji je već done se ne dira ma koliko bio star", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedJob(t, { status: "done", ageMinutes: 60 * 24 });

  const result = await t.mutation(internal.crons.reapStuckJobs, {});

  expect(result).toEqual({ reaped: 0 });
  expect((await jobOf(t, jobId))?.status).toBe("done");
  expect(await balanceOf(t, userId)).toBe(GRANTED - JOB_COST);
  expect((await transactionsOf(t, userId)).some((row) => row.type === "refund")).toBe(false);
});

test("reaper pušten dvaput refundira samo jednom", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedJob(t, { ageMinutes: 45 });

  await t.mutation(internal.crons.reapStuckJobs, {});
  const second = await t.mutation(internal.crons.reapStuckJobs, {});

  expect(second).toEqual({ reaped: 0 });
  expect((await jobOf(t, jobId))?.status).toBe("refunded");
  expect(await balanceOf(t, userId)).toBe(GRANTED);
  expect((await transactionsOf(t, userId)).filter((row) => row.type === "refund")).toHaveLength(1);
});

// ── 2. istek kredita ───────────────────────────────────────────────────────

/** Grant ide kroz `grantCredits` (keš je tako tačan), pa se rok gurne unazad. */
async function seedLot(t: TestConvex, userId: Id<"users">, amount: number, expiresAt: number) {
  const lotId = await t.mutation(internal.credits.grantCredits, {
    userId,
    amount,
    source: "purchase",
    idempotencyKey: { field: "stripeSessionId", value: `cs_${userId}_${expiresAt}_${amount}` },
  });
  await t.run((ctx) => ctx.db.patch(lotId, { expiresAt }));
  return lotId;
}

function lotsOf(t: TestConvex, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("creditLots")
      .withIndex("by_user_expiry", (q) => q.eq("userId", userId))
      .collect(),
  );
}

test("lot koji je istekao juče se gasi, balans padne, expiry red je upisan", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const staleLot = await seedLot(t, userId, 300, Date.now() - DAY);
  await seedLot(t, userId, 200, Date.now() + 30 * DAY);
  expect(await balanceOf(t, userId)).toBe(500);

  const result = await t.mutation(internal.crons.expireCredits, {});

  expect(result).toEqual({ expired: 1 });
  const lots = await lotsOf(t, userId);
  const expired = lots.find((lot) => lot._id === staleLot);
  expect(expired?.remaining).toBe(0);
  expect(expired?.exhaustedAt).toBeGreaterThan(0);
  expect(lots.find((lot) => lot._id !== staleLot)?.remaining).toBe(200);
  expect(await balanceOf(t, userId)).toBe(200);

  const expiryRows = (await transactionsOf(t, userId)).filter((row) => row.type === "expiry");
  expect(expiryRows).toHaveLength(1);
  expect(expiryRows[0].amount).toBe(-300);
  expect(expiryRows[0].balanceAfter).toBe(200);
  expect(expiryRows[0].lotId).toBe(staleLot);
});

test("nezastareo lot se ne dira ni posle dva prolaza", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedLot(t, userId, 200, Date.now() + DAY);

  await t.mutation(internal.crons.expireCredits, {});
  const second = await t.mutation(internal.crons.expireCredits, {});

  expect(second).toEqual({ expired: 0 });
  expect((await lotsOf(t, userId))[0].remaining).toBe(200);
  expect(await balanceOf(t, userId)).toBe(200);
  expect((await transactionsOf(t, userId)).some((row) => row.type === "expiry")).toBe(false);
});

test("već ugašen lot se ne gasi drugi put (drugi prolaz ne upisuje ništa)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedLot(t, userId, 300, Date.now() - DAY);

  await t.mutation(internal.crons.expireCredits, {});
  const second = await t.mutation(internal.crons.expireCredits, {});

  expect(second).toEqual({ expired: 0 });
  expect((await transactionsOf(t, userId)).filter((row) => row.type === "expiry")).toHaveLength(1);
  expect(await balanceOf(t, userId)).toBe(0);
});

test("invarijanta posle isteka: balans === zbir potrošivih lotova === zbir transakcija", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedLot(t, userId, 300, Date.now() - DAY);
  await seedLot(t, userId, 140, Date.now() - 3 * DAY);
  await seedLot(t, userId, 200, Date.now() + 30 * DAY);

  await t.mutation(internal.crons.expireCredits, {});

  const balance = await balanceOf(t, userId);
  const lots = await lotsOf(t, userId);
  const lotSum = usableBalance(
    lots.map((row) => ({ id: row._id, remaining: row.remaining, expiresAt: row.expiresAt })),
    Date.now(),
  );
  const transactionSum = (await transactionsOf(t, userId)).reduce((sum, row) => sum + row.amount, 0);

  expect(balance).toBe(200);
  expect(lotSum).toBe(balance);
  expect(transactionSum).toBe(balance);
});

// ── 3. istek fajlova ───────────────────────────────────────────────────────

async function seedFile(t: TestConvex) {
  return t.run((ctx) => ctx.storage.store(new Blob(["izlaz"])));
}

async function seedJobWithFile(
  t: TestConvex,
  opts: { expiresAt?: number; poster?: boolean } = {},
) {
  const { userId, jobId } = await seedJob(t, { status: "done", ageMinutes: 0 });
  const outputStorageId = await seedFile(t);
  const posterStorageId = opts.poster ? await seedFile(t) : undefined;
  await t.run((ctx) =>
    ctx.db.patch(jobId, { outputStorageId, posterStorageId, expiresAt: opts.expiresAt }),
  );
  return { userId, jobId, outputStorageId, posterStorageId };
}

function fileUrl(t: TestConvex, storageId: Id<"_storage">) {
  return t.run((ctx) => ctx.storage.getUrl(storageId));
}

test("prazan skup: prolaz ne radi ništa i ne puca", async () => {
  const t = convexTest(schema, modules);

  expect(await t.mutation(internal.crons.expireGenerationFiles, {})).toEqual({ cleared: 0 });
});

test("posao bez expiresAt (persistOutput još ne postoji) se ne dira", async () => {
  const t = convexTest(schema, modules);
  const { jobId, outputStorageId } = await seedJobWithFile(t);

  const result = await t.mutation(internal.crons.expireGenerationFiles, {});

  expect(result).toEqual({ cleared: 0 });
  expect((await jobOf(t, jobId))?.outputStorageId).toBe(outputStorageId);
  expect(await fileUrl(t, outputStorageId)).not.toBeNull();
});

test("istekao fajl se briše iz storage-a, red i metapodaci ostaju", async () => {
  const t = convexTest(schema, modules);
  const { jobId, outputStorageId, posterStorageId } = await seedJobWithFile(t, {
    expiresAt: Date.now() - DAY,
    poster: true,
  });

  const result = await t.mutation(internal.crons.expireGenerationFiles, {});

  expect(result).toEqual({ cleared: 1 });
  expect(await fileUrl(t, outputStorageId)).toBeNull();
  expect(await fileUrl(t, posterStorageId as Id<"_storage">)).toBeNull();

  // Red ostaje zauvek - galerija na njemu nudi "Generiši ponovo" (PLAN 0.2).
  const job = await jobOf(t, jobId);
  expect(job).not.toBeNull();
  expect(job?.outputStorageId).toBeUndefined();
  expect(job?.posterStorageId).toBeUndefined();
  expect(job?.modelSlug).toBe("flux-2-flash");
  expect(job?.creditCost).toBe(JOB_COST);
  expect(JSON.parse(job?.params ?? "{}")).toEqual({ prompt: "lisica u snegu" });
});

test("fajl kojem rok tek ističe se ne dira, a drugi prolaz nema šta da briše", async () => {
  const t = convexTest(schema, modules);
  const future = await seedJobWithFile(t, { expiresAt: Date.now() + DAY });
  await seedJobWithFile(t, { expiresAt: Date.now() - DAY });

  await t.mutation(internal.crons.expireGenerationFiles, {});
  const second = await t.mutation(internal.crons.expireGenerationFiles, {});

  expect(second).toEqual({ cleared: 0 });
  expect((await jobOf(t, future.jobId))?.outputStorageId).toBe(future.outputStorageId);
  expect(await fileUrl(t, future.outputStorageId)).not.toBeNull();
});
