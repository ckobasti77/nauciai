import { describe, expect, it } from "vitest";
import {
  extractPostIdFromSlug,
  getCommunityPostPath,
  getCommunityPostSlug,
  slugifyCommunityTitle,
} from "./community-slug";

describe("community-slug", () => {
  it("transliterates Serbian Latin characters correctly", () => {
    expect(slugifyCommunityTitle("Šta je čudno, đavo, ćup ili žaba?")).toBe(
      "sta-je-cudno-djavo-cup-ili-zaba",
    );
  });

  it("transliterates Serbian Cyrillic characters correctly", () => {
    expect(slugifyCommunityTitle("Како направити Џез и Љубав за Њих?")).toBe(
      "kako-napraviti-dzez-i-ljubav-za-njih",
    );
  });

  it("handles mixed case and special punctuation", () => {
    expect(slugifyCommunityTitle("  --- AI Video 2.0 & Zvuk: Kako Početi? ---  ")).toBe(
      "ai-video-2-0-zvuk-kako-poceti",
    );
  });

  it("truncates to maximum length without trailing hyphens", () => {
    const longTitle = "Ovo je izuzetno dugačak naslov koji prelazi uobičajene granice i treba da bude skraćen";
    const slug = slugifyCommunityTitle(longTitle, 40);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to 'diskusija' for empty or symbol-only titles", () => {
    expect(slugifyCommunityTitle("")).toBe("diskusija");
    expect(slugifyCommunityTitle("   !@#$%^&*()   ")).toBe("diskusija");
  });

  it("builds full canonical slug with postId", () => {
    expect(getCommunityPostSlug("Moj prvi video", "kd78xyz123")).toBe(
      "moj-prvi-video-kd78xyz123",
    );
  });

  it("extracts postId from full slug", () => {
    expect(extractPostIdFromSlug("moj-prvi-video-kd78xyz123")).toBe("kd78xyz123");
    expect(extractPostIdFromSlug("kako-da-kd78xyz123")).toBe("kd78xyz123");
  });

  it("extracts postId when given raw postId without prefix", () => {
    expect(extractPostIdFromSlug("kd78xyz123")).toBe("kd78xyz123");
  });

  it("generates localized URL paths", () => {
    expect(getCommunityPostPath("sr", { title: "Moj video", _id: "abc12345" })).toBe(
      "/sr/community/moj-video-abc12345",
    );
    expect(getCommunityPostPath("en", { title: "My video", _id: "abc12345" })).toBe(
      "/en/community/my-video-abc12345",
    );
  });
});
