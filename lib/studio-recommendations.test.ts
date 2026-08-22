/**
 * Preporuke po poslu (SP1, tačka 5) su kurirana tabela - a kurirana tabela
 * ume da zastari. Ovi testovi tvrde da svaki `slug` iz tabele stvarno postoji
 * u katalogu i da mu se vrsta poklapa, pa prečica ka nepostojećem, ugašenom ili
 * pogrešno svrstanom modelu ne prođe u UI.
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import type { StudioModelSeed } from "@/convex/providers/modelSeed";
import { parseStudioModel, type StudioModel, type StudioModelRow } from "@/lib/studio-models";
import {
  allRecommendations,
  recommendationsFor,
  recommendationLabel,
} from "@/lib/studio-recommendations";
import type { StudioSectionKind } from "@/lib/studio-sections";

function rowOf(seed: StudioModelSeed): StudioModelRow {
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
    inputModes: JSON.stringify(seed.inputModes),
    inputSpec: JSON.stringify(seed.inputSpec),
    paramSpec: JSON.stringify(seed.paramSpec),
    priceRule: JSON.stringify(seed.priceRule),
    capabilities: JSON.stringify(seed.capabilities),
    sortOrder: seed.sortOrder,
  };
}

const models = STUDIO_MODELS.map(rowOf)
  .map(parseStudioModel)
  .filter((model): model is StudioModel => model !== null);

const KINDS: StudioSectionKind[] = ["image", "video", "audio"];

describe("preporuke po poslu", () => {
  test("svaki preporučeni slug postoji u katalogu i vrsta mu se poklapa", () => {
    const bySlug = new Map(models.map((model) => [model.slug, model]));
    for (const rec of allRecommendations()) {
      const model = bySlug.get(rec.slug);
      expect(model, `${rec.kind}/${rec.id} -> ${rec.slug}`).toBeDefined();
      expect(model?.kind, `${rec.kind}/${rec.id} -> ${rec.slug}`).toBe(rec.kind);
    }
  });

  test("svaka vrsta ima bar dve preporuke, sve različitih modela", () => {
    for (const kind of KINDS) {
      const recs = recommendationsFor(kind, models);
      expect(recs.length, kind).toBeGreaterThanOrEqual(2);
      expect(recs.length, kind).toBeLessThanOrEqual(4);
      const slugs = recs.map((rec) => rec.slug);
      expect(new Set(slugs).size, kind).toBe(slugs.length);
    }
  });

  test("preporuka ka ugašenom modelu se izostavlja", () => {
    // Sklonimo model na koji jedna slika-preporuka pokazuje: prečica nestaje,
    // ostale ostaju - bolje manje nego slepa prečica.
    const withoutGpt = models.filter((model) => model.slug !== "gpt-image-2");
    const recs = recommendationsFor("image", withoutGpt);
    expect(recs.some((rec) => rec.slug === "gpt-image-2")).toBe(false);
    expect(recs.length).toBe(recommendationsFor("image", models).length - 1);
  });

  test("labela prati jezik", () => {
    const rec = recommendationsFor("image", models)[0];
    expect(recommendationLabel(rec, "sr")).toBe(rec.labelSr);
    expect(recommendationLabel(rec, "en")).toBe(rec.labelEn);
  });
});
