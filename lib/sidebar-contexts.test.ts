import { describe, expect, it } from "vitest";

import {
  activeSectionId,
  resolveSidebarContext,
  sectionsFor,
} from "./sidebar-contexts";

const staffOpts = { isStaff: true, isAdmin: true, params: {} };
const studentOpts = { isStaff: false, isAdmin: false, params: {} };

describe("sidebar contexts — resolve", () => {
  it("falls back to home for the dashboard and unknown areas, in either locale", () => {
    expect(resolveSidebarContext("/sr/app").id).toBe("home");
    expect(resolveSidebarContext("/en/app").id).toBe("home");
    expect(resolveSidebarContext("/sr/app/messages").id).toBe("home");
    expect(resolveSidebarContext("/sr/app/credits").id).toBe("home");
  });

  it("resolves studio from its route and any deeper node, in either locale", () => {
    expect(resolveSidebarContext("/sr/app/studio").id).toBe("studio");
    expect(resolveSidebarContext("/en/app/studio").id).toBe("studio");
    expect(resolveSidebarContext("/sr/app/studio/m/12345").id).toBe("studio");
  });

  it("does not mistake a sibling route with the same prefix for studio", () => {
    expect(resolveSidebarContext("/sr/app/studios").id).toBe("home");
  });

  it("home carries no rendered sections (the classic slot renders home in Phase 1)", () => {
    expect(resolveSidebarContext("/sr/app").sections).toHaveLength(0);
  });
});

describe("sidebar contexts — studio sections", () => {
  const studio = resolveSidebarContext("/sr/app/studio");

  it("exposes the studio taxonomy in order, mapped from STUDIO_SECTIONS", () => {
    const ids = sectionsFor(studio, studentOpts).map((section) => section.id);
    expect(ids).toEqual(["all", "images", "videos", "audio"]);
  });

  it("carries the library group heading", () => {
    expect(studio.groupLabelSr).toBe("Biblioteka");
    expect(studio.groupLabelEn).toBe("Library");
  });

  it("builds each section href as a ?kind= filter over the studio route", () => {
    const byId = Object.fromEntries(studio.sections.map((section) => [section.id, section]));
    expect(byId.all.href("sr", {})).toBe("/sr/app/studio");
    expect(byId.images.href("sr", {})).toBe("/sr/app/studio?kind=image");
    expect(byId.videos.href("en", {})).toBe("/en/app/studio?kind=video");
    expect(byId.audio.href("sr", {})).toBe("/sr/app/studio?kind=audio");
  });

  it("resolves the active section from the ?kind= filter, falling back to all", () => {
    const sp = (kind?: string) => new URLSearchParams(kind ? `kind=${kind}` : "");
    expect(activeSectionId(studio, "/sr/app/studio", sp("image"), {})).toBe("images");
    expect(activeSectionId(studio, "/sr/app/studio", sp("video"), {})).toBe("videos");
    expect(activeSectionId(studio, "/sr/app/studio", sp("audio"), {})).toBe("audio");
    expect(activeSectionId(studio, "/sr/app/studio", sp(), {})).toBe("all");
    expect(activeSectionId(studio, "/sr/app/studio", sp("bogus"), {})).toBe("all");
  });

  it("does not hide any studio section from students (studio has none staff-only)", () => {
    expect(sectionsFor(studio, staffOpts).map((s) => s.id)).toEqual(
      sectionsFor(studio, studentOpts).map((s) => s.id),
    );
  });
});
