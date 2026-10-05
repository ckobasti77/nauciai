import { describe, expect, test } from "vitest";

import { boxBlur, restorePrompt, RETOUCH_STRENGTH, retouchPixels, retouchRadius, skinShare, skinWeight } from "./crea-retouch";

const SKIN: [number, number, number] = [224, 172, 140];
const SKY: [number, number, number] = [70, 130, 220];

function fill(width: number, height: number, pick: (x: number, y: number) => [number, number, number]) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pick(x, y);
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

/** Ista „slučajna" šara svaki put (fleke i pore na koži). */
function noise(x: number, y: number) {
  return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 13 - 6;
}

function variance(rgba: Uint8ClampedArray, channel = 0) {
  const values: number[] = [];
  for (let i = channel; i < rgba.length; i += 4) values.push(rgba[i]!);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

describe("koža", () => {
  test("ten kože jeste koža, nebo, zelenilo, crno i belo nisu", () => {
    expect(skinWeight(...SKIN)).toBe(1);
    expect(skinWeight(198, 134, 102)).toBeGreaterThan(0.5);
    expect(skinWeight(141, 85, 60)).toBeGreaterThan(0.5);
    expect(skinWeight(...SKY)).toBe(0);
    expect(skinWeight(60, 160, 70)).toBe(0);
    expect(skinWeight(10, 10, 10)).toBe(0);
    expect(skinWeight(255, 255, 255)).toBe(0);
  });

  test("udeo kože na slici", () => {
    expect(skinShare(fill(20, 20, () => SKIN))).toBe(1);
    expect(skinShare(fill(20, 20, () => SKY))).toBe(0);
    expect(skinShare(fill(20, 20, (x) => (x < 10 ? SKIN : SKY)), 1)).toBeCloseTo(0.5, 1);
  });
});

describe("zamućenje", () => {
  test("ravna slika ostaje ravna, alfa se ne dira, poluprečnik raste sa veličinom", () => {
    const flat = fill(16, 16, () => SKIN);
    const blurred = boxBlur(flat, 16, 16, 3);
    expect([...blurred]).toEqual([...flat]);
    expect(retouchRadius(400, 400)).toBe(2);
    expect(retouchRadius(2000, 3000)).toBe(10);
    expect(retouchRadius(8000, 8000)).toBe(12);
  });
});

describe("blag retuš kože", () => {
  test("jačina 0 vraća istu sliku", () => {
    const image = fill(24, 24, (x, y) => [SKIN[0] + noise(x, y), SKIN[1] + noise(x, y), SKIN[2]]);
    expect([...retouchPixels(image, 24, 24, 0)]).toEqual([...image]);
  });

  test("fleke na koži se zagladi (manja razlika među pikselima), jače = glađe", () => {
    const image = fill(48, 48, (x, y) => [SKIN[0] + noise(x, y), SKIN[1] + noise(y, x), SKIN[2] + noise(x + 1, y)]);
    const before = variance(image);
    const gentle = variance(retouchPixels(image, 48, 48, RETOUCH_STRENGTH.blago));
    const strong = variance(retouchPixels(image, 48, 48, RETOUCH_STRENGTH.jace));
    expect(gentle).toBeLessThan(before);
    expect(strong).toBeLessThan(gentle);
  });

  test("ono što nije koža se ne dira", () => {
    const image = fill(32, 32, (x, y) => [SKY[0] + noise(x, y), SKY[1], SKY[2]]);
    expect([...retouchPixels(image, 32, 32, 1)]).toEqual([...image]);
  });

  test("oštra ivica (oko, obrva, usna) ostaje oštra", () => {
    // Leva polovina koža, desna tamno smeđa obrva: prelaz od jednog piksela.
    const brow: [number, number, number] = [70, 45, 35];
    const image = fill(40, 20, (x) => (x < 20 ? SKIN : brow));
    const out = retouchPixels(image, 40, 20, 1);
    const at = (x: number) => out[(10 * 40 + x) * 4]!;
    expect(at(19)).toBeGreaterThan(200);
    expect(at(20)).toBeLessThan(90);
    expect(at(5)).toBe(SKIN[0]);
  });
});

describe("vrati staru fotku", () => {
  test("opis traži popravku oštećenja, a lica i kadar ostaju isti; bojenje je izbor", () => {
    const keep = restorePrompt(false, "", "sr");
    expect(keep).toContain("ogrebotine");
    expect(keep).toContain("crno-bela ostaje crno-bela");
    expect(keep).toContain("ostaju potpuno isti");
    const color = restorePrompt(true, "pocepan ugao", "en");
    expect(color).toContain("Colourise");
    expect(color).toContain("Also: pocepan ugao.");
  });
});
