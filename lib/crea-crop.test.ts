/**
 * Isecanje, okretanje i veličina (S26, K09): preseti formata, okretanje u
 * prostoru ekrana i to da isečak i izlaz uvek ostaju u granicama.
 */
import { describe, expect, test } from "vitest";

import {
  applyMatrix,
  CROP_PRESETS,
  cropFileName,
  cropOutputType,
  cropPreset,
  flip,
  isIdentity,
  NO_ORIENTATION,
  orientationMatrix,
  orientedSize,
  outputSize,
  percentToPixels,
  RESIZE_MAX_PX,
  RESIZE_MIN_PX,
  rotateBy,
  SMART_CROP_PRESET_IDS,
  type Orientation,
} from "./crea-crop";
import { CANVAS_MAX_PIXELS } from "./crea-image-format";

describe("preseti formata", () => {
  test("jedinstveni id-jevi, odnos se slaže sa preporučenom veličinom", () => {
    expect(new Set(CROP_PRESETS.map((preset) => preset.id)).size).toBe(CROP_PRESETS.length);
    for (const preset of CROP_PRESETS) {
      expect(preset.label.sr && preset.label.en, preset.id).toBeTruthy();
      if (preset.size) {
        expect(preset.aspect, preset.id).not.toBeNull();
        expect(preset.size.width / preset.size.height).toBeCloseTo(preset.aspect!, 3);
      }
    }
  });

  test("Instagram, priča, YouTube i profilna su tu sa pravim veličinama", () => {
    expect(cropPreset("kvadrat").size).toEqual({ width: 1080, height: 1080 });
    expect(cropPreset("objava").size).toEqual({ width: 1080, height: 1350 });
    expect(cropPreset("prica").size).toEqual({ width: 1080, height: 1920 });
    expect(cropPreset("youtube").size).toEqual({ width: 1280, height: 720 });
    expect(cropPreset("profilna").round).toBe(true);
    expect(cropPreset("original").aspect).toBeNull();
  });

  test("pametan isečak nudi samo preset sa fiksnim odnosom", () => {
    for (const id of SMART_CROP_PRESET_IDS) expect(cropPreset(id).aspect, id).not.toBeNull();
  });
});

describe("okretanje i preslikavanje", () => {
  test("četiri okreta udesno vraćaju početak; levo pa desno je isto", () => {
    let o: Orientation = NO_ORIENTATION;
    for (let i = 0; i < 4; i += 1) o = rotateBy(o, 90);
    expect(isIdentity(o)).toBe(true);
    expect(rotateBy(rotateBy(NO_ORIENTATION, -90), 90)).toEqual(NO_ORIENTATION);
    expect(rotateBy(NO_ORIENTATION, -90).rotation).toBe(270);
  });

  test("dva preslikavanja po istoj osi poništavaju jedno drugo, po obe = okret 180°", () => {
    expect(flip(flip(NO_ORIENTATION, "h"), "h")).toEqual(NO_ORIENTATION);
    expect(flip(flip(NO_ORIENTATION, "h"), "v")).toEqual({ rotation: 180, flipH: false, flipV: false });
  });

  test("uspravna slika okrenuta za 90° postaje položena", () => {
    expect(orientedSize(3000, 4000, rotateBy(NO_ORIENTATION, 90))).toEqual({ width: 4000, height: 3000 });
    expect(orientedSize(3000, 4000, flip(NO_ORIENTATION, "v"))).toEqual({ width: 3000, height: 4000 });
  });

  // Gornji levi ugao slike (0,0) se prati kroz matricu: gde završi na platnu.
  const corner = (o: Orientation, w = 40, h = 20) => {
    const p = applyMatrix(orientationMatrix(w, h, o), 0, 0);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  test("matrica slika uglove slike tačno u uglove platna", () => {
    expect(corner(NO_ORIENTATION)).toEqual({ x: 0, y: 0 });
    // Udesno: gornji levi ugao ide gore desno; platno je 20 × 40.
    expect(corner(rotateBy(NO_ORIENTATION, 90))).toEqual({ x: 20, y: 0 });
    expect(corner(rotateBy(NO_ORIENTATION, -90))).toEqual({ x: 0, y: 40 });
    expect(corner({ rotation: 180, flipH: false, flipV: false })).toEqual({ x: 40, y: 20 });
    expect(corner(flip(NO_ORIENTATION, "h"))).toEqual({ x: 40, y: 0 });
    expect(corner(flip(NO_ORIENTATION, "v"))).toEqual({ x: 0, y: 20 });
  });

  test("okret posle preslikavanja ide u smeru koji korisnik vidi", () => {
    // Preslikaj vodoravno, pa okreni udesno: ugao koji je bio gore desno ide dole desno.
    const o = rotateBy(flip(NO_ORIENTATION, "h"), 90);
    expect(corner(o)).toEqual({ x: 20, y: 40 });
    // Za svaki od 8 položaja sva četiri ugla slike padaju u uglove platna.
    const all: Orientation[] = [];
    for (const start of [NO_ORIENTATION, flip(NO_ORIENTATION, "h")]) {
      let current = start;
      for (let i = 0; i < 4; i += 1) {
        all.push(current);
        current = rotateBy(current, 90);
      }
    }
    for (const orientation of all) {
      const size = orientedSize(40, 20, orientation);
      const matrix = orientationMatrix(40, 20, orientation);
      const points = [
        [0, 0],
        [40, 0],
        [0, 20],
        [40, 20],
      ].map(([x, y]) => applyMatrix(matrix, x, y));
      const xs = points.map((p) => Math.round(p.x)).sort((a, b) => a - b);
      const ys = points.map((p) => Math.round(p.y)).sort((a, b) => a - b);
      expect(xs).toEqual([0, 0, size.width, size.width]);
      expect(ys).toEqual([0, 0, size.height, size.height]);
    }
  });
});

describe("isečak i izlazna veličina", () => {
  test("procenti postaju celi pikseli unutar slike", () => {
    expect(percentToPixels({ x: 10, y: 20, width: 50, height: 50 }, 1000, 500)).toEqual({
      x: 100,
      y: 100,
      width: 500,
      height: 250,
    });
    // Isečak koji „curi" van slike (zaokruživanje u react-easy-crop) se seče.
    expect(percentToPixels({ x: -1, y: 98, width: 102, height: 5 }, 100, 100)).toEqual({ x: 0, y: 98, width: 100, height: 2 });
    expect(percentToPixels({ x: 100, y: 100, width: 0, height: 0 }, 100, 100)).toEqual({ x: 99, y: 99, width: 1, height: 1 });
  });

  test("preset daje tačnu veličinu kad je isečak dovoljno velik", () => {
    expect(outputSize({ width: 3000, height: 3750 }, cropPreset("objava"), null)).toEqual({
      width: 1080,
      height: 1350,
      belowRecommended: false,
      limited: false,
    });
  });

  test("mali isečak se ne uvećava, samo se kaže da je ispod preporuke", () => {
    expect(outputSize({ width: 720, height: 1280 }, cropPreset("prica"), null)).toEqual({
      width: 720,
      height: 1280,
      belowRecommended: true,
      limited: false,
    });
  });

  test("kao original: upisana širina, visina po odnosu, u granicama 16-8192", () => {
    expect(outputSize({ width: 4000, height: 3000 }, cropPreset("original"), 1200)).toMatchObject({ width: 1200, height: 900 });
    expect(outputSize({ width: 4000, height: 3000 }, cropPreset("original"), 2)).toMatchObject({ width: RESIZE_MIN_PX });
    expect(outputSize({ width: 4000, height: 100 }, cropPreset("original"), 99999)).toMatchObject({ width: RESIZE_MAX_PX });
    expect(outputSize({ width: 640, height: 480 }, cropPreset("original"), null)).toMatchObject({ width: 640, height: 480 });
  });

  test("prevelik izlaz se smanji ispod granice platna telefona", () => {
    const size = outputSize({ width: 8000, height: 8000 }, cropPreset("original"), 8192);
    expect(size.limited).toBe(true);
    expect(size.width * size.height).toBeLessThanOrEqual(CANVAS_MAX_PIXELS);
  });
});

describe("format i ime isečka", () => {
  test("JPG i WebP ostaju, ostalo postaje PNG", () => {
    expect(cropOutputType("image/jpeg")).toBe("image/jpeg");
    expect(cropOutputType("image/webp")).toBe("image/webp");
    expect(cropOutputType("image/png")).toBe("image/png");
    expect(cropOutputType("image/gif")).toBe("image/png");
    expect(cropOutputType("image/avif")).toBe("image/png");
  });

  test("ime fajla bez putanje i nedozvoljenih znakova", () => {
    expect(cropFileName("C:\\slike\\more.jpg", "image/jpeg")).toBe("more-isecak.jpg");
    expect(cropFileName('a<b>:"c.png', "image/png")).toBe("abc-isecak.png");
    expect(cropFileName(".png", "image/webp")).toBe("slika-isecak.webp");
  });
});
