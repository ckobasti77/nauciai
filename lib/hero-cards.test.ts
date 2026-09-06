import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { applyHomography, solveHomography, type Homography, type Quad } from "./homography";
import {
  derivePlateQuad,
  HERO_PAGE_QUAD,
  HERO_PLATE_UV,
  HERO_PLATES,
  heroCardsBreakpoint,
  minPlateWidthVideoPx,
  plateLayout,
  plateQuadVideoPx,
  plateSizeVideoPx,
} from "./hero-cards";

const pageToUv = solveHomography(HERO_PAGE_QUAD, [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]);

describe("HERO_PLATES", () => {
  it("has the four cards in plate order", () => {
    expect(HERO_PLATES.map((p) => p.key)).toEqual(["courses", "studio", "community", "account"]);
  });

  it("matches the quads derived from the measured page corners + uv grid (≤ 0.0006 normalized)", () => {
    for (const plate of HERO_PLATES) {
      const derived = derivePlateQuad(plate.column, plate.row);
      plate.quad.forEach(([x, y], i) => {
        expect(Math.abs(x - derived[i][0])).toBeLessThanOrEqual(0.0006);
        expect(Math.abs(y - derived[i][1])).toBeLessThanOrEqual(0.0006);
      });
    }
  });

  it("keeps every corner inside the page, clear of the spiral edge and the curled corner", () => {
    for (const plate of HERO_PLATES) {
      for (const p of plateQuadVideoPx(plate)) {
        const [u, v] = applyHomography(pageToUv, p);
        expect(u).toBeGreaterThanOrEqual(0.075); // spirala je uz u = 0
        expect(u).toBeLessThanOrEqual(0.965);
        expect(v).toBeGreaterThanOrEqual(0.045);
        expect(v).toBeLessThanOrEqual(0.855);
        // uvijeni ugao: v ≥ 0.865 za u > 0.9 (vrh na (0.928, 0.897))
        expect(u > 0.88 && v > 0.85).toBe(false);
      }
    }
  });

  it("uses identical plate sizes in page space (same uv span for every card)", () => {
    const [c0, c1] = HERO_PLATE_UV.columns;
    const [r0, r1] = HERO_PLATE_UV.rows;
    expect(c0[1] - c0[0]).toBeCloseTo(c1[1] - c1[0], 6);
    expect(r0[1] - r0[0]).toBeCloseTo(r1[1] - r1[0], 6);
  });
});

describe("heroCardsBreakpoint", () => {
  it("derives the 3D-layer threshold from the smallest plate (165.6 video px → ≥ 1276×713)", () => {
    expect(minPlateWidthVideoPx()).toBeCloseTo(165.6, 0);
    expect(heroCardsBreakpoint()).toEqual({ minWidth: 1276, minHeight: 713 });
  });

  it("is the literal media query in app/globals.css", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const { minWidth, minHeight } = heroCardsBreakpoint();
    expect(css).toContain(`@media (min-width: ${minWidth}px) and (min-height: ${minHeight}px)`);
  });
});

describe("plateLayout", () => {
  it.each([1, 0.75, 0.6753])("maps the card box onto the plate in layer px at scale %s (±0.5px)", (scale) => {
    for (const plate of HERO_PLATES) {
      const { width, height, matrix3d } = plateLayout(plate, scale);
      const size = plateSizeVideoPx(plate);
      expect(width).toBeCloseTo(size.width * scale, 6);
      expect(height).toBeCloseTo(size.height * scale, 6);
      const m = matrix3d
        .slice("matrix3d(".length, -1)
        .split(",")
        .map((v) => Number(v.trim()));
      // Rekonstruiši 3×3 iz column-major 4×4 i primeni na 4 ugla box-a kartice.
      const h: Homography = [m[0], m[4], m[12], m[1], m[5], m[13], m[3], m[7], m[15]];
      const source: Quad = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ];
      const target = plateQuadVideoPx(plate);
      source.forEach((p, i) => {
        const [x, y] = applyHomography(h, p);
        expect(Math.abs(x - target[i][0] * scale)).toBeLessThan(0.5);
        expect(Math.abs(y - target[i][1] * scale)).toBeLessThan(0.5);
      });
    }
  });

  it("gives the near plate a bigger box than the far plate (cards follow the page space)", () => {
    const far = plateLayout(HERO_PLATES[0], 1);
    const near = plateLayout(HERO_PLATES[3], 1);
    expect(near.width).toBeGreaterThan(far.width * 1.4);
    expect(far.width).toBeGreaterThanOrEqual(165);
  });
});
