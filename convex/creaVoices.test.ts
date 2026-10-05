/// <reference types="vite/client" />

/**
 * Glasovi Cree (K22): omiljeni i podešavanja (A3), keš uzoraka pri prvom
 * slušanju (A3), podkast iz lekcije (A6) i kapija za kloniranje sopstvenog glasa
 * (A7, O5): bez proverenog izgovorenog pristanka kloniranje NIKAD ne prolazi.
 * Mreža je uvek lažna - dev ima pravi Google ključ.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { consentCodeWords } from "../lib/crea-consent";
import { VOICE_SAMPLE_VERSION } from "../lib/crea-voices";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { VOICE_FAVORITES_MAX, VOICE_PRESETS_MAX, VOICE_SAMPLE_RETRY_MS } from "./creaVoicesCore";
import { pcm16Wav, toBase64 } from "./providers/googleCore";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

const previous = { google: process.env.GOOGLE_AI_API_KEY, fal: process.env.FAL_KEY };

beforeEach(() => {
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.FAL_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (previous.google === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = previous.google;
  if (previous.fal === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = previous.fal;
});

async function seedUser(t: TestConvex, email = "vesna@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Vesna Glas",
      username: email.split("@")[0],
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Lažan Gemini: transkript pristanka (generateContent) ili zvuk uzorka (interactions). */
function stubGoogle(opts: { transcript?: string; audioCalls?: { count: number } }) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith(":generateContent")) {
        return json({
          candidates: [{ content: { parts: [{ text: opts.transcript ?? "" }] } }],
          usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 30 },
        });
      }
      if (url.endsWith("/interactions")) {
        if (opts.audioCalls) opts.audioCalls.count += 1;
        return json({
          id: "int-sample",
          steps: [{ type: "model_output", content: [{ type: "audio", mime_type: "audio/wav", data: toBase64(pcm16Wav(new Uint8Array(8), 24000)) }] }],
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 150 },
        });
      }
      throw new Error(`test: nepredviđen fetch ${url}`);
    }) as unknown as typeof fetch,
  );
  return calls;
}

describe("omiljeni i sačuvana podešavanja (A3)", () => {
  test("omiljeni se pale i gase; nepoznat glas se odbija; tuđi omiljeni se ne vide", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");

    expect(await asUser.mutation(api.creaVoices.toggleVoiceFavorite, { engine: "gemini", voiceId: "Kore" })).toEqual({ ok: true, favorite: true });
    expect(await asUser.mutation(api.creaVoices.toggleVoiceFavorite, { engine: "eleven", voiceId: "George" })).toEqual({ ok: true, favorite: true });
    expect(await asUser.mutation(api.creaVoices.toggleVoiceFavorite, { engine: "gemini", voiceId: "Nepostojeci" })).toEqual({ ok: false, reason: "NEPOZNAT_GLAS" });
    expect(await asUser.mutation(api.creaVoices.toggleVoiceFavorite, { engine: "openai", voiceId: "alloy" })).toEqual({ ok: false, reason: "NEPOZNAT_GLAS" });
    expect((await asUser.query(api.creaVoices.listMyVoices, {})).favorites.sort()).toEqual(["eleven:George", "gemini:Kore"]);
    expect(await asUser.mutation(api.creaVoices.toggleVoiceFavorite, { engine: "gemini", voiceId: "Kore" })).toEqual({ ok: true, favorite: false });
    expect((await asUser.query(api.creaVoices.listMyVoices, {})).favorites).toEqual(["eleven:George"]);
    expect((await other.asUser.query(api.creaVoices.listMyVoices, {})).favorites).toEqual([]);
    await expect(t.query(api.creaVoices.listMyVoices, {})).rejects.toThrow();
  });

  test("granica omiljenih", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < VOICE_FAVORITES_MAX; index++) await ctx.db.insert("creaVoiceFavorites", { userId, engine: "gemini", voiceId: `X${index}`, createdAt: 1 });
    });
    expect(await asUser.mutation(api.creaVoices.toggleVoiceFavorite, { engine: "gemini", voiceId: "Kore" })).toEqual({ ok: false, reason: "LIMIT" });
  });

  test("podešavanje se čuva očišćeno, briše ga samo vlasnik, granica 50", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const saved = await asUser.mutation(api.creaVoices.saveVoicePreset, {
      name: "  Pekara   reklama ",
      engine: "gemini",
      voiceId: "Sulafat",
      settings: JSON.stringify({ mood: 1, speed: 1.13, pitch: 5, describe: "toplo", hack: "x" }),
    });
    expect(saved.ok).toBe(true);
    const { presets } = await asUser.query(api.creaVoices.listMyVoices, {});
    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({ name: "Pekara reklama", engine: "gemini", voiceId: "Sulafat" });
    expect(JSON.parse(presets[0]!.settings)).toEqual({ mood: 1, speed: 1.1, pitch: 1, describe: "toplo" });

    expect(await asUser.mutation(api.creaVoices.saveVoicePreset, { name: "   ", engine: "gemini", voiceId: "Kore", settings: "{}" })).toEqual({ ok: false, reason: "PRAZNO_IME" });
    expect(await asUser.mutation(api.creaVoices.saveVoicePreset, { name: "x", engine: "gemini", voiceId: "Aria", settings: "{}" })).toEqual({ ok: false, reason: "NEPOZNAT_GLAS" });

    await other.asUser.mutation(api.creaVoices.deleteVoicePreset, { presetId: presets[0]!.id });
    expect((await asUser.query(api.creaVoices.listMyVoices, {})).presets).toHaveLength(1);
    await asUser.mutation(api.creaVoices.deleteVoicePreset, { presetId: presets[0]!.id });
    expect((await asUser.query(api.creaVoices.listMyVoices, {})).presets).toHaveLength(0);

    await t.run(async (ctx) => {
      for (let index = 0; index < VOICE_PRESETS_MAX; index++) await ctx.db.insert("creaVoicePresets", { userId, name: `p${index}`, engine: "gemini", voiceId: "Kore", settings: "{}", createdAt: index });
    });
    expect(await asUser.mutation(api.creaVoices.saveVoicePreset, { name: "višak", engine: "gemini", voiceId: "Kore", settings: "{}" })).toEqual({ ok: false, reason: "LIMIT" });
  });
});

describe("uzorci glasova (A3): pri prvom slušanju, jednom za sve, 0 kr", () => {
  test("bez ključa: DEMO, bez mreže i bez reda u bazi", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const calls = stubGoogle({});
    expect(await asUser.action(api.creaVoices.requestVoiceSample, { engine: "gemini", voiceId: "Kore" })).toEqual({ ok: false, reason: "DEMO" });
    expect(await asUser.action(api.creaVoices.requestVoiceSample, { engine: "eleven", voiceId: "Aria" })).toEqual({ ok: false, reason: "DEMO" });
    expect(await asUser.action(api.creaVoices.requestVoiceSample, { engine: "gemini", voiceId: "Nepostojeci" })).toEqual({ ok: false, reason: "NEPOZNAT_GLAS" });
    expect(calls).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("creaVoiceSamples").collect())).toEqual([]);
  });

  test("prvo slušanje pravi uzorak (WAV, naš trošak), drugi korisnik dobija isti bez mreže", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-key";
    const t = makeT();
    const first = await seedUser(t);
    const second = await seedUser(t, "drugi@example.com");
    const audioCalls = { count: 0 };
    stubGoogle({ audioCalls });

    const reply = await first.asUser.action(api.creaVoices.requestVoiceSample, { engine: "gemini", voiceId: "Kore" });
    expect(reply.ok).toBe(true);
    const again = await second.asUser.action(api.creaVoices.requestVoiceSample, { engine: "gemini", voiceId: "Kore" });
    expect(again.ok).toBe(true);
    expect(audioCalls.count).toBe(1);

    const rows = await t.run((ctx) => ctx.db.query("creaVoiceSamples").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ engine: "gemini", voiceId: "Kore", version: VOICE_SAMPLE_VERSION, status: "ready" });
    expect(rows[0]!.costUsd).toBeCloseTo((20 * 0.5 + 150 * 9) / 1_000_000, 10);
    const samples = await second.asUser.query(api.creaVoices.voiceSamples, { engine: "gemini" });
    expect(Object.keys(samples)).toEqual(["Kore"]);
    // Korisnik nije platio ništa.
    expect(await t.run((ctx) => ctx.db.query("creditTransactions").collect())).toEqual([]);
  });

  test("uzorak u izradi se čeka; neuspeh se ne ponavlja 10 minuta", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-key";
    const t = makeT();
    const { asUser } = await seedUser(t);
    await t.run((ctx) => ctx.db.insert("creaVoiceSamples", { engine: "gemini", voiceId: "Puck", version: VOICE_SAMPLE_VERSION, status: "pending", attemptedAt: Date.now() }));
    await t.run((ctx) => ctx.db.insert("creaVoiceSamples", { engine: "gemini", voiceId: "Leda", version: VOICE_SAMPLE_VERSION, status: "failed", attemptedAt: Date.now() - 60_000 }));
    await t.run((ctx) =>
      ctx.db.insert("creaVoiceSamples", { engine: "gemini", voiceId: "Orus", version: VOICE_SAMPLE_VERSION, status: "failed", attemptedAt: Date.now() - VOICE_SAMPLE_RETRY_MS - 1 }),
    );
    const audioCalls = { count: 0 };
    stubGoogle({ audioCalls });
    expect(await asUser.action(api.creaVoices.requestVoiceSample, { engine: "gemini", voiceId: "Puck" })).toEqual({ ok: false, reason: "U_TOKU" });
    expect(await asUser.action(api.creaVoices.requestVoiceSample, { engine: "gemini", voiceId: "Leda" })).toEqual({ ok: false, reason: "GRESKA" });
    expect((await asUser.action(api.creaVoices.requestVoiceSample, { engine: "gemini", voiceId: "Orus" })).ok).toBe(true);
    expect(audioCalls.count).toBe(1);
  });
});

describe("podkast iz lekcije (A6)", () => {
  test("bez ključa DEMO razgovor dva voditelja; sa ključem LLM, trošak je naš (0 kredita)", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const lesson = "Veštačka inteligencija uči iz primera. Što više dobrih primera, to bolji rezultat. Zato je važno šta joj dajemo.";
    const demo = await asUser.action(api.creaLlm.writePodcast, { text: lesson, minutes: 1, hosts: ["Ana", "Marko"], locale: "sr" });
    expect(demo.ok && demo.demo).toBe(true);
    if (!demo.ok) throw new Error("DEMO");
    expect(demo.lines.length).toBeGreaterThanOrEqual(4);
    expect(new Set(demo.lines.map((line) => line.host))).toEqual(new Set([0, 1]));

    process.env.GOOGLE_AI_API_KEY = "test-key";
    const script = {
      title: "AI uči iz primera",
      lines: [
        { host: 1, text: "Zdravo, ja sam Ana!" },
        { host: 2, text: "A ja Marko. Kako AI uči?" },
        { host: 1, text: "Iz primera." },
        { host: 2, text: "Hvala, vidimo se!" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ candidates: [{ content: { parts: [{ text: JSON.stringify(script) }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 400 } })) as unknown as typeof fetch,
    );
    const real = await asUser.action(api.creaLlm.writePodcast, { text: lesson, minutes: 2, hosts: ["Ana", "Marko"], locale: "sr" });
    expect(real).toMatchObject({ ok: true, demo: false, title: "AI uči iz primera", lines: [{ host: 0 }, { host: 1 }, { host: 0 }, { host: 1 }] });
    const usage = await t.run((ctx) => ctx.db.query("creaLlmUsage").withIndex("by_user_day", (q) => q.eq("userId", userId)).collect());
    expect(usage[0]?.calls).toBe(2);
    expect(usage[0]?.costUsd).toBeGreaterThan(0);
    expect(await t.run((ctx) => ctx.db.query("creditTransactions").collect())).toEqual([]);
    expect(await asUser.action(api.creaLlm.writePodcast, { text: "   ", minutes: 1, hosts: [], locale: "sr" })).toEqual({ ok: false, reason: "PRAZNO" });
  });
});

describe("kloniranje glasa (A7, O5): bez pristanka ne prolazi", () => {
  const WAV_BYTES = pcm16Wav(new Uint8Array(3200), 16000);
  const audio = () => WAV_BYTES.buffer.slice(0) as ArrayBuffer;

  async function passedConsent(t: TestConvex, asUser: Awaited<ReturnType<typeof seedUser>>["asUser"]) {
    const started = await asUser.mutation(api.creaVoices.startVoiceConsent, { locale: "sr" });
    if (!started.ok) throw new Error("rečenica");
    process.env.GOOGLE_AI_API_KEY = "test-key";
    stubGoogle({ transcript: started.phrase });
    const check = await asUser.action(api.creaVoices.checkVoiceConsent, { consentId: started.consentId, audio: audio(), mimeType: "audio/wav" });
    expect(check).toMatchObject({ ok: true, passed: true });
    return started.consentId;
  }

  test("bez čekboksa, bez rečenice, sa neproverenom ili palom proverom - nikad", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const started = await asUser.mutation(api.creaVoices.startVoiceConsent, { locale: "sr" });
    if (!started.ok) throw new Error("rečenica");
    expect(consentCodeWords(started.phrase)).not.toBeNull();

    // Rečenica izdata, ali nije izgovorena i proverena.
    expect(await asUser.mutation(api.creaVoices.requestVoiceClone, { consentId: started.consentId, consent: true })).toEqual({ ok: false, reason: "PRISTANAK_NIJE_PROVEREN" });

    // Izgovoreno nešto drugo - provera pada, i kloniranje i dalje ne prolazi.
    process.env.GOOGLE_AI_API_KEY = "test-key";
    stubGoogle({ transcript: "Ne pristajem ni na šta." });
    expect(await asUser.action(api.creaVoices.checkVoiceConsent, { consentId: started.consentId, audio: audio(), mimeType: "audio/wav" })).toMatchObject({ ok: true, passed: false });
    expect(await asUser.mutation(api.creaVoices.requestVoiceClone, { consentId: started.consentId, consent: true })).toEqual({ ok: false, reason: "PRISTANAK_NIJE_PROVEREN" });
    // Pala rečenica se ne proverava ponovo.
    expect(await asUser.action(api.creaVoices.checkVoiceConsent, { consentId: started.consentId, audio: audio(), mimeType: "audio/wav" })).toEqual({ ok: false, reason: "NEMA_RECENICE" });

    // Proveren pristanak, ali čekboks „ovo je moj glas" nije štikliran.
    const passed = await passedConsent(t, asUser);
    expect(await asUser.mutation(api.creaVoices.requestVoiceClone, { consentId: passed, consent: false })).toEqual({ ok: false, reason: "BEZ_PRISTANKA" });
  });

  test("tuđ pristanak ne važi; istekao pristanak ne važi", async () => {
    const t = makeT();
    const owner = await seedUser(t);
    const thief = await seedUser(t, "lopov@example.com");
    const consentId = await passedConsent(t, owner.asUser);
    expect(await thief.asUser.mutation(api.creaVoices.requestVoiceClone, { consentId, consent: true })).toEqual({ ok: false, reason: "PRISTANAK_NIJE_PROVEREN" });
    // Lopov ne može ni da proveri tuđu rečenicu.
    const other = await owner.asUser.mutation(api.creaVoices.startVoiceConsent, { locale: "sr" });
    if (!other.ok) throw new Error("rečenica");
    expect(await thief.asUser.action(api.creaVoices.checkVoiceConsent, { consentId: other.consentId, audio: audio(), mimeType: "audio/wav" })).toEqual({ ok: false, reason: "NEMA_RECENICE" });

    await t.run((ctx) => ctx.db.patch(consentId, { checkedAt: Date.now() - 31 * 60 * 1000 }));
    expect(await owner.asUser.mutation(api.creaVoices.requestVoiceClone, { consentId, consent: true })).toEqual({ ok: false, reason: "PRISTANAK_ISTEKAO" });
  });

  test("sa proverenim sopstvenim pristankom kapija propušta - provajdera nema (K06), pa „uskoro\" bez naplate", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const consentId = await passedConsent(t, asUser);
    expect(await asUser.mutation(api.creaVoices.requestVoiceClone, { consentId, consent: true })).toEqual({ ok: false, reason: "USKORO" });
    expect(await t.run((ctx) => ctx.db.query("creditTransactions").collect())).toEqual([]);
    const row = await t.run((ctx) => ctx.db.get(consentId as Id<"creaVoiceConsents">));
    expect(row).toMatchObject({ status: "passed", score: 1 });
  });

  test("provera: bez ključa zatvoreno (ne DEMO), loš snimak odbijen, granica rečenica dnevno", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const started = await asUser.mutation(api.creaVoices.startVoiceConsent, { locale: "en" });
    if (!started.ok) throw new Error("rečenica");
    expect(started.phrase).toMatch(/^I agree that Crea may make a copy of my voice/);
    expect(await asUser.action(api.creaVoices.checkVoiceConsent, { consentId: started.consentId, audio: audio(), mimeType: "audio/wav" })).toEqual({ ok: false, reason: "NEMA_KLJUCA" });
    expect(await asUser.action(api.creaVoices.checkVoiceConsent, { consentId: started.consentId, audio: audio(), mimeType: "video/mp4" })).toEqual({ ok: false, reason: "NEISPRAVAN_SNIMAK" });
    expect(await asUser.action(api.creaVoices.checkVoiceConsent, { consentId: started.consentId, audio: new ArrayBuffer(0), mimeType: "audio/wav" })).toEqual({ ok: false, reason: "NEISPRAVAN_SNIMAK" });
    expect(await asUser.action(api.creaVoices.checkVoiceConsent, { consentId: started.consentId, audio: new ArrayBuffer(1_600_000), mimeType: "audio/wav" })).toEqual({ ok: false, reason: "NEISPRAVAN_SNIMAK" });

    await t.run(async (ctx) => {
      for (let index = 0; index < 9; index++) await ctx.db.insert("creaVoiceConsents", { userId, phrase: "x", status: "waiting", createdAt: Date.now() });
    });
    expect(await asUser.mutation(api.creaVoices.startVoiceConsent, { locale: "sr" })).toEqual({ ok: false, reason: "LIMIT" });
  });

  test("bez prijave nema ni rečenice ni kloniranja", async () => {
    const t = makeT();
    await expect(t.mutation(api.creaVoices.startVoiceConsent, { locale: "sr" })).rejects.toThrow();
    const { userId } = await seedUser(t);
    const consentId = await t.run((ctx) => ctx.db.insert("creaVoiceConsents", { userId, phrase: "x", status: "passed", createdAt: Date.now(), checkedAt: Date.now() }));
    await expect(t.mutation(api.creaVoices.requestVoiceClone, { consentId, consent: true })).rejects.toThrow();
    // Interna brava ne radi bez identiteta.
    await expect(t.mutation(internal.creaVoices.claimConsentCheck, { consentId })).rejects.toThrow();
  });
});
