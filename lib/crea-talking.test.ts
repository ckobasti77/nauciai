import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";
import { computeCredits } from "@/convex/studioPricing";

import {
  demoSpeechWav,
  estimateSpeechSeconds,
  needsPriceConfirm,
  pcmWav,
  talkingNext,
  scenePrompt,
  stepCredits,
  TALKING_MODELS,
  TALKING_SCENES,
  TALKING_TEXT_MAX,
  talkingCredits,
  talkingProblem,
  talkingScene,
  talkingSteps,
  type TalkingPlanInput,
} from "./crea-talking";

const MAJA = { name: "Maja", description: "kratka crna kosa" };

function plan(overrides: Partial<TalkingPlanInput> = {}): TalkingPlanInput {
  return {
    output: "avatar",
    scene: "podkast",
    element: MAJA,
    refCount: 2,
    voice: "tekst",
    text: "Zdravo! Ja sam Maja i danas pričamo o veštačkoj inteligenciji.",
    voiceName: "Aria",
    audioSeconds: null,
    videoSeconds: null,
    quality: "720p",
    ...overrides,
  };
}

function model(slug: string) {
  return STUDIO_MODELS.find((entry) => entry.slug === slug)!;
}

describe("scene (V21)", () => {
  test("pet scena + „bez scene”; svaka ima odnos i engleski opis mesta", () => {
    expect(TALKING_SCENES.map((scene) => scene.id)).toEqual(["bez", "selfi", "podkast", "vesti", "predavanje", "auto"]);
    for (const scene of TALKING_SCENES.slice(1)) {
      expect(["9:16", "16:9"]).toContain(scene.aspect);
      expect(scene.setting).toMatch(/^[a-z]/);
      expect(scene.label.sr.length).toBeGreaterThan(2);
    }
    expect(talkingScene("bez").aspect).toBeNull();
  });

  test("opis scene: Lik iz referenci, zatvorena usta, jedna osoba", () => {
    const prompt = scenePrompt(talkingScene("vesti"), MAJA, 2);
    expect(prompt).toMatch(/^Images 1-2 show Maja \(kratka crna kosa\)\./);
    expect(prompt).toContain("TV news studio");
    expect(prompt).toContain("closed-mouth");
    expect(prompt).toContain("Only one person");
    expect(scenePrompt(talkingScene("auto"), { name: "Pera" }, 1)).toMatch(/^Image 1 shows Pera\./);
  });
});

describe("lanac govora (V21-V23)", () => {
  test("tekst → glas → avatar, sa scenom: tri koraka, parametri prolaze server", () => {
    const steps = talkingSteps(plan());
    expect(steps.map((step) => step.id)).toEqual(["scena", "glas", "video"]);
    expect(steps.map((step) => step.modelSlug)).toEqual(["nano-banana-2", "tts", "kling-avatar"]);
    for (const step of steps) {
      const seed = model(step.modelSlug);
      expect(seed.inputModes, step.id).toContain(step.inputMode);
      const sanitized = sanitizeSpecParams(seed.paramSpec, seed.priceRule, step.params, step.inputMode);
      expect(sanitized.ok, step.id).toBe(true);
    }
    expect(steps[0]!.params.aspect_ratio).toBe("16:9");
  });

  test("bez scene, snimak umesto teksta: samo avatar", () => {
    expect(talkingSteps(plan({ scene: "bez" })).map((step) => step.id)).toEqual(["glas", "video"]);
    expect(talkingSteps(plan({ voice: "snimak", audioSeconds: 12, scene: "bez" })).map((step) => step.id)).toEqual(["video"]);
    // Rad iz Cree (bez Lika) nema scenu ni kad je izabrana.
    expect(talkingSteps(plan({ element: null })).map((step) => step.id)).toEqual(["glas", "video"]);
  });

  test("cena lanca = zbir cena koraka, ista računica kao server; trajanje 1-60 s", () => {
    const steps = talkingSteps(plan());
    const total = talkingCredits(steps, STUDIO_MODELS);
    const text = plan().text;
    const seconds = estimateSpeechSeconds(text);
    const expected =
      computeCredits(model("nano-banana-2").priceRule, { resolution: "1K" }, "image_multi") +
      computeCredits(model("tts").priceRule, { char_count: text.length }, "text") +
      computeCredits(model("kling-avatar").priceRule, { quality: "720p", duration: seconds }, "image_audio");
    expect(total).toBe(expected);
    expect(steps.reduce((sum, step) => sum + (stepCredits(step, STUDIO_MODELS) ?? 0), 0)).toBe(expected);

    // Snimak od 90 s se ne naplaćuje kao 60 - lanac ga i ne pušta.
    expect(talkingProblem(plan({ voice: "snimak", audioSeconds: 90 }))).toBe("glas-predug");
    expect(talkingProblem(plan({ voice: "snimak", audioSeconds: 0.4 }))).toBe("glas-prekratak");
    // Avatar od 1080p skuplji od 720p, isto trajanje.
    const hd = talkingCredits(talkingSteps(plan({ quality: "1080p", scene: "bez" })), STUDIO_MODELS)!;
    const sd = talkingCredits(talkingSteps(plan({ scene: "bez" })), STUDIO_MODELS)!;
    expect(hd).toBeGreaterThan(sd);
    // Model kojeg nema u katalogu = cena nepoznata (nikad nula).
    expect(talkingCredits(steps, STUDIO_MODELS.filter((entry) => entry.slug !== "tts"))).toBeNull();
  });

  test("lipsync: tvoj video + glas, naplata po sekundi videa zaokruženo na 5", () => {
    const steps = talkingSteps(plan({ output: "usne", videoSeconds: 7 }));
    expect(steps.map((step) => step.modelSlug)).toEqual(["tts", TALKING_MODELS.lipsync.slug]);
    expect(stepCredits(steps[1]!, STUDIO_MODELS)).toBe(computeCredits(model("kling-lipsync").priceRule, { duration: 10, source: "audio" }, "video_audio"));
    expect(talkingProblem(plan({ output: "usne", videoSeconds: null }))).toBe("nema-videa");
    expect(talkingProblem(plan({ output: "usne", videoSeconds: 61 }))).toBe("video-predug");
  });

  test("procena trajanja govora i granice teksta", () => {
    expect(estimateSpeechSeconds("")).toBe(0);
    expect(estimateSpeechSeconds("Ćao!")).toBe(1);
    expect(estimateSpeechSeconds("a".repeat(140))).toBe(10);
    expect(estimateSpeechSeconds("a".repeat(5000))).toBe(60);
    expect(talkingProblem(plan({ text: "   " }))).toBe("nema-teksta");
    expect(talkingProblem(plan({ text: "a".repeat(TALKING_TEXT_MAX + 1) }))).toBe("predug-tekst");
    expect(talkingProblem(plan())).toBeNull();
    expect(talkingProblem(plan({ voice: "fajl", audioSeconds: null }))).toBe("nema-glasa");
  });

  test("DEMO glas: ispravan WAV tražene dužine (server mu meri trajanje)", () => {
    const wav = demoSpeechWav(3, 8000);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(40, true)).toBe(3 * 8000 * 2);
    expect(wav.length).toBe(44 + 3 * 8000 * 2);
    // Nije tišina: ima šta da pomera usta.
    let peak = 0;
    for (let index = 0; index < 8000; index++) peak = Math.max(peak, Math.abs(view.getInt16(44 + index * 2, true)));
    expect(peak).toBeGreaterThan(5000);
    expect(demoSpeechWav(500, 8000).length).toBe(44 + 60 * 8000 * 2);
  });
});

describe("lanac na klijentu (V23: napiši → izgovori → oživi)", () => {
  const base = { scene: "skip", voice: "skip", audioReady: false, final: "idle" } as const;

  test("scena i glas idu uporedo; video kreće tek kad je zvuk izmeren i scena gotova", () => {
    expect(talkingNext({ ...base, scene: "waiting", voice: "waiting" })).toEqual({ kind: "wait" });
    expect(talkingNext({ ...base, scene: "waiting", voice: "done" })).toEqual({ kind: "prepare-voice", demo: false });
    expect(talkingNext({ ...base, scene: "waiting", voice: "done", audioReady: true })).toEqual({ kind: "wait" });
    expect(talkingNext({ ...base, scene: "done", voice: "done", audioReady: true })).toEqual({ kind: "start-final", face: "scene" });
    expect(talkingNext({ ...base, audioReady: true })).toEqual({ kind: "start-final", face: "selected" });
    expect(talkingNext({ ...base, audioReady: true, final: "waiting" })).toEqual({ kind: "wait" });
    expect(talkingNext({ ...base, audioReady: true, final: "done" })).toEqual({ kind: "done" });
  });

  test("DEMO bez ključa: glas-plakat traži probni zvuk, scena-plakat se preskače, DEMO video je kraj", () => {
    expect(talkingNext({ ...base, voice: "demo" })).toEqual({ kind: "prepare-voice", demo: true });
    expect(talkingNext({ ...base, scene: "demo", voice: "demo", audioReady: true })).toEqual({ kind: "start-final", face: "selected" });
    expect(talkingNext({ ...base, audioReady: true, final: "demo" })).toEqual({ kind: "done" });
  });

  test("pad bilo kog koraka zaustavlja lanac i kaže koji", () => {
    expect(talkingNext({ ...base, scene: "failed", voice: "done" })).toEqual({ kind: "failed", step: "scena" });
    expect(talkingNext({ ...base, voice: "failed" })).toEqual({ kind: "failed", step: "glas" });
    expect(talkingNext({ ...base, audioReady: true, final: "failed" })).toEqual({ kind: "failed", step: "video" });
  });

  test("nova potvrda cene kad je glas primetno duži od procene", () => {
    expect(needsPriceConfirm(100, 105)).toBe(false);
    expect(needsPriceConfirm(100, 111)).toBe(false);
    expect(needsPriceConfirm(100, 112)).toBe(true);
    expect(needsPriceConfirm(10, 12)).toBe(false);
  });

  test("WAV od uzoraka (snimak mikrofona): sečenje na -1..1", () => {
    const wav = pcmWav(new Float32Array([0, 1, -1, 2, -2]), 8000);
    const view = new DataView(wav.buffer);
    expect(view.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((index) => view.getInt16(44 + index * 2, true))).toEqual([0, 32767, -32767, 32767, -32767]);
  });
});
