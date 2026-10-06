import { describe, expect, test } from "vitest";

import { mascotLine, mascotMoodFor, mascotPoseAt, type CreaMascotMood } from "./crea-mascot";
import { MASCOT_JOINT_KEYS, mascotJointRange, type MascotVariant } from "./mascot-rig";

const MOODS: CreaMascotMood[] = ["razmislja", "slavi", "tuzna", "miruje"];
const VARIANTS: MascotVariant[] = ["basic", "premium"];

describe("maskota u Crei", () => {
  test("raspoloženje iz stanja rada", () => {
    expect(mascotMoodFor({ working: true, justFinished: false, justFailed: false })).toBe("razmislja");
    expect(mascotMoodFor({ working: false, justFinished: true, justFailed: false })).toBe("slavi");
    expect(mascotMoodFor({ working: false, justFinished: false, justFailed: true })).toBe("tuzna");
    expect(mascotMoodFor({ working: false, justFinished: false, justFailed: false })).toBe("miruje");
  });

  test("svaki ugao svake poze je u opsegu zgloba iz RIG.md (kroz celu petlju)", () => {
    for (const variant of VARIANTS) {
      for (const mood of MOODS) {
        for (let t = 0; t <= 4; t += 0.05) {
          const pose = mascotPoseAt(mood, t, variant);
          for (const key of MASCOT_JOINT_KEYS) {
            const range = mascotJointRange(variant, key);
            expect(pose.joints[key], `${variant}/${mood}/${key}@${t}`).toBeGreaterThanOrEqual(range.min);
            expect(pose.joints[key], `${variant}/${mood}/${key}@${t}`).toBeLessThanOrEqual(range.max);
          }
          for (const value of Object.values(pose.morphs)) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  test("slavi: ruke gore, osmeh i kratak skok koji se smiri", () => {
    const pose = mascotPoseAt("slavi", 0.3, "basic");
    expect(pose.joints.shoulders).toBeGreaterThan(30);
    expect(pose.morphs.happy_closed).toBe(1);
    expect(pose.lift).toBeGreaterThan(0);
    expect(mascotPoseAt("slavi", 2, "basic").lift).toBe(0);
  });

  test("tužna: glava dole, antena spuštena, sporije lebdi; miruje = podrazumevana poza", () => {
    const sad = mascotPoseAt("tuzna", 1, "premium");
    expect(sad.joints.neck).toBeGreaterThan(0);
    expect(sad.joints.antenna).toBeLessThan(0);
    expect(sad.idleSpeed).toBeLessThan(1);
    const idle = mascotPoseAt("miruje", 1, "basic");
    for (const key of MASCOT_JOINT_KEYS) expect(idle.joints[key]).toBe(mascotJointRange("basic", key).default);
    expect(idle.morphs).toEqual({});
  });

  test("razmišlja: glava se lagano okreće levo-desno", () => {
    const heads = [0.8, 2.4].map((t) => mascotPoseAt("razmislja", t, "basic").joints.head);
    expect(heads[0]).toBeGreaterThan(0);
    expect(heads[1]).toBeLessThan(0);
  });

  test("rečenica u oblačiću", () => {
    expect(mascotLine("razmislja", "sr")).toBe("Hmm, crtam…");
    expect(mascotLine("slavi", "en")).toBe("Done!");
    expect(mascotLine("miruje", "sr")).toBeNull();
  });
});
