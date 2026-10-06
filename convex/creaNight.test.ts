/// <reference types="vite/client" />

/**
 * Noćna tura (Crea K08, C2) i jutarnje iznenađenje (G13) kroz pravi `createJob`
 * i prave akcije crona (convex-test). Mreža je UVEK lažna: Gemini i OpenAI su
 * mali lažni serveri ispod, a sve što kod pošalje beleži se i proverava.
 *
 * Tajmeri su lažni (i `Date` i `setTimeout`): zakazane funkcije se ne pokreću
 * same, pa test proverava ŠTA je zakazano i kada, a poravnanje pokreće ručno.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { NIGHT_ERRORS, NIGHT_INGEST_GRACE_MS, NIGHT_JOB_DEADLINE_MS, NIGHT_NOTIFICATION_KIND } from "./creaNightCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** 12:00 po Beogradu (leto) - push ide odmah. */
const NOON = Date.parse("2026-10-05T10:00:00Z");
/** 01:30 po Beogradu - push čeka 08:00 (06:00 UTC). */
const NIGHT = Date.parse("2026-10-05T23:30:00Z");

const GOOGLE_KEY = "test-google-key";
const BASE = "https://generativelanguage.googleapis.com";
const UPLOAD_URL = `${BASE}/upload/v1beta/files?upload_id=u-1&upload_protocol=resumable`;
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUg==";

const env = { google: process.env.GOOGLE_AI_API_KEY, openai: process.env.OPENAI_API_KEY };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOON);
  process.env.GOOGLE_AI_API_KEY = GOOGLE_KEY;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (env.google === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = env.google;
  if (env.openai === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = env.openai;
});

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type AsUser = ReturnType<TestConvex["withIdentity"]>;

async function seedModel(t: TestConvex, slug: string) {
  const seed = STUDIO_MODELS.find((row) => row.slug === slug);
  if (!seed) throw new Error(slug);
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

async function seedUser(t: TestConvex, email = "nocna@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Noćna",
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
    amount: 1000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });

  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function world(options: { pricingV2?: boolean; models?: string[] } = {}) {
  const t = makeT();
  for (const slug of options.models ?? ["nano-banana-2"]) await seedModel(t, slug);
  if (options.pricingV2 ?? true) {
    await t.mutation(internal.creaFlags.setCreaFlag, { key: "crea_pricing_v2", enabled: true });
  }
  const user = await seedUser(t);

  return { t, ...user };
}

const NB2_1K = { prompt: "mačka na krovu u zoru", resolution: "1K", aspect_ratio: "1:1" };

async function createNight(asUser: AsUser, modelSlug = "nano-banana-2", params: Record<string, unknown> = NB2_1K) {
  const result = await asUser.mutation(api.studio.createJob, {
    modelSlug,
    params: JSON.stringify(params),
    inputMode: "text",
    deliveryMode: "night",
  });
  if (typeof result !== "string") throw new Error(`očekivan jobId: ${JSON.stringify(result)}`);

  return result;
}

async function job(t: TestConvex, jobId: Id<"generationJobs">) {
  const row = await t.run((ctx) => ctx.db.get(jobId));
  if (!row) throw new Error("nema posla");

  return row;
}

async function balance(t: TestConvex, userId: Id<"users">) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );

  return row?.balance ?? 0;
}

async function batches(t: TestConvex) {
  return t.run((ctx) => ctx.db.query("creaBatches").collect());
}

async function scheduled(t: TestConvex) {
  return t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
}

// ── lažna mreža ────────────────────────────────────────────────────────────────

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function stubFetch(handler: (url: string, method: string) => Response | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init: RequestInit = {}) => {
      const url = String(input);
      const method = String(init.method ?? "GET");
      calls.push({ url, method, headers: (init.headers ?? {}) as Record<string, string>, body: init.body });
      const response = handler(url, method);
      if (!response) throw new Error(`test: nepredviđen fetch ${method} ${url}`);

      return response;
    }) as unknown as typeof fetch,
  );

  return calls;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

/** Lažni Gemini Batch: upload, batch, status i fajl rezultata. */
function gemini(options: { status?: unknown; results?: string; uploadStatus?: number } = {}) {
  return stubFetch((url, method) => {
    if (url === `${BASE}/upload/v1beta/files`) {
      return options.uploadStatus
        ? new Response("Service Unavailable", { status: options.uploadStatus })
        : json({}, 200, { "x-goog-upload-url": UPLOAD_URL });
    }
    if (url === UPLOAD_URL) return json({ file: { name: "files/in-1" } });
    if (url.endsWith(":batchGenerateContent")) return json({ name: "batches/b-1", metadata: { state: "JOB_STATE_PENDING" } });
    if (url === `${BASE}/v1beta/batches/b-1:cancel` && method === "POST") return json({});
    if (url === `${BASE}/v1beta/batches/b-1`) return json(options.status ?? { metadata: { state: "JOB_STATE_RUNNING" } });
    if (url === `${BASE}/download/v1beta/files/out-1:download?alt=media`) return new Response(options.results ?? "");

    return undefined;
  });
}

const SUCCEEDED = { name: "batches/b-1", metadata: { state: "JOB_STATE_SUCCEEDED" }, response: { responsesFile: "files/out-1" } };

function imageLine(jobId: string, usage = { promptTokenCount: 10, candidatesTokenCount: 1120 }) {
  return JSON.stringify({
    key: jobId,
    response: {
      candidates: [{ content: { parts: [{ text: "Evo." }, { inlineData: { mimeType: "image/png", data: PNG_BASE64 } }] } }],
      usageMetadata: usage,
    },
  });
}

async function submit(t: TestConvex) {
  return t.action(internal.creaNightActions.submitNightBatches, {});
}

async function poll(t: TestConvex) {
  return t.action(internal.creaNightActions.pollNightBatches, {});
}

// ── testovi ────────────────────────────────────────────────────────────────────

describe("ponuda", () => {
  test("bez cena v2 noćna tura se odbija, ništa se ne naplaćuje", async () => {
    const { t, userId, asUser } = await world({ pricingV2: false });
    await expect(createNight(asUser)).rejects.toThrow(/NOCNA_TURA_NEDOSTUPNA/);
    expect(await balance(t, userId)).toBe(1000);
    expect(await t.run((ctx) => ctx.db.query("generationJobs").collect())).toHaveLength(0);
  });

  test("bez OPENAI_API_KEY GPT Image 2 nema noćnu turu i stanje to kaže; sa ključem posao ide na OpenAI", async () => {
    const { t, asUser } = await world({ models: ["gpt-image-2"] });
    const state = await asUser.query(api.studio.getStudioState, {});
    expect(state.nightProviders).toEqual({ google: true, openai: false });
    const params = { prompt: "plakat za kafić", quality: "low", size: "1024x1024", num_images: 3 };
    await expect(createNight(asUser, "gpt-image-2", params)).rejects.toThrow(/NOCNA_TURA_NEDOSTUPNA/);

    process.env.OPENAI_API_KEY = "sk-test";
    expect((await asUser.query(api.studio.getStudioState, {})).nightProviders.openai).toBe(true);
    const jobId = await createNight(asUser, "gpt-image-2", params);
    const row = await job(t, jobId);
    expect(row).toMatchObject({ status: "queued", provider: "openai", deliveryMode: "night" });
    // Uvek jedna slika: pola fal cene za low/1024² ($0,006) × 173 = 0,519 → 1 kr.
    expect(JSON.parse(row.params).num_images).toBe(1);
    expect(row.creditCost).toBe(1);
  });

  test("bez Google ključa ni Nano Banana nema noćnu turu", async () => {
    const { asUser } = await world();
    delete process.env.GOOGLE_AI_API_KEY;
    await expect(createNight(asUser)).rejects.toThrow(/NOCNA_TURA_NEDOSTUPNA/);
  });
});

describe("ceo put", () => {
  test("rezervacija → batch → rezultat → poravnanje + jutarnje iznenađenje", async () => {
    const { t, userId, asUser } = await world();

    // 1. Rezervacija po noćnoj ceni; nema dnevne predaje.
    const jobId = await createNight(asUser);
    const reserved = await job(t, jobId);
    expect(reserved).toMatchObject({
      status: "queued",
      deliveryMode: "night",
      provider: "google",
      creditCost: 7,
      creditFactor: 173,
    });
    expect(reserved.estimatedCostUsd).toBeCloseTo(0.035, 9);
    expect(await balance(t, userId)).toBe(1000 - 7);
    expect((await scheduled(t)).some((fn) => fn.name.includes("submitJob"))).toBe(false);

    // 2. Cron predaje: JSONL u File API, batch nad njim.
    const calls = gemini();
    expect(await submit(t)).toEqual({ batches: 1 });
    const [batch] = await batches(t);
    expect(batch).toMatchObject({
      state: "submitted",
      provider: "google",
      providerModel: "gemini-3.1-flash-image",
      providerBatchId: "batches/b-1",
      inputFileName: "files/in-1",
      requestCount: 1,
    });
    expect(batch.deadlineAt).toBe(reserved.createdAt + NIGHT_JOB_DEADLINE_MS);
    expect((await job(t, jobId)).batchId).toBe(batch._id);
    const start = calls.find((call) => call.url === `${BASE}/upload/v1beta/files`);
    expect(start?.headers["x-goog-api-key"]).toBe(GOOGLE_KEY);
    expect(start?.headers["X-Goog-Upload-Command"]).toBe("start");
    const upload = calls.find((call) => call.url === UPLOAD_URL);
    const jsonl = await (upload?.body as Blob).text();
    const line = JSON.parse(jsonl.trim());
    expect(line.key).toBe(jobId);
    expect(line.request.generationConfig.imageConfig).toEqual({ aspectRatio: "1:1", imageSize: "1K" });
    const create = calls.find((call) => call.url.endsWith(":batchGenerateContent"));
    expect(create?.url).toBe(`${BASE}/v1beta/models/gemini-3.1-flash-image:batchGenerateContent`);
    expect(JSON.parse(String(create?.body))).toEqual({
      batch: { display_name: `crea-${batch._id}`, input_config: { file_name: "files/in-1" } },
    });

    // Dok Google radi, posao čeka; prolaz samo beleži proveru.
    gemini();
    await poll(t);
    expect((await job(t, jobId)).status).toBe("queued");
    expect((await batches(t))[0].lastPolledAt).toBe(NOON);

    // 3. Rezultat: slika u storage, posao `done`, stvaran trošak po batch tarifi.
    gemini({ status: SUCCEEDED, results: `${imageLine(jobId)}\n` });
    await poll(t);
    const done = await job(t, jobId);
    expect(done.status).toBe("done");
    expect(done.outputStorageId).toBeDefined();
    expect(done.expiresAt).toBeDefined();
    const actual = ((10 * 0.5 + 1120 * 60) / 1e6) * 0.5;
    expect(done.actualCostUsd).toBeCloseTo(actual, 12);
    expect((await batches(t))[0].state).toBe("ingested");

    // 4. Poravnanje po SVOM faktoru (173): ceil(0,0336 × 173) = 6 kr, 1 kr nazad.
    expect((await scheduled(t)).some((fn) => fn.name.includes("settleJobCredits"))).toBe(true);
    await t.mutation(internal.studio.settleJobCredits, { jobId });
    const settled = await job(t, jobId);
    expect(settled.settledAt).toBeDefined();
    expect(settled.settledCostUsd).toBeCloseTo(actual, 12);
    expect(await balance(t, userId)).toBe(1000 - Math.ceil(actual * 173));

    // 5. Jutarnje iznenađenje: obaveštenje sa brojem radova i push odmah (podne).
    const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ kind: NIGHT_NOTIFICATION_KIND, count: 1, title: "Noćna tura je gotova" });
    expect(notifications[0].body).toBe("Stigao je 1 rad. Otvori Creu i pogledaj.");
    const push = (await scheduled(t)).find((fn) => fn.name.includes("sendMorningPush"));
    expect(push?.scheduledTime).toBe(NOON);
    expect(await asUser.query(api.creaNight.getMorningArrivals, {})).toEqual({ count: 1 });

    // 6. Idempotencija: isti rezultat drugi put ne radi ništa.
    const again = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    expect(
      await t.mutation(internal.creaNight.completeNightJob, {
        jobId,
        batchId: batch._id,
        storageId: again,
        mimeType: "image/png",
        byteSize: 1,
      }),
    ).toBe(false);
    expect((await job(t, jobId)).outputStorageId).toBe(done.outputStorageId);
    expect(await t.mutation(internal.creaNight.finishBatchIngest, { batchId: batch._id })).toBe(0);
    gemini({ status: SUCCEEDED, results: `${imageLine(jobId)}\n` });
    expect(await poll(t)).toEqual({ stale: 0, polled: 0 });
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toHaveLength(1);
  });

  test("izmena okačene slike ide u batch kao ugrađena slika", async () => {
    const { t, userId, asUser } = await world();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await t.run((ctx) =>
      ctx.db.insert("studioUploads", { userId, storageId, slot: "image", bytes: 3, mimeType: "image/png", createdAt: NOON }),
    );
    const jobId = await asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "dodaj šešir", resolution: "1K", aspect_ratio: "1:1" }),
      inputMode: "image_multi",
      inputs: JSON.stringify({ image: [storageId] }),
      deliveryMode: "night",
    });
    expect(typeof jobId).toBe("string");

    const calls = gemini();
    await submit(t);
    const jsonl = await (calls.find((call) => call.url === UPLOAD_URL)?.body as Blob).text();
    expect(JSON.parse(jsonl.trim()).request.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: "image/png", data: "AQID" },
    });
  });
});

describe("refundi", () => {
  test("batch padne kod Google-a → svaki posao refundiran", async () => {
    const { t, userId, asUser } = await world();
    const first = await createNight(asUser);
    const second = await createNight(asUser, "nano-banana-2", { ...NB2_1K, prompt: "pas u parku" });
    gemini();
    await submit(t);
    expect(await balance(t, userId)).toBe(1000 - 14);

    gemini({ status: { metadata: { state: "JOB_STATE_FAILED" }, error: { message: "interna greška" } } });
    await poll(t);
    for (const jobId of [first, second]) {
      const row = await job(t, jobId);
      expect(row.status).toBe("refunded");
      expect(row.error).toContain("NOCNA_TURA_PALA");
    }
    expect(await balance(t, userId)).toBe(1000);
    expect((await batches(t))[0].state).toBe("failed");
    // Ništa nije stiglo - nema ni jutarnjeg obaveštenja.
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toHaveLength(0);
  });

  test("red sa greškom refundira samo svoj posao, posao bez reda ide na refund na kraju", async () => {
    const { t, userId, asUser } = await world();
    const ok = await createNight(asUser);
    const blocked = await createNight(asUser, "nano-banana-2", { ...NB2_1K, prompt: "drugi" });
    const missing = await createNight(asUser, "nano-banana-2", { ...NB2_1K, prompt: "treći" });
    gemini();
    await submit(t);

    const results = [imageLine(ok), JSON.stringify({ key: blocked, error: { code: 400, message: "blokirano" } })].join("\n");
    gemini({ status: SUCCEEDED, results });
    await poll(t);

    expect((await job(t, ok)).status).toBe("done");
    expect((await job(t, blocked)).status).toBe("refunded");
    expect((await job(t, blocked)).error).toContain("blokirano");
    expect((await job(t, missing)).status).toBe("refunded");
    expect((await job(t, missing)).error).toBe(NIGHT_ERRORS.missing);
    expect(await balance(t, userId)).toBe(1000 - 7);
    // Jedan rad je stigao: obaveštenje broji samo njega.
    const [notification] = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notification.count).toBe(1);
  });

  test("prolazna greška predaje (503) vraća poslove u red; trajna refundira", async () => {
    const { t, userId, asUser } = await world();
    const jobId = await createNight(asUser);

    gemini({ uploadStatus: 503 });
    await submit(t);
    let row = await job(t, jobId);
    expect(row.status).toBe("queued");
    expect(row.batchId).toBeUndefined();
    expect((await batches(t))[0].state).toBe("failed");

    gemini({ uploadStatus: 400 });
    await submit(t);
    row = await job(t, jobId);
    expect(row.status).toBe("refunded");
    expect(row.error).toContain("NOCNA_TURA_NIJE_PREDATA");
    expect(await balance(t, userId)).toBe(1000);
  });

  test("rok od 36 h: nepredat posao ide na refund; predat batch se otkazuje kod Google-a", async () => {
    const { t, userId, asUser } = await world();
    const neverSent = await createNight(asUser);
    await t.run((ctx) => ctx.db.patch(neverSent, { createdAt: NOON - NIGHT_JOB_DEADLINE_MS - 1 }));
    stubFetch(() => undefined);
    await submit(t);
    expect((await job(t, neverSent)).status).toBe("refunded");
    expect((await job(t, neverSent)).error).toBe(NIGHT_ERRORS.deadline);

    const sent = await createNight(asUser);
    gemini();
    await submit(t);
    vi.setSystemTime(NOON + NIGHT_JOB_DEADLINE_MS + 1);
    const calls = gemini();
    await poll(t);
    expect(calls.some((call) => call.url.endsWith("batches/b-1:cancel") && call.method === "POST")).toBe(true);
    expect((await job(t, sent)).status).toBe("refunded");
    expect((await batches(t)).find((row) => row.providerBatchId === "batches/b-1")?.state).toBe("expired");
    expect(await balance(t, userId)).toBe(1000);
  });

  test("K29-07: provajder ne odgovara posle roka → otkaz i refund; gotov batch bez rezultata posle roka + 6 h → refund", async () => {
    const { t, userId, asUser } = await world();
    const stuck = await createNight(asUser);
    gemini();
    await submit(t);
    // Uklonjen ključ / nepoznato ime batch-a: status stalno pada.
    vi.setSystemTime(NOON + NIGHT_JOB_DEADLINE_MS + 1);
    stubFetch((url, method) => (url.endsWith(":cancel") && method === "POST" ? json({}) : new Response("not found", { status: 404 })));
    await poll(t);
    expect((await job(t, stuck)).status).toBe("refunded");
    expect((await job(t, stuck)).error).toBe(NIGHT_ERRORS.deadline);
    vi.setSystemTime(NOON);

    const ready = await createNight(asUser);
    gemini();
    await submit(t);
    // Batch je gotov, ali preuzimanje rezultata uporno pada (403).
    stubFetch((url) => {
      if (url.endsWith("batches/b-1")) return json(SUCCEEDED);
      if (url.includes(":download")) return new Response("forbidden", { status: 403 });
      return undefined;
    });
    await poll(t);
    expect((await job(t, ready)).status).toBe("queued");
    vi.setSystemTime(NOON + NIGHT_JOB_DEADLINE_MS + NIGHT_INGEST_GRACE_MS + 1);
    await poll(t);
    expect((await job(t, ready)).status).toBe("refunded");
    expect(await balance(t, userId)).toBe(1000);
    vi.setSystemTime(NOON);
  });

  test("K29-07: obrisana ulazna slika obara noćni posao uz povraćaj (ne šalje se bez slike)", async () => {
    const { t, userId, asUser } = await world();
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })));
    await t.run((ctx) =>
      ctx.db.insert("studioUploads", { userId, storageId, slot: "image", bytes: 3, mimeType: "image/png", createdAt: NOON }),
    );
    const jobId = await asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "dodaj šešir", resolution: "1K", aspect_ratio: "1:1" }),
      inputMode: "image_multi",
      inputs: JSON.stringify({ image: [storageId] }),
      deliveryMode: "night",
    });
    await t.run((ctx) => ctx.storage.delete(storageId));
    gemini();
    await submit(t);
    const row = await job(t, jobId as Id<"generationJobs">);
    expect(row.status).toBe("refunded");
    expect(row.error).toBe(NIGHT_ERRORS.input);
    expect(await balance(t, userId)).toBe(1000);
  });

  test("batch zaglavljen u pripremi (akcija pukla) posle sat vremena ide na refund", async () => {
    const { t, userId, asUser } = await world();
    const jobId = await createNight(asUser);
    await t.mutation(internal.creaNight.claimNightJobs, {});
    vi.setSystemTime(NOON + 61 * 60 * 1000);
    stubFetch(() => undefined);
    expect(await poll(t)).toEqual({ stale: 1, polled: 0 });
    expect((await job(t, jobId)).status).toBe("refunded");
    expect((await job(t, jobId)).error).toBe(NIGHT_ERRORS.stale);
    expect(await balance(t, userId)).toBe(1000);
  });
});

describe("limiti i talas statusa", () => {
  test("noćni posao ne zauzima paralelni limit, ima svoj limit od 20, i ne briše se dok čeka", async () => {
    const { t, asUser } = await world();
    const first = await createNight(asUser);
    for (let index = 1; index < 20; index += 1) {
      await createNight(asUser, "nano-banana-2", { ...NB2_1K, prompt: `rad ${index}` });
    }
    await expect(createNight(asUser, "nano-banana-2", { ...NB2_1K, prompt: "dvadeset prvi" })).rejects.toThrow(
      /PREVISE_NOCNIH/,
    );
    // Dnevni posao i dalje prolazi (osoblje sme 3 u letu).
    const day = await asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify(NB2_1K),
      inputMode: "text",
    });
    expect((await job(t, day as Id<"generationJobs">)).status).toBe("reserved");

    await expect(asUser.mutation(api.studio.deleteJob, { jobId: first })).rejects.toThrow(/POSAO_U_TOKU/);
    const state = await asUser.query(api.studio.getStudioState, {});
    expect(state.activeJobs).toBe(1);
  });
});

describe("jutarnje iznenađenje", () => {
  async function finishOne(t: TestConvex, asUser: AsUser) {
    const jobId = await createNight(asUser);
    gemini();
    await submit(t);
    gemini({ status: SUCCEEDED, results: imageLine(jobId) });
    await poll(t);

    return jobId;
  }

  test("noću push čeka 08:00 po Beogradu; pročitano obaveštenje se više ne šalje", async () => {
    const { t, asUser } = await world();
    vi.setSystemTime(NIGHT);
    await finishOne(t, asUser);

    const push = (await scheduled(t)).find((fn) => fn.name.includes("sendMorningPush"));
    expect(push?.scheduledTime).toBe(Date.parse("2026-10-06T06:00:00Z"));
    const notificationId = (push?.args[0] as { notificationId: Id<"notifications"> }).notificationId;

    // Korisnik je otvorio radove pre 8 h: značka nestaje, push ne ide.
    expect(await asUser.mutation(api.creaNight.markMorningArrivalsSeen, {})).toBe(1);
    expect(await asUser.query(api.creaNight.getMorningArrivals, {})).toEqual({ count: 0 });
    await t.mutation(internal.creaNight.sendMorningPush, { notificationId });
    expect((await scheduled(t)).some((fn) => fn.name.includes("sendActivityPushBatch"))).toBe(false);
  });

  test("push ide kroz kategoriju crea, u radionicu Slika", async () => {
    const { t, userId, asUser } = await world();
    await finishOne(t, asUser);
    const [notification] = await t.run((ctx) => ctx.db.query("notifications").collect());
    await t.mutation(internal.creaNight.sendMorningPush, { notificationId: notification._id });

    const push = (await scheduled(t)).find((fn) => fn.name.includes("sendActivityPushBatch"));
    expect(push?.args[0]).toMatchObject({
      category: "crea",
      recipientIds: [userId],
      title: "Noćna tura je gotova",
      urlPath: "/app/studio?oblast=slika",
    });
  });

  test("sledeća tura broji samo svoje radove", async () => {
    const { t, asUser } = await world();
    await finishOne(t, asUser);
    vi.setSystemTime(NOON + 60_000);
    // Isti lažni batch id je u redu - stari batch je već `ingested`.
    const second = await createNight(asUser, "nano-banana-2", { ...NB2_1K, prompt: "nova tura" });
    const third = await createNight(asUser, "nano-banana-2", { ...NB2_1K, prompt: "nova tura 2" });
    gemini();
    await submit(t);
    gemini({ status: SUCCEEDED, results: [imageLine(second), imageLine(third)].join("\n") });
    await poll(t);

    const rows = await t.run((ctx) => ctx.db.query("notifications").order("desc").collect());
    expect(rows.map((row) => row.count)).toEqual([2, 1]);
    expect(rows[0].body).toBe("Stigla su 2 rada. Otvori Creu i pogledaj.");
    expect(await asUser.query(api.creaNight.getMorningArrivals, {})).toEqual({ count: 3 });
  });

  test("nepovezan korisnik ne vidi tuđa obaveštenja; gost dobija nulu", async () => {
    const { t, asUser } = await world();
    await finishOne(t, asUser);
    const other = await seedUser(t, "drugi@example.com");
    expect(await other.asUser.query(api.creaNight.getMorningArrivals, {})).toEqual({ count: 0 });
    expect(await t.query(api.creaNight.getMorningArrivals, {})).toEqual({ count: 0 });
  });
});
