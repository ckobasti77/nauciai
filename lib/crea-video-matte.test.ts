import { describe, expect, test } from "vitest";

import { blendMatte, MATTE_EDGE, matteAlpha, matteCoverage } from "./crea-video-matte";

describe("maska osobe kroz video (V18)", () => {
  test("izglađivanje kroz vreme: prva maska ostaje, sledeća se meša sa prethodnom", () => {
    const first = new Float32Array([0, 1]);
    expect(blendMatte(null, first)).toBe(first);
    const next = blendMatte(first, new Float32Array([1, 0]), 0.5);
    expect([...next]).toEqual([0.5, 0.5]);
    // Druga veličina (promena rezolucije) ne meša.
    const other = new Float32Array([1, 1, 1]);
    expect(blendMatte(first, other)).toBe(other);
  });

  test("treperenje ivice se prigušuje: naizmenična maska ostaje blizu sredine", () => {
    let mask: Float32Array | null = null;
    const values: number[] = [];
    for (let frame = 0; frame < 20; frame++) {
      mask = blendMatte(mask, new Float32Array([frame % 2 === 0 ? 0.3 : 0.9]));
      values.push(mask[0]!);
    }
    const tail = values.slice(10);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.6 * 0.6);
  });

  test("meka ivica: ispod praga providno, iznad puno, između glatko i rastuće", () => {
    const alpha = matteAlpha(new Float32Array([0, MATTE_EDGE.low, 0.55, MATTE_EDGE.high, 1]));
    expect(alpha[0]).toBe(0);
    expect(alpha[1]).toBe(0);
    expect(alpha[2]).toBeGreaterThan(100);
    expect(alpha[2]).toBeLessThan(160);
    expect(alpha[3]).toBe(255);
    expect(alpha[4]).toBe(255);
    expect(matteCoverage(new Uint8ClampedArray([255, 0]))).toBe(0.5);
    expect(matteCoverage(new Uint8ClampedArray([]))).toBe(0);
  });
});
