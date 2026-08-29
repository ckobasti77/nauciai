import { describe, expect, it } from "vitest";

import { courses as staticCourses } from "@/lib/content";
import {
  catalogPriceLabel,
  courseLengthLabel,
  formatCourseCount,
  formatCourseDuration,
  formatLessonCount,
  groupByTrack,
  isCourseOwned,
  matchesCatalogFilter,
  serbianPlural,
  totalDurationSeconds,
  type CatalogFilter,
} from "@/lib/course-catalog";

describe("isCourseOwned", () => {
  it("uses the server flag when the payload carries one", () => {
    expect(isCourseOwned({ owned: true, hasAccess: true }, false)).toBe(true);
    expect(isCourseOwned({ owned: false, hasAccess: true }, false)).toBe(false);
  });

  it("does not let hasAccess override an explicit owned: false", () => {
    // Ovo je cela poenta polja: `hasAccess` je za svaki objavljen kurs `true`,
    // pa bi bez ove razlike katalog svakom studentu rekao da ima sve kurseve.
    expect(isCourseOwned({ owned: false, hasAccess: true }, false)).toBe(false);
  });

  it("falls back to hasAccess when the payload has no owned flag (static branch)", () => {
    expect(isCourseOwned({ hasAccess: true }, false)).toBe(true);
    expect(isCourseOwned({ hasAccess: false }, false)).toBe(false);
  });

  it("treats an admin as owner even when the flag says otherwise", () => {
    expect(isCourseOwned({ owned: false, hasAccess: false }, true)).toBe(true);
  });
});

describe("matchesCatalogFilter", () => {
  const owned = { owned: true, totalLessons: 10, completedLessons: 4, percent: 40 };
  const done = { owned: true, totalLessons: 10, completedLessons: 10, percent: 100 };
  const untouched = { owned: true, totalLessons: 10, completedLessons: 0, percent: 0 };
  const locked = { owned: false, totalLessons: 10, completedLessons: 0, percent: 0 };

  it("keeps everything under 'all'", () => {
    for (const entry of [owned, done, untouched, locked]) {
      expect(matchesCatalogFilter(entry, "all")).toBe(true);
    }
  });

  it("locked means the student does not own the course", () => {
    expect(matchesCatalogFilter(locked, "locked")).toBe(true);
    expect(matchesCatalogFilter(owned, "locked")).toBe(false);
  });

  it("in progress needs ownership and at least one finished lesson", () => {
    expect(matchesCatalogFilter(owned, "inProgress")).toBe(true);
    expect(matchesCatalogFilter(untouched, "inProgress")).toBe(false);
    expect(matchesCatalogFilter(done, "inProgress")).toBe(false);
  });

  it("completed needs ownership, lessons and 100%", () => {
    expect(matchesCatalogFilter(done, "completed")).toBe(true);
    expect(matchesCatalogFilter(owned, "completed")).toBe(false);
    expect(
      matchesCatalogFilter({ owned: true, totalLessons: 0, completedLessons: 0, percent: 100 }, "completed"),
    ).toBe(false);
  });

  it("never reports an unowned course as in progress or completed", () => {
    // Napredak na neotkljucanom kursu postoji u bazi (lekcije su citljive), ali
    // na kartici ne sme da se prijavi kao "U toku".
    const lockedWithProgress = { owned: false, totalLessons: 10, completedLessons: 10, percent: 100 };
    for (const filter of ["inProgress", "completed"] satisfies CatalogFilter[]) {
      expect(matchesCatalogFilter(lockedWithProgress, filter)).toBe(false);
    }
  });
});

describe("groupByTrack", () => {
  const trackMeta = {
    t1: { slug: "video", title: { sr: "Video smer", en: "Video track" } },
    t2: { title: { sr: "Sajtovi", en: "Websites" } },
  };
  const items = [
    { slug: "a", trackId: "t1" },
    { slug: "b", trackId: "t2" },
    { slug: "c", trackId: "t1" },
    { slug: "d" },
    { slug: "e", trackId: "unknown" },
  ];

  it("keeps the incoming order of both tracks and courses", () => {
    const groups = groupByTrack(items, (item) => item.trackId, trackMeta);
    expect(groups.map((group) => group.trackId)).toEqual(["t1", "t2"]);
    expect(groups[0].items.map((item) => item.slug)).toEqual(["a", "c"]);
    expect(groups[1].items.map((item) => item.slug)).toEqual(["b"]);
  });

  it("drops courses without a track and courses whose track is unknown", () => {
    const groups = groupByTrack(items, (item) => item.trackId, trackMeta);
    const grouped = groups.flatMap((group) => group.items.map((item) => item.slug));
    expect(grouped).not.toContain("d");
    expect(grouped).not.toContain("e");
  });

  it("carries the track slug through, and leaves it undefined when there is none", () => {
    const groups = groupByTrack(items, (item) => item.trackId, trackMeta);
    expect(groups[0].slug).toBe("video");
    expect(groups[1].slug).toBeUndefined();
  });

  it("returns nothing when no track is known", () => {
    expect(groupByTrack(items, (item) => item.trackId, {})).toEqual([]);
  });
});

describe("serbianPlural", () => {
  const forms = { one: "lekcija", few: "lekcije", many: "lekcija" };

  it.each([
    [1, "lekcija"],
    [2, "lekcije"],
    [3, "lekcije"],
    [4, "lekcije"],
    [5, "lekcija"],
    [11, "lekcija"],
    [12, "lekcija"],
    [14, "lekcija"],
    [21, "lekcija"],
    [22, "lekcije"],
    [101, "lekcija"],
    [111, "lekcija"],
    [0, "lekcija"],
  ])("picks the right form for %i", (count, expected) => {
    expect(serbianPlural(count, forms)).toBe(expected);
  });
});

describe("count labels", () => {
  it("formats lessons in both languages", () => {
    expect(formatLessonCount("sr", 1)).toBe("1 lekcija");
    expect(formatLessonCount("sr", 2)).toBe("2 lekcije");
    expect(formatLessonCount("sr", 8)).toBe("8 lekcija");
    expect(formatLessonCount("en", 1)).toBe("1 lesson");
    expect(formatLessonCount("en", 8)).toBe("8 lessons");
  });

  it("formats courses in both languages", () => {
    expect(formatCourseCount("sr", 1)).toBe("1 kurs");
    expect(formatCourseCount("sr", 2)).toBe("2 kursa");
    expect(formatCourseCount("sr", 7)).toBe("7 kurseva");
    expect(formatCourseCount("en", 1)).toBe("1 course");
    expect(formatCourseCount("en", 7)).toBe("7 courses");
  });

  it("never renders a negative count", () => {
    expect(formatLessonCount("sr", -3)).toBe("0 lekcija");
    expect(formatCourseCount("en", -3)).toBe("0 courses");
  });
});

describe("formatCourseDuration", () => {
  it("stays in minutes below an hour", () => {
    expect(formatCourseDuration(45 * 60)).toBe("45 min");
  });

  it("rounds up anything shorter than a minute to 1 min", () => {
    expect(formatCourseDuration(20)).toBe("1 min");
  });

  it("switches to hours, and drops a zero minute rest", () => {
    expect(formatCourseDuration(60 * 60)).toBe("1 h");
    expect(formatCourseDuration(80 * 60)).toBe("1 h 20 min");
    expect(formatCourseDuration(125 * 60)).toBe("2 h 5 min");
  });

  it("returns null instead of '0 min'", () => {
    expect(formatCourseDuration(0)).toBeNull();
    expect(formatCourseDuration(-10)).toBeNull();
    expect(formatCourseDuration(Number.NaN)).toBeNull();
  });
});

describe("totalDurationSeconds", () => {
  it("sums published lessons only", () => {
    expect(
      totalDurationSeconds([
        { durationSeconds: 600, isPublished: true },
        { durationSeconds: 300 },
        { durationSeconds: 999, isPublished: false },
      ]),
    ).toBe(900);
  });

  it("ignores missing and nonsense durations", () => {
    expect(
      totalDurationSeconds([{ durationSeconds: 600 }, {}, { durationSeconds: -5 }, { durationSeconds: Number.NaN }]),
    ).toBe(600);
  });

  it("is 0 for an empty course", () => {
    expect(totalDurationSeconds([])).toBe(0);
  });
});

describe("courseLengthLabel", () => {
  it("joins lessons and duration", () => {
    expect(courseLengthLabel("sr", 8, 80 * 60)).toBe("8 lekcija · 1 h 20 min");
    expect(courseLengthLabel("en", 1, 45 * 60)).toBe("1 lesson · 45 min");
  });

  it("drops the separator when there is no duration", () => {
    expect(courseLengthLabel("sr", 3, 0)).toBe("3 lekcije");
  });
});

describe("catalogPriceLabel", () => {
  it("reads the same price the marketing page shows", () => {
    const first = staticCourses[0];
    expect(catalogPriceLabel(first.slug)).toEqual(first.priceLabel);
  });

  it("returns null for a course that exists only in Convex", () => {
    expect(catalogPriceLabel("kurs-koji-ne-postoji-u-content-ts")).toBeNull();
  });
});
