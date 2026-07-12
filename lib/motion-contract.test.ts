import { describe, expect, it } from "vitest";

import { pageMotionSceneKey, pageMotionVariantForPath } from "./motion-contract";

describe("page motion route contract", () => {
  it("uses showcase motion for the signature landing surfaces", () => {
    expect(pageMotionVariantForPath("/sr")).toBe("showcase");
    expect(pageMotionVariantForPath("/en/app")).toBe("showcase");
    expect(pageMotionVariantForPath("/sr/app/community/discussions")).toBe("showcase");
  });

  it("keeps lesson and editor routes focused", () => {
    expect(pageMotionVariantForPath("/sr/app/courses/video/lessons/intro")).toBe("focus");
    expect(pageMotionVariantForPath("/en/app/courses/video/lessons/intro/edit")).toBe("focus");
  });

  it("replays dashboard home and course scenes without keying community filters", () => {
    expect(pageMotionSceneKey("/sr/app", null)).toBe("/sr/app|course:home");
    expect(pageMotionSceneKey("/sr/app", "video-audio-ai")).toBe("/sr/app|course:video-audio-ai");
    expect(pageMotionSceneKey("/sr/app/community/discussions", "ignored-filter")).toBe(
      "/sr/app/community/discussions",
    );
  });
});
