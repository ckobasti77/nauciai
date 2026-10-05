/// <reference types="vite/client" />

/**
 * Pametna biblioteka (Crea K16, S43): pretraga na srpskom nalazi rad po opisu
 * (pismo, kvačice, padež), samo među svojim radovima i uz filtere biblioteke;
 * vektori slika (CLIP) se čuvaju samo za svoje gotove slike, a semantička
 * pretraga vraća radove redom sličnosti.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { CLIP_DIMENSIONS } from "../lib/crea-clip";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

const MODEL = "nano-banana-2";

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
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 10_000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function seedCatalogModel(t: TestConvex, slug = MODEL) {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug)!;
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

/** Rad kroz PRAVI `createJob` (searchText se upisuje pri nastanku), pa označen gotovim sa izlazom. */
async function createDone(t: TestConvex, asUser: ReturnType<TestConvex["withIdentity"]>, prompt: string) {
  const jobId = (await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL,
    params: JSON.stringify({ prompt }),
  })) as Id<"generationJobs">;
  await t.run(async (ctx) => {
    const outputStorageId = await ctx.storage.store(new Blob(["slika"]));
    await ctx.db.patch(jobId, { status: "done", outputStorageId, completedAt: 2 });
  });
  return jobId;
}

function vector(seed: number): number[] {
  // Deterministički jedinični vektor dužine 512 sa „pravcem" u jednoj osi.
  const values = Array.from({ length: CLIP_DIMENSIONS }, (_, i) => (i === seed ? 1 : 0.01));
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => value / norm);
}

describe("pretraga na srpskom (search indeks)", () => {
  test("nalazi rad po opisu: latinica, ćirilica, bez kvačica, drugi padež", async () => {
    const t = makeT();
    await seedCatalogModel(t);
    const { asUser } = await seedUser(t);
    const cat = await createDone(t, asUser, "Crvena mačka spava na krovu kuće u Beogradu");
    const dog = await createDone(t, asUser, "Pas trči po plaži u zalazak sunca");

    const job = await t.run((ctx) => ctx.db.get(cat));
    expect(job?.searchText).toContain("mack");

    for (const query of ["mačka", "мачка", "macke", "mačku na krovu", "beogradu"]) {
      const found = await asUser.query(api.creaSearch.searchMyJobs, { query });
      expect(found.map((row) => row._id), query).toEqual([cat]);
    }
    const beach = await asUser.query(api.creaSearch.searchMyJobs, { query: "плажа" });
    expect(beach.map((row) => row._id)).toEqual([dog]);
    // Pogodak je isti red galerije kao u mreži (potpisan izlaz).
    expect(beach[0].outputUrl).toEqual(expect.any(String));
    expect(await asUser.query(api.creaSearch.searchMyJobs, { query: "   " })).toEqual([]);
  });

  test("samo svoji radovi; filteri biblioteke važe i za pogotke", async () => {
    const t = makeT();
    await seedCatalogModel(t);
    const mila = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const mine = await createDone(t, mila.asUser, "mačka na prozoru");
    await createDone(t, other.asUser, "mačka na prozoru");

    expect((await mila.asUser.query(api.creaSearch.searchMyJobs, { query: "mačka" })).map((row) => row._id)).toEqual([mine]);
    expect(await mila.asUser.query(api.creaSearch.searchMyJobs, { query: "mačka", favorite: true })).toEqual([]);
    await mila.asUser.mutation(api.creaLibrary.toggleFavorite, { jobId: mine });
    expect(await mila.asUser.query(api.creaSearch.searchMyJobs, { query: "mačka", favorite: true })).toHaveLength(1);
    expect(await mila.asUser.query(api.creaSearch.searchMyJobs, { query: "mačka", cost: "free" })).toEqual([]);
    expect(await mila.asUser.query(api.creaSearch.searchMyJobs, { query: "mačka", cost: "paid" })).toHaveLength(1);
    expect(await mila.asUser.query(api.creaSearch.searchMyJobs, { query: "mačka", kind: "video" })).toEqual([]);
    await expect(t.query(api.creaSearch.searchMyJobs, { query: "mačka" })).rejects.toThrow(/Unauthorized/);
  });

  test("migracija dopisuje searchText starim radovima", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const old = await t.run((ctx) =>
      ctx.db.insert("generationJobs", {
        userId,
        modelSlug: MODEL,
        kind: "image",
        params: JSON.stringify({ prompt: "Stari most u Mostaru" }),
        promptHash: "0".repeat(16),
        status: "done",
        creditCost: 10,
        createdAt: 1,
      }),
    );
    // (convex-test ne ume search nad redom bez polja, pa se „pre" proverava na samom redu.)
    const job = await t.run((ctx) => ctx.db.get(old));
    expect(job?.searchText).toBeUndefined();
    const { searchTextForJob } = await import("../lib/crea-search-text");
    await t.run((ctx) => ctx.db.patch(old, { searchText: searchTextForJob(job!) }));
    expect((await asUser.query(api.creaSearch.searchMyJobs, { query: "mostu" })).map((row) => row._id)).toEqual([old]);
  });
});

describe("semantička pretraga (CLIP vektori)", () => {
  test("slike bez vektora → upis → vektorska pretraga vraća radove redom sličnosti", async () => {
    const t = makeT();
    await seedCatalogModel(t);
    const { asUser } = await seedUser(t);
    const a = await createDone(t, asUser, "slika A");
    const b = await createDone(t, asUser, "slika B");

    const pending = await asUser.query(api.creaSearch.pendingEmbeddings, { limit: 8 });
    expect(pending.pending.map((item) => item.jobId).sort()).toEqual([a, b].sort());
    expect(pending.total).toBe(2);

    expect(await asUser.mutation(api.creaSearch.saveEmbeddings, { items: [{ jobId: a, embedding: vector(1) }, { jobId: b, embedding: vector(2) }] })).toEqual({ saved: 2 });
    const after = await asUser.query(api.creaSearch.pendingEmbeddings, {});
    expect(after).toMatchObject({ pending: [], embedded: 2, total: 2 });

    const hits = await asUser.action(api.creaSearch.semanticSearch, { embedding: vector(2) });
    expect(hits.map((hit) => hit._id)).toEqual([b]);
    expect(hits[0].score).toBeGreaterThan(0.9);
    // Ponovni upis istog rada menja vektor (bez drugog reda).
    await asUser.mutation(api.creaSearch.saveEmbeddings, { items: [{ jobId: b, embedding: vector(3) }] });
    expect(await t.run(async (ctx) => (await ctx.db.query("creaEmbeddings").collect()).length)).toBe(2);
  });

  test("tuđi rad i loš vektor se odbijaju; tuđi vektori se ne vide", async () => {
    const t = makeT();
    await seedCatalogModel(t);
    const mila = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const foreign = await createDone(t, other.asUser, "tuđa slika");
    await other.asUser.mutation(api.creaSearch.saveEmbeddings, { items: [{ jobId: foreign, embedding: vector(5) }] });

    expect(await mila.asUser.mutation(api.creaSearch.saveEmbeddings, { items: [{ jobId: foreign, embedding: vector(1) }] })).toEqual({ saved: 0 });
    await expect(mila.asUser.mutation(api.creaSearch.saveEmbeddings, { items: [{ jobId: foreign, embedding: [1, 2, 3] }] })).rejects.toThrow(/NEISPRAVAN_VEKTOR/);
    await expect(mila.asUser.action(api.creaSearch.semanticSearch, { embedding: [0.5] })).rejects.toThrow(/NEISPRAVAN_VEKTOR/);
    expect(await mila.asUser.action(api.creaSearch.semanticSearch, { embedding: vector(5) })).toEqual([]);
    await expect(t.action(api.creaSearch.semanticSearch, { embedding: vector(5) })).rejects.toThrow(/Unauthorized/);
  });

  test("nezavršen i DEMO rad nemaju vektor; brisanje rada briše i vektor", async () => {
    const t = makeT();
    await seedCatalogModel(t);
    const { asUser } = await seedUser(t);
    const running = (await asUser.mutation(api.studio.createJob, { modelSlug: MODEL, params: JSON.stringify({ prompt: "u toku" }) })) as Id<"generationJobs">;
    const done = await createDone(t, asUser, "gotova");
    expect((await asUser.query(api.creaSearch.pendingEmbeddings, {})).pending.map((item) => item.jobId)).toEqual([done]);
    expect(await asUser.mutation(api.creaSearch.saveEmbeddings, { items: [{ jobId: running, embedding: vector(1) }] })).toEqual({ saved: 0 });

    await asUser.mutation(api.creaSearch.saveEmbeddings, { items: [{ jobId: done, embedding: vector(1) }] });
    await asUser.mutation(api.studio.deleteJob, { jobId: done });
    expect(await t.run((ctx) => ctx.db.query("creaEmbeddings").collect())).toEqual([]);
  });
});
