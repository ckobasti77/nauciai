import { describe, expect, it } from "vitest";

import { canUseProLesson } from "./lesson-access";

describe("Pro lesson access", () => {
  it("allows staff regardless of the enrollment plan", () => {
    expect(canUseProLesson(undefined, "admin")).toBe(true);
    expect(canUseProLesson("basic", "admin")).toBe(true);
    expect(canUseProLesson("basic", "moderator")).toBe(true);
  });

  it("still allows the legacy pro_student role", () => {
    expect(canUseProLesson(undefined, "pro_student")).toBe(true);
  });

  it("allows Premium enrollments", () => {
    expect(canUseProLesson("premium", "student")).toBe(true);
  });

  it("keeps Pro data unavailable to Basic and to missing enrollments", () => {
    expect(canUseProLesson("basic", "student")).toBe(false);
    expect(canUseProLesson(undefined, "student")).toBe(false);
  });

  it("keeps Pro data unavailable on disabled lessons, even for Premium", () => {
    expect(canUseProLesson("premium", "student", false)).toBe(false);
    expect(canUseProLesson("premium", "admin", false)).toBe(false);
    expect(canUseProLesson(undefined, "pro_student", false)).toBe(false);
  });
});
