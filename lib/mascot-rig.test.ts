import { describe, expect, it } from "vitest";

import {
  blenderAxisToThree,
  blenderDegreesToThreeRadians,
  MASCOT_EXPRESSIONS,
  MASCOT_JOINT_KEYS,
  MASCOT_MORPHS,
  mascotAllJointNodeNames,
  mascotDefaultJointValues,
  mascotFaceMeshNames,
  mascotJointNodes,
  mascotJointRange,
  MASCOT_MODEL_URL,
  setMorphInfluence,
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
      { name: "arm_lo_L_premium", axis: "bx", sign: -1 },
      { name: "arm_lo_R_premium", axis: "bx", sign: -1 },
    ]);
  });

  it("folds elbows FORWARD as the slider rises (REPORT: forward = negative Blender X)", () => {
    for (const variant of ["basic", "premium"] as const) {
      for (const joint of mascotJointNodes(variant, "elbows")) {
        // useFrame prosleđuje `value * sign` u konverziju; rastuća vrednost mora dati
        // NEGATIVAN Blender X (rotacija.x) = savijanje ka grudima.
        const { threeAxis, radians } = blenderDegreesToThreeRadians(joint.axis, 90 * joint.sign);
        expect(threeAxis).toBe("x");
        expect(radians).toBeLessThan(0);
      }
    }
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

describe("morph targets", () => {
  it("lists the five facial morphs, rest first in the UI order", () => {
    expect(MASCOT_MORPHS).toEqual(["blink", "wink_L", "smile_wide", "surprised", "happy_closed"]);
    expect(MASCOT_EXPRESSIONS).toEqual(["rest", ...MASCOT_MORPHS]);
  });

  it("names the three facial meshes per variant", () => {
    expect(mascotFaceMeshNames("premium")).toEqual(["eye_L_premium", "eye_R_premium", "mouth_premium"]);
  });

  it("sets influence by name through morphTargetDictionary", () => {
    const mesh = { morphTargetDictionary: { blink: 0, smile_wide: 2 }, morphTargetInfluences: [0, 0, 0] };
    setMorphInfluence(mesh, "smile_wide", 1);
    expect(mesh.morphTargetInfluences).toEqual([0, 0, 1]);
  });

  it("is a no-op when the mesh lacks that morph", () => {
    const mesh = { morphTargetDictionary: { blink: 0 }, morphTargetInfluences: [0] };
    setMorphInfluence(mesh, "surprised", 1);
    expect(mesh.morphTargetInfluences).toEqual([0]);
  });
});

describe("MASCOT_MODEL_URL", () => {
  it("points at the version-free public paths", () => {
    expect(MASCOT_MODEL_URL.basic).toBe("/models/mascot-basic.glb");
    expect(MASCOT_MODEL_URL.premium).toBe("/models/mascot-premium.glb");
  });
});
