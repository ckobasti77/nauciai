import { describe, expect, it } from "vitest";

import {
  classroomPath,
  coursePath,
  legacyCourseRedirect,
  lessonEditPath,
  lessonPath,
  preserveSearchParams,
  trackPath,
} from "./app-routes";

describe("app route builders", () => {
  it("builds the classroom hierarchy per locale (sr prefixless, en under /en)", () => {
    expect(classroomPath("sr")).toBe("/app/classroom");
    expect(trackPath("sr", "video-audio")).toBe("/app/classroom/tracks/video-audio");
    expect(coursePath("sr", "video-audio-ai")).toBe("/app/classroom/courses/video-audio-ai");
    expect(coursePath("en", "video-audio-ai")).toBe("/en/app/classroom/courses/video-audio-ai");
    expect(lessonPath("en", "video-audio-ai", "intro")).toBe(
      "/en/app/classroom/courses/video-audio-ai/lessons/intro",
    );
    expect(lessonEditPath("en", "video-audio-ai", "intro")).toBe(
      "/en/app/classroom/courses/video-audio-ai/lessons/intro/edit",
    );
  });
});

describe("preserveSearchParams", () => {
  it("appends surviving params and keeps a bare base clean", () => {
    expect(preserveSearchParams("/app/classroom/courses/a", {})).toBe("/app/classroom/courses/a");
    expect(preserveSearchParams("/app/classroom/courses/a", { checkout: "success" })).toBe(
      "/app/classroom/courses/a?checkout=success",
    );
  });

  it("drops undefined and skipped keys, preserves repeats", () => {
    expect(
      preserveSearchParams("/app/classroom/courses/a", { course: "a", view: undefined, tag: ["x", "y"] }, ["course"]),
    ).toBe("/app/classroom/courses/a?tag=x&tag=y");
  });
});

describe("legacy ?course= redirect", () => {
  it("sends the old shape to the new route, in the right locale", () => {
    expect(legacyCourseRedirect("sr", { course: "video-audio-ai" })).toBe("/app/classroom/courses/video-audio-ai");
    expect(legacyCourseRedirect("en", { course: "video-audio-ai" })).toBe("/en/app/classroom/courses/video-audio-ai");
  });

  it("does not redirect the plain grid", () => {
    expect(legacyCourseRedirect("sr", {})).toBeNull();
    expect(legacyCourseRedirect("sr", { course: undefined })).toBeNull();
    expect(legacyCourseRedirect("sr", { course: "" })).toBeNull();
  });

  it("carries every other param across", () => {
    // Stripe success_urls issued before the move arrive exactly like this.
    expect(legacyCourseRedirect("sr", { course: "video-audio-ai", checkout: "success" })).toBe(
      "/app/classroom/courses/video-audio-ai?checkout=success",
    );
    expect(legacyCourseRedirect("en", { course: "websites", editModule: "m1", newLessonModule: "m2" })).toBe(
      "/en/app/classroom/courses/websites?editModule=m1&newLessonModule=m2",
    );
  });

  it("preserves repeated params and takes the first course value", () => {
    expect(legacyCourseRedirect("sr", { course: ["a", "b"] })).toBe("/app/classroom/courses/a");
    expect(legacyCourseRedirect("sr", { course: "a", tag: ["x", "y"] })).toBe(
      "/app/classroom/courses/a?tag=x&tag=y",
    );
  });

  it("encodes a slug so it cannot escape the segment", () => {
    expect(legacyCourseRedirect("sr", { course: "../../admin" })).toBe("/app/classroom/courses/..%2F..%2Fadmin");
    expect(legacyCourseRedirect("sr", { course: "a b" })).toBe("/app/classroom/courses/a%20b");
  });
});
