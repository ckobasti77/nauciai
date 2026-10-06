/// <reference types="vite/client" />

/**
 * Pošteni krediti (K28) kroz pravi `createJob` (convex-test): lični dnevni limit,
 * besplatno ponavljanje pokvarenog rada (limit i zaštita), otkazivanje bez duplog
 * povraćaja i pošteno „neograničeno" iza flega.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { FAIR_UNLIMITED } from "./creaFairCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const falKey = process.env.FAL_KEY;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  delete process.env.FAL_KEY;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (falKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = falKey;
});

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type TestUser = ReturnType<TestConvex["withIdentity"]>;

async function seedModel(t: TestConvex, slug: string) {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(slug);
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

async function seedUser(t: TestConvex, email = "fer@example.com", plan?: "premium" | "basic") {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email,
      name: "Fer",
      username: email.split("@")[0]!,
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      emailVerificationTime: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    if (plan) {
      const courseId = await ctx.db.insert("courses", {
        slug: `kurs-${email}`,
        titleSr: "Kurs",
        titleEn: "Course",
        subtitleSr: "P",
        subtitleEn: "S",
        descriptionSr: "O",
        descriptionEn: "D",
        status: "published" as const,
        sortOrder: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("enrollments", { userId, courseId, status: "active" as const, plan, startedAt: 1, updatedAt: 1 });
    }
    return userId;
  });
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 1000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });
  return { userId, as: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

const NB2 = { prompt: "mačka na krovu", resolution: "1K", aspect_ratio: "1:1" };

async function create(as: TestUser, modelSlug = "nano-banana-2", params: Record<string, unknown> = NB2, extra: { fairUnlimited?: boolean } = {}) {
  const result = await as.mutation(api.studio.createJob, {
    modelSlug,
    params: JSON.stringify(params),
    inputMode: "text",
    ...extra,
  });
  if (typeof result !== "string") throw new Error(JSON.stringify(result));
  return result as Id<"generationJobs">;
}

async function job(t: TestConvex, jobId: Id<"generationJobs">) {
  const row = await t.run((ctx) => ctx.db.get(jobId));
  if (!row) throw new Error("nema posla");
  return row;
}

async function balance(t: TestConvex, userId: Id<"users">) {
  const row = await t.run((ctx) => ctx.db.query("creditBalances").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
  return row?.balance ?? 0;
}

async function refunds(t: TestConvex, jobId: Id<"generationJobs">) {
  return t.run(async (ctx) =>
    (await ctx.db.query("creditTransactions").withIndex("by_job_type", (q) => q.eq("jobId", jobId).eq("type", "refund")).take(10)).length,
  );
}

const done = (t: TestConvex, jobId: Id<"generationJobs">) => t.run((ctx) => ctx.db.patch(jobId, { status: "done" }));

// ── Lični dnevni limit ───────────────────────────────────────────────────────

test("dnevni limit: posao preko limita se ne pravi i ništa ne skida; brisanje limita ga vraća", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const { userId, as } = await seedUser(t);

  await expect(as.mutation(api.creaFair.setDailySpendLimit, { credits: 5 })).rejects.toThrow("NEISPRAVAN_LIMIT");
  expect(await as.mutation(api.creaFair.setDailySpendLimit, { credits: 20 })).toBe(20);

  const first = await create(as);
  expect((await job(t, first)).creditCost).toBe(16);
  await done(t, first);
  await expect(create(as)).rejects.toThrow("LICNI_DNEVNI_LIMIT");
  expect(await balance(t, userId)).toBe(1000 - 16);

  const state = await as.query(api.creaFair.getFairState, { now: NOW });
  expect(state).toMatchObject({ dailyLimit: 20, spentToday: 16 });

  await as.mutation(api.creaFair.setDailySpendLimit, { credits: null });
  await create(as);
  expect(await balance(t, userId)).toBe(1000 - 32);
});

test("dnevni limit važi i za MCP put (isto telo createJob-a)", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const { userId, as } = await seedUser(t);
  await as.mutation(api.creaFair.setDailySpendLimit, { credits: 10 });
  await expect(
    t.mutation(internal.studio.createJobInternal, { userId, modelSlug: "nano-banana-2", params: JSON.stringify(NB2), inputMode: "text" }),
  ).rejects.toThrow("LICNI_DNEVNI_LIMIT");
});

test("limit drugog korisnika ne važi za mene", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const ana = await seedUser(t, "ana@example.com");
  const ben = await seedUser(t, "ben@example.com");
  await ana.as.mutation(api.creaFair.setDailySpendLimit, { credits: 10 });
  await create(ben.as);
  await expect(create(ana.as)).rejects.toThrow("LICNI_DNEVNI_LIMIT");
});

// ── Besplatno ponavljanje ────────────────────────────────────────────────────

/** Besplatno ponavljanje je iza flega od K30 (nalaz K29-09). */
async function freeRedoOn(t: TestConvex) {
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: "crea_free_redo", enabled: true }));
}

test("ponavljanje (K29-09): fleg isključen, nepotvrđen nalog i noćni rad - nema besplatnog posla", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const { userId, as } = await seedUser(t);
  const original = await create(as);
  await done(t, original);
  expect(await as.query(api.creaFair.getRedoOffer, { jobId: original, now: NOW })).toBeNull();
  await expect(as.mutation(api.creaFair.redoBroken, { jobId: original, reason: "prazno" })).rejects.toThrow("PONAVLJANJE_ISKLJUCENO");

  await freeRedoOn(t);
  await t.run((ctx) => ctx.db.patch(userId, { emailVerificationTime: undefined }));
  await expect(as.mutation(api.creaFair.redoBroken, { jobId: original, reason: "prazno" })).rejects.toThrow("PONAVLJANJE_NEDOSTUPNO");

  await t.run((ctx) => ctx.db.patch(userId, { emailVerificationTime: 1 }));
  await t.run((ctx) => ctx.db.patch(original, { deliveryMode: "night" }));
  await expect(as.mutation(api.creaFair.redoBroken, { jobId: original, reason: "prazno" })).rejects.toThrow("NOCNI_RAD");
  expect((await job(t, original)).freeRedoOfJobId).toBeUndefined();
});

test("ponavljanje: isti zahtev za 0 kr, jednom po radu, uz roditelja", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  await freeRedoOn(t);
  const { userId, as } = await seedUser(t);
  const original = await create(as);
  await done(t, original);

  const offer = await as.query(api.creaFair.getRedoOffer, { jobId: original, now: NOW });
  expect(offer).toMatchObject({ ok: true, leftToday: 2 });

  const redo = await as.mutation(api.creaFair.redoBroken, { jobId: original, reason: "iskrivljeno" });
  const row = await job(t, redo);
  expect(row).toMatchObject({ creditCost: 0, freeRedoOfJobId: original, parentJobId: original, derivation: "regeneracija", modelSlug: "nano-banana-2" });
  expect(JSON.parse(row.params).prompt).toBe(NB2.prompt);
  expect(await balance(t, userId)).toBe(1000 - 16);

  await done(t, redo);
  await expect(as.mutation(api.creaFair.redoBroken, { jobId: original, reason: "prazno" })).rejects.toThrow("VEC_PONOVLJENO");
  // Ponavljanje ponavljanja nije besplatno (to bi bio beskonačan besplatan rad).
  await expect(as.mutation(api.creaFair.redoBroken, { jobId: redo, reason: "prazno" })).rejects.toThrow("BESPLATAN_RAD");
});

test("ponavljanje: zaštita - tuđ, nedovršen, star, nepoznat razlog, dnevni limit", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  await freeRedoOn(t);
  const { as } = await seedUser(t);
  const other = await seedUser(t, "drugi@example.com");

  const running = await create(as);
  await expect(as.mutation(api.creaFair.redoBroken, { jobId: running, reason: "prazno" })).rejects.toThrow("NIJE_GOTOV");
  await done(t, running);
  await expect(other.as.mutation(api.creaFair.redoBroken, { jobId: running, reason: "prazno" })).rejects.toThrow("IZVOR_NIJE_DOSTUPAN");
  await expect(as.mutation(api.creaFair.redoBroken, { jobId: running, reason: "ne-svidja-mi-se" })).rejects.toThrow("NEPOZNAT_RAZLOG");

  const old = await create(as);
  await t.run((ctx) => ctx.db.patch(old, { status: "done", createdAt: NOW - 49 * HOUR }));
  await expect(as.mutation(api.creaFair.redoBroken, { jobId: old, reason: "prazno" })).rejects.toThrow("PRESTARO");

  // Dva ponavljanja za 24 h; treće je odbijeno.
  const second = await create(as);
  await done(t, second);
  const third = await create(as);
  await done(t, third);
  await done(t, await as.mutation(api.creaFair.redoBroken, { jobId: running, reason: "prazno" }));
  await done(t, await as.mutation(api.creaFair.redoBroken, { jobId: second, reason: "prazno" }));
  await expect(as.mutation(api.creaFair.redoBroken, { jobId: third, reason: "prazno" })).rejects.toThrow("DNEVNI_LIMIT_PONAVLJANJA");
});

test("ponavljanje koje padne ne vraća kredite (nije ih ni skinulo) i ne troši limit", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  await freeRedoOn(t);
  const { userId, as } = await seedUser(t);
  const original = await create(as);
  await done(t, original);
  const redo = await as.mutation(api.creaFair.redoBroken, { jobId: original, reason: "prazno" });

  await t.mutation(internal.studio.failJob, { jobId: redo, error: "pao" });
  expect((await job(t, redo)).status).toBe("refunded");
  expect(await refunds(t, redo)).toBe(0);
  expect(await balance(t, userId)).toBe(1000 - 16);
  // Original sme ponovo, a limit je i dalje 2.
  expect(await as.query(api.creaFair.getRedoOffer, { jobId: original, now: NOW })).toMatchObject({ ok: true, leftToday: 2 });
});

// ── Otkazivanje ──────────────────────────────────────────────────────────────

test("K29-06: račun provajdera posle povraćaja ne vraća kredite drugi put i ne naplaćuje", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const { userId, as } = await seedUser(t);
  const jobId = await create(as);
  await t.run((ctx) => ctx.db.patch(jobId, { status: "running", falRequestId: `mock-${jobId}` }));
  expect(await as.action(api.creaFair.cancelJob, { jobId })).toEqual({ ok: true });
  expect(await balance(t, userId)).toBe(1000);

  // Fal je ipak završio i naplatio - niže, pa više od procene.
  for (const actualCostUsd of [0.01, 0.5]) {
    await t.run((ctx) => ctx.db.patch(jobId, { actualCostUsd, settledAt: undefined }));
    await t.mutation(internal.studio.settleJobCredits, { jobId });
    expect(await balance(t, userId)).toBe(1000);
    expect(await job(t, jobId)).toMatchObject({ settlementReason: "nije_isporuceno" });
  }
  const settlements = await t.run((ctx) =>
    ctx.db.query("creditTransactions").filter((q) => q.eq(q.field("jobId"), jobId)).collect(),
  );
  expect(settlements.filter((row) => row.type === "settlement")).toEqual([]);
});


test("otkaz DEMO posla vraća kredite tačno jednom (drugi otkaz, zakasneli webhook i reaper ne vraćaju ponovo)", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const { userId, as } = await seedUser(t);
  const jobId = await create(as);
  await t.run((ctx) => ctx.db.patch(jobId, { status: "running", falRequestId: `mock-${jobId}` }));
  expect(await balance(t, userId)).toBe(1000 - 16);

  expect(await as.action(api.creaFair.cancelJob, { jobId })).toEqual({ ok: true });
  expect(await job(t, jobId)).toMatchObject({ status: "refunded", error: "OTKAZAO_KORISNIK" });
  expect(await balance(t, userId)).toBe(1000);

  expect(await as.action(api.creaFair.cancelJob, { jobId })).toEqual({ ok: false, reason: "NE_MOZE" });
  await t.mutation(internal.falWebhook.applyWebhookResult, { falRequestId: `mock-${jobId}`, status: "OK", outputUrl: "https://x/y.png" });
  await t.mutation(internal.falWebhook.applyWebhookResult, { falRequestId: `mock-${jobId}`, status: "ERROR", error: "x" });
  await t.mutation(internal.studio.failJob, { jobId, error: "reaper" });
  expect(await refunds(t, jobId)).toBe(1);
  expect(await balance(t, userId)).toBe(1000);
  expect((await job(t, jobId)).status).toBe("refunded");
});

test("otkaz: tuđ posao i posao kod Google-a se ne otkazuju", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const { as } = await seedUser(t);
  const other = await seedUser(t, "drugi@example.com");
  const jobId = await create(as);
  await t.run((ctx) => ctx.db.patch(jobId, { status: "running", falRequestId: "pravi-google-zahtev", provider: "google" }));
  await expect(other.as.action(api.creaFair.cancelJob, { jobId })).rejects.toThrow("IZVOR_NIJE_DOSTUPAN");
  expect(await as.action(api.creaFair.cancelJob, { jobId })).toEqual({ ok: false, reason: "NE_MOZE" });
  expect((await job(t, jobId)).status).toBe("running");
});

test("otkaz fal posla: samo dok je u redu i fal prihvati (202); posao koji radi ostaje", async () => {
  const t = makeT();
  await seedModel(t, "z-image-turbo");
  const { userId, as } = await seedUser(t);
  const params = { prompt: "skica", image_size: "square_hd", num_images: 1 };
  const queued = await create(as, "z-image-turbo", params);
  await t.run((ctx) => ctx.db.patch(queued, { status: "running", falRequestId: "req-u-redu" }));
  const working = await create(as, "z-image-turbo", params);
  await t.run((ctx) => ctx.db.patch(working, { status: "running", falRequestId: "req-radi" }));
  const spent = 1000 - (await balance(t, userId));

  process.env.FAL_KEY = "fal-test";
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init: RequestInit = {}) => {
      const url = String(input);
      calls.push(`${init.method ?? "GET"} ${url}`);
      if (url.endsWith("/status")) {
        return new Response(JSON.stringify({ status: url.includes("req-u-redu") ? "IN_QUEUE" : "IN_PROGRESS" }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "CANCELLATION_REQUESTED" }), { status: 202 });
    }),
  );

  expect(await as.action(api.creaFair.cancelJob, { jobId: working })).toEqual({ ok: false, reason: "VEC_RADI" });
  expect((await job(t, working)).status).toBe("running");

  expect(await as.action(api.creaFair.cancelJob, { jobId: queued })).toEqual({ ok: true });
  expect(calls).toContain("PUT https://queue.fal.run/fal-ai/z-image/turbo/requests/req-u-redu/cancel");
  expect(calls.some((call) => call.includes("req-radi") && call.startsWith("PUT"))).toBe(false);
  expect((await job(t, queued)).status).toBe("refunded");
  expect(await refunds(t, queued)).toBe(1);
  expect(1000 - (await balance(t, userId))).toBe(spent / 2);
});

// ── Pošteno „neograničeno" ──────────────────────────────────────────────────

async function flag(t: TestConvex, enabled: boolean) {
  await t.mutation(internal.creaFlags.setCreaFlag, { key: "crea_fair_unlimited", enabled });
}

test("neograničeno: iza flega, samo Premium, samo jeftin model, jedan posao, 0 kr, spori red", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2-lite");
  await seedModel(t, "nano-banana-2");
  const premium = await seedUser(t, "premium@example.com", "premium");
  const basic = await seedUser(t, "basic@example.com", "basic");
  const lite = { prompt: "mačka", aspect_ratio: "1:1" };

  await expect(create(premium.as, "nano-banana-2-lite", lite, { fairUnlimited: true })).rejects.toThrow("NEOGRANICENO_ISKLJUCENO");
  expect((await premium.as.query(api.creaFair.getFairState, { now: NOW })).fairUnlimited).toBeNull();

  await flag(t, true);
  await expect(create(basic.as, "nano-banana-2-lite", lite, { fairUnlimited: true })).rejects.toThrow("NEOGRANICENO_SAMO_PREMIUM");
  await expect(create(premium.as, "nano-banana-2", NB2, { fairUnlimited: true })).rejects.toThrow("NEOGRANICENO_MODEL");

  const first = await create(premium.as, "nano-banana-2-lite", lite, { fairUnlimited: true });
  expect(await job(t, first)).toMatchObject({ creditCost: 0, fairUnlimited: true, status: "reserved" });
  expect(await balance(t, premium.userId)).toBe(1000);
  await expect(create(premium.as, "nano-banana-2-lite", lite, { fairUnlimited: true })).rejects.toThrow("NEOGRANICENO_JEDAN_POSAO");
  // Spori red: posao u redu sme da se otkaže, bez povraćaja (nije ni plaćen).
  expect(await premium.as.action(api.creaFair.cancelJob, { jobId: first })).toEqual({ ok: true });
  expect(await refunds(t, first)).toBe(0);

  const state = await premium.as.query(api.creaFair.getFairState, { now: NOW });
  expect(state.fairUnlimited).toMatchObject({ left: FAIR_UNLIMITED.monthlyJobs, monthly: FAIR_UNLIMITED.monthlyJobs });

  await flag(t, false);
  await expect(create(premium.as, "nano-banana-2-lite", lite, { fairUnlimited: true })).rejects.toThrow("NEOGRANICENO_ISKLJUCENO");
});

test("neograničeno: mesečni limit", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2-lite");
  const premium = await seedUser(t, "premium@example.com", "premium");
  await flag(t, true);
  await t.run(async (ctx) => {
    for (let index = 0; index < FAIR_UNLIMITED.monthlyJobs; index += 1) {
      const jobId = await ctx.db.insert("generationJobs", {
        userId: premium.userId,
        modelSlug: "nano-banana-2-lite",
        kind: "image",
        params: "{}",
        promptHash: "x",
        status: "done",
        creditCost: 0,
        fairUnlimited: true,
        createdAt: NOW - HOUR,
      });
      await ctx.db.insert("creaFreeJobs", { userId: premium.userId, kind: "fair", jobId, createdAt: NOW - HOUR });
    }
  });
  await expect(create(premium.as, "nano-banana-2-lite", { prompt: "mačka", aspect_ratio: "1:1" }, { fairUnlimited: true })).rejects.toThrow(
    "NEOGRANICENO_MESECNI_LIMIT",
  );
});
