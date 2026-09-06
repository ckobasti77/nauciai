import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { applyHomography, solveHomography, type Homography, type Quad } from "./homography";
import {
  derivePlateQuad,
  HERO_GEOMETRY,
  HERO_PAGE_QUAD,
  HERO_PLATE_UV,
  HERO_PLATES,
  HERO_PLATES_PORTRAIT,
  heroCardsBreakpoint,
  heroCardsMediaQuery,
  heroPlates,
  liftMatrix3d,
  minPlateWidthVideoPx,
  plateLayout,
  plateLiftedQuadVideoPx,
  plateQuadVideoPx,
  plateSizeVideoPx,
  type HeroGeometry,
} from "./hero-cards";

const UNIT: Quad = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const pageToUv = (geometry: HeroGeometry) => solveHomography(HERO_GEOMETRY[geometry].pageQuad, UNIT);

const parseMatrix = (matrix3d: string): Homography => {
  const m = matrix3d
    .slice("matrix3d(".length, -1)
    .split(",")
    .map((v) => Number(v.trim()));
  // Rekonstruiši 3×3 iz column-major 4×4.
  return [m[0], m[4], m[12], m[1], m[5], m[13], m[3], m[7], m[15]];
};

describe("HERO_PLATES (landscape)", () => {
  it("has the four cards in plate order", () => {
    expect(HERO_PLATES.map((p) => p.key)).toEqual(["courses", "studio", "community", "account"]);
    expect(HERO_PLATES.every((p) => p.geometry === "landscape")).toBe(true);
    expect(HERO_PAGE_QUAD).toBe(HERO_GEOMETRY.landscape.pageQuad);
    expect(HERO_PLATE_UV).toBe(HERO_GEOMETRY.landscape.plateUv);
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
    const toUv = pageToUv("landscape");
    for (const plate of HERO_PLATES) {
      for (const p of plateQuadVideoPx(plate)) {
        const [u, v] = applyHomography(toUv, p);
        expect(u).toBeGreaterThanOrEqual(0.075); // spirala je uz u = 0
        expect(u).toBeLessThanOrEqual(0.965);
        expect(v).toBeGreaterThanOrEqual(0.045);
        expect(v).toBeLessThanOrEqual(0.855);
        // uvijeni ugao: v ≥ 0.865 za u > 0.9 (vrh na (0.928, 0.897))
        expect(u > 0.88 && v > 0.85).toBe(false);
      }
    }
  });
});

describe("HERO_PLATES_PORTRAIT", () => {
  it("has the same four cards in plate order and is what heroPlates('portrait') returns", () => {
    expect(HERO_PLATES_PORTRAIT.map((p) => p.key)).toEqual(HERO_PLATES.map((p) => p.key));
    expect(HERO_PLATES_PORTRAIT.every((p) => p.geometry === "portrait")).toBe(true);
    expect(heroPlates("portrait")).toBe(HERO_PLATES_PORTRAIT);
    expect(heroPlates("landscape")).toBe(HERO_PLATES);
  });

  it("matches the quads derived from the measured portrait page corners + uv grid (≤ 0.0006)", () => {
    for (const plate of HERO_PLATES_PORTRAIT) {
      const derived = derivePlateQuad(plate.column, plate.row, "portrait");
      plate.quad.forEach(([x, y], i) => {
        expect(Math.abs(x - derived[i][0])).toBeLessThanOrEqual(0.0006);
        expect(Math.abs(y - derived[i][1])).toBeLessThanOrEqual(0.0006);
      });
    }
  });

  it("keeps every corner inside the page, clear of the robot hand (v ≤ 0.045) and the curl (u ≥ 0.85, v ≥ 0.87)", () => {
    const toUv = pageToUv("portrait");
    for (const plate of HERO_PLATES_PORTRAIT) {
      for (const p of plateQuadVideoPx(plate)) {
        const [u, v] = applyHomography(toUv, p);
        expect(u).toBeGreaterThanOrEqual(0.065);
        expect(u).toBeLessThanOrEqual(0.975);
        expect(v).toBeGreaterThanOrEqual(0.055);
        expect(v).toBeLessThanOrEqual(0.855);
        expect(u > 0.84 && v > 0.86).toBe(false);
      }
    }
  });

  it("uses the smallest plate of ≈ 202 video px (courses, far row)", () => {
    expect(minPlateWidthVideoPx(HERO_PLATES_PORTRAIT)).toBeCloseTo(202.1, 0);
  });
});

describe.each(["landscape", "portrait"] as const)("uv grid (%s)", (geometry) => {
  it("uses identical plate sizes in page space (same uv span for every card)", () => {
    const [c0, c1] = HERO_GEOMETRY[geometry].plateUv.columns;
    const [r0, r1] = HERO_GEOMETRY[geometry].plateUv.rows;
    expect(c0[1] - c0[0]).toBeCloseTo(c1[1] - c1[0], 6);
    expect(r0[1] - r0[0]).toBeCloseTo(r1[1] - r1[0], 6);
  });
});

describe("heroCardsBreakpoint", () => {
  it("landscape: smallest plate 165.7 video px → 80 CSS px at ≥ 519 px tall; width is the lg design threshold", () => {
    expect(minPlateWidthVideoPx()).toBeCloseTo(165.7, 0);
    expect(heroCardsBreakpoint("landscape")).toEqual({ minWidth: 1024, minHeight: 519 });
    expect(heroCardsBreakpoint()).toEqual(heroCardsBreakpoint("landscape"));
  });

  it("portrait: smallest plate 202.1 video px → 80 CSS px at ≥ 761 px tall (no width — only crop)", () => {
    expect(heroCardsBreakpoint("portrait")).toEqual({ minHeight: 761 });
  });

  it("emits the literal media queries that app/globals.css uses to show the 3D layer", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(heroCardsMediaQuery("landscape")).toBe(
      "@media (orientation: landscape) and (min-width: 1024px) and (min-height: 519px)",
    );
    expect(heroCardsMediaQuery("portrait")).toBe("@media (orientation: portrait) and (min-height: 761px)");
    expect(css).toContain(heroCardsMediaQuery("landscape"));
    expect(css).toContain(heroCardsMediaQuery("portrait"));
  });
});

describe.each([
  ["landscape", HERO_PLATES],
  ["portrait", HERO_PLATES_PORTRAIT],
] as const)("plateLayout (%s)", (geometry, plates) => {
  it.each([1, 0.75, 0.44])("maps the card box onto the plate in layer px at scale %s (±0.5px)", (scale) => {
    for (const plate of plates) {
      const layout = plateLayout(plate, scale);
      const { width, height, matrix3d } = layout;
      const size = plateSizeVideoPx(plate);
      expect(width).toBeCloseTo(size.width * scale, 6);
      expect(height).toBeCloseTo(size.height * scale, 6);
      const h = parseMatrix(matrix3d);
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
        expect(Math.abs(layout.quad[i][0] - target[i][0] * scale)).toBeLessThan(1e-9);
      });
    }
  });

  it("gives the near plate a bigger box than the far plate (cards follow the page space)", () => {
    const far = plateLayout(plates[0], 1);
    const near = plateLayout(plates[3], 1);
    expect(near.width).toBeGreaterThan(far.width);
    expect(far.width).toBeGreaterThanOrEqual(HERO_GEOMETRY[geometry].video.width === 1920 ? 165 : 202);
  });
});

describe.each([
  ["landscape", HERO_PLATES],
  ["portrait", HERO_PLATES_PORTRAIT],
] as const)("lift along the page normal (%s)", (geometry, plates) => {
  it("moves every plate UP on screen (the way the page faces) with ~no change in size", () => {
    for (const plate of plates) {
      const flat = plateQuadVideoPx(plate);
      const lifted = plateLiftedQuadVideoPx(plate);
      const dy = lifted.reduce((s, p, i) => s + (p[1] - flat[i][1]), 0) / 4;
      const dx = lifted.reduce((s, p, i) => s + (p[0] - flat[i][0]), 0) / 4;
      expect(dy).toBeLessThan(-10); // ≥ 10 px videa nagore za h = 6 % širine lista
      expect(Math.abs(dx)).toBeLessThan(Math.abs(dy) / 4);
      const w = (q: Quad) => Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
      expect(w(lifted) / w(flat)).toBeGreaterThan(0.99);
      expect(w(lifted) / w(flat)).toBeLessThan(1.01);
    }
  });

  it("liftMatrix3d(t = 0) is the flat matrix and t = 1 maps the box onto the lifted plate (±0.5px)", () => {
    for (const plate of plates) {
      const layout = plateLayout(plate, 0.6);
      expect(liftMatrix3d(layout, 0)).toBe(layout.matrix3d);
      const h = parseMatrix(liftMatrix3d(layout, 1));
      const source: Quad = [
        [0, 0],
        [layout.width, 0],
        [layout.width, layout.height],
        [0, layout.height],
      ];
      source.forEach((p, i) => {
        const [x, y] = applyHomography(h, p);
        expect(Math.abs(x - layout.liftedQuad[i][0])).toBeLessThan(0.5);
        expect(Math.abs(y - layout.liftedQuad[i][1])).toBeLessThan(0.5);
      });
      // Senka beži SUPROTNO od podizanja: kartica ide nagore → senka nadole (lokalni y > 0).
      expect(layout.shadow[1]).toBeGreaterThan(0);
      expect(Math.hypot(layout.shadow[0], layout.shadow[1])).toBeGreaterThan(2);
    }
  });

  it(`lifts by 6 % of the page width along the normal — ${geometry} camera`, () => {
    const spec = HERO_GEOMETRY[geometry];
    expect(spec.focalPx).toBe(geometry === "landscape" ? 1200 : 3600);
  });
});
