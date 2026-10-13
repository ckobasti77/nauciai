import { describe, expect, test } from "vitest";

import { igraArtOrNull, igraArtRenderable } from "./igra-art";
import {
  IGRA_SPIN_ONCE_SECONDS,
  IGRA_THREE_DPR,
  canUseIgra3d,
  igraFrameloop,
  igraSpinAngle,
  igraSpinRunning,
  igraThreeFallbackId,
} from "./igra-three";

describe("canUseIgra3d", () => {
  test("3D samo kad je sve ispunjeno: računar, dozvoljen pokret, WebGL", () => {
    expect(canUseIgra3d({ wideFine: true, reduced: false, webgl: true })).toBe(true);
  });

  test("telefon, smanjen pokret ili bez WebGL-a = nalepnica", () => {
    expect(canUseIgra3d({ wideFine: false, reduced: false, webgl: true })).toBe(false);
    expect(canUseIgra3d({ wideFine: true, reduced: true, webgl: true })).toBe(false);
    expect(canUseIgra3d({ wideFine: true, reduced: false, webgl: false })).toBe(false);
  });
});

describe("igraFrameloop", () => {
  test("stalno crta samo dok je u kadru, tab aktivan i model se kreće", () => {
    expect(igraFrameloop({ inView: true, hidden: false, animating: true })).toBe("always");
  });

  test("van kadra, u pozadinskom tabu ili kad se model smiri crta samo na zahtev", () => {
    expect(igraFrameloop({ inView: false, hidden: false, animating: true })).toBe("demand");
    expect(igraFrameloop({ inView: true, hidden: true, animating: true })).toBe("demand");
    expect(igraFrameloop({ inView: true, hidden: false, animating: false })).toBe("demand");
  });
});

describe("fallback nalepnica", () => {
  test("pehar i tri medalje imaju spremnu nalepnicu u manifestu", () => {
    const ids = [
      igraThreeFallbackId("pehar"),
      igraThreeFallbackId("medalja"),
      igraThreeFallbackId("medalja", "zlato"),
      igraThreeFallbackId("medalja", "srebro"),
      igraThreeFallbackId("medalja", "bronza"),
    ];
    expect(ids).toEqual(["rang.pehar", "rang.zlato", "rang.zlato", "rang.srebro", "rang.bronza"]);
    for (const id of ids) expect(igraArtRenderable(igraArtOrNull(id)!), id).toBe(true);
  });
});

describe("okret i ljuljanje", () => {
  test("DPR je najviše 1,5", () => {
    expect(IGRA_THREE_DPR).toEqual([1, 1.5]);
  });

  test("`once`: kreće od nule, raste i staje tačno na punom krugu", () => {
    expect(igraSpinAngle("once", 0)).toBe(0);
    let previous = 0;
    for (let step = 1; step <= 14; step += 1) {
      const angle = igraSpinAngle("once", (step / 14) * IGRA_SPIN_ONCE_SECONDS);
      expect(angle).toBeGreaterThan(previous);
      previous = angle;
    }
    expect(igraSpinAngle("once", IGRA_SPIN_ONCE_SECONDS)).toBeCloseTo(Math.PI * 2, 10);
    expect(igraSpinAngle("once", 60)).toBeCloseTo(Math.PI * 2, 10);
    expect(igraSpinAngle("once", -1)).toBe(0);
  });

  test("`once` se smiri posle 1,4 s, `idle` traje dok je u kadru", () => {
    expect(igraSpinRunning("once", 0)).toBe(true);
    expect(igraSpinRunning("once", IGRA_SPIN_ONCE_SECONDS - 0.01)).toBe(true);
    expect(igraSpinRunning("once", IGRA_SPIN_ONCE_SECONDS)).toBe(false);
    expect(igraSpinRunning("idle", 3600)).toBe(true);
  });

  test("`idle` se ljulja najviše ±12° i kreće iz sredine", () => {
    const limit = (12 * Math.PI) / 180;
    expect(igraSpinAngle("idle", 0)).toBe(0);
    let max = 0;
    for (let tenth = 0; tenth <= 200; tenth += 1) max = Math.max(max, Math.abs(igraSpinAngle("idle", tenth / 10)));
    expect(max).toBeLessThanOrEqual(limit + 1e-9);
    expect(max).toBeGreaterThan(limit * 0.95);
  });
});
