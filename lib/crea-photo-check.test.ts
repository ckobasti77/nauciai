import { describe, expect, test } from "vitest";

import {
  assessPhoto,
  laplacianVariance,
  mainFaceOf,
  photoCheckParams,
  sharpnessRegion,
  toGrayscale,
  type FaceBox,
} from "./crea-photo-check";

function face(x: number, y: number, size: number, score = 0.9): FaceBox {
  return { x, y, width: size, height: size, score };
}

describe("oštrina", () => {
  test("ravna slika nema ivica, šahovnica ih ima mnogo", () => {
    const size = 32;
    const flat = new Float32Array(size * size).fill(128);
    expect(laplacianVariance(flat, size, size)).toBe(0);

    const board = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) board[y * size + x] = (x + y) % 2 ? 255 : 0;
    expect(laplacianVariance(board, size, size)).toBeGreaterThan(10_000);
  });

  test("zamućena ivica je manje oštra od oštre", () => {
    const size = 32;
    const sharp = new Float32Array(size * size);
    const soft = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        sharp[y * size + x] = x < 16 ? 0 : 255;
        soft[y * size + x] = Math.min(255, Math.max(0, (x - 8) * 16));
      }
    }
    expect(laplacianVariance(sharp, size, size)).toBeGreaterThan(laplacianVariance(soft, size, size));
  });

  test("premala slika daje 0, siva je BT.601", () => {
    expect(laplacianVariance([1, 2, 3, 4], 2, 2)).toBe(0);
    const gray = toGrayscale([255, 0, 0, 255, 0, 255, 0, 255], 2, 1);
    expect(gray[0]).toBeCloseTo(76.245, 2);
    expect(gray[1]).toBeCloseTo(149.685, 2);
  });
});

describe("procena", () => {
  test("jedno veliko oštro lice na dovoljno velikoj slici je odlično", () => {
    const result = assessPhoto({ width: 1200, height: 1600, faces: [face(400, 300, 500)], sharpness: 240 });
    expect(result.verdict).toBe("ok");
    expect(result.items.map((item) => [item.id, item.status])).toEqual([
      ["lica", "ok"],
      ["velicina", "ok"],
      ["ostrina", "ok"],
      ["rezolucija", "ok"],
    ]);
    expect(photoCheckParams(result)).toEqual({ ocena: "ok", lica: 1, velicina: 31, ostrina: 240, rezolucija: 1200 });
  });

  test("bez lica je loše, i nema stavke o veličini", () => {
    const result = assessPhoto({ width: 1000, height: 1000, faces: [], sharpness: 300 });
    expect(result.verdict).toBe("fail");
    expect(result.items.find((item) => item.id === "velicina")).toBeUndefined();
    expect(result.mainFace).toBeNull();
  });

  test("više osoba, sitno lice, mutno, mala slika", () => {
    const crowd = assessPhoto({ width: 1000, height: 1000, faces: [face(0, 0, 300), face(500, 0, 250)], sharpness: 300 });
    expect(crowd.verdict).toBe("warn");
    expect(crowd.mainFace?.width).toBe(300);

    const tiny = assessPhoto({ width: 2000, height: 2000, faces: [face(0, 0, 150)], sharpness: 300 });
    expect(tiny.items.find((item) => item.id === "velicina")).toMatchObject({ status: "fail", value: 8 });

    const blurry = assessPhoto({ width: 1000, height: 1000, faces: [face(0, 0, 400)], sharpness: 25 });
    expect(blurry.items.find((item) => item.id === "ostrina")?.status).toBe("fail");
    expect(assessPhoto({ width: 1000, height: 1000, faces: [face(0, 0, 400)], sharpness: 70 }).verdict).toBe("warn");

    const small = assessPhoto({ width: 400, height: 300, faces: [face(0, 0, 150)], sharpness: 300 });
    expect(small.items.find((item) => item.id === "rezolucija")).toMatchObject({ status: "warn", value: 300 });
  });

  test("isečak za oštrinu ostaje unutar slike", () => {
    expect(sharpnessRegion(null, 800, 600)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(sharpnessRegion(face(0, 0, 100), 800, 600)).toEqual({ x: 0, y: 0, width: 110, height: 110 });
    expect(sharpnessRegion(face(750, 550, 100), 800, 600)).toEqual({ x: 740, y: 540, width: 60, height: 60 });
    expect(mainFaceOf([])).toBeNull();
  });
});
