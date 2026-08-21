import { describe, expect, test } from "vitest";

import { computeMargin as serverComputeMargin, EUR_PER_USD as serverEurPerUsd } from "@/convex/studioCore";
import { computeMargin, EUR_PER_USD, formatMargin, jobStatusLabel, LOW_MARGIN_THRESHOLD, marginTone } from "./studio-admin";

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

test("jobStatusLabel: svih 5 statusa ima srpski naziv, nepoznat status vraća sam sebe", () => {
  expect(jobStatusLabel("reserved")).toBe("Rezervisano");
  expect(jobStatusLabel("running")).toBe("U toku");
  expect(jobStatusLabel("done")).toBe("Završeno");
  expect(jobStatusLabel("failed")).toBe("Neuspešno");
  expect(jobStatusLabel("refunded")).toBe("Vraćeno");
  expect(jobStatusLabel("nepoznato")).toBe("nepoznato");
});
