/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

beforeAll(() => {
  // "admin" nije dodeljiva uloga (`assignableProfileRoles` u `helpers.ts`) -
  // jedini put do nje je preko `INITIAL_ADMIN_EMAILS`, isto kao u
  // `modelCatalog.test.ts` i `creditPacks.test.ts`.
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
});

afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

type TestConvex = ReturnType<typeof convexTest>;

const TODAY = Date.parse("2026-08-19T12:00:00.000Z");
const TODAY_KEY = "2026-08-19";
const YESTERDAY = Date.parse("2026-08-18T12:00:00.000Z");

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
  return { adminId, asAdmin: t.withIdentity({ subject: adminId, tokenIdentifier: `test|${adminId}` }) };
}

async function seedStudent(t: TestConvex, opts: { email: string; name?: string } = { email: "student@example.com" }) {
  const studentId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: opts.email,
      ...(opts.name ? { name: opts.name } : {}),
      role: "student",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { studentId, asStudent: t.withIdentity({ subject: studentId, tokenIdentifier: `test|${studentId}` }) };
}

test("getUsageSummary, getKillSwitchState i setStudioEnabled su zaštićeni sa requireAdmin", async () => {
  const t = convexTest(schema, modules);
  const { asStudent } = await seedStudent(t);

  await expect(asStudent.query(api.studioAdmin.getUsageSummary, { now: TODAY })).rejects.toThrow("Forbidden");
  await expect(asStudent.query(api.studioAdmin.getKillSwitchState, {})).rejects.toThrow("Forbidden");
  await expect(asStudent.mutation(api.studioAdmin.setStudioEnabled, { enabled: false })).rejects.toThrow(
    "Forbidden",
  );
});

test("getKillSwitchState: nema red = uključeno; setStudioEnabled upisuje i menja isti red", async () => {
  const t = convexTest(schema, modules);
  const { asAdmin } = await seedAdmin(t);

  expect(await asAdmin.query(api.studioAdmin.getKillSwitchState, {})).toEqual({ enabled: true });

  await asAdmin.mutation(api.studioAdmin.setStudioEnabled, { enabled: false });
  expect(await asAdmin.query(api.studioAdmin.getKillSwitchState, {})).toEqual({ enabled: false });

  await asAdmin.mutation(api.studioAdmin.setStudioEnabled, { enabled: true });
  expect(await asAdmin.query(api.studioAdmin.getKillSwitchState, {})).toEqual({ enabled: true });

  const rows = await t.run((ctx) => ctx.db.query("platformFlags").collect());
  expect(rows.filter((row) => row.key === "studio_enabled")).toHaveLength(1);
});

test("getUsageSummary: zbir troška, top 10 korisnika i broj poslova po statusu, samo za dati dan", async () => {
  const t = convexTest(schema, modules);
  const { asAdmin } = await seedAdmin(t);

  // 12 korisnika sa potrošnjom danas - dva ispod praga top 10.
  const userIds: Id<"users">[] = [];
  for (let index = 0; index < 12; index += 1) {
    const { studentId } = await seedStudent(t, {
      email: `user${index}@example.com`,
      name: `Korisnik ${index}`,
    });
    userIds.push(studentId);
    await t.run((ctx) =>
      ctx.db.insert("studioUsageDaily", {
        userId: studentId,
        day: TODAY_KEY,
        generations: index + 1,
        creditsSpent: (index + 1) * 20,
        costUsd: (index + 1) * 0.1,
      }),
    );
  }
  // Potrošnja juče se ne sme računati u "danas".
  await t.run((ctx) =>
    ctx.db.insert("studioUsageDaily", {
      userId: userIds[0],
      day: "2026-08-18",
      generations: 5,
      creditsSpent: 100,
      costUsd: 5,
    }),
  );

  // Poslovi po statusu, danas.
  const statuses = ["reserved", "running", "done", "failed", "refunded"] as const;
  for (const status of statuses) {
    await t.run((ctx) =>
      ctx.db.insert("generationJobs", {
        userId: userIds[0],
        modelSlug: "flux-2-flash",
        kind: "image" as const,
        params: "{}",
        promptHash: status,
        status,
        creditCost: 20,
        createdAt: TODAY,
      }),
    );
  }
  // Isti status, ali juče - ne sme da uđe u brojač za danas.
  await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId: userIds[0],
      modelSlug: "flux-2-flash",
      kind: "image" as const,
      params: "{}",
      promptHash: "juce",
      status: "done" as const,
      creditCost: 20,
      createdAt: YESTERDAY,
    }),
  );

  const summary = await asAdmin.query(api.studioAdmin.getUsageSummary, { now: TODAY });

  expect(summary.day).toBe(TODAY_KEY);
  // Suma 0.1 + 0.2 + ... + 1.2 = 7.8, zaobljeno zbog binarnog zapisa.
  expect(summary.totalCostUsd).toBeCloseTo(7.8, 6);
  expect(summary.topUsers).toHaveLength(10);
  expect(summary.topUsers[0].costUsd).toBeCloseTo(1.2, 6);
  expect(summary.topUsers[0].name).toBe("Korisnik 11");
  // Sortirano opadajuće, i najniža dva korisnika (index 0, 1) ispadaju.
  const costs = summary.topUsers.map((row) => row.costUsd);
  expect(costs).toEqual([...costs].sort((a, b) => b - a));
  expect(summary.topUsers.some((row) => row.userId === userIds[0])).toBe(false);
  expect(summary.topUsers.some((row) => row.userId === userIds[1])).toBe(false);

  expect(summary.jobCounts).toEqual({ reserved: 1, running: 1, done: 1, failed: 1, refunded: 1 });
  expect(summary.usageRowsCapped).toBe(false);
  expect(summary.jobCountsCapped).toBe(false);
});

/**
 * X6, nalaz N5: heartbeat i "cron_failed" moraju da stignu do admin ekrana,
 * ne samo do mejla - inače se mrtav cron vidi samo dok neko ne obriše Resend
 * poruku iz inboksa.
 */
test("getUsageSummary: nosi heartbeat plafona i današnji cron_failed, ako postoji", async () => {
  const t = convexTest(schema, modules);
  const { asAdmin } = await seedAdmin(t);

  const empty = await asAdmin.query(api.studioAdmin.getUsageSummary, { now: TODAY });
  expect(empty.costCapHeartbeatAt).toBeNull();
  expect(empty.costCapCronFailure).toBeNull();

  await t.run((ctx) =>
    ctx.db.insert("studioCronHeartbeats", { key: "global_cost_cap", lastRunAt: TODAY - 5 * 60 * 1000 }),
  );
  await t.run((ctx) =>
    ctx.db.insert("studioCostAlarms", {
      day: TODAY_KEY,
      type: "cron_failed",
      message: "InvalidArgument: expected at most one document",
    }),
  );
  // Alarm "obican" istog dana ne sme da se pomeša sa cron_failed.
  await t.run((ctx) => ctx.db.insert("studioCostAlarms", { day: TODAY_KEY, type: "alarm" }));

  const summary = await asAdmin.query(api.studioAdmin.getUsageSummary, { now: TODAY });
  expect(summary.costCapHeartbeatAt).toBe(TODAY - 5 * 60 * 1000);
  expect(summary.costCapCronFailure).toEqual({
    message: "InvalidArgument: expected at most one document",
  });
});

test("getUsageSummary: korisnik bez imena se prikazuje po email-u", async () => {
  const t = convexTest(schema, modules);
  const { asAdmin } = await seedAdmin(t);
  const { studentId } = await seedStudent(t, { email: "bezimena@example.com" });
  await t.run((ctx) =>
    ctx.db.insert("studioUsageDaily", {
      userId: studentId,
      day: TODAY_KEY,
      generations: 1,
      creditsSpent: 20,
      costUsd: 0.1,
    }),
  );

  const summary = await asAdmin.query(api.studioAdmin.getUsageSummary, { now: TODAY });
  expect(summary.topUsers).toEqual([
    { userId: studentId, name: "bezimena@example.com", costUsd: 0.1, creditsSpent: 20, generations: 1 },
  ]);
});

/**
 * X3, nalaz N6: kolona "Stvarna marža" je za svih 30 modela pisala "nema
 * merenja", pa se model koji se po dizajnu ne meri nije razlikovao od modela
 * kojem nešto ne radi. Sada uz zbir izlazi i razlog, sa brojem poslova po
 * razlogu, najbrojniji prvi.
 */
test("getModelCostSummary: razlozi izlaze po modelu, sa brojem poslova po razlogu", async () => {
  const t = convexTest(schema, modules);
  const { asAdmin } = await seedAdmin(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("studioModelCost", {
      modelSlug: "seedance-25",
      measuredJobs: 0,
      actualCostUsd: 0,
      estimatedCostUsd: 0,
      creditCost: 0,
      deviationStreak: 0,
      reasonCounts: JSON.stringify({
        "nepoznat oblik odgovora": 2,
        "provajder nije prijavio kolicinu": 7,
      }),
      updatedAt: TODAY,
    });
    await ctx.db.insert("studioModelCost", {
      modelSlug: "kling-30",
      measuredJobs: 3,
      actualCostUsd: 1.2,
      estimatedCostUsd: 1,
      creditCost: 300,
      deviationStreak: 0,
      updatedAt: TODAY,
    });
  });

  const rows = await asAdmin.query(api.studioAdmin.getModelCostSummary, {});
  const bySlug = new Map(rows.map((row) => [row.modelSlug, row]));

  expect(bySlug.get("seedance-25")?.unmeasuredJobs).toBe(9);
  // Najbrojniji razlog je prvi - to je onaj koji za taj model treba rešiti.
  expect(bySlug.get("seedance-25")?.reasons).toEqual([
    { reason: "provajder nije prijavio kolicinu", jobs: 7 },
    { reason: "nepoznat oblik odgovora", jobs: 2 },
  ]);
  // Model bez ijednog nemerenog posla nema šta da prijavi.
  expect(bySlug.get("kling-30")?.reasons).toEqual([]);
  expect(bySlug.get("kling-30")?.unmeasuredJobs).toBe(0);
});

test("getProviderSamples: sirov uzorak vidi samo admin", async () => {
  const t = convexTest(schema, modules);
  const { asAdmin } = await seedAdmin(t);
  const { asStudent } = await seedStudent(t);
  await t.run((ctx) =>
    ctx.db.insert("studioProviderSamples", {
      provider: "fal",
      modelSlug: "billing-events",
      sample: '{"id":"evt_1"}',
      updatedAt: TODAY,
    }),
  );

  await expect(asStudent.query(api.studioAdmin.getProviderSamples, {})).rejects.toThrow("Forbidden");
  const samples = await asAdmin.query(api.studioAdmin.getProviderSamples, {});
  expect(samples).toEqual([
    { provider: "fal", modelSlug: "billing-events", sample: '{"id":"evt_1"}', updatedAt: TODAY },
  ]);
});

// ── STUDIO_PUBLIC fleg i limiti (studio-public F1) ─────────────────────────

test("getStudioPublicConfig: bez reda fleg je OFF; setStudioPublicFlag ga pali i gasi", async () => {
  const t = convexTest(schema, modules);
  const { asAdmin } = await seedAdmin(t);

  // Odsutan red = OFF - SUPROTNO od kill switch-a (`studio_enabled` bez reda
  // je ON). Seed nikad ne sme da upiše ovaj red.
  const before = await asAdmin.query(api.studioAdmin.getStudioPublicConfig, {});
  expect(before.publicEnabled).toBe(false);
  expect(before.limits.maxConcurrentJobs).toEqual({ value: null, default: 2 });
  expect(before.limits.maxJobsPerMinute).toEqual({ value: null, default: 6 });
  expect(before.limits.maxJobsPerDay).toEqual({ value: null, default: 200 });
  expect(before.limits.maxDailyCredits).toEqual({ value: null, default: 500 });

  await t.mutation(internal.studioAdmin.setStudioPublicFlag, { enabled: true });
  expect((await asAdmin.query(api.studioAdmin.getStudioPublicConfig, {})).publicEnabled).toBe(true);

  await t.mutation(internal.studioAdmin.setStudioPublicFlag, { enabled: false });
  expect((await asAdmin.query(api.studioAdmin.getStudioPublicConfig, {})).publicEnabled).toBe(false);
});

test("setStudioPublicLimit: upisuje override, odbija nevalidan broj, enabled=false vraća podrazumevano", async () => {
  const t = convexTest(schema, modules);
  const { asAdmin } = await seedAdmin(t);

  await t.mutation(internal.studioAdmin.setStudioPublicLimit, { key: "maxJobsPerMinute", value: 10 });
  let config = await asAdmin.query(api.studioAdmin.getStudioPublicConfig, {});
  expect(config.limits.maxJobsPerMinute).toEqual({ value: 10, default: 6 });

  // Nevalidne vrednosti ne prolaze validator poziva.
  await expect(
    t.mutation(internal.studioAdmin.setStudioPublicLimit, { key: "maxJobsPerMinute", value: 0 }),
  ).rejects.toThrow(/NEVALIDAN_LIMIT/);
  await expect(
    t.mutation(internal.studioAdmin.setStudioPublicLimit, { key: "maxJobsPerMinute", value: 2.5 }),
  ).rejects.toThrow(/NEVALIDAN_LIMIT/);
  await expect(
    t.mutation(internal.studioAdmin.setStudioPublicLimit, { key: "maxJobsPerMinute", value: -3 }),
  ).rejects.toThrow(/NEVALIDAN_LIMIT/);

  // `enabled: false` je "vrati na podrazumevano" bez brisanja reda.
  await t.mutation(internal.studioAdmin.setStudioPublicLimit, {
    key: "maxJobsPerMinute",
    value: 10,
    enabled: false,
  });
  config = await asAdmin.query(api.studioAdmin.getStudioPublicConfig, {});
  expect(config.limits.maxJobsPerMinute).toEqual({ value: null, default: 6 });
});

test("getStudioPublicConfig je zaštićen (admin-only), a student ne može ni na setStudioEnabled putanju", async () => {
  const t = convexTest(schema, modules);
  const { asStudent } = await seedStudent(t);
  await expect(asStudent.query(api.studioAdmin.getStudioPublicConfig, {})).rejects.toThrow("Forbidden");
});
