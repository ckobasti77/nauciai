/// <reference types="vite/client" />

/**
 * Stablo verzija Cree (K05): ko vidi stablo, kako nastaje roditelj u svakom toku
 * (eksplicitno, izlaz kao ulaz, lokalni alat, MCP), i da alias ulaz nikad ne
 * briše niti skraćuje život izlaza roditelja.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { VERSION_TREE_MAX_NODES } from "./creaVersionsCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

/** Otisak koji klijent najavljuje uz dozvolu za lokalni rezultat (K29-01). */
async function localDigest(t: TestConvex, storageId: Id<"_storage">) {
  return t.run(async (ctx) => {
    const meta = await ctx.db.system.get("_storage", storageId);
    if (!meta) throw new Error("nema fajla");
    return { sha256: meta.sha256, size: meta.size };
  });
}

const EDIT_MODEL = "nano-banana-2";

/** Osoblje (prolazi `requireStudioAccess` dok je Crea zatvorena), uslovi prihvaćeni, krediti. */
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

/** Red v4 kataloga - ista polja koja upisuje `seedStudioModels` (obrazac `studioCatalogJob.test.ts`). */
async function seedCatalogModel(t: TestConvex, slug = EDIT_MODEL) {
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

/** Fajl u storage-u sa zadatim tipom (`convex-test` tip iz `Blob`-a ne prenosi). */
async function storeFile(t: TestConvex, contentType = "image/png") {
  return t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["slika"]));
    await ctx.db.patch(id as unknown as Id<"studioUploads">, { contentType } as never);
    return id;
  });
}

async function fileExists(t: TestConvex, storageId: Id<"_storage">) {
  return t.run(async (ctx) => (await ctx.db.system.get("_storage", storageId)) !== null);
}

/** Gotov rad sa izlazom, upisan direktno (stablo ne zna za provajdera). */
async function insertDone(
  t: TestConvex,
  userId: Id<"users">,
  opts: {
    createdAt?: number;
    parent?: { _id: Id<"generationJobs">; rootJobId?: Id<"generationJobs"> };
    kind?: "image" | "video" | "audio";
    output?: boolean;
    contentType?: string;
    inputs?: string;
  } = {},
) {
  const outputStorageId = opts.output === false ? undefined : await storeFile(t, opts.contentType);
  return t.run(async (ctx) => {
    const id = await ctx.db.insert("generationJobs", {
      userId,
      modelSlug: EDIT_MODEL,
      kind: opts.kind ?? "image",
      params: JSON.stringify({ prompt: "lisica" }),
      promptHash: "0".repeat(16),
      status: "done",
      creditCost: 10,
      ...(outputStorageId ? { outputStorageId } : {}),
      ...(opts.inputs ? { inputs: opts.inputs } : {}),
      ...(opts.parent
        ? { parentJobId: opts.parent._id, rootJobId: opts.parent.rootJobId ?? opts.parent._id, derivation: "izmena" }
        : {}),
      createdAt: opts.createdAt ?? 1,
    });
    return (await ctx.db.get(id))!;
  });
}

async function jobOf(t: TestConvex, jobId: Id<"generationJobs">) {
  return t.run((ctx) => ctx.db.get(jobId));
}

describe("getVersionTree", () => {
  test("vlasnik vidi celo stablo od korena; drugi korisnik dobija null; gost grešku", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const root = await insertDone(t, userId, { createdAt: 1 });
    const a = await insertDone(t, userId, { createdAt: 2, parent: root });
    const b = await insertDone(t, userId, { createdAt: 3, parent: root });
    const c = await insertDone(t, userId, { createdAt: 4, parent: a, kind: "audio" });
    // Tuđ red sa istim korenom (invarijanta to ne dozvoljava, ali upit ga i ne sme pokazati).
    await insertDone(t, other.userId, { createdAt: 5, parent: root });

    const tree = await asUser.query(api.creaVersions.getVersionTree, { jobId: c._id });
    expect(tree?.rootId).toBe(root._id);
    expect(tree?.truncated).toBe(false);
    expect(tree?.nodes.map((n) => [n._id, n.depth])).toEqual([
      [root._id, 0],
      [a._id, 1],
      [c._id, 2],
      [b._id, 1],
    ]);
    const byId = new Map(tree!.nodes.map((n) => [n._id, n]));
    expect(byId.get(a._id)?.parentJobId).toBe(root._id);
    expect(byId.get(a._id)?.derivation).toBe("izmena");
    // Slike se potpisuju, zvuk ne.
    expect(byId.get(root._id)?.thumbUrl).toBeTruthy();
    expect(byId.get(c._id)?.thumbUrl).toBeNull();

    // Isto stablo iz korena.
    const fromRoot = await asUser.query(api.creaVersions.getVersionTree, { jobId: root._id });
    expect(fromRoot?.nodes).toHaveLength(4);

    expect(await other.asUser.query(api.creaVersions.getVersionTree, { jobId: c._id })).toBeNull();
    await expect(t.query(api.creaVersions.getVersionTree, { jobId: c._id })).rejects.toThrow();
  });

  test("rad bez roditelja i dece je stablo od jednog čvora", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const solo = await insertDone(t, userId);
    const tree = await asUser.query(api.creaVersions.getVersionTree, { jobId: solo._id });
    expect(tree?.nodes.map((n) => n._id)).toEqual([solo._id]);
  });

  test("obrisan koren: najstariji preostali rad postaje koren", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const root = await insertDone(t, userId, { createdAt: 1 });
    const a = await insertDone(t, userId, { createdAt: 2, parent: root });
    const c = await insertDone(t, userId, { createdAt: 3, parent: a });
    await asUser.mutation(api.studio.deleteJob, { jobId: root._id });

    const tree = await asUser.query(api.creaVersions.getVersionTree, { jobId: c._id });
    expect(tree?.rootId).toBe(a._id);
    expect(tree?.nodes.map((n) => n._id)).toEqual([a._id, c._id]);
  });

  test(`granica od ${VERSION_TREE_MAX_NODES} radova: trenutni rad i njegov roditelj su uvek tu`, async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const root = await insertDone(t, userId, { createdAt: 1, output: false });
    let last = root;
    await t.run(async (ctx) => {
      for (let i = 0; i < VERSION_TREE_MAX_NODES + 20; i += 1) {
        const id = await ctx.db.insert("generationJobs", {
          userId,
          modelSlug: EDIT_MODEL,
          kind: "image",
          params: "{}",
          promptHash: "0".repeat(16),
          status: "done",
          creditCost: 0,
          parentJobId: last._id,
          rootJobId: root._id,
          createdAt: 10 + i,
        });
        last = (await ctx.db.get(id))!;
      }
    });

    const tree = await asUser.query(api.creaVersions.getVersionTree, { jobId: last._id });
    expect(tree?.truncated).toBe(true);
    // koren + 100 iz indeksa + trenutni + njegov roditelj
    expect(tree!.nodes.length).toBe(VERSION_TREE_MAX_NODES + 3);
    const ids = tree!.nodes.map((n) => n._id);
    expect(ids).toContain(last._id);
    expect(ids).toContain(last.parentJobId);
  });
});

describe("roditelj pri plaćenom poslu (createJob)", () => {
  test("eksplicitan roditelj: veze, koren i izvođenje se upisuju", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedCatalogModel(t);
    const root = await insertDone(t, userId, { createdAt: 1 });
    const child = await insertDone(t, userId, { createdAt: 2, parent: root });

    const jobId = (await asUser.mutation(api.studio.createJob, {
      modelSlug: EDIT_MODEL,
      params: JSON.stringify({ prompt: "lisica, ponovo" }),
      parentJobId: child._id,
      derivation: "regeneracija",
    })) as Id<"generationJobs">;

    const job = await jobOf(t, jobId);
    expect(job?.parentJobId).toBe(child._id);
    expect(job?.rootJobId).toBe(root._id);
    expect(job?.derivation).toBe("regeneracija");
  });

  test("tuđ roditelj se odbija pre upisa posla i pre skidanja kredita", async () => {
    const t = makeT();
    const { asUser, userId } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedCatalogModel(t);
    const foreign = await insertDone(t, other.userId);

    await expect(
      asUser.mutation(api.studio.createJob, {
        modelSlug: EDIT_MODEL,
        params: JSON.stringify({ prompt: "tuđe" }),
        parentJobId: foreign._id,
      }),
    ).rejects.toThrow(/IZVOR_NIJE_DOSTUPAN/);

    const state = await t.run(async (ctx) => ({
      jobs: await ctx.db
        .query("generationJobs")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      balance: (await ctx.db
        .query("creditBalances")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique())?.balance,
    }));
    expect(state.jobs).toHaveLength(0);
    expect(state.balance).toBe(10_000);
  });

  test("posao bez roditelja ostaje koren (bez polja)", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await seedCatalogModel(t);
    const jobId = (await asUser.mutation(api.studio.createJob, {
      modelSlug: EDIT_MODEL,
      params: JSON.stringify({ prompt: "nova lisica" }),
    })) as Id<"generationJobs">;
    const job = await jobOf(t, jobId);
    expect(job?.parentJobId).toBeUndefined();
    expect(job?.rootJobId).toBeUndefined();
    expect(job?.derivation).toBeUndefined();
  });

  test("MCP: neparsiv ili tuđ parentJobId je IZVOR_NIJE_DOSTUPAN; svoj se upisuje", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedCatalogModel(t);
    const own = await insertDone(t, userId);
    const foreign = await insertDone(t, other.userId);
    const base = { userId, modelSlug: EDIT_MODEL, params: JSON.stringify({ prompt: "mcp" }) };

    await expect(t.mutation(internal.studio.createJobInternal, { ...base, parentJobId: "nije-id" })).rejects.toThrow(
      /IZVOR_NIJE_DOSTUPAN/,
    );
    await expect(t.mutation(internal.studio.createJobInternal, { ...base, parentJobId: foreign._id })).rejects.toThrow(
      /IZVOR_NIJE_DOSTUPAN/,
    );
    const jobId = (await t.mutation(internal.studio.createJobInternal, { ...base, parentJobId: own._id })) as Id<"generationJobs">;
    expect((await jobOf(t, jobId))?.parentJobId).toBe(own._id);
  });
});

describe("izlaz kao ulaz (adoptOutputAsInput)", () => {
  test("alias red nad istim blobom, bez roka; drugi poziv ne pravi duplikat", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const source = await insertDone(t, userId);

    const first = await asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId: source._id });
    const second = await asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId: source._id });
    expect(first.storageId).toBe(source.outputStorageId);
    expect(first.slot).toBe("image");
    expect(first.mime).toBe("image/png");
    expect(first.url).toBeTruthy();
    expect(second.storageId).toBe(first.storageId);

    const rows = await t.run((ctx) =>
      ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", source.outputStorageId!))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceJobId).toBe(source._id);
    expect(rows[0].userId).toBe(userId);
    expect(rows[0].expiresAt).toBeUndefined();
  });

  test("tuđ, nezavršen, istekao ili pogrešnog tipa rad se ne usvaja", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const foreign = await insertDone(t, other.userId);
    const expired = await insertDone(t, userId, { output: false });
    const gif = await insertDone(t, userId, { contentType: "image/gif" });
    const running = await t.run(async (ctx) =>
      ctx.db.insert("generationJobs", {
        userId,
        modelSlug: EDIT_MODEL,
        kind: "image",
        params: "{}",
        promptHash: "0".repeat(16),
        status: "running",
        creditCost: 10,
        createdAt: 1,
      }),
    );

    for (const jobId of [foreign._id, expired._id, running]) {
      await expect(asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId })).rejects.toThrow(
        /IZVOR_NIJE_DOSTUPAN/,
      );
    }
    await expect(asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId: gif._id })).rejects.toThrow(
      /NEISPRAVAN_TIP_FAJLA/,
    );
    await expect(t.mutation(api.creaVersions.adoptOutputAsInput, { jobId: gif._id })).rejects.toThrow();
  });

  test("posao sa alias ulazom dobija roditelja sam (server), izvođenje po vrsti", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedCatalogModel(t);
    const root = await insertDone(t, userId, { createdAt: 1 });
    const source = await insertDone(t, userId, { createdAt: 2, parent: root });
    const alias = await asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId: source._id });

    const jobId = (await asUser.mutation(api.studio.createJob, {
      modelSlug: EDIT_MODEL,
      params: JSON.stringify({ prompt: "dodaj šešir" }),
      inputMode: "image_multi",
      inputs: JSON.stringify({ image: [alias.storageId] }),
    })) as Id<"generationJobs">;

    const job = await jobOf(t, jobId);
    expect(job?.parentJobId).toBe(source._id);
    expect(job?.rootJobId).toBe(root._id);
    expect(job?.derivation).toBe("izmena");
  });

  test("brisanje deteta NE briše izlaz roditelja (briše se samo alias red)", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const source = await insertDone(t, userId, { createdAt: 1 });
    const alias = await asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId: source._id });
    const child = await insertDone(t, userId, {
      createdAt: 2,
      parent: source,
      inputs: JSON.stringify({ image: [alias.storageId] }),
    });

    await asUser.mutation(api.studio.deleteJob, { jobId: child._id });

    expect(await fileExists(t, source.outputStorageId!)).toBe(true);
    expect((await jobOf(t, source._id))?.outputStorageId).toBe(source.outputStorageId);
    const rows = await t.run((ctx) =>
      ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", source.outputStorageId!))
        .collect(),
    );
    expect(rows).toHaveLength(0);
  });

  test("brisanje roditelja briše i alias redove nad njegovim izlazom", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const source = await insertDone(t, userId);
    await asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId: source._id });

    await asUser.mutation(api.studio.deleteJob, { jobId: source._id });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", source.outputStorageId!))
        .collect(),
    );
    expect(rows).toHaveLength(0);
    expect(await fileExists(t, source.outputStorageId!)).toBe(false);
  });

  test("izlaz deteta ne postavlja rok alias ulazu (a običnom ulazu postavlja)", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const source = await insertDone(t, userId, { createdAt: 1 });
    const alias = await asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId: source._id });
    const plain = await storeFile(t);
    const plainUploadId = await t.run((ctx) =>
      ctx.db.insert("studioUploads", { userId, storageId: plain, slot: "image", bytes: 5, createdAt: 1 }),
    );
    const child = await insertDone(t, userId, {
      createdAt: 2,
      parent: source,
      output: false,
      inputs: JSON.stringify({ image: [alias.storageId, plain] }),
    });

    const output = await storeFile(t);
    expect(
      await t.mutation(internal.studio.finalizeOutput, { jobId: child._id, storageId: output, byteSize: 5 }),
    ).toBe(true);

    const rows = await t.run(async (ctx) => ({
      alias: await ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", alias.storageId))
        .first(),
      plain: await ctx.db.get(plainUploadId),
    }));
    expect(rows.alias?.expiresAt).toBeUndefined();
    expect(rows.plain?.expiresAt).toBeGreaterThan(0);
  });

  test("cron isteka nikad ne briše blob alias reda", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const source = await insertDone(t, userId);
    await asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId: source._id });
    // Odbrana: i kad bi alias nekako dobio rok, blob ostaje izlazu roditelja.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", source.outputStorageId!))
        .first();
      await ctx.db.patch(row!._id, { expiresAt: 1 });
    });

    await t.mutation(internal.crons.expireGenerationFiles, {});

    expect(await fileExists(t, source.outputStorageId!)).toBe(true);
    expect((await jobOf(t, source._id))?.outputStorageId).toBe(source.outputStorageId);
  });
});

describe("lokalni alat (saveLocalResult)", () => {
  async function saveLocal(t: TestConvex, asUser: ReturnType<TestConvex["withIdentity"]>, parentJobId?: Id<"generationJobs">) {
    const storageId = await storeFile(t, "image/webp");
    const { grantId } = await asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image", ...(await localDigest(t, storageId)) });
    const result = await asUser.mutation(api.creaLocal.saveLocalResult, {
      grantId,
      storageId,
      toolId: "slika.format",
      kind: "image",
      ...(parentJobId ? { parentJobId } : {}),
    });
    return { result, storageId };
  }

  test("rezultat alata nad radom iz galerije postaje njegova verzija", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const root = await insertDone(t, userId, { createdAt: 1 });
    const source = await insertDone(t, userId, { createdAt: 2, parent: root });

    const { result } = await saveLocal(t, asUser, source._id);
    if (!result.ok) throw new Error(result.reason);
    const job = await jobOf(t, result.jobId);
    expect(job?.parentJobId).toBe(source._id);
    expect(job?.rootJobId).toBe(root._id);
    expect(job?.derivation).toBe("lokalni-alat");

    const tree = await asUser.query(api.creaVersions.getVersionTree, { jobId: root._id });
    expect(tree?.nodes.map((n) => n._id)).toEqual([root._id, source._id, result.jobId]);
  });

  test("tuđ roditelj: { ok:false }, fajl obrisan, posla nema", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const foreign = await insertDone(t, other.userId);

    const { result, storageId } = await saveLocal(t, asUser, foreign._id);
    expect(result).toEqual({ ok: false, reason: "IZVOR_NIJE_DOSTUPAN" });
    expect(await fileExists(t, storageId)).toBe(false);
  });

  test("bez roditelja rezultat je koren, kao u K04", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const { result } = await saveLocal(t, asUser);
    if (!result.ok) throw new Error(result.reason);
    const job = await jobOf(t, result.jobId);
    expect(job?.parentJobId).toBeUndefined();
    expect(job?.derivation).toBeUndefined();
  });
});

describe("K18: nastavak videa od poslednjeg kadra (V4)", () => {
  const VIDEO_MODEL = "hailuo-23-fast";

  test("kadar sačuvan iz videa je njegova verzija, a nov klip od tog kadra je „produženje” videa", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedCatalogModel(t, VIDEO_MODEL);
    const video = await insertDone(t, userId, { kind: "video", contentType: "video/mp4" });

    // 1) Alat „Nastavi od poslednjeg kadra": kadar izvučen na uređaju ide u galeriju kao verzija videa.
    const frameStorage = await storeFile(t, "image/png");
    const { grantId } = await asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image", ...(await localDigest(t, frameStorage)) });
    const saved = await asUser.mutation(api.creaLocal.saveLocalResult, {
      grantId,
      storageId: frameStorage,
      toolId: "video.poslednji-kadar",
      kind: "image",
      parentJobId: video._id,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const frameJob = await jobOf(t, saved.jobId);
    expect(frameJob).toMatchObject({ provider: "local", creditCost: 0, kind: "image", parentJobId: video._id, rootJobId: video._id });

    // 2) Composer: isti kadar okačen kao ulaz `image`, posao nosi video kao roditelja („produzenje").
    const inputStorage = await asUser.run((ctx) => ctx.storage.store(new Blob(["kadar"], { type: "image/png" })));
    const { grantId: inputGrant } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "image" });
    await asUser.mutation(api.studio.registerInputUpload, { storageId: inputStorage, grantId: inputGrant });
    const jobId = (await asUser.mutation(api.studio.createJob, {
      modelSlug: VIDEO_MODEL,
      params: JSON.stringify({ prompt: "mačka nastavlja da trči" }),
      inputMode: "image",
      inputs: JSON.stringify({ image: [inputStorage] }),
      parentJobId: video._id,
      derivation: "produzenje",
    })) as Id<"generationJobs">;
    const next = await jobOf(t, jobId);
    expect(next).toMatchObject({ kind: "video", parentJobId: video._id, rootJobId: video._id, derivation: "produzenje" });
    expect(JSON.parse(next!.inputs!)).toEqual({ image: [inputStorage] });
  });
});
