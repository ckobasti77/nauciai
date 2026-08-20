/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { usableBalance } from "./creditsCore";
import schema from "./schema";
import { dayKey, GLOBAL_COST_HEARTBEAT_KEY, STUDIO_FLAG_KEY } from "./studioCore";

const modules = import.meta.glob("./**/*.ts");

type TestConvex = ReturnType<typeof convexTest>;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const JOB_COST = 20;
const GRANTED = 100;

type JobStatus = "reserved" | "running" | "done" | "failed" | "refunded";

// Globalni plafon troška čita Resend ključ i listu admina iz env-a; ostatak
// fajla ih ne dira, ali se ipak vraćaju kakvi su bili (isti obrazac kao
// `studioActions.test.ts`).
const previousResendKey = process.env.AUTH_RESEND_KEY;
const previousResendFrom = process.env.AUTH_RESEND_FROM;
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

beforeEach(() => {
  process.env.AUTH_RESEND_KEY = "re_test_key";
  process.env.AUTH_RESEND_FROM = "Nauči AI <studio@nauciai.rs>";
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com,drugi@example.com";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousResendKey === undefined) delete process.env.AUTH_RESEND_KEY;
  else process.env.AUTH_RESEND_KEY = previousResendKey;
  if (previousResendFrom === undefined) delete process.env.AUTH_RESEND_FROM;
  else process.env.AUTH_RESEND_FROM = previousResendFrom;
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

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

  expect(await t.mutation(internal.crons.expireGenerationFiles, {})).toEqual({
    cleared: 0,
    uploads: 0,
    grants: 0,
  });
});

test("posao bez expiresAt (persistOutput još ne postoji) se ne dira", async () => {
  const t = convexTest(schema, modules);
  const { jobId, outputStorageId } = await seedJobWithFile(t);

  const result = await t.mutation(internal.crons.expireGenerationFiles, {});

  expect(result).toEqual({ cleared: 0, uploads: 0, grants: 0 });
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

  expect(result).toEqual({ cleared: 1, uploads: 0, grants: 0 });
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

  expect(second).toEqual({ cleared: 0, uploads: 0, grants: 0 });
  expect((await jobOf(t, future.jobId))?.outputStorageId).toBe(future.outputStorageId);
  expect(await fileUrl(t, future.outputStorageId)).not.toBeNull();
});

// ── 3b. istek nevezanih ulaznih uploada (nalaz R4) ─────────────────────────

/**
 * Red `studioUploads` kakav ostavlja `studio.registerInputUpload`. `expiresAt`
 * nosi samo upload koji nije ušao ni u jedan posao; `createJob` ga sklanja.
 */
async function seedUpload(t: TestConvex, opts: { expiresAt?: number } = {}) {
  const userId = await seedUser(t);
  const storageId = await seedFile(t);
  const uploadId = await t.run((ctx) =>
    ctx.db.insert("studioUploads", {
      userId,
      storageId,
      slot: "image",
      bytes: 5,
      mimeType: "image/png",
      createdAt: Date.now() - DAY,
      expiresAt: opts.expiresAt,
    }),
  );

  return { userId, uploadId, storageId };
}

test("nevezan upload stariji od 24 h nestaje - i fajl i red", async () => {
  const t = convexTest(schema, modules);
  const { uploadId, storageId } = await seedUpload(t, { expiresAt: Date.now() - MINUTE });

  const result = await t.mutation(internal.crons.expireGenerationFiles, {});

  expect(result).toEqual({ cleared: 0, uploads: 1, grants: 0 });
  // Za razliku od izlaza, ovde nestaje i red: bez njega fajl nema nijednu
  // referencu u bazi, pa bi ostao zauvek naplativ.
  expect(await fileUrl(t, storageId)).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(uploadId))).toBeNull();
});

test("upload koji je ušao u posao se ne briše, ma koliko star bio", async () => {
  const t = convexTest(schema, modules);
  // `createJob` je sklonio `expiresAt`, pa upload nema rok - iako je red
  // upisan pre 24 h i stoji u istom indeksu ispod svakog broja.
  const { uploadId, storageId } = await seedUpload(t);
  const orphan = await seedUpload(t, { expiresAt: Date.now() - MINUTE });

  const result = await t.mutation(internal.crons.expireGenerationFiles, {});

  expect(result).toEqual({ cleared: 0, uploads: 1, grants: 0 });
  expect(await fileUrl(t, storageId)).not.toBeNull();
  expect(await t.run((ctx) => ctx.db.get(uploadId))).not.toBeNull();
  expect(await t.run((ctx) => ctx.db.get(orphan.uploadId))).toBeNull();
});

test("upload kojem rok tek ističe se ne dira", async () => {
  const t = convexTest(schema, modules);
  const { uploadId, storageId } = await seedUpload(t, { expiresAt: Date.now() + MINUTE });

  expect(await t.mutation(internal.crons.expireGenerationFiles, {})).toEqual({
    cleared: 0,
    uploads: 0,
    grants: 0,
  });
  expect(await fileUrl(t, storageId)).not.toBeNull();
  expect(await t.run((ctx) => ctx.db.get(uploadId))).not.toBeNull();
});

// ── 3c. istek dozvola za upload (X5, nalaz N3) ─────────────────────────────

/** Jedna dozvola kakvu ostavlja `studio.createInputUploadUrl`. */
async function seedGrant(t: TestConvex, opts: { expiresAt: number; usedAt?: number }) {
  const userId = await seedUser(t);

  return t.run((ctx) =>
    ctx.db.insert("studioUploadGrants", {
      userId,
      slot: "image",
      createdAt: Date.now() - MINUTE,
      expiresAt: opts.expiresAt,
      usedAt: opts.usedAt,
    }),
  );
}

test("isti prolaz briše i istekle i iskorišćene dozvole za upload", async () => {
  const t = convexTest(schema, modules);
  const expired = await seedGrant(t, { expiresAt: Date.now() - MINUTE });
  // Potrošena dozvola nosi isti rok kao i nepotrošena, pa nestaje istim
  // pravilom - njoj poseban prolaz ne treba.
  const used = await seedGrant(t, { expiresAt: Date.now() - MINUTE, usedAt: Date.now() - MINUTE });
  const fresh = await seedGrant(t, { expiresAt: Date.now() + MINUTE });

  const result = await t.mutation(internal.crons.expireGenerationFiles, {});

  expect(result).toEqual({ cleared: 0, uploads: 0, grants: 2 });
  expect(await t.run((ctx) => ctx.db.get(expired))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(used))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(fresh))).not.toBeNull();
});

// ── 4. globalni dnevni plafon troška ───────────────────────────────────────

/** Jedan red `studioUsageDaily`; `day` je podrazumevano današnji UTC dan. */
async function seedUsage(t: TestConvex, costUsd: number, day = dayKey(Date.now())) {
  const userId = await seedUser(t);
  await t.run((ctx) =>
    ctx.db.insert("studioUsageDaily", {
      userId,
      day,
      generations: 1,
      creditsSpent: 100,
      costUsd,
    }),
  );
  return userId;
}

/** Resend koji uvek uspe; `mock.calls` čuva telo svakog poziva. */
function stubResendOk() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
  }));
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return fetchMock;
}

function sentEmails(fetchMock: ReturnType<typeof stubResendOk>) {
  return fetchMock.mock.calls.map((call) =>
    JSON.parse(String((call[1] as RequestInit).body)),
  ) as Array<{ from: string; to: string[]; subject: string; text: string }>;
}

function studioEnabled(t: TestConvex) {
  return t.run(async (ctx) => {
    const flag = await ctx.db
      .query("platformFlags")
      .withIndex("by_key", (q) => q.eq("key", STUDIO_FLAG_KEY))
      .unique();
    return flag ? flag.enabled : true;
  });
}

function alarmDays(t: TestConvex) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query("studioCostAlarms").collect();
    return rows.map((row) => row.day);
  });
}

test("ispod praga: nema mejla, nema alarm reda, Studio ostaje upaljen", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 30);
  await seedUsage(t, 19.99);
  const fetchMock = stubResendOk();

  const result = await t.action(internal.crons.enforceGlobalCostCap, {});

  expect(result.action).toBe("none");
  expect(result.totalCostUsd).toBeCloseTo(49.99, 5);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await alarmDays(t)).toEqual([]);
  expect(await studioEnabled(t)).toBe(true);
});

test("tačno na 50 $ se ne alarmira - prag je STROGO preko", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 50);
  const fetchMock = stubResendOk();

  expect((await t.action(internal.crons.enforceGlobalCostCap, {})).action).toBe("none");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await alarmDays(t)).toEqual([]);
});

test("preko 50 $: alarm ide adminima tačno jednom po danu, Studio ostaje upaljen", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 50.01);
  const fetchMock = stubResendOk();

  const first = await t.action(internal.crons.enforceGlobalCostCap, {});
  const second = await t.action(internal.crons.enforceGlobalCostCap, {});
  const third = await t.action(internal.crons.enforceGlobalCostCap, {});

  expect(first.action).toBe("alarm");
  expect(second.action).toBe("none");
  expect(third.action).toBe("none");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await alarmDays(t)).toEqual([dayKey(Date.now())]);
  // Alarm je poziv da neko pogleda, ne gašenje - Studio i dalje prima poslove.
  expect(await studioEnabled(t)).toBe(true);

  const [email] = sentEmails(fetchMock);
  expect(email.to).toEqual(["admin@example.com", "drugi@example.com"]);
  expect(email.subject).toContain("50.01");
  expect(email.text).toContain(dayKey(Date.now()));
});

test("preko 100 $: flag se gasi i mejl kaže kako se Studio vraća", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 60);
  await seedUsage(t, 40.5);
  const fetchMock = stubResendOk();

  const result = await t.action(internal.crons.enforceGlobalCostCap, {});

  expect(result.action).toBe("kill");
  expect(result.totalCostUsd).toBeCloseTo(100.5, 5);
  expect(await studioEnabled(t)).toBe(false);
  // Kill preskače alarm: skok sa nule na 100 $ u jednom prozoru ne ostavlja
  // alarm red, i ne treba mu - ugašen Studio je sam sebi pamćenje.
  expect(await alarmDays(t)).toEqual([]);

  const [email] = sentEmails(fetchMock);
  expect(email.subject).toContain("UGAŠEN");
  expect(email.text).toContain("/sr/app/admin/studio");
});

test("već ugašen Studio se ne gasi drugi put i ne šalje drugi mejl", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 250);
  const fetchMock = stubResendOk();

  await t.action(internal.crons.enforceGlobalCostCap, {});
  const second = await t.action(internal.crons.enforceGlobalCostCap, {});

  expect(second.action).toBe("none");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await studioEnabled(t)).toBe(false);
  const flags = await t.run((ctx) => ctx.db.query("platformFlags").collect());
  expect(flags).toHaveLength(1);
});

test("ručno ugašen Studio ne dobija ni alarm preko 50 $", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 70);
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: STUDIO_FLAG_KEY, enabled: false }));
  const fetchMock = stubResendOk();

  expect((await t.action(internal.crons.enforceGlobalCostCap, {})).action).toBe("none");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await alarmDays(t)).toEqual([]);
});

test("nov dan resetuje i zbir i alarm", async () => {
  const t = convexTest(schema, modules);
  const yesterday = dayKey(Date.now() - DAY);
  const today = dayKey(Date.now());
  await seedUsage(t, 90, yesterday);
  await t.run((ctx) => ctx.db.insert("studioCostAlarms", { day: yesterday }));
  const fetchMock = stubResendOk();

  // Jučerašnjih 90 $ danas ne postoji: zbir za današnji dan je nula.
  const empty = await t.action(internal.crons.enforceGlobalCostCap, {});
  expect(empty).toMatchObject({ action: "none", day: today, totalCostUsd: 0 });
  expect(fetchMock).not.toHaveBeenCalled();

  // Jučerašnji alarm red ne blokira današnji alarm.
  await seedUsage(t, 55, today);
  const fresh = await t.action(internal.crons.enforceGlobalCostCap, {});

  expect(fresh.action).toBe("alarm");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect([...(await alarmDays(t))].sort()).toEqual([yesterday, today].sort());
});

test("Resend bez ključa ne sprečava gašenje Studija", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 140);
  delete process.env.AUTH_RESEND_KEY;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const result = await t.action(internal.crons.enforceGlobalCostCap, {});

  expect(result.action).toBe("kill");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await studioEnabled(t)).toBe(false);
});

test("Resend koji vrati 500 ne sprečava gašenje Studija", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 140);
  const fetchMock = vi.fn(async () => ({
    ok: false,
    status: 500,
    headers: { get: () => "req_pukao" },
  }));
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const result = await t.action(internal.crons.enforceGlobalCostCap, {});

  expect(result.action).toBe("kill");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await studioEnabled(t)).toBe(false);
});

test("Resend koji baci mrežnu grešku ne sprečava upis - alarm ostaje zapamćen", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 60);
  const fetchMock = vi.fn(async () => {
    throw new Error("ECONNRESET");
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const result = await t.action(internal.crons.enforceGlobalCostCap, {});

  // Alarm se pamti i kad mejl padne - inače bi pokvaren Resend značio isti
  // pokušaj svakih 15 minuta do ponoći.
  expect(result.action).toBe("alarm");
  expect(await alarmDays(t)).toEqual([dayKey(Date.now())]);
  expect((await t.action(internal.crons.enforceGlobalCostCap, {})).action).toBe("none");
});

// ── 5. N5: pukao prolaz plafona i heartbeat ─────────────────────────────────

/**
 * Dva reda sa istim ključem teraju `.unique()` da baci unutar
 * `applyGlobalCostAction` - stvaran kvar stanja (Convex guidelines), ne
 * izmišljena greška samo za test.
 */
async function seedDuplicateStudioFlag(t: TestConvex) {
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: STUDIO_FLAG_KEY, enabled: true }));
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: STUDIO_FLAG_KEY, enabled: true }));
}

function heartbeatAt(t: TestConvex) {
  return t.run(async (ctx) => {
    const row = await ctx.db
      .query("studioCronHeartbeats")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_COST_HEARTBEAT_KEY))
      .unique();
    return row?.lastRunAt ?? null;
  });
}

function failedAlarmRows(t: TestConvex) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query("studioCostAlarms").collect();
    return rows.filter((row) => row.type === "cron_failed");
  });
}

test("uspešan prolaz osvežava heartbeat", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 10);
  stubResendOk();

  expect(await heartbeatAt(t)).toBeNull();
  const before = Date.now();
  await t.action(internal.crons.enforceGlobalCostCap, {});
  expect(await heartbeatAt(t)).toBeGreaterThanOrEqual(before);
});

test("pukao prolaz upisuje cron_failed tačno jednom dnevno, šalje tačno jedan mejl i NE pomera heartbeat", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 10);
  await seedDuplicateStudioFlag(t);
  const fetchMock = stubResendOk();

  await expect(t.action(internal.crons.enforceGlobalCostCap, {})).rejects.toThrow();
  // Drugi pad istog dana ne sme da pošalje drugi mejl - isto pravilo kao alarm.
  await expect(t.action(internal.crons.enforceGlobalCostCap, {})).rejects.toThrow();

  const failures = await failedAlarmRows(t);
  expect(failures).toHaveLength(1);
  expect(failures[0].message.length).toBeGreaterThan(0);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [email] = sentEmails(fetchMock);
  expect(email.subject).toContain("NIJE proveren");
  expect(email.text).toContain(failures[0].message);
  // Prolaz koji baci se ceo povuče - heartbeat ostaje kakav je bio (nikad upisan).
  expect(await heartbeatAt(t)).toBeNull();
});

test("prolaz koji ponovo uspe posle kvara osvežava heartbeat", async () => {
  const t = convexTest(schema, modules);
  await seedUsage(t, 10);
  await seedDuplicateStudioFlag(t);
  stubResendOk();

  await expect(t.action(internal.crons.enforceGlobalCostCap, {})).rejects.toThrow();
  expect(await heartbeatAt(t)).toBeNull();

  // Duplikat se čisti ručno - isto što bi Jovan uradio na dashboardu.
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("platformFlags").collect();
    await ctx.db.delete(rows[1]._id);
  });

  const result = await t.action(internal.crons.enforceGlobalCostCap, {});
  expect(result.action).toBe("none");
  expect(await heartbeatAt(t)).not.toBeNull();
});
