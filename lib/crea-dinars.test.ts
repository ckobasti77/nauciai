import { describe, expect, test } from "vitest";

import { creditsToDinars, creditsToEuros, EUR_RSD, formatDinars, rateNote } from "./crea-dinars";

describe("cena u dinarima", () => {
  test("kurs je konstanta sa datumom", () => {
    expect(EUR_RSD.rate).toBeGreaterThan(100);
    expect(EUR_RSD.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("kredit je €0,01; dinari zaokruženi, plaćen rad nikad 0 din", () => {
    expect(creditsToEuros(16)).toBe(0.16);
    expect(creditsToDinars(16)).toBe(Math.round(16 * 0.01 * EUR_RSD.rate));
    expect(creditsToDinars(1)).toBe(1);
    expect(creditsToDinars(0)).toBe(0);
    expect(creditsToDinars(Number.NaN)).toBe(0);
    expect(creditsToDinars(1000)).toBe(Math.round(10 * EUR_RSD.rate));
  });

  test("prikaz na oba jezika", () => {
    expect(formatDinars(16, "sr")).toBe(`≈ ${creditsToDinars(16)} din`);
    expect(formatDinars(16, "en")).toBe(`≈ RSD ${creditsToDinars(16)}`);
    expect(rateNote("sr")).toContain("06.10.2026.");
    expect(rateNote("en")).toContain("06/10/2026");
  });
});
