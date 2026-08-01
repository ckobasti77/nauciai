import { describe, expect, it } from "vitest";

import {
  COMMUNITY_SECTIONS,
  activeCommunitySection,
  communitySectionLabel,
  communitySectionsFor,
} from "./community-sections";

describe("community sections", () => {
  it("hides staff-only sections from students and shows them to staff", () => {
    const studentIds = communitySectionsFor(false).map((section) => section.id);
    const staffIds = communitySectionsFor(true).map((section) => section.id);

    expect(studentIds).toEqual(["discussions", "my-threads", "notifications", "members", "leaderboard"]);
    expect(staffIds).toContain("moderation");
    expect(staffIds).toHaveLength(studentIds.length + 1);
  });

  it("labels every section in both locales", () => {
    for (const section of COMMUNITY_SECTIONS) {
      expect(communitySectionLabel(section, "sr")).toBeTruthy();
      expect(communitySectionLabel(section, "en")).toBeTruthy();
    }
    expect(communitySectionLabel(COMMUNITY_SECTIONS[0], "sr")).toBe("Diskusije");
    expect(communitySectionLabel(COMMUNITY_SECTIONS[0], "en")).toBe("Discussions");
  });

  it("resolves the active section from a pathname in either locale", () => {
    expect(activeCommunitySection("/sr/app/community/leaderboard")).toBe("leaderboard");
    expect(activeCommunitySection("/en/app/community/members")).toBe("members");
    expect(activeCommunitySection("/sr/app/community/moderation")).toBe("moderation");
  });

  it("treats thread reading, creating and editing as Discussions", () => {
    expect(activeCommunitySection("/sr/app/community/discussions")).toBe("discussions");
    expect(activeCommunitySection("/sr/app/community/new")).toBe("discussions");
    expect(activeCommunitySection("/sr/app/community/12345")).toBe("discussions");
    expect(activeCommunitySection("/sr/app/community")).toBe("discussions");
    expect(activeCommunitySection("/sr/app/messages")).toBe("discussions");
  });

  it("maps the legacy mentions stub onto notifications, which is where it redirects", () => {
    expect(activeCommunitySection("/sr/app/community/mentions")).toBe("notifications");
  });

  it("only ever names a section that actually exists", () => {
    const ids = new Set(COMMUNITY_SECTIONS.map((section) => section.id));
    for (const pathname of [
      "/sr/app/community/leaderboard",
      "/sr/app/community/mentions",
      "/sr/app/community/not-a-real-section",
      "/en/app/community/new",
    ]) {
      expect(ids.has(activeCommunitySection(pathname))).toBe(true);
    }
  });
});
