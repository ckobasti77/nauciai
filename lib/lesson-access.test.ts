import { describe, expect, it } from "vitest";

import { canUseProLesson } from "./lesson-access";

describe("Pro lesson access", () => {
  it("allows admins, moderators and Pro students", () => {
    expect(canUseProLesson("admin")).toBe(true);
    expect(canUseProLesson("moderator")).toBe(true);
    expect(canUseProLesson("pro_student")).toBe(true);
  });

  it("keeps Pro data unavailable to Light users and disabled lessons", () => {
    expect(canUseProLesson("student")).toBe(false);
    expect(canUseProLesson("pro_student", false)).toBe(false);
  });
});
