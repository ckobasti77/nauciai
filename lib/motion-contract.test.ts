import { describe, expect, it } from "vitest";

import { pageMotionSceneKey, pageMotionVariantForPath } from "./motion-contract";

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
