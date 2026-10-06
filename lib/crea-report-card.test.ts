import { describe, expect, it } from "vitest";

import { buildReportCard, conductFor, gradeFor, overallGrade, subjectOfSticker, subjectTotal } from "./crea-report-card";

describe("đačka knjižica", () => {
  it("ocena raste sa udelom probanih tehnika; 1 se ne daje", () => {
    expect(gradeFor(0, 100)).toBeNull();
    expect(gradeFor(1, 100)).toBe(2);
    expect(gradeFor(10, 100)).toBe(3);
    expect(gradeFor(25, 100)).toBe(4);
    expect(gradeFor(45, 100)).toBe(5);
  });

  it("opšti uspeh po školskom pravilu (4,50 odličan)", () => {
    expect(overallGrade([5, 4, null])).toEqual({ average: 4.5, grade: 5 });
    expect(overallGrade([4, 4, 3])).toEqual({ average: 3.67, grade: 4 });
    expect(overallGrade([null, null])).toBeNull();
  });

  it("vladanje prati najduži niz dana", () => {
    expect(conductFor(2)).toBe("dobro");
    expect(conductFor(7)).toBe("vrlo-dobro");
    expect(conductFor(30)).toBe("primerno");
  });

  it("predmeti: alati, stilovi, pokreti, efekti, glasovi i recepti idu u svoj predmet", () => {
    expect(subjectOfSticker("stil:foto-film")).toBe("slika");
    expect(subjectOfSticker("kamera:fpv")).toBe("video");
    expect(subjectOfSticker("glas:gemini:Kore")).toBe("zvuk");
    expect(subjectOfSticker("recept:profilna")).toBe("recepti");
    expect(subjectOfSticker("prvi:slika")).toBeNull();
  });

  it("knjižica iz sličica i lekcija; ista sličica se ne broji dvaput", () => {
    const card = buildReportCard({ stickerIds: ["stil:foto-film", "stil:foto-film", "kamera:fpv", "prvi:slika"], lessonsDone: 3, bestStreak: 8 });
    expect(card.stickers).toBe(3);
    expect(card.subjects.find((s) => s.id === "slika")).toMatchObject({ done: 1, grade: 2, total: subjectTotal("slika") });
    expect(card.subjects.find((s) => s.id === "zvuk")?.grade).toBeNull();
    expect(card.subjects.find((s) => s.id === "ucenje")).toMatchObject({ done: 3, grade: 4 });
    expect(card.conduct).toBe("vrlo-dobro");
    expect(card.overall).not.toBeNull();
  });
});
