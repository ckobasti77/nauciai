/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  fetchGoogleOperation,
  googleHttpErrorMessage,
  normalizeOperationPath,
  parseOperation,
  QUOTA_ERROR_PREFIX,
  readGoogleConfig,
} from "../../lib/google-video";
import {
  bareInteractionId,
  buildOmniRequest,
  buildVeoRequest,
  EMPTY_GOOGLE_INPUTS,
  googleDownloadHeaders,
  OMNI_AUDIO_REFERENCE_ERROR,
  OMNI_UPLOADED_VIDEO_ERROR,
  omniInputRestriction,
  toBase64,
} from "./googleCore";
import { GEMINI_OMNI, GOOGLE_VIDEO_MODELS, VEO_31, VEO_31_FAST, VEO_31_LITE } from "./googleModels";
import { computeCredits, isCombinationPriceable } from "../studioPricing";
import { SEEDANCE_20 } from "./bytePlusModels";
import type { StudioModelSeed } from "./modelSeed";

/**
 * Putanja je od korena projekta, ne relativna - videti isti komentar u
 * `byteplus.test.ts`: `import.meta.glob("../**")` iz poddirektorijuma ne
 * zahvata sam taj poddirektorijum, pa scheduler ne bi umeo da učita
 * `providers/google`.
 */
const modules = import.meta.glob("/convex/**/*.ts");

type TestConvexWithSchema = TestConvex<typeof schema>;

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const API_KEY = "test-google-key";
const OPERATION = "models/veo-3.1-fast-generate-preview/operations/op-4f2a9c";
const VIDEO_URL = `${BASE_URL}/files/veo-out-4f2a9c:download?alt=media`;
const JOB_COST = 110;
const GRANTED = 1000;

const previousApiKey = process.env.GOOGLE_AI_API_KEY;

beforeEach(() => {
  process.env.GOOGLE_AI_API_KEY = API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousApiKey === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = previousApiKey;
});

// ── alati ──────────────────────────────────────────────────────────────────

type FetchCall = {
  url: string;
  method: string;
  key: string | null;
  body: Record<string, unknown> | undefined;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Izlazni fajl koji `persistOutput` skida pošto posao dodje u `done`. */
function binary(): Response {
  return new Response(new Uint8Array([0x00, 0x01, 0x02]), {
    status: 200,
    headers: { "Content-Type": "video/mp4" },
  });
}

/**
 * Jedini `fetch` u ovim testovima. Google se NIKAD ne zove uživo; sve što kod
 * pošalje mreži zabeleži se ovde i nad tim se tvrdi.
 */
function stubFetch(handler: (url: string, init: RequestInit) => Response | undefined): FetchCall[] {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: String(init.method ?? "GET"),
      key: headers["x-goog-api-key"] ?? null,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const response = handler(url, init);
    if (!response) throw new Error(`test: nepredvidjen fetch na ${url}`);

    return response;
  });
  vi.stubGlobal("fetch", mock as unknown as typeof fetch);

  return calls;
}

/** Operacija se ispituje `GET`-om; sve ostalo je skidanje izlaznog fajla. */
function operationEndpoint(operation: unknown): (url: string) => Response {
  return (url) => (url.includes("/operations/") || url.includes("/interactions/") ? json(operation) : binary());
}

const googleCalls = (calls: FetchCall[]) => calls.filter((call) => call.url.startsWith(BASE_URL));
const pollCalls = (calls: FetchCall[]) =>
  calls.filter((call) => call.method === "GET" && call.url.includes("/operations/"));

/**
 * Zakazane funkcije se u `convex-test` pokreću pravim `setTimeout(0)`, pa se
 * mora pustiti makrotask pre čekanja.
 */
async function settle(t: TestConvexWithSchema): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function seedModel(t: TestConvexWithSchema, seed: StudioModelSeed) {
  return t.run((ctx) =>
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
      updatedAt: Date.now(),
    }),
  );
}

async function seedUser(t: TestConvexWithSchema) {
  return t.run((ctx) => ctx.db.insert("users", { email: "studio@example.com", name: "Studio" }));
}

/** Ono što `createJob` uradi atomski: posao u `reserved` i kredit stvarno skinut. */
async function seedReservedJob(
  t: TestConvexWithSchema,
  userId: Id<"users">,
  opts: {
    seed: StudioModelSeed;
    params?: Record<string, unknown>;
    inputMode?: string;
    inputs?: Record<string, string[]>;
  },
) {
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: opts.seed.slug,
      kind: opts.seed.kind,
      provider: opts.seed.provider,
      params: JSON.stringify(
        opts.params ?? { prompt: "lisica trči kroz sneg", resolution: "720p", audio: true, duration: 5 },
      ),
      promptHash: "0123456789abcdef",
      status: "reserved" as const,
      creditCost: JOB_COST,
      inputMode: opts.inputMode ?? "text",
      ...(opts.inputs ? { inputs: JSON.stringify(opts.inputs) } : {}),
      createdAt: Date.now(),
    }),
  );
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: GRANTED,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${jobId}` },
  });
  await t.mutation(internal.credits.spendCredits, { userId, amount: JOB_COST, jobId });

  return jobId;
}

/** Posao koji je već predat Google-u i čeka da poller vidi gotovu operaciju. */
async function seedRunningJob(
  t: TestConvexWithSchema,
  opts: { seed?: StudioModelSeed; providerRequestId?: string; ageMinutes?: number } = {},
) {
  const seed = opts.seed ?? VEO_31_FAST;
  const providerRequestId = opts.providerRequestId ?? OPERATION;
  const userId = await seedUser(t);
  await seedModel(t, seed);
  const jobId = await seedReservedJob(t, userId, { seed });
  await t.run((ctx) =>
    ctx.db.patch(jobId, {
      status: "running",
      falRequestId: providerRequestId,
      providerRequestId,
    }),
  );

  return { userId, jobId, providerRequestId };
}

const jobOf = (t: TestConvexWithSchema, jobId: Id<"generationJobs">) =>
  t.run((ctx) => ctx.db.get(jobId));

async function balanceOf(t: TestConvexWithSchema, userId: Id<"users">) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );

  return row?.balance ?? 0;
}

const refundsFor = (t: TestConvexWithSchema, jobId: Id<"generationJobs">) =>
  t.run((ctx) =>
    ctx.db
      .query("creditTransactions")
      .withIndex("by_job_type", (q) => q.eq("jobId", jobId).eq("type", "refund"))
      .collect(),
  );

const submit = (t: TestConvexWithSchema, jobId: Id<"generationJobs">) =>
  t.action(internal.studioActions.submitJob, { jobId });

const poll = (t: TestConvexWithSchema, args: { batchLimit?: number; scanLimit?: number } = {}) =>
  t.action(internal.providers.google.pollGoogleVideoJobs, args);

const file = (base64 = "AAEC") => ({ mimeType: "image/png", base64 });

// ── 1. Čiste funkcije: telo zahteva ────────────────────────────────────────

test("buildVeoRequest: parametri koji ulaze u cenu ulaze i u zahtev", () => {
  const request = buildVeoRequest(
    { prompt: "lisica u snegu", resolution: "4K", audio: false, duration: 8 },
    EMPTY_GOOGLE_INPUTS,
    "text",
  );

  expect(request).toEqual({
    instances: [{ prompt: "lisica u snegu" }],
    // Zvuk je naplaćen kroz `lookup` (`4K|off` je jeftinije od `4K|on`), pa mora
    // izričito da se traži - podrazumevana vrednost kod Google-a nije garancija.
    parameters: { resolution: "4k", durationSeconds: 8, generateAudio: false },
  });
});

test("buildVeoRequest: first_last šalje OBA kadra, a bez drugog traži završni kadar", () => {
  const request = buildVeoRequest(
    { prompt: "prelaz", resolution: "720p", audio: true, duration: 4 },
    { ...EMPTY_GOOGLE_INPUTS, image: [file("prvi"), file("drugi")] },
    "first_last",
  );

  const instances = (request.instances as Array<Record<string, unknown>>)[0];
  const parameters = request.parameters as Record<string, unknown>;
  expect(instances.image).toEqual({ bytesBase64Encoded: "prvi", mimeType: "image/png" });
  expect(parameters.lastFrame).toEqual({ bytesBase64Encoded: "drugi", mimeType: "image/png" });

  expect(() =>
    buildVeoRequest({ prompt: "prelaz" }, { ...EMPTY_GOOGLE_INPUTS, image: [file()] }, "first_last"),
  ).toThrow(/Dodaj završni kadar/);
});

test("buildVeoRequest: reference šalje sve slike, video režim traži klip", () => {
  const request = buildVeoRequest(
    { prompt: "referenca" },
    { ...EMPTY_GOOGLE_INPUTS, image: [file("a"), file("b"), file("c")] },
    "reference",
  );
  const references = (request.parameters as Record<string, unknown>).referenceImages;
  expect(Array.isArray(references) && references.length).toBe(3);

  expect(() => buildVeoRequest({ prompt: "duže" }, EMPTY_GOOGLE_INPUTS, "video")).toThrow(
    /NEPOTPUN_ULAZ/,
  );
});

test("buildOmniRequest: fiksna rezolucija, odnos stranica i trajanje", () => {
  const request = buildOmniRequest(
    "gemini-omni-flash-preview",
    { prompt: "reklama", aspect_ratio: "9:16", duration: 6 },
    { ...EMPTY_GOOGLE_INPUTS, image: [file("slika")] },
    "image",
  );

  expect(request.model).toBe("gemini-omni-flash-preview");
  // Rezolucija je fiksna 720p (katalog 3.8) - nije kontrola, ali jeste podatak
  // koji ide u zahtev.
  expect(request.config).toEqual({ resolution: "720p", aspect_ratio: "9:16", duration_seconds: 6 });
  expect(request.inputs).toEqual([
    { text: "reklama" },
    { inline_data: { mime_type: "image/png", data: "slika" } },
  ]);
});

// ── 2. Tri ograničenja Omnija su poruka, ne tiha greška ────────────────────

test("omniInputRestriction: okačen video u režimu izmene i audio referenca imaju svoju poruku", () => {
  expect(
    omniInputRestriction("video", {
      ...EMPTY_GOOGLE_INPUTS,
      video: [{ mimeType: "video/mp4", base64: "x" }],
    }),
  ).toBe(OMNI_UPLOADED_VIDEO_ERROR);

  expect(
    omniInputRestriction("text", {
      ...EMPTY_GOOGLE_INPUTS,
      audio: [{ mimeType: "audio/mpeg", base64: "x" }],
    }),
  ).toBe(OMNI_AUDIO_REFERENCE_ERROR);

  expect(omniInputRestriction("text", EMPTY_GOOGLE_INPUTS)).toBeNull();
  expect(omniInputRestriction("video", EMPTY_GOOGLE_INPUTS)).toBeNull();
});

test("gemini-omni ne nudi audio slot ni produžavanje, i nosi tekst ograničenja za UI", () => {
  // Upload audio referenci je dokumentovan ali NE RADI; slot koji ne radi je
  // gora poruka od poruke.
  for (const slots of Object.values(GEMINI_OMNI.inputSpec)) {
    expect(Object.keys(slots)).not.toContain("audio");
  }
  expect(GEMINI_OMNI.inputModes).not.toContain("first_last");
  expect(GEMINI_OMNI.capabilities.extend).toBe(false);
  expect((GEMINI_OMNI.capabilities.restrictionsSr as string[]).length).toBeGreaterThanOrEqual(3);
  expect((GEMINI_OMNI.capabilities.restrictionsEn as string[]).length).toBe(
    (GEMINI_OMNI.capabilities.restrictionsSr as string[]).length,
  );
});

test("Veo Lite nema reference ni produžavanje, Fast ima oba - to je razlika izmedju redova", () => {
  expect(VEO_31_LITE.inputModes).toEqual(["text", "image", "first_last"]);
  expect(VEO_31_LITE.endpoints.reference).toBeUndefined();
  expect(VEO_31_LITE.endpoints.video).toBeUndefined();
  expect(VEO_31_LITE.provider).toBe("fal");

  expect(VEO_31_FAST.inputModes).toContain("reference");
  expect(VEO_31_FAST.inputModes).toContain("video");
  // Tarifa je ta koja menja provajdera - jedini takav model u katalogu.
  expect(VEO_31_FAST.provider).toBe("google");
});

// ── 3. Čitanje operacije ───────────────────────────────────────────────────

test("parseOperation: gotova operacija daje URL izlaza, nedovršena ne daje ništa", () => {
  const done = parseOperation(OPERATION, {
    name: OPERATION,
    done: true,
    response: { generateVideoResponse: { generatedSamples: [{ video: { uri: VIDEO_URL } }] } },
  });
  expect(done).toMatchObject({ done: true, videoUrl: VIDEO_URL, error: null });

  const interaction = parseOperation("interactions/abc", {
    id: "abc",
    state: "COMPLETED",
    outputs: [{ video: { uri: VIDEO_URL } }],
  });
  expect(interaction).toMatchObject({ done: true, videoUrl: VIDEO_URL });

  expect(parseOperation(OPERATION, { name: OPERATION, done: false })).toMatchObject({
    done: false,
    videoUrl: null,
  });
  expect(parseOperation(OPERATION, "nije objekat")).toMatchObject({ done: false });
});

test("parseOperation: greška je gotova operacija, a kvotna greška se prepoznaje kao takva", () => {
  const failed = parseOperation(OPERATION, {
    done: true,
    error: { code: 3, status: "INVALID_ARGUMENT", message: "prompt je odbijen" },
  });
  expect(failed.done).toBe(true);
  expect(failed.error).toContain("INVALID_ARGUMENT");
  expect(failed.quota).toBe(false);

  const quota = parseOperation(OPERATION, {
    error: { code: 8, status: "RESOURCE_EXHAUSTED", message: "quota exceeded" },
  });
  expect(quota.done).toBe(true);
  expect(quota.quota).toBe(true);
});

test("normalizeOperationPath, googleHttpErrorMessage i readGoogleConfig", () => {
  expect(normalizeOperationPath(`/${OPERATION}`, "operations")).toBe(OPERATION);
  expect(normalizeOperationPath("intr_123", "interactions")).toBe("interactions/intr_123");

  expect(googleHttpErrorMessage(429, "{}")).toContain(QUOTA_ERROR_PREFIX);
  expect(googleHttpErrorMessage(500, "server je pao")).not.toContain(QUOTA_ERROR_PREFIX);

  expect(readGoogleConfig({ GOOGLE_AI_API_KEY: " abc " })).toEqual({
    baseUrl: BASE_URL,
    apiKey: "abc",
  });
  expect(() => readGoogleConfig({})).toThrow(/GOOGLE_AI_API_KEY/);
});

test("fetchGoogleOperation odbija putanju koja nije ime Google resursa, pre mreže", async () => {
  const calls = stubFetch(() => json({}));

  await expect(
    fetchGoogleOperation({
      config: { baseUrl: BASE_URL, apiKey: API_KEY },
      operationPath: "../models?key=tudji",
    }),
  ).rejects.toThrow(/NEISPRAVNA_OPERACIJA/);
  expect(calls).toHaveLength(0);
});

test("bareInteractionId skida interactions/ prefiks, a go ID ostavlja netaknut", () => {
  expect(bareInteractionId("interactions/intr_abc")).toBe("intr_abc");
  expect(bareInteractionId("intr_abc")).toBe("intr_abc");
});

test("googleDownloadHeaders daje ključ samo Google hostu, i toBase64 radi na praznom nizu", () => {
  expect(googleDownloadHeaders(VIDEO_URL, API_KEY)).toEqual({ "x-goog-api-key": API_KEY });
  expect(googleDownloadHeaders("https://fal.media/izlaz.mp4", API_KEY)).toEqual({});
  expect(googleDownloadHeaders("nije url", API_KEY)).toEqual({});
  expect(googleDownloadHeaders(VIDEO_URL, undefined)).toEqual({});

  expect(toBase64(new Uint8Array([0, 1, 2]))).toBe(btoa(" "));
  expect(toBase64(new Uint8Array([]))).toBe("");
});

// ── 4. Predaja posla ───────────────────────────────────────────────────────

test("Veo Fast ide direktno na Google i završi u running sa imenom operacije", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, VEO_31_FAST);
  const jobId = await seedReservedJob(t, userId, { seed: VEO_31_FAST });
  const calls = stubFetch(() => json({ name: OPERATION }));

  await submit(t, jobId);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("running");
  // Poller posle ne mora da zna koji je model posao napravio: `providerRequestId`
  // JESTE putanja operacije.
  expect(job?.providerRequestId).toBe(OPERATION);

  const [call] = googleCalls(calls);
  expect(call.method).toBe("POST");
  expect(call.url).toBe(`${BASE_URL}/models/veo-3.1-fast-generate-preview:predictLongRunning`);
  // Ključ ide u zaglavlje, nikad u URL.
  expect(call.key).toBe(API_KEY);
  expect(call.url).not.toContain(API_KEY);
  expect(call.body).toEqual({
    instances: [{ prompt: "lisica trči kroz sneg" }],
    parameters: { resolution: "720p", durationSeconds: 5, generateAudio: true },
  });
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

test("Gemini Omni ide na Interactions API, ne na generateContent", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, GEMINI_OMNI);
  const jobId = await seedReservedJob(t, userId, {
    seed: GEMINI_OMNI,
    params: { prompt: "reklama za kafu", aspect_ratio: "9:16", duration: 6 },
  });
  const calls = stubFetch(() => json({ id: "intr_9f21" }));

  await submit(t, jobId);

  const [call] = googleCalls(calls);
  expect(call.url).toBe(`${BASE_URL}/interactions`);
  expect(call.url).not.toContain("generateContent");
  // Go `id` iz Interactions API-ja dobija kolekciju kojoj pripada, da bi poller
  // imao šta da pita.
  expect((await jobOf(t, jobId))?.providerRequestId).toBe("interactions/intr_9f21");
});

test("Omni video rezim salje previous_interaction_id BEZ interactions/ prefiksa (nalaz S3, W7)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, GEMINI_OMNI);
  // `studio.ts` upisuje SIROV `providerRequestId` izvorne generacije u
  // `params.previous_interaction_id` - oblik tog polja (`interactions/<id>`)
  // je tumačenje Google-a, pa se skida tek ovde (`bareInteractionId`).
  const jobId = await seedReservedJob(t, userId, {
    seed: GEMINI_OMNI,
    inputMode: "video",
    params: { prompt: "nastavi", aspect_ratio: "16:9", duration: 5, previous_interaction_id: "interactions/intr_prethodni" },
  });
  const calls = stubFetch(() => json({ id: "intr_novi" }));

  await submit(t, jobId);

  const [call] = googleCalls(calls);
  expect(call.url).toBe(`${BASE_URL}/interactions`);
  expect(call.body?.previous_interaction_id).toBe("intr_prethodni");
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

test("Omni izmena OKAČENOG videa se odbija jasnom porukom, bez ijednog poziva", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, GEMINI_OMNI);
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2])])));
  const jobId = await seedReservedJob(t, userId, {
    seed: GEMINI_OMNI,
    inputMode: "video",
    inputs: { video: [storageId] },
  });
  const before = await balanceOf(t, userId);
  const calls = stubFetch(() => json({ id: "intr_ne_sme" }));

  await submit(t, jobId);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe(OMNI_UPLOADED_VIDEO_ERROR);
  expect(job?.error).toMatch(/EEA/);
  // Ograničenje se proverava PRE mreže: nema poziva, nema naplate kod Google-a.
  expect(googleCalls(calls)).toHaveLength(0);
  expect(await refundsFor(t, jobId)).toHaveLength(1);
  expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
});

test("kvotna greška pri predaji refundira i kaže zašto, umesto da posao visi", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, GEMINI_OMNI);
  const jobId = await seedReservedJob(t, userId, { seed: GEMINI_OMNI });
  const before = await balanceOf(t, userId);
  stubFetch(() => json({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }, 429));

  await submit(t, jobId);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toContain(QUOTA_ERROR_PREFIX);
  expect(await refundsFor(t, jobId)).toHaveLength(1);
  expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
});

test("bez GOOGLE_AI_API_KEY posao se refundira pre ijednog poziva", async () => {
  const t = convexTest(schema, modules);
  delete process.env.GOOGLE_AI_API_KEY;
  const userId = await seedUser(t);
  await seedModel(t, VEO_31_FAST);
  const jobId = await seedReservedJob(t, userId, { seed: VEO_31_FAST });
  const calls = stubFetch(() => json({ name: OPERATION }));

  await submit(t, jobId);

  expect((await jobOf(t, jobId))?.error).toContain("GOOGLE_AI_API_KEY");
  expect(calls).toHaveLength(0);
  expect(await refundsFor(t, jobId)).toHaveLength(1);
});

test("režim koji model nema se odbija, bez poziva", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, GEMINI_OMNI);
  const jobId = await seedReservedJob(t, userId, { seed: GEMINI_OMNI, inputMode: "first_last" });
  const calls = stubFetch(() => json({ id: "intr_ne_sme" }));

  await submit(t, jobId);

  expect((await jobOf(t, jobId))?.error).toBe("NEDOZVOLJEN_REZIM:first_last");
  expect(googleCalls(calls)).toHaveLength(0);
  expect(await refundsFor(t, jobId)).toHaveLength(1);
});

test("posao koji nije reserved se ne predaje drugi put", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);
  const calls = stubFetch(() => json({ name: OPERATION }));

  await submit(t, jobId);

  expect(googleCalls(calls)).toHaveLength(0);
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

// ── 5. Poller ──────────────────────────────────────────────────────────────

test("poller prebaci gotov posao u done, sačuva izlaz i skine ga sa ključem", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);
  const calls = stubFetch(
    operationEndpoint({
      name: OPERATION,
      done: true,
      response: { generateVideoResponse: { generatedSamples: [{ video: { uri: VIDEO_URL } }] } },
    }),
  );

  const result = await poll(t);
  await settle(t);

  expect(result).toEqual({ polled: 1, finished: 1, failed: 0 });
  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("done");
  expect(job?.falOutputUrl).toBe(VIDEO_URL);
  expect(job?.outputStorageId).toBeTruthy();
  expect(await refundsFor(t, jobId)).toHaveLength(0);

  // Izlaz stoji na Google hostu i traži ključ; bez zaglavlja bi posao ostao
  // `done` bez fajla, a plaćen je.
  const download = calls.find((call) => call.url === VIDEO_URL);
  expect(download?.key).toBe(API_KEY);
});

test("poller refundira neuspelu operaciju TAČNO JEDNOM, i drugi prolaz je ne dira", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  stubFetch(
    operationEndpoint({
      name: OPERATION,
      done: true,
      error: { code: 3, status: "INVALID_ARGUMENT", message: "prompt je odbijen" },
    }),
  );

  const first = await poll(t);
  const second = await poll(t);
  await settle(t);

  expect(first).toEqual({ polled: 1, finished: 0, failed: 1 });
  // Posao više nije `running`, pa ga drugi prolaz uopšte ne pokupi.
  expect(second).toEqual({ polled: 0, finished: 0, failed: 0 });
  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toContain("INVALID_ARGUMENT");
  expect(await refundsFor(t, jobId)).toHaveLength(1);
  expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
});

test("kvotna greška u operaciji refundira sa porukom o kvoti", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  stubFetch(
    operationEndpoint({
      done: true,
      error: { code: 8, status: "RESOURCE_EXHAUSTED", message: "quota exceeded for preview model" },
    }),
  );

  await poll(t);
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toContain("RESOURCE_EXHAUSTED");
  expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
});

test("posao koji nije running se ne ispituje - ni reserved, ni done", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, VEO_31_FAST);
  const reserved = await seedReservedJob(t, userId, { seed: VEO_31_FAST });
  const done = await seedReservedJob(t, userId, { seed: VEO_31_FAST });
  await t.run((ctx) =>
    ctx.db.patch(done, { status: "done", providerRequestId: OPERATION, falOutputUrl: VIDEO_URL }),
  );
  const calls = stubFetch(operationEndpoint({ done: true }));

  const result = await poll(t);
  await settle(t);

  expect(result).toEqual({ polled: 0, finished: 0, failed: 0 });
  expect(googleCalls(calls)).toHaveLength(0);
  expect((await jobOf(t, reserved))?.status).toBe("reserved");
  expect((await jobOf(t, done))?.status).toBe("done");
});

test("poller ne dira poslove drugih provajdera", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_20);
  const jobId = await seedReservedJob(t, userId, { seed: SEEDANCE_20 });
  await t.run((ctx) =>
    ctx.db.patch(jobId, { status: "running", providerRequestId: "cgt-byteplus-1" }),
  );
  const calls = stubFetch(operationEndpoint({ done: true }));

  const result = await poll(t);

  expect(result.polled).toBe(0);
  expect(calls).toHaveLength(0);
  expect((await jobOf(t, jobId))?.status).toBe("running");
});

test("poller ne gubi google posao iza zaostatka STARIJIH poslova drugih provajdera (nalaz W7-6)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_20);
  await seedModel(t, VEO_31_FAST);

  // Tri STARIJA byteplus posla. Stari put je skenirao `by_status_created`
  // (najstariji prvo) pa bi mali `scanLimit` gurnuo google posao van prozora -
  // reaper bi ga posle 30 min refundirao iako je uspeo i naplaćen.
  for (const [suffix, createdAt] of [
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ] as const) {
    const jobId = await seedReservedJob(t, userId, { seed: SEEDANCE_20 });
    await t.run((ctx) =>
      ctx.db.patch(jobId, { status: "running", providerRequestId: `cgt-byteplus-${suffix}`, createdAt }),
    );
  }
  const googleJobId = await seedReservedJob(t, userId, { seed: VEO_31_FAST });
  await t.run((ctx) =>
    ctx.db.patch(googleJobId, { status: "running", providerRequestId: OPERATION, createdAt: 1000 }),
  );

  stubFetch(
    operationEndpoint({
      name: OPERATION,
      done: true,
      response: { generatedVideos: [{ video: { uri: VIDEO_URL } }] },
    }),
  );

  // `by_provider_status` skenira SAMO google poslove, pa čak i `scanLimit: 3`
  // (manje od tri byteplus posla) i dalje nalazi google posao.
  const result = await poll(t, { scanLimit: 3 });
  await settle(t);

  expect(result).toEqual({ polled: 1, finished: 1, failed: 0 });
  expect((await jobOf(t, googleJobId))?.status).toBe("done");
});

test("batch limit se poštuje - ostatak sačeka sledeći prolaz", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, VEO_31_FAST);
  for (const suffix of ["a", "b", "c"]) {
    const jobId = await seedReservedJob(t, userId, { seed: VEO_31_FAST });
    await t.run((ctx) =>
      ctx.db.patch(jobId, { status: "running", providerRequestId: `${OPERATION}-${suffix}` }),
    );
  }
  const calls = stubFetch(operationEndpoint({ done: false }));

  const result = await poll(t, { batchLimit: 2 });

  expect(result.polled).toBe(2);
  expect(pollCalls(calls)).toHaveLength(2);
});

test("mrežna greška pri ispitivanju NE refundira - posao ostaje u letu za reaper", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  stubFetch(() => json({ error: { message: "prolazna greška" } }, 500));

  const result = await poll(t);
  await settle(t);

  // 500 na `GET`-u znači "ne znam stanje", a ne "posao je propao": refund bi
  // vratio kredite za generaciju koju Google možda i naplati.
  expect(result).toEqual({ polled: 0, finished: 0, failed: 0 });
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await refundsFor(t, jobId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(before);
});

test("gotova operacija bez izlaza i bez greške ostaje u letu, ne refundira se sama", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);
  stubFetch(operationEndpoint({ name: OPERATION, done: true, response: {} }));

  const result = await poll(t);
  await settle(t);

  // Oblik odgovora nije potvrdjen protiv živog API-ja; promašen ključ ne sme da
  // tiho vraća kredite za uspešne generacije. Takav posao pokupi reaper.
  expect(result).toEqual({ polled: 1, finished: 0, failed: 0 });
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

// ── 6. Cene iz kataloga 3.7 i 3.8 ──────────────────────────────────────────

/** Cena jedne sekunde po pravilu reda - onako kako je katalog tabelira. */
function creditsPerSecond(seed: StudioModelSeed, resolution: string, audio: boolean): number {
  return computeCredits(seed.priceRule, { resolution, audio, duration: 1 });
}

test("Veo: kr/s iz pravila su tačno one iz kataloga 3.7, za sva tri reda", () => {
  // Lite (fal): 720p nemo 7 · 720p zvuk 11 · 1080p nemo 11 · 1080p zvuk 18
  expect(creditsPerSecond(VEO_31_LITE, "720p", false)).toBe(7);
  expect(creditsPerSecond(VEO_31_LITE, "720p", true)).toBe(11);
  expect(creditsPerSecond(VEO_31_LITE, "1080p", false)).toBe(11);
  expect(creditsPerSecond(VEO_31_LITE, "1080p", true)).toBe(18);

  // Fast (google): 720p zvuk 22 · 1080p zvuk 26 · 4K zvuk 65
  expect(creditsPerSecond(VEO_31_FAST, "720p", true)).toBe(22);
  expect(creditsPerSecond(VEO_31_FAST, "1080p", true)).toBe(26);
  expect(creditsPerSecond(VEO_31_FAST, "4K", true)).toBe(65);

  // Standard (fal): bez zvuka 44 · sa zvukom 87 · 4K zvuk 130
  expect(creditsPerSecond(VEO_31, "720p", false)).toBe(44);
  expect(creditsPerSecond(VEO_31, "720p", true)).toBe(87);
  expect(creditsPerSecond(VEO_31, "4K", true)).toBe(130);

  // Lite nema 4K - kombinacija ne postoji u mapi, pa se ne može ni naručiti.
  expect(isCombinationPriceable(VEO_31_LITE.priceRule, { resolution: "4K", audio: true })).toBe(
    false,
  );
});

test("Gemini Omni: 22 kr/s, 5 s = 110 kredita (katalog 3.8)", () => {
  expect(computeCredits(GEMINI_OMNI.priceRule, { duration: 1 })).toBe(22);
  expect(computeCredits(GEMINI_OMNI.priceRule, { duration: 5 })).toBe(110);
});

test("svaki režim iz inputModes ima endpoint i inputSpec, i svaka cena ima svoju opciju", () => {
  for (const seed of GOOGLE_VIDEO_MODELS) {
    for (const mode of seed.inputModes) {
      expect(typeof seed.endpoints[mode]).toBe("string");
      expect(seed.inputSpec[mode]).toBeDefined();
    }

    const options = new Map<string, string[]>();
    for (const control of seed.paramSpec) {
      if (!control.options) continue;
      options.set(control.key, control.options.map((option) => option.value));
    }
    // Vrednost koju `lookup` očekuje mora da postoji kao opcija - inače cena
    // postoji za kombinaciju koju korisnik ne može da izabere, ili obrnuto.
    for (const key of Object.keys(seed.priceRule.lookup?.map ?? {})) {
      const parts = key.split("|");
      seed.priceRule.lookup?.params.forEach((param, index) => {
        const values = options.get(param);
        if (!values) return;
        expect(values).toContain(parts[index]);
      });
    }
  }
});
