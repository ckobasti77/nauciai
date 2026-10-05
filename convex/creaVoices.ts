import { v } from "convex/values";

import { checkConsentTranscript, consentPhrase, CONSENT_VALID_MS, CONSENT_WAIT_MS, pickConsentWords } from "../lib/crea-consent";
import { readGoogleConfig } from "../lib/google-video";
import { fromBase64, runGoogleInteraction } from "../lib/google-image";
import { VOICE_SAMPLE_TEXT, VOICE_SAMPLE_VERSION } from "../lib/crea-voices";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { bytesToBase64, geminiGenerateUrl, llmCostUsd, llmUsageFrom, responseText } from "./creaLlmCore";
import {
  buildConsentTranscriptRequest,
  cleanPresetName,
  CONSENT_AUDIO_MAX_BYTES,
  CONSENTS_PER_DAY,
  consentAudioType,
  ELEVEN_USD_PER_1K_CHARS,
  FAL_SYNC_TTS_URL,
  libraryVoice,
  presetSettingsJson,
  readFalAudioUrl,
  sampleDecision,
  VOICE_FAVORITES_MAX,
  VOICE_PRESETS_MAX,
} from "./creaVoicesCore";
import { requireUserId } from "./helpers";
import { buildGoogleSpeechRequest, speechOutput } from "./providers/googleCore";
import { GEMINI_TTS, GEMINI_TTS_DEFAULT_VOICE } from "./providers/googleAudioModels";
import { requireStudioAccess } from "./studio";
import { tokenCostUsd } from "./studioActualCostCore";
import { providerKeyPresent } from "./studioCore";

/**
 * Glasovi Cree (K22): omiljeni i sačuvana podešavanja (A3), keš uzoraka koji se
 * pravi pri prvom slušanju (A3, 0 kr korisniku) i kapija za kloniranje sopstvenog
 * glasa sa izgovorenim pristankom (A7, O5). Sam govor ide kroz `studio.createJob`.
 */

const localeValidator = v.union(v.literal("sr"), v.literal("en"));

// ── Omiljeni i sačuvana podešavanja (A3) ────────────────────────────────────

export const listMyVoices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const favorites = await ctx.db
      .query("creaVoiceFavorites")
      .withIndex("by_user_engine_voice", (q) => q.eq("userId", userId))
      .take(VOICE_FAVORITES_MAX);
    const presets = await ctx.db
      .query("creaVoicePresets")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(VOICE_PRESETS_MAX);
    return {
      favorites: favorites.map((row) => `${row.engine}:${row.voiceId}`),
      presets: presets.map((row) => ({ id: row._id, name: row.name, engine: row.engine, voiceId: row.voiceId, settings: row.settings })),
    };
  },
});

export const toggleVoiceFavorite = mutation({
  args: { engine: v.string(), voiceId: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; favorite: boolean } | { ok: false; reason: "NEPOZNAT_GLAS" | "LIMIT" }> => {
    const userId = await requireUserId(ctx);
    if (!libraryVoice(args.engine, args.voiceId)) return { ok: false, reason: "NEPOZNAT_GLAS" };
    const existing = await ctx.db
      .query("creaVoiceFavorites")
      .withIndex("by_user_engine_voice", (q) => q.eq("userId", userId).eq("engine", args.engine).eq("voiceId", args.voiceId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { ok: true, favorite: false };
    }
    const count = await ctx.db
      .query("creaVoiceFavorites")
      .withIndex("by_user_engine_voice", (q) => q.eq("userId", userId))
      .take(VOICE_FAVORITES_MAX);
    if (count.length >= VOICE_FAVORITES_MAX) return { ok: false, reason: "LIMIT" };
    await ctx.db.insert("creaVoiceFavorites", { userId, engine: args.engine, voiceId: args.voiceId, createdAt: Date.now() });
    return { ok: true, favorite: true };
  },
});

export const saveVoicePreset = mutation({
  args: { name: v.string(), engine: v.string(), voiceId: v.string(), settings: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; id: Id<"creaVoicePresets"> } | { ok: false; reason: "NEPOZNAT_GLAS" | "PRAZNO_IME" | "LIMIT" }> => {
    const userId = await requireUserId(ctx);
    if (!libraryVoice(args.engine, args.voiceId)) return { ok: false, reason: "NEPOZNAT_GLAS" };
    const name = cleanPresetName(args.name);
    if (!name) return { ok: false, reason: "PRAZNO_IME" };
    const existing = await ctx.db
      .query("creaVoicePresets")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .take(VOICE_PRESETS_MAX);
    if (existing.length >= VOICE_PRESETS_MAX) return { ok: false, reason: "LIMIT" };
    const id = await ctx.db.insert("creaVoicePresets", {
      userId,
      name,
      engine: args.engine,
      voiceId: args.voiceId,
      settings: presetSettingsJson(args.settings.slice(0, 2048)),
      createdAt: Date.now(),
    });
    return { ok: true, id };
  },
});

export const deleteVoicePreset = mutation({
  args: { presetId: v.id("creaVoicePresets") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const preset = await ctx.db.get(args.presetId);
    if (preset && preset.userId === userId) await ctx.db.delete(args.presetId);
    return null;
  },
});

// ── Uzorci glasova (A3): jedan za sve, pravi se pri prvom slušanju ──────────

/** Gotovi uzorci jednog motora (trenutna verzija teksta): `voiceId → url`. */
export const voiceSamples = query({
  args: { engine: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const rows = await ctx.db
      .query("creaVoiceSamples")
      .withIndex("by_engine_voice_version", (q) => q.eq("engine", args.engine))
      .take(200);
    const out: Record<string, string> = {};
    for (const row of rows) {
      if (row.version !== VOICE_SAMPLE_VERSION || row.status !== "ready" || !row.storageId) continue;
      const url = await ctx.storage.getUrl(row.storageId);
      if (url) out[row.voiceId] = url;
    }
    return out;
  },
});

/**
 * Brava pre mreže: gotov uzorak vraća adresu, tuđ u izradi „čekaj", inače upiše
 * `pending` (u istoj transakciji) i pusti JEDNOG pozivaoca da ga napravi.
 */
export const beginVoiceSample = internalMutation({
  args: { engine: v.string(), voiceId: v.string() },
  handler: async (ctx, args): Promise<{ state: "ready"; url: string } | { state: "pending" } | { state: "failed" } | { state: "go"; rowId: Id<"creaVoiceSamples"> }> => {
    await requireStudioAccess(ctx);
    const now = Date.now();
    const row = await ctx.db
      .query("creaVoiceSamples")
      .withIndex("by_engine_voice_version", (q) => q.eq("engine", args.engine).eq("voiceId", args.voiceId).eq("version", VOICE_SAMPLE_VERSION))
      .unique();
    const decision = sampleDecision(row, now);
    if (decision === "ready") {
      const url = row?.storageId ? await ctx.storage.getUrl(row.storageId) : null;
      if (url) return { state: "ready", url };
    } else if (decision === "pending") {
      return { state: "pending" };
    } else if (decision === "failed") {
      return { state: "failed" };
    }
    if (row) {
      await ctx.db.patch(row._id, { status: "pending", attemptedAt: now, error: undefined });
      return { state: "go", rowId: row._id };
    }
    const rowId = await ctx.db.insert("creaVoiceSamples", { engine: args.engine, voiceId: args.voiceId, version: VOICE_SAMPLE_VERSION, status: "pending", attemptedAt: now });
    return { state: "go", rowId };
  },
});

export const completeVoiceSample = internalMutation({
  args: { rowId: v.id("creaVoiceSamples"), storageId: v.id("_storage"), costUsd: v.number() },
  handler: async (ctx, args): Promise<string | null> => {
    const row = await ctx.db.get(args.rowId);
    if (!row || row.status !== "pending") {
      // Neko je u međuvremenu završio isti uzorak - drugi fajl ne treba.
      await ctx.storage.delete(args.storageId);
      return row?.storageId ? await ctx.storage.getUrl(row.storageId) : null;
    }
    await ctx.db.patch(args.rowId, { status: "ready", storageId: args.storageId, costUsd: args.costUsd, error: undefined });
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const failVoiceSample = internalMutation({
  args: { rowId: v.id("creaVoiceSamples"), error: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    if (row && row.status === "pending") await ctx.db.patch(args.rowId, { status: "failed", attemptedAt: Date.now(), error: args.error.slice(0, 300) });
    return null;
  },
});

export type VoiceSampleReply = { ok: true; url: string } | { ok: false; reason: "NEPOZNAT_GLAS" | "DEMO" | "U_TOKU" | "GRESKA" };

/** Uzorak glasa za slušanje u biblioteci. Korisnik ne plaća; bez ključa nema uzorka (DEMO). */
export const requestVoiceSample = action({
  args: { engine: v.string(), voiceId: v.string() },
  handler: async (ctx, args): Promise<VoiceSampleReply> => {
    const voice = libraryVoice(args.engine, args.voiceId);
    if (!voice) return { ok: false, reason: "NEPOZNAT_GLAS" };
    const provider = voice.engine === "gemini" ? "google" : "fal";
    if (!providerKeyPresent(provider, process.env)) return { ok: false, reason: "DEMO" };

    const begun = await ctx.runMutation(internal.creaVoices.beginVoiceSample, { engine: voice.engine, voiceId: voice.id });
    if (begun.state === "ready") return { ok: true, url: begun.url };
    if (begun.state === "pending") return { ok: false, reason: "U_TOKU" };
    if (begun.state === "failed") return { ok: false, reason: "GRESKA" };

    try {
      let blob: Blob;
      let costUsd: number;
      if (voice.engine === "gemini") {
        const result = await runGoogleInteraction({
          config: readGoogleConfig(process.env),
          body: buildGoogleSpeechRequest(GEMINI_TTS.endpoints.text!, { text: VOICE_SAMPLE_TEXT, voice: voice.id, style: "warm, natural and friendly" }, GEMINI_TTS_DEFAULT_VOICE),
        });
        if (!result.media?.data) throw new Error(result.error ?? "Google nije vratio zvuk.");
        const audio = speechOutput(fromBase64(result.media.data), result.media.mimeType);
        blob = new Blob([audio.bytes as BlobPart], { type: audio.mimeType });
        costUsd = (result.usage ? tokenCostUsd(result.usage, { output: 9, prompt: 0.5 }) : null) ?? 0;
      } else {
        const response = await fetch(FAL_SYNC_TTS_URL, {
          method: "POST",
          headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: VOICE_SAMPLE_TEXT, voice: voice.id }),
        });
        if (!response.ok) throw new Error(`fal ${response.status}`);
        const url = readFalAudioUrl(await response.json());
        if (!url) throw new Error("fal nije vratio zvuk.");
        const file = await fetch(url);
        if (!file.ok) throw new Error(`fal fajl ${file.status}`);
        blob = new Blob([await file.arrayBuffer()], { type: file.headers.get("content-type") ?? "audio/mpeg" });
        costUsd = (VOICE_SAMPLE_TEXT.length / 1000) * ELEVEN_USD_PER_1K_CHARS;
      }
      const storageId = await ctx.storage.store(blob);
      const url: string | null = await ctx.runMutation(internal.creaVoices.completeVoiceSample, { rowId: begun.rowId, storageId, costUsd });
      return url ? { ok: true, url } : { ok: false, reason: "GRESKA" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Uzorak glasa ${voice.engine}:${voice.id}: ${message}`);
      await ctx.runMutation(internal.creaVoices.failVoiceSample, { rowId: begun.rowId, error: message });
      return { ok: false, reason: "GRESKA" };
    }
  },
});

// ── Kloniranje sopstvenog glasa (A7, O5) ────────────────────────────────────

/** Rečenica pristanka sa dve nasumične reči (bira je server). */
export const startVoiceConsent = mutation({
  args: { locale: localeValidator },
  handler: async (ctx, args): Promise<{ ok: true; consentId: Id<"creaVoiceConsents">; phrase: string } | { ok: false; reason: "LIMIT" }> => {
    const { userId } = await requireStudioAccess(ctx);
    const now = Date.now();
    const recent = await ctx.db
      .query("creaVoiceConsents")
      .withIndex("by_user_created", (q) => q.eq("userId", userId).gt("createdAt", now - 24 * 60 * 60 * 1000))
      .take(CONSENTS_PER_DAY);
    if (recent.length >= CONSENTS_PER_DAY) return { ok: false, reason: "LIMIT" };
    const phrase = consentPhrase(args.locale, pickConsentWords(args.locale, Math.random));
    const consentId = await ctx.db.insert("creaVoiceConsents", { userId, phrase, status: "waiting", createdAt: now });
    return { ok: true, consentId, phrase };
  },
});

/** Sopstvena rečenica koja još čeka snimak (i nije istekla), ili `null`. */
export const claimConsentCheck = internalMutation({
  args: { consentId: v.id("creaVoiceConsents") },
  handler: async (ctx, args): Promise<{ phrase: string } | null> => {
    const { userId } = await requireStudioAccess(ctx);
    const consent = await ctx.db.get(args.consentId);
    if (!consent || consent.userId !== userId || consent.status !== "waiting") return null;
    if (Date.now() - consent.createdAt > CONSENT_WAIT_MS) return null;
    return { phrase: consent.phrase };
  },
});

export const finishConsentCheck = internalMutation({
  args: { consentId: v.id("creaVoiceConsents"), transcript: v.string(), passed: v.boolean(), score: v.number() },
  handler: async (ctx, args) => {
    const consent = await ctx.db.get(args.consentId);
    if (!consent || consent.status !== "waiting") return null;
    await ctx.db.patch(args.consentId, {
      status: args.passed ? "passed" : "failed",
      transcript: args.transcript.slice(0, 500),
      score: args.score,
      checkedAt: Date.now(),
    });
    return null;
  },
});

export type ConsentCheckReply =
  | { ok: true; passed: boolean; score: number; transcript: string }
  | { ok: false; reason: "NEISPRAVAN_SNIMAK" | "NEMA_RECENICE" | "NEMA_KLJUCA" | "LIMIT" | "GRESKA" };

/**
 * Provera izgovorenog pristanka: snimak (≤ 1,5 MB) ide jeftinom modelu na
 * doslovan transkript, transkript se poredi sa rečenicom (`lib/crea-consent.ts`).
 * Snimak se nigde ne čuva. Bez ključa provera NE prolazi (zatvoreno, ne DEMO).
 */
export const checkVoiceConsent = action({
  args: { consentId: v.id("creaVoiceConsents"), audio: v.bytes(), mimeType: v.string() },
  handler: async (ctx, args): Promise<ConsentCheckReply> => {
    const mimeType = consentAudioType(args.mimeType);
    if (!mimeType || args.audio.byteLength === 0 || args.audio.byteLength > CONSENT_AUDIO_MAX_BYTES) return { ok: false, reason: "NEISPRAVAN_SNIMAK" };
    const claim = await ctx.runMutation(internal.creaVoices.claimConsentCheck, { consentId: args.consentId });
    if (!claim) return { ok: false, reason: "NEMA_RECENICE" };
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return { ok: false, reason: "NEMA_KLJUCA" };
    const slot = await ctx.runMutation(internal.creaLlm.beginCall, {});
    if (!slot.ok) return { ok: false, reason: "LIMIT" };

    let raw: unknown;
    try {
      const response = await fetch(geminiGenerateUrl(), {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(buildConsentTranscriptRequest(bytesToBase64(new Uint8Array(args.audio)), mimeType)),
      });
      if (!response.ok) {
        console.warn(`Pristanak: Gemini je vratio ${response.status}.`);
        return { ok: false, reason: "GRESKA" };
      }
      raw = await response.json();
    } catch (error) {
      console.warn(`Pristanak: mreža - ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, reason: "GRESKA" };
    }
    const usage = llmUsageFrom(raw);
    await ctx.runMutation(internal.creaLlm.recordCall, { userId: slot.userId, day: slot.day, ...usage, costUsd: llmCostUsd(usage) });

    const transcript = (responseText(raw) ?? "").trim();
    const check = checkConsentTranscript(transcript, claim.phrase);
    await ctx.runMutation(internal.creaVoices.finishConsentCheck, { consentId: args.consentId, transcript, passed: check.passed, score: check.score });
    return { ok: true, passed: check.passed, score: check.score, transcript: transcript.slice(0, 500) };
  },
});

export type VoiceCloneReply = { ok: false; reason: "BEZ_PRISTANKA" | "PRISTANAK_NIJE_PROVEREN" | "PRISTANAK_ISTEKAO" | "USKORO" };

/**
 * Kapija za kloniranje: čekboks „ovo je moj glas" + SOPSTVEN pristanak koji je
 * server proverio u poslednjih 30 min. Bez toga nikad ne prolazi. Posle kapije bi
 * išao provajder - po planu K06 ga nema, pa je odgovor „uskoro" (ništa se ne
 * naplaćuje i ništa se ne šalje van).
 */
export const requestVoiceClone = mutation({
  args: { consentId: v.id("creaVoiceConsents"), consent: v.boolean() },
  handler: async (ctx, args): Promise<VoiceCloneReply> => {
    const { userId } = await requireStudioAccess(ctx);
    if (args.consent !== true) return { ok: false, reason: "BEZ_PRISTANKA" };
    const consent = await ctx.db.get(args.consentId);
    if (!consent || consent.userId !== userId || consent.status !== "passed" || consent.checkedAt === undefined) {
      return { ok: false, reason: "PRISTANAK_NIJE_PROVEREN" };
    }
    if (Date.now() - consent.checkedAt > CONSENT_VALID_MS) return { ok: false, reason: "PRISTANAK_ISTEKAO" };
    // Ovde ide provajder kad postoji (plan K06 §5.3, K06-13: danas ga nema).
    return { ok: false, reason: "USKORO" };
  },
});
