/// <reference types="vite/client" />

/**
 * Posebni trenuci (Crea K25, U4): konfete za prvi rad, prvi video/zvuk i jubileje -
 * samo nad sopstvenim, gotovim, generisanim radovima, uz ograničeno čitanje.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CREA_MOMENT_SCAN_LIMIT, momentFor } from "./creaMomentsCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

async function seedUser(t: TestConvex, email = "mila@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Mila Crea",
      username: email.split("@")[0],
      role: "student",
      language: "sr" as const,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function insertJob(
  t: TestConvex,
  userId: Id<"users">,
  opts: { kind?: "image" | "video" | "audio"; status?: "done" | "running" | "failed"; local?: boolean; createdAt?: number } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: opts.local ? "local:slika.format" : "nano-banana-2",
      kind: opts.kind ?? "image",
      params: JSON.stringify({ prompt: "rad" }),
      promptHash: "0".repeat(16),
      status: opts.status ?? "done",
      creditCost: opts.local ? 0 : 10,
      ...(opts.local ? { provider: "local" as const } : { provider: "google" as const }),
      createdAt: opts.createdAt ?? 1,
    }),
  );
}

describe("momentFor", () => {
  test("prvi rad, prvi od vrste, jubilej, ništa", () => {
    expect(momentFor({ total: 1, ofKind: 1, exact: true }, "image")).toEqual({ id: "prvi-rad" });
    expect(momentFor({ total: 4, ofKind: 1, exact: true }, "video")).toEqual({ id: "prvi-od-vrste", kind: "video" });
    expect(momentFor({ total: 10, ofKind: 7, exact: true }, "image")).toEqual({ id: "jubilej", count: 10 });
    expect(momentFor({ total: 100, ofKind: 40, exact: true }, "audio")).toEqual({ id: "jubilej", count: 100 });
    expect(momentFor({ total: 11, ofKind: 7, exact: true }, "image")).toBeNull();
    expect(momentFor({ total: 0, ofKind: 0, exact: true }, "image")).toBeNull();
  });

  test("bez tačnog broja se ništa ne tvrdi", () => {
    expect(momentFor({ total: 1, ofKind: 1, exact: false }, "image")).toBeNull();
    expect(momentFor({ total: 50, ofKind: 1, exact: false }, "video")).toBeNull();
  });

  test("granica skeniranja pokriva najveći jubilej", () => {
    expect(CREA_MOMENT_SCAN_LIMIT).toBeGreaterThan(100);
  });
});

describe("creaMoments.momentForJob", () => {
  test("prvi generisani rad je „prvi rad\" i kad postoje rezultati besplatnih alata", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await insertJob(t, userId, { local: true });
    await insertJob(t, userId, { local: true });
    const jobId = await insertJob(t, userId);
    expect(await asUser.query(api.creaMoments.momentForJob, { jobId })).toEqual({ id: "prvi-rad" });
  });

  test("prvi video posle slika je „prvi od vrste\"; sledeći video nije ništa", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await insertJob(t, userId);
    await insertJob(t, userId);
    const firstVideo = await insertJob(t, userId, { kind: "video" });
    expect(await asUser.query(api.creaMoments.momentForJob, { jobId: firstVideo })).toEqual({ id: "prvi-od-vrste", kind: "video" });
    const secondVideo = await insertJob(t, userId, { kind: "video" });
    expect(await asUser.query(api.creaMoments.momentForJob, { jobId: secondVideo })).toBeNull();
  });

  test("deseti generisani rad je jubilej (neuspeli i lokalni se ne broje)", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    for (let index = 0; index < 9; index += 1) await insertJob(t, userId);
    await insertJob(t, userId, { status: "failed" });
    await insertJob(t, userId, { local: true });
    const tenth = await insertJob(t, userId);
    expect(await asUser.query(api.creaMoments.momentForJob, { jobId: tenth })).toEqual({ id: "jubilej", count: 10 });
  });

  test("rad u toku, rezultat alata i tuđ rad - ništa", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "ana@example.com");
    const running = await insertJob(t, userId, { status: "running" });
    const local = await insertJob(t, userId, { local: true });
    const foreign = await insertJob(t, other.userId);
    expect(await asUser.query(api.creaMoments.momentForJob, { jobId: running })).toBeNull();
    expect(await asUser.query(api.creaMoments.momentForJob, { jobId: local })).toBeNull();
    expect(await asUser.query(api.creaMoments.momentForJob, { jobId: foreign })).toBeNull();
  });

  test("preko granice skeniranja nema konfeta", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < CREA_MOMENT_SCAN_LIMIT; index += 1) {
        await ctx.db.insert("generationJobs", {
          userId,
          modelSlug: "local:slika.format",
          kind: "image",
          params: "{}",
          promptHash: "0".repeat(16),
          status: "done",
          creditCost: 0,
          provider: "local",
          createdAt: 1,
        });
      }
    });
    const jobId = await insertJob(t, userId, { kind: "audio" });
    expect(await asUser.query(api.creaMoments.momentForJob, { jobId })).toBeNull();
  });

  test("gost je odbijen", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    const jobId = await insertJob(t, userId);
    await expect(t.query(api.creaMoments.momentForJob, { jobId })).rejects.toThrow("Unauthorized");
  });
});
