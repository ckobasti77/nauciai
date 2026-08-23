import { describe, expect, it } from "vitest";

import { pageMotionSceneKey, pageMotionVariantForPath } from "./motion-contract";

describe("page motion route contract", () => {
  it("uses showcase motion for the signature landing surfaces", () => {
    expect(pageMotionVariantForPath("/sr")).toBe("showcase");
    expect(pageMotionVariantForPath("/en/app")).toBe("showcase");
    expect(pageMotionVariantForPath("/sr/app/classroom/courses/video-audio-ai")).toBe("showcase");
    expect(pageMotionVariantForPath("/sr/app/community/discussions")).toBe("showcase");
  });

  it("keeps lesson and editor routes focused", () => {
    expect(pageMotionVariantForPath("/sr/app/classroom/courses/video/lessons/intro")).toBe("focus");
    expect(pageMotionVariantForPath("/en/app/classroom/courses/video/lessons/intro/edit")).toBe("focus");
  });

  it("keys a scene on the pathname alone, so each course is its own scene", () => {
    expect(pageMotionSceneKey("/sr/app")).toBe("/sr/app");
    expect(pageMotionSceneKey("/sr/app/classroom/courses/video-audio-ai")).toBe(
      "/sr/app/classroom/courses/video-audio-ai",
    );
    expect(pageMotionSceneKey("/sr/app/classroom/courses/websites")).not.toBe(
      pageMotionSceneKey("/sr/app/classroom/courses/video-audio-ai"),
    );
    expect(pageMotionSceneKey("/sr/app/community/discussions")).toBe("/sr/app/community/discussions");
  });
});
