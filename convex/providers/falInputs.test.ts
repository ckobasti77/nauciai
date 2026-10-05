import { expect, test } from "vitest";

import { STUDIO_MODELS } from "./catalogModels";
import { falInputFields, falMapOf, falParams, resolveEndpointTier } from "./falInputs";

test("jedan fajl ide kao `_url`, više njih kao `_urls`", () => {
  expect(falInputFields("image", { image: ["a"] })).toEqual({ image_url: "a" });
  expect(falInputFields("image_multi", { image: ["a", "b"] })).toEqual({ image_urls: ["a", "b"] });
  expect(falInputFields("video", { video: ["v"] })).toEqual({ video_url: "v" });
  expect(falInputFields("audio", { audio: ["z"] })).toEqual({ audio_url: "z" });
});

test("par kadrova je jedini režim gde redosled menja IME polja", () => {
  expect(falInputFields("first_last", { image: ["prvi", "poslednji"] })).toEqual({
    start_image_url: "prvi",
    end_image_url: "poslednji",
  });
  // Nepotpun par ne izmišlja drugi kadar; posao dotle ni ne stigne, jer ga
  // `missingInput` zaustavlja na dugmetu.
  expect(falInputFields("first_last", { image: ["prvi"] })).toEqual({ start_image_url: "prvi" });
});

test("reference nose svoja polja - referenca nije isto što i ulaz", () => {
  expect(falInputFields("reference", { image: ["a"], video: ["v"] })).toEqual({
    reference_image_urls: ["a"],
    reference_video_urls: ["v"],
  });
});

test("imenovani slotovi probe odeće idu na svoja polja, ne u jedan niz", () => {
  expect(falInputFields("image_multi", { person: ["osoba"], garment: ["majica"] })).toEqual({
    human_image_url: "osoba",
    garment_image_url: "majica",
  });
});

test("prazan slot ne upisuje polje, a nepoznat slot ne ispada tiho", () => {
  expect(falInputFields("image", { image: [] })).toEqual({});
  expect(falInputFields("image", { skica: ["s"] })).toEqual({ skica_urls: ["s"] });
});

test("`{tier}` u ruti se popunjava iz `capabilities.tierByResolution`", () => {
  const capabilities = { tierByResolution: { "720p": "standard", "1080p": "pro", "4K": "pro" } };

  expect(resolveEndpointTier("v3/{tier}/text-to-video", { resolution: "720p" }, capabilities)).toBe(
    "v3/standard/text-to-video",
  );
  expect(resolveEndpointTier("v3/{tier}/text-to-video", { resolution: "4K" }, capabilities)).toBe(
    "v3/pro/text-to-video",
  );
});

test("ruta bez tarife je greška, ne nagađanje", () => {
  expect(() => resolveEndpointTier("v3/{tier}/x", { resolution: "720p" }, {})).toThrow("RUTA_BEZ_TARIFE");
  expect(() =>
    resolveEndpointTier("v3/{tier}/x", { resolution: "8K" }, { tierByResolution: { "720p": "standard" } }),
  ).toThrow("RUTA_BEZ_TARIFE:8K");
  // Ruta bez placeholdera se ne dira.
  expect(resolveEndpointTier("fal-ai/nesto", {}, {})).toBe("fal-ai/nesto");
});

test("svaka fal ruta iz kataloga sa `{tier}` ima tarifu za svaku rezoluciju", () => {
  for (const seed of STUDIO_MODELS) {
    if (seed.provider !== "fal") continue;

    for (const endpoint of Object.values(seed.endpoints)) {
      if (!endpoint.includes("{tier}")) continue;

      const resolutions = seed.paramSpec
        .filter((control) => control.key === "resolution")
        .flatMap((control) => (control.options ?? []).map((option) => option.value));

      for (const resolution of resolutions) {
        expect(() => resolveEndpointTier(endpoint, { resolution }, seed.capabilities), `${seed.slug}/${resolution}`).not.toThrow();
      }
    }
  }
});

// ── Crea K07: mapa imena po modelu (`capabilities.fal`) ────────────────────

test("mapa polja: ime na `_urls` je uvek niz, ostala nose jedan fajl", () => {
  expect(falInputFields("image_multi", { image: ["a"] }, { fields: { image: "image_urls" } })).toEqual({
    image_urls: ["a"],
  });
  expect(falInputFields("image", { image: ["a"] }, { fields: { image: "start_image_url" } })).toEqual({
    start_image_url: "a",
  });
  expect(
    falInputFields("first_last", { image: ["p", "k"] }, { fields: { first: "image_url", last: "end_image_url" } }),
  ).toEqual({ image_url: "p", end_image_url: "k" });
  // Maska bez mape ide na fal konvenciju `mask_url`.
  expect(falInputFields("mask", { mask: ["m"] })).toEqual({ mask_url: "m" });
});

test("mapa parametara: preimenuje, skalira i dodaje stalna polja; bez mape je isto", () => {
  const params = { prompt: "p", minutes: 2, audio: true };
  expect(falParams(params)).toEqual(params);
  expect(
    falParams(params, {
      params: { minutes: { to: "music_length_ms", scale: 60_000 }, audio: { to: "generate_audio_switch" } },
      fixed: { enable_prompt_expansion: false },
    }),
  ).toEqual({ prompt: "p", music_length_ms: 120_000, generate_audio_switch: true, enable_prompt_expansion: false });
  // Ključ koji posao nema se ne izmišlja.
  expect(falParams({ prompt: "p" }, { params: { minutes: { to: "music_length_ms" } } })).toEqual({ prompt: "p" });
  expect(falMapOf({})).toBeUndefined();
  expect(falMapOf({ fal: { fields: { image: "image_urls" } } })).toEqual({ fields: { image: "image_urls" } });
});
