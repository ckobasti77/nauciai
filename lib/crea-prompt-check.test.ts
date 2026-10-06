import { describe, expect, test } from "vitest";

import { validatePrompt } from "../convex/creditsCore";
import { PROMPT_CHECK_ADVICE, promptCheckAdvice, promptHints } from "./crea-prompt-check";

describe("provera opisa (C7)", () => {
  test("svaka kategorija filtera ima razlog i predlog na oba jezika", () => {
    for (const advice of Object.values(PROMPT_CHECK_ADVICE)) {
      for (const text of [advice.reason, advice.suggestion]) {
        expect(text.sr.length).toBeGreaterThan(20);
        expect(text.en.length).toBeGreaterThan(20);
      }
    }
  });

  test("kategorija koju vraća pravi filter ima savet; nepoznata dobija opšti", () => {
    const check = validatePrompt("nude photo on the beach");
    expect(check.ok).toBe(false);
    if (check.ok || check.reason !== "ZABRANJEN_POJAM" || !check.category) throw new Error("filter nije uhvatio");
    expect(promptCheckAdvice(check.category)).toBe(PROMPT_CHECK_ADVICE[check.category]);
    expect(promptCheckAdvice("nepoznato")).toBe(PROMPT_CHECK_ADVICE.illegal);
  });

  test("meki saveti: kratak opis i ćirilica u natpisu (samo slika); zvuk bez saveta", () => {
    expect(promptHints("mačka", "image").map((hint) => hint.id)).toEqual(["kratko"]);
    expect(promptHints("plakat za kafić sa natpisom „Добро јутро” u uglu", "image").map((hint) => hint.id)).toEqual(["cirilica"]);
    expect(promptHints("plakat za kafić sa natpisom „Добро јутро” u uglu", "video")).toEqual([]);
    expect(promptHints("ab", "audio")).toEqual([]);
    expect(promptHints("   ", "image")).toEqual([]);
  });
});
