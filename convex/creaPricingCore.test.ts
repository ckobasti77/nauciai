import { expect, test } from "vitest";

import {
  CREA_MARGINS_V2,
  CREA_PRICE_CATEGORIES,
  creditFactorFor,
  isDefaultCreditFactor,
  MIN_MARGIN_V2,
  priceCategoryOf,
  resolveCreditFactor,
} from "./creaPricingCore";
import { STUDIO_MODELS, studioModelBySlug } from "./providers/catalogModels";
import { quantitySourceOf } from "./providers/modelControls";
import { sanitizeSpecParams } from "./studioParamSpec";
import { computeCostUsd, computeCredits, CREDIT_FACTOR } from "./studioPricing";

/**
 * Cena svakog reda iz kataloga PRE Cree K07 (commit 36cc7b9), sa podrazumevanim
 * parametrima u svakom režimu i merenom količinom 1 000 znakova / 2 minuta /
 * 10 sekundi. Izračunato nad tadašnjim fajlovima (`git show 36cc7b9:…`), ne nad
 * današnjim - inače bi test poredio kod sa samim sobom.
 */
const PRICES_BEFORE_K07: Record<string, number> = {
  "nano-banana-2/text": 16,
  "nano-banana-2/image_multi": 16,
  "nano-banana-pro/text": 33,
  "nano-banana-pro/image_multi": 33,
  "gpt-image-2/text": 12,
  "gpt-image-2/image_multi": 12,
  "gpt-image-15/text": 8,
  "gpt-image-15/image_multi": 8,
  "seedream-45/text": 9,
  "seedream-45/image_multi": 9,
  "seedream-5-pro/text": 10,
  "seedream-5-pro/image_multi": 10,
  "seedream-5-pro/layerize": 10,
  "seedream-5-lite/text": 8,
  "seedream-5-lite/image_multi": 8,
  "kling-tryon/image_multi": 16,
  "kling-3/text": 137,
  "kling-3/image": 137,
  "kling-3-turbo/text": 122,
  "kling-3-turbo/image": 122,
  "kling-3-turbo/first_last": 122,
  "kling-omni/text": 122,
  "kling-omni/first_last": 122,
  "kling-omni/reference": 122,
  "kling-omni/video": 182,
  "minimax-h3/text": 65,
  "minimax-h3/image": 65,
  "minimax-h3/first_last": 65,
  "minimax-h3/reference": 65,
  "seedance-20/text": 164,
  "seedance-20/image": 164,
  "seedance-20/reference": 164,
  "seedance-25/text": 250,
  "seedance-25/image": 250,
  "seedance-25/reference": 250,
  "veo-31-lite/text": 44,
  "veo-31-lite/image": 44,
  "veo-31-lite/first_last": 44,
  "veo-31-fast/text": 87,
  "veo-31-fast/image": 87,
  "veo-31-fast/first_last": 87,
  "veo-31-fast/reference": 87,
  "veo-31-fast/video": 87,
  "veo-31/text": 346,
  "veo-31/image": 346,
  "veo-31/first_last": 346,
  "veo-31/reference": 346,
  "veo-31/video": 346,
  "gemini-omni/text": 66,
  "gemini-omni/image": 66,
  "gemini-omni/reference": 66,
  "gemini-omni/video": 66,
  "kling-avatar/image_audio": 122,
  "kling-lipsync/video_audio": 31,
  "kling-motion/video_image": 273,
  "tts/text": 22,
  "dialogue/text": 22,
  "sfx/text": 3,
  "music/text": 130,
  "stt/audio": 4,
  "stt/video": 4,
  "voice-changer/audio": 130,
  "audio-isolation/audio": 44,
  "dubbing/video": 260,
  "dubbing/audio": 260,
  "kling-v2a/video": 8,
};

function defaultParams(slug: string, mode: string): Record<string, unknown> {
  const seed = studioModelBySlug(slug);
  if (!seed) throw new Error(`nema ${slug}`);
  const sanitized = sanitizeSpecParams(seed.paramSpec, seed.priceRule, {}, mode);
  if (!sanitized.ok) throw new Error(`${slug}/${mode}: ${sanitized.reason}`);
  const params: Record<string, unknown> = { ...sanitized.params };
  const quantity = quantitySourceOf(seed);
  if (quantity) {
    params[quantity.param] = quantity.from === "text_length" ? 1000 : quantity.from === "input_media_minutes" ? 2 : 10;
  }

  return params;
}

test("fleg isključen: SVAKA dosadašnja cena je ista kao pre K07", () => {
  for (const [key, before] of Object.entries(PRICES_BEFORE_K07)) {
    const [slug, mode] = key.split("/");
    const seed = studioModelBySlug(slug);
    expect(seed, key).toBeDefined();
    if (!seed) continue;
    const params = defaultParams(slug, mode);
    const factor = resolveCreditFactor({ pricingV2: false, category: priceCategoryOf(seed.kind, { night: false }) });

    expect(computeCredits(seed.priceRule, params, mode), key).toBe(before);
    expect(computeCredits(seed.priceRule, params, mode, factor), key).toBe(before);
  }
});

test("fleg isključen: faktor je današnji za svaku kategoriju i svaki red kataloga", () => {
  for (const category of CREA_PRICE_CATEGORIES) {
    expect(resolveCreditFactor({ pricingV2: false, category })).toBe(CREDIT_FACTOR);
  }
  for (const seed of STUDIO_MODELS) {
    for (const night of [false, true]) {
      const factor = resolveCreditFactor({ pricingV2: false, category: priceCategoryOf(seed.kind, { night }) });
      expect(isDefaultCreditFactor(factor), seed.slug).toBe(true);
    }
  }
});

test("marže v2: nijedna ispod ×1,5, i faktor prati maržu", () => {
  for (const category of CREA_PRICE_CATEGORIES) {
    expect(CREA_MARGINS_V2[category], category).toBeGreaterThanOrEqual(MIN_MARGIN_V2);
  }
  expect(creditFactorFor(2.5)).toBe(CREDIT_FACTOR);
  expect(creditFactorFor(1.5)).toBe(129.75);
  expect(creditFactorFor(2)).toBe(173);
  expect(resolveCreditFactor({ pricingV2: true, category: "image" })).toBe(129.75);
  expect(resolveCreditFactor({ pricingV2: true, category: "video" })).toBe(129.75);
  expect(resolveCreditFactor({ pricingV2: true, category: "audio" })).toBe(CREDIT_FACTOR);
  expect(resolveCreditFactor({ pricingV2: true, category: "image_batch" })).toBe(173);
});

test("kategorija: noćna tura je samo za slike", () => {
  expect(priceCategoryOf("image", { night: false })).toBe("image");
  expect(priceCategoryOf("image", { night: true })).toBe("image_batch");
  expect(priceCategoryOf("video", { night: true })).toBe("video");
  expect(priceCategoryOf("audio", { night: false })).toBe("audio");
});

test("v2 primeri iz plana (K06 §9.2) i v2 nikad ispod ×1,5 nabavne", () => {
  const v2 = (slug: string, params: Record<string, unknown>, mode = "text") => {
    const seed = studioModelBySlug(slug);
    if (!seed) throw new Error(slug);
    const factor = resolveCreditFactor({ pricingV2: true, category: priceCategoryOf(seed.kind, { night: false }) });

    return computeCredits(seed.priceRule, { ...defaultParams(slug, mode), ...params }, mode, factor);
  };

  expect(v2("nano-banana-2", { resolution: "1K" })).toBe(10);
  expect(v2("nano-banana-2", { resolution: "2K" })).toBe(14);
  expect(v2("nano-banana-2-lite", {})).toBe(5);
  expect(v2("nano-banana-pro", { resolution: "2K" })).toBe(20);
  expect(v2("veo-31-lite", { resolution: "720p", audio: true, duration: 8 })).toBe(52);
  // Zvuk ostaje kao danas (×2,5).
  expect(v2("tts", { char_count: 1000 })).toBe(22);

  for (const seed of STUDIO_MODELS) {
    const factor = resolveCreditFactor({ pricingV2: true, category: priceCategoryOf(seed.kind, { night: false }) });
    for (const mode of seed.inputModes) {
      const params = defaultParams(seed.slug, mode);
      const usd = computeCostUsd(seed.priceRule, params, mode);
      const credits = computeCredits(seed.priceRule, params, mode, factor);
      // 1 kr = 0,01 €: naplaćeno u evrima mora da pokrije nabavnu × 1,5.
      expect(credits / 100, `${seed.slug}/${mode}`).toBeGreaterThanOrEqual(
        Math.round(usd * 0.865 * MIN_MARGIN_V2 * 1e6) / 1e6 - 1e-9,
      );
    }
  }
});
