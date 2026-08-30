import { describe, expect, it } from "vitest";

import {
  contentStatus,
  contentStatusTone,
  contentStatuses,
  draftCount,
  listLevelAfterChange,
  listLevelForSelection,
  parentListLevel,
} from "@/lib/admin-content-tree";
import { changeContentSelection, type ContentSelection } from "@/lib/content-selection";

const empty: ContentSelection = { trackId: "", courseId: "", lessonId: "" };

describe("listLevelForSelection", () => {
  it("opens on the track list when nothing is selected", () => {
    expect(listLevelForSelection(empty)).toBe("tracks");
  });

  it("opens on the course list when only a track came from the URL", () => {
    expect(listLevelForSelection({ ...empty, trackId: "t1" })).toBe("courses");
  });

  it("opens on the lesson list when a course came from the URL", () => {
    expect(listLevelForSelection({ trackId: "t1", courseId: "c1", lessonId: "l1" })).toBe("lessons");
  });

  it("ignores a lesson id without its course, so a stale URL cannot open an empty step", () => {
    expect(listLevelForSelection({ trackId: "t1", courseId: "", lessonId: "l1" })).toBe("courses");
  });
});

describe("parentListLevel", () => {
  it("walks one step up", () => {
    expect(parentListLevel("lessons")).toBe("courses");
    expect(parentListLevel("courses")).toBe("tracks");
  });

  it("has no parent for the first step", () => {
    expect(parentListLevel("tracks")).toBeNull();
  });
});

describe("listLevelAfterChange", () => {
  it("steps forward into the children of whatever was just picked", () => {
    const afterTrack = changeContentSelection(empty, "track", "t1");
    expect(listLevelAfterChange(afterTrack, "track")).toBe("courses");
    const afterCourse = changeContentSelection(afterTrack, "course", "c1");
    expect(listLevelAfterChange(afterCourse, "course")).toBe("lessons");
  });

  it("stays on the lesson list when a lesson is picked", () => {
    const selection = { trackId: "t1", courseId: "c1", lessonId: "l1" };
    expect(listLevelAfterChange(selection, "lesson")).toBe("lessons");
  });

  it("steps back when a selection is cleared", () => {
    const cleared = changeContentSelection({ trackId: "t1", courseId: "c1", lessonId: "l1" }, "track", "");
    expect(cleared).toEqual(empty);
    expect(listLevelAfterChange(cleared, "track")).toBe("tracks");
  });

  it("steps back to the course list when only the course is cleared", () => {
    const cleared = changeContentSelection({ trackId: "t1", courseId: "c1", lessonId: "l1" }, "course", "");
    expect(listLevelAfterChange(cleared, "course")).toBe("courses");
  });

  it("falls back to the deepest live list when a lesson is cleared", () => {
    const cleared = changeContentSelection({ trackId: "t1", courseId: "c1", lessonId: "l1" }, "lesson", "");
    expect(listLevelAfterChange(cleared, "lesson")).toBe("lessons");
  });
});

describe("contentStatus", () => {
  it("passes through the stored status of tracks and courses", () => {
    expect(contentStatus({ status: "published" })).toBe("published");
    expect(contentStatus({ status: "archived" })).toBe("archived");
    expect(contentStatus({ status: "draft" })).toBe("draft");
  });

  it("derives a lesson status from isPublished", () => {
    expect(contentStatus({ isPublished: true })).toBe("published");
    expect(contentStatus({ isPublished: false })).toBe("draft");
  });

  it("treats a node with neither field as a draft, never as published", () => {
    expect(contentStatus({})).toBe("draft");
  });
});

describe("draftCount", () => {
  it("counts only drafts across both shapes", () => {
    expect(
      draftCount([
        { status: "published" },
        { status: "draft" },
        { status: "archived" },
        { isPublished: false },
        { isPublished: true },
      ]),
    ).toBe(2);
  });

  it("is zero for an empty list", () => {
    expect(draftCount([])).toBe(0);
  });
});

describe("contentStatusTone", () => {
  it("objavljeno je zuto - ista boja koju ceo proizvod koristi za 'ovo radi'", () => {
    expect(contentStatusTone("published")).toBe("yellow");
  });

  it("nacrt je tih, jer red vec nosi ink-hatch srafuru za isto znacenje", () => {
    expect(contentStatusTone("draft")).toBe("muted");
  });

  it("arhiva se razlikuje od nacrta - dva mrtva stanja ne smeju izgledati isto", () => {
    expect(contentStatusTone("archived")).not.toBe(contentStatusTone("draft"));
  });

  it("zuto je rezervisano tacno za objavljeno", () => {
    const yellow = contentStatuses.filter((status) => contentStatusTone(status) === "yellow");
    expect(yellow).toEqual(["published"]);
  });

  it("svaki status ima ton i svi tonovi su iz sankcionisane liste", () => {
    expect(contentStatuses).toHaveLength(3);
    for (const status of contentStatuses) {
      expect(["muted", "yellow", "neutral"]).toContain(contentStatusTone(status));
    }
  });

  it("ton se izvodi iz statusa koji `contentStatus` vraca, i za lekcije bez `status` polja", () => {
    expect(contentStatusTone(contentStatus({ isPublished: true }))).toBe("yellow");
    expect(contentStatusTone(contentStatus({ isPublished: false }))).toBe("muted");
  });
});
