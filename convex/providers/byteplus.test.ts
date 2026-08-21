/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  buildImageRequestBody,
  buildVideoContent,
  challengeResponseBody,
  parseCallbackBody,
} from "./bytePlusCore";
import { parseJobInputs } from "./jobInputs";
import { type BytePlusModelSeed, SEEDANCE_20, SEEDANCE_25, SEEDREAM_5_PRO } from "./bytePlusModels";

/**
 * Putanja je od korena projekta, ne relativna: `import.meta.glob("../**")` iz
 * poddirektorijuma NE zahvata sam taj poddirektorijum, pa `convex-test` ne bi
 * umeo da učita `providers/byteplus` kad ga scheduler pozove
 * ("Could not find module for: providers/byteplus").
 */
const modules = import.meta.glob("/convex/**/*.ts");

type TestConvexWithSchema = TestConvex<typeof schema>;

const BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const API_KEY = "test-byteplus-key";
const SITE_URL = "https://example.convex.site";
const TASK_ID = "cgt-20260820-4f2a9c";
const VIDEO_URL = "https://byteplus.example/output.mp4";
const IMAGE_URL = "https://byteplus.example/output.png";
const JOB_COST = 165;
const GRANTED = 1000;

const previousBaseUrl = process.env.BYTEPLUS_BASE_URL;
const previousApiKey = process.env.BYTEPLUS_API_KEY;
const previousSiteUrl = process.env.CONVEX_SITE_URL;

beforeEach(() => {
  process.env.BYTEPLUS_BASE_URL = BASE_URL;
  process.env.BYTEPLUS_API_KEY = API_KEY;
  process.env.CONVEX_SITE_URL = SITE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousBaseUrl === undefined) delete process.env.BYTEPLUS_BASE_URL;
  else process.env.BYTEPLUS_BASE_URL = previousBaseUrl;
  if (previousApiKey === undefined) delete process.env.BYTEPLUS_API_KEY;
  else process.env.BYTEPLUS_API_KEY = previousApiKey;
  if (previousSiteUrl === undefined) delete process.env.CONVEX_SITE_URL;
  else process.env.CONVEX_SITE_URL = previousSiteUrl;
});

// ── alati ──────────────────────────────────────────────────────────────────

type FetchCall = { url: string; method: string; auth: string | null; body: unknown };

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
 * Jedini `fetch` u ovim testovima. BytePlus se NIKAD ne zove uživo; sve što
 * kod pošalje mreži zabeleži se ovde i nad tim se tvrdi.
 */
function stubFetch(handler: (url: string, init: RequestInit) => Response | undefined): FetchCall[] {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: String(init.method ?? "GET"),
      auth: headers.Authorization ?? null,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const response = handler(url, init);
    if (!response) throw new Error(`test: nepredvidjen fetch na ${url}`);

    return response;
  });
  vi.stubGlobal("fetch", mock as unknown as typeof fetch);

  return calls;
}

/** Odgovor task endpointa; sve ostalo (skidanje izlaza) je binarni fajl. */
function taskEndpoint(task: unknown): (url: string) => Response {
  return (url) => (url.includes("/contents/generations/tasks/") ? json(task) : binary());
}

const bytePlusCalls = (calls: FetchCall[]) => calls.filter((call) => call.url.startsWith(BASE_URL));

/**
 * Zakazane funkcije se u `convex-test` pokreću pravim `setTimeout(0)`, pa se
 * mora pustiti makrotask pre čekanja. Nekoliko krugova, jer `verifyAndApplyTask`
 * zakazuje `persistOutput`.
 */
async function settle(t: TestConvexWithSchema): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function seedModel(t: TestConvexWithSchema, seed: BytePlusModelSeed) {
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
    seed: BytePlusModelSeed;
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
      params: JSON.stringify(opts.params ?? { prompt: "lisica trči kroz sneg" }),
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

/** Posao koji je već predat Seedance-u i čeka callback. */
async function seedRunningJob(t: TestConvexWithSchema, providerRequestId = TASK_ID) {
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_20);
  const jobId = await seedReservedJob(t, userId, { seed: SEEDANCE_20 });
  await t.run((ctx) =>
    ctx.db.patch(jobId, {
      status: "running",
      falRequestId: providerRequestId,
      providerRequestId,
    }),
  );

  return { userId, jobId };
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

async function scheduledNames(t: TestConvexWithSchema) {
  const rows = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

  return rows.map((row) => row.name);
}

const post = (t: TestConvexWithSchema, body: string) =>
  t.fetch("/byteplus/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

// ── 1. Verifikacioni zahtev: `challenge` se vraća nepromenjen ──────────────

test("verifikacioni zahtev dobija NEPROMENJEN challenge nazad, 200, bez mreže i baze", async () => {
  const t = convexTest(schema, modules);
  const calls = stubFetch(() => json({}));

  const response = await post(t, JSON.stringify({ challenge: "Xy9-BytePlus_2026" }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ challenge: "Xy9-BytePlus_2026" });
  // Verifikacija ima rok od 3 sekunde, pa se odgovara pre ijednog čitanja baze
  // i pre ijednog mrežnog poziva.
  expect(calls).toHaveLength(0);
  expect(await scheduledNames(t)).toHaveLength(0);
});

test("obična poruka o statusu NE dobija challenge odgovor - telo je prazno", async () => {
  const t = convexTest(schema, modules);
  stubFetch(() => json({}));

  const response = await post(t, JSON.stringify({ id: TASK_ID, status: "succeeded" }));

  expect(response.status).toBe(200);
  expect(await response.text()).toBe("");
});

test("telo bez `challenge` polja ne može da prodje verifikaciju - nema šta da vrati", async () => {
  const t = convexTest(schema, modules);
  stubFetch(() => json({}));

  for (const body of ["{}", "nije json", JSON.stringify({ challenge: "" })]) {
    const response = await post(t, body);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  }
});

test("parseCallbackBody: challenge ima prednost, status iz tela se ne čita", () => {
  expect(parseCallbackBody(JSON.stringify({ challenge: "abc" }))).toEqual({
    kind: "challenge",
    challenge: "abc",
  });
  expect(parseCallbackBody(JSON.stringify({ id: TASK_ID, status: "succeeded" }))).toEqual({
    kind: "task",
    taskId: TASK_ID,
  });
  expect(parseCallbackBody(JSON.stringify({ task_id: TASK_ID }))).toEqual({
    kind: "task",
    taskId: TASK_ID,
  });
  expect(parseCallbackBody("[]")).toEqual({ kind: "unknown" });
  expect(parseCallbackBody("{")).toEqual({ kind: "unknown" });
  expect(challengeResponseBody("abc")).toBe(JSON.stringify({ challenge: "abc" }));
});

// ── 2. Callback za nepoznat zadatak ────────────────────────────────────────

test("callback za nepoznat providerRequestId vraća 200 i ne radi NIŠTA", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t, TASK_ID);
  const calls = stubFetch(() => json({}));

  const response = await post(t, JSON.stringify({ id: "cgt-tudji-zadatak" }));
  await settle(t);

  expect(response.status).toBe(200);
  // Callback nije potpisan, pa nepoznat ID ne sme ni da nas natera da zovemo
  // BytePlus - inače bilo ko sa našom putanjom troši naš rate limit.
  expect(bytePlusCalls(calls)).toHaveLength(0);
  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

test("callback za posao koji više nije running ne dira ništa", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);
  await t.run((ctx) => ctx.db.patch(jobId, { status: "done", falOutputUrl: VIDEO_URL }));
  const calls = stubFetch(() => json({}));

  const response = await post(t, JSON.stringify({ id: TASK_ID }));
  await settle(t);

  expect(response.status).toBe(200);
  expect(bytePlusCalls(calls)).toHaveLength(0);
  expect((await jobOf(t, jobId))?.status).toBe("done");
});

// ── 3. Telo callback-a NIJE izvor istine ───────────────────────────────────

test("callback koji tvrdi `succeeded` ne prolazi kad task endpoint kaže `failed`", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  stubFetch(taskEndpoint({ id: TASK_ID, status: "failed", error: { message: "content_policy" } }));

  await post(t, JSON.stringify({ id: TASK_ID, status: "succeeded", video_url: VIDEO_URL }));
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.falOutputUrl).toBeUndefined();
  expect(job?.error).toBe("content_policy");
  expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
});

test("callback koji tvrdi `failed` ne refundira kad task endpoint kaže `succeeded`", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  stubFetch(taskEndpoint({ id: TASK_ID, status: "succeeded", content: { video_url: VIDEO_URL } }));

  await post(t, JSON.stringify({ id: TASK_ID, status: "failed" }));
  await settle(t);

  expect((await jobOf(t, jobId))?.status).toBe("done");
  expect(await balanceOf(t, userId)).toBe(before);
  expect(await refundsFor(t, jobId)).toHaveLength(0);
});

test("zadatak koji je još u obradi ne menja posao", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedRunningJob(t);
  stubFetch(taskEndpoint({ id: TASK_ID, status: "running" }));

  await post(t, JSON.stringify({ id: TASK_ID }));
  await settle(t);

  expect((await jobOf(t, jobId))?.status).toBe("running");
});

test("`succeeded` bez URL-a ne obara posao u done, ali ga ni ne refundira", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  stubFetch(taskEndpoint({ id: TASK_ID, status: "succeeded", content: {} }));

  await post(t, JSON.stringify({ id: TASK_ID }));
  await settle(t);

  expect((await jobOf(t, jobId))?.status).toBe("running");
  expect(await balanceOf(t, userId)).toBe(before);
});

// ── 4. Uspeh i dupli callback ──────────────────────────────────────────────

test("uspešan callback: posao ide u done, izlaz se pamti, persistOutput se zakazuje", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  const calls = stubFetch(
    taskEndpoint({ id: TASK_ID, status: "succeeded", content: { video_url: VIDEO_URL } }),
  );

  const response = await post(t, JSON.stringify({ id: TASK_ID }));
  await settle(t);

  expect(response.status).toBe(200);
  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("done");
  expect(job?.falOutputUrl).toBe(VIDEO_URL);
  expect(await balanceOf(t, userId)).toBe(before);

  const verify = bytePlusCalls(calls);
  expect(verify).toHaveLength(1);
  expect(verify[0]?.url).toBe(`${BASE_URL}/contents/generations/tasks/${TASK_ID}`);
  expect(verify[0]?.method).toBe("GET");
  expect(verify[0]?.auth).toBe(`Bearer ${API_KEY}`);
  expect((await scheduledNames(t)).filter((name) => name.includes("persistOutput"))).toHaveLength(1);
});

test("dupli callback menja posao TAČNO JEDNOM - drugi ne zove ni BytePlus", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  const calls = stubFetch(
    taskEndpoint({ id: TASK_ID, status: "succeeded", content: { video_url: VIDEO_URL } }),
  );

  await post(t, JSON.stringify({ id: TASK_ID }));
  await settle(t);
  const completedAt = (await jobOf(t, jobId))?.completedAt;

  await post(t, JSON.stringify({ id: TASK_ID }));
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("done");
  expect(job?.completedAt).toBe(completedAt);
  expect(await balanceOf(t, userId)).toBe(before);
  // Drugi callback pada na `job.status !== "running"` PRE mrežnog poziva.
  expect(bytePlusCalls(calls)).toHaveLength(1);
  expect((await scheduledNames(t)).filter((name) => name.includes("persistOutput"))).toHaveLength(1);
});

// ── 5. Greška refundira tačno jednom ───────────────────────────────────────

test("neuspeh kod BytePlus-a refundira tačno jednom, i dupli callback to ne menja", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  stubFetch(taskEndpoint({ id: TASK_ID, status: "failed", error: { message: "quota_exceeded" } }));

  await post(t, JSON.stringify({ id: TASK_ID }));
  await settle(t);
  await post(t, JSON.stringify({ id: TASK_ID }));
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("quota_exceeded");
  expect(await refundsFor(t, jobId)).toHaveLength(1);
  expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
});

test("otkazan zadatak se tretira kao neuspeh i takodje refundira", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId } = await seedRunningJob(t);
  const before = await balanceOf(t, userId);
  stubFetch(taskEndpoint({ id: TASK_ID, status: "cancelled" }));

  await post(t, JSON.stringify({ id: TASK_ID }));
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("BytePlus je vratio grešku bez opisa.");
  expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
  expect(await refundsFor(t, jobId)).toHaveLength(1);
});

// ── 6. Predaja posla: slika sinhrono, video asinhrono ──────────────────────

test("Seedream 5 Pro ide SINHRONO: reserved -> done, bez prolaska kroz running", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDREAM_5_PRO);
  const jobId = await seedReservedJob(t, userId, {
    seed: SEEDREAM_5_PRO,
    params: { prompt: "flaša na stolu", resolution: "2K", num_images: 1 },
  });
  const before = await balanceOf(t, userId);
  const calls = stubFetch((url) =>
    url.includes("/images/generations") ? json({ data: [{ url: IMAGE_URL }] }) : binary(),
  );

  await t.action(internal.studioActions.submitJob, { jobId });
  await settle(t);

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("done");
  expect(job?.falOutputUrl).toBe(IMAGE_URL);
  expect(await balanceOf(t, userId)).toBe(before);

  const submit = bytePlusCalls(calls)[0];
  expect(submit?.url).toBe(`${BASE_URL}/images/generations`);
  expect(submit?.method).toBe("POST");
  expect(submit?.body).toMatchObject({
    model: "dola-seedream-5-0-pro-260628",
    prompt: "flaša na stolu",
    size: "2K",
    n: 1,
    watermark: false,
  });
});

test("Seedance ide ASINHRONO: running sa task ID-jem i callback_url-om na našoj putanji", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_20);
  const jobId = await seedReservedJob(t, userId, {
    seed: SEEDANCE_20,
    params: { prompt: "grad noću", tier: "standard", resolution: "720p", duration: 5 },
  });
  const calls = stubFetch(() => json({ id: TASK_ID }));

  await t.action(internal.studioActions.submitJob, { jobId });

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("running");
  expect(job?.providerRequestId).toBe(TASK_ID);
  expect(job?.falRequestId).toBe(TASK_ID);

  const submit = bytePlusCalls(calls)[0];
  expect(submit?.url).toBe(`${BASE_URL}/contents/generations/tasks`);
  expect(submit?.body).toMatchObject({
    model: "dreamina-seedance-2-0-260128",
    callback_url: `${SITE_URL}/byteplus/webhook`,
  });
});

// ── 7. Tarifa (`tier`) mora da stigne do BytePlus-a ────────────────────────

test("Standard ne šalje `--tier`, Fast i Mini ga šalju - inače plaćamo skuplju tarifu", () => {
  const empty = { images: [], videos: [] };
  const textOf = (params: Record<string, unknown>) =>
    (buildVideoContent(params, empty)[0] as { text: string }).text;

  expect(textOf({ prompt: "p", resolution: "720p", duration: 5, tier: "standard" })).toBe(
    "p --resolution 720p --duration 5",
  );
  expect(textOf({ prompt: "p", resolution: "720p", duration: 5, tier: "fast" })).toBe(
    "p --resolution 720p --duration 5 --tier fast",
  );
  expect(textOf({ prompt: "p", resolution: "480p", duration: 4, tier: "mini" })).toBe(
    "p --resolution 480p --duration 4 --tier mini",
  );
});

test("Mini posao stvarno nosi `--tier mini` u zahtevu koji ide BytePlus-u", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_20);
  const jobId = await seedReservedJob(t, userId, {
    seed: SEEDANCE_20,
    params: { prompt: "test", tier: "mini", resolution: "720p", duration: 5 },
  });
  const calls = stubFetch(() => json({ id: TASK_ID }));

  await t.action(internal.studioActions.submitJob, { jobId });

  const content = (bytePlusCalls(calls)[0]?.body as { content: Array<{ text: string }> }).content;
  expect(content[0]?.text).toContain("--tier mini");
});

// ── 8. Video referenca ide kao video, ne kao slika ─────────────────────────

test("buildVideoContent šalje slike kao image_url, a video kao video_url", () => {
  const content = buildVideoContent(
    { prompt: "p", resolution: "720p", duration: 5 },
    { images: ["https://x/1.png", "https://x/2.png"], videos: ["https://x/a.mp4"] },
  );

  expect(content).toEqual([
    { type: "text", text: "p --resolution 720p --duration 5" },
    { type: "image_url", image_url: { url: "https://x/1.png" } },
    { type: "image_url", image_url: { url: "https://x/2.png" } },
    { type: "video_url", video_url: { url: "https://x/a.mp4" } },
  ]);
});

test("okačen video iz `reference` režima stiže do BytePlus-a kao video_url", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_20);
  const imageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array([1])], { type: "image/png" })),
  );
  const videoId = await t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array([2])], { type: "video/mp4" })),
  );
  const jobId = await seedReservedJob(t, userId, {
    seed: SEEDANCE_20,
    inputMode: "reference",
    inputs: { image: [imageId], video: [videoId] },
    params: { prompt: "referenca", tier: "standard", resolution: "720p", duration: 5 },
  });
  const calls = stubFetch(() => json({ id: TASK_ID }));

  await t.action(internal.studioActions.submitJob, { jobId });

  const content = (bytePlusCalls(calls)[0]?.body as { content: Array<Record<string, unknown>> })
    .content;
  expect(content.filter((part) => part.type === "image_url")).toHaveLength(1);
  expect(content.filter((part) => part.type === "video_url")).toHaveLength(1);
});

test("Seedance 2.5 prosledjuje svih 50 referenci, ne seče na 10 (nalaz S1)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_25);
  const imageIds = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([i])], { type: "image/png" }))),
    ),
  );
  const jobId = await seedReservedJob(t, userId, {
    seed: SEEDANCE_25,
    inputMode: "reference",
    inputs: { image: imageIds },
    params: { prompt: "50 referenci", resolution: "720p", duration: 5 },
  });
  const calls = stubFetch(() => json({ id: TASK_ID }));

  await t.action(internal.studioActions.submitJob, { jobId });

  const content = (bytePlusCalls(calls)[0]?.body as { content: Array<Record<string, unknown>> })
    .content;
  expect(content.filter((part) => part.type === "image_url")).toHaveLength(50);
});

// ── 9. Greške u predaji refundiraju, bez mrežnog poziva gde ga ne treba ────

test.each([
  ["BYTEPLUS_API_KEY", /BYTEPLUS_API_KEY nije postavljen/],
  ["BYTEPLUS_BASE_URL", /BYTEPLUS_BASE_URL nije postavljen/],
] as const)(
  "bez %s posao se refundira tačno jednom, bez ijednog mrežnog poziva",
  async (variable, message) => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedModel(t, SEEDANCE_20);
    const jobId = await seedReservedJob(t, userId, { seed: SEEDANCE_20 });
    const before = await balanceOf(t, userId);
    delete process.env[variable];
    const calls = stubFetch(() => json({}));

    await t.action(internal.studioActions.submitJob, { jobId });

    const job = await jobOf(t, jobId);
    expect(job?.status).toBe("refunded");
    expect(job?.error).toMatch(message);
    expect(calls).toHaveLength(0);
    expect(await refundsFor(t, jobId)).toHaveLength(1);
    expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
  },
);

test("BytePlus koji vrati 500 refundira posao tačno jednom", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_20);
  const jobId = await seedReservedJob(t, userId, { seed: SEEDANCE_20 });
  const before = await balanceOf(t, userId);
  stubFetch(() => json({ error: { message: "internal" } }, 500));

  await t.action(internal.studioActions.submitJob, { jobId });

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toContain("500");
  expect(await refundsFor(t, jobId)).toHaveLength(1);
  expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
});

test("režim koji model nema se odbija pre mreže i refundira", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_20);
  const jobId = await seedReservedJob(t, userId, { seed: SEEDANCE_20, inputMode: "first_last" });
  const before = await balanceOf(t, userId);
  const calls = stubFetch(() => json({}));

  await t.action(internal.studioActions.submitJob, { jobId });

  const job = await jobOf(t, jobId);
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("NEDOZVOLJEN_REZIM:first_last");
  expect(calls).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(before + JOB_COST);
});

test("posao koji više nije `reserved` se ne predaje drugi put", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedModel(t, SEEDANCE_20);
  const jobId = await seedReservedJob(t, userId, { seed: SEEDANCE_20 });
  await t.run((ctx) => ctx.db.patch(jobId, { status: "running", providerRequestId: TASK_ID }));
  const calls = stubFetch(() => json({ id: "cgt-drugi" }));

  await t.action(internal.studioActions.submitJob, { jobId });

  expect(calls).toHaveLength(0);
  expect((await jobOf(t, jobId))?.providerRequestId).toBe(TASK_ID);
});

// ── 10. Čiste funkcije oko ulaza ───────────────────────────────────────────

test("parseJobInputs čuva redosled u slotu, a sve što nije taj oblik je prazno", () => {
  expect(parseJobInputs(JSON.stringify({ image: ["a", "b"], video: ["c"] }))).toEqual({
    image: ["a", "b"],
    video: ["c"],
  });
  expect(parseJobInputs(JSON.stringify({ image: ["a", 7, null] }))).toEqual({ image: ["a"] });
  expect(parseJobInputs(undefined)).toEqual({});
  expect(parseJobInputs("[]")).toEqual({});
  expect(parseJobInputs("nije json")).toEqual({});
});

test("buildImageRequestBody prosledjuje layers i ulazne slike, i gasi vodeni žig", () => {
  expect(
    buildImageRequestBody({ prompt: "p", resolution: "1.5K", layers: 8 }, ["u1", "u2"]),
  ).toEqual({
    prompt: "p",
    response_format: "url",
    watermark: false,
    size: "1.5K",
    layers: 8,
    image: ["u1", "u2"],
  });
});
