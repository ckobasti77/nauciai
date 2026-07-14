import { describe, expect, it } from "vitest";

import { resolvedProfileAvatarUrl } from "./avatar";

const storage = (url: string | null) => ({ storage: { getUrl: async () => url } });

describe("canonical avatar precedence", () => {
  it("prefers an uploaded avatar", async () => {
    await expect(resolvedProfileAvatarUrl(storage("https://files/avatar.png") as never, { avatarStorageId: "storage" }, "https://google/photo"))
      .resolves.toBe("https://files/avatar.png");
  });

  it("prefers an explicitly selected preset over provider image", async () => {
    await expect(resolvedProfileAvatarUrl(storage(null) as never, { avatarPreset: "cosmic-scholar" }, "https://google/photo"))
      .resolves.toBe("/images/avatars/cosmic-scholar.png");
  });

  it("falls back to provider image", async () => {
    await expect(resolvedProfileAvatarUrl(storage(null) as never, null, "https://google/photo"))
      .resolves.toBe("https://google/photo");
  });
});
