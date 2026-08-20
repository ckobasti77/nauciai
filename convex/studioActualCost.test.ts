/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { COST_DEVIATION_STREAK } from "./studioActualCostCore";

/**
 * Stvaran trošak posla (W6). Nijedan provajder se ne zove uživo - `fetch` je
 * uvek zamenjen, kao u `providers/google.test.ts` i `providers/byteplus.test.ts`.
 *
 * Putanja glob-a je od korena projekta da bi scheduler umeo da učita i
 * `providers/*` module (isti komentar stoji u oba testa provajdera).
 */
const modules = import.meta.glob("/convex/**/*.ts");

type TestConvexWithSchema = TestConvex<typeof schema>;

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GOOGLE_KEY = "test-google-key";
const BYTEPLUS_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const BYTEPLUS_KEY = "test-byteplus-key";
const FAL_KEY = "test-fal-key";
const FAL_BASE_URL = "https://rest.alpha.fal.ai";

const OPERATION = "models/veo-3.1-fast-generate-preview/operations/op-77";
const VIDEO_URL = `${GOOGLE_BASE_URL}/files/veo-out-77:download?alt=media`;

/** Tarifa iz kataloga 2.2, ista koju nosi seed `nano-banana-pro`-a. */
const TOKEN_RATES = { output: 119.64, thinking: 12 };

const previousEnv = {
  google: process.env.GOOGLE_AI_API_KEY,
  bytePlusBase: process.env.BYTEPLUS_BASE_URL,
  bytePlusKey: process.env.BYTEPLUS_API_KEY,
  fal: process.env.FAL_KEY,
  falRest: process.env.FAL_REST_BASE_URL,
};

beforeEach(() => {
  process.env.GOOGLE_AI_API_KEY = GOOGLE_KEY;
  process.env.BYTEPLUS_BASE_URL = BYTEPLUS_BASE_URL;
  process.env.BYTEPLUS_API_KEY = BYTEPLUS_KEY;
  process.env.FAL_KEY = FAL_KEY;
  process.env.FAL_REST_BASE_URL = FAL_BASE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of [
    ["GOOGLE_AI_API_KEY", previousEnv.google],
    ["BYTEPLUS_BASE_URL", previousEnv.bytePlusBase],
    ["BYTEPLUS_API_KEY", previousEnv.bytePlusKey],
    ["FAL_KEY", previousEnv.fal],
    ["FAL_REST_BASE_URL", previousEnv.falRest],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ── alati ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function binary(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "Content-Type": "video/mp4" },
  });
}

/** Beleži svaki odlazni URL i vraća odgovor koji test propiše. */
function stubFetch(handler: (url: string) => Response | undefined): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      urls.push(url);
      const response = handler(url);
      if (!response) throw new Error(`test: nepredvidjen fetch na ${url}`);

      return response;
    }) as unknown as typeof fetch,
  );

  return urls;
}

/** Zakazane funkcije se u `convex-test` vrte pravim `setTimeout(0)`. */
async function settle(t: TestConvexWithSchema): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function seedUser(t: TestConvexWithSchema) {
  return t.run((ctx) => ctx.db.insert("users", { email: "studio@example.com", name: "Studio" }));
}

/** Najmanji red `models` koji provajderski tok traži: ruta, cena, tarifa tokena. */
async function seedModel(
  t: TestConvexWithSchema,
  opts: { slug: string; provider: "fal" | "google" | "byteplus"; capabilities: Record<string, unknown> },
) {
  return t.run((ctx) =>
    ctx.db.insert("models", {
      slug: opts.slug,
      provider: opts.provider,
      kind: "video" as const,
      family: opts.slug,
      labelSr: opts.slug,
      labelEn: opts.slug,
      taglineSr: "-",
      taglineEn: "-",
      descriptionSr: "-",
      descriptionEn: "-",
      endpoints: JSON.stringify({ text: opts.slug }),
      inputModes: JSON.stringify(["text"]),
      inputSpec: JSON.stringify({ text: {} }),
      paramSpec: JSON.stringify([]),
      priceRule: JSON.stringify({ unit: "second", baseUsd: 0.1, quantityParam: "duration" }),
      capabilities: JSON.stringify(opts.capabilities),
      isEnabled: true,
      sortOrder: 10,
      updatedAt: Date.now(),
    }),
  );
}

async function seedJob(
  t: TestConvexWithSchema,
  userId: Id<"users">,
  opts: {
    modelSlug: string;
    status: "running" | "done";
    provider?: "fal" | "google" | "byteplus";
    providerRequestId?: string;
    falRequestId?: string;
    estimatedCostUsd?: number;
    creditCost?: number;
  },
) {
  return t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: opts.modelSlug,
      kind: "video" as const,
      ...(opts.provider ? { provider: opts.provider } : {}),
      params: JSON.stringify({ prompt: "lisica", duration: 5 }),
      promptHash: "0123456789abcdef",
      status: opts.status,
      creditCost: opts.creditCost ?? 110,
      ...(opts.providerRequestId ? { providerRequestId: opts.providerRequestId } : {}),
      ...(opts.falRequestId ? { falRequestId: opts.falRequestId } : {}),
      ...(opts.estimatedCostUsd !== undefined ? { estimatedCostUsd: opts.estimatedCostUsd } : {}),
      inputMode: "text",
      createdAt: Date.now(),
    }),
  );
}

const jobOf = (t: TestConvexWithSchema, jobId: Id<"generationJobs">) =>
  t.run((ctx) => ctx.db.get(jobId));

const modelCostOf = (t: TestConvexWithSchema, modelSlug: string) =>
  t.run((ctx) =>
    ctx.db
      .query("studioModelCost")
      .withIndex("by_modelSlug", (q) => q.eq("modelSlug", modelSlug))
      .first(),
  );

// ── Google ─────────────────────────────────────────────────────────────────

test("Google: gotova operacija sa tokenima upisuje actualCostUsd i zbir modela", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, {
    slug: "veo-31-fast",
    provider: "google",
    capabilities: { tokenRatesUsdPerMillion: TOKEN_RATES },
  });
  const jobId = await seedJob(t, userId, {
    modelSlug: "veo-31-fast",
    status: "running",
    provider: "google",
    providerRequestId: OPERATION,
    estimatedCostUsd: 0.5,
  });

  stubFetch((url) =>
    url.includes("/operations/")
      ? json({
          done: true,
          response: { generatedVideos: [{ video: { uri: VIDEO_URL } }] },
          usageMetadata: { candidatesTokenCount: 1120, thoughtsTokenCount: 1250 },
        })
      : binary(),
  );

  await t.action(internal.providers.google.pollGoogleVideoJobs, {});
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("done");
  // 1 120 × 119,64/M + 1 250 × 12/M = 0,134 + 0,015.
  expect(job?.actualCostUsd).toBeCloseTo(0.149, 5);

  const cost = await modelCostOf(t, "veo-31-fast");
  expect(cost?.measuredJobs).toBe(1);
  expect(cost?.actualCostUsd).toBeCloseTo(0.149, 5);
  expect(cost?.estimatedCostUsd).toBeCloseTo(0.5, 6);
  expect(cost?.creditCost).toBe(110);
  // Stvarno je JEFTINIJE od procene - niz odstupanja ostaje na nuli.
  expect(cost?.deviationStreak).toBe(0);
});

test("Google: model bez tarife po tokenu ostaje BEZ actualCostUsd - ne pogađa se", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, { slug: "gemini-omni", provider: "google", capabilities: { api: "interactions" } });
  const jobId = await seedJob(t, userId, {
    modelSlug: "gemini-omni",
    status: "running",
    provider: "google",
    providerRequestId: "interactions/op-99",
    estimatedCostUsd: 0.5,
  });

  stubFetch((url) =>
    url.includes("/interactions/")
      ? json({
          done: true,
          response: { generatedVideos: [{ video: { uri: VIDEO_URL } }] },
          usageMetadata: { candidatesTokenCount: 4000, promptTokenCount: 12 },
        })
      : binary(),
  );

  await t.action(internal.providers.google.pollGoogleVideoJobs, {});
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("done");
  expect(job?.actualCostUsd).toBeUndefined();
  expect(await modelCostOf(t, "gemini-omni")).toBeNull();
});

// ── BytePlus ───────────────────────────────────────────────────────────────

test("BytePlus: gotov zadatak sa tokenima upisuje actualCostUsd", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, {
    slug: "seedance-25",
    provider: "byteplus",
    capabilities: { tokenRatesUsdPerMillion: { output: 119.64 } },
  });
  const jobId = await seedJob(t, userId, {
    modelSlug: "seedance-25",
    status: "running",
    providerRequestId: "task-77",
    estimatedCostUsd: 1.2,
  });

  stubFetch((url) =>
    url.includes("/contents/generations/tasks/")
      ? json({
          id: "task-77",
          status: "succeeded",
          content: { video_url: "https://byteplus.example/out.mp4" },
          usage: { completion_tokens: 10_000, total_tokens: 10_030 },
        })
      : binary(),
  );

  await t.action(internal.providers.byteplus.verifyAndApplyTask, { providerRequestId: "task-77" });
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("done");
  // 10 000 × 119,64/M = 1,1964 $.
  expect(job?.actualCostUsd).toBeCloseTo(1.1964, 5);
  expect((await modelCostOf(t, "seedance-25"))?.measuredJobs).toBe(1);
});

// ── fal: noćna rekonsilijacija ─────────────────────────────────────────────

test("fal: noćni prolaz spaja događaje naplate po providerRequestId-ju", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedJob(t, userId, {
    modelSlug: "kling-30",
    status: "done",
    providerRequestId: "fal-req-1",
    estimatedCostUsd: 0.4,
  });

  const urls = stubFetch((url) =>
    url.includes("/v1/models/billing-events")
      ? json({
          events: [
            { request_id: "fal-req-1", total_cost_usd: 0.3 },
            // Isti zahtev ume da ima više redova naplate - sabiraju se pre upisa.
            { request_id: "fal-req-1", total_cost_usd: 0.12 },
          ],
        })
      : undefined,
  );

  const outcome = await t.action(internal.studioActualCost.reconcileFalCosts, { day: "2026-08-19" });

  expect(outcome.matched).toBe(1);
  expect(outcome.unmatched).toBe(0);
  expect(urls[0]).toContain("start_time=2026-08-19T00%3A00%3A00.000Z");
  expect((await jobOf(t, jobId))?.actualCostUsd).toBeCloseTo(0.42, 6);
});

test("fal: nepoznat request_id se preskače bez greške", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedJob(t, userId, {
    modelSlug: "kling-30",
    status: "done",
    providerRequestId: "fal-req-1",
    estimatedCostUsd: 0.4,
  });

  stubFetch((url) =>
    url.includes("/v1/models/billing-events")
      ? json([
          { request_id: "tudji-poziv-van-studija", total_cost_usd: 9.99 },
          { request_id: "fal-req-1", total_cost_usd: 0.42 },
        ])
      : undefined,
  );

  const outcome = await t.action(internal.studioActualCost.reconcileFalCosts, { day: "2026-08-19" });

  expect(outcome.matched).toBe(1);
  expect(outcome.unmatched).toBe(1);
  expect((await jobOf(t, jobId))?.actualCostUsd).toBeCloseTo(0.42, 6);
});

test("refundiran posao ulazi u trošak, ali ne i u naplaćene kredite", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedJob(t, userId, {
    modelSlug: "kling-30",
    status: "done",
    providerRequestId: "fal-req-refund",
    estimatedCostUsd: 0.4,
  });
  // Posao je platio fal, a korisniku su krediti vraćeni (npr. reaper).
  await t.run((ctx) => ctx.db.patch(jobId, { status: "refunded" as const }));

  await t.mutation(internal.studioActualCost.applyFalBillingEvents, {
    events: [{ requestId: "fal-req-refund", usd: 0.42 }],
  });

  const cost = await modelCostOf(t, "kling-30");
  expect(cost?.actualCostUsd).toBeCloseTo(0.42, 6);
  expect(cost?.creditCost).toBe(0);
});

test("fal: drugi prolaz nad istim danom ne udvaja trošak", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedJob(t, userId, {
    modelSlug: "kling-30",
    status: "done",
    providerRequestId: "fal-req-1",
    estimatedCostUsd: 0.4,
  });

  stubFetch((url) =>
    url.includes("/v1/models/billing-events")
      ? json({ data: [{ request_id: "fal-req-1", cost_usd: 0.42 }] })
      : undefined,
  );

  await t.action(internal.studioActualCost.reconcileFalCosts, { day: "2026-08-19" });
  const second = await t.action(internal.studioActualCost.reconcileFalCosts, { day: "2026-08-19" });

  expect(second.matched).toBe(0);
  expect(second.alreadyPriced).toBe(1);
  expect((await jobOf(t, jobId))?.actualCostUsd).toBeCloseTo(0.42, 6);
  expect((await modelCostOf(t, "kling-30"))?.measuredJobs).toBe(1);
});

// ── alarm na odstupanje ────────────────────────────────────────────────────

/**
 * `count` poslova istog modela, svaki naplaćen na procenu od 0,10 $ a stvarno
 * plaćen 0,15 $ - dakle 50% preko praga od 30%.
 */
async function runDeviatingJobs(t: TestConvexWithSchema, userId: Id<"users">, count: number) {
  for (let index = 0; index < count; index += 1) {
    await seedJob(t, userId, {
      modelSlug: "skup-model",
      status: "done",
      providerRequestId: `fal-req-${index}`,
      estimatedCostUsd: 0.1,
    });
    await t.mutation(internal.studioActualCost.applyFalBillingEvents, {
      events: [{ requestId: `fal-req-${index}`, usd: 0.15 }],
    });
  }
}

test("alarm ne puca posle četiri uzastopna odstupanja preko 30%", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await runDeviatingJobs(t, userId, COST_DEVIATION_STREAK - 1);

  const cost = await modelCostOf(t, "skup-model");
  expect(cost?.deviationStreak).toBe(COST_DEVIATION_STREAK - 1);
  expect(cost?.alarmSentAt).toBeUndefined();
});

test("alarm puca na petom uzastopnom odstupanju preko 30%", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await runDeviatingJobs(t, userId, COST_DEVIATION_STREAK);

  const cost = await modelCostOf(t, "skup-model");
  expect(cost?.deviationStreak).toBe(COST_DEVIATION_STREAK);
  expect(cost?.alarmSentAt).toBeDefined();
  // Mejl ide zakazanom akcijom, posle commit-a - upis ne sme da čeka Resend.
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(
    scheduled.some((row) => row.name.includes("sendCostDeviationAlarm")),
  ).toBe(true);
});

test("posao u granicama prekida niz i vraća brojač na nulu", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await runDeviatingJobs(t, userId, COST_DEVIATION_STREAK - 1);

  await seedJob(t, userId, {
    modelSlug: "skup-model",
    status: "done",
    providerRequestId: "fal-req-miran",
    estimatedCostUsd: 0.1,
  });
  await t.mutation(internal.studioActualCost.applyFalBillingEvents, {
    events: [{ requestId: "fal-req-miran", usd: 0.1 }],
  });

  const cost = await modelCostOf(t, "skup-model");
  expect(cost?.deviationStreak).toBe(0);
  expect(cost?.measuredJobs).toBe(COST_DEVIATION_STREAK);
  expect(cost?.alarmSentAt).toBeUndefined();
});
