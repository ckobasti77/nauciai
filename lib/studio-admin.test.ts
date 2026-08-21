import { describe, expect, test } from "vitest";

import { computeMargin as serverComputeMargin, EUR_PER_USD as serverEurPerUsd } from "@/convex/studioCore";
import {
  actualCostReasonLabel,
  computeMargin,
  costOriginLabel,
  EUR_PER_USD,
  formatMargin,
  isQuantityRateModel,
  jobStatusLabel,
  LOW_MARGIN_THRESHOLD,
  marginColumnTitle,
  marginTone,
  modelCostOrigin,
} from "./studio-admin";

describe("computeMargin poklapa se sa convex/studioCore.ts (namerna duplikacija)", () => {
  test("konstante su identične", () => {
    expect(EUR_PER_USD).toBe(serverEurPerUsd);
  });

  test("nekoliko modela iz STUDIO-PLAN §2.3", () => {
    const cases: Array<[number, number]> = [
      [3, 0.005],
      [20, 0.08],
      [55, 0.25],
      [185, 0.84],
    ];
    for (const [creditCost, estimatedCostUsd] of cases) {
      expect(computeMargin(creditCost, estimatedCostUsd)).toBe(serverComputeMargin(creditCost, estimatedCostUsd));
    }
  });
});

test("computeMargin: nula ili negativna nabavna cena daje null", () => {
  expect(computeMargin(20, 0)).toBeNull();
  expect(computeMargin(20, -1)).toBeNull();
});

test("marginTone: unknown za null, warn ispod praga, ok na i iznad praga", () => {
  expect(marginTone(null)).toBe("unknown");
  expect(marginTone(LOW_MARGIN_THRESHOLD - 0.01)).toBe("warn");
  expect(marginTone(LOW_MARGIN_THRESHOLD)).toBe("ok");
  expect(marginTone(LOW_MARGIN_THRESHOLD + 1)).toBe("ok");
});

test("formatMargin: crtica za null, jedna decimala sa 'x' inače", () => {
  expect(formatMargin(null)).toBe("—");
  expect(formatMargin(2.893)).toBe("2.9x");
  expect(formatMargin(0)).toBe("0.0x");
});

describe("jobStatusLabel: dvojezičnost i fallback", () => {
  test("svih 5 statusa na srpskom (podrazumevano i eksplicitno)", () => {
    expect(jobStatusLabel("reserved")).toBe("Rezervisano");
    expect(jobStatusLabel("running", "sr")).toBe("U toku");
    expect(jobStatusLabel("done", "sr")).toBe("Završeno");
    expect(jobStatusLabel("failed", "sr")).toBe("Neuspešno");
    expect(jobStatusLabel("refunded", "sr")).toBe("Vraćeno");
  });

  test("svih 5 statusa na engleskom", () => {
    expect(jobStatusLabel("reserved", "en")).toBe("Reserved");
    expect(jobStatusLabel("running", "en")).toBe("Running");
    expect(jobStatusLabel("done", "en")).toBe("Done");
    expect(jobStatusLabel("failed", "en")).toBe("Failed");
    expect(jobStatusLabel("refunded", "en")).toBe("Refunded");
  });

  test("nepoznat status vraća sam sebe", () => {
    expect(jobStatusLabel("nepoznato")).toBe("nepoznato");
    expect(jobStatusLabel("unknown", "en")).toBe("unknown");
  });
});

describe("actualCostReasonLabel (Tačka 2: mapiranje sirovih kodova u ljudske poruke)", () => {
  test("poznati razlozi na srpskom", () => {
    expect(actualCostReasonLabel("provajder nije prijavio upotrebu", "sr")).toBe(
      "Provajder nije poslao podatke o potrošnji",
    );
    expect(actualCostReasonLabel("provajder nije prijavio kolicinu", "sr")).toBe(
      "Provajder nije prijavio dužinu ili količinu",
    );
    expect(actualCostReasonLabel("model se ne naplacuje po tokenima", "sr")).toBe(
      "Model se ne naplaćuje po tokenima",
    );
    expect(actualCostReasonLabel("fal billing event nije stigao", "sr")).toBe(
      "Čeka se noćni fal obračun",
    );
    expect(actualCostReasonLabel("nepoznat oblik odgovora", "sr")).toBe(
      "Nepoznat format odgovora provajdera",
    );
    expect(actualCostReasonLabel("model nije u katalogu", "sr")).toBe(
      "Model više nije u katalogu",
    );
    expect(actualCostReasonLabel("nema tarife za kategoriju prompt", "sr")).toBe(
      "Nedostaje tarifa za prompt tokene",
    );
    expect(actualCostReasonLabel("nema tarife za kategoriju output", "sr")).toBe(
      "Nedostaje tarifa za izlazne tokene",
    );
    expect(actualCostReasonLabel("nema tarife za kategoriju thinking", "sr")).toBe(
      "Nedostaje tarifa za tokene razmišljanja",
    );
  });

  test("poznati razlozi na engleskom", () => {
    expect(actualCostReasonLabel("provajder nije prijavio upotrebu", "en")).toBe(
      "Provider did not report token usage",
    );
    expect(actualCostReasonLabel("provajder nije prijavio kolicinu", "en")).toBe(
      "Provider did not report measured quantity",
    );
    expect(actualCostReasonLabel("model se ne naplacuje po tokenima", "en")).toBe(
      "Model is not billed by tokens",
    );
    expect(actualCostReasonLabel("fal billing event nije stigao", "en")).toBe(
      "Awaiting nightly fal billing event",
    );
    expect(actualCostReasonLabel("nepoznat oblik odgovora", "en")).toBe(
      "Unrecognized provider response format",
    );
    expect(actualCostReasonLabel("model nije u katalogu", "en")).toBe(
      "Model not found in catalog",
    );
    expect(actualCostReasonLabel("nema tarife za kategoriju prompt", "en")).toBe(
      "Missing rate for prompt tokens",
    );
    expect(actualCostReasonLabel("nema tarife za kategoriju output", "en")).toBe(
      "Missing rate for output tokens",
    );
    expect(actualCostReasonLabel("nema tarife za kategoriju thinking", "en")).toBe(
      "Missing rate for thinking tokens",
    );
  });

  test("dinamičko mapiranje za nestandardne kategorije", () => {
    expect(actualCostReasonLabel("nema tarife za kategoriju custom_audio", "sr")).toBe(
      "Nedostaje tarifa za kategoriju custom_audio",
    );
    expect(actualCostReasonLabel("nema tarife za kategoriju custom_audio", "en")).toBe(
      "Missing rate for custom_audio tokens",
    );
  });

  test("nepoznat razlog vraća sam sebe", () => {
    expect(actualCostReasonLabel("neocekivana greska", "sr")).toBe("neocekivana greska");
  });
});

describe("Model cost origin & Nalaz Y3 (Tačka 3: razdvajanje stvarne marže od interne tarife)", () => {
  test("identifikuje 4 modela koji koriste sopstvenu tarifu nad količinom", () => {
    expect(isQuantityRateModel("seedance-20")).toBe(true);
    expect(isQuantityRateModel("seedance-25")).toBe(true);
    expect(isQuantityRateModel("veo-31-fast")).toBe(true);
    expect(isQuantityRateModel("gemini-omni")).toBe(true);
    expect(isQuantityRateModel("flux-schnell")).toBe(false);
    expect(isQuantityRateModel("nano-banana-pro")).toBe(false);
  });

  test("modelCostOrigin razlikuje merenja, internu količinsku tarifu i prazno stanje", () => {
    expect(modelCostOrigin("flux-schnell", 0)).toBe("no_measurement");
    expect(modelCostOrigin("seedance-20", 0)).toBe("no_measurement");
    expect(modelCostOrigin("seedance-20", 12)).toBe("internal_quantity_rate");
    expect(modelCostOrigin("veo-31-fast", 5)).toBe("internal_quantity_rate");
    expect(modelCostOrigin("flux-schnell", 5)).toBe("provider_invoice");
    expect(modelCostOrigin("nano-banana-pro", 8)).toBe("provider_invoice");
  });

  test("costOriginLabel daje jasne tekstualne oznake porekla na oba jezika", () => {
    expect(costOriginLabel("provider_invoice", "sr")).toBe("faktura provajdera");
    expect(costOriginLabel("provider_invoice", "en")).toBe("provider invoice");
    expect(costOriginLabel("internal_quantity_rate", "sr")).toBe(
      "naša tarifa nad prijavljenom količinom",
    );
    expect(costOriginLabel("internal_quantity_rate", "en")).toBe(
      "internal rate over reported quantity",
    );
    expect(costOriginLabel("no_measurement", "sr")).toBe("nema merenja");
    expect(costOriginLabel("no_measurement", "en")).toBe("no measurement");
  });

  test("marginColumnTitle ne naziva internu tarifu 'Stvarna marža'", () => {
    expect(marginColumnTitle("internal_quantity_rate", "sr")).toBe("Računska marža (količina)");
    expect(marginColumnTitle("internal_quantity_rate", "en")).toBe("Calculated margin (quantity)");
    expect(marginColumnTitle("provider_invoice", "sr")).toBe("Stvarna marža");
    expect(marginColumnTitle("provider_invoice", "en")).toBe("Actual margin");
  });
});
