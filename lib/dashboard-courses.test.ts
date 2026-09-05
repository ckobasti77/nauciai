import { describe, expect, it } from "vitest";

import type { DashboardCourse } from "@/components/app/dashboard-content";
import { courseFromLive, coursesFromLive, isLiveCatalogEmpty, type LiveNavigationResult } from "@/lib/dashboard-courses";

const fallbackCourses: DashboardCourse[] = [
  {
    slug: "video-audio-ai",
    title: { sr: "Statični video kurs", en: "Static video course" },
    subtitle: { sr: "podnaslov", en: "subtitle" },
    description: { sr: "opis", en: "description" },
    status: "published",
    hasAccess: true,
    lessons: [],
  },
  {
    slug: "vibe-coding",
    title: { sr: "Statični vibe kurs", en: "Static vibe course" },
    subtitle: { sr: "podnaslov", en: "subtitle" },
    description: { sr: "opis", en: "description" },
    status: "draft",
    hasAccess: false,
    lessons: [],
  },
];

function liveCourse(slug: string, titleSr: string): NonNullable<NonNullable<LiveNavigationResult>["courses"]>[number] {
  return {
    slug,
    titleSr,
    titleEn: titleSr,
    subtitleSr: "",
    subtitleEn: "",
    descriptionSr: "",
    descriptionEn: "",
    status: "published",
    sortOrder: 10,
  };
}

describe("coursesFromLive fallback", () => {
  it("(a) baza prazna (upit zavrsen, 0 kurseva) -> staticni katalog", () => {
    const result = coursesFromLive({ courses: [] }, fallbackCourses);
    expect(result).toBe(fallbackCourses);
    expect(result.map((course) => course.slug)).toEqual(["video-audio-ai", "vibe-coding"]);
  });

  it("(b) baza ima >=1 kurs -> samo live, bez mesanja sa staticnim", () => {
    const result = coursesFromLive({ courses: [liveCourse("live-only", "Živi kurs")] }, fallbackCourses);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("live-only");
    expect(result[0].title.sr).toBe("Živi kurs");
  });

  it("(c) upit u toku (undefined) -> prazno, nikad fallback", () => {
    expect(coursesFromLive(undefined, fallbackCourses)).toEqual([]);
  });
});

describe("isLiveCatalogEmpty", () => {
  it("false dok upit traje (undefined)", () => {
    expect(isLiveCatalogEmpty(undefined)).toBe(false);
  });

  it("true kad je upit zavrsen bez kurseva", () => {
    expect(isLiveCatalogEmpty({ courses: [] })).toBe(true);
    expect(isLiveCatalogEmpty(null)).toBe(true);
  });

  it("false kad ima bar jedan kurs", () => {
    expect(isLiveCatalogEmpty({ courses: [liveCourse("x", "X")] })).toBe(false);
  });
});

describe("courseFromLive fallback", () => {
  const fallbackCourse = fallbackCourses[0];

  it("baza prazna -> staticni kurs po slug-u", () => {
    const result = courseFromLive({ courses: [] }, fallbackCourse, fallbackCourses, "vibe-coding");
    expect(result?.slug).toBe("vibe-coding");
  });

  it("upit u toku (undefined) -> null (caller pokazuje skeleton)", () => {
    expect(courseFromLive(undefined, fallbackCourse, fallbackCourses, "vibe-coding")).toBeNull();
  });

  it("baza ima kurseve, ali slug ne postoji -> null", () => {
    const result = courseFromLive({ courses: [liveCourse("live-only", "Živi")] }, fallbackCourse, fallbackCourses, "nepostoji");
    expect(result).toBeNull();
  });
});
