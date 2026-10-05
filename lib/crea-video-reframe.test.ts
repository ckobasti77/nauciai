import { describe, expect, test } from "vitest";

import {
  cropAt,
  detectionTiles,
  faceCoverage,
  mergeFaces,
  REFRAME_DEFAULTS,
  reframeOutputSize,
  reframePath,
  reframeSampleTimes,
  reframeWindow,
  targetAspect,
  trackSubject,
  VIDEO_REFRAME_TARGETS,
  type FaceBox,
  type FaceSample,
} from "./crea-video-reframe";

const SOURCE = { width: 1920, height: 1080 };
const FPS = 5;

function face(cx: number, cy: number, size = 0.1, score = 0.9): FaceBox {
  return { x: cx - size / 2, y: cy - (size * 16) / 9 / 2, w: size, h: (size * 16) / 9, score };
}

/** Uzorci na 5/s: `at(t)` daje centar lica ili `null` (lice nestalo). */
function samples(seconds: number, at: (t: number) => { x: number; y: number } | null): FaceSample[] {
  return reframeSampleTimes(seconds, FPS).map((t) => {
    const position = at(t);
    return { t, faces: position ? [face(position.x, position.y)] : [] };
  });
}

/** Deterministički „šum" detektora (bez Math.random). */
function jitter(t: number, amount: number): number {
  return Math.sin(t * 37.1) * amount;
}

function faceInside(box: FaceBox, crop: { x: number; y: number; width: number; height: number }): boolean {
  const left = box.x * SOURCE.width;
  const right = (box.x + box.w) * SOURCE.width;
  const top = box.y * SOURCE.height;
  const bottom = (box.y + box.h) * SOURCE.height;
  return left >= crop.x - 0.5 && right <= crop.x + crop.width + 0.5 && top >= crop.y - 0.5 && bottom <= crop.y + crop.height + 0.5;
}

function inBounds(crop: { x: number; y: number; width: number; height: number }): boolean {
  return crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= SOURCE.width && crop.y + crop.height <= SOURCE.height;
}

describe("prozor i uzorci", () => {
  test("sva četiri odnosa: najveći prozor tog odnosa, parne stranice, unutar kadra", () => {
    for (const target of VIDEO_REFRAME_TARGETS) {
      const aspect = targetAspect(target);
      const window = reframeWindow(SOURCE.width, SOURCE.height, aspect);
      expect(window.width % 2, target).toBe(0);
      expect(window.height % 2, target).toBe(0);
      expect(window.width).toBeLessThanOrEqual(SOURCE.width);
      expect(window.height).toBeLessThanOrEqual(SOURCE.height);
      expect(Math.abs(window.width / window.height - aspect), target).toBeLessThan(0.01);
      // Bar jedna stranica je puna (najveći prozor).
      expect(window.width === SOURCE.width || window.height === SOURCE.height, target).toBe(true);
    }
    expect(reframeWindow(1920, 1080, 9 / 16)).toEqual({ width: 606, height: 1080 });
    expect(reframeWindow(1080, 1920, 16 / 9)).toEqual({ width: 1080, height: 606 });
    expect(reframeOutputSize({ width: 606, height: 1080 }, 1920)).toEqual({ width: 606, height: 1080 });
    expect(reframeOutputSize({ width: 2160, height: 3840 }, 1920)).toEqual({ width: 1080, height: 1920 });
  });

  test("uzorci na 5/s, sredina intervala, sa gornjom granicom", () => {
    expect(reframeSampleTimes(1)).toEqual([0.1, 0.3, 0.5, 0.7, 0.9]);
    expect(reframeSampleTimes(1000)).toHaveLength(600);
    expect(reframeSampleTimes(0)).toEqual([]);
    expect(reframeSampleTimes(Number.NaN)).toEqual([]);
  });
});

describe("isečci za detektor (malo lice u širokom kadru)", () => {
  test("kvadrati duž duže stranice, preklopljeni, pokrivaju ceo kadar", () => {
    const tiles = detectionTiles(1280, 720);
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toEqual({ x: 0, y: 0, size: 720 });
    expect(tiles[tiles.length - 1]!.x + 720).toBe(1280);
    expect(detectionTiles(720, 1280).every((tile) => tile.x === 0)).toBe(true);
    expect(detectionTiles(500, 500)).toEqual([]);
  });

  test("isto lice iz dva isečka ostaje jednom (najsigurnije), različita lica oba", () => {
    const a = face(0.5, 0.5, 0.1, 0.8);
    const b = { ...face(0.505, 0.5, 0.1, 0.95) };
    const far = face(0.1, 0.5, 0.1, 0.7);
    expect(mergeFaces([a, b, far])).toEqual([b, far]);
  });
});

describe("praćenje glavnog lika", () => {
  test("bez prethodnog uzima najveće lice, posle toga najbliže; slaba lica ne broje", () => {
    const small = face(0.2, 0.5, 0.05);
    const big = face(0.8, 0.5, 0.15);
    const weak = face(0.5, 0.5, 0.3, 0.2);
    const tracked = trackSubject([
      { t: 0, faces: [small, big, weak] },
      { t: 0.2, faces: [face(0.25, 0.5, 0.05), face(0.78, 0.5, 0.15)] },
      { t: 0.4, faces: [weak] },
    ]);
    expect(tracked[0]!.face).toBe(big);
    expect(tracked[1]!.face?.x).toBeCloseTo(0.78 - 0.075);
    expect(tracked[2]!.face).toBeNull();
  });
});

describe("putanja isečka", () => {
  test("lice ostaje celo u kadru na putanji sa skokom, šumom i nestankom - za sva četiri odnosa", () => {
    const path = (t: number) => {
      if (t > 6 && t < 7.5) return null; // lice nestaje (okrenuo se)
      const x = t < 4 ? 0.3 + 0.03 * t : 0.72; // skok sa leve na desnu stranu u 4. sekundi
      return { x: x + jitter(t, 0.004), y: 0.45 + jitter(t + 1, 0.004) };
    };
    const input = samples(10, path);
    for (const target of VIDEO_REFRAME_TARGETS) {
      const result = reframePath(input, SOURCE, targetAspect(target));
      let lastFace: FaceBox | null = null;
      for (const sample of input) {
        const crop = cropAt(result, sample.t);
        expect(inBounds(crop), `${target} @${sample.t}`).toBe(true);
        const current: FaceBox | null = sample.faces[0] ?? lastFace;
        lastFace = current ?? lastFace;
        // Lice koje je stalo u prozor mora biti celo u isečku (i dok ga detektor ne vidi - poslednje viđeno).
        if (current && current.w * SOURCE.width < crop.width && current.h * SOURCE.height < crop.height) {
          expect(faceInside(current, crop), `${target} @${sample.t}`).toBe(true);
        }
      }
    }
  });

  test("brzina kamere je ograničena kad lice ide polako", () => {
    // Lice klizi kroz ceo kadar za 8 s (0,05 kadra u sekundi), uz sitan šum.
    const input = samples(8, (t) => ({ x: 0.3 + 0.05 * t + jitter(t, 0.003), y: 0.5 }));
    const result = reframePath(input, SOURCE, 9 / 16);
    const maxPxPerSecond = REFRAME_DEFAULTS.maxSpeed * SOURCE.width;
    for (let index = 1; index < result.keys.length; index++) {
      const a = result.keys[index - 1]!;
      const b = result.keys[index]!;
      const speed = Math.abs(b.x - a.x) / (b.t - a.t);
      expect(speed).toBeLessThanOrEqual(maxPxPerSecond + 6); // +zaokruživanje na ceo piksel
    }
    // Kamera se stvarno pomerila za licem.
    expect(result.keys[result.keys.length - 1]!.x).toBeGreaterThan(result.keys[0]!.x + 300);
  });

  test("izglađivanje: šum detektora u mrtvoj zoni ne trese kadar", () => {
    const input = samples(6, (t) => ({ x: 0.5 + jitter(t, 0.008), y: 0.5 + jitter(t + 3, 0.008) }));
    const result = reframePath(input, SOURCE, 9 / 16);
    const xs = result.keys.map((key) => key.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(0);
  });

  test("glatko: nagla promena cilja ne daje skok kad lice ostaje u kadru", () => {
    // Lice se pomeri malo u desno, ali ostaje unutar isečka - kamera klizi, ne skače.
    const input = samples(4, (t) => ({ x: t < 1 ? 0.5 : 0.56, y: 0.5 }));
    const result = reframePath(input, SOURCE, 9 / 16);
    const steps = result.keys.slice(1).map((key, index) => Math.abs(key.x - result.keys[index]!.x));
    expect(Math.max(...steps)).toBeLessThanOrEqual(REFRAME_DEFAULTS.maxSpeed * SOURCE.width * 0.2 + 1);
    expect(result.keys[result.keys.length - 1]!.x).toBeGreaterThan(result.keys[0]!.x);
  });

  test("lice nestane: isečak stoji na poslednjem mestu", () => {
    const input = samples(6, (t) => (t < 2 ? { x: 0.7, y: 0.5 } : null));
    const result = reframePath(input, SOURCE, 1);
    const atTwo = cropAt(result, 2);
    expect(cropAt(result, 5.9).x).toBe(atTwo.x);
  });

  test("video bez lica: isečak u sredini; isti odnos: ceo kadar", () => {
    const empty = reframePath(samples(3, () => null), SOURCE, 9 / 16);
    expect(cropAt(empty, 1.5)).toEqual({ x: Math.round((1920 - 606) / 2), y: 0, width: 606, height: 1080 });
    const same = reframePath(samples(3, () => ({ x: 0.1, y: 0.5 })), SOURCE, 16 / 9);
    expect(cropAt(same, 1)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(faceCoverage(samples(3, () => null))).toBe(0);
    expect(faceCoverage(samples(2, (t) => (t < 1 ? { x: 0.5, y: 0.5 } : null)))).toBe(0.5);
  });

  test("lice na ivici kadra: isečak se zaustavlja na ivici, ne izlazi", () => {
    const input = samples(3, () => ({ x: 0.03, y: 0.5 }));
    const result = reframePath(input, SOURCE, 9 / 16);
    for (const key of result.keys) expect(key.x).toBe(0);
  });

  test("interpolacija između uzoraka", () => {
    const path = { width: 606, height: 1080, srcWidth: 1920, srcHeight: 1080, keys: [{ t: 0, x: 100, y: 0 }, { t: 1, x: 300, y: 0 }] };
    expect(cropAt(path, 0.5).x).toBe(200);
    expect(cropAt(path, -1).x).toBe(100);
    expect(cropAt(path, 9).x).toBe(300);
    // Ključ van kadra se ipak seče na granicu.
    expect(cropAt({ ...path, keys: [{ t: 0, x: 5000, y: -20 }] }, 0)).toEqual({ x: 1314, y: 0, width: 606, height: 1080 });
  });
});
