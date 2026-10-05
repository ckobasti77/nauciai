import { describe, expect, test } from "vitest";

import { studioModelBySlug } from "@/convex/providers/catalogModels";

import { compactPlan, segmentsFromWords } from "./crea-speech-segments";
import { changedSpeakers, stepCredits, swapCredits, swapSteps, swapVoices } from "./crea-voice-swap";

const catalog = ["stems", "stt", "voice-changer"].map((slug) => studioModelBySlug(slug)!);

const say = (text: string, start: number, speaker: string) => text.split(" ").map((w, index) => ({ w, s: start + index * 0.5, e: start + index * 0.5 + 0.4, speaker }));
const segments = segmentsFromWords([...say("Ja govorim prvi i dugo pričam o hlebu.", 0, "a"), ...say("A ja kratko.", 6, "b"), ...say("Opet ja.", 9, "a")]);

describe("promena glasa po govorniku (A9)", () => {
  test("glasovi su ElevenLabs glasovi biblioteke (isti spisak kao red voice-changer)", () => {
    const row = studioModelBySlug("voice-changer")!;
    const options = row.paramSpec.find((control) => control.key === "voice")!.options!.map((option) => option.value);
    expect(swapVoices()).toEqual(options);
  });

  test("ceo snimak u jedan glas: samo promena glasa po minutu snimka (današnji tok)", () => {
    const steps = swapSteps({ durationS: 90, keepMusic: false, perSpeaker: false, segments: null, choices: {}, voice: "George" });
    expect(steps).toEqual([{ id: "glas:sve", modelSlug: "voice-changer", inputMode: "audio", minutes: 1.5, params: { voice: "George" } }]);
    expect(swapCredits(steps, catalog)).toBe(stepCredits(steps[0]!, catalog));
  });

  test("muzika ostaje: prvo trake; po govorniku: prepoznavanje, pa SAMO delovi izabranih govornika", () => {
    const before = swapSteps({ durationS: 60, keepMusic: true, perSpeaker: true, segments: null, choices: {}, voice: "Aria" });
    expect(before.map((step) => step.id)).toEqual(["trake", "govornici"]);
    const choices = { a: "George", b: null };
    expect(changedSpeakers(choices)).toEqual(["a"]);
    const steps = swapSteps({ durationS: 60, keepMusic: true, perSpeaker: true, segments, choices, voice: "Aria" });
    expect(steps.map((step) => step.id)).toEqual(["trake", "govornici", "glas:a"]);
    // Plaća se trajanje spojenih delova govornika „a", ne ceo minut snimka.
    expect(steps[2]!.minutes).toBeCloseTo(compactPlan(segments, "a", 60).durationS / 60, 6);
    expect(steps[2]!.minutes).toBeLessThan(0.2);
    const total = swapCredits(steps, catalog)!;
    expect(total).toBe(steps.reduce((sum, step) => sum + stepCredits(step, catalog)!, 0));
    // Nepoznat glas se ne računa.
    expect(swapSteps({ durationS: 60, keepMusic: false, perSpeaker: true, segments, choices: { a: "Niko" }, voice: "Aria" }).map((step) => step.id)).toEqual(["govornici"]);
  });
});
