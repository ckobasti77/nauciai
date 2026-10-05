/**
 * „3D foto" (S33, K10): ulaz za Depth Anything V2 Small po pravilima DPT
 * procesora, sređivanje dubine, petlja kamere bez trzaja i veličina videa.
 */
import { describe, expect, test } from "vitest";

import {
  blurDepth,
  cameraOffset,
  depthInputSize,
  DEPTH_PREPROCESS,
  normalizeDepth,
  photo3dFrames,
  photo3dCameraDistance,
  photo3dFitDistance,
  photo3dFrameInside,
  photo3dTravel,
  photo3dSegments,
  photo3dVideoSize,
  PHOTO3D_MAX_SIDE,
  PHOTO3D_MOTIONS,
  PHOTO3D_STRENGTHS,
  rgbaToTensor,
} from "./crea-photo3d";

describe("ulaz modela", () => {
  test("umnožak 14, odnos stranica približno očuvan", () => {
    for (const [w, h] of [[4000, 3000], [1080, 1350], [300, 200], [1920, 1080], [518, 518]] as const) {
      const size = depthInputSize(w, h);
      expect(size.width % 14, `${w}x${h}`).toBe(0);
      expect(size.height % 14, `${w}x${h}`).toBe(0);
      expect(size.width / size.height).toBeCloseTo(w / h, 1);
    }
    expect(depthInputSize(518, 518)).toEqual({ width: 518, height: 518 });
  });

  test("kao DPT: bira razmeru bližu 1 (veća fotka se spušta na 518 po kraćoj strani)", () => {
    // 4000 × 3000: razmera visine (0,173) je bliža 1 od razmere širine (0,13).
    expect(depthInputSize(4000, 3000)).toEqual({ width: 686, height: 518 });
    expect(depthInputSize(300, 200)).toEqual({ width: 518, height: 350 });
  });

  test("panorama ne pravi ogroman ulaz", () => {
    const size = depthInputSize(8000, 1000);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(DEPTH_PREPROCESS.maxSide);
  });

  test("tenzor je NCHW i normalizovan", () => {
    const rgba = new Uint8ClampedArray([255, 0, 128, 255, 0, 255, 0, 255]);
    const tensor = rgbaToTensor(rgba, 2, 1);
    expect(tensor.length).toBe(6);
    expect(tensor[0]).toBeCloseTo((1 - 0.485) / 0.229, 5); // R prvog piksela
    expect(tensor[1]).toBeCloseTo((0 - 0.485) / 0.229, 5); // R drugog piksela
    expect(tensor[3]).toBeCloseTo((1 - 0.456) / 0.224, 5); // G drugog piksela
  });
});

describe("dubina", () => {
  test("0..1, bliže = veće, krajnosti odsečene", () => {
    const raw = Float32Array.from({ length: 1000 }, (_, i) => i);
    raw[999] = 1_000_000; // jedan odsjaj ne sme da spljošti sve ostalo
    const depth = normalizeDepth(raw);
    expect(Math.min(...depth)).toBe(0);
    expect(Math.max(...depth)).toBe(1);
    expect(depth[500]).toBeGreaterThan(0.4);
    expect(depth[500]).toBeLessThan(0.6);
    expect(depth[100]!).toBeLessThan(depth[900]!);
  });

  test("ravna slika daje sredinu, prazan ulaz prazan izlaz", () => {
    expect([...normalizeDepth(new Float32Array(10).fill(3))]).toEqual(new Array(10).fill(0.5));
    expect(normalizeDepth([]).length).toBe(0);
  });

  test("zamućenje čuva ravnu površinu i ublažava ivicu", () => {
    const flat = new Float32Array(25).fill(0.7);
    for (const value of blurDepth(flat, 5, 5, 2)) expect(value).toBeCloseTo(0.7, 6);
    const edge = Float32Array.from({ length: 10 }, (_, i) => (i < 5 ? 0 : 1));
    const soft = blurDepth(edge, 10, 1, 1);
    expect(soft[4]).toBeGreaterThan(0);
    expect(soft[5]).toBeLessThan(1);
    expect(soft[0]).toBe(0);
    expect(blurDepth(edge, 10, 1, 0)).toEqual(edge);
  });
});

describe("kamera i video", () => {
  test("svaka putanja je petlja: početak i kraj su ista tačka", () => {
    for (const motion of PHOTO3D_MOTIONS) {
      for (const strength of PHOTO3D_STRENGTHS) {
        const start = cameraOffset(0, motion.id, strength.travel);
        const end = cameraOffset(1, motion.id, strength.travel);
        expect(end.x).toBeCloseTo(start.x, 9);
        expect(end.y).toBeCloseTo(start.y, 9);
        expect(end.z).toBeCloseTo(start.z, 9);
        const middle = cameraOffset(0.25, motion.id, strength.travel);
        expect(Math.hypot(middle.x, middle.y, middle.z), `${motion.id}`).toBeLessThanOrEqual(strength.travel * 2.5 + 1e-9);
      }
    }
    // Kamera kruži: u četvrtini kruga je skroz desno.
    expect(cameraOffset(0.25, "krug", 0.1).x).toBeCloseTo(0.1, 9);
    expect(cameraOffset(0.5, "priblizi", 0.1).z).toBeCloseTo(-0.12, 9);
  });

  test("ivica fotke se nikad ne vidi (ni na dubini pozadine), a kadar nije preterano uvećan", () => {
    const fit = photo3dFitDistance();
    expect(photo3dFrameInside({ x: 0, y: 0, z: fit * 0.99 }, 1, 0)).toBe(true);
    expect(photo3dFrameInside({ x: 0, y: 0, z: fit * 1.05 }, 1, 0)).toBe(false);
    for (const aspect of [9 / 16, 4 / 5, 1, 16 / 9]) {
      for (const motion of PHOTO3D_MOTIONS) {
        for (const strength of PHOTO3D_STRENGTHS) {
          const distance = photo3dCameraDistance(motion.id, strength, aspect);
          const where = `${aspect.toFixed(2)} ${motion.id} ${strength.id}`;
          expect(distance, where).toBeLessThanOrEqual(fit);
          // Najviše ~45 % uvećanja i za „jako".
          expect(distance, where).toBeGreaterThan(fit * 0.69);
          // Proveri i tačke putanje između onih koje je pretraga gledala.
          for (let i = 0; i < 97; i++) {
            const offset = cameraOffset(i / 97, motion.id, photo3dTravel(strength.travel, aspect));
            expect(photo3dFrameInside({ x: offset.x, y: offset.y, z: distance + offset.z }, aspect, strength.depth), `${where} t=${i}`).toBe(true);
          }
        }
      }
    }
  });

  test("video je parnih stranica, najviše 1080 px, istog odnosa", () => {
    for (const [w, h] of [[4032, 3024], [1081, 1351], [500, 333], [3000, 5000]] as const) {
      const size = photo3dVideoSize(w, h);
      expect(size.width % 2).toBe(0);
      expect(size.height % 2).toBe(0);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(PHOTO3D_MAX_SIDE);
      expect(size.width / size.height).toBeCloseTo(w / h, 1);
    }
    expect(photo3dVideoSize(500, 333)).toEqual({ width: 500, height: 332 });
  });

  test("kadrovi i mreža reljefa", () => {
    expect(photo3dFrames(5)).toEqual({ count: 150, frameDuration: 1 / 30 });
    expect(photo3dSegments(518, 350)).toEqual({ x: 130, y: 88 });
    expect(photo3dSegments(2000, 20)).toEqual({ x: 256, y: 16 });
  });
});
