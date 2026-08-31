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
  fromBase64,
  parseInteraction,
  readInteractionMedia,
} from "../../lib/google-image";
import {
  bareInteractionId,
  buildGoogleImageRequest,
  buildOmniRequest,
  buildVeoRequest,
  EMPTY_GOOGLE_INPUTS,
  googleDownloadHeaders,
  OMNI_AUDIO_REFERENCE_ERROR,
  OMNI_UPLOADED_VIDEO_ERROR,
  omniInputRestriction,
  toBase64,
} from "./googleCore";
import { NANO_BANANA_2, NANO_BANANA_PRO } from "./googleImageModels";
import { GEMINI_OMNI, GOOGLE_VIDEO_MODELS, VEO_31, VEO_31_FAST, VEO_31_LITE } from "./googleModels";
import { computeCostUsd, computeCredits, isCombinationPriceable } from "../studioPricing";
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
    // `audio` se prosledjuje namerno: stari katalog ga je slao, a red ga vise
    // nema. Mora da IZLETI iz zahteva - Veo 3.1 nema taj parametar i nepoznat
    // kljuc vraca 400 tek posle rezervacije kredita.
    { prompt: "lisica u snegu", resolution: "4K", audio: false, duration: 8 },
    EMPTY_GOOGLE_INPUTS,
    "text",
  );

  expect(request).toEqual({
    instances: [{ prompt: "lisica u snegu" }],
    // `durationSeconds` je BROJ (zivi API odbija string, iako ga curl primer
    // u dokumentaciji pise pod navodnicima), a `generateAudio` ne postoji -
    // zvuk je kod Veo 3.1 uvek ukljucen.
    parameters: { resolution: "4k", durationSeconds: 8 },
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
  // `inlineData`, ne `bytesBase64Encoded` - Gemini API, ne Vertex `predict`.
  expect(instances.image).toEqual({ inlineData: { mimeType: "image/png", data: "prvi" } });
  // `lastFrame` je u INSTANCI, ne u `parameters` - u `parameters` bi ga Google
  // tiho ignorisao i naplatio prvi-i-poslednji kadar a isporucio image-to-video.
  expect(instances.lastFrame).toEqual({ inlineData: { mimeType: "image/png", data: "drugi" } });
  expect(parameters.lastFrame).toBeUndefined();

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

test("buildOmniRequest: Interactions oblik, isti kao Nano Banana samo type video", () => {
  const request = buildOmniRequest(
    "gemini-omni-flash-preview",
    { prompt: "reklama", aspect_ratio: "9:16", duration: 6 },
    { ...EMPTY_GOOGLE_INPUTS, image: [file("slika")] },
    "image",
  );

  expect(request.model).toBe("gemini-omni-flash-preview");
  // `input` + `response_format`, ne `inputs` + `config`: to je oblik koji
  // Interactions API stvarno prima (isti kao kod slike).
  // `delivery: "uri"` je obavezan deo: video preko 4 MB ne staje u inline
  // `data`, a 720p klip to gotovo uvek prelazi.
  expect(request.response_format).toEqual({
    type: "video",
    delivery: "uri",
    aspect_ratio: "9:16",
  });
  expect(request.input).toEqual([
    { type: "text", text: "reklama" },
    { type: "image", mime_type: "image/png", data: "slika" },
  ]);
  expect(request.config).toBeUndefined();
  expect(request.inputs).toBeUndefined();
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

test("Veo Lite nema reference ni produžavanje, Standard ima oba", () => {
  expect(VEO_31_LITE.inputModes).toEqual(["text", "image", "first_last"]);
  expect(VEO_31_LITE.endpoints.reference).toBeUndefined();
  expect(VEO_31_LITE.endpoints.video).toBeUndefined();

  expect(VEO_31.inputModes).toContain("reference");
  expect(VEO_31.inputModes).toContain("video");
});

test("Veo: oba ziva reda idu na Google, a izmisljena Fast tarifa je ugasena", () => {
  // Google izlaze TACNO dva Veo modela. Oba idu direktno, jer je Google jedini
  // provajder za koji postoji kljuc.
  expect(VEO_31_LITE.provider).toBe("google");
  expect(VEO_31_LITE.endpoints.text).toBe("veo-3.1-lite-generate-preview");
  expect(VEO_31.provider).toBe("google");
  expect(VEO_31.endpoints.text).toBe("veo-3.1-generate-preview");

  // `veo-3.1-fast-generate-preview` NE POSTOJI - svaki poziv bi bio 404, pa
  // refund posle rezervacije. Red ostaje da bi ga seed ugasio, ne da bi radio.
  expect(VEO_31_FAST.isEnabled).toBe(false);
});

test("Veo: zvuk nije kontrola ni kod jednog reda - kod Veo 3.1 je uvek ukljucen", () => {
  for (const seed of [VEO_31_LITE, VEO_31]) {
    expect(seed.paramSpec.some((control) => control.key === "audio")).toBe(false);
    expect(seed.priceRule.lookup?.params).toEqual(["resolution"]);
  }
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

test("Veo ide direktno na Google i završi u running sa imenom operacije", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, VEO_31_LITE);
  const jobId = await seedReservedJob(t, userId, { seed: VEO_31_LITE });
  const calls = stubFetch(() => json({ name: OPERATION }));

  await submit(t, jobId);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("running");
  // Poller posle ne mora da zna koji je model posao napravio: `providerRequestId`
  // JESTE putanja operacije.
  expect(job?.providerRequestId).toBe(OPERATION);

  const [call] = googleCalls(calls);
  expect(call.method).toBe("POST");
  expect(call.url).toBe(`${BASE_URL}/models/veo-3.1-lite-generate-preview:predictLongRunning`);
  // Ključ ide u zaglavlje, nikad u URL.
  expect(call.key).toBe(API_KEY);
  expect(call.url).not.toContain(API_KEY);
  expect(call.body).toEqual({
    instances: [{ prompt: "lisica trči kroz sneg" }],
    parameters: { resolution: "720p", durationSeconds: 5 },
  });
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

test("Gemini Omni je SINHRON: jedan poziv, posao odmah done, bez pollera", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, GEMINI_OMNI);
  const jobId = await seedReservedJob(t, userId, {
    seed: GEMINI_OMNI,
    params: { prompt: "reklama za kafu", aspect_ratio: "9:16", duration: 6 },
  });
  const calls = stubFetch(() =>
    json({
      id: "intr_9f21",
      status: "completed",
      steps: [
        { type: "model_output", content: [{ type: "video", mime_type: "video/mp4", data: "QUJD" }] },
      ],
    }),
  );

  await submit(t, jobId);

  const [call] = googleCalls(calls);
  expect(call.url).toBe(`${BASE_URL}/interactions`);
  expect(call.url).not.toContain("generateContent");

  const job = await jobOf(t, jobId);
  // `reserved` -> `done`, nikad `running`: nema sta poller da ispituje.
  expect(job?.status).toBe("done");
  expect(job?.providerRequestId).toBe("interactions/intr_9f21");
  expect(job?.outputStorageId).toBeDefined();
  expect(await refundsFor(t, jobId)).toHaveLength(0);
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
  const calls = stubFetch(() =>
    json({
      id: "intr_novi",
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "video", data: "QUJD" }] }],
    }),
  );

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

test("bez GOOGLE_AI_API_KEY posao ide u mock (DEMO), bez poziva i bez refunda (SP2)", async () => {
  const t = convexTest(schema, modules);
  delete process.env.GOOGLE_AI_API_KEY;
  const userId = await seedUser(t);
  await seedModel(t, VEO_31_FAST);
  const jobId = await seedReservedJob(t, userId, { seed: VEO_31_FAST });
  const calls = stubFetch(() => json({ name: OPERATION }));

  await submit(t, jobId);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("running");
  expect(job?.falRequestId?.startsWith("mock-")).toBe(true);
  expect(calls).toHaveLength(0);
  expect(await refundsFor(t, jobId)).toHaveLength(0);
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

/** Cena jedne sekunde po pravilu reda. Zvuk vise nije parametar. */
function creditsPerSecond(seed: StudioModelSeed, resolution: string): number {
  return computeCredits(seed.priceRule, { resolution, duration: 1 });
}

test("Veo: kr/s prate zvanicni cenovnik Google-a, sa zvukom uracunatim", () => {
  // Lite: $0,05/s na 720p, $0,08/s na 1080p.
  expect(creditsPerSecond(VEO_31_LITE, "720p")).toBe(11);
  expect(creditsPerSecond(VEO_31_LITE, "1080p")).toBe(18);

  // Standard: $0,40/s na 720p I na 1080p, $0,60/s na 4K.
  // Stari red je 4K racunao po $0,42/s - trideset posto ISPOD nabavne.
  expect(creditsPerSecond(VEO_31, "720p")).toBe(87);
  expect(creditsPerSecond(VEO_31, "1080p")).toBe(87);
  expect(creditsPerSecond(VEO_31, "4K")).toBe(130);

  // Zvuk vise ne postoji kao parametar; ako ga neko ipak posalje, cena se NE
  // pomera - inace bi klijent birao koliko ce da plati.
  expect(computeCredits(VEO_31.priceRule, { resolution: "4K", audio: false, duration: 1 })).toBe(130);

  // Lite nema 4K - kombinacija ne postoji u mapi, pa se ne može ni naručiti.
  expect(isCombinationPriceable(VEO_31_LITE.priceRule, { resolution: "4K" })).toBe(false);
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

// --- Google slike: Interactions API (katalog 2.1 i 2.2) ---------------------

const IMAGE_FILE = { mimeType: "image/jpeg", base64: "QUJD" };

test("buildGoogleImageRequest: text režim šalje samo prompt, u obliku koji API traži", () => {
  const body = buildGoogleImageRequest(
    "gemini-3.1-flash-image",
    { prompt: "maca na krovu", resolution: "1K", aspect_ratio: "16:9" },
    EMPTY_GOOGLE_INPUTS,
    "text",
  );

  expect(body.model).toBe("gemini-3.1-flash-image");
  // `input` je NIZ blokova, ne `contents.parts` - to je razlika Interactions
  // API-ja prema `generateContent`-u i najlakše mesto da se pogreši.
  expect(body.input).toEqual([{ type: "text", text: "maca na krovu" }]);
  // `image/jpeg`, ne PNG: PNG vraca 400 sa `invalid_request` (potvrdjeno uzivo).
  expect(body.response_format).toEqual({
    type: "image",
    mime_type: "image/jpeg",
    aspect_ratio: "16:9",
    image_size: "1K",
  });
});

test("buildGoogleImageRequest: 0.5K se prevodi u 512px, a nepoznata rezolucija puca PRE mreže", () => {
  const body = buildGoogleImageRequest(
    "gemini-3.1-flash-image",
    { prompt: "x", resolution: "0.5K" },
    EMPTY_GOOGLE_INPUTS,
    "text",
  );
  expect((body.response_format as Record<string, unknown>).image_size).toBe("512px");

  expect(() =>
    buildGoogleImageRequest(
      "gemini-3.1-flash-image",
      { prompt: "x", resolution: "8K" },
      EMPTY_GOOGLE_INPUTS,
      "text",
    ),
  ).toThrow(/NEPOZNATA_REZOLUCIJA/);
});

test("buildGoogleImageRequest: image_multi šalje sve slike, a prazan ulaz je greška", () => {
  const body = buildGoogleImageRequest(
    "gemini-3-pro-image",
    { prompt: "spoji ih" },
    { ...EMPTY_GOOGLE_INPUTS, image: [IMAGE_FILE, IMAGE_FILE] },
    "image_multi",
  );

  expect(body.input).toEqual([
    { type: "text", text: "spoji ih" },
    { type: "image", mime_type: "image/jpeg", data: "QUJD" },
    { type: "image", mime_type: "image/jpeg", data: "QUJD" },
  ]);

  expect(() =>
    buildGoogleImageRequest("gemini-3-pro-image", { prompt: "x" }, EMPTY_GOOGLE_INPUTS, "image_multi"),
  ).toThrow(/NEPOTPUN_ULAZ/);
});

test("readInteractionMedia: nalazi sliku u steps[].content[] i preskače misli", () => {
  const media = readInteractionMedia({
    steps: [
      { type: "user_input", content: [{ type: "text", text: "prompt" }] },
      { type: "thought", content: [{ type: "thought", text: "razmišljam" }] },
      {
        type: "model_output",
        content: [
          { type: "text", text: "evo" },
          { type: "image", mime_type: "image/png", data: "AAAA" },
        ],
      },
    ],
  });

  expect(media).toEqual({ data: "AAAA", mimeType: "image/png" });
});

test("readInteractionMedia: podržan je i skraćeni output_image oblik", () => {
  expect(readInteractionMedia({ output_image: { data: "BBBB" } })).toEqual({
    data: "BBBB",
    mimeType: "image/png",
  });
  expect(readInteractionMedia({ steps: [{ type: "model_output", content: [] }] })).toBeNull();
});

test("readInteractionMedia: `delivery: \"uri\"` vraca URL umesto bajtova", () => {
  // Video preko 4 MB Google ne salje inline - isti blok nosi `uri` umesto
  // `data`. Citac koji bi trazio samo `data` ovde vrati `null`, posao se
  // refundira, a generacija je vec placena kod Google-a.
  expect(
    readInteractionMedia({
      steps: [
        {
          type: "model_output",
          content: [{ type: "video", mime_type: "video/mp4", uri: "https://x/y.mp4" }],
        },
      ],
    }),
  ).toEqual({ uri: "https://x/y.mp4", mimeType: "video/mp4" });

  expect(readInteractionMedia({ output_video: { uri: "https://x/z.mp4" } })).toEqual({
    uri: "https://x/z.mp4",
    mimeType: "video/mp4",
  });
});

test("readInteractionMedia: kad su tu i `data` i `uri`, bajtovi imaju prednost", () => {
  expect(
    readInteractionMedia({ output_video: { data: "AAAA", uri: "https://x/y.mp4" } }),
  ).toEqual({ data: "AAAA", mimeType: "video/mp4" });
});

test("parseInteraction: odgovor bez slike sa status:failed je GREŠKA, ne uspeh", () => {
  const failed = parseInteraction({ id: "v1_x", status: "failed" });
  expect(failed.media).toBeNull();
  expect(failed.error).toMatch(/failed/i);
  // Greška je pročitana, pa uzorak nije potreban.
  expect(failed.sample).toBeNull();

  const unknown = parseInteraction({ nesto: "drugo" });
  expect(unknown.media).toBeNull();
  expect(unknown.error).toBeNull();
  // Ni slika ni potrošnja ni greška -> oblik koji ne razumemo se PAMTI.
  expect(unknown.sample).not.toBeNull();
});

test("parseInteraction: id se čita, jer je ulaz za previous_interaction_id", () => {
  const ok = parseInteraction({
    id: "v1_abc",
    steps: [{ type: "model_output", content: [{ type: "image", data: "AAAA" }] }],
  });
  expect(ok.interactionId).toBe("v1_abc");
  expect(ok.media?.data).toBe("AAAA");
  expect(bareInteractionId(`interactions/${ok.interactionId}`)).toBe("v1_abc");
});

test("fromBase64 je inverz toBase64 - izlaz iz Google-a mora da se vrati u iste bajtove", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 65, 66]);
  expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
});

test("Google slike: cena prati zvanični cenovnik i NE množi se brojem slika", () => {
  // Interactions API vraća jednu sliku po pozivu, pa `num_images` ne sme ni da
  // postoji - ni kao kontrola ni kao `quantityParam`.
  for (const seed of [NANO_BANANA_2, NANO_BANANA_PRO]) {
    expect(seed.paramSpec.some((control) => control.key === "num_images")).toBe(false);
    expect(seed.priceRule.quantityParam).toBeUndefined();
    expect((seed.capabilities as Record<string, unknown>).maxImagesPerRun).toBe(1);
  }

  // Nabavna cena po zvaničnom cenovniku, u dolarima. Marža je odvojeno pitanje;
  // ovde se čuva samo da tarifa ne padne ISPOD nabavne.
  const nb2 = (resolution: string) =>
    computeCostUsd(NANO_BANANA_2.priceRule, { resolution }) - 0.003;
  expect(nb2("1K")).toBeCloseTo(0.067, 3);
  expect(nb2("2K")).toBeCloseTo(0.101, 3);
  // Stara vrednost je ovde bila 0,134 - jedanaest posto ispod nabavne.
  expect(nb2("4K")).toBeCloseTo(0.151, 3);

  const pro = (resolution: string) =>
    computeCostUsd(NANO_BANANA_PRO.priceRule, { resolution }) - 0.015;
  expect(pro("2K")).toBeCloseTo(0.134, 3);
  expect(pro("4K")).toBeCloseTo(0.24, 2);
});

test("Google slike: odnosi stranica su samo oni koje API dokumentuje", () => {
  const DOCUMENTED = ["1:1", "16:9", "9:16", "5:4", "3:2", "2:3", "1:4", "4:1", "1:8", "8:1"];
  for (const seed of [NANO_BANANA_2, NANO_BANANA_PRO]) {
    const control = seed.paramSpec.find((item) => item.key === "aspect_ratio");
    expect(control).toBeDefined();
    for (const option of control?.options ?? []) {
      expect(DOCUMENTED).toContain(option.value);
    }
  }
});
