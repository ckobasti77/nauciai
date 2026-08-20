import { expect, test } from "vitest";

import { SEEDANCE_20, SEEDANCE_25, SEEDREAM_5_PRO } from "./providers/bytePlusModels";
import {
  computeCostUsd,
  computeCredits,
  CREDIT_FACTOR,
  isCombinationPriceable,
  parsePriceRule,
  type PriceRule,
  pricingModeFor,
  referenceVideoBillableSeconds,
} from "./studioPricing";

// ── 1. gradivni elementi pravila (STUDIO-CATALOG-V4 sekcija 1.3) ───────────

test("baseUsd bez ičega drugog je cela cena", () => {
  expect(computeCostUsd({ unit: "image", baseUsd: 0.04 }, {})).toBe(0.04);
});

test("addUsd se sabira POSLE količine - to je dodatak po generaciji, ne po komadu", () => {
  const rule: PriceRule = {
    unit: "image",
    baseUsd: 0.067,
    addUsd: 0.003,
    quantityParam: "num_images",
  };

  // Jedna slika: 0,067 + 0,003. Četiri slike: 4 x 0,067 + 0,003 - thinking
  // tokeni se plaćaju jednom, model misli jednom.
  expect(computeCostUsd(rule, { num_images: 1 })).toBeCloseTo(0.07, 10);
  expect(computeCostUsd(rule, { num_images: 4 })).toBeCloseTo(0.271, 10);
});

test("multipliers se primenjuju na osnovu, pre količine i pre addUsd", () => {
  // Nano Banana 2 iz kataloga 2.1: 4K je 0,067 x 2 + 0,003 = 0,137.
  const rule: PriceRule = {
    unit: "image",
    baseUsd: 0.067,
    addUsd: 0.003,
    multipliers: [{ param: "resolution", map: { "1K": 1, "4K": 2 } }],
    quantityParam: "num_images",
  };

  expect(computeCostUsd(rule, { resolution: "4K", num_images: 1 })).toBeCloseTo(0.137, 10);
  expect(computeCredits(rule, { resolution: "4K", num_images: 1 })).toBe(30);
});

test("switch parametar ulazi u mapu kao on/off, ne kao true/false", () => {
  const rule: PriceRule = {
    unit: "second",
    baseUsd: 0.05,
    multipliers: [{ param: "lora", map: { off: 1, on: 1.25 } }],
  };

  expect(computeCostUsd(rule, { lora: false })).toBeCloseTo(0.05, 10);
  expect(computeCostUsd(rule, { lora: true })).toBeCloseTo(0.0625, 10);
});

test("lookup ima prednost nad baseUsd kad oba postoje", () => {
  const rule: PriceRule = {
    unit: "image",
    baseUsd: 9.99,
    lookup: { params: ["quality"], map: { low: 0.006 } },
  };

  expect(computeCostUsd(rule, { quality: "low" })).toBe(0.006);
});

test("nepoznata kombinacija u lookup-u BACA, ne pada na nulu", () => {
  const rule: PriceRule = {
    unit: "image",
    lookup: { params: ["quality", "size"], map: { "low|1024x1024": 0.006 } },
  };

  expect(() => computeCostUsd(rule, { quality: "high", size: "1024x1024" })).toThrow(
    /NEPOZNATA_KOMBINACIJA/,
  );
  // Parametar koji uopšte nije poslat je isto nepoznata cena, ne besplatno.
  expect(() => computeCostUsd(rule, { quality: "low" })).toThrow(/NEPOZNATA_KOMBINACIJA/);
});

test("ključ iz Object.prototype ne prolazi kao cena", () => {
  const rule: PriceRule = { unit: "image", lookup: { params: ["quality"], map: { low: 0.006 } } };

  expect(() => computeCostUsd(rule, { quality: "constructor" })).toThrow(/NEPOZNATA_KOMBINACIJA/);
  expect(isCombinationPriceable(rule, { quality: "toString" })).toBe(false);
});

test("nepoznata vrednost u multipliers BACA", () => {
  const rule: PriceRule = {
    unit: "image",
    baseUsd: 0.04,
    multipliers: [{ param: "resolution", map: { "1K": 1 } }],
  };

  expect(() => computeCostUsd(rule, { resolution: "8K" })).toThrow(
    /NEPOZNATA_VREDNOST_PARAMETRA:resolution/,
  );
});

test("quantityParam koji nije pozitivan broj BACA", () => {
  const rule: PriceRule = { unit: "second", baseUsd: 0.1, quantityParam: "duration" };

  for (const duration of [undefined, 0, -3, "5", Number.NaN]) {
    expect(() => computeCostUsd(rule, { duration })).toThrow(/NEISPRAVNA_KOLICINA:duration/);
  }
  expect(computeCostUsd(rule, { duration: 5 })).toBeCloseTo(0.5, 10);
});

test("roundUpTo zaokružuje količinu naviše - lipsync od 3 s se naplaćuje kao 5 s", () => {
  const rule: PriceRule = {
    unit: "second",
    baseUsd: 0.014,
    quantityParam: "duration",
    roundUpTo: 5,
  };

  expect(computeCostUsd(rule, { duration: 3 })).toBeCloseTo(0.07, 10);
  expect(computeCostUsd(rule, { duration: 5 })).toBeCloseTo(0.07, 10);
  expect(computeCostUsd(rule, { duration: 6 })).toBeCloseTo(0.14, 10);
  expect(computeCredits(rule, { duration: 3 })).toBe(16);
});

test("extras ne naplaćuju ništa ispod besplatne kvote", () => {
  const rule: PriceRule = {
    unit: "second",
    baseUsd: 0.05,
    quantityParam: "duration",
    extras: [{ param: "reference_images", freeCount: 5, usdEach: 0.08 }],
  };

  const base = computeCostUsd(rule, { duration: 5, reference_images: 5 });
  expect(base).toBeCloseTo(0.25, 10);
  expect(computeCostUsd(rule, { duration: 5, reference_images: 3 })).toBeCloseTo(0.25, 10);
  // Šesta referenca je prva naplaćena: +0,08 $.
  expect(computeCostUsd(rule, { duration: 5, reference_images: 6 })).toBeCloseTo(0.33, 10);
  // Katalog (3.6) tu stavku vodi kao "+18 kredita", i to je cena SAME stavke:
  // `ceil(0,08 × 216,25) = 18`.
  expect(Math.ceil(0.08 * CREDIT_FACTOR)).toBe(18);
  // Na računu se ipak vidi +17, jer `ceil` ide TAČNO JEDNOM nad ukupnom cenom
  // (55 -> 72), a ne po stavci. Naplaćeno je i dalje >= nabavno (invarijanta
  // marže niže to i tvrdi nad celim prostorom), pa je razlika u korist kupca za
  // jedan kredit, nikad u korist kase.
  expect(
    computeCredits(rule, { duration: 5, reference_images: 6 }) -
      computeCredits(rule, { duration: 5, reference_images: 5 }),
  ).toBe(17);
});

test("modeMultipliers menjaju cenu po režimu, a nepoznat režim je množilac 1", () => {
  const rule: PriceRule = {
    unit: "second",
    baseUsd: 0.084,
    quantityParam: "duration",
    modeMultipliers: { video: 1.5 },
  };

  expect(computeCostUsd(rule, { duration: 5 }, "text")).toBeCloseTo(0.42, 10);
  expect(computeCostUsd(rule, { duration: 5 }, "video")).toBeCloseTo(0.63, 10);
  expect(computeCostUsd(rule, { duration: 5 }, undefined)).toBeCloseTo(0.42, 10);
});

test("ceil se primenjuje tačno jednom, na kraju - ne po sekundi", () => {
  const rule: PriceRule = { unit: "second", baseUsd: 0.151, quantityParam: "duration" };

  // Po sekundi je 33 kredita (ceil 32,65), pa bi 5 x 33 bilo 165. Pravilo iz
  // sekcije 1.3 kaže ceil(ukupno), dakle 164.
  expect(computeCredits(rule, { duration: 1 })).toBe(33);
  expect(computeCredits(rule, { duration: 5 })).toBe(164);
});

test("chars1k deli količinu sa hiljadu - tarifa je po 1 000 znakova, količina po znaku", () => {
  // ElevenLabs v3 iz kataloga 4.1: $0,10 po hiljadu znakova.
  const rule: PriceRule = { unit: "chars1k", baseUsd: 0.1, quantityParam: "char_count" };

  expect(computeCostUsd(rule, { char_count: 1000 })).toBeCloseTo(0.1, 10);
  expect(computeCostUsd(rule, { char_count: 250 })).toBeCloseTo(0.025, 10);
  expect(computeCredits(rule, { char_count: 1000 })).toBe(22);

  // Nijedna druga jedinica se ne deli - sekunda je sekunda.
  expect(computeCostUsd({ unit: "second", baseUsd: 0.1, quantityParam: "duration" }, { duration: 1000 })).toBeCloseTo(
    100,
    10,
  );
});

test("parsePriceRule odbija sve što nije pravilo sa poznatim unit-om", () => {
  expect(parsePriceRule("nije json")).toBeNull();
  expect(parsePriceRule("[]")).toBeNull();
  expect(parsePriceRule(JSON.stringify({ baseUsd: 1 }))).toBeNull();
  expect(parsePriceRule(JSON.stringify({ unit: "pixels", baseUsd: 1 }))).toBeNull();
  expect(parsePriceRule(JSON.stringify({ unit: "image", baseUsd: 0.04 }))).toEqual({
    unit: "image",
    baseUsd: 0.04,
  });
});

// ── 2. Seedream 5 Pro: layerize se naplaćuje PO SLOJU (katalog 2.6) ────────

test("layerize sa 8 slojeva naplaćuje tačno 8x cenu jednog sloja", () => {
  const rule = SEEDREAM_5_PRO.priceRule;
  const oneLayer = computeCostUsd(rule, { resolution: "1.5K", layers: 1 }, "layerize");
  const eightLayers = computeCostUsd(rule, { resolution: "1.5K", layers: 8 }, "layerize");

  expect(oneLayer).toBeCloseTo(0.0225, 10);
  expect(eightLayers).toBeCloseTo(oneLayer * 8, 10);
  expect(eightLayers).toBeCloseTo(0.18, 10);
  // 5 kredita po sloju iz kataloga; ceil ide jednom na kraju, pa 39 a ne 40.
  expect(computeCredits(rule, { resolution: "1.5K", layers: 1 }, "layerize")).toBe(5);
  expect(computeCredits(rule, { resolution: "1.5K", layers: 8 }, "layerize")).toBe(39);
});

test("layerize na 2K je duplo po sloju, i dalje linearno po broju slojeva", () => {
  const rule = SEEDREAM_5_PRO.priceRule;

  expect(computeCostUsd(rule, { resolution: "2K", layers: 1 }, "layerize")).toBeCloseTo(0.045, 10);
  expect(computeCredits(rule, { resolution: "2K", layers: 1 }, "layerize")).toBe(10);
  expect(computeCostUsd(rule, { resolution: "2K", layers: 8 }, "layerize")).toBeCloseTo(0.36, 10);
});

test("layerize pravilo se NE meša sa pravilom za obične slike", () => {
  const rule = SEEDREAM_5_PRO.priceRule;

  // Isti model, isti parametri rezolucije, drugi režim -> druga jedinica i
  // drugi parametar količine. `num_images` u layerize režimu ne znači ništa.
  expect(computeCredits(rule, { resolution: "1.5K", num_images: 1 })).toBe(10);
  expect(computeCredits(rule, { resolution: "2K", num_images: 1 })).toBe(20);
  expect(() => computeCostUsd(rule, { resolution: "1.5K", num_images: 4 }, "layerize")).toThrow(
    /NEISPRAVNA_KOLICINA:layers/,
  );
});

test("dodatna ulazna slika preko prve košta +1 kredit, prva je besplatna", () => {
  const rule = SEEDREAM_5_PRO.priceRule;
  const params = { resolution: "1.5K", num_images: 1 };

  expect(computeCredits(rule, { ...params, input_images: 1 })).toBe(10);
  expect(computeCredits(rule, { ...params, input_images: 2 })).toBe(11);
  expect(computeCredits(rule, { ...params, input_images: 4 })).toBe(12);
});

// ── 3. Seedance: tier, Mini i referenca sa videom (katalog 3.4, 3.5) ───────

test("Seedance 2.0 tier menja cenu preko lookup-a - tabela iz kataloga 3.4", () => {
  const rule = SEEDANCE_20.priceRule;
  const perSecond = (tier: string, resolution: string) =>
    computeCredits(rule, { tier, resolution, duration: 1 });

  expect(perSecond("mini", "480p")).toBe(8);
  expect(perSecond("mini", "720p")).toBe(17);
  expect(perSecond("fast", "720p")).toBe(27);
  expect(perSecond("standard", "480p")).toBe(16);
  expect(perSecond("standard", "720p")).toBe(33);
  expect(perSecond("standard", "1080p")).toBe(81);
  expect(perSecond("standard", "4K")).toBe(169);
});

test("Seedance 2.0 Mini nema 1080p ni 4K - kombinacija nema cenu, pa ni ponudu", () => {
  const rule = SEEDANCE_20.priceRule;

  expect(isCombinationPriceable(rule, { tier: "mini", resolution: "720p" })).toBe(true);
  expect(isCombinationPriceable(rule, { tier: "mini", resolution: "1080p" })).toBe(false);
  expect(isCombinationPriceable(rule, { tier: "mini", resolution: "4K" })).toBe(false);
  expect(isCombinationPriceable(rule, { tier: "fast", resolution: "1080p" })).toBe(false);
  expect(() => computeCostUsd(rule, { tier: "mini", resolution: "1080p", duration: 5 })).toThrow(
    /NEPOZNATA_KOMBINACIJA:mini\|1080p/,
  );
});

test("reference režim sa video ulazom nosi množilac 0,6", () => {
  const rule = SEEDANCE_20.priceRule;
  const params = { tier: "standard", resolution: "720p", duration: 5 };

  const withoutVideo = computeCostUsd(rule, params, "reference");
  const withVideo = computeCostUsd(rule, params, "reference_with_video");

  expect(withoutVideo).toBeCloseTo(0.755, 10);
  expect(withVideo / withoutVideo).toBeCloseTo(0.6, 10);
  expect(withVideo).toBeCloseTo(0.453, 10);
  expect(computeCredits(rule, params, "reference")).toBe(164);
  expect(computeCredits(rule, params, "reference_with_video")).toBe(98);
});

test("isti množilac 0,6 važi i za Seedance 2.5", () => {
  const rule = SEEDANCE_25.priceRule;
  const params = { resolution: "720p", duration: 5 };

  expect(computeCostUsd(rule, params, "reference_with_video") / computeCostUsd(rule, params, "reference"))
    .toBeCloseTo(0.6, 10);
});

test("pricingModeFor prebacuje na sniženu tarifu SAMO za reference sa videom", () => {
  expect(pricingModeFor("reference", true)).toBe("reference_with_video");
  expect(pricingModeFor("reference", false)).toBe("reference");
  expect(pricingModeFor("image", true)).toBe("image");
  expect(pricingModeFor("text", false)).toBe("text");
});

test("kod reference sa videom se naplaćuje i ulazni i izlazni video", () => {
  const rule = SEEDANCE_20.priceRule;
  // Izlaz 5 s, okačen video 4 s -> naplativo 9 s po sniženoj tarifi.
  const billable = referenceVideoBillableSeconds(5, 4);
  expect(billable).toBe(9);

  const params = { tier: "standard", resolution: "720p", duration: billable };
  expect(computeCostUsd(rule, params, "reference_with_video")).toBeCloseTo(0.151 * 9 * 0.6, 10);
  // Bez ulaznog videa ostaje samo izlaz.
  expect(referenceVideoBillableSeconds(5, 0)).toBe(5);
});

test("Seedance 2.5 tabela iz kataloga 3.5", () => {
  const rule = SEEDANCE_25.priceRule;
  const perSecond = (resolution: string) => computeCredits(rule, { resolution, duration: 1 });

  expect(perSecond("480p")).toBe(23);
  expect(perSecond("720p")).toBe(50);
  // Katalog u tekstu piše 125, ali `ceil(0,569 x 216,25)` je 124. JSON pravilo
  // je izvor istine (sekcija 1.3), pa 124 - videti ODLUKE u STUDIO-PROGRESS.
  expect(perSecond("1080p")).toBe(124);
  expect(isCombinationPriceable(rule, { resolution: "4K" })).toBe(false);
});

test("Seedream 5 Pro tabela iz kataloga 2.6", () => {
  const rule = SEEDREAM_5_PRO.priceRule;

  expect(computeCredits(rule, { resolution: "1.5K", num_images: 1 })).toBe(10);
  expect(computeCredits(rule, { resolution: "2K", num_images: 1 })).toBe(20);
});

// ── 4. invarijanta marže nad CELIM prostorom parametara (sekcija 1.3) ──────

test("marža nikad ne pada ispod 1,0 ni na jednoj kombinaciji BytePlus modela", () => {
  const combinations: Array<{ rule: PriceRule; params: Record<string, unknown>; mode?: string }> = [];

  for (const resolution of ["1.5K", "2K"]) {
    for (let numImages = 1; numImages <= 4; numImages += 1) {
      for (const inputImages of [0, 1, 2, 10]) {
        combinations.push({
          rule: SEEDREAM_5_PRO.priceRule,
          params: { resolution, num_images: numImages, input_images: inputImages },
        });
      }
    }
    for (let layers = 2; layers <= 17; layers += 1) {
      combinations.push({
        rule: SEEDREAM_5_PRO.priceRule,
        params: { resolution, layers },
        mode: "layerize",
      });
    }
  }

  for (const tier of ["standard", "fast", "mini"]) {
    for (const resolution of ["480p", "720p", "1080p", "4K"]) {
      for (let duration = 4; duration <= 12; duration += 1) {
        for (const mode of ["text", "image", "reference", "reference_with_video"]) {
          const params = { tier, resolution, duration };
          if (!isCombinationPriceable(SEEDANCE_20.priceRule, params, mode)) continue;
          combinations.push({ rule: SEEDANCE_20.priceRule, params, mode });
        }
      }
    }
  }

  for (const resolution of ["480p", "720p", "1080p"]) {
    for (let duration = 4; duration <= 30; duration += 1) {
      for (const mode of ["text", "image", "reference", "reference_with_video"]) {
        combinations.push({ rule: SEEDANCE_25.priceRule, params: { resolution, duration }, mode });
      }
    }
  }

  expect(combinations.length).toBeGreaterThan(400);
  for (const { rule, params, mode } of combinations) {
    const costUsd = computeCostUsd(rule, params, mode);
    const credits = computeCredits(rule, params, mode);
    expect(costUsd).toBeGreaterThan(0);
    expect(credits / (costUsd * CREDIT_FACTOR)).toBeGreaterThanOrEqual(1);
  }
});
