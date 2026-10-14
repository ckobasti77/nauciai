import { describe, expect, it } from "vitest";

import { activeLessonStep, lessonRefs, lessonStepsView, nextLessonAfter, xpGain, type LessonRef } from "./igra-lesson";

describe("activeLessonStep", () => {
  const VIEWPORT = 900; // linija čitanja je na 360 px

  it("prvi korak dok nijedan drugi blok nije stigao do linije", () => {
    expect(activeLessonStep([200, 700, 1200], VIEWPORT, false)).toBe(0);
    expect(activeLessonStep([500, 1000, 1500], VIEWPORT, false)).toBe(0);
  });

  it("poslednji blok čiji je vrh prešao liniju", () => {
    expect(activeLessonStep([-300, 360, 900], VIEWPORT, false)).toBe(1);
    expect(activeLessonStep([-300, 361, 900], VIEWPORT, false)).toBe(0);
    expect(activeLessonStep([-900, -400, 100], VIEWPORT, false)).toBe(2);
  });

  it("kratak završni blok ispod linije još nije korak, dok strana ne dođe do kraja", () => {
    expect(activeLessonStep([-500, 300, 760], VIEWPORT, false)).toBe(1);
    expect(activeLessonStep([-500, 300, 760], VIEWPORT, true)).toBe(2);
  });

  it("bez blokova je nula", () => {
    expect(activeLessonStep([], VIEWPORT, true)).toBe(0);
  });
});

describe("lessonStepsView", () => {
  it("natpis, udeo i atributi trake", () => {
    const view = lessonStepsView(3, 5, "sr");
    expect(view.label).toBe("Korak 3 od 5");
    expect(view.progress).toBeCloseTo(0.6);
    expect(view.a11y).toEqual({
      role: "progressbar",
      "aria-label": "Koraci lekcije",
      "aria-valuemin": 1,
      "aria-valuemax": 5,
      "aria-valuenow": 3,
      "aria-valuetext": "Korak 3 od 5",
    });
    expect(lessonStepsView(5, 5, "en")).toMatchObject({ label: "Step 5 of 5", progress: 1 });
    expect(lessonStepsView(1, 3, "en").a11y["aria-label"]).toBe("Lesson steps");
  });

  it("steže korak na 1..total i preživljava loš ulaz", () => {
    expect(lessonStepsView(0, 5, "sr").a11y["aria-valuenow"]).toBe(1);
    expect(lessonStepsView(9, 5, "sr").a11y["aria-valuenow"]).toBe(5);
    expect(lessonStepsView(Number.NaN, 0, "sr")).toMatchObject({ label: "Korak 1 od 1", progress: 1 });
  });
});

describe("xpGain", () => {
  it("razlika posle klika, nikad negativna", () => {
    expect(xpGain(1890, 1990)).toBe(100);
    expect(xpGain(0, 120)).toBe(120);
    expect(xpGain(1990, 1990)).toBe(0);
    expect(xpGain(1990, 1890)).toBe(0);
  });

  it("loš ulaz je nula", () => {
    expect(xpGain(Number.NaN, 100)).toBe(0);
    expect(xpGain(100, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

const ref = (slug: string, completed = false): LessonRef => ({ slug, title: { sr: slug, en: slug }, completed });

describe("nextLessonAfter", () => {
  it("naredna lekcija po redu", () => {
    const lessons = [ref("a", true), ref("b"), ref("c"), ref("d")];
    expect(nextLessonAfter(lessons, "b")).toEqual({ lesson: lessons[2], courseDone: false });
  });

  it("naredna po redu i kad je već završena (ponavljanje gradiva)", () => {
    const lessons = [ref("a", true), ref("b", true), ref("c", true)];
    expect(nextLessonAfter(lessons, "a")).toEqual({ lesson: lessons[1], courseDone: true });
  });

  it("posle poslednje vodi na prvu nezavršenu", () => {
    const lessons = [ref("a", true), ref("b"), ref("c", true), ref("d")];
    expect(nextLessonAfter(lessons, "d")).toEqual({ lesson: lessons[1], courseDone: false });
  });

  it("poslednja lekcija uz sve ostale završene: kurs je završen i nema kuda dalje", () => {
    const lessons = [ref("a", true), ref("b", true), ref("c")];
    expect(nextLessonAfter(lessons, "c")).toEqual({ lesson: null, courseDone: true });
    expect(nextLessonAfter([ref("jedina")], "jedina")).toEqual({ lesson: null, courseDone: true });
  });

  it("lekcija koje nema u spisku nema sledeći korak", () => {
    expect(nextLessonAfter([ref("a"), ref("b")], "x")).toBeNull();
    expect(nextLessonAfter([], "a")).toBeNull();
  });
});

describe("lessonRefs", () => {
  it("objavljene lekcije redom modula i lekcija, sa stanjem", () => {
    const course = {
      modules: [
        {
          sortOrder: 20,
          lessons: [
            { slug: "d", titleSr: "D", titleEn: "D", isPublished: true, sortOrder: 10, progress: null },
            { slug: "nacrt", titleSr: "N", titleEn: "N", isPublished: false, sortOrder: 5 },
          ],
        },
        {
          sortOrder: 10,
          lessons: [
            { slug: "b", titleSr: "B sr", titleEn: "B en", isPublished: true, sortOrder: 20, progress: { completed: false } },
            { slug: "a", titleSr: "A", titleEn: "A", isPublished: true, sortOrder: 10, progress: { completed: true } },
          ],
        },
      ],
    };
    expect(lessonRefs(course)).toEqual([
      { slug: "a", title: { sr: "A", en: "A" }, completed: true },
      { slug: "b", title: { sr: "B sr", en: "B en" }, completed: false },
      { slug: "d", title: { sr: "D", en: "D" }, completed: false },
    ]);
  });

  it("bez kursa ili modula je prazno", () => {
    expect(lessonRefs(undefined)).toEqual([]);
    expect(lessonRefs(null)).toEqual([]);
    expect(lessonRefs({})).toEqual([]);
  });
});
