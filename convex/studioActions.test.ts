/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { mockJobSucceeds } from "./studioCore";

const modules = import.meta.glob("./**/*.ts");

type TestConvex = ReturnType<typeof convexTest>;

const previousFalKey = process.env.FAL_KEY;
const previousSiteUrl = process.env.CONVEX_SITE_URL;
const previousStudioMock = process.env.STUDIO_MOCK;

beforeEach(() => {
  delete process.env.FAL_KEY;
  delete process.env.CONVEX_SITE_URL;
  delete process.env.STUDIO_MOCK;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousFalKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = previousFalKey;
  if (previousSiteUrl === undefined) delete process.env.CONVEX_SITE_URL;
  else process.env.CONVEX_SITE_URL = previousSiteUrl;
  if (previousStudioMock === undefined) delete process.env.STUDIO_MOCK;
  else process.env.STUDIO_MOCK = previousStudioMock;
});

async function seedUser(t: TestConvex) {
  return t.run((ctx) => ctx.db.insert("users", { email: "studio@example.com", name: "Studio Student" }));
}

async function seedModel(t: TestConvex, overrides: Partial<{ defaultParams: string; falEndpoint: string }> = {}) {
  return t.run((ctx) =>
    ctx.db.insert("modelCatalog", {
      slug: "flux-2-flash",
      kind: "image",
      labelSr: "FLUX.2 Flash",
      labelEn: "FLUX.2 Flash",
      descriptionSr: "Najjeftiniji model za brzo eksperimentisanje.",
      descriptionEn: "Cheapest model for fast experimentation.",
      provider: "fal",
      falEndpoint: overrides.falEndpoint ?? "fal-ai/flux-2/flash",
      defaultParams: overrides.defaultParams ?? JSON.stringify({ aspect_ratio: "1:1", num_images: 1 }),
      paramSchema: "[]",
      creditCost: 3,
      estimatedCostUsd: 0.005,
      isEnabled: true,
      sortOrder: 10,
      updatedAt: Date.now(),
    }),
  );
}

/**
 * Simulira ono što `createJob` (A9) radi atomski: rezerviše posao I skida
 * kredite u istoj transakciji. `submitJob` pretpostavlja da ta potrošnja već
 * postoji kad se pozove - baš kao što će biti u pravom flow-u.
 */
async function seedReservedJob(
  t: TestConvex,
  userId: Id<"users">,
  opts: { modelSlug: string; params?: string; creditCost?: number },
) {
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: opts.modelSlug,
      kind: "image",
      params: opts.params ?? JSON.stringify({ prompt: "a fox" }),
      promptHash: "hash",
      status: "reserved",
      creditCost: opts.creditCost ?? 20,
      createdAt: Date.now(),
    }),
  );
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 100,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${jobId}` },
  });
  await t.mutation(internal.credits.spendCredits, {
    userId,
    amount: opts.creditCost ?? 20,
    jobId,
  });
  return jobId;
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

// `markJobRunning` i `failJob` su se u A9 preselile u `convex/studio.ts`;
// njihovi testovi žive u `convex/studio.test.ts`.

// ── Mock provajder (P4) ──────────────────────────────────────────────────
// Dok Jovan nema FAL_KEY, submitJob ne sme da baci - posao mora da prodje
// kroz IDENTIČAN ledger put kao sa pravim fal-om, samo preko simulacije.

test("submitJob ide u mock kad FAL_KEY fali - bez mrežnog poziva, running sa mock- falRequestId", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });
  const before = await balanceOf(t, userId);

  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await t.action(internal.studioActions.submitJob, { jobId });

  expect(fetchMock).not.toHaveBeenCalled();
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("running");
  expect(job?.falRequestId).toBe(`mock-${jobId}`);
  // Mock ne menja ledger sam po sebi - to radi tek completeMockJob, kao i
  // pravi fal tek posle svog webhook-a.
  expect(await balanceOf(t, userId)).toBe(before);

  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  const mockCall = scheduled.find((entry) => entry.name.includes("completeMockJob"));
  expect(mockCall).toBeDefined();
  expect(mockCall?.args[0]).toEqual({ jobId });
});

test("submitJob ide u mock i kad FAL_KEY postoji, ako je STUDIO_MOCK='1'", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.STUDIO_MOCK = "1";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await t.action(internal.studioActions.submitJob, { jobId });

  expect(fetchMock).not.toHaveBeenCalled();
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("running");
  expect(job?.falRequestId).toBe(`mock-${jobId}`);
});

test("submitJob ide na pravi fal kad FAL_KEY postoji, čak i bez STUDIO_MOCK-a postavljenog na ništa drugo osim '1'", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.STUDIO_MOCK = "0";
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ request_id: "req_pravi" }),
  }));
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  await t.action(internal.studioActions.submitJob, { jobId });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("running");
  expect(job?.falRequestId).toBe("req_pravi");
});

/** Ide dok ne pronadje jedan posao koji uspe i jedan koji padne (85/15 podela). */
async function seedMockJobPair(t: TestConvex, userId: Id<"users">) {
  let succeeds: Id<"generationJobs"> | null = null;
  let fails: Id<"generationJobs"> | null = null;
  for (let attempt = 0; attempt < 50 && (!succeeds || !fails); attempt += 1) {
    const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });
    await t.run((ctx) => ctx.db.patch(jobId, { status: "running", falRequestId: `mock-${jobId}` }));
    if (mockJobSucceeds(jobId)) succeeds = succeeds ?? jobId;
    else fails = fails ?? jobId;
  }
  if (!succeeds || !fails) throw new Error("test setup: 50 pokušaja nije dalo oba ishoda");
  return { succeeds, fails };
}

test("completeMockJob (uspeh): ide kroz applyWebhookResult kao pravi webhook - done, SVG data URL, bez refunda", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const { succeeds: jobId } = await seedMockJobPair(t, userId);
  const before = await balanceOf(t, userId);

  await t.action(internal.studioActions.completeMockJob, { jobId });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("done");
  expect(job?.falOutputUrl).toMatch(/^data:image\/svg\+xml/);
  expect(await balanceOf(t, userId)).toBe(before);

  // Isti put kao pravi webhook: uspeh zakazuje persistOutput.
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled.some((entry) => entry.name.includes("persistOutput"))).toBe(true);
});

test("completeMockJob (neuspeh): refundira tačno jednom, isti put kao ERROR webhook", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const { fails: jobId } = await seedMockJobPair(t, userId);
  const before = await balanceOf(t, userId);

  await t.action(internal.studioActions.completeMockJob, { jobId });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("refunded");
  expect(job?.error).toMatch(/^MOCK_NEUSPEH/);
  expect(await balanceOf(t, userId)).toBe(before + 20);

  // Drugi poziv (npr. dvostruko zakazivanje) ne sme da refundira opet -
  // `completeMockJob` izlazi čim posao nije više `running`.
  await t.action(internal.studioActions.completeMockJob, { jobId });
  expect(await balanceOf(t, userId)).toBe(before + 20);
});

test("completeMockJob ne dira posao čiji falRequestId nije mock (bez prefiksa)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });
  await t.run((ctx) => ctx.db.patch(jobId, { status: "running", falRequestId: "req_pravi" }));
  const before = await balanceOf(t, userId);

  await t.action(internal.studioActions.completeMockJob, { jobId });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("running");
  expect(job?.falRequestId).toBe("req_pravi");
  expect(await balanceOf(t, userId)).toBe(before);
});

test("mockJobSucceeds je determinističan - isti jobId uvek daje isti ishod", () => {
  const sampleIds = ["job_a", "job_b", "job_c", "generationJobs|123", "mk97xyz"];
  for (const id of sampleIds) {
    const first = mockJobSucceeds(id);
    for (let repeat = 0; repeat < 5; repeat += 1) {
      expect(mockJobSucceeds(id)).toBe(first);
    }
  }
});

test("submitJob refundira kad CONVEX_SITE_URL fali", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });

  process.env.FAL_KEY = "test-fal-key";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await t.action(internal.studioActions.submitJob, { jobId });

  expect(fetchMock).not.toHaveBeenCalled();
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("CONVEX_SITE_URL nije postavljen");
});

test("submitJob predaje posao fal-u i markira running na uspeh", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, { defaultParams: JSON.stringify({ aspect_ratio: "1:1", num_images: 1 }) });
  const jobId = await seedReservedJob(t, userId, {
    modelSlug: "flux-2-flash",
    params: JSON.stringify({ prompt: "a fox", num_images: 2 }),
  });

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";

  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(
      `https://queue.fal.run/fal-ai/flux-2/flash?fal_webhook=${encodeURIComponent(
        "https://example.convex.site/fal/webhook",
      )}`,
    );
    expect((init.headers as Record<string, string>).Authorization).toBe("Key test-fal-key");
    expect(JSON.parse(init.body as string)).toEqual({
      aspect_ratio: "1:1",
      num_images: 2,
      prompt: "a fox",
    });
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ request_id: "req_abc" }),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);

  await t.action(internal.studioActions.submitJob, { jobId });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("running");
  expect(job?.falRequestId).toBe("req_abc");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("submitJob refundira kad fal vrati ne-2xx status, sa telom odgovora u poruci", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash", creditCost: 20 });
  const before = await balanceOf(t, userId);

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "bad prompt" }),
      json: async () => ({}),
    })) as unknown as typeof fetch,
  );

  await t.action(internal.studioActions.submitJob, { jobId });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("refunded");
  expect(job?.error).toMatch(/422/);
  expect(job?.error).toMatch(/bad prompt/);
  expect(await balanceOf(t, userId)).toBe(before + 20);
});

test("submitJob refundira kad model nije u katalogu", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  // Namerno bez seedModel - job pokazuje na slug koji ne postoji u katalogu.
  const jobId = await seedReservedJob(t, userId, { modelSlug: "nepostojeci-model" });

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  vi.stubGlobal("fetch", vi.fn());

  await t.action(internal.studioActions.submitJob, { jobId });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("Model nije pronađen u katalogu.");
});

test("submitJob ne šalje ništa kad posao više nije reserved", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });
  // Prva predaja je prošla: posao je `running` i ima svoj `falRequestId`.
  await t.run((ctx) => ctx.db.patch(jobId, { status: "running", falRequestId: "req_prvi" }));
  const before = await balanceOf(t, userId);

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await t.action(internal.studioActions.submitJob, { jobId });

  // Druga predaja bi fal-u platila dvaput na jedan naplaćen kredit.
  expect(fetchMock).not.toHaveBeenCalled();
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("running");
  expect(job?.falRequestId).toBe("req_prvi");
  expect(job?.error).toBeUndefined();
  expect(await balanceOf(t, userId)).toBe(before);
});

test("submitJob ne dira refundiran posao - ni novom predajom ni drugim refundom", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });
  await t.mutation(internal.studio.failJob, { jobId, error: "reaper" });
  const before = await balanceOf(t, userId);

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await t.action(internal.studioActions.submitJob, { jobId });

  expect(fetchMock).not.toHaveBeenCalled();
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("reaper");
  expect(await balanceOf(t, userId)).toBe(before);
});

// ── persistOutput (A11) ──────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const FAL_URL = "https://fal.media/files/izlaz.png";

/** Posao koji je webhook već oborio u `done`; ostalo je samo da se skine fajl. */
async function seedDoneJob(
  t: TestConvex,
  userId: Id<"users">,
  opts: {
    kind?: "image" | "video" | "audio";
    params?: string;
    lessonId?: Id<"lessons">;
    taskId?: Id<"lessonTasks">;
    withoutOutputUrl?: boolean;
  } = {},
) {
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });
  await t.run((ctx) =>
    ctx.db.patch(jobId, {
      kind: opts.kind ?? "image",
      params: opts.params ?? JSON.stringify({ prompt: "lisica u snegu" }),
      status: "done",
      falRequestId: "req_done",
      falOutputUrl: opts.withoutOutputUrl ? undefined : FAL_URL,
      completedAt: Date.now(),
      ...(opts.lessonId ? { lessonId: opts.lessonId } : {}),
      ...(opts.taskId ? { taskId: opts.taskId } : {}),
    }),
  );
  return jobId;
}

/** Lekcija sa jednim obaveznim zadatkom - kontekst iz STUDIO-PLAN 1.1. */
async function seedLesson(t: TestConvex) {
  return t.run(async (ctx) => {
    const courseId = await ctx.db.insert("courses", {
      slug: "lab-kurs",
      titleSr: "Kurs",
      titleEn: "Course",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "published" as const,
      sortOrder: 1,
      updatedAt: 1,
    });
    const lessonId = await ctx.db.insert("lessons", {
      courseId,
      slug: "lekcija-1",
      titleSr: "Lekcija",
      titleEn: "Lesson",
      summarySr: "Sažetak",
      summaryEn: "Summary",
      durationSeconds: 600,
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });
    const stepId = await ctx.db.insert("lessonSteps", {
      courseId,
      lessonId,
      slug: "korak-1",
      titleSr: "Korak",
      titleEn: "Step",
      bodySr: "Telo",
      bodyEn: "Body",
      outputKind: "image" as const,
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });
    const taskId = await ctx.db.insert("lessonTasks", {
      courseId,
      lessonId,
      stepId,
      promptSr: "Napravi sliku svog lika",
      promptEn: "Generate your character",
      required: true,
      completionMode: "automatic" as const,
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });
    return { courseId, lessonId, stepId, taskId };
  });
}

/** fal koji vrati fajl; povratna vrednost broji stvarne pozive. */
function stubFileFetch(bytes = "izlazni-fajl", type = "image/png") {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    blob: async () => new Blob([bytes], { type }),
  }));
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return fetchMock;
}

async function outputsOf(t: TestConvex, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("labOutputs")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect(),
  );
}

test("persistOutput skida fajl u storage, upisuje rok i ostavlja posao u done", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedDoneJob(t, userId);
  const fetchMock = stubFileFetch();

  const before = Date.now();
  await t.action(internal.studioActions.persistOutput, { jobId });

  // Skidanje ide na fal URL BEZ Google ključa: zaglavlje se dodaje samo za
  // `generativelanguage.googleapis.com` (videti `googleDownloadHeaders`).
  expect(fetchMock).toHaveBeenCalledWith(FAL_URL, { headers: {} });
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("done");
  expect(job?.error).toBeUndefined();
  expect(job?.outputStorageId).toBeDefined();
  // Slika: 90 dana (STUDIO-PLAN 0.2).
  expect(job?.expiresAt ?? 0).toBeGreaterThanOrEqual(before + 90 * DAY_MS);
  expect(job?.expiresAt ?? 0).toBeLessThan(before + 91 * DAY_MS);

  // Fajl je stvarno u storage-u, ne samo id u redu.
  const url = await t.run((ctx) => ctx.storage.getUrl(job!.outputStorageId!));
  expect(url).not.toBeNull();
});

test("video dobija 30 dana retencije, ne 90", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedDoneJob(t, userId, { kind: "video" });
  stubFileFetch("mp4-bajtovi", "video/mp4");

  const before = Date.now();
  await t.action(internal.studioActions.persistOutput, { jobId });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.expiresAt ?? 0).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
  expect(job?.expiresAt ?? 0).toBeLessThan(before + 31 * DAY_MS);
});

test("posao iz lekcije dobija labOutputs red sa naslovom, MIME tipom i veličinom", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const { courseId, lessonId, taskId } = await seedLesson(t);
  const jobId = await seedDoneJob(t, userId, { lessonId, taskId });
  stubFileFetch("izlazni-fajl", "image/png");

  await t.action(internal.studioActions.persistOutput, { jobId });

  const outputs = await outputsOf(t, userId);
  expect(outputs).toHaveLength(1);
  const output = outputs[0];
  expect(output.kind).toBe("image");
  expect(output.status).toBe("ready");
  expect(output.title).toBe("lisica u snegu");
  expect(output.courseId).toBe(courseId);
  expect(output.lessonId).toBe(lessonId);
  expect(output.taskId).toBe(taskId);
  expect(output.mimeType).toBe("image/png");
  expect(output.byteSize).toBe(new Blob(["izlazni-fajl"]).size);

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(output.storageId).toBe(job?.outputStorageId);
  expect(job?.labOutputId).toBe(output._id);
});

test("naslov je prvih 60 znakova prompta", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const { lessonId } = await seedLesson(t);
  const jobId = await seedDoneJob(t, userId, {
    lessonId,
    params: JSON.stringify({ prompt: "a".repeat(100) }),
  });
  stubFileFetch();

  await t.action(internal.studioActions.persistOutput, { jobId });

  const outputs = await outputsOf(t, userId);
  expect(outputs[0].title).toBe("a".repeat(60));
});

test("zadatak iz lekcije se zeleni sam, sa izlazom kao dokazom i poenima", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const { lessonId, taskId } = await seedLesson(t);
  const jobId = await seedDoneJob(t, userId, { lessonId, taskId });
  stubFileFetch();

  await t.action(internal.studioActions.persistOutput, { jobId });

  const outputs = await outputsOf(t, userId);
  const progress = await t.run((ctx) =>
    ctx.db
      .query("taskProgress")
      .withIndex("by_user_task", (q) => q.eq("userId", userId).eq("taskId", taskId))
      .unique(),
  );
  expect(progress?.completed).toBe(true);
  expect(progress?.evidenceOutputId).toBe(outputs[0]._id);

  // Isti leaderboard dogadjaj kao i ručno štikliranje zadatka u lekciji.
  const events = await t.run((ctx) =>
    ctx.db
      .query("leaderboardEvents")
      .withIndex("by_userId_and_sourceType_and_sourceId", (q) =>
        q.eq("userId", userId).eq("sourceType", "required_task").eq("sourceId", String(taskId)),
      )
      .collect(),
  );
  expect(events).toHaveLength(1);
  expect(events[0].active).toBe(true);
});

test("posao bez lekcije nema labOutputs red, ali ima fajl", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedDoneJob(t, userId);
  stubFileFetch();

  await t.action(internal.studioActions.persistOutput, { jobId });

  expect(await outputsOf(t, userId)).toHaveLength(0);
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.outputStorageId).toBeDefined();
});

test("dva poziva daju jedan storage fajl i jedan labOutputs red", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const { lessonId } = await seedLesson(t);
  const jobId = await seedDoneJob(t, userId, { lessonId });
  const fetchMock = stubFileFetch();

  await t.action(internal.studioActions.persistOutput, { jobId });
  const first = await t.run((ctx) => ctx.db.get(jobId));
  await t.action(internal.studioActions.persistOutput, { jobId });
  const second = await t.run((ctx) => ctx.db.get(jobId));

  // Drugi ulaz (fal ponavlja webhook do 31 put) ne sme ni da skine fajl.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(second?.outputStorageId).toBe(first?.outputStorageId);
  expect(second?.expiresAt).toBe(first?.expiresAt);
  expect(await outputsOf(t, userId)).toHaveLength(1);
});

test("finalizeOutput odbija drugi fajl za isti posao - pozivalac ga briše", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedDoneJob(t, userId);

  const first = await t.run((ctx) => ctx.storage.store(new Blob(["prvi"])));
  const second = await t.run((ctx) => ctx.storage.store(new Blob(["drugi"])));

  const storedFirst = await t.mutation(internal.studio.finalizeOutput, {
    jobId,
    storageId: first,
    byteSize: 4,
  });
  const storedSecond = await t.mutation(internal.studio.finalizeOutput, {
    jobId,
    storageId: second,
    byteSize: 5,
  });

  expect(storedFirst).toBe(true);
  expect(storedSecond).toBe(false);
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.outputStorageId).toBe(first);
});

test("finalizeOutput postavlja rok ulaza na isti rok kao izlaz (nalaz N7)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedDoneJob(t, userId, { kind: "image" });
  const inputStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["ulaz"], { type: "image/png" })),
  );
  const uploadId = await t.run((ctx) =>
    ctx.db.insert("studioUploads", {
      userId,
      storageId: inputStorageId,
      slot: "image",
      bytes: 4,
      createdAt: 1,
      // Ušao je u ovaj posao - `createJob` mu je već sklonio rok.
      expiresAt: undefined,
    }),
  );
  await t.run((ctx) => ctx.db.patch(jobId, { inputs: JSON.stringify({ image: [inputStorageId] }) }));
  const output = await t.run((ctx) => ctx.storage.store(new Blob(["izlaz"], { type: "image/png" })));

  await t.mutation(internal.studio.finalizeOutput, { jobId, storageId: output, byteSize: 5 });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  const upload = await t.run((ctx) => ctx.db.get(uploadId));
  expect(upload?.expiresAt).toBe(job?.expiresAt);
});

test("finalizeOutput NE skraćuje rok deljenog ulaza koji drugi posao već drži dalje (nalaz N7)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  // Video ima kraću retenciju (30 dana) od slike (90) - ovaj posao ne sme da
  // skrati rok koji je neki drugi, još živ posao već postavio dalje.
  const jobId = await seedDoneJob(t, userId, { kind: "video" });
  const inputStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["ulaz"], { type: "image/png" })),
  );
  const farExpiry = Date.now() + 1000 * DAY_MS;
  const uploadId = await t.run((ctx) =>
    ctx.db.insert("studioUploads", {
      userId,
      storageId: inputStorageId,
      slot: "image",
      bytes: 4,
      createdAt: 1,
      expiresAt: farExpiry,
    }),
  );
  await t.run((ctx) => ctx.db.patch(jobId, { inputs: JSON.stringify({ image: [inputStorageId] }) }));
  const output = await t.run((ctx) => ctx.storage.store(new Blob(["izlaz"], { type: "video/mp4" })));

  await t.mutation(internal.studio.finalizeOutput, { jobId, storageId: output, byteSize: 5 });

  const upload = await t.run((ctx) => ctx.db.get(uploadId));
  expect(upload?.expiresAt).toBe(farExpiry);
});

test("neuspelo preuzimanje NE refundira - generacija je uspela i fal je naplaćen", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const { lessonId, taskId } = await seedLesson(t);
  const jobId = await seedDoneJob(t, userId, { lessonId, taskId });
  const before = await balanceOf(t, userId);

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("veza prekinuta");
    }) as unknown as typeof fetch,
  );

  await t.action(internal.studioActions.persistOutput, { jobId });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("done");
  expect(job?.outputStorageId).toBeUndefined();
  expect(job?.expiresAt).toBeUndefined();
  expect(job?.error).toBe("IZLAZ_NIJE_SACUVAN: veza prekinuta");
  expect(await balanceOf(t, userId)).toBe(before);
  expect(await outputsOf(t, userId)).toHaveLength(0);
  const progress = await t.run((ctx) =>
    ctx.db
      .query("taskProgress")
      .withIndex("by_user_task", (q) => q.eq("userId", userId).eq("taskId", taskId))
      .unique(),
  );
  expect(progress).toBeNull();
});

test("ne-2xx odgovor fal-a upisuje status u grešku, bez refunda", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedDoneJob(t, userId);
  const before = await balanceOf(t, userId);

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 404, blob: async () => new Blob([]) })) as unknown as typeof fetch,
  );

  await t.action(internal.studioActions.persistOutput, { jobId });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("done");
  expect(job?.error).toMatch(/404/);
  expect(job?.outputStorageId).toBeUndefined();
  expect(await balanceOf(t, userId)).toBe(before);
});

test("persistOutput ne dira posao koji nije done ni posao bez izlaznog URL-a", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const running = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });
  await t.run((ctx) => ctx.db.patch(running, { status: "running", falRequestId: "req_x" }));
  const noUrl = await seedDoneJob(t, userId, { withoutOutputUrl: true });
  const fetchMock = stubFileFetch();

  await t.action(internal.studioActions.persistOutput, { jobId: running });
  await t.action(internal.studioActions.persistOutput, { jobId: noUrl });

  expect(fetchMock).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.get(running))).toMatchObject({ status: "running" });
  const untouched = await t.run((ctx) => ctx.db.get(noUrl));
  expect(untouched?.status).toBe("done");
  expect(untouched?.error).toBeUndefined();
});
