import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { FLUX_2_KLEIN, Z_IMAGE_TURBO } from "@/convex/providers/falImageModels";
import { NANO_BANANA_2_LITE } from "@/convex/providers/googleImageModels";

import { imagesPerRun, sheetPlan, smallSketchParams, variationPlan, variationsCredits } from "./crea-variations";

describe("varijacije (S5)", () => {
  test("koliko slika model daje u jednom pozivu, po režimu", () => {
    expect(imagesPerRun(Z_IMAGE_TURBO, "text")).toBe(4);
    expect(imagesPerRun(FLUX_2_KLEIN, "text")).toBe(4);
    expect(imagesPerRun(FLUX_2_KLEIN, "image_multi")).toBe(1);
    expect(imagesPerRun(NANO_BANANA_2_LITE, "text")).toBe(1);
  });

  test("jedna = običan posao; više = `num_images` gde model ume, inače paralelni poslovi", () => {
    expect(variationPlan(Z_IMAGE_TURBO, "text", 1)).toEqual({ kind: "single" });
    expect(variationPlan(Z_IMAGE_TURBO, "text", 3)).toEqual({ kind: "num_images", count: 3 });
    expect(variationPlan(NANO_BANANA_2_LITE, "text", 3)).toEqual({ kind: "parallel", count: 3 });
    expect(variationPlan(FLUX_2_KLEIN, "image_multi", 2)).toEqual({ kind: "parallel", count: 2 });
    expect(variationPlan(Z_IMAGE_TURBO, "text", 99)).toEqual({ kind: "num_images", count: 4 });
    expect(variationPlan(Z_IMAGE_TURBO, "text", 0)).toEqual({ kind: "single" });
  });

  test("svaki model iz kataloga dobija plan za 1-4 varijacije", () => {
    for (const model of STUDIO_MODELS.filter((entry) => entry.kind === "image")) {
      for (const mode of model.inputModes) {
        for (const count of [1, 2, 3, 4]) expect(variationPlan(model, mode, count).kind, `${model.slug}/${mode}`).toBeTruthy();
      }
    }
  });

  test("cena: paralelni poslovi se množe, `num_images` već računa pravilo cene", () => {
    expect(variationsCredits({ kind: "parallel", count: 3 }, 16)).toBe(48);
    expect(variationsCredits({ kind: "num_images", count: 3 }, 6)).toBe(6);
    expect(variationsCredits({ kind: "single" }, 16)).toBe(16);
    expect(variationsCredits({ kind: "parallel", count: 3 }, null)).toBeNull();
  });
});

describe("probni list (S4)", () => {
  test("16 skica po 4 = 4 posla; ostatak ide u poslednji", () => {
    expect(sheetPlan(16, 4)).toEqual([4, 4, 4, 4]);
    expect(sheetPlan(8, 4)).toEqual([4, 4]);
    expect(sheetPlan(6, 4)).toEqual([4, 2]);
    expect(sheetPlan(4, 1)).toEqual([1, 1, 1, 1]);
    expect(sheetPlan(0, 0)).toEqual([1]);
  });

  test("skica je mala: `square_hd` postaje `square`, ostalo ostaje", () => {
    expect(smallSketchParams({ prompt: "p", image_size: "square_hd" })).toEqual({ prompt: "p", image_size: "square" });
    expect(smallSketchParams({ image_size: "landscape_16_9" })).toEqual({ image_size: "landscape_16_9" });
  });
});
