import { describe, expect, test } from "vitest";

import { photoCheckItemText } from "./crea-copy";
import {
  assessPhoto,
  faceCutShare,
  laplacianVariance,
  mainFaceOf,
  meanLuminance,
  photoCheckParams,
  photoCheckProblem,
  photoCheckSummary,
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
    // K14: uz nađeno lice ide i stavka „vidljivost" (lice celo u kadru, sigurnost detektora).
    expect(result.items.map((item) => [item.id, item.status])).toEqual([
      ["lica", "ok"],
      ["velicina", "ok"],
      ["vidljivost", "ok"],
      ["ostrina", "ok"],
      ["rezolucija", "ok"],
    ]);
    expect(photoCheckParams(result)).toEqual({
      ocena: "ok",
      lica: 1,
      velicina: 31,
      vidljivost: 90,
      ostrina: 240,
      rezolucija: 1200,
    });
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

describe("provera za Lik (K14, S35)", () => {
  const good = { width: 1200, height: 1600, faces: [face(400, 300, 500)], sharpness: 240, brightness: 140 };

  test("dobra fotka za lik prolazi, i ima stavku o svetlu", () => {
    const result = assessPhoto(good, "lik");
    expect(result.verdict).toBe("ok");
    expect(result.items.find((item) => item.id === "svetlo")).toMatchObject({ status: "ok", value: 140 });
    expect(photoCheckProblem(result)).toBeNull();
  });

  test("odbija lošu fotku sa jasnim razlogom na srpskom", () => {
    const cases: Array<[Parameters<typeof assessPhoto>[0], string]> = [
      [{ ...good, faces: [] }, "Nismo našli lice"],
      [{ ...good, faces: [face(100, 100, 400), face(700, 200, 380)] }, "Za lik treba fotka na kojoj si samo ti"],
      [{ ...good, faces: [face(0, 0, 120)] }, "Lice je premalo"],
      [{ ...good, faces: [face(-150, 300, 500)] }, "Lice je odsečeno ivicom slike"],
      [{ ...good, brightness: 20 }, "Lice je u mraku"],
      [{ ...good, sharpness: 12 }, "Mutno"],
      [{ ...good, width: 200, height: 240, faces: [face(40, 40, 120)] }, "Slika je premala"],
    ];
    for (const [input, reason] of cases) {
      const result = assessPhoto(input, "lik");
      expect(result.verdict, reason).toBe("fail");
      const problem = photoCheckProblem(result);
      expect(problem, reason).not.toBeNull();
      expect(photoCheckItemText(problem!, "sr"), reason).toContain(reason);
      expect(photoCheckItemText(problem!, "en").length, reason).toBeGreaterThan(10);
    }
  });

  test("premala slika: razlog je rezolucija, ne mutnoća koja iz nje sledi", () => {
    const tiny = assessPhoto({ ...good, width: 180, height: 225, faces: [face(40, 40, 90)], sharpness: 10 }, "lik");
    expect(photoCheckProblem(tiny)?.id).toBe("rezolucija");
  });

  test("dve osobe su upozorenje u opštoj proveri, a pad za lik", () => {
    const crowd = { ...good, faces: [face(100, 100, 400), face(700, 200, 380)] };
    expect(assessPhoto(crowd).verdict).toBe("warn");
    expect(assessPhoto(crowd, "lik").verdict).toBe("fail");
  });

  test("slabo vidljivo lice i loše svetlo su upozorenje", () => {
    expect(assessPhoto({ ...good, faces: [face(400, 300, 500, 0.5)] }, "lik").items.find((item) => item.id === "vidljivost")?.status).toBe("warn");
    expect(assessPhoto({ ...good, brightness: 60 }, "lik").verdict).toBe("warn");
    expect(assessPhoto({ ...good, brightness: 245 }, "lik").verdict).toBe("warn");
  });

  test("odsečeno lice i svetlina se mere tačno", () => {
    expect(faceCutShare(face(10, 10, 100), 400, 400)).toBe(0);
    expect(faceCutShare(face(-25, 10, 100), 400, 400)).toBe(0.25);
    expect(faceCutShare(face(350, 350, 100), 400, 400)).toBe(0.5);
    expect(meanLuminance([0, 100, 200])).toBe(100);
    expect(meanLuminance([])).toBe(0);
  });

  test("sažetak svih fotki Lika: najgora vrednost, ok samo bez pada", () => {
    const one = assessPhoto(good, "lik");
    const softer = assessPhoto({ ...good, sharpness: 80, faces: [face(400, 300, 320)] }, "lik");
    expect(photoCheckSummary([one, softer])).toEqual({ faces: 1, faceRatio: 0.2, sharpness: 80, ok: true });
    const bad = assessPhoto({ ...good, faces: [] }, "lik");
    expect(photoCheckSummary([one, bad]).ok).toBe(false);
    expect(photoCheckSummary([])).toEqual({ faces: 0, faceRatio: 0, sharpness: 0, ok: false });
  });
});
