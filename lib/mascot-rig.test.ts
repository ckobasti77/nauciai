import { describe, expect, it } from "vitest";

import {
  blenderAxisToThree,
  blenderDegreesToThreeRadians,
  MASCOT_JOINT_KEYS,
  mascotAllJointNodeNames,
  mascotDefaultJointValues,
  mascotJointNodes,
  mascotJointRange,
  MASCOT_MODEL_URL,
} from "@/lib/mascot-rig";

describe("blenderAxisToThree", () => {
  it("maps Blender X -> three.js X (RIG.md conversion)", () => {
    expect(blenderAxisToThree("bx")).toEqual({ threeAxis: "x", sign: 1 });
  });
  it("maps Blender Z -> three.js Y", () => {
    expect(blenderAxisToThree("bz")).toEqual({ threeAxis: "y", sign: 1 });
  });
  it("maps Blender Y -> three.js -Z", () => {
    expect(blenderAxisToThree("by")).toEqual({ threeAxis: "z", sign: -1 });
  });
});

describe("blenderDegreesToThreeRadians", () => {
  it("converts degrees to radians on the mapped axis", () => {
    const result = blenderDegreesToThreeRadians("bx", 90);
    expect(result.threeAxis).toBe("x");
    expect(result.radians).toBeCloseTo(Math.PI / 2);
  });

  it("negates the angle for the Blender-Y axis", () => {
    const result = blenderDegreesToThreeRadians("by", 15);
    expect(result.threeAxis).toBe("z");
    expect(result.radians).toBeCloseTo(-(15 * Math.PI) / 180);
  });
});

describe("mascotJointRange", () => {
  it("gives the basic elbow range from RIG.md (-10..110)", () => {
    expect(mascotJointRange("basic", "elbows")).toEqual({ min: -10, max: 110, default: 0 });
  });

  it("gives the premium elbow range from RIG.md (-10..100)", () => {
    expect(mascotJointRange("premium", "elbows")).toEqual({ min: -10, max: 100, default: 0 });
  });

  it("shares the shoulder range (0..70) across both variants", () => {
    expect(mascotJointRange("basic", "shoulders")).toEqual(mascotJointRange("premium", "shoulders"));
  });
});

describe("mascotJointNodes", () => {
  it("resolves single-node joints per variant", () => {
    expect(mascotJointNodes("basic", "neck")).toEqual([{ name: "neck_basic", axis: "bx", sign: 1 }]);
    expect(mascotJointNodes("premium", "antenna")).toEqual([
      { name: "antenna_stem_premium", axis: "by", sign: 1 },
    ]);
  });

  it("mirrors the shoulder sign between L and R (Blender Y raise)", () => {
    const nodes = mascotJointNodes("basic", "shoulders");
    expect(nodes).toEqual([
      { name: "shoulder_L_basic", axis: "by", sign: 1 },
      { name: "shoulder_R_basic", axis: "by", sign: -1 },
    ]);
  });

  it("keeps the same sign for L/R elbows (Blender X bend)", () => {
    const nodes = mascotJointNodes("premium", "elbows");
    expect(nodes).toEqual([
      { name: "arm_lo_L_premium", axis: "bx", sign: 1 },
      { name: "arm_lo_R_premium", axis: "bx", sign: 1 },
    ]);
  });
});

describe("mascotAllJointNodeNames / mascotDefaultJointValues", () => {
  it("covers all 5 joint keys with no duplicate node names", () => {
    const names = mascotAllJointNodeNames("basic");
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(MASCOT_JOINT_KEYS.length);
  });

  it("defaults every joint to a value inside its own range", () => {
    for (const variant of ["basic", "premium"] as const) {
      const defaults = mascotDefaultJointValues(variant);
      for (const key of MASCOT_JOINT_KEYS) {
        const range = mascotJointRange(variant, key);
        expect(defaults[key]).toBeGreaterThanOrEqual(range.min);
        expect(defaults[key]).toBeLessThanOrEqual(range.max);
      }
    }
  });
});

describe("MASCOT_MODEL_URL", () => {
  it("points at the version-free public paths", () => {
    expect(MASCOT_MODEL_URL.basic).toBe("/models/mascot-basic.glb");
    expect(MASCOT_MODEL_URL.premium).toBe("/models/mascot-premium.glb");
  });
});
