import { describe, expect, test } from "vitest";

import { STUDIO_MODELS, studioModelBySlug } from "@/convex/providers/catalogModels";
import type { StudioModelSeed } from "@/convex/providers/modelSeed";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";
import {
  buildDraftOrder,
  buildRefineOrder,
  DRAFT_REFINE_PAIRS,
  draftPairFor,
  orderCredits,
  REFINE_PROMPT_PREFIX,
  refinePairForJob,
} from "@/lib/crea-draft";
import { parseStudioModel, type StudioModel, withCreditFactors } from "@/lib/studio-models";

function model(slug: string): StudioModel {
  const seed = studioModelBySlug(slug) as StudioModelSeed;
  const parsed = parseStudioModel({
    ...seed,
    inputModes: JSON.stringify(seed.inputModes),
    inputSpec: JSON.stringify(seed.inputSpec),
    paramSpec: JSON.stringify(seed.paramSpec),
    priceRule: JSON.stringify(seed.priceRule),
    capabilities: JSON.stringify(seed.capabilities),
  });
  if (!parsed) throw new Error(slug);

  return parsed;
}

describe("parovi proba → usavrši", () => {
  test("oba modela postoje u katalogu, sa režimima koje par traži", () => {
    for (const pair of DRAFT_REFINE_PAIRS) {
      const draft = studioModelBySlug(pair.draft.modelSlug);
      const refine = studioModelBySlug(pair.refine.modelSlug);
      expect(draft, pair.id).toBeDefined();
      expect(refine, pair.id).toBeDefined();
      if (pair.refine.inputMode) expect(refine?.inputModes, pair.id).toContain(pair.refine.inputMode);
      // Referenca znači da usavršavanje prima sliku u svom režimu.
      if (pair.reference) expect(refine?.inputSpec[pair.refine.inputMode ?? ""]?.image, pair.id).toBeDefined();
      // Vrsta se ne menja (slika ostaje slika).
      expect(draft?.kind, pair.id).toBe(refine?.kind);
    }
    expect(new Set(DRAFT_REFINE_PAIRS.map((pair) => pair.id)).size).toBe(DRAFT_REFINE_PAIRS.length);
  });

  test("proba je uvek jeftinija od usavršavanja (v1 i v2)", () => {
    for (const pricingV2 of [false, true]) {
      for (const pair of DRAFT_REFINE_PAIRS) {
        const [draftModel, refineModel] = withCreditFactors([model(pair.draft.modelSlug), model(pair.refine.modelSlug)], pricingV2);
        const mode = draftModel.inputModes[0];
        const params = { ...(sanitizeSpecParams(draftModel.paramSpec, draftModel.priceRule, {}, mode) as { params: Record<string, unknown> }).params, prompt: "p" };
        const draft = buildDraftOrder(pair, { params, inputMode: mode, model: refineModel }, draftModel);
        const draftCredits = orderCredits(draftModel, draft);
        const refine = buildRefineOrder({ modelSlug: draftModel.slug, params: draft.params, inputMode: draft.inputMode }, pair, refineModel);
        const refineCredits = orderCredits(refineModel, refine, refine.inputs === "reference" ? 1 : 0);
        expect(draftCredits, `${pair.id} v2=${pricingV2}`).not.toBeNull();
        expect(refineCredits, `${pair.id} v2=${pricingV2}`).not.toBeNull();
        expect(draftCredits as number, `${pair.id} v2=${pricingV2}`).toBeLessThan(refineCredits as number);
      }
    }
  });

  test("seme prenosi server samo unutar porodice; između porodica ide referenca", () => {
    for (const pair of DRAFT_REFINE_PAIRS) {
      const draft = studioModelBySlug(pair.draft.modelSlug);
      const refine = studioModelBySlug(pair.refine.modelSlug);
      if (draft?.family !== refine?.family) expect(pair.reference, pair.id).toBe(true);
    }
  });
});

describe("„Probaj jeftino“", () => {
  test("skuplji model u opisu dobija skicu jeftinog, sa istim opisom i odnosom stranica", () => {
    const nb2 = model("nano-banana-2");
    const pair = draftPairFor("nano-banana-2", "text");
    expect(pair?.id).toBe("slika-skica");
    if (!pair) return;

    const order = buildDraftOrder(
      pair,
      { params: { prompt: "mačka u svemiru", resolution: "2K", aspect_ratio: "16:9" }, inputMode: "text", model: nb2 },
      model("z-image-turbo"),
    );
    expect(order).toEqual({
      modelSlug: "z-image-turbo",
      inputMode: "text",
      // K13: skica sada ima `num_images` (podrazumevano 1, jedna skica).
      params: { prompt: "mačka u svemiru", image_size: "landscape_16_9", num_images: 1 },
    });
    // Rezolucija skupljeg modela ne prelazi na skicu.
    expect(order.params).not.toHaveProperty("resolution");
  });

  test("referentni par se ne nudi u izmeni (tamo skica ne bi znala za okačene slike)", () => {
    expect(draftPairFor("nano-banana-2", "image_multi")).toBeNull();
    expect(draftPairFor("seedream-45", "text")).toBeNull();
  });

  test("isti model: proba je ista forma na nižoj rezoluciji, u istom režimu", () => {
    const wan = model("wan-30");
    const pair = draftPairFor("wan-30", "image");
    expect(pair?.id).toBe("video-wan");
    if (!pair) return;
    const order = buildDraftOrder(
      pair,
      { params: { prompt: "talas", resolution: "1080p", duration: 8, aspect_ratio: "9:16" }, inputMode: "image", model: wan },
      wan,
    );
    expect(order).toEqual({
      modelSlug: "wan-30",
      inputMode: "image",
      params: { prompt: "talas", resolution: "480p", duration: 8, aspect_ratio: "9:16" },
    });
  });
});

describe("„Usavrši“", () => {
  test("skica postaje referenca premium modela, uz uvod u opis", () => {
    const job = { modelSlug: "z-image-turbo", params: { prompt: "mačka", image_size: "portrait_16_9", seed: 7 }, inputMode: "text" };
    const pair = refinePairForJob(job);
    expect(pair?.id).toBe("slika-skica");
    if (!pair) return;

    const order = buildRefineOrder(job, pair, model("nano-banana-2"));
    expect(order.modelSlug).toBe("nano-banana-2");
    expect(order.inputMode).toBe("image_multi");
    expect(order.inputs).toBe("reference");
    expect(order.derivation).toBe("usavrsavanje");
    expect(order.params).toEqual({ prompt: `${REFINE_PROMPT_PREFIX}mačka`, resolution: "2K", aspect_ratio: "9:16" });
    // Seme se ne šalje kroz formu - prepisuje ga server.
    expect(order.params).not.toHaveProperty("seed");
  });

  test("isti model: ulazi se ponavljaju, rezolucija raste, a 1080p rad nije proba", () => {
    const job = { modelSlug: "minimax-h3-max-turbo", params: { prompt: "p", resolution: "480P", duration: 7 }, inputMode: "first_last" };
    const pair = refinePairForJob(job);
    expect(pair?.id).toBe("video-h3");
    if (!pair) return;
    const order = buildRefineOrder(job, pair, model("minimax-h3-max-turbo"));
    expect(order).toMatchObject({
      inputMode: "first_last",
      inputs: "carry",
      params: { prompt: "p", resolution: "1080P", duration: 7 },
    });
    expect(refinePairForJob({ ...job, params: { ...job.params, resolution: "1080P" } })).toBeNull();
  });

  test("FLUX.2 klein → Pro: ista veličina, bez reference (seme nosi server)", () => {
    const job = { modelSlug: "flux-2-klein", params: { prompt: "p", image_size: "square_hd" }, inputMode: "text" };
    const pair = refinePairForJob(job);
    expect(pair?.id).toBe("slika-flux");
    if (!pair) return;
    expect(buildRefineOrder(job, pair, model("flux-2-pro"))).toMatchObject({
      inputMode: "text",
      inputs: "none",
      params: { prompt: "p", image_size: "square_hd" },
    });
  });

  test("model koji nije proba nema „Usavrši“", () => {
    for (const seed of STUDIO_MODELS) {
      if (DRAFT_REFINE_PAIRS.some((pair) => pair.draft.modelSlug === seed.slug)) continue;
      expect(refinePairForJob({ modelSlug: seed.slug, params: {} }), seed.slug).toBeNull();
    }
  });
});
