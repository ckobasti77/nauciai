/// <reference types="vite/client" />

/**
 * Zvuk II (Crea K23): novi redovi kataloga i njihovi zahtevi - Lyria (A11) kroz
 * Interactions API, jeftiniji efekti MMAudio (A13) i razdvajanje na trake
 * Demucs (A18) preko fal-a. Mreža je uvek lažna - dev ima pravi Google ključ.
 */

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { extraOutputKind, STEM_PARAM } from "../creaLayersCore";
import { extractOutputUrl, extractOutputUrls } from "../falWebhookCore";
import schema from "../schema";
import { computeCredits } from "../studioPricing";
import { MMAUDIO_SFX, MUSIC, SFX, STEM_KEYS, STEMS } from "./falAudioModels";
import { falInputFields, falMapOf, falParams } from "./falInputs";
import { buildLyriaRequest, toBase64 } from "./googleCore";
import { LYRIA_CLIP, LYRIA_SONG } from "./googleAudioModels";
import type { StudioModelSeed } from "./modelSeed";

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

function falBody(seed: StudioModelSeed, mode: string, params: Record<string, unknown>, urls: Record<string, string[]> = {}) {
  const map = falMapOf(seed.capabilities);
  return { ...falParams(params, map), ...falInputFields(mode, urls, map) };
}

describe("cene novih redova (v1 = USD × 216,25, naviše)", () => {
  test("Lyria: klip 9 kr, pesma 18 kr - jedna cena po generaciji (pricing, 2026-10-05)", () => {
    expect(computeCredits(LYRIA_CLIP.priceRule, {}, "text")).toBe(9);
    expect(computeCredits(LYRIA_SONG.priceRule, {}, "text")).toBe(18);
    expect(LYRIA_CLIP.endpoints.text).toBe("lyria-3-clip-preview");
    expect(LYRIA_SONG.endpoints.text).toBe("lyria-3.5");
    for (const seed of [LYRIA_CLIP, LYRIA_SONG]) expect(seed.capabilities).toMatchObject({ api: "interactions", mode: "sync", music: true });
  });

  test("MMAudio efekti su upola ElevenLabs-a i bez minimuma od 5 s", () => {
    expect(computeCredits(MMAUDIO_SFX.priceRule, { duration: 5 }, "text")).toBe(2);
    expect(computeCredits(SFX.priceRule, { duration: 5 }, "text")).toBe(3);
    expect(computeCredits(MMAUDIO_SFX.priceRule, { duration: 20 }, "text")).toBe(5);
    expect(computeCredits(SFX.priceRule, { duration: 20 }, "text")).toBe(9);
    expect(computeCredits(MMAUDIO_SFX.priceRule, { duration: 1 }, "text")).toBe(1);
    expect(MMAUDIO_SFX.paramSpec.find((control) => control.key === "duration")).toMatchObject({ min: 1, max: 30 });
  });

  test("trake: $0,0007/s = $0,042 po minutu okačenog snimka (meri server), najviše 10 min", () => {
    expect(computeCredits(STEMS.priceRule, { minutes: 1 }, "audio")).toBe(10);
    expect(computeCredits(STEMS.priceRule, { minutes: 3.5 }, "audio")).toBe(32);
    expect(STEMS.capabilities.quantity).toMatchObject({ from: "input_media_minutes", max: 10 });
  });
});

describe("zahtevi provajderu", () => {
  test("Lyria: `model` + `input` (tekst), bez `response_format` (MP3); prazan opis = greška pre mreže", () => {
    expect(buildLyriaRequest("lyria-3.5", { prompt: "  Pop, 100 BPM.\n\n[Verse]\nLa la  " })).toEqual({ model: "lyria-3.5", input: "Pop, 100 BPM.\n\n[Verse]\nLa la" });
    expect(() => buildLyriaRequest("lyria-3.5", { prompt: " " })).toThrow(/NEPOTPUN_ULAZ/);
  });

  test("Demucs: snimak kao `audio_url`, četiri trake, MP3; MMAudio: `duration` ide kakav jeste; muzika: minuti → ms", () => {
    expect(falBody(STEMS, "audio", { minutes: 2 }, { audio: ["https://x/a.wav"] })).toMatchObject({
      audio_url: "https://x/a.wav",
      model: "htdemucs",
      stems: ["vocals", "drums", "bass", "other"],
      output_format: "mp3",
    });
    expect(falBody(MMAUDIO_SFX, "text", { prompt: "door creak", duration: 3 })).toEqual({ prompt: "door creak", duration: 3 });
    expect(falBody(MUSIC, "text", { prompt: "pop", minutes: 2 })).toEqual({ prompt: "pop", music_length_ms: 120_000 });
  });

  test("izlaz razdvajanja: glas je izlaz posla, ostale trake redom kao deca (`traka`)", () => {
    const payload = {
      other: { url: "https://f/other.mp3" },
      bass: { url: "https://f/bass.mp3" },
      vocals: { url: "https://f/vocals.mp3" },
      drums: { url: "https://f/drums.mp3" },
    };
    expect(extractOutputUrl(payload)).toBe("https://f/vocals.mp3");
    expect(extractOutputUrls(payload)).toEqual(["https://f/vocals.mp3", "https://f/drums.mp3", "https://f/bass.mp3", "https://f/other.mp3"]);
    expect(STEM_KEYS).toEqual(["vocals", "drums", "bass", "other"]);
    expect(extractOutputUrls({ audio: { url: "https://f/a.mp3" } })).toEqual(["https://f/a.mp3"]);
    expect(extraOutputKind({ modelSlug: "stems", inputMode: "audio" })).toEqual({ derivation: "traka", param: STEM_PARAM });
    expect(extraOutputKind({ modelSlug: "nano-banana-2", inputMode: "text" }).derivation).toBe("varijacija");
  });
});

async function settle(t: T) {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function seedModel(t: T, seed: StudioModelSeed) {
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
      updatedAt: Date.now(),
    }),
  );
}

async function seedMusicJob(t: T, prompt: string): Promise<Id<"generationJobs">> {
  await seedModel(t, LYRIA_CLIP);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "muzika@example.com", name: "Muzika" }));
  const jobId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: LYRIA_CLIP.slug,
      kind: "audio",
      provider: "google",
      params: JSON.stringify({ prompt }),
      promptHash: "0123456789abcdef",
      status: "reserved" as const,
      creditCost: 9,
      inputMode: "text",
      createdAt: Date.now(),
    }),
  );
  await t.mutation(internal.credits.grantCredits, { userId, amount: 100, source: "admin_grant", idempotencyKey: { field: "stripeSessionId", value: `seed-${jobId}` } });
  await t.mutation(internal.credits.spendCredits, { userId, amount: 9, jobId });
  return jobId;
}

function stubInteractions(reply: unknown) {
  const bodies: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: unknown, init: RequestInit = {}) => {
      bodies.push(typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {});
      return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch,
  );
  return bodies;
}

describe("Lyria kroz isti sinhroni Google put", () => {
  const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

  test("posao ide reserved → done, MP3 u storage-u, tekst pesme iz odgovora se ne meša sa zvukom", async () => {
    const t = convexTest(schema, modules);
    const jobId = await seedMusicJob(t, "Lo-fi, 80 BPM. Instrumental only, no vocals.");
    const bodies = stubInteractions({
      id: "int-lyria-1",
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "[Intro] ..." }, { type: "audio", data: toBase64(MP3) }] }],
    });

    await t.action(internal.studioActions.submitJob, { jobId });
    await settle(t);

    expect(bodies[0]).toEqual({ model: "lyria-3-clip-preview", input: "Lo-fi, 80 BPM. Instrumental only, no vocals." });
    const done = await t.run((ctx) => ctx.db.get(jobId));
    expect(done?.status).toBe("done");
    const stored = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(done!.outputStorageId!);
      return blob ? { type: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) } : null;
    });
    expect(stored).toEqual({ type: "audio/mpeg", bytes: Array.from(MP3) });
  });

  test("odgovor bez zvuka = refund", async () => {
    const t = convexTest(schema, modules);
    const jobId = await seedMusicJob(t, "Pop");
    stubInteractions({ id: "int-x", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "Blocked." }] }] });
    await t.action(internal.studioActions.submitJob, { jobId });
    await settle(t);
    expect((await t.run((ctx) => ctx.db.get(jobId)))?.status).toBe("refunded");
  });
});
