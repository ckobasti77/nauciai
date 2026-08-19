import { describe, expect, it } from "vitest";

import { normalizePlan, planFromPriceId } from "./plan";

describe("normalizePlan", () => {
  it("treats a missing plan as basic", () => {
    expect(normalizePlan(undefined)).toBe("basic");
  });

  it("keeps the two known tiers", () => {
    expect(normalizePlan("basic")).toBe("basic");
    expect(normalizePlan("premium")).toBe("premium");
  });

  it("falls back to basic for anything unrecognized", () => {
    expect(normalizePlan("")).toBe("basic");
    expect(normalizePlan("Premium")).toBe("basic");
    expect(normalizePlan("pro")).toBe("basic");
  });
});

describe("planFromPriceId", () => {
  const map = { price_basic: "basic", price_premium: "premium" } as const;

  it("reads the plan out of the map", () => {
    expect(planFromPriceId("price_premium", map)).toBe("premium");
    expect(planFromPriceId("price_basic", map)).toBe("basic");
  });

  it("returns basic for a price that is not in the map", () => {
    expect(planFromPriceId("price_unknown", map)).toBe("basic");
    expect(planFromPriceId("price_unknown", {})).toBe("basic");
  });
});
