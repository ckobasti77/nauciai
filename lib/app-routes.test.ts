import { describe, expect, it } from "vitest";

import { coursePath, legacyCourseRedirect, lessonPath, trackPath } from "./app-routes";

describe("app route builders", () => {
  it("prefixes the locale on every level of the hierarchy", () => {
    expect(trackPath("sr", "video-audio")).toBe("/sr/app/tracks/video-audio");
    expect(coursePath("sr", "video-audio-ai")).toBe("/sr/app/courses/video-audio-ai");
    expect(coursePath("en", "video-audio-ai")).toBe("/en/app/courses/video-audio-ai");
    expect(lessonPath("en", "video-audio-ai", "intro")).toBe("/en/app/courses/video-audio-ai/lessons/intro");
  });
});

describe("legacy ?course= redirect", () => {
  it("sends the old shape to the new route, in the right locale", () => {
    expect(legacyCourseRedirect("sr", { course: "video-audio-ai" })).toBe("/sr/app/courses/video-audio-ai");
    expect(legacyCourseRedirect("en", { course: "video-audio-ai" })).toBe("/en/app/courses/video-audio-ai");
  });

  it("does not redirect the plain grid", () => {
    expect(legacyCourseRedirect("sr", {})).toBeNull();
    expect(legacyCourseRedirect("sr", { course: undefined })).toBeNull();
    expect(legacyCourseRedirect("sr", { course: "" })).toBeNull();
  });

  it("carries every other param across", () => {
    // Stripe success_urls issued before the move arrive exactly like this.
    expect(legacyCourseRedirect("sr", { course: "video-audio-ai", checkout: "success" })).toBe(
      "/sr/app/courses/video-audio-ai?checkout=success",
    );
    expect(legacyCourseRedirect("en", { course: "websites", editModule: "m1", newLessonModule: "m2" })).toBe(
      "/en/app/courses/websites?editModule=m1&newLessonModule=m2",
    );
  });

  it("preserves repeated params and takes the first course value", () => {
    expect(legacyCourseRedirect("sr", { course: ["a", "b"] })).toBe("/sr/app/courses/a");
    expect(legacyCourseRedirect("sr", { course: "a", tag: ["x", "y"] })).toBe("/sr/app/courses/a?tag=x&tag=y");
  });

  it("encodes a slug so it cannot escape the segment", () => {
    expect(legacyCourseRedirect("sr", { course: "../../admin" })).toBe("/sr/app/courses/..%2F..%2Fadmin");
    expect(legacyCourseRedirect("sr", { course: "a b" })).toBe("/sr/app/courses/a%20b");
  });
});
