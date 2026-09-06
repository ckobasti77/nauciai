import { describe, expect, it } from "vitest";

import {
  applyHomography,
  decomposeHomography,
  homographyToMatrix3d,
  planePoint,
  projectPoint,
  solveHomography,
  type Homography,
  type Quad,
  type Vec3,
} from "./homography";

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

describe("decomposeHomography", () => {
  // Sintetička kamera i ravan: R = Rz(15°)·Rx(55°), t = (0.2, 0.1, 3), f = 1000, glavna tačka (640, 360).
  const camera = { focal: 1000, principal: [640, 360] as const };
  const rx = (55 * Math.PI) / 180;
  const rz = (15 * Math.PI) / 180;
  const Rx = [
    [1, 0, 0],
    [0, Math.cos(rx), -Math.sin(rx)],
    [0, Math.sin(rx), Math.cos(rx)],
  ];
  const Rz = [
    [Math.cos(rz), -Math.sin(rz), 0],
    [Math.sin(rz), Math.cos(rz), 0],
    [0, 0, 1],
  ];
  const R = Rz.map((row) => Rx[0].map((_, j) => row[0] * Rx[0][j] + row[1] * Rx[1][j] + row[2] * Rx[2][j]));
  const t = [0.2, 0.1, 3];
  const width = 1.6; // fizička širina ravni (u-osa), visina 1.0 → axisU se normalizuje na 1
  const to3d = (u: number, v: number, lift = 0): Vec3 => [
    R[0][0] * u * width + R[0][1] * v + R[0][2] * lift + t[0],
    R[1][0] * u * width + R[1][1] * v + R[1][2] * lift + t[1],
    R[2][0] * u * width + R[2][1] * v + R[2][2] * lift + t[2],
  ];
  const unit: Quad = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const projected = unit.map(([u, v]) => projectPoint(to3d(u, v), camera)) as unknown as Quad;
  const h = solveHomography(unit, projected);
  const pose = decomposeHomography(h, camera);

  it("recovers the plane axes (scaled so |axisU| = 1) and the normal within 1e-6", () => {
    const expectVec = (got: Vec3, want: Vec3) => got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(1e-6));
    expectVec(pose.axisU, [R[0][0], R[1][0], R[2][0]]);
    expectVec(pose.axisV, [R[0][1] / width, R[1][1] / width, R[2][1] / width]);
    expectVec(pose.origin, [t[0] / width, t[1] / width, t[2] / width]);
    // Normala R·e3 gleda OD kamere (z > 0 za ovaj R) → vraća se okrenuta ka kameri.
    const n: Vec3 = [R[0][2], R[1][2], R[2][2]];
    const sign = n[2] > 0 ? -1 : 1;
    expectVec(pose.normal, [n[0] * sign, n[1] * sign, n[2] * sign]);
    expect(pose.normal[2]).toBeLessThan(0);
    expect(pose.origin[2]).toBeGreaterThan(0);
  });

  it("projects a point lifted along the normal exactly like the direct 3D construction (< 1e-6 px)", () => {
    const lift = 0.06; // u jedinicama širine ravni
    for (const [u, v] of [
      [0.3, 0.3],
      [0.7, 0.3],
      [0.7, 0.7],
      [0.3, 0.7],
    ] as const) {
      const viaPose = projectPoint(planePoint(pose, [u, v], lift), camera);
      // Direktno: R·(u·width, v, ∓lift·width) + t — normala je okrenuta ka kameri, pa je znak isti kao u pozi.
      const towardCamera = R[2][2] > 0 ? -1 : 1;
      const direct = projectPoint(to3d(u, v, towardCamera * lift * width), camera);
      expect(Math.abs(viaPose[0] - direct[0])).toBeLessThan(1e-6);
      expect(Math.abs(viaPose[1] - direct[1])).toBeLessThan(1e-6);
    }
  });

  it("is invariant to the sign of the homography (H and −H describe the same plane)", () => {
    const negated = h.map((v) => -v) as unknown as Homography;
    const other = decomposeHomography(negated, camera);
    other.normal.forEach((v, i) => expect(Math.abs(v - pose.normal[i])).toBeLessThan(1e-9));
    other.origin.forEach((v, i) => expect(Math.abs(v - pose.origin[i])).toBeLessThan(1e-9));
  });
});
