import { describe, expect, it } from "vitest";

import { applyHomography, homographyToMatrix3d, solveHomography, type Quad } from "./homography";

const rect: Quad = [
  [0, 0],
  [300, 0],
  [300, 230],
  [0, 230],
];

// Ploča „kursevi" sa lista sveske (px videa) — pravi cilj iz lib/hero-cards.ts.
const plate: Quad = [
  [1313, 415],
  [1466, 470],
  [1364, 565],
  [1212, 492],
];

describe("solveHomography", () => {
  it("maps the four source corners onto the four target corners within 0.5px", () => {
    const h = solveHomography(rect, plate);
    rect.forEach((p, i) => {
      const [x, y] = applyHomography(h, p);
      expect(Math.abs(x - plate[i][0])).toBeLessThan(0.5);
      expect(Math.abs(y - plate[i][1])).toBeLessThan(0.5);
    });
  });

  it("returns the identity for a quad mapped onto itself", () => {
    const h = solveHomography(rect, rect);
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    h.forEach((v, i) => expect(Math.abs(v - identity[i])).toBeLessThan(1e-9));
  });

  it("composes with its inverse back to the start point", () => {
    const forward = solveHomography(rect, plate);
    const back = solveHomography(plate, rect);
    const start: [number, number] = [120, 80];
    const [x, y] = applyHomography(back, applyHomography(forward, start));
    expect(Math.abs(x - start[0])).toBeLessThan(0.5);
    expect(Math.abs(y - start[1])).toBeLessThan(0.5);
  });

  it("keeps a point on an edge on the projected edge (straight lines stay straight)", () => {
    const h = solveHomography(rect, plate);
    const [x, y] = applyHomography(h, [150, 0]);
    // Sredina gornje ivice pravougaonika pada na duž TL→TR ploče (vektorski proizvod ≈ 0).
    const [ax, ay] = plate[0];
    const [bx, by] = plate[1];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    expect(Math.abs(cross) / Math.hypot(bx - ax, by - ay)).toBeLessThan(0.5);
  });

  it("throws on degenerate (collinear) input", () => {
    const flat: Quad = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ];
    expect(() => solveHomography(flat, plate)).toThrow();
  });
});

describe("homographyToMatrix3d", () => {
  it("emits a matrix3d with 16 numbers, z row/column identity and x/y/w from the homography", () => {
    const h = solveHomography(rect, plate);
    const css = homographyToMatrix3d(h);
    expect(css.startsWith("matrix3d(")).toBe(true);
    const values = css
      .slice("matrix3d(".length, -1)
      .split(",")
      .map((v) => Number(v.trim()));
    expect(values).toHaveLength(16);
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
    // Column-major: kolona 3 je (0,0,1,0); z članovi drugih kolona su 0.
    expect(values.slice(8, 12)).toEqual([0, 0, 1, 0]);
    expect(values[2]).toBe(0);
    expect(values[6]).toBe(0);
    expect(values[14]).toBe(0);
    expect(values[15]).toBe(1);
    // Kolona 1 = (h11, h21, 0, h31)
    expect(values[0]).toBeCloseTo(h[0], 9);
    expect(values[1]).toBeCloseTo(h[3], 9);
    expect(values[3]).toBeCloseTo(h[6], 9);
  });
});
