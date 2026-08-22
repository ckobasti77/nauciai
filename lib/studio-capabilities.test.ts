/**
 * Traka sposobnosti (SP2) se izvodi iz `inputModes` + `inputSpec`, pa test ide
 * nad PRAVIM redovima kataloga: kad se doda 31. model, traka ga dobija bez
 * izmene komponente - a ako katalog promeni spec, ovde pukne, ne u UI-u.
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import type { StudioModelSeed } from "@/convex/providers/modelSeed";
import {
  capabilityChips,
  firstFileMode,
  modeProviding,
  modelInputCapabilities,
  modelRestrictions,
} from "@/lib/studio-capabilities";
import type { StudioModel } from "@/lib/studio-models";

function asModel(seed: StudioModelSeed): StudioModel {
  return {
    slug: seed.slug,
    provider: seed.provider,
    kind: seed.kind,
    family: seed.family,
    labelSr: seed.labelSr,
    labelEn: seed.labelEn,
    taglineSr: seed.taglineSr,
    taglineEn: seed.taglineEn,
    descriptionSr: seed.descriptionSr,
    descriptionEn: seed.descriptionEn,
    inputModes: seed.inputModes,
    inputSpec: seed.inputSpec,
    paramSpec: seed.paramSpec,
    priceRule: seed.priceRule,
    capabilities: seed.capabilities,
    sortOrder: seed.sortOrder,
  };
}

function model(slug: string): StudioModel {
  const seed = STUDIO_MODELS.find((entry) => entry.slug === slug);
  if (!seed) throw new Error(`Nema modela ${slug} u katalogu.`);
  return asModel(seed);
}

describe("modelInputCapabilities", () => {
  test("nano-banana-2: do 10 slika, bez kadrova/referenci/videa", () => {
    const caps = modelInputCapabilities(model("nano-banana-2"));
    expect(caps.image).toEqual({ max: 10, slots: ["image"] });
    expect(caps.firstLast).toBe(false);
    expect(caps.reference).toBeNull();
    expect(caps.video).toBeNull();
    expect(caps.audio).toBe(false);
  });

  test("kling-3-turbo: jedna slika + prvi/poslednji kadar; first_last se NE računa kao slika", () => {
    const caps = modelInputCapabilities(model("kling-3-turbo"));
    expect(caps.image?.max).toBe(1);
    expect(caps.firstLast).toBe(true);
  });

  test("kling-omni: kadrovi + reference (9 slika, 3 videa) + video fajl", () => {
    const caps = modelInputCapabilities(model("kling-omni"));
    expect(caps.firstLast).toBe(true);
    expect(caps.reference).toEqual(expect.objectContaining({ images: 9, videos: 3 }));
    expect(caps.video).toBe("upload");
  });

  test("gemini-omni: video je NASTAVAK (režim bez slota + continuation), bez kadrova; ima ograničenja", () => {
    const omni = model("gemini-omni");
    const caps = modelInputCapabilities(omni);
    expect(caps.video).toBe("continuation");
    expect(caps.firstLast).toBe(false);
    expect(modeProviding(omni, "video")).toBeNull();
    expect(modelRestrictions(omni, "sr").length).toBeGreaterThan(0);
    expect(modelRestrictions(omni, "en").length).toBe(modelRestrictions(omni, "sr").length);
  });

  test("kling-tryon: slike su imenovani slotovi person + garment", () => {
    const caps = modelInputCapabilities(model("kling-tryon"));
    expect(caps.image).toEqual({ max: 2, slots: ["person", "garment"] });
  });

  test("tts: ne prima ništa; traka nema čipove, `+` nema cilj", () => {
    const tts = model("tts");
    expect(modelInputCapabilities(tts)).toEqual({
      image: null,
      firstLast: false,
      reference: null,
      video: null,
      audio: false,
    });
    expect(capabilityChips(tts)).toEqual([]);
    expect(firstFileMode(tts)).toBeNull();
  });
});

describe("modeProviding / firstFileMode", () => {
  test("slika vodi u prvi režim sa slikom, kadrovi u first_last, referenca u reference", () => {
    const omni = model("kling-omni");
    expect(modeProviding(omni, "firstLast")).toBe("first_last");
    expect(modeProviding(omni, "reference")).toBe("reference");
    expect(modeProviding(model("nano-banana-2"), "image")).toBe("image_multi");
    expect(modeProviding(model("nano-banana-2"), "firstLast")).toBeNull();
  });

  test('`+` iz „Samo opis" cilja prvi režim sa fajlom', () => {
    expect(firstFileMode(model("nano-banana-2"))).toBe("image_multi");
    expect(firstFileMode(model("kling-3-turbo"))).toBe("image");
  });
});

describe("capabilityChips", () => {
  test("image modeli: Slika + Kadrovi (sivi kad nisu podržani); video modeli dobijaju i Referentne + Video", () => {
    expect(capabilityChips(model("nano-banana-2"))).toEqual([
      { key: "image", supported: true },
      { key: "firstLast", supported: false },
    ]);
    expect(capabilityChips(model("veo-31")).map((chip) => chip.key)).toEqual([
      "image",
      "firstLast",
      "reference",
      "video",
    ]);
    // Omni: Video je „nastavak" - podržan, ali bez fajla.
    expect(capabilityChips(model("gemini-omni")).find((chip) => chip.key === "video")?.supported).toBe(true);
  });

  test("ceo katalog: svaki podržani čip ima režim (sem video-nastavka), nepodržani nemaju", () => {
    for (const seed of STUDIO_MODELS) {
      const entry = asModel(seed);
      const caps = modelInputCapabilities(entry);
      for (const chip of capabilityChips(entry)) {
        const mode = modeProviding(entry, chip.key);
        if (chip.key === "video" && caps.video === "continuation") {
          expect(mode).toBeNull();
        } else if (chip.supported) {
          expect(mode, `${seed.slug} ${chip.key}`).not.toBeNull();
          expect(entry.inputModes).toContain(mode);
        } else {
          expect(mode, `${seed.slug} ${chip.key}`).toBeNull();
        }
      }
      // Model koji uopšte prima fajl ima cilj za `+`, i obrnuto.
      const acceptsAny = Object.values(entry.inputSpec).some((spec) => Object.keys(spec).length > 0);
      expect(firstFileMode(entry) !== null, seed.slug).toBe(acceptsAny);
    }
  });
});
