import { describe, expect, it } from "vitest";

import { changeContentSelection } from "./content-selection";

describe("dependent content selection", () => {
  const selected = { trackId: "track-a", courseId: "course-a", lessonId: "lesson-a" };

  it("resets course and lesson when track changes", () => {
    expect(changeContentSelection(selected, "track", "track-b")).toEqual({ trackId: "track-b", courseId: "", lessonId: "" });
  });

  it("resets lesson when course changes", () => {
    expect(changeContentSelection(selected, "course", "course-b")).toEqual({ trackId: "track-a", courseId: "course-b", lessonId: "" });
  });
});
