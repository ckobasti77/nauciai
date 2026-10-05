import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";

import {
  arrowsToPhrases,
  DRAW_MOTION_MODELS,
  directionName,
  MAX_ARROWS,
  motionPrompt,
  regionName,
  usableArrows,
  type MotionArrow,
} from "./crea-motion-arrows";

describe("crtaj pokret (V12)", () => {
  test("oblast slike na mreži 3×3", () => {
    expect(regionName(0.1, 0.1)).toBe("upper left");
    expect(regionName(0.5, 0.5)).toBe("center");
    expect(regionName(0.9, 0.5)).toBe("middle right");
    expect(regionName(0.5, 0.95)).toBe("lower center");
    expect(regionName(1, 1)).toBe("lower right");
    expect(regionName(-0.2, 1.4)).toBe("lower left");
  });

  test("osam smerova (y raste nadole)", () => {
    expect(directionName(1, 0)).toBe("to the right");
    expect(directionName(-1, 0)).toBe("to the left");
    expect(directionName(0, -1)).toBe("upward");
    expect(directionName(0, 1)).toBe("downward");
    expect(directionName(1, -1)).toBe("up and to the right");
    expect(directionName(-1, 1)).toBe("down and to the left");
  });

  test("kratka strelica nije pokret; najviše pet strelica", () => {
    const tiny: MotionArrow = { x1: 0.5, y1: 0.5, x2: 0.52, y2: 0.51 };
    const real: MotionArrow = { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.2 };
    expect(usableArrows([tiny, real])).toEqual([real]);
    expect(usableArrows(Array.from({ length: 8 }, () => real))).toHaveLength(MAX_ARROWS);
  });

  test("rečenice: ko, kuda i koliko", () => {
    expect(arrowsToPhrases([{ x1: 0.15, y1: 0.2, x2: 0.85, y2: 0.2 }])).toEqual([
      "the subject in the upper left of the image moves to the right, a long way",
    ]);
    expect(arrowsToPhrases([{ x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.35 }])).toEqual([
      "the subject in the center of the image moves upward, a little",
    ]);
  });

  test("opis za model: reči korisnika, pa pokreti redom", () => {
    const arrows: MotionArrow[] = [
      { x1: 0.2, y1: 0.8, x2: 0.5, y2: 0.8 },
      { x1: 0.8, y1: 0.2, x2: 0.8, y2: 0.6 },
    ];
    const text = motionPrompt("Dečak i zmaj na livadi.", arrows);
    expect(text).toBe(
      "Dečak i zmaj na livadi. Motion: 1) the subject in the lower left of the image moves to the right, a medium distance; " +
        "2) the subject in the upper right of the image moves downward, a medium distance. Everything else keeps its place, the camera stays steady.",
    );
    expect(motionPrompt("Samo opis", [])).toBe("Samo opis");
    expect(motionPrompt("", [arrows[0]])).toMatch(/^Motion: the subject/);
  });

  test("modeli za crtanje pokreta oživljavaju sliku i primaju opis sa pokretima", () => {
    const prompt = motionPrompt("Mačka", [{ x1: 0.2, y1: 0.5, x2: 0.8, y2: 0.5 }]);
    for (const slug of DRAW_MOTION_MODELS) {
      const model = STUDIO_MODELS.find((entry) => entry.slug === slug)!;
      expect(model.kind, slug).toBe("video");
      expect(model.inputModes, slug).toContain("image");
      expect(sanitizeSpecParams(model.paramSpec, model.priceRule, { prompt }, "image").ok, slug).toBe(true);
    }
  });
});
