/// <reference types="vite/client" />

/**
 * Galerija 2.0 (Crea K16, U9): omiljeno, premeštanje u projekat i masovno brisanje -
 * uvek samo nad sopstvenim radovima, sa istim pravilima kao jedan „Obriši".
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { DELETE_BATCH_MAX } from "./creaLibrary";
import { jobDeleteProblem } from "./studio";
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
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function storeFile(t: TestConvex) {
  return t.run((ctx) => ctx.storage.store(new Blob(["slika"])));
}

async function exists(t: TestConvex, storageId: Id<"_storage">) {
  return t.run(async (ctx) => (await ctx.db.system.get("_storage", storageId)) !== null);
}

async function insertJob(
  t: TestConvex,
  userId: Id<"users">,
  opts: { status?: "done" | "running"; inputs?: Id<"_storage">[]; projectId?: Id<"studioProjects"> } = {},
) {
  const outputStorageId = await storeFile(t);
  return t.run(async (ctx) => {
    for (const storageId of opts.inputs ?? []) {
      const existing = await ctx.db.query("studioUploads").withIndex("by_storage", (q) => q.eq("storageId", storageId)).first();
      if (!existing) await ctx.db.insert("studioUploads", { userId, storageId, slot: "image", bytes: 5, createdAt: 1 });
    }
    const jobId = await ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "nano-banana-2",
      kind: "image",
      params: JSON.stringify({ prompt: "rad" }),
      promptHash: "0".repeat(16),
      status: opts.status ?? "done",
      creditCost: 10,
      outputStorageId,
      ...(opts.inputs ? { inputs: JSON.stringify({ image: opts.inputs }) } : {}),
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
      createdAt: 1,
    });
    return { jobId, outputStorageId };
  });
}

async function project(t: TestConvex, userId: Id<"users">, archived = false) {
  return t.run((ctx) =>
    ctx.db.insert("studioProjects", { userId, name: "Leto", createdAt: 1, updatedAt: 1, ...(archived ? { archivedAt: 2 } : {}) }),
  );
}

describe("omiljeno", () => {
  test("uključi/isključi, vidi se u galeriji i filteru; tuđ rad ne", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const { jobId } = await insertJob(t, userId);

    expect(await asUser.mutation(api.creaLibrary.toggleFavorite, { jobId })).toBe(true);
    const page = await asUser.query(api.studio.listMyJobs, { paginationOpts: { numItems: 10, cursor: null }, favorite: true });
    expect(page.page.map((job) => job._id)).toEqual([jobId]);
    expect(page.page[0].favoriteAt).toEqual(expect.any(Number));

    expect(await asUser.mutation(api.creaLibrary.toggleFavorite, { jobId })).toBe(false);
    expect((await asUser.query(api.studio.listMyJobs, { paginationOpts: { numItems: 10, cursor: null }, favorite: true })).page).toEqual([]);
    await expect(other.asUser.mutation(api.creaLibrary.toggleFavorite, { jobId })).rejects.toThrow(/nije pronađen/);
  });

  test("filter cene: besplatni (0 kr) i plaćeni", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const paid = await insertJob(t, userId);
    const free = await t.run((ctx) =>
      ctx.db.insert("generationJobs", {
        userId,
        modelSlug: "local:slika.format",
        kind: "image",
        params: "{}",
        promptHash: "0".repeat(16),
        status: "done",
        creditCost: 0,
        createdAt: 2,
      }),
    );
    const list = (cost: "free" | "paid") =>
      asUser.query(api.studio.listMyJobs, { paginationOpts: { numItems: 10, cursor: null }, cost });
    expect((await list("free")).page.map((job) => job._id)).toEqual([free]);
    expect((await list("paid")).page.map((job) => job._id)).toEqual([paid.jobId]);
  });
});

describe("premesti u projekat", () => {
  test("svoji radovi idu u svoj projekat i nazad; tuđi se preskaču", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const a = await insertJob(t, userId);
    const b = await insertJob(t, userId);
    const foreign = await insertJob(t, other.userId);
    const leto = await project(t, userId);

    expect(await asUser.mutation(api.creaLibrary.moveJobs, { jobIds: [a.jobId, b.jobId, foreign.jobId], projectId: leto })).toEqual({ moved: 2 });
    const inProject = await asUser.query(api.studio.listMyJobs, { paginationOpts: { numItems: 10, cursor: null }, projectId: leto });
    expect(inProject.page.map((job) => job._id).sort()).toEqual([a.jobId, b.jobId].sort());
    expect((await t.run((ctx) => ctx.db.get(foreign.jobId)))?.projectId).toBeUndefined();

    expect(await asUser.mutation(api.creaLibrary.moveJobs, { jobIds: [a.jobId], projectId: null })).toEqual({ moved: 1 });
    expect((await t.run((ctx) => ctx.db.get(a.jobId)))?.projectId).toBeUndefined();
  });

  test("tuđ ili arhiviran projekat se odbija", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const a = await insertJob(t, userId);
    const foreignProject = await project(t, other.userId);
    const archived = await project(t, userId, true);
    await expect(asUser.mutation(api.creaLibrary.moveJobs, { jobIds: [a.jobId], projectId: foreignProject })).rejects.toThrow(/PROJEKAT_NIJE_DOSTUPAN/);
    await expect(asUser.mutation(api.creaLibrary.moveJobs, { jobIds: [a.jobId], projectId: archived })).rejects.toThrow(/PROJEKAT_NIJE_DOSTUPAN/);
  });
});

describe("masovno brisanje", () => {
  test("pravilo jednog „Obriši“: rad u toku i rad iz lekcije se ne brišu", () => {
    const base = { status: "done" } as Doc<"generationJobs">;
    expect(jobDeleteProblem(base)).toBeNull();
    expect(jobDeleteProblem({ ...base, status: "queued" })).toBe("POSAO_U_TOKU");
    expect(jobDeleteProblem({ ...base, labOutputId: "lab" as Id<"labOutputs"> })).toBe("POSAO_POVEZAN_SA_LEKCIJOM");
  });

  test("briše izabrane sa fajlovima; rad u toku i tuđ rad se preskaču sa razlogom", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const a = await insertJob(t, userId);
    const b = await insertJob(t, userId);
    const running = await insertJob(t, userId, { status: "running" });
    const foreign = await insertJob(t, other.userId);

    const result = await asUser.mutation(api.creaLibrary.deleteJobs, {
      jobIds: [a.jobId, b.jobId, running.jobId, foreign.jobId],
    });
    expect(result.deleted).toBe(2);
    expect(result.skipped).toEqual([
      { jobId: running.jobId, reason: "POSAO_U_TOKU" },
      { jobId: foreign.jobId, reason: "NIJE_PRONADJEN" },
    ]);
    expect(await t.run((ctx) => ctx.db.get(a.jobId))).toBeNull();
    expect(await exists(t, a.outputStorageId)).toBe(false);
    expect(await exists(t, b.outputStorageId)).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(running.jobId))).not.toBeNull();
    expect(await exists(t, foreign.outputStorageId)).toBe(true);
  });

  test("ulaz koji drži rad van brisanja ostaje; ulaz samo izabranih radova se briše", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const shared = await storeFile(t);
    const onlyDoomed = await storeFile(t);
    const keep = await insertJob(t, userId, { inputs: [shared] });
    const x = await insertJob(t, userId, { inputs: [shared, onlyDoomed] });
    const y = await insertJob(t, userId, { inputs: [onlyDoomed] });

    await asUser.mutation(api.creaLibrary.deleteJobs, { jobIds: [x.jobId, y.jobId] });
    expect(await exists(t, shared)).toBe(true);
    expect(await exists(t, onlyDoomed)).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(keep.jobId))).not.toBeNull();
  });

  test("ulaz koji drži PRESKOČEN rad (u toku) ostaje", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const shared = await storeFile(t);
    const running = await insertJob(t, userId, { status: "running", inputs: [shared] });
    const done = await insertJob(t, userId, { inputs: [shared] });
    await asUser.mutation(api.creaLibrary.deleteJobs, { jobIds: [running.jobId, done.jobId] });
    expect(await exists(t, shared)).toBe(true);
  });

  test("paket je ograničen; gost ne može ništa", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const { userId } = await seedUser(t, "treci@example.com");
    const job = await insertJob(t, userId);
    const tooMany = Array.from({ length: DELETE_BATCH_MAX + 1 }, () => job.jobId);
    await expect(asUser.mutation(api.creaLibrary.deleteJobs, { jobIds: tooMany })).rejects.toThrow(/PREVISE_STAVKI/);
    await expect(t.mutation(api.creaLibrary.deleteJobs, { jobIds: [job.jobId] })).rejects.toThrow(/Unauthorized/);
    await expect(t.mutation(api.creaLibrary.toggleFavorite, { jobId: job.jobId })).rejects.toThrow(/Unauthorized/);
  });
});
