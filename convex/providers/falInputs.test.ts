import { expect, test } from "vitest";

import { STUDIO_MODELS } from "./catalogModels";
import { falInputFields, resolveEndpointTier } from "./falInputs";

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
