/// <reference types="vite/client" />

/**
 * Rezultati lokalnih alata u galeriji (Crea K04): prijava, kapija, dozvola,
 * tip i veličina iz `_storage`, limiti po minutu/danu/bajtovima, vlasništvo nad
 * projektom - i da ništa od toga ne dira kredite ni dnevnu potrošnju.
 */

import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LOCAL_RESULT_LIMITS, LOCAL_RESULT_MAX_BYTES, localResultProblem, sanitizeLocalParams } from "./creaLocalCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Podne po UTC-u: „danas" i „poslednji minut" ne prelaze ponoć ni u jednom testu.
const NOON = Date.UTC(2026, 9, 5, 12, 0, 0);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON);
});

afterAll(() => {
  vi.useRealTimers();
});

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

async function seedUser(t: TestConvex, opts: { role?: "student" | "moderator"; email?: string } = {}) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: opts.email ?? "mila@example.com",
      name: "Mila Crea",
      username: opts.email ? opts.email.split("@")[0] : "mila_crea",
      role: opts.role ?? "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

/**
 * Fajl kakav bi browser okačio. `convex-test` iz `Blob`-a ne prenosi tip, pa se
 * `_storage` red dopunjuje (isti obrazac kao `studio.test.ts`).
 */
async function storeFile(t: TestConvex, opts: { contentType?: string; size?: number; body?: string } = {}) {
  return t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([opts.body ?? "webp-bajtovi"]));
    const meta: Record<string, unknown> = {};
    if (opts.contentType !== undefined) meta.contentType = opts.contentType;
    if (opts.size !== undefined) meta.size = opts.size;
    if (Object.keys(meta).length > 0) await ctx.db.patch(id as unknown as Id<"studioUploads">, meta);
    return id;
  });
}

async function fileExists(t: TestConvex, storageId: Id<"_storage">) {
  return t.run(async (ctx) => (await ctx.db.system.get("_storage", storageId)) !== null);
}

type AsUser = Awaited<ReturnType<typeof seedUser>>["asUser"];

/** Ceo put: dozvola → upload → upis. */
async function saveImage(
  t: TestConvex,
  asUser: AsUser,
  opts: { toolId?: string; contentType?: string; size?: number; params?: string; projectId?: Id<"studioProjects"> } = {},
) {
  const { grantId } = await asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image" });
  const storageId = await storeFile(t, { contentType: opts.contentType ?? "image/webp", size: opts.size });
  const result = await asUser.mutation(api.creaLocal.saveLocalResult, {
    grantId,
    storageId,
    toolId: opts.toolId ?? "slika.format",
    kind: "image",
    ...(opts.params !== undefined ? { params: opts.params } : {}),
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
  });
  return { grantId, storageId, result };
}

async function insertLocalJobs(t: TestConvex, userId: Id<"users">, count: number, createdAt: number, outputBytes = 10) {
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("generationJobs", {
        userId,
        modelSlug: "local:slika.format",
        kind: "image",
        provider: "local",
        params: "{}",
        promptHash: "0",
        status: "done",
        creditCost: 0,
        outputBytes,
        createdAt,
        completedAt: createdAt,
      });
    }
  });
}

describe("kapija", () => {
  test("bez prijave nema ni dozvole ni upisa", async () => {
    const t = makeT();
    await expect(t.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image" })).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("studioUploadGrants").collect())).toEqual([]);
  });

  test("student bez pristupa Crei (javni fleg ugašen) dobija NEMA_PRISTUPA", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t, { role: "student" });
    await expect(asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image" })).rejects.toThrow(
      /NEMA_PRISTUPA/,
    );
    expect(await t.run((ctx) => ctx.db.query("studioUploadGrants").collect())).toEqual([]);
  });

  test("tuđa, istrošena, istekla ili pogrešna dozvola baca grešku i NE briše fajl", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const other = await seedUser(t, { email: "nikola@example.com" });

    const { grantId: foreignGrant } = await other.asUser.mutation(api.creaLocal.createLocalResultUploadUrl, {
      kind: "image",
    });
    const storageId = await storeFile(t, { contentType: "image/webp" });
    await expect(
      asUser.mutation(api.creaLocal.saveLocalResult, { grantId: foreignGrant, storageId, toolId: "slika.format", kind: "image" }),
    ).rejects.toThrow(/NEDOZVOLJEN_UPLOAD/);

    // Dozvola za sliku ne važi za video.
    const { grantId: imageGrant } = await asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image" });
    await expect(
      asUser.mutation(api.creaLocal.saveLocalResult, { grantId: imageGrant, storageId, toolId: "slika.format", kind: "video" }),
    ).rejects.toThrow(/NEDOZVOLJEN_UPLOAD/);

    // Dozvola za ULAZ plaćenog posla nije dozvola za lokalni rezultat.
    const { grantId: inputGrant } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "image" });
    await expect(
      asUser.mutation(api.creaLocal.saveLocalResult, { grantId: inputGrant, storageId, toolId: "slika.format", kind: "image" }),
    ).rejects.toThrow(/NEDOZVOLJEN_UPLOAD/);

    // Iskorišćena dozvola ne važi drugi put.
    const first = await saveImage(t, asUser);
    expect(first.result.ok).toBe(true);
    const again = await storeFile(t, { contentType: "image/webp" });
    await expect(
      asUser.mutation(api.creaLocal.saveLocalResult, {
        grantId: first.grantId,
        storageId: again,
        toolId: "slika.format",
        kind: "image",
      }),
    ).rejects.toThrow(/NEDOZVOLJEN_UPLOAD/);

    expect(await fileExists(t, storageId)).toBe(true);
    expect(await fileExists(t, again)).toBe(true);
  });

  test("fajl stariji od dozvole (zatečen tuđi upload) se ne prisvaja i ne briše", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const oldFile = await storeFile(t, { contentType: "image/webp" });
    vi.setSystemTime(NOON + 5 * 60 * 1000);
    try {
      const { grantId } = await asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image" });
      await expect(
        asUser.mutation(api.creaLocal.saveLocalResult, { grantId, storageId: oldFile, toolId: "slika.format", kind: "image" }),
      ).rejects.toThrow(/NEDOZVOLJEN_UPLOAD/);
      expect(await fileExists(t, oldFile)).toBe(true);
    } finally {
      vi.setSystemTime(NOON);
    }
  });
});

describe("tip, veličina i alat", () => {
  test("pogrešan tip, prevelik ili prazan fajl: { ok:false }, fajl obrisan, dozvola potrošena", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const cases: Array<[{ contentType?: string; size?: number }, string]> = [
      [{ contentType: "image/svg+xml" }, "NEISPRAVAN_TIP_FAJLA"],
      [{ contentType: "audio/mpeg" }, "NEISPRAVAN_TIP_FAJLA"],
      [{ contentType: "image/webp", size: LOCAL_RESULT_MAX_BYTES.image + 1 }, "FAJL_PREVELIK"],
      [{ contentType: "image/png", size: 0 }, "PRAZAN_FAJL"],
    ];
    for (const [file, reason] of cases) {
      const { grantId, storageId, result } = await saveImage(t, asUser, file);
      expect(result, reason).toEqual({ ok: false, reason });
      expect(await fileExists(t, storageId), reason).toBe(false);
      expect((await t.run((ctx) => ctx.db.get(grantId)))?.usedAt, reason).toBeDefined();
    }
    expect(await t.run((ctx) => ctx.db.query("generationJobs").collect())).toEqual([]);
  });

  test("nepoznat, nespreman ili plaćen alat, i alat koji ne pravi ovu vrstu: NEPOZNAT_ALAT", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    // K11: „Ukloni pozadinu" je gotova, pa je nespreman primer „Retuš"; četkica je gotova, ali plaćena.
    for (const toolId of ["slika.nepostoji", "slika.retus", "slika.prosiri", "slika.cetkica", "slika.paleta"]) {
      const { storageId, result } = await saveImage(t, asUser, { toolId });
      expect(result, toolId).toEqual({ ok: false, reason: "NEPOZNAT_ALAT" });
      expect(await fileExists(t, storageId), toolId).toBe(false);
    }
  });

  test("čista pravila: tip sa parametrima, granice po vrsti", () => {
    expect(localResultProblem({ kind: "image", contentType: "image/JPEG; q=1", size: 10 })).toBeNull();
    expect(localResultProblem({ kind: "image", size: 10 })).toBe("NEISPRAVAN_TIP_FAJLA");
    expect(localResultProblem({ kind: "video", contentType: "video/mp4", size: LOCAL_RESULT_MAX_BYTES.video })).toBeNull();
    expect(localResultProblem({ kind: "audio", contentType: "audio/wav", size: LOCAL_RESULT_MAX_BYTES.audio + 1 })).toBe(
      "FAJL_PREVELIK",
    );
  });

  test("parametri: samo primitivni, do 30 ključeva i 2 KB", () => {
    expect(sanitizeLocalParams('{"format":"webp","kvalitet":80,"gps":true,"x":[1],"y":{"a":1},"$z":1}')).toBe(
      '{"format":"webp","kvalitet":80,"gps":true}',
    );
    expect(sanitizeLocalParams("nije json")).toBe("{}");
    expect(sanitizeLocalParams("[1,2]")).toBe("{}");
    expect(sanitizeLocalParams(undefined)).toBe("{}");
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`k${index}`, index]));
    expect(Object.keys(JSON.parse(sanitizeLocalParams(JSON.stringify(many))))).toHaveLength(30);
    const long = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, "ž".repeat(200)]));
    expect(sanitizeLocalParams(JSON.stringify(long))).toBe("{}");
  });
});

describe("limiti", () => {
  test("minutni limit: i dozvola i upis se odbijaju", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const { grantId } = await asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image" });
    await insertLocalJobs(t, userId, LOCAL_RESULT_LIMITS.perMinute, NOON - 10_000);

    await expect(asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image" })).rejects.toThrow(
      /MINUTNI_LIMIT/,
    );
    // Dozvola izdata pre punjenja limita i dalje ne prolazi: konačna provera je u upisu.
    const storageId = await storeFile(t, { contentType: "image/webp" });
    const result = await asUser.mutation(api.creaLocal.saveLocalResult, {
      grantId,
      storageId,
      toolId: "slika.format",
      kind: "image",
    });
    expect(result).toEqual({ ok: false, reason: "MINUTNI_LIMIT" });
    expect(await fileExists(t, storageId)).toBe(false);

    // Minut kasnije opet može.
    vi.setSystemTime(NOON + 61_000);
    try {
      expect((await saveImage(t, asUser)).result.ok).toBe(true);
    } finally {
      vi.setSystemTime(NOON);
    }
  });

  test("dnevni limit broja radova (juče se ne broji)", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await insertLocalJobs(t, userId, LOCAL_RESULT_LIMITS.perDay, NOON - 13 * 60 * 60 * 1000);
    expect((await saveImage(t, asUser)).result.ok).toBe(true);

    await insertLocalJobs(t, userId, LOCAL_RESULT_LIMITS.perDay, NOON - 60 * 60 * 1000);
    await expect(asUser.mutation(api.creaLocal.createLocalResultUploadUrl, { kind: "image" })).rejects.toThrow(
      /DNEVNI_LIMIT/,
    );
  });

  test("dnevni limit prostora računa i fajl koji se upravo čuva", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await insertLocalJobs(t, userId, 1, NOON - 60 * 60 * 1000, LOCAL_RESULT_LIMITS.bytesPerDay - 100);
    const fits = await saveImage(t, asUser, { size: 100 });
    expect(fits.result.ok).toBe(true);
    const over = await saveImage(t, asUser, { size: 1 });
    expect(over.result).toEqual({ ok: false, reason: "DNEVNI_LIMIT_PROSTORA" });
    expect(await fileExists(t, over.storageId)).toBe(false);
  });

  test("plaćeni poslovi se ne broje u lokalni limit", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < LOCAL_RESULT_LIMITS.perMinute; index += 1) {
        await ctx.db.insert("generationJobs", {
          userId,
          modelSlug: "nano-banana-2",
          kind: "image",
          provider: "google",
          params: "{}",
          promptHash: "0",
          status: "done",
          creditCost: 16,
          createdAt: NOON - 5_000,
        });
      }
    });
    expect((await saveImage(t, asUser)).result.ok).toBe(true);
  });
});

describe("vlasništvo i upis", () => {
  test("tuđ ili arhiviran projekat se odbija, svoj se upisuje", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, { email: "nikola@example.com" });
    const [own, archived, foreign] = await t.run(async (ctx) => [
      await ctx.db.insert("studioProjects", { userId, name: "Moj", createdAt: 1, updatedAt: 1 }),
      await ctx.db.insert("studioProjects", { userId, name: "Stari", createdAt: 1, updatedAt: 1, archivedAt: 2 }),
      await ctx.db.insert("studioProjects", { userId: other.userId, name: "Tuđi", createdAt: 1, updatedAt: 1 }),
    ]);

    for (const projectId of [archived, foreign]) {
      const { storageId, result } = await saveImage(t, asUser, { projectId });
      expect(result).toEqual({ ok: false, reason: "PROJEKAT_NIJE_DOSTUPAN" });
      expect(await fileExists(t, storageId)).toBe(false);
    }
    const { result } = await saveImage(t, asUser, { projectId: own });
    if (!result.ok) throw new Error(result.reason);
    expect((await t.run((ctx) => ctx.db.get(result.jobId)))?.projectId).toBe(own);
  });

  test("uspeh: rad je u galeriji kao lokalni, 0 kredita, krediti i dnevna potrošnja netaknuti", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const { storageId, result } = await saveImage(t, asUser, {
      params: JSON.stringify({ format: "webp", kvalitet: 80, uklonjeno: "gps,device" }),
    });
    if (!result.ok) throw new Error(result.reason);

    const job = await t.run((ctx) => ctx.db.get(result.jobId));
    expect(job).toMatchObject({
      userId,
      modelSlug: "local:slika.format",
      kind: "image",
      provider: "local",
      status: "done",
      creditCost: 0,
      estimatedCostUsd: 0,
      outputStorageId: storageId,
      params: '{"format":"webp","kvalitet":80,"uklonjeno":"gps,device"}',
      createdAt: NOON,
      completedAt: NOON,
    });
    expect(job?.outputBytes).toBeGreaterThan(0);
    expect(job?.expiresAt).toBeGreaterThan(NOON);

    const page = await asUser.query(api.studio.listMyJobs, {
      paginationOpts: { numItems: 10, cursor: null },
      kind: "image",
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]).toMatchObject({ _id: result.jobId, modelSlug: "local:slika.format", creditCost: 0, status: "done" });
    expect(page.page[0].outputUrl).toEqual(expect.any(String));

    const untouched = await t.run(async (ctx) => ({
      balances: await ctx.db.query("creditBalances").collect(),
      transactions: await ctx.db.query("creditTransactions").collect(),
      usage: await ctx.db.query("studioUsageDaily").collect(),
    }));
    expect(untouched).toEqual({ balances: [], transactions: [], usage: [] });
  });

  test("provera fotke čuva sliku; tuđi korisnik ne vidi rad; brisanje briše i fajl", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const other = await seedUser(t, { email: "nikola@example.com" });
    const { storageId, result } = await saveImage(t, asUser, { toolId: "slika.provera", contentType: "image/jpeg" });
    if (!result.ok) throw new Error(result.reason);

    const foreignPage = await other.asUser.query(api.studio.listMyJobs, { paginationOpts: { numItems: 10, cursor: null } });
    expect(foreignPage.page).toEqual([]);
    await expect(other.asUser.mutation(api.studio.deleteJob, { jobId: result.jobId })).rejects.toThrow();
    expect(await fileExists(t, storageId)).toBe(true);

    await asUser.mutation(api.studio.deleteJob, { jobId: result.jobId });
    expect(await fileExists(t, storageId)).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(result.jobId))).toBeNull();
  });
});
