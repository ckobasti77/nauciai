import { describe, expect, it } from "vitest";

import {
  STUDIO_SECTIONS,
  activeStudioSection,
  studioSectionLabel,
  studioSectionsFor,
} from "./studio-sections";

describe("studio sections", () => {
  it("exposes every catalog kind plus an all-media section", () => {
    const ids = studioSectionsFor(false).map((section) => section.id);
    expect(ids).toEqual(["all", "images", "videos", "audio"]);
    expect(STUDIO_SECTIONS.find((section) => section.id === "all")?.kind).toBeNull();
    expect(STUDIO_SECTIONS.map((section) => section.kind)).toContain("image");
    expect(STUDIO_SECTIONS.map((section) => section.kind)).toContain("video");
    expect(STUDIO_SECTIONS.map((section) => section.kind)).toContain("audio");
  });

  it("labels every section in both locales", () => {
    for (const section of STUDIO_SECTIONS) {
      expect(studioSectionLabel(section, "sr")).toBeTruthy();
      expect(studioSectionLabel(section, "en")).toBeTruthy();
    }
    expect(studioSectionLabel(STUDIO_SECTIONS[0], "sr")).toBe("Sav sadržaj");
    expect(studioSectionLabel(STUDIO_SECTIONS[0], "en")).toBe("All media");
  });

  it("resolves the active section from the kind filter value", () => {
    expect(activeStudioSection("image")).toBe("images");
    expect(activeStudioSection("video")).toBe("videos");
    expect(activeStudioSection("audio")).toBe("audio");
  });

  it("falls back to all media for an absent or unknown kind", () => {
    expect(activeStudioSection(null)).toBe("all");
    expect(activeStudioSection(undefined)).toBe("all");
    expect(activeStudioSection("")).toBe("all");
    expect(activeStudioSection("not-a-kind")).toBe("all");
  });

  it("only ever names a section that actually exists", () => {
    const ids = new Set(STUDIO_SECTIONS.map((section) => section.id));
    for (const kind of ["image", "video", "audio", null, "bogus"]) {
      expect(ids.has(activeStudioSection(kind))).toBe(true);
    }
  });
});
