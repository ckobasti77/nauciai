/// <reference types="vite/client" />

/**
 * Gemini govor (Crea K22, A2): srpski TTS kroz Interactions API. Telo zahteva po
 * zvaničnom primeru, WAV izlaz u storage, stvaran trošak iz tokena, refund kad
 * odgovor nema zvuk. Mreža je uvek lažna - dev ima pravi Google ključ.
 */

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { computeCredits } from "../studioPricing";
import { buildGoogleSpeechRequest, pcm16Wav, speechOutput, toBase64 } from "./googleCore";
import { GEMINI_TTS, GEMINI_TTS_DEFAULT_VOICE } from "./googleAudioModels";

const modules = import.meta.glob("/convex/**/*.ts");
type T = TestConvex<typeof schema>;

const previousKey = process.env.GOOGLE_AI_API_KEY;
beforeEach(() => {
  process.env.GOOGLE_AI_API_KEY = "test-google-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (previousKey === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = previousKey;
});

const PCM = new Uint8Array([0x10, 0x00, 0xf0, 0xff, 0x20, 0x00, 0xe0, 0xff]);
const WAV = pcm16Wav(PCM, 24000);

async function settle(t: T) {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function seedSpeechJob(t: T, params: Record<string, unknown>) {
  await t.run((ctx) =>
    ctx.db.insert("models", {
      slug: GEMINI_TTS.slug,
      provider: GEMINI_TTS.provider,
      kind: GEMINI_TTS.kind,
      family: GEMINI_TTS.family,
      labelSr: GEMINI_TTS.labelSr,
      labelEn: GEMINI_TTS.labelEn,
      taglineSr: GEMINI_TTS.taglineSr,
      taglineEn: GEMINI_TTS.taglineEn,
      descriptionSr: GEMINI_TTS.descriptionSr,
      descriptionEn: GEMINI_TTS.descriptionEn,
      endpoints: JSON.stringify(GEMINI_TTS.endpoints),
      inputModes: JSON.stringify(GEMINI_TTS.inputModes),
      inputSpec: JSON.stringify(GEMINI_TTS.inputSpec),
      paramSpec: JSON.stringify(GEMINI_TTS.paramSpec),
      priceRule: JSON.stringify(GEMINI_TTS.priceRule),
      capabilities: JSON.stringify(GEMINI_TTS.capabilities),
      isEnabled: true,
      sortOrder: GEMINI_TTS.sortOrder,
      updatedAt: Date.now(),
    }),
  );
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "glas@example.com", name: "Glas" }));
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: GEMINI_TTS.slug,
      kind: "audio",
      provider: "google",
      params: JSON.stringify(params),
      promptHash: "0123456789abcdef",
      status: "reserved" as const,
      creditCost: 5,
      inputMode: "text",
      createdAt: Date.now(),
    }),
  );
  await t.mutation(internal.credits.grantCredits, { userId, amount: 100, source: "admin_grant", idempotencyKey: { field: "stripeSessionId", value: `seed-${jobId}` } });
  await t.mutation(internal.credits.spendCredits, { userId, amount: 5, jobId });
  return { userId, jobId };
}

function stubInteractions(reply: (body: Record<string, unknown>) => unknown) {
  const bodies: Array<Record<string, unknown>> = [];
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init: RequestInit = {}) => {
      const url = String(input);
      urls.push(url);
      const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      bodies.push(body);
      return new Response(JSON.stringify(reply(body)), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch,
  );
  return { bodies, urls };
}

const job = (t: T, jobId: Id<"generationJobs">) => t.run((ctx) => ctx.db.get(jobId));

test("telo zahteva: tekst kao user_input, stil kao speech_metadata, glas u speech_config", () => {
  expect(buildGoogleSpeechRequest("gemini-3.8-flash-tts", { text: " Zdravo <laugh> ", voice: "Kore", style: "cheerful" }, GEMINI_TTS_DEFAULT_VOICE)).toEqual({
    model: "gemini-3.8-flash-tts",
    input: [{ type: "user_input", content: [{ type: "text", text: "Zdravo <laugh>", annotations: [{ type: "speech_metadata", style: "cheerful" }] }] }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: "Kore" }] },
  });
  // Bez stila nema napomene; bez glasa ide podrazumevani.
  expect(buildGoogleSpeechRequest("m", { text: "Ćao" }, GEMINI_TTS_DEFAULT_VOICE)).toMatchObject({
    input: [{ content: [{ type: "text", text: "Ćao" }] }],
    generation_config: { speech_config: [{ voice: "Sulafat" }] },
  });
  expect(() => buildGoogleSpeechRequest("m", { text: "   " }, "Kore")).toThrow(/NEPOTPUN_ULAZ/);
});

test("izlaz: WAV ostaje WAV, sirov PCM (audio/l16) dobija WAV zaglavlje sa svojom frekvencijom", () => {
  expect(speechOutput(WAV, "audio/mpeg")).toEqual({ bytes: WAV, mimeType: "audio/wav" });
  const wrapped = speechOutput(PCM, "audio/L16;codec=pcm;rate=16000");
  expect(wrapped.mimeType).toBe("audio/wav");
  expect(wrapped.bytes.length).toBe(44 + PCM.length);
  expect(new DataView(wrapped.bytes.buffer).getUint32(24, true)).toBe(16000);
  expect(String.fromCharCode(...wrapped.bytes.subarray(0, 4))).toBe("RIFF");
  expect(speechOutput(PCM, "audio/ogg")).toEqual({ bytes: PCM, mimeType: "audio/ogg" });
});

test("cena: 5 kr na 1 000 znakova (ElevenLabs 22), najmanje 1 kr, najviše 2 000 znakova po poslu", () => {
  expect(computeCredits(GEMINI_TTS.priceRule, { char_count: 1000 }, "text")).toBe(5);
  expect(computeCredits(GEMINI_TTS.priceRule, { char_count: 2000 }, "text")).toBe(9);
  expect(computeCredits(GEMINI_TTS.priceRule, { char_count: 12 }, "text")).toBe(1);
  expect(GEMINI_TTS.capabilities.maxChars).toBe(2000);
});

test("srpski govor: posao ide reserved → done, WAV u storage-u, stvaran trošak iz tokena", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedSpeechJob(t, { text: "Dobro došli u našu pekaru! <laugh>", voice: "Achird", style: "warm and friendly", char_count: 34 });
  const { bodies, urls } = stubInteractions(() => ({
    id: "int-tts-1",
    status: "completed",
    steps: [
      { type: "user_input", content: [{ type: "text", text: "Dobro došli" }] },
      { type: "model_output", content: [{ type: "audio", mime_type: "audio/wav", data: toBase64(WAV) }] },
    ],
    usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 75 },
  }));

  await t.action(internal.studioActions.submitJob, { jobId });
  await settle(t);

  expect(urls).toEqual(["https://generativelanguage.googleapis.com/v1beta/interactions"]);
  expect(bodies[0]).toMatchObject({
    model: "gemini-3.8-flash-tts",
    input: [{ type: "user_input", content: [{ text: "Dobro došli u našu pekaru! <laugh>", annotations: [{ style: "warm and friendly" }] }] }],
    generation_config: { speech_config: [{ voice: "Achird" }] },
  });
  const done = await job(t, jobId);
  expect(done?.status).toBe("done");
  expect(done?.outputStorageId).toBeDefined();
  const stored = await t.run(async (ctx) => {
    const blob = await ctx.storage.get(done!.outputStorageId!);
    return blob ? { type: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) } : null;
  });
  expect(stored?.type).toBe("audio/wav");
  expect(stored?.bytes).toEqual(Array.from(WAV));
  expect(done?.providerRequestId).toBe("interactions/int-tts-1");
  // Tarifa reda: ulaz $0,50/M, izlaz $9/M.
  expect(done?.actualCostUsd).toBeCloseTo((40 * 0.5 + 75 * 9) / 1_000_000, 10);
});

test("odgovor bez zvuka = refund sa razlogom (krediti vraćeni)", async () => {
  const t = convexTest(schema, modules);
  const { jobId } = await seedSpeechJob(t, { text: "Zdravo", voice: "Kore", char_count: 6 });
  stubInteractions(() => ({ id: "int-x", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "Ne mogu." }] }] }));

  await t.action(internal.studioActions.submitJob, { jobId });
  await settle(t);

  const failed = await job(t, jobId);
  expect(failed?.status).toBe("refunded");
  expect(failed?.error).toMatch(/bez zvuka/);
});
