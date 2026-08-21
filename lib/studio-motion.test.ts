import { describe, expect, it } from "vitest";

import {
  formatElapsedTime,
  getStudioMotion,
  studioMotionTokens,
  STUDIO_EASE_IN,
  STUDIO_EASE_OUT,
} from "./studio-motion";

describe("studioMotionTokens and motion vocabulary", () => {
  it("enforces exit duration is strictly faster than enter duration for all tiers", () => {
    expect(studioMotionTokens.mikro.exitDuration).toBeLessThan(studioMotionTokens.mikro.enterDuration);
    expect(studioMotionTokens.element.exitDuration).toBeLessThan(studioMotionTokens.element.enterDuration);
    expect(studioMotionTokens.prelaz.exitDuration).toBeLessThan(studioMotionTokens.prelaz.enterDuration);

    expect(studioMotionTokens.mikro.enterDuration).toBe(0.12);
    expect(studioMotionTokens.mikro.exitDuration).toBe(0.08);
    expect(studioMotionTokens.element.enterDuration).toBe(0.22);
    expect(studioMotionTokens.element.exitDuration).toBe(0.16);
    expect(studioMotionTokens.prelaz.enterDuration).toBe(0.26);
    expect(studioMotionTokens.prelaz.exitDuration).toBe(0.2);
  });

  it("uses standard easing bezier curves", () => {
    expect(studioMotionTokens.mikro.easeEnter).toEqual(STUDIO_EASE_OUT);
    expect(studioMotionTokens.mikro.easeExit).toEqual(STUDIO_EASE_IN);
    expect(studioMotionTokens.element.easeEnter).toEqual(STUDIO_EASE_OUT);
    expect(studioMotionTokens.element.easeExit).toEqual(STUDIO_EASE_IN);
    expect(studioMotionTokens.prelaz.easeEnter).toEqual(STUDIO_EASE_OUT);
    expect(studioMotionTokens.prelaz.easeExit).toEqual(STUDIO_EASE_IN);
  });

  it("returns zero durations and neutral transforms when reduced motion is active", () => {
    const motion = getStudioMotion(true);

    expect(motion.isReduced).toBe(true);

    // Mikro
    expect(motion.mikro.enter.duration).toBe(0);
    expect(motion.mikro.exit.duration).toBe(0);

    // Element
    expect(motion.element.enter.duration).toBe(0);
    expect(motion.element.exit.duration).toBe(0);
    expect(motion.element.stagger).toBe(0);

    // Prelaz
    expect(motion.prelaz.enter.duration).toBe(0);
    expect(motion.prelaz.exit.duration).toBe(0);
    expect(motion.prelaz.offset).toBe(0);
    expect(motion.prelaz.scale).toBe(1);

    // Spor
    expect(motion.spor.duration).toBe(0);
  });

  it("returns full token durations and transforms when reduced motion is disabled", () => {
    const motion = getStudioMotion(false);

    expect(motion.isReduced).toBe(false);

    // Mikro
    expect(motion.mikro.enter.duration).toBe(0.12);
    expect(motion.mikro.exit.duration).toBe(0.08);

    // Element
    expect(motion.element.enter.duration).toBe(0.22);
    expect(motion.element.exit.duration).toBe(0.16);
    expect(motion.element.stagger).toBe(0.025);

    // Prelaz
    expect(motion.prelaz.enter.duration).toBe(0.26);
    expect(motion.prelaz.exit.duration).toBe(0.2);
    expect(motion.prelaz.offset).toBe(24);
    expect(motion.prelaz.scale).toBe(0.985);

    // Spor
    expect(motion.spor.duration).toBe(2.0);
  });

  it("formats elapsed wait time accurately", () => {
    const start = 1_000_000;
    expect(formatElapsedTime(start, start + 5_000)).toBe("0:05");
    expect(formatElapsedTime(start, start + 45_000)).toBe("0:45");
    expect(formatElapsedTime(start, start + 59_000)).toBe("0:59");
    expect(formatElapsedTime(start, start + 60_000)).toBe("1:00");
    expect(formatElapsedTime(start, start + 74_000)).toBe("1:14");
    expect(formatElapsedTime(start, start + 125_000)).toBe("2:05");
    expect(formatElapsedTime(start, start - 1_000)).toBe("0:00");
  });
});
