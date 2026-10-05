import { describe, expect, test } from "vitest";

import {
  bannedNextTokens,
  decodeBpe,
  FLORENCE_BOS_ID,
  FLORENCE_IMAGE_SIZE,
  florencePixelValues,
  invertVocab,
  nextToken,
} from "./crea-florence";

describe("Florence-2 (opis na uređaju)", () => {
  test("pretprocesiranje: 768 × 768, ImageNet normalizacija po kanalu", () => {
    const plane = FLORENCE_IMAGE_SIZE * FLORENCE_IMAGE_SIZE;
    const rgba = new Uint8ClampedArray(plane * 4);
    const pixels = florencePixelValues(rgba);
    expect(pixels).toHaveLength(plane * 3);
    expect(pixels[0]).toBeCloseTo(-0.485 / 0.229, 5);
    expect(pixels[plane]).toBeCloseTo(-0.456 / 0.224, 5);
    expect(() => florencePixelValues(new Uint8ClampedArray(4))).toThrow("FLORENCE_IMAGE_SIZE");
  });

  test("zabrana ponavljanja trojke reči (no_repeat_ngram_size = 3)", () => {
    // ... 5 6 7 ... 5 6 → 7 bi ponovio „5 6 7"
    expect([...bannedNextTokens([2, 0, 5, 6, 7, 9, 5, 6])]).toEqual([7]);
    expect(bannedNextTokens([2, 0])).toEqual(new Set());
  });

  test("prvi korak je uvek BOS, zatim najveći logit koji nije zabranjen", () => {
    expect(nextToken(new Float32Array([0, 9, 1]), [2])).toBe(FLORENCE_BOS_ID);
    expect(nextToken(new Float32Array([0, 9, 1]), [2, 0])).toBe(1);
    // Token 7 bi ponovio trojku, pa ide sledeći najbolji.
    const logits = new Float32Array(10);
    logits[7] = 5;
    logits[3] = 4;
    expect(nextToken(logits, [2, 0, 5, 6, 7, 9, 5, 6])).toBe(3);
  });

  test("BPE dekodiranje: Ġ je razmak, posebni tokeni se preskaču, UTF-8 se spaja", () => {
    const idToToken = invertVocab({ "<s>": 0, "</s>": 2, There: 10, "Ġare": 11, "Ġtwo": 12, "Ġcats": 13, ".": 14, "Ġcaf": 15, "Ã©": 16 });
    expect(decodeBpe([2, 0, 10, 11, 12, 13, 14, 2], idToToken)).toBe("There are two cats.");
    expect(decodeBpe([15, 16], idToToken)).toBe("café");
    expect(decodeBpe([999], idToToken)).toBe("");
  });
});
