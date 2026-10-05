import { describe, expect, test } from "vitest";

import { studioModelBySlug } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";

import { jobCredits } from "./crea-job-price";
import {
  buildSpeechJob,
  countStickers,
  DEFAULT_VOICE_SETTINGS,
  geminiStyle,
  sanitizeVoiceSettings,
  speechChars,
  stickerByWord,
  translateStickers,
  VOICE_STICKERS,
  VOICE_STYLE_MAX,
} from "./crea-voice-tags";

/** Tagovi sa zvanične strane Gemini TTS (2026-10-05) - nalepnica sme samo na neki od njih. */
const GEMINI_DOCUMENTED_TAGS = [
  "<argh>", "<breath>", "<heavy breath>", "<exhales>", "<cackle>", "<cheer>", "<chuckle>", "<cough>", "<cry>", "<gasp>", "<giggle>",
  "<groan>", "<growl>", "<grunt>", "<grr>", "<hiss>", "<laugh>", "<moan>", "<pant>", "<pff>", "<scream>", "<shout>", "<shriek>",
  "<sigh>", "<sneeze>", "<snicker>", "<snort>", "<sob>", "<throat-clearing>", "<tsk>", "<whimper>", "<whispers>", "<yawn>",
  "<short pause>", "<long pause>",
];

const catalog = ["gemini-tts", "tts"].map((slug) => studioModelBySlug(slug)!);

describe("nalepnice (A4)", () => {
  test("svaka nalepnica ima srpski i engleski naziv i prevod za oba motora", () => {
    expect(VOICE_STICKERS.map((sticker) => sticker.label.sr)).toEqual(
      expect.arrayContaining(["[šapuće]", "[smeje se]", "[uzdah]", "[pauza 1s]"]),
    );
    for (const sticker of VOICE_STICKERS) {
      expect(GEMINI_DOCUMENTED_TAGS, sticker.id).toContain(sticker.gemini);
      expect(sticker.eleven, sticker.id).toMatch(/^(\[[a-z ]+\]|\.\.\.( \.\.\.)?)$/);
    }
  });

  test("prevod u tagove motora; srpski, engleski, bez kvačica, bilo koja veličina slova", () => {
    const text = "Pssst [šapuće] dođi ovamo. [pauza 1s] [SMEJE SE] Ha! [uzdah] [pause 2s] [sapuce] kraj";
    expect(translateStickers(text, "gemini")).toBe(
      "Pssst <whispers> dođi ovamo. <short pause> <laugh> Ha! <sigh> <long pause> <whispers> kraj",
    );
    expect(translateStickers(text, "eleven")).toBe("Pssst [whispers] dođi ovamo. ... [laughs] Ha! [sighs] ... ... [whispers] kraj");
    expect(stickerByWord("Smeje se")?.id).toBe("smeh");
    expect(stickerByWord("laughs")?.id).toBe("smeh");
  });

  test("nepoznata zagrada ostaje (ElevenLabs razume svoje tagove), broj nalepnica", () => {
    expect(translateStickers("[excited] Bravo! [šapuće] tiho", "eleven")).toBe("[excited] Bravo! [whispers] tiho");
    expect(countStickers("[excited] Bravo! [šapuće] tiho [pauza 1s]")).toBe(2);
  });
});

describe("raspoloženje, brzina, visina, opis (A4)", () => {
  test("Gemini: sve ide u opis stila; prirodno = bez stila", () => {
    expect(geminiStyle(DEFAULT_VOICE_SETTINGS)).toBe("");
    expect(geminiStyle({ mood: 2, speed: 0.8, pitch: -1, describe: "kao spiker na radiju" })).toBe(
      "excited and energetic, speaking slowly, with a lower pitch, kao spiker na radiju",
    );
    expect(geminiStyle({ mood: -1, speed: 1, pitch: 0, describe: "x".repeat(400) }).length).toBeLessThanOrEqual(VOICE_STYLE_MAX);
  });

  test("podešavanje iz nepouzdanog izvora se zaokruži na dozvoljene korake", () => {
    expect(sanitizeVoiceSettings({ mood: 7, speed: 1.17, pitch: -0.4, describe: "  toplo   i polako  " })).toEqual({
      mood: 2,
      speed: 1.2,
      pitch: 0,
      describe: "toplo i polako",
    });
    expect(sanitizeVoiceSettings("smeće")).toEqual(DEFAULT_VOICE_SETTINGS);
    expect(sanitizeVoiceSettings({ describe: "a".repeat(500) }).describe).toHaveLength(200);
  });
});

describe("posao govora (A2): izabran motor, cena, server ga prima", () => {
  test("Gemini: prevedene nalepnice, glas i stil", () => {
    const job = buildSpeechJob({ engine: "gemini", voiceId: "Kore", text: "Zdravo [smeje se]", settings: { mood: 1, speed: 1, pitch: 1, describe: "" } });
    expect(job).toEqual({
      modelSlug: "gemini-tts",
      inputMode: "text",
      params: { text: "Zdravo <laugh>", voice: "Kore", style: "cheerful and friendly, with a higher pitch" },
    });
    expect(speechChars(job)).toBe("Zdravo <laugh>".length);
  });

  test("ElevenLabs: raspoloženje je početni tag, brzina pravi parametar, visina i opis se ne šalju", () => {
    const job = buildSpeechJob({ engine: "eleven", voiceId: "George", text: "Dobar dan [uzdah]", settings: { mood: 2, speed: 0.9, pitch: 1, describe: "polako" } });
    expect(job).toEqual({ modelSlug: "tts", inputMode: "text", params: { text: "[excited] Dobar dan [sighs]", voice: "George", speed: 0.9 } });
  });

  test("nepoznat glas pada na podrazumevani glas motora", () => {
    expect(buildSpeechJob({ engine: "gemini", voiceId: "Aria", text: "x", settings: DEFAULT_VOICE_SETTINGS }).params.voice).toBe("Sulafat");
    expect(buildSpeechJob({ engine: "eleven", voiceId: "Kore", text: "x", settings: DEFAULT_VOICE_SETTINGS }).params.voice).toBe("Aria");
  });

  test("cena se vidi pre klika: 1 000 znakova = 5 kr (Gemini) i 22 kr (ElevenLabs), kao na serveru", () => {
    const text = "a".repeat(1000);
    const gemini = buildSpeechJob({ engine: "gemini", voiceId: "Kore", text, settings: DEFAULT_VOICE_SETTINGS });
    const eleven = buildSpeechJob({ engine: "eleven", voiceId: "Aria", text, settings: DEFAULT_VOICE_SETTINGS });
    const price = (job: typeof gemini) => jobCredits({ ...job, measured: { char_count: speechChars(job) } }, catalog);
    expect(price(gemini)).toBe(5);
    expect(price(eleven)).toBe(22);
    // Kratka replika: najmanje 1 kr.
    expect(price(buildSpeechJob({ engine: "gemini", voiceId: "Kore", text: "Zdravo!", settings: DEFAULT_VOICE_SETTINGS }))).toBe(1);
  });

  test("server prima parametre oba motora bez izmene (glas, stil, brzina)", () => {
    for (const engine of ["gemini", "eleven"] as const) {
      const job = buildSpeechJob({ engine, voiceId: engine === "gemini" ? "Puck" : "Liam", text: "Test [pauza 1s] test", settings: { mood: -2, speed: 1.2, pitch: -1, describe: "tiho" } });
      const seed = studioModelBySlug(job.modelSlug)!;
      const sanitized = sanitizeSpecParams(seed.paramSpec, seed.priceRule, job.params, "text");
      expect(sanitized.ok, engine).toBe(true);
      if (sanitized.ok) for (const [key, value] of Object.entries(job.params)) expect(sanitized.params[key], `${engine}.${key}`).toBe(value);
    }
  });
});
