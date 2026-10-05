import { describe, expect, test } from "vitest";

import {
  ANGLES_GRID_PARAMS,
  ANGLES_PROMPT_MARKER,
  angleFileName,
  anglesGridPrompt,
  anglesSavings,
  CAMERA_ANGLES,
  GRID_INSET,
  gridCells,
  isAnglesGridPrompt,
} from "./crea-grid-crop";

describe("isecanje mreže 3×3", () => {
  test("9 polja, redom sleva nadesno pa odozgo nadole", () => {
    const cells = gridCells(3000, 3000);
    expect(cells).toHaveLength(9);
    expect(cells.map((cell) => [cell.row, cell.col])).toEqual([
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
    ]);
    expect(cells.map((cell) => cell.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cells[4]).toEqual({ index: 4, row: 1, col: 1, x: 1000, y: 1000, width: 1000, height: 1000 });
  });

  test("bez odsecanja polja pokrivaju svaki piksel tačno jednom (i kad se ne deli na 3)", () => {
    for (const [width, height] of [
      [4096, 4096],
      [1000, 1000],
      [1001, 997],
      [512, 768],
      [7, 5],
    ] as const) {
      const cells = gridCells(width, height);
      const hits = new Uint8Array(width * height);
      for (const cell of cells) {
        expect(cell.width).toBeGreaterThan(0);
        expect(cell.height).toBeGreaterThan(0);
        for (let y = cell.y; y < cell.y + cell.height; y++) for (let x = cell.x; x < cell.x + cell.width; x++) hits[y * width + x]! += 1;
      }
      expect(hits.every((count) => count === 1), `${width}×${height}`).toBe(true);
      // Polja se razlikuju najviše za piksel.
      const widths = new Set(cells.map((cell) => cell.width));
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    }
  });

  test("odsecanje ivice (tanka linija između kadrova) ostaje unutar svog polja", () => {
    const full = gridCells(4096, 4096);
    const inset = gridCells(4096, 4096, 3, 3, GRID_INSET);
    for (const [index, cell] of inset.entries()) {
      const outer = full[index]!;
      expect(cell.x).toBeGreaterThan(outer.x);
      expect(cell.y).toBeGreaterThan(outer.y);
      expect(cell.x + cell.width).toBeLessThan(outer.x + outer.width);
      expect(cell.y + cell.height).toBeLessThan(outer.y + outer.height);
      // Kvadrat ostaje kvadrat (do piksela - 4096 se ne deli na 3).
      expect(Math.abs(cell.width - cell.height)).toBeLessThanOrEqual(1);
    }
    // Ni sićušna slika ne daje prazno polje.
    for (const cell of gridCells(6, 6, 3, 3, 0.4)) expect(cell.width).toBeGreaterThan(0);
  });

  test("4K mreža daje 9 radova od ~1365 px", () => {
    const cells = gridCells(4096, 4096, 3, 3, GRID_INSET);
    expect(cells).toHaveLength(9);
    for (const cell of cells) expect(cell.width).toBeGreaterThan(1300);
    expect(ANGLES_GRID_PARAMS).toEqual({ aspect_ratio: "1:1", resolution: "4K" });
  });
});

describe("uglovi i opis za model", () => {
  test("devet različitih uglova, svaki sa tekstom na oba jezika", () => {
    expect(CAMERA_ANGLES).toHaveLength(9);
    expect(new Set(CAMERA_ANGLES.map((angle) => angle.id)).size).toBe(9);
    for (const angle of CAMERA_ANGLES) {
      for (const text of [angle.label, angle.prompt]) {
        expect(text.sr.trim()).not.toBe("");
        expect(text.en.trim()).not.toBe("");
      }
    }
  });

  test("opis nabraja svih 9 polja redom i traži mrežu bez razmaka i teksta", () => {
    for (const locale of ["sr", "en"] as const) {
      const prompt = anglesGridPrompt(locale, "bela pozadina");
      expect(prompt.startsWith(ANGLES_PROMPT_MARKER[locale])).toBe(true);
      expect(prompt).toContain("3×3");
      for (const [index, angle] of CAMERA_ANGLES.entries()) expect(prompt).toContain(`${index + 1}. ${angle.prompt[locale]}`);
      expect(prompt).toContain("bela pozadina");
    }
    expect(anglesGridPrompt("sr")).not.toContain("Dodatno");
  });

  test("rad je mreža uglova po prvom redu opisa (oba jezika), drugi opisi nisu", () => {
    expect(isAnglesGridPrompt(anglesGridPrompt("sr"))).toBe(true);
    expect(isAnglesGridPrompt(`  ${anglesGridPrompt("en")}`)).toBe(true);
    expect(isAnglesGridPrompt("mačka na krovu")).toBe(false);
    expect(isAnglesGridPrompt(null)).toBe(false);
    expect(isAnglesGridPrompt("")).toBe(false);
  });
});

describe("zašto je jeftinije", () => {
  test("jedna mreža naspram 9 zasebnih slika", () => {
    // Nano Banana 2: 4K mreža 33 kr, obična 1K slika 16 kr.
    expect(anglesSavings(33, 16)).toEqual({ grid: 33, separately: 144, perAngle: 3.7, saved: 111, percent: 77 });
  });

  test("bez cene nema računa", () => {
    expect(anglesSavings(null, 16)).toBeNull();
    expect(anglesSavings(33, null)).toBeNull();
    expect(anglesSavings(0, 16)).toBeNull();
  });

  test("ime fajla nosi redni broj i ugao", () => {
    expect(angleFileName(0, "image/jpeg")).toBe("crea-ugao-1-spreda.jpg");
    expect(angleFileName(8, "image/png")).toBe("crea-ugao-9-otpozadi.png");
  });
});
