import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { TTS } from "@/convex/providers/falAudioModels";
import { GEMINI_TTS, GEMINI_TTS_DEFAULT_VOICE, GEMINI_TTS_VOICES } from "@/convex/providers/googleAudioModels";

import {
  CREA_VOICES,
  DEFAULT_VOICE,
  filterVoices,
  narrationEngine,
  parseVoiceKey,
  readVoiceWish,
  suggestVoices,
  VOICE_ENGINE_LIST,
  VOICE_LANGUAGES,
  VOICE_TONES,
  voiceById,
  voiceKey,
  voicesOf,
} from "./crea-voices";

describe("motori (A2)", () => {
  test("svaki motor vozi red iz kataloga koji govori srpski, sa istom granicom znakova", () => {
    expect(VOICE_ENGINE_LIST.map((engine) => engine.id)).toEqual(["gemini", "eleven"]);
    for (const engine of VOICE_ENGINE_LIST) {
      const model = STUDIO_MODELS.find((entry) => entry.slug === engine.modelSlug);
      expect(model, engine.id).toBeDefined();
      expect(model?.kind).toBe("audio");
      expect(model?.capabilities.serbian, engine.id).toBe(true);
      expect(model?.capabilities.maxChars, engine.id).toBe(engine.maxChars);
      expect(engine.label.sr && engine.pitch.sr && engine.pitch.en).toBeTruthy();
    }
    expect(VOICE_ENGINE_LIST[0]?.modelSlug).toBe("gemini-tts");
  });
});

describe("biblioteka (A3)", () => {
  test("glasovi su tačno glasovi reda kataloga - Gemini 30, ElevenLabs 10", () => {
    expect(voicesOf("gemini").map((voice) => voice.id)).toEqual([...GEMINI_TTS_VOICES]);
    const voiceControl = TTS.paramSpec.find((control) => control.key === "voice");
    expect(voicesOf("eleven").map((voice) => voice.id)).toEqual(voiceControl?.options?.map((option) => option.value));
    const geminiControl = GEMINI_TTS.paramSpec.find((control) => control.key === "voice");
    expect(geminiControl?.options?.map((option) => option.value)).toEqual([...GEMINI_TTS_VOICES]);
    expect(DEFAULT_VOICE.gemini).toBe(GEMINI_TTS_DEFAULT_VOICE);
    expect(voiceById("eleven", DEFAULT_VOICE.eleven)).toBeDefined();
  });

  test("svaki glas ima pol, godine, bar jedan ton i osobinu na oba jezika", () => {
    for (const voice of CREA_VOICES) {
      expect(["zenski", "muski"]).toContain(voice.gender);
      expect(["mlad", "srednji", "zreo"]).toContain(voice.age);
      expect(voice.tones.length, voice.id).toBeGreaterThan(0);
      for (const tone of voice.tones) expect(VOICE_TONES).toContain(tone);
      expect(voice.trait.sr.trim() && voice.trait.en.trim(), voice.id).toBeTruthy();
    }
    // Pol po zvaničnom spisku (Chirp 3 HD): 14 ženskih i 16 muških Gemini glasova.
    expect(filterVoices(voicesOf("gemini"), { gender: "zenski" })).toHaveLength(14);
    expect(filterVoices(voicesOf("gemini"), { gender: "muski" })).toHaveLength(16);
  });

  test("filteri: motor, pol, godine, ton i samo omiljeni; srpski govore svi", () => {
    expect(filterVoices(CREA_VOICES, { language: "sr" })).toHaveLength(CREA_VOICES.length);
    for (const language of VOICE_LANGUAGES) expect(filterVoices(CREA_VOICES, { language }).length).toBe(CREA_VOICES.length);
    const warmWomen = filterVoices(CREA_VOICES, { gender: "zenski", tone: "topao" });
    expect(warmWomen.map((voice) => voice.id)).toEqual(["Sulafat"]);
    const youngElevenMen = filterVoices(CREA_VOICES, { engine: "eleven", gender: "muski", age: "mlad" });
    expect(youngElevenMen.map((voice) => voice.id)).toEqual(["Liam"]);
    const only = new Set(["gemini:Kore", "eleven:Aria"]);
    expect(filterVoices(CREA_VOICES, { only }).map(voiceKey)).toEqual(["gemini:Kore", "eleven:Aria"]);
    expect(filterVoices(CREA_VOICES, { engine: "gemini", only: new Set(["eleven:Aria"]) })).toEqual([]);
  });

  test("ključ glasa ide u oba smera; nepoznat ključ nije glas", () => {
    for (const voice of CREA_VOICES) expect(parseVoiceKey(voiceKey(voice))).toBe(voice);
    expect(parseVoiceKey("gemini:Nepostojeci")).toBeUndefined();
    expect(parseVoiceKey("openai:alloy")).toBeUndefined();
    expect(parseVoiceKey(null)).toBeUndefined();
  });
});

describe("dizajniraj glas (A8)", () => {
  test("opis se čita po rečima, na srpskom (i bez kvačica) i engleskom", () => {
    expect(readVoiceWish("Dubok, ozbiljan muški glas starijeg čoveka")).toEqual({ gender: "muski", age: "zreo", tones: ["ozbiljan"] });
    expect(readVoiceWish("vesela mlada devojka")).toEqual({ gender: "zenski", age: "mlad", tones: ["energican"] });
    expect(readVoiceWish("topao zenski glas za uspavanku")).toEqual({ gender: "zenski", age: null, tones: ["topao", "mek"] });
    expect(readVoiceWish("a calm, clear woman reading the news")).toEqual({ gender: "zenski", age: null, tones: ["mek", "jasan"] });
    expect(readVoiceWish("glas")).toEqual({ gender: null, age: null, tones: [] });
  });

  test("tri različita predloga; pol se poštuje, najbliži glas je prvi", () => {
    const deep = suggestVoices("Dubok, ozbiljan muški glas starijeg čoveka");
    expect(deep).toHaveLength(3);
    expect(new Set(deep.map((voice) => voice.id)).size).toBe(3);
    expect(deep.every((voice) => voice.gender === "muski")).toBe(true);
    expect(deep[0]?.id).toBe("Algenib");

    const happy = suggestVoices("vesela mlada devojka");
    expect(happy.every((voice) => voice.gender === "zenski" && voice.age === "mlad")).toBe(true);
    expect(happy.map((voice) => voice.id)).toEqual(["Zephyr", "Leda", "Laomedeia"]);

    expect(suggestVoices("bilo kakav glas").map((voice) => voice.id)).toEqual(["Zephyr", "Puck", "Charon"]);
    expect(suggestVoices("topao muški glas", "eleven")[0]?.id).toBe("George");
  });
});

describe("glas za naraciju alata (K30, nalaz K29-20)", () => {
  const live = (slugs: string[]) => (slug: string) => (slugs.includes(slug) ? ("live" as const) : null);

  test("Gemini kad radi i tekst stane; ElevenLabs za dug tekst ili kad Gemini ne radi", () => {
    expect(narrationEngine(1200, live(["gemini-tts", "tts"]))?.id).toBe("gemini");
    expect(narrationEngine(2400, live(["gemini-tts", "tts"]))?.id).toBe("eleven");
    expect(narrationEngine(1200, live(["tts"]))?.id).toBe("eleven");
    expect(narrationEngine(2400, live(["gemini-tts"]))).toBeNull();
    expect(narrationEngine(6000, live(["gemini-tts", "tts"]))).toBeNull();
  });

  test("uživo ima prednost pred DEMO-om; bez ičega uživo ostaje prvi DEMO", () => {
    expect(narrationEngine(100, (slug) => (slug === "gemini-tts" ? "demo" : "live"))?.id).toBe("eleven");
    expect(narrationEngine(100, () => "demo")?.id).toBe("gemini");
  });
});
