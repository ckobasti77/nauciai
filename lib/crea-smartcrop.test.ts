/**
 * Pametan isečak (S30, K09): lice uvek ostaje CELO u kadru, i kad je uz ivicu
 * fotke; više lica ako staju, inače najveće; bez lica predlog `smartcrop`-a.
 */
import { describe, expect, test } from "vitest";

import { containsBox, detectionTiles, faceWithMargin, largestCropForAspect, mergeFaces, smartCropBox } from "./crea-smartcrop";

const LANDSCAPE = { width: 4000, height: 3000 };

describe("veličina kadra", () => {
  test("najveći isečak datog odnosa staje u sliku", () => {
    expect(largestCropForAspect(4000, 3000, 9 / 16)).toEqual({ width: 1688, height: 3000 });
    expect(largestCropForAspect(3000, 4000, 16 / 9)).toEqual({ width: 3000, height: 1688 });
    expect(largestCropForAspect(4000, 3000, 1)).toEqual({ width: 3000, height: 3000 });
  });
});

describe("lice ostaje u kadru", () => {
  test("lice uz desnu ivicu široke fotke ostaje celo u uspravnom kadru (priča 9:16)", () => {
    const face = { x: 3500, y: 800, width: 400, height: 450 };
    const result = smartCropBox({ image: LANDSCAPE, aspect: 9 / 16, faces: [face] });
    expect(result.reason).toBe("faces");
    expect(result.facesInside).toBe(1);
    expect(containsBox(result.crop, face)).toBe(true);
    expect(result.crop.x + result.crop.width).toBeLessThanOrEqual(LANDSCAPE.width);
  });

  test("lice uz levu ivicu, isečak nikad ne izlazi iz slike", () => {
    const face = { x: 0, y: 1200, width: 300, height: 350 };
    const result = smartCropBox({ image: LANDSCAPE, aspect: 4 / 5, faces: [face] });
    expect(result.crop.x).toBe(0);
    expect(containsBox(result.crop, face)).toBe(true);
  });

  test("ima vazduha iznad glave: lice je u gornjem delu kadra, ne zalepljeno za vrh", () => {
    const face = { x: 1800, y: 600, width: 400, height: 400 };
    const result = smartCropBox({ image: { width: 3000, height: 4000 }, aspect: 16 / 9, faces: [face] });
    const margin = faceWithMargin(face);
    expect(result.crop.y).toBeLessThanOrEqual(margin.y);
    const faceCenterY = face.y + face.height / 2 - result.crop.y;
    expect(faceCenterY / result.crop.height).toBeLessThan(0.5);
  });

  test("dva lica koja staju - oba su u kadru", () => {
    const faces = [
      { x: 1200, y: 900, width: 300, height: 340 },
      { x: 1900, y: 1000, width: 280, height: 320 },
    ];
    const result = smartCropBox({ image: LANDSCAPE, aspect: 1, faces });
    expect(result.reason).toBe("faces");
    expect(result.facesInside).toBe(2);
  });

  test("lica koja ne staju zajedno - prednost ima najveće", () => {
    const small = { x: 100, y: 1000, width: 200, height: 220 };
    const big = { x: 3300, y: 900, width: 500, height: 560 };
    const result = smartCropBox({ image: LANDSCAPE, aspect: 9 / 16, faces: [small, big] });
    expect(result.reason).toBe("largest-face");
    expect(result.facesFound).toBe(2);
    expect(containsBox(result.crop, big)).toBe(true);
    expect(containsBox(result.crop, small)).toBe(false);
  });
});

describe("bez lica", () => {
  test("predlog smartcrop-a: centar kadra prati predmet", () => {
    const suggestion = { x: 2600, y: 0, width: 1400, height: 2488 };
    const result = smartCropBox({ image: LANDSCAPE, aspect: 9 / 16, faces: [], suggestion });
    expect(result.reason).toBe("subject");
    expect(result.crop.x + result.crop.width).toBe(LANDSCAPE.width);
  });

  test("bez lica i bez predloga - sredina slike", () => {
    const result = smartCropBox({ image: LANDSCAPE, aspect: 1, faces: [] });
    expect(result).toMatchObject({ reason: "center", crop: { x: 500, y: 0, width: 3000, height: 3000 } });
  });
});

describe("lica na panorami", () => {
  test("kvadratna i skoro kvadratna slika = jedan prozor", () => {
    expect(detectionTiles(1000, 1000)).toEqual([{ x: 0, y: 0, width: 1000, height: 1000 }]);
    expect(detectionTiles(1200, 1000)).toHaveLength(1);
  });

  test("široka slika: kvadratni prozori sa preklapanjem pokrivaju i desnu ivicu", () => {
    const tiles = detectionTiles(2460, 1024);
    expect(tiles.every((tile) => tile.width === 1024 && tile.height === 1024 && tile.y === 0)).toBe(true);
    expect(tiles[0].x).toBe(0);
    expect(tiles.at(-1)!.x + 1024).toBe(2460);
    for (let i = 1; i < tiles.length; i += 1) expect(tiles[i].x - tiles[i - 1].x).toBeLessThanOrEqual(512);
  });

  test("visoka slika ide uspravno", () => {
    const tiles = detectionTiles(1000, 3000);
    expect(tiles.every((tile) => tile.x === 0 && tile.width === 1000)).toBe(true);
    expect(tiles.at(-1)!.y + 1000).toBe(3000);
  });

  test("isto lice iz dva prozora se spaja, različita lica ostaju", () => {
    const merged = mergeFaces([
      { x: 1700, y: 200, width: 300, height: 300, score: 0.8 },
      { x: 1705, y: 205, width: 290, height: 290, score: 0.95 },
      { x: 200, y: 300, width: 250, height: 250, score: 0.9 },
    ]);
    expect(merged).toEqual([
      { x: 1705, y: 205, width: 290, height: 290 },
      { x: 200, y: 300, width: 250, height: 250 },
    ]);
  });
});
