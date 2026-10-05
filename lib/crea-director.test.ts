import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";

import { cameraMoveById } from "./crea-camera-moves";
import {
  composeVideoPrompt,
  DESK_EMOTIONS,
  DESK_ERAS,
  DESK_GENRES,
  DESK_LIGHTS,
  DESK_PRESETS,
  DESK_SOUNDS,
  DESK_TEMPOS,
  deskIsEmpty,
  deskLabel,
  effectParamsFor,
  modelMakesSound,
  videoPromptLimit,
  type DirectorDesk,
} from "./crea-director";
import { combineEffects, videoEffectById } from "./crea-video-effects";

function seed(slug: string) {
  const found = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!found) throw new Error(`nema modela ${slug}`);
  return found;
}

const FULL_DESK: DirectorDesk = {
  genre: "noar",
  era: "osamdesete",
  tempo: "sporo",
  lens: "tele",
  focal: 135,
  aperture: "f/1.4",
  light: "neon",
  palette: ["#0e3158", "#f4be30"],
  emotion: "napetost",
  sound: "kisa",
};

describe("režiserski pult (V9): opcije", () => {
  test("svaka opcija ima naziv na oba jezika i engleski dodatak opisu", () => {
    for (const list of [DESK_GENRES, DESK_ERAS, DESK_TEMPOS, DESK_LIGHTS, DESK_EMOTIONS, DESK_SOUNDS]) {
      expect(new Set(list.map((option) => option.id)).size).toBe(list.length);
      for (const option of list) {
        expect(option.label.sr && option.label.en).toBeTruthy();
        expect(option.fragment).toMatch(/^[\x20-\x7e]+$/);
        expect(option.fragment.endsWith(".")).toBe(false);
      }
    }
    expect(DESK_GENRES.length).toBeGreaterThanOrEqual(8);
    expect(DESK_LIGHTS.length).toBeGreaterThanOrEqual(8);
    expect(DESK_EMOTIONS.length).toBeGreaterThanOrEqual(8);
    expect(deskLabel("light", "neon", "sr")).toBe("Neon");
    expect(deskLabel("sound", "kafana", "en")).toBe("Tavern");
  });

  test("kartice sa primerima: postojeći izbori, pokret iz spiska, primer na oba jezika", () => {
    expect(DESK_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of DESK_PRESETS) {
      expect(cameraMoveById(preset.move), preset.id).toBeDefined();
      expect(preset.example.sr && preset.example.en && preset.hint.sr && preset.label.en).toBeTruthy();
      expect(deskIsEmpty(preset.desk)).toBe(false);
      const text = composeVideoPrompt({ prompt: preset.example.en, desk: preset.desk, move: cameraMoveById(preset.move), model: seed("veo-31-lite") }).text;
      expect(text).not.toContain("undefined");
      expect(text.startsWith(preset.example.en)).toBe(true);
    }
  });

  test("prazan pult", () => {
    expect(deskIsEmpty({})).toBe(true);
    expect(deskIsEmpty({ palette: ["nije boja"] })).toBe(true);
    expect(deskIsEmpty({ tempo: "brzo" })).toBe(false);
  });
});

describe("sklapanje opisa po modelu (V7, V8, V9)", () => {
  const veo = seed("veo-31-lite");
  const grok = seed("grok-video-15-lite");

  test("prazan pult vraća opis netaknut", () => {
    const result = composeVideoPrompt({ prompt: "Mačka skače na krov.", model: veo });
    expect(result.text).toBe("Mačka skače na krov.");
    expect(result.parts.map((part) => part.part)).toEqual(["opis"]);
    expect(result.overBy).toBe(0);
  });

  test("redosled: opis, emocija, kamera, objektiv, svetlo, paleta, žanr i era, tempo, zvuk", () => {
    const result = composeVideoPrompt({
      prompt: "Detektiv u kišnom mantilu",
      move: cameraMoveById("priblizavanje"),
      moveIntensity: "blago",
      desk: FULL_DESK,
      model: veo,
    });
    expect(result.parts.map((part) => part.part)).toEqual([
      "opis", "emocija", "kamera", "objektiv", "svetlo", "paleta", "zanr", "tempo", "zvuk",
    ]);
    expect(result.text).toBe(
      "Detektiv u kišnom mantilu. The character looks tense and alert. The camera slowly dollies in toward the subject, slow and gentle. " +
        "135mm telephoto lens, compressed perspective, f/1.4, very shallow depth of field, creamy bokeh. Colorful neon lighting. " +
        "Color palette: #0e3158, #f4be30. Film noir style, deep shadows, 1980s VHS home video look. Slow calm pacing. Sound: rain falling.",
    );
  });

  test("zvuk ide samo modelu koji pravi zvuk", () => {
    expect(modelMakesSound(veo)).toBe(true);
    expect(modelMakesSound(grok)).toBe(false);
    const withSound = composeVideoPrompt({ prompt: "Ulica", desk: { sound: "grad" }, model: veo });
    const silent = composeVideoPrompt({ prompt: "Ulica", desk: { sound: "grad" }, model: grok });
    expect(withSound.text).toContain("Sound: busy city street ambience");
    expect(silent.text).toBe("Ulica");
    // Efekat sa ambijentom: ambijent samo za model sa zvukom.
    const kafana = videoEffectById("kafana")!;
    expect(composeVideoPrompt({ prompt: "", effect: kafana, model: veo }).text).toContain("Sound: tamburica music and lively chatter");
    expect(composeVideoPrompt({ prompt: "", effect: kafana, model: grok }).text).not.toContain("Sound:");
  });

  test("efekat nosi korisnikov opis kao predmet; spojena dva efekta u jednom opisu", () => {
    const glina = videoEffectById("glina")!;
    const result = composeVideoPrompt({ prompt: "Moj pas Žuća", effect: glina, move: cameraMoveById("kruzenje-desno"), model: grok });
    expect(result.parts[0]).toEqual({ part: "efekat", text: "Moj pas Žuća gradually transforms into a handmade clay stop-motion figure with visible fingerprints in the clay" });
    expect(result.parts.map((part) => part.part)).toEqual(["efekat", "kamera"]);
    const both = combineEffects(glina, videoEffectById("sneg")!)!;
    expect(composeVideoPrompt({ prompt: "", effect: both, model: grok }).text).toContain("then soft snow starts falling around it");
  });

  test("granica dužine je granica modela (najviše 2000)", () => {
    expect(videoPromptLimit(veo)).toBeLessThanOrEqual(2000);
    const long = "a".repeat(1990);
    const result = composeVideoPrompt({ prompt: long, desk: { tempo: "brzo", light: "neon" }, model: veo });
    expect(result.overBy).toBe(result.text.length - videoPromptLimit(veo));
    expect(result.overBy).toBeGreaterThan(0);
  });

  test("parametri efekta po modelu: klizač se seče, izbor uzima najbližu vrednost", () => {
    const effect = { params: { duration: 6 } };
    expect(effectParamsFor(effect, seed("hailuo-23-fast"), "image")).toEqual({ duration: "6" });
    expect(effectParamsFor({ params: { duration: 9 } }, seed("hailuo-23-fast"), "image")).toEqual({ duration: "10" });
    expect(effectParamsFor(effect, seed("kling-3"), "text")).toEqual({ duration: 6 });
    expect(effectParamsFor({ params: { duration: 3 } }, seed("kling-3"), "text")).toEqual({ duration: 5 });
    expect(effectParamsFor({ params: { duration: 30 } }, seed("veo-31-lite"), "text")).toEqual({ duration: 8 });
    expect(effectParamsFor({}, seed("kling-3"), "text")).toEqual({});
  });

  test("efekat menja parametre posla, a server ih prihvata", () => {
    const effect = videoEffectById("godisnja-doba")!;
    for (const slug of effect.models) {
      const model = seed(slug);
      const params = effectParamsFor(effect, model, "image");
      expect(params.duration).toBeDefined();
      const sanitized = sanitizeSpecParams(model.paramSpec, model.priceRule, { prompt: "x", ...params }, "image");
      expect(sanitized.ok).toBe(true);
      if (sanitized.ok) expect(sanitized.params.duration).toEqual(params.duration);
    }
  });
});
