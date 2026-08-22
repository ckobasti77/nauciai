/**
 * Podela osnovno / napredno (SP1, tačka 3) izvodi se iz `paramSpec`-a, ne iz
 * fiksne liste po modelu. Test to tvrdi nad sintetičkim kontrolama I nad pravim
 * redom kataloga, pa 32. model dobija podelu bez izmene komponente.
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import type { ParamControl } from "@/convex/studioParamSpec";
import { isBasicControl, splitControlsByImportance } from "@/lib/studio-panel";

function control(partial: Partial<ParamControl> & Pick<ParamControl, "key" | "type">): ParamControl {
  return {
    labelSr: partial.key,
    labelEn: partial.key,
    default: partial.default ?? "",
    affectsPrice: partial.affectsPrice ?? false,
    ...partial,
  } as ParamControl;
}

describe("splitControlsByImportance", () => {
  test("cena i oblik izlaza su osnovni; ostalo je napredno", () => {
    const controls = [
      control({ key: "prompt", type: "textarea" }),
      control({ key: "resolution", type: "segmented", affectsPrice: true }),
      control({ key: "aspect_ratio", type: "select", affectsPrice: false }),
      control({ key: "seed", type: "text", affectsPrice: false }),
      control({ key: "negative", type: "textarea", affectsPrice: false }),
    ];
    const { basic, advanced } = splitControlsByImportance(controls);
    expect(basic.map((c) => c.key)).toEqual(["resolution", "aspect_ratio"]);
    // Prompt i negativan (oba textarea) nisu u telu panela; seed je napredan.
    expect(advanced.map((c) => c.key)).toEqual(["seed"]);
  });

  test("prompt se ne računa ni u osnovno ni u napredno", () => {
    const controls = [control({ key: "prompt", type: "textarea", affectsPrice: false })];
    const { basic, advanced } = splitControlsByImportance(controls);
    expect(basic).toEqual([]);
    expect(advanced).toEqual([]);
  });

  test("isBasicControl: switch koji menja cenu je osnovni", () => {
    expect(isBasicControl(control({ key: "audio", type: "switch", affectsPrice: true }))).toBe(true);
    expect(isBasicControl(control({ key: "lora", type: "switch", affectsPrice: false }))).toBe(false);
    expect(isBasicControl(control({ key: "aspect_ratio", type: "select" }))).toBe(true);
  });

  test("redosled unutar grupa prati ulazni `paramSpec`", () => {
    const controls = [
      control({ key: "b", type: "segmented", affectsPrice: true }),
      control({ key: "a", type: "segmented", affectsPrice: true }),
      control({ key: "z", type: "text" }),
      control({ key: "y", type: "text" }),
    ];
    const { basic, advanced } = splitControlsByImportance(controls);
    expect(basic.map((c) => c.key)).toEqual(["b", "a"]);
    expect(advanced.map((c) => c.key)).toEqual(["z", "y"]);
  });

  test("svaki red kataloga se deli bez greške i osnovno+napredno pokriva sve sem prompta", () => {
    for (const seed of STUDIO_MODELS) {
      const nonPrompt = seed.paramSpec.filter(
        (c) => c.type !== "textarea" && c.key !== "prompt",
      );
      const { basic, advanced } = splitControlsByImportance(seed.paramSpec);
      // Nijedna nepromptna kontrola se ne izgubi u podeli.
      expect(basic.length + advanced.length, seed.slug).toBe(
        // dedupe po ključu: dupli ključevi (Kling Turbo) broje se onako kako
        // stignu, jer split ne dedupe-uje - poravnavamo isto brojanje.
        nonPrompt.length,
      );
      // Osnovne su strogo podskup po pravilu.
      expect(basic.every((c) => isBasicControl(c)), seed.slug).toBe(true);
      expect(advanced.every((c) => !isBasicControl(c)), seed.slug).toBe(true);
    }
  });
});
