import { describe, expect, it } from "vitest";

import {
  creaMotion,
  creaMotionFor,
  cubicBezierCss,
  pageMotionSceneKey,
  pageMotionVariantForPath,
  pageTurnDirection,
} from "./motion-contract";

describe("page motion route contract", () => {
  it("uses showcase motion for the signature landing surfaces", () => {
    // sr je bez prefiksa (/, /app), en nosi /en; stara /sr forma i dalje mora da radi.
    expect(pageMotionVariantForPath("/")).toBe("showcase");
    expect(pageMotionVariantForPath("/en")).toBe("showcase");
    expect(pageMotionVariantForPath("/app")).toBe("showcase");
    expect(pageMotionVariantForPath("/en/app")).toBe("showcase");
    expect(pageMotionVariantForPath("/app/classroom/courses/video-audio-ai")).toBe("showcase");
    expect(pageMotionVariantForPath("/sr/app/classroom/courses/video-audio-ai")).toBe("showcase");
    expect(pageMotionVariantForPath("/app/community/discussions")).toBe("showcase");
  });

  it("keeps lesson and editor routes focused", () => {
    expect(pageMotionVariantForPath("/app/classroom/courses/video/lessons/intro")).toBe("focus");
    expect(pageMotionVariantForPath("/en/app/classroom/courses/video/lessons/intro/edit")).toBe("focus");
  });

  it("keys a scene on the pathname alone, so each course is its own scene", () => {
    expect(pageMotionSceneKey("/app")).toBe("/app");
    expect(pageMotionSceneKey("/app/classroom/courses/video-audio-ai")).toBe(
      "/app/classroom/courses/video-audio-ai",
    );
    expect(pageMotionSceneKey("/app/classroom/courses/websites")).not.toBe(
      pageMotionSceneKey("/app/classroom/courses/video-audio-ai"),
    );
    expect(pageMotionSceneKey("/app/community/discussions")).toBe("/app/community/discussions");
  });
});

describe("Crea motion contract (K25, U16)", () => {
  it("removes all spatial motion, loops, confetti and 3D under prefers-reduced-motion", () => {
    const reduced = creaMotionFor(true);
    expect(reduced.isReduced).toBe(true);
    expect(reduced.pageTurn.rotateY).toBe(0);
    expect(reduced.pageTurn.x).toBe(0);
    expect(reduced.pageTurn.duration).toBeLessThanOrEqual(0.15);
    expect(reduced.sheetFlip.rotateY).toBe(0);
    expect(reduced.sheetFlip.duration).toBe(0);
    expect(reduced.sheetFlip.stagger).toBe(0);
    expect(reduced.pencilFill.animate).toBe(false);
    expect(reduced.sketchAnimated).toBe(false);
    expect(reduced.reveal).toMatchObject({ polaroid: 0, film: 0, kaseta: 0 });
    expect(reduced.confetti).toBe(false);
    expect(reduced.mascot3d).toBe(false);
  });

  it("keeps the notebook vocabulary when motion is allowed", () => {
    const full = creaMotionFor(false);
    expect(full.pageTurn.rotateY).toBe(creaMotion.pageTurn.rotateY);
    expect(full.sheetFlip.rotateY).toBeLessThan(0);
    expect(full.confetti && full.mascot3d && full.sketchAnimated && full.pencilFill.animate).toBe(true);
  });

  it("stays inside the motion budget: small turn angle, stagger under 500 ms, timed reveals", () => {
    expect(Math.abs(creaMotion.pageTurn.rotateY)).toBeLessThanOrEqual(20);
    expect(creaMotion.sheetFlip.stagger * creaMotion.sheetFlip.maxStaggerItems).toBeLessThan(0.5);
    for (const seconds of [creaMotion.reveal.polaroid, creaMotion.reveal.film, creaMotion.reveal.kaseta]) {
      expect(seconds).toBeGreaterThan(0.6);
      expect(seconds).toBeLessThanOrEqual(2.5);
    }
    expect(creaMotion.tipRotateMs).toBe(20_000);
  });

  it("turns pages in the direction of the tab", () => {
    const order = ["slika", "video", "zvuk"];
    expect(pageTurnDirection(order, "slika", "zvuk")).toBe(1);
    expect(pageTurnDirection(order, "zvuk", "video")).toBe(-1);
    expect(pageTurnDirection(order, null, "slika")).toBe(1);
    expect(pageTurnDirection(order, "video", null)).toBe(-1);
    expect(pageTurnDirection(order, "video", "video")).toBe(0);
  });

  it("formats curves for CSS", () => {
    expect(cubicBezierCss([0.16, 1, 0.3, 1])).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
  });
});
