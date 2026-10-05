/**
 * Crea K07: novi redovi kataloga (S2, V2), C0 ispravke i imena polja za fal.
 * Cene i izvori: `docs/crea/planovi/K06.md` §2-§5 (pročitano 2026-10-05).
 * Invarijante (marža ≥ 1, kontrole i opcije) za SVE redove drži
 * `catalogModels.test.ts`; ovde su tabele koje invarijanta ne hvata.
 */

import { expect, test } from "vitest";

import { sanitizeSpecParams } from "../studioParamSpec";
import { computeCostUsd, computeCredits, isCombinationPriceable } from "../studioPricing";
import { SEEDANCE_20 } from "./bytePlusModels";
import { studioModelBySlug } from "./catalogModels";
import { DUBBING, MUSIC, SFX } from "./falAudioModels";
import {
  FLUX_2_KLEIN,
  FLUX_2_PRO,
  FLUX_KONTEXT,
  GPT_IMAGE_2,
  GROK_IMAGINE_IMAGE,
  IDEOGRAM_45,
  QWEN_IMAGE_EDIT,
  RECRAFT_41,
  RECRAFT_41_VECTOR,
  SEEDREAM_45,
  SEEDREAM_5_FLASH,
  Z_IMAGE_TURBO,
} from "./falImageModels";
import { falInputFields, falMapOf, falParams } from "./falInputs";
import {
  GROK_VIDEO_15_LITE,
  HAILUO_23_FAST,
  LTX_23_FAST,
  MINIMAX_H3_MAX_TURBO,
  PIXVERSE_V6,
  WAN_30,
} from "./falVideoModels";
import { NANO_BANANA_2, NANO_BANANA_2_LITE } from "./googleImageModels";
import { quantitySourceOf } from "./modelControls";
import type { StudioModelSeed } from "./modelSeed";

function usd(seed: StudioModelSeed, params: Record<string, unknown>, mode = seed.inputModes[0]): number {
  return computeCostUsd(seed.priceRule, params, mode);
}

function kr(seed: StudioModelSeed, params: Record<string, unknown>, mode = seed.inputModes[0]): number {
  return computeCredits(seed.priceRule, params, mode);
}

/** Telo zahteva koje fal adapter šalje za dati posao (isto kao `submitFalCatalogJob`). */
function falBody(seed: StudioModelSeed, mode: string, params: Record<string, unknown>, urls: Record<string, string[]>) {
  const map = falMapOf(seed.capabilities);

  return { ...falParams(params, map), ...falInputFields(mode, urls, map) };
}

// ── S2: slike ──────────────────────────────────────────────────────────────

test("Nano Banana 2 Lite: $0,0336 po slici, samo 1K, direktno na Google", () => {
  expect(NANO_BANANA_2_LITE.provider).toBe("google");
  expect(NANO_BANANA_2_LITE.endpoints.text).toBe("gemini-3.1-flash-lite-image");
  expect(usd(NANO_BANANA_2_LITE, {})).toBeCloseTo(0.0336, 10);
  expect(kr(NANO_BANANA_2_LITE, {})).toBe(8);
  expect(NANO_BANANA_2_LITE.paramSpec.some((control) => control.key === "resolution")).toBe(false);
});

test("Seedream 5 Flash: ravnih $0,027, veličina ne dira cenu, izmena šalje niz", () => {
  expect(usd(SEEDREAM_5_FLASH, { image_size: "square_hd" })).toBeCloseTo(0.027, 10);
  expect(kr(SEEDREAM_5_FLASH, {})).toBe(6);
  expect(falBody(SEEDREAM_5_FLASH, "image_multi", { prompt: "p" }, { image: ["a"] })).toEqual({
    prompt: "p",
    image_urls: ["a"],
  });
});

test("Z-Image Turbo i FLUX.2: po megapikselu, `square_hd` su dva MP", () => {
  // K13: `num_images` je količina (1 = jedna slika, kao do sada).
  expect(usd(Z_IMAGE_TURBO, { image_size: "landscape_4_3", num_images: 1 })).toBeCloseTo(0.005, 10);
  expect(usd(Z_IMAGE_TURBO, { image_size: "square_hd", num_images: 1 })).toBeCloseTo(0.01, 10);
  expect(kr(Z_IMAGE_TURBO, { image_size: "landscape_4_3", num_images: 1 })).toBe(2);
  // „Proširenje opisa" se gasi uvek (na fal-u košta dodatno).
  expect(falBody(Z_IMAGE_TURBO, "text", { prompt: "p" }, {})).toMatchObject({ enable_prompt_expansion: false });

  expect(usd(FLUX_2_KLEIN, { image_size: "portrait_4_3", num_images: 1 }, "text")).toBeCloseTo(0.006, 10);
  // Izmena: izlaz $0,011/MP + svaki ulaz (fal ga svodi na 1 MP) $0,011.
  expect(usd(FLUX_2_KLEIN, { image_size: "square", input_images: 3 }, "image_multi")).toBeCloseTo(0.044, 10);
  expect(usd(FLUX_2_KLEIN, { image_size: "square_hd", input_images: 1 }, "image_multi")).toBeCloseTo(0.033, 10);

  expect(usd(FLUX_2_PRO, { image_size: "landscape_16_9" })).toBeCloseTo(0.03, 10);
  expect(usd(FLUX_2_PRO, { image_size: "square_hd" })).toBeCloseTo(0.045, 10);
  // Izmena i proširenje kadra broje megapiksele ULAZA - do K11/K12 ih nema.
  expect(FLUX_2_PRO.inputModes).toEqual(["text"]);
});

test("FLUX Kontext, Qwen Edit, Recraft, Ideogram i Grok: tabele iz plana", () => {
  expect(usd(FLUX_KONTEXT, {})).toBeCloseTo(0.04, 10);
  expect(kr(FLUX_KONTEXT, {})).toBe(9);
  expect(FLUX_KONTEXT.inputSpec.image_multi.image.max).toBe(1);

  expect(usd(QWEN_IMAGE_EDIT, { image_size: "landscape_4_3" })).toBeCloseTo(0.03, 10);
  expect(usd(QWEN_IMAGE_EDIT, { image_size: "square_hd" })).toBeCloseTo(0.06, 10);

  expect(usd(RECRAFT_41, { image_size: "square_hd" })).toBeCloseTo(0.035, 10);
  expect(usd(RECRAFT_41_VECTOR, {})).toBeCloseTo(0.08, 10);
  expect(RECRAFT_41_VECTOR.isEnabled).toBe(false);
  expect(RECRAFT_41_VECTOR.endpoints.text).toContain("text-to-vector");

  expect(usd(IDEOGRAM_45, { quality: "low" })).toBeCloseTo(0.03, 10);
  expect(usd(IDEOGRAM_45, { quality: "medium" })).toBeCloseTo(0.06, 10);
  expect(usd(IDEOGRAM_45, { quality: "high" })).toBeCloseTo(0.22, 10);
  expect(kr(IDEOGRAM_45, { quality: "high" })).toBe(48);

  expect(usd(GROK_IMAGINE_IMAGE, {}, "text")).toBeCloseTo(0.02, 10);
  expect(usd(GROK_IMAGINE_IMAGE, {}, "image_multi")).toBeCloseTo(0.022, 10);
});

// K13 (S4/S5): svi izlazi poziva se čuvaju, pa dve skice za probni list dobijaju
// `num_images` (1-4); ostali K07 redovi i dalje prave jednu sliku po pozivu.
test("K13: Z-Image Turbo i FLUX.2 klein (tekst) prave 1-4 slike, cena raste po slici", () => {
  for (const seed of [Z_IMAGE_TURBO, FLUX_2_KLEIN]) {
    expect(seed.priceRule.quantityParam, seed.slug).toBe("num_images");
    expect(seed.capabilities.maxImagesPerRun, seed.slug).toBe(4);
    expect(seed.paramSpec.find((control) => control.key === "num_images")).toMatchObject({ default: 1, min: 1, max: 4 });
  }
  expect(usd(Z_IMAGE_TURBO, { image_size: "landscape_4_3", num_images: 4 })).toBeCloseTo(0.02, 10);
  expect(usd(FLUX_2_KLEIN, { image_size: "landscape_4_3", num_images: 4 }, "text")).toBeCloseTo(0.024, 10);
  // Izmena ima svoje pravilo bez količine - `num_images` tamo ne postoji.
  expect(FLUX_2_KLEIN.paramSpec.find((control) => control.key === "num_images")?.showInModes).toEqual(["text"]);
});

test("ostali novi redovi nemaju `num_images` (K01 0.2-5)", () => {
  for (const seed of [
    NANO_BANANA_2_LITE,
    SEEDREAM_5_FLASH,
    FLUX_2_PRO,
    FLUX_KONTEXT,
    QWEN_IMAGE_EDIT,
    RECRAFT_41,
    RECRAFT_41_VECTOR,
    IDEOGRAM_45,
    GROK_IMAGINE_IMAGE,
  ]) {
    expect(seed.priceRule.quantityParam, seed.slug).toBeUndefined();
    expect(seed.paramSpec.some((control) => control.key === "num_images"), seed.slug).toBe(false);
  }
});

test("N3/N4: Seedream i GPT Image 2 izmena idu na pravu rutu sa nizom `image_urls`", () => {
  expect(falBody(SEEDREAM_45, "image_multi", { prompt: "p" }, { image: ["a"] })).toMatchObject({ image_urls: ["a"] });
  expect(GPT_IMAGE_2.endpoints.image_multi).toBe("openai/gpt-image-2/edit");
  expect(falBody(GPT_IMAGE_2, "image_multi", { prompt: "p" }, { image: ["a"] })).toMatchObject({ image_urls: ["a"] });
  // Ulazne slike OpenAI naplaćuje (procena $0,03 po slici); tekst režim nema dodatak.
  const base = { quality: "medium", size: "1024x1024", num_images: 1 };
  expect(usd(GPT_IMAGE_2, { ...base, input_images: 0 }, "text")).toBeCloseTo(0.053, 10);
  expect(usd(GPT_IMAGE_2, { ...base, input_images: 2 }, "image_multi")).toBeCloseTo(0.113, 10);
});

// ── V2: video ──────────────────────────────────────────────────────────────

test("Grok Video Lite: po sekundi i rezoluciji, slika na ulazu +$0,01", () => {
  expect(usd(GROK_VIDEO_15_LITE, { resolution: "480p", duration: 6 })).toBeCloseTo(0.12, 10);
  expect(usd(GROK_VIDEO_15_LITE, { resolution: "720p", duration: 6 })).toBeCloseTo(0.18, 10);
  expect(usd(GROK_VIDEO_15_LITE, { resolution: "1080p", duration: 6 })).toBeCloseTo(0.84, 10);
  expect(usd(GROK_VIDEO_15_LITE, { resolution: "720p", duration: 6, input_images: 1 }, "image")).toBeCloseTo(0.19, 10);
  expect(kr(GROK_VIDEO_15_LITE, { resolution: "720p", duration: 6 })).toBe(39);
});

test("Wan 3.0, LTX-2.3 Fast i PixVerse V6: tabele po sekundi", () => {
  expect(usd(WAN_30, { resolution: "720p", duration: 5 })).toBeCloseTo(0.5, 10);
  expect(usd(WAN_30, { resolution: "1080p", duration: 30 })).toBeCloseTo(6, 10);
  expect(kr(WAN_30, { resolution: "720p", duration: 5 })).toBe(109);

  expect(usd(LTX_23_FAST, { resolution: "1080p", duration: 6 })).toBeCloseTo(0.36, 10);
  expect(usd(LTX_23_FAST, { resolution: "2160p", duration: 10 })).toBeCloseTo(2.4, 10);

  expect(usd(PIXVERSE_V6, { resolution: "720p", audio: false, duration: 5 })).toBeCloseTo(0.225, 10);
  expect(usd(PIXVERSE_V6, { resolution: "720p", audio: true, duration: 5 })).toBeCloseTo(0.3, 10);
  expect(usd(PIXVERSE_V6, { resolution: "1080p", audio: true, duration: 5 })).toBeCloseTo(0.575, 10);
  // Zvuk ide kao `generate_audio_switch`; prvi kadar je `first_image_url` na ruti `transition`.
  expect(falBody(PIXVERSE_V6, "first_last", { audio: true }, { image: ["a", "b"] })).toEqual({
    generate_audio_switch: true,
    first_image_url: "a",
    end_image_url: "b",
  });
  expect(PIXVERSE_V6.endpoints.first_last).toContain("transition");
});

test("Hailuo 2.3 Fast: cena po KLIPU, 1080p ide samo uz 6 s", () => {
  expect(usd(HAILUO_23_FAST, { resolution: "768p", duration: "6" })).toBeCloseTo(0.19, 10);
  expect(usd(HAILUO_23_FAST, { resolution: "768p", duration: "10" })).toBeCloseTo(0.32, 10);
  expect(usd(HAILUO_23_FAST, { resolution: "1080p", duration: "6" })).toBeCloseTo(0.33, 10);
  expect(isCombinationPriceable(HAILUO_23_FAST.priceRule, { resolution: "1080p", duration: "10" })).toBe(false);
  expect(sanitizeSpecParams(HAILUO_23_FAST.paramSpec, HAILUO_23_FAST.priceRule, { resolution: "1080p", duration: "10" }, "image").ok).toBe(false);
});

test("MiniMax H3 Max Turbo: PUNA cena posle promocije (K06-10)", () => {
  expect(usd(MINIMAX_H3_MAX_TURBO, { resolution: "480P", duration: 5 })).toBeCloseTo(0.125, 10);
  expect(usd(MINIMAX_H3_MAX_TURBO, { resolution: "768P", duration: 5 })).toBeCloseTo(0.2, 10);
  expect(usd(MINIMAX_H3_MAX_TURBO, { resolution: "1080P", duration: 5 })).toBeCloseTo(0.4, 10);
  // Prvi kadar ide kao `image_url`, poslednji kao `end_image_url`.
  expect(falBody(MINIMAX_H3_MAX_TURBO, "first_last", {}, { image: ["a", "b"] })).toMatchObject({
    image_url: "a",
    end_image_url: "b",
    prompt_expansion_mode: "disabled",
  });
});

test("Wan 3.0 šalje sliku kao `start_image_url` i u režimu slike i u paru kadrova", () => {
  expect(falBody(WAN_30, "image", {}, { image: ["a"] })).toMatchObject({ start_image_url: "a" });
  expect(falBody(WAN_30, "first_last", {}, { image: ["a", "b"] })).toMatchObject({
    start_image_url: "a",
    end_image_url: "b",
  });
  // Reference sa VIDEOM nisu ponuđene dok se ne potvrdi naplata ulaznog videa.
  expect(WAN_30.inputSpec.reference.video).toBeUndefined();
});

test("Seedance 2.0: svaka tarifa ima svoj BytePlus model (nalaz N1)", () => {
  const map = SEEDANCE_20.capabilities.modelByTier as Record<string, string>;
  const tiers = SEEDANCE_20.paramSpec.find((control) => control.key === "tier")?.options?.map((option) => option.value);
  expect(Object.keys(map).sort()).toEqual([...(tiers ?? [])].sort());
});

// ── C0: naplata po celom minutu ────────────────────────────────────────────

test("C0 muzika: fal naplaćuje svaki započeti minut - klizač ide u celim minutima", () => {
  const minutes = MUSIC.paramSpec.find((control) => control.key === "minutes");
  expect(minutes?.min).toBe(1);
  expect(minutes?.step).toBe(1);
  expect(MUSIC.priceRule.roundUpTo).toBe(1);
  expect(kr(MUSIC, { minutes: 1 })).toBe(130);
  // Razlomak (npr. iz MCP-a) se naplaćuje kao ceo započeti minut.
  expect(kr(MUSIC, { minutes: 1.5 })).toBe(kr(MUSIC, { minutes: 2 }));
  // Dužina STVARNO stiže do fal-a, u milisekundama.
  expect(falBody(MUSIC, "text", { prompt: "p", minutes: 2 }, {})).toEqual({ prompt: "p", music_length_ms: 120_000 });
});

test("C0 sinhronizacija: najmanje minut, svaki započeti ceo; jezik je `target_lang`", () => {
  expect(quantitySourceOf(DUBBING)?.min).toBe(1);
  expect(DUBBING.priceRule.roundUpTo).toBe(1);
  // Snimak od 6 s: ranije 0,1 min = 13 kr dok je fal uzimao $0,60.
  expect(kr(DUBBING, { minutes: 1 })).toBe(130);
  expect(kr(DUBBING, { minutes: 1.1 })).toBe(kr(DUBBING, { minutes: 2 }));
  expect(falBody(DUBBING, "audio", { target_language: "sr", minutes: 1 }, { audio: ["a"] })).toMatchObject({
    target_lang: "sr",
    audio_url: "a",
  });
  expect(falBody(DUBBING, "audio", { target_language: "sr" }, {})).not.toHaveProperty("target_language");
});

test("C0 zvučni efekat: trajanje stiže kao `duration_seconds`", () => {
  expect(falBody(SFX, "text", { prompt: "p", duration: 5 }, {})).toEqual({ prompt: "p", duration_seconds: 5 });
});

test("Nano Banana 2 ima rezervnu rutu samo iz opisa, i noćnu turu kao podatak za K08", () => {
  const fallback = NANO_BANANA_2.capabilities.fallback as { endpoints: Record<string, string> };
  expect(Object.keys(fallback.endpoints)).toEqual(["text"]);
  for (const slug of ["nano-banana-2", "nano-banana-2-lite", "nano-banana-pro"]) {
    expect(studioModelBySlug(slug)?.capabilities.batch, slug).toMatchObject({ provider: "google", discount: 0.5 });
  }
});
