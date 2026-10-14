import { describe, expect, it } from "vitest";

import { igraArtOrNull, igraLikArt } from "./igra-art";
import { missionRingLabel, missionRingProgress, pickDailyMission, type DailyMissionInput } from "./igra-mission";
import type { Locale } from "./i18n";

const LOCALES: Locale[] = ["sr", "en"];
/** Reči pretnje, žurbe i nagrade kojih u misiji ne sme da bude (O9). */
const FORBIDDEN = /izgubi|propusti|požuri|kazn|ističe|nagrad|lose|hurry|miss|penalt|expire|reward|\bxp\b/i;

const RESUME = {
  courseSlug: "promptovi-koji-rade",
  lessonSlug: "uloge",
  courseTitle: { sr: "Promptovi koji rade", en: "Prompts that work" },
  lessonTitle: { sr: "Uloge i kontekst", en: "Roles and context" },
  position: 4,
  total: 9,
};

/** Korisnik kome je sve već urađeno; svaki test menja samo ono što ispituje. */
const DONE: DailyMissionInput = {
  hasUnlockedCourse: true,
  resume: null,
  completedLessons: 12,
  hasCommunityPost: true,
  hasCreaWork: true,
  todayDone: true,
};

describe("pickDailyMission", () => {
  it("1. bez otključanog kursa: izaberi kurs (pre svega ostalog)", () => {
    const mission = pickDailyMission({ ...DONE, hasUnlockedCourse: false, resume: RESUME, todayDone: false, hasCreaWork: false }, "sr");
    expect(mission?.kind).toBe("course");
    expect(mission?.href).toBe("/app/classroom?view=courses");
    expect(mission?.ring).toBeNull();
  });

  it("2. lekcija čeka, dan nije upisan: nastavi kurs sa prstenom", () => {
    const mission = pickDailyMission({ ...DONE, resume: RESUME, todayDone: false, hasCreaWork: false, hasCommunityPost: false }, "sr");
    expect(mission).toMatchObject({
      kind: "lesson",
      title: "Nastavi: Promptovi koji rade",
      body: "Lekcija 4 od 9: Uloge i kontekst.",
      cta: "Nastavi lekciju",
      href: "/app/classroom/courses/promptovi-koji-rade/lessons/uloge",
      ring: { position: 4, total: 9 },
    });
  });

  it("2. prva lekcija ima svoj naslov i dugme „Započni”", () => {
    const mission = pickDailyMission({ ...DONE, resume: { ...RESUME, position: 1 }, completedLessons: 0, todayDone: false }, "sr");
    expect(mission?.title).toBe("Započni prvu lekciju");
    expect(mission?.cta).toBe("Započni lekciju");
  });

  it("3. dan je upisan, a Crea još nije probana: prvi rad ide pre još jedne lekcije", () => {
    const mission = pickDailyMission({ ...DONE, resume: RESUME, hasCreaWork: false, hasCommunityPost: false }, "sr");
    expect(mission?.kind).toBe("crea");
    expect(mission?.href).toBe("/app/studio?oblast=slika");
    expect(mission?.lik).toBe("piksi");
  });

  it("4. zatim zajednica", () => {
    const mission = pickDailyMission({ ...DONE, resume: RESUME, hasCommunityPost: false }, "sr");
    expect(mission?.kind).toBe("community");
    expect(mission?.href).toBe("/app/community/discussions");
  });

  it("5. sve ostalo je urađeno, a lekcija čeka: još jedna, bez pritiska", () => {
    const mission = pickDailyMission({ ...DONE, resume: RESUME }, "sr");
    expect(mission?.kind).toBe("lesson-more");
    expect(mission?.body).toBe("Današnji korak je upisan. Ako ti se uči još: lekcija 4 od 9.");
    expect(mission?.ring).toEqual({ position: 4, total: 9 });
  });

  it("6. nema šta da se predloži: mirno stanje", () => {
    expect(pickDailyMission(DONE, "sr")).toBeNull();
  });

  it("nepoznat podatak preskače svoje pravilo (ne predlažemo ono što je možda urađeno)", () => {
    expect(pickDailyMission({ ...DONE, hasCreaWork: undefined, hasCommunityPost: undefined }, "sr")).toBeNull();
    expect(pickDailyMission({ ...DONE, hasCreaWork: undefined, hasCommunityPost: false }, "sr")?.kind).toBe("community");
  });

  it("engleski: adrese nose /en, tekst je preveden", () => {
    const mission = pickDailyMission({ ...DONE, resume: RESUME, todayDone: false }, "en");
    expect(mission?.title).toBe("Continue: Prompts that work");
    expect(mission?.body).toBe("Lesson 4 of 9: Roles and context.");
    expect(mission?.href).toBe("/en/app/classroom/courses/promptovi-koji-rade/lessons/uloge");
    expect(pickDailyMission({ ...DONE, hasCreaWork: false }, "en")?.href).toBe("/en/app/studio?oblast=slika");
  });

  it("svaka misija ima ceo tekst, sliku lika i nijednu reč pretnje ili nagrade (O9)", () => {
    const inputs: DailyMissionInput[] = [
      { ...DONE, hasUnlockedCourse: false },
      { ...DONE, resume: RESUME, todayDone: false },
      { ...DONE, resume: { ...RESUME, position: 1 }, completedLessons: 0, todayDone: false },
      { ...DONE, hasCreaWork: false },
      { ...DONE, hasCommunityPost: false },
      { ...DONE, resume: RESUME },
    ];
    for (const locale of LOCALES) {
      const missions = inputs.map((input) => pickDailyMission(input, locale));
      expect(new Set(missions.map((mission) => mission?.title)).size).toBe(inputs.length);
      for (const mission of missions) {
        expect(mission).not.toBeNull();
        for (const text of [mission!.title, mission!.body, mission!.cta]) {
          expect(text.trim(), mission!.kind).not.toBe("");
          expect(text, mission!.kind).not.toMatch(FORBIDDEN);
        }
        expect(mission!.href.startsWith(locale === "sr" ? "/app/" : "/en/app/"), mission!.href).toBe(true);
        expect(igraArtOrNull(igraLikArt(mission!.lik, mission!.poza)), mission!.kind).not.toBeNull();
      }
    }
  });
});

describe("prsten misije", () => {
  it("puni se lekcijama PRE one koja čeka", () => {
    expect(missionRingProgress({ position: 1, total: 9 })).toBe(0);
    expect(missionRingProgress({ position: 4, total: 9 })).toBeCloseTo(3 / 9);
    expect(missionRingProgress({ position: 9, total: 9 })).toBeCloseTo(8 / 9);
  });

  it("loš ulaz je prazan prsten, nikad preko punog", () => {
    expect(missionRingProgress({ position: 3, total: 0 })).toBe(0);
    expect(missionRingProgress({ position: Number.NaN, total: 9 })).toBe(0);
    expect(missionRingProgress({ position: 40, total: 9 })).toBe(1);
  });

  it("ima naziv za čitač ekrana", () => {
    expect(missionRingLabel({ position: 4, total: 9 }, "sr")).toBe("Lekcija 4 od 9");
    expect(missionRingLabel({ position: 4, total: 9 }, "en")).toBe("Lesson 4 of 9");
  });
});
