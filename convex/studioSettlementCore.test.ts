import { expect, test } from "vitest";

import type { QuantitySource } from "./studioJobCore";
import type { PriceRule } from "./studioPricing";
import { planSettlement, readReportedSeconds, SETTLEMENT_REASON } from "./studioSettlementCore";

/** `dubbing` iz kataloga 4.2: 0,60 $ po minutu, količina se meri iz snimka. */
const DUBBING_RULE: PriceRule = { unit: "minute", baseUsd: 0.6, quantityParam: "minutes" };
const DUBBING_QUANTITY: QuantitySource = {
  param: "minutes",
  from: "input_media_minutes",
  min: 0.1,
  max: 120,
};

/** Rezervacija posla sa zaglavljem od 0,1 minut - polazna tačka napada iz N2. */
const RESERVED = { credits: 13, costUsd: 0.06 };

function plan(overrides: Partial<Parameters<typeof planSettlement>[0]> = {}) {
  return planSettlement({
    rule: DUBBING_RULE,
    params: { minutes: 0.1, target_language: "en" },
    source: DUBBING_QUANTITY,
    reportedSeconds: null,
    reportedCostUsd: null,
    reservedCredits: RESERVED.credits,
    reservedCostUsd: RESERVED.costUsd,
    ...overrides,
  });
}

// ── čitanje prijavljene količine ───────────────────────────────────────────

test("readReportedSeconds čita trajanje uz izlazni fajl, ma gde stajalo", () => {
  expect(readReportedSeconds({ audio: { url: "https://fal.media/a.mp3", duration: 7200 } })).toBe(
    7200,
  );
  expect(readReportedSeconds({ output: [{ video: { duration_seconds: 12.5 } }] })).toBe(12.5);
});

test("readReportedSeconds prevodi jedinicu iz imena polja", () => {
  expect(readReportedSeconds({ duration_ms: 4500 })).toBe(4.5);
  expect(readReportedSeconds({ durationMinutes: 2 })).toBe(120);
  expect(readReportedSeconds({ duration: 90 })).toBe(90);
});

test("readReportedSeconds vraća null kad količine nema - nema izmišljene nule", () => {
  expect(readReportedSeconds({ id: "req-1", status: "OK" })).toBeNull();
  expect(readReportedSeconds({ duration: 0 })).toBeNull();
  expect(readReportedSeconds({ duration: "7200" })).toBeNull();
  expect(readReportedSeconds(null)).toBeNull();
  expect(readReportedSeconds("nije objekat")).toBeNull();
});

// ── odluka o poravnanju ────────────────────────────────────────────────────

test("prijavljena količina preračunava cenu po katalogu, ne po zaglavlju", () => {
  // Ceo napad iz N2 u jednoj funkciji: rezervisano po 0,1 minut, obrađeno 120.
  const result = plan({ reportedSeconds: 7200 });

  expect(result).toMatchObject({
    settled: true,
    reason: SETTLEMENT_REASON.quantity,
    costUsd: 72,
    credits: 15570,
  });
  expect(result.settled && result.creditDelta).toBe(15570 - RESERVED.credits);
  expect(result.settled && result.costDeltaUsd).toBeCloseTo(72 - RESERVED.costUsd, 6);
});

test("prijavljena količina manja od rezervisane daje razliku naniže", () => {
  const result = plan({
    params: { minutes: 7, target_language: "en" },
    reservedCredits: 909,
    reservedCostUsd: 4.2,
    reportedSeconds: 60,
  });

  expect(result).toMatchObject({ settled: true, credits: 130 });
  expect(result.settled && result.creditDelta).toBe(130 - 909);
  expect(result.settled && result.costDeltaUsd).toBeCloseTo(0.6 - 4.2, 6);
});

test("prijavljena količina se odseca na `max` iz kataloga", () => {
  // Pogrešno pročitana jedinica (milisekunde kao sekunde) ne može da naplati
  // preko onoga što katalog za taj model uopšte dozvoljava.
  expect(plan({ reportedSeconds: 7_200_000 })).toMatchObject({ costUsd: 72 });
});

test("bez prijavljene količine se poravnava po prijavljenoj CENI", () => {
  const result = plan({ reportedCostUsd: 5 });

  expect(result).toMatchObject({ settled: true, reason: SETTLEMENT_REASON.cost, costUsd: 5 });
  // Isti `ceil(C × 216,25)` kao `computeCredits` - marža ostaje 2,5×.
  expect(result.settled && result.credits).toBe(1082);
});

test("količina pobeđuje cenu kad su prijavljene obe", () => {
  expect(plan({ reportedSeconds: 7200, reportedCostUsd: 5 })).toMatchObject({
    reason: SETTLEMENT_REASON.quantity,
    costUsd: 72,
  });
});

test("provajder koji nije prijavio ništa ostavlja rezervaciju", () => {
  expect(plan()).toEqual({ settled: false, reason: SETTLEMENT_REASON.missing });
  expect(plan({ reportedSeconds: 0 })).toEqual({
    settled: false,
    reason: SETTLEMENT_REASON.missing,
  });
  expect(plan({ reportedCostUsd: 0 })).toEqual({
    settled: false,
    reason: SETTLEMENT_REASON.missing,
  });
});

test("model bez merene količine se ne poravnava po trajanju", () => {
  // Slika nema `quantity` u katalogu: prijavljeno trajanje za nju ne znači
  // ništa, pa ostaje samo put preko cene.
  const image: PriceRule = { unit: "image", baseUsd: 0.04 };
  const result = planSettlement({
    rule: image,
    params: { num_images: 1 },
    source: null,
    reportedSeconds: 7200,
    reportedCostUsd: null,
    reservedCredits: 9,
    reservedCostUsd: 0.04,
  });

  expect(result).toEqual({ settled: false, reason: SETTLEMENT_REASON.missing });
});

test("tekst se ne poravnava po trajanju - njega server meri sam", () => {
  const text: QuantitySource = {
    param: "char_count",
    from: "text_length",
    min: 1,
    max: 5000,
    measuredFrom: "text",
  };
  const result = planSettlement({
    rule: { unit: "chars1k", baseUsd: 0.1, quantityParam: "char_count" },
    params: { char_count: 100, text: "zdravo" },
    source: text,
    reportedSeconds: 7200,
    reportedCostUsd: null,
    reservedCredits: 3,
    reservedCostUsd: 0.01,
  });

  expect(result).toEqual({ settled: false, reason: SETTLEMENT_REASON.missing });
});

test("posao bez pravila (stari katalog) ide samo preko cene", () => {
  const result = planSettlement({
    rule: null,
    params: {},
    source: null,
    reportedSeconds: 7200,
    reportedCostUsd: 2,
    reservedCredits: 10,
    reservedCostUsd: 0.5,
  });

  expect(result).toMatchObject({ settled: true, reason: SETTLEMENT_REASON.cost, costUsd: 2 });
});
