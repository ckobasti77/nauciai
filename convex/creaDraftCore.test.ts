import { expect, test } from "vitest";

import { inheritedSeed, MAX_SEED, seedFromUnit, seedParamOf } from "./creaDraftCore";
import { STUDIO_MODELS } from "./providers/catalogModels";

const parent = { derivation: "usavrsavanje", family: "wan", parentFamily: "wan", seedParam: "seed" };

test("Usavrši iste porodice nasleđuje seme probe", () => {
  expect(inheritedSeed({ ...parent, parentParams: { seed: 1234 } })).toBe(1234);
  expect(inheritedSeed({ ...parent, parentParams: { seed: 0 } })).toBe(0);
});

test("seme se NE nasleđuje između porodica, za druge izvedbe, ni kad ga proba nema", () => {
  expect(inheritedSeed({ ...parent, parentFamily: "flux-2", parentParams: { seed: 1 } })).toBeNull();
  expect(inheritedSeed({ ...parent, derivation: "regeneracija", parentParams: { seed: 1 } })).toBeNull();
  expect(inheritedSeed({ ...parent, derivation: undefined, parentParams: { seed: 1 } })).toBeNull();
  expect(inheritedSeed({ ...parent, parentParams: {} })).toBeNull();
  expect(inheritedSeed({ ...parent, parentParams: null })).toBeNull();
  expect(inheritedSeed({ ...parent, parentParams: { seed: -1 } })).toBeNull();
  expect(inheritedSeed({ ...parent, parentParams: { seed: 1.5 } })).toBeNull();
  expect(inheritedSeed({ ...parent, parentParams: { seed: MAX_SEED + 1 } })).toBeNull();
});

test("novo seme je ceo broj u opsegu koji primaju fal i BytePlus", () => {
  for (const unit of [0, 0.25, 0.999999999999, 1, -3, Number.NaN]) {
    const seed = seedFromUnit(unit);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(MAX_SEED);
  }
});

test("seme imaju samo modeli čiji provajder ga prima, i nijedan ga nema kao kontrolu", () => {
  expect(seedParamOf({})).toBeNull();
  expect(seedParamOf({ seedParam: "seed" })).toBe("seed");
  for (const model of STUDIO_MODELS) {
    const param = seedParamOf(model.capabilities);
    if (!param) continue;
    expect(model.provider, model.slug).toBe("fal");
    expect(model.paramSpec.some((control) => control.key === param), model.slug).toBe(false);
  }
});
