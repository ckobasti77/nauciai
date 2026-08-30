import { describe, expect, it } from "vitest";

import { clampBoundsToViewport } from "./floating-bounds";

describe("clampBoundsToViewport", () => {
  it("leaves a rectangle that already fits untouched", () => {
    expect(clampBoundsToViewport({ left: 240, width: 800 }, 1280)).toEqual({ left: 240, width: 800 });
  });

  it("cuts the width at the right edge instead of letting the dock overflow", () => {
    // Ovo je §5D: root studija je 1100px širok na 900px ekranu, dok bi izašao 200px desno.
    expect(clampBoundsToViewport({ left: 0, width: 1100 }, 900)).toEqual({ left: 0, width: 900 });
  });

  it("pulls a negative left back to the edge and keeps the visible remainder", () => {
    expect(clampBoundsToViewport({ left: -20, width: 800 }, 700)).toEqual({ left: 0, width: 700 });
  });

  it("never returns a negative width when the rectangle sits entirely off screen", () => {
    expect(clampBoundsToViewport({ left: 1400, width: 300 }, 900)).toEqual({ left: 900, width: 0 });
    expect(clampBoundsToViewport({ left: -900, width: 300 }, 900)).toEqual({ left: 0, width: 0 });
  });

  it("returns the measurement unchanged when the viewport width is unusable", () => {
    const bounds = { left: 10, width: 500 };
    expect(clampBoundsToViewport(bounds, 0)).toEqual(bounds);
    expect(clampBoundsToViewport(bounds, Number.NaN)).toEqual(bounds);
  });

  it("returns the measurement unchanged when the measurement itself is not a number", () => {
    const bounds = { left: Number.NaN, width: 500 };
    expect(clampBoundsToViewport(bounds, 1200)).toEqual(bounds);
  });
});
