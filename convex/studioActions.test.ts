/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type TestConvex = ReturnType<typeof convexTest>;

const previousFalKey = process.env.FAL_KEY;
const previousSiteUrl = process.env.CONVEX_SITE_URL;

beforeEach(() => {
  delete process.env.FAL_KEY;
  delete process.env.CONVEX_SITE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousFalKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = previousFalKey;
  if (previousSiteUrl === undefined) delete process.env.CONVEX_SITE_URL;
  else process.env.CONVEX_SITE_URL = previousSiteUrl;
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

test("markJobRunning postavlja status running i falRequestId", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash" });

  await t.mutation(internal.studioActions.markJobRunning, { jobId, falRequestId: "req_1" });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("running");
  expect(job?.falRequestId).toBe("req_1");
});

test("failJob upisuje grešku, refundira tačan iznos, i ostaje idempotentan", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedReservedJob(t, userId, { modelSlug: "flux-2-flash", creditCost: 20 });
  const before = await balanceOf(t, userId);

  await t.mutation(internal.studioActions.failJob, {
    jobId,
    error: "fal request failed (422): bad prompt",
  });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("fal request failed (422): bad prompt");
  expect(await balanceOf(t, userId)).toBe(before + 20);

  // Drugi poziv ne sme da udvostruči refund - refundCredits je idempotentno
  // preko `by_job_type` (A2).
  await t.mutation(internal.studioActions.failJob, { jobId, error: "isti opet" });
  expect(await balanceOf(t, userId)).toBe(before + 20);
});

test("submitJob baca jasnu grešku i refundira kad FAL_KEY fali - ne pada tiho", async () => {
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
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("FAL_KEY nije postavljen");
  expect(await balanceOf(t, userId)).toBe(before + 20);
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
