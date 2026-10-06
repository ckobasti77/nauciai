import { describe, expect, test } from "vitest";

import { CREA_QUIZZES, CREA_TIPS, learnDeck, seedFrom, tipAreaFor } from "./crea-tips";

describe("Dok čekaš, nauči - sadržaj", () => {
  test("oko 30 saveta, jedinstveni id-jevi, oba jezika", () => {
    expect(CREA_TIPS.length).toBeGreaterThanOrEqual(28);
    const ids = [...CREA_TIPS.map((tip) => tip.id), ...CREA_QUIZZES.map((quiz) => quiz.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const tip of CREA_TIPS) {
      expect(tip.text.sr.trim().length, tip.id).toBeGreaterThan(20);
      expect(tip.text.en.trim().length, tip.id).toBeGreaterThan(20);
    }
  });

  test("savet se pročita za 20 sekundi (≤ 200 znakova)", () => {
    for (const tip of CREA_TIPS) {
      expect(tip.text.sr.length, tip.id).toBeLessThanOrEqual(200);
      expect(tip.text.en.length, tip.id).toBeLessThanOrEqual(200);
    }
  });

  test("svaka oblast ima svoje savete", () => {
    for (const area of ["slika", "video", "zvuk"] as const) {
      expect(CREA_TIPS.filter((tip) => tip.area === area).length, area).toBeGreaterThanOrEqual(3);
    }
  });

  test("kviz: tri različita odgovora, tačan postoji, objašnjenje na oba jezika", () => {
    expect(CREA_QUIZZES.length).toBeGreaterThanOrEqual(8);
    for (const quiz of CREA_QUIZZES) {
      expect(quiz.options.length, quiz.id).toBe(3);
      expect(new Set(quiz.options.map((option) => option.sr)).size, quiz.id).toBe(3);
      expect(new Set(quiz.options.map((option) => option.en)).size, quiz.id).toBe(3);
      expect(quiz.answer, quiz.id).toBeGreaterThanOrEqual(0);
      expect(quiz.answer, quiz.id).toBeLessThan(quiz.options.length);
      expect(quiz.why.sr && quiz.why.en && quiz.question.sr && quiz.question.en).toBeTruthy();
    }
  });
});

describe("redosled kartica", () => {
  test("svaka treća kartica je kviz, a sadržaj druge oblasti se ne meša", () => {
    const deck = learnDeck("video", 0);
    expect(deck[2]?.type).toBe("quiz");
    expect(deck[0]?.type).toBe("tip");
    for (const card of deck) {
      const area = card.type === "tip" ? card.tip.area : card.quiz.area;
      expect(area === undefined || area === "video").toBe(true);
    }
  });

  test("svi saveti oblasti su u špilu, a seme menja početak", () => {
    const tipsInDeck = learnDeck("zvuk", 3).filter((card) => card.type === "tip");
    expect(tipsInDeck.length).toBe(CREA_TIPS.filter((tip) => tip.area === undefined || tip.area === "zvuk").length);
    const first = (seed: number) => {
      const card = learnDeck("slika", seed)[0]!;
      return card.type === "tip" ? card.tip.id : card.quiz.id;
    };
    expect(first(0)).not.toBe(first(1));
  });

  test("seme je stabilno; oblast iz vrste rada", () => {
    expect(seedFrom("abc")).toBe(seedFrom("abc"));
    expect(seedFrom("abc")).not.toBe(seedFrom("abd"));
    expect(tipAreaFor("image")).toBe("slika");
    expect(tipAreaFor("video")).toBe("video");
    expect(tipAreaFor("audio")).toBe("zvuk");
  });
});
