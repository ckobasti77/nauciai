import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";

import {
  ACT_COUNTDOWN_S,
  ACT_MOTION_MODEL,
  ACT_SECONDS,
  actClipProblem,
  actPhaseAt,
  clampActSeconds,
  pickRecorderType,
} from "./crea-act";

describe("Odglumi (V20)", () => {
  test("prenos pokreta je postojeći Kling red, naplata po sekundi okačenog videa", () => {
    const model = STUDIO_MODELS.find((entry) => entry.slug === ACT_MOTION_MODEL.slug)!;
    expect(model.inputModes).toEqual([ACT_MOTION_MODEL.inputMode]);
    expect(model.capabilities.quantity).toMatchObject({ from: "input_video_seconds" });
    expect(Object.keys(model.inputSpec[ACT_MOTION_MODEL.inputMode]!).sort()).toEqual(["image", "video"]);
  });

  test("format snimka: MP4 kad ga pregledač ume, inače WebM, inače ništa", () => {
    expect(pickRecorderType((type) => type.startsWith("video/mp4"))).toBe("video/mp4;codecs=avc1");
    expect(pickRecorderType((type) => type === "video/webm;codecs=vp8")).toBe("video/webm;codecs=vp8");
    expect(pickRecorderType(() => false)).toBeNull();
    expect(
      pickRecorderType(() => {
        throw new Error("nepoznat tip");
      }),
    ).toBeNull();
  });

  test("dužina snimka i provera klipa", () => {
    expect(clampActSeconds(1)).toBe(ACT_SECONDS.min);
    expect(clampActSeconds(99)).toBe(ACT_SECONDS.max);
    expect(clampActSeconds(Number.NaN)).toBe(ACT_SECONDS.default);
    expect(actClipProblem(null)).toBe("nema");
    expect(actClipProblem(1.5)).toBe("prekratko");
    expect(actClipProblem(5)).toBeNull();
    expect(actClipProblem(61)).toBe("predugo");
  });

  test("odbrojavanje 3-2-1, pa snimanje, pa kraj", () => {
    expect(actPhaseAt(0, 5)).toEqual({ phase: "odbrojavanje", left: 3 });
    expect(actPhaseAt(2.2, 5)).toEqual({ phase: "odbrojavanje", left: 1 });
    expect(actPhaseAt(ACT_COUNTDOWN_S, 5)).toEqual({ phase: "snimanje", left: 5 });
    expect(actPhaseAt(ACT_COUNTDOWN_S + 4.5, 5)).toEqual({ phase: "snimanje", left: 1 });
    expect(actPhaseAt(ACT_COUNTDOWN_S + 5, 5)).toEqual({ phase: "kraj", left: 0 });
  });
});
