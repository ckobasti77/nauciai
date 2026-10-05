import { describe, expect, test } from "vitest";

import { BLOCKHASH_SIZE, blockhash, duplicateGroups, hammingDistance } from "./crea-duplicates";

/** Sintetička slika 64 × 64: funkcija daje boju piksela. */
function image(paint: (x: number, y: number) => [number, number, number, number?]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(BLOCKHASH_SIZE * BLOCKHASH_SIZE * 4);
  for (let y = 0; y < BLOCKHASH_SIZE; y += 1) {
    for (let x = 0; x < BLOCKHASH_SIZE; x += 1) {
      const [r, g, b, a = 255] = paint(x, y);
      data.set([r, g, b, a], (y * BLOCKHASH_SIZE + x) * 4);
    }
  }
  return data;
}

const gradient = image((x, y) => [x * 4, y * 4, 128]);
const circle = image((x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 300 ? [250, 240, 10] : [10, 20, 90]));
const stripes = image((x) => (Math.floor(x / 8) % 2 ? [255, 255, 255] : [0, 0, 0]));

describe("blockhash", () => {
  test("256 bitova kao 64 heks znaka; ista slika = isti otisak", () => {
    const hash = blockhash(gradient);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(blockhash(new Uint8ClampedArray(gradient))).toBe(hash);
    expect(() => blockhash(new Uint8ClampedArray(16))).toThrow("BLOCKHASH_SIZE");
  });

  test("ista slika malo svetlija ili sa šumom je duplikat; druga slika nije", () => {
    const brighter = image((x, y) => [Math.min(255, x * 4 + 20), Math.min(255, y * 4 + 20), 148]);
    const noisy = image((x, y) => [x * 4 + ((x * 7 + y * 13) % 5), y * 4, 128]);
    expect(hammingDistance(blockhash(gradient), blockhash(brighter))).toBeLessThanOrEqual(12);
    expect(hammingDistance(blockhash(gradient), blockhash(noisy))).toBeLessThanOrEqual(12);
    expect(hammingDistance(blockhash(gradient), blockhash(circle))).toBeGreaterThan(12);
    expect(hammingDistance(blockhash(stripes), blockhash(circle))).toBeGreaterThan(12);
  });

  test("providan piksel se računa kao beo", () => {
    const cutout = image((x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 300 ? [250, 240, 10] : [0, 0, 0, 0]));
    const onWhite = image((x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 300 ? [250, 240, 10] : [255, 255, 255]));
    expect(blockhash(cutout)).toBe(blockhash(onWhite));
  });

  test("Hamming: različita dužina nikad nije duplikat", () => {
    expect(hammingDistance("ff", "00")).toBe(8);
    expect(hammingDistance("a", "aa")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("grupe duplikata", () => {
  test("prelazno spajanje, redosled ulaza, samo grupe od bar dva", () => {
    const base = "0".repeat(64);
    const near = `1${"0".repeat(63)}`; // 1 bit
    const nearer = `3${"0".repeat(63)}`; // 2 bita od base, 1 od near
    const other = "f".repeat(64);
    const groups = duplicateGroups(
      [
        { id: "a", hash: base },
        { id: "x", hash: other },
        { id: "b", hash: near },
        { id: "c", hash: nearer },
      ],
      1,
    );
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([["a", "b", "c"]]);
    expect(duplicateGroups([{ id: "a", hash: base }])).toEqual([]);
  });
});
