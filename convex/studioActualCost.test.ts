/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  ACTUAL_COST_REASON,
  COST_DEVIATION_STREAK,
  missingRateReason,
} from "./studioActualCostCore";

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
  // X3: cifra se i dalje ne pogađa, ali prazno polje više nije nemo - model se
  // naplaćuje po sekundi izlaza, a operacija trajanje nije javila.
  expect(job?.actualCostReason).toBe(ACTUAL_COST_REASON.noQuantity);
  const cost = await modelCostOf(t, "gemini-omni");
  expect(cost?.measuredJobs).toBe(0);
  expect(cost?.actualCostUsd).toBe(0);
  expect(JSON.parse(cost?.reasonCounts ?? "{}")).toEqual({ [ACTUAL_COST_REASON.noQuantity]: 1 });
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

test("fal: noćni prolaz poravnava posao po ceni sa izvoda (X2)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedJob(t, userId, {
    modelSlug: "kling-30",
    status: "done",
    providerRequestId: "fal-req-9",
    estimatedCostUsd: 0.4,
    creditCost: 110,
  });
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 1000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: "cs_settle" },
  });
  await t.mutation(internal.credits.spendCredits, { userId, amount: 110, jobId });

  stubFetch((url) =>
    url.includes("/v1/models/billing-events")
      ? json({ events: [{ request_id: "fal-req-9", total_cost_usd: 0.42 }] })
      : undefined,
  );

  await t.action(internal.studioActualCost.reconcileFalCosts, { day: "2026-08-19" });
  // Poravnanje je zakazano, ne ugnježdeno - upis stvarnog troška ne sme da
  // zavisi od naplate.
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.settledCostUsd).toBeCloseTo(0.42, 6);
  expect(job?.settledAt).toBeGreaterThan(0);
  // `ceil(0,42 × 216,25) = 91`, dakle 19 kredita nazad na rezervisanih 110.
  const balance = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );
  expect(balance?.balance).toBe(1000 - 91);
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

// ── X3: nikad tiho prazno polje ────────────────────────────────────────────

const samplesOf = (t: TestConvexWithSchema) =>
  t.run((ctx) => ctx.db.query("studioProviderSamples").collect());

/** Svaki `done` posao mora da izađe sa cenom ILI sa razlogom - nikad bez oba. */
async function assertNoSilentGaps(t: TestConvexWithSchema): Promise<number> {
  const jobs = await t.run((ctx) =>
    ctx.db
      .query("generationJobs")
      .withIndex("by_status_created", (q) => q.eq("status", "done"))
      .collect(),
  );
  const silent = jobs.filter(
    (job) => job.actualCostUsd === undefined && job.actualCostReason === undefined,
  );
  expect(silent.map((job) => job.modelSlug)).toEqual([]);

  return jobs.length;
}

test("Google: sve tri kategorije tokena sa tarifom daju broj", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, {
    slug: "veo-31-fast",
    provider: "google",
    capabilities: { tokenRatesUsdPerMillion: { prompt: 0.5, output: 119.64, thinking: 12 } },
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
          usageMetadata: {
            promptTokenCount: 2000,
            candidatesTokenCount: 1120,
            thoughtsTokenCount: 1250,
          },
        })
      : binary(),
  );

  await t.action(internal.providers.google.pollGoogleVideoJobs, {});
  await settle(t);

  const job = await jobOf(t, jobId);
  // 2 000 × 0,5/M + 1 120 × 119,64/M + 1 250 × 12/M = 0,001 + 0,134 + 0,015.
  expect(job?.actualCostUsd).toBeCloseTo(0.15, 5);
  expect(job?.actualCostReason).toBeUndefined();
  expect(await assertNoSilentGaps(t)).toBe(1);
});

test("Google: bez tarife za prompt izlazi TAJ razlog, ne prazno polje", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  // Tačno ono što `nano-banana-pro` danas nosi: output i thinking, bez prompta.
  await seedModel(t, {
    slug: "nano-banana-pro",
    provider: "google",
    capabilities: { tokenRatesUsdPerMillion: TOKEN_RATES },
  });
  const jobId = await seedJob(t, userId, {
    modelSlug: "nano-banana-pro",
    status: "running",
    provider: "google",
    providerRequestId: OPERATION,
    estimatedCostUsd: 0.149,
  });

  stubFetch((url) =>
    url.includes("/operations/")
      ? json({
          done: true,
          response: { generatedVideos: [{ video: { uri: VIDEO_URL } }] },
          // Google `promptTokenCount` javi uz SVAKI posao - zato je ovaj model
          // do X3 ostajao bez ijednog merenja, i to bez ijedne reči o tome.
          usageMetadata: {
            promptTokenCount: 2000,
            candidatesTokenCount: 1120,
            thoughtsTokenCount: 1250,
          },
        })
      : binary(),
  );

  await t.action(internal.providers.google.pollGoogleVideoJobs, {});
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.actualCostUsd).toBeUndefined();
  expect(job?.actualCostReason).toBe(missingRateReason("prompt"));
  // Odgovor JESTE pročitan - to nije nepoznat oblik i nema šta da se uzorkuje.
  expect(await samplesOf(t)).toEqual([]);
  await assertNoSilentGaps(t);
});

test("BytePlus: posao bez tarife po tokenu dobija cenu iz PRIJAVLJENE količine", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  // Nijedan BytePlus red nema `tokenRatesUsdPerMillion` - Seedance se i ne
  // naplaćuje po tokenima nego po sekundi izlaza (X3, tačka 2).
  await seedModel(t, { slug: "seedance-25", provider: "byteplus", capabilities: {} });
  const jobId = await seedJob(t, userId, {
    modelSlug: "seedance-25",
    status: "running",
    provider: "byteplus",
    providerRequestId: "task-77",
    estimatedCostUsd: 0.5,
  });

  stubFetch((url) =>
    url.includes("/contents/generations/tasks/")
      ? json({
          id: "task-77",
          status: "succeeded",
          // Naručeno je 5 s (`seedJob` params), a renderovano 7 s.
          content: { video_url: "https://byteplus.example/out.mp4", duration: 7 },
        })
      : binary(),
  );

  await t.action(internal.providers.byteplus.verifyAndApplyTask, { providerRequestId: "task-77" });
  await settle(t);

  const job = await jobOf(t, jobId);
  // `baseUsd 0.1` × 7 s = 0,70 $, kroz isti `computeCostUsd` kao rezervacija.
  expect(job?.actualCostUsd).toBeCloseTo(0.7, 6);
  expect(job?.actualCostReason).toBeUndefined();
  expect((await modelCostOf(t, "seedance-25"))?.measuredJobs).toBe(1);
  await assertNoSilentGaps(t);
});

test("neprepoznat oblik odgovora upisuje uzorak i podiže razlog", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, { slug: "seedance-25", provider: "byteplus", capabilities: {} });
  const jobId = await seedJob(t, userId, {
    modelSlug: "seedance-25",
    status: "running",
    provider: "byteplus",
    providerRequestId: "task-77",
    estimatedCostUsd: 0.5,
  });

  stubFetch((url) =>
    url.includes("/contents/generations/tasks/")
      ? json({
          id: "task-77",
          status: "succeeded",
          // Ni potrošnje ni trajanja - iz ovog odgovora ne umemo ništa.
          content: { video_url: "https://byteplus.example/out.mp4" },
        })
      : binary(),
  );

  await t.action(internal.providers.byteplus.verifyAndApplyTask, { providerRequestId: "task-77" });
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.actualCostUsd).toBeUndefined();
  expect(job?.actualCostReason).toBe(ACTUAL_COST_REASON.unknownShape);

  const samples = await samplesOf(t);
  expect(samples).toHaveLength(1);
  expect(samples[0].provider).toBe("byteplus");
  expect(samples[0].modelSlug).toBe("seedance-25");
  // Sirov JSON, ne prepričan: Jovan mora da vidi imena polja kakva jesu.
  expect(JSON.parse(samples[0].sample)).toMatchObject({ id: "task-77", status: "succeeded" });
  await assertNoSilentGaps(t);
});

test("uzorak se PREPISUJE, ne gomila - jedan red po provajderu i modelu", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, { slug: "seedance-25", provider: "byteplus", capabilities: {} });
  for (const taskId of ["task-a", "task-b"]) {
    await seedJob(t, userId, {
      modelSlug: "seedance-25",
      status: "running",
      provider: "byteplus",
      providerRequestId: taskId,
      estimatedCostUsd: 0.5,
    });
  }

  stubFetch((url) => {
    const match = /tasks\/(task-[ab])/.exec(url);

    return match
      ? json({ id: match[1], status: "succeeded", content: { video_url: "https://x/y.mp4" } })
      : binary();
  });

  for (const taskId of ["task-a", "task-b"]) {
    await t.action(internal.providers.byteplus.verifyAndApplyTask, { providerRequestId: taskId });
  }
  await settle(t);

  const samples = await samplesOf(t);
  expect(samples).toHaveLength(1);
  expect(JSON.parse(samples[0].sample).id).toBe("task-b");
  // Dva posla, oba na istom razlogu - brojač je taj koji broji, ne tabela uzoraka.
  const cost = await modelCostOf(t, "seedance-25");
  expect(JSON.parse(cost?.reasonCounts ?? "{}")).toEqual({ [ACTUAL_COST_REASON.unknownShape]: 2 });
  expect(await assertNoSilentGaps(t)).toBe(2);
});

test("fal: gotov posao čeka izvod SA razlogom, koji nestaje kad cena stigne", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedJob(t, userId, {
    modelSlug: "kling-30",
    status: "running",
    provider: "fal",
    falRequestId: "fal-req-1",
    providerRequestId: "fal-req-1",
    estimatedCostUsd: 0.4,
  });

  await t.mutation(internal.falWebhook.applyWebhookResult, {
    falRequestId: "fal-req-1",
    status: "OK",
    outputUrl: "https://fal.example/out.mp4",
  });

  expect((await jobOf(t, jobId))?.actualCostReason).toBe(ACTUAL_COST_REASON.falPending);
  expect(JSON.parse((await modelCostOf(t, "kling-30"))?.reasonCounts ?? "{}")).toEqual({
    [ACTUAL_COST_REASON.falPending]: 1,
  });
  await assertNoSilentGaps(t);

  await t.mutation(internal.studioActualCost.applyFalBillingEvents, {
    events: [{ requestId: "fal-req-1", usd: 0.42 }],
  });

  const job = await jobOf(t, jobId);
  expect(job?.actualCostUsd).toBeCloseTo(0.42, 6);
  expect(job?.actualCostReason).toBeUndefined();
  // Razlog nestaje i sa brojača, inače bi admin ekran zauvek pokazivao dug koji
  // je odavno namiren.
  expect(JSON.parse((await modelCostOf(t, "kling-30"))?.reasonCounts ?? "{}")).toEqual({});
});

test("fal: neprepoznat izvod pamti uzorak i prepisuje razlog poslova tog dana", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const day = "2026-08-19";
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "kling-30",
      kind: "video" as const,
      provider: "fal" as const,
      params: JSON.stringify({ prompt: "lisica", duration: 5 }),
      promptHash: "0123456789abcdef",
      status: "done" as const,
      creditCost: 110,
      providerRequestId: "fal-req-1",
      estimatedCostUsd: 0.4,
      actualCostReason: ACTUAL_COST_REASON.falPending,
      inputMode: "text",
      createdAt: Date.parse(`${day}T09:00:00.000Z`),
    }),
  );

  stubFetch((url) =>
    url.includes("/v1/models/billing-events")
      ? json({ events: [{ id: "evt_1", charge: { micro_usd: 420_000 } }] })
      : undefined,
  );

  const outcome = await t.action(internal.studioActualCost.reconcileFalCosts, { day });

  expect(outcome.matched).toBe(0);
  const samples = await samplesOf(t);
  expect(samples).toHaveLength(1);
  expect(samples[0].provider).toBe("fal");
  expect(JSON.parse(samples[0].sample)).toMatchObject({ id: "evt_1" });
  // "Nije stiglo" je bila neistina: stiglo je, samo ga ne razumemo.
  expect((await jobOf(t, jobId))?.actualCostReason).toBe(ACTUAL_COST_REASON.unknownShape);
  await assertNoSilentGaps(t);
});

test("alarm poredi PORAVNAT trošak sa PRVOBITNOM procenom (X3, tačka 5)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const jobId = await seedJob(t, userId, {
    modelSlug: "dubbing",
    status: "done",
    provider: "fal",
    providerRequestId: "fal-req-dub",
    // Procena je izvedena iz zaglavlja koje je korisnik okačio (nalaz N2).
    estimatedCostUsd: 0.06,
  });
  // X2 je posao već poravnao po STVARNOM trajanju: 72 $, a ne 0,06 $.
  await t.run((ctx) => ctx.db.patch(jobId, { settledCostUsd: 72, settledAt: Date.now() }));

  // Sam fal događaj je ISPOD praga prema proceni - da se poredio on, alarm ne bi
  // imao šta da vidi, a upravo to je bila rupa: N2 bez detektora.
  await t.mutation(internal.studioActualCost.applyFalBillingEvents, {
    events: [{ requestId: "fal-req-dub", usd: 0.05 }],
  });

  const cost = await modelCostOf(t, "dubbing");
  expect(cost?.deviationStreak).toBe(1);
  // Zbir ostaje na onome što je provajder naplatio - marža se računa iz toga.
  expect(cost?.actualCostUsd).toBeCloseTo(0.05, 6);
});
