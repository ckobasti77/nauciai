import { describe, expect, it } from "vitest";

import { lessonPosition, lessonPositionLabel, lessonStepLabel } from "./lesson-position";

const lessons = [{ slug: "uvod" }, { slug: "prompt" }, { slug: "slike" }];

describe("lessonPosition", () => {
  it("counts from one, the way the number is read out loud", () => {
    expect(lessonPosition(lessons, "uvod")).toEqual({ position: 1, total: 3 });
    expect(lessonPosition(lessons, "slike")).toEqual({ position: 3, total: 3 });
  });

  it("has no position when no lesson is open", () => {
    // Stranica kursa (bez lekcije) ne sme da nacrta marker „Ovde si".
    expect(lessonPosition(lessons, undefined)).toBeNull();
    expect(lessonPosition(lessons, "")).toBeNull();
  });

  it("has no position for an empty course", () => {
    expect(lessonPosition([], "uvod")).toBeNull();
  });

  it("has no position for a lesson that is no longer in the list", () => {
    // Lekcija skinuta iz kursa dok je student na njoj: bolje bez markera nego
    // sa izmisljenim brojem.
    expect(lessonPosition(lessons, "obrisana")).toBeNull();
  });

  it("takes the first match when two lessons share a slug", () => {
    const duplicated = [{ slug: "uvod" }, { slug: "uvod" }];
    expect(lessonPosition(duplicated, "uvod")).toEqual({ position: 1, total: 2 });
  });
});

describe("lessonPositionLabel", () => {
  it("writes the position in both languages", () => {
    expect(lessonPositionLabel("sr", { position: 3, total: 8 })).toBe("Lekcija 3 od 8");
    expect(lessonPositionLabel("en", { position: 3, total: 8 })).toBe("Lesson 3 of 8");
  });

  it("still reads correctly for a course with a single lesson", () => {
    expect(lessonPositionLabel("sr", { position: 1, total: 1 })).toBe("Lekcija 1 od 1");
    expect(lessonPositionLabel("en", { position: 1, total: 1 })).toBe("Lesson 1 of 1");
  });
});

describe("lessonStepLabel", () => {
  it("names the content blocks steps, not paragraphs", () => {
    expect(lessonStepLabel("sr", 2, 5)).toBe("Korak 2 od 5");
    expect(lessonStepLabel("en", 2, 5)).toBe("Step 2 of 5");
  });
});
