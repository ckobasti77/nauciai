import { expect, test } from "vitest";

import { fallbackAllowed, isRetriableProviderError, parseFallback } from "./creaFallbackCore";
import { creditFactorFor } from "./creaPricingCore";
import { NANO_BANANA_2 } from "./providers/googleImageModels";
import { computeCostUsd, computeCredits, CREDIT_FACTOR } from "./studioPricing";

test("rezerva samo za prolazne greške provajdera", () => {
  expect(isRetriableProviderError("Google API nije uspeo (503): overloaded")).toBe(true);
  expect(isRetriableProviderError("Google API nije uspeo (500): x")).toBe(true);
  expect(isRetriableProviderError("Google API nije uspeo (429): slow down")).toBe(true);
  expect(isRetriableProviderError("KVOTA_PREKORACENA: Google je odbio zahtev (429)")).toBe(true);
  expect(isRetriableProviderError("Google API nije uspeo (400): bad request")).toBe(false);
  expect(isRetriableProviderError("Google je vratio odgovor bez slike.")).toBe(false);
  expect(isRetriableProviderError("NEPOTPUN_ULAZ: Dodaj bar jednu sliku.")).toBe(false);
});

test("rezerva sme samo kad plaćeno pokriva njenu nabavnu bar ×1,2", () => {
  // 16 kr = 0,16 € = 0,185 $; 0,08 × 1,2 = 0,096 $ - ima mesta.
  expect(fallbackAllowed({ reservedCredits: 16, fallbackUsd: 0.08 })).toBe(true);
  // 8 kr = 0,0925 $ < 0,096 $.
  expect(fallbackAllowed({ reservedCredits: 8, fallbackUsd: 0.08 })).toBe(false);
  expect(fallbackAllowed({ reservedCredits: 16, fallbackUsd: 0 })).toBe(false);
  expect(fallbackAllowed({ reservedCredits: 0, fallbackUsd: 0.01 })).toBe(false);
});

test("Nano Banana 2 → fal prolazi i pod v1 i pod v2, na svakoj rezoluciji", () => {
  const fallback = parseFallback(NANO_BANANA_2.capabilities);
  expect(fallback?.provider).toBe("fal");
  if (!fallback) return;

  for (const resolution of ["0.5K", "1K", "2K", "4K"]) {
    const params = { resolution, aspect_ratio: "1:1" };
    const fallbackUsd = computeCostUsd(fallback.priceRule, params, "text");
    for (const factor of [CREDIT_FACTOR, creditFactorFor(1.5)]) {
      const reservedCredits = computeCredits(NANO_BANANA_2.priceRule, params, "text", factor);
      expect(fallbackAllowed({ reservedCredits, fallbackUsd }), `${resolution} @ ${factor}`).toBe(true);
    }
  }
});

test("neispravan `capabilities.fallback` znači da rezerve nema", () => {
  expect(parseFallback({})).toBeNull();
  expect(parseFallback({ fallback: { provider: "byteplus", endpoints: {}, priceRule: {} } })).toBeNull();
  expect(parseFallback({ fallback: { provider: "fal", priceRule: { unit: "image" } } })).toBeNull();
  expect(parseFallback({ fallback: [] })).toBeNull();
});
