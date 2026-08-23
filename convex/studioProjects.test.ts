/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

async function seedUser(t: TestConvex, email = "user@example.com", name = "Test User") {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      email,
      name,
      language: "sr" as const,
      role: "student" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  return {
    userId,
    asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }),
  };
}

describe("convex/studioProjects", () => {
  test("createProject pravi nov projekat i listMyProjects ga vraća sa brojem generacija", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t, "alice@example.com");

    const projectId = await asUser.mutation(api.studioProjects.createProject, {
      name: "Brend Identitet",
    });
    expect(projectId).toBeDefined();

    // Dodajemo dva posla ovom projektu i jedan bez projekta
    await t.run(async (ctx) => {
      await ctx.db.insert("generationJobs", {
        userId,
        projectId,
        modelSlug: "nano-banana-2",
        kind: "image",
        params: "{}",
        promptHash: "hash1",
        status: "done",
        creditCost: 10,
        createdAt: 100,
      });
      await ctx.db.insert("generationJobs", {
        userId,
        projectId,
        modelSlug: "nano-banana-2",
        kind: "image",
        params: "{}",
        promptHash: "hash2",
        status: "done",
        creditCost: 10,
        createdAt: 200,
      });
      await ctx.db.insert("generationJobs", {
        userId,
        modelSlug: "nano-banana-2",
        kind: "image",
        params: "{}",
        promptHash: "hash3",
        status: "done",
        creditCost: 10,
        createdAt: 300,
      });
    });

    const projects = await asUser.query(api.studioProjects.listMyProjects, {});
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      _id: projectId,
      name: "Brend Identitet",
      userId,
      generationCount: 2,
    });
    expect(projects[0].archivedAt).toBeUndefined();
  });

  test("createProject validira ime: prazno, predugačko, duplikat", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);

    await expect(
      asUser.mutation(api.studioProjects.createProject, { name: "   " }),
    ).rejects.toThrow("PROJEKAT_BEZ_IMENA");

    const tooLong = "X".repeat(61);
    await expect(
      asUser.mutation(api.studioProjects.createProject, { name: tooLong }),
    ).rejects.toThrow("PROJEKAT_PREDUGO_IME");

    await asUser.mutation(api.studioProjects.createProject, { name: "Kampanja 2026" });

    // Duplikat kod istog korisnika (case-insensitive)
    await expect(
      asUser.mutation(api.studioProjects.createProject, { name: "kampanja 2026" }),
    ).rejects.toThrow("PROJEKAT_VEC_POSTOJI");
    await expect(
      asUser.mutation(api.studioProjects.createProject, { name: "  KAMPANJA 2026  " }),
    ).rejects.toThrow("PROJEKAT_VEC_POSTOJI");
  });

  test("createProject odbija preko 50 aktivnih projekata", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);

    for (let i = 1; i <= 50; i++) {
      await asUser.mutation(api.studioProjects.createProject, { name: `Projekat ${i}` });
    }

    await expect(
      asUser.mutation(api.studioProjects.createProject, { name: "Projekat 51" }),
    ).rejects.toThrow("PREVISE_PROJEKATA");
  });

  test("renameProject menja ime i proverava vlasništvo i duplikate", async () => {
    const t = makeT();
    const { asUser: alice } = await seedUser(t, "alice@example.com");
    const { asUser: bob } = await seedUser(t, "bob@example.com");

    const p1 = await alice.mutation(api.studioProjects.createProject, { name: "Prvi" });
    const p2 = await alice.mutation(api.studioProjects.createProject, { name: "Drugi" });
    expect(p2).toBeDefined();

    // Bob ne sme da preimenuje Alice-in projekat
    await expect(
      bob.mutation(api.studioProjects.renameProject, { projectId: p1, name: "Hakovano" }),
    ).rejects.toThrow("NEMA_PRISTUPA");

    // Alice ne sme da preimenuje u prazno ili postojeće ime drugog svog projekta
    await expect(
      alice.mutation(api.studioProjects.renameProject, { projectId: p1, name: "" }),
    ).rejects.toThrow("PROJEKAT_BEZ_IMENA");

    await expect(
      alice.mutation(api.studioProjects.renameProject, { projectId: p1, name: "drugi" }),
    ).rejects.toThrow("PROJEKAT_VEC_POSTOJI");

    // Alice preimenuje "Prvi" u "Novi Prvi"
    await alice.mutation(api.studioProjects.renameProject, { projectId: p1, name: " Novi Prvi " });

    const list = await alice.query(api.studioProjects.listMyProjects, {});
    const updated = list.find((p) => p._id === p1);
    expect(updated?.name).toBe("Novi Prvi");
  });

  test("archiveProject postavlja archivedAt, ne briše poslove i pomera projekat na dno", async () => {
    const t = makeT();
    const { userId, asUser: alice } = await seedUser(t, "alice@example.com");
    const { asUser: bob } = await seedUser(t, "bob@example.com");

    const p1 = await alice.mutation(api.studioProjects.createProject, { name: "Za arhivu" });
    const p2 = await alice.mutation(api.studioProjects.createProject, { name: "Aktivan" });

    // Dodajemo posao pod p1
    const jobId = await t.run(async (ctx) => {
      return await ctx.db.insert("generationJobs", {
        userId,
        projectId: p1,
        modelSlug: "nano-banana-2",
        kind: "image",
        params: "{}",
        promptHash: "hash1",
        status: "done",
        creditCost: 10,
        createdAt: 100,
      });
    });

    // Bob ne sme da arhivira
    await expect(
      bob.mutation(api.studioProjects.archiveProject, { projectId: p1 }),
    ).rejects.toThrow("NEMA_PRISTUPA");

    // Alice arhivira
    await alice.mutation(api.studioProjects.archiveProject, { projectId: p1 });

    // Posao i dalje postoji i nosi p1
    const job = await t.run(async (ctx) => ctx.db.get(jobId));
    expect(job?.projectId).toBe(p1);

    // listMyProjects vraća nearhivirane prvo
    const list = await alice.query(api.studioProjects.listMyProjects, {});
    expect(list).toHaveLength(2);
    expect(list[0]._id).toBe(p2);
    expect(list[1]._id).toBe(p1);
    expect(list[1].archivedAt).toBeDefined();

    // renameProject nad arhiviranim baca NEMA_PRISTUPA
    await expect(
      alice.mutation(api.studioProjects.renameProject, { projectId: p1, name: "Novo Ime" }),
    ).rejects.toThrow("NEMA_PRISTUPA");
  });
});
