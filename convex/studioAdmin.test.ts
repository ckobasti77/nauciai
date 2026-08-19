/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api } from "./_generated/api";
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
