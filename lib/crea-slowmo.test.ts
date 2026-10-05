import { describe, expect, test } from "vitest";

import { isLastFrame, SLOWMO_FACTORS, SLOWMO_MAX_INPUT_S, slowmoDuration, slowmoFrames, slowmoProblem } from "./crea-slowmo";

describe("usporeni snimak - tajming", () => {
  test("svaki kadar daje `factor` kadrova istog trajanja, sa stapanjem ka sledećem", () => {
    expect(slowmoFrames({ timestamp: 1, duration: 0.04 }, 4, true)).toEqual([
      { timestamp: 4, duration: 0.04, blend: 0 },
      { timestamp: 4.04, duration: 0.04, blend: 0.25 },
      { timestamp: 4.08, duration: 0.04, blend: 0.5 },
      { timestamp: 4.12, duration: 0.04, blend: 0.75 },
    ]);
    expect(slowmoFrames({ timestamp: 2, duration: 0.04 }, 2, false).map((frame) => frame.blend)).toEqual([0, 0]);
  });

  test("ceo klip: trenuci rastu bez rupa i preklapanja, trajanje × factor", () => {
    for (const factor of SLOWMO_FACTORS) {
      const fps = 25;
      const frames = Array.from({ length: 50 }, (_, index) => ({ timestamp: index / fps, duration: 1 / fps }));
      const out = frames.flatMap((frame, index) => slowmoFrames(frame, factor, index < frames.length - 1));
      expect(out).toHaveLength(50 * factor);
      for (let index = 1; index < out.length; index++) {
        expect(out[index]!.timestamp - out[index - 1]!.timestamp).toBeCloseTo(1 / fps, 5);
      }
      const last = out[out.length - 1]!;
      expect(last.timestamp + last.duration).toBeCloseTo(slowmoDuration(2, factor), 5);
    }
  });

  test("granica ulaza i poslednji kadar", () => {
    expect(slowmoProblem(SLOWMO_MAX_INPUT_S)).toBeNull();
    expect(slowmoProblem(11)).toBe("predugo");
    expect(slowmoProblem(0)).toBe("prazno");
    expect(isLastFrame({ timestamp: 1.96, duration: 0.04 }, 2)).toBe(true);
    expect(isLastFrame({ timestamp: 1.92, duration: 0.04 }, 2)).toBe(false);
    // Kadar bez trajanja dobija 1/30 s.
    expect(slowmoFrames({ timestamp: 0, duration: 0 }, 2, true)[1]!.timestamp).toBeCloseTo(1 / 30, 5);
  });
});
