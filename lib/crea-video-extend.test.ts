import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";

import { EXTEND_ROUTES, extendParams, extendPrompt, extendRouteProblem, VEO_INLINE_MAX_BYTES } from "./crea-video-extend";

function route(id: "seedance" | "veo") {
  return EXTEND_ROUTES.find((entry) => entry.id === id)!;
}

describe("produži klip (V5)", () => {
  test("svaka ruta je postojeći model sa režimom koji prima video", () => {
    for (const entry of EXTEND_ROUTES) {
      const model = STUDIO_MODELS.find((seed) => seed.slug === entry.modelSlug)!;
      expect(model.kind).toBe("video");
      expect(model.inputModes).toContain(entry.inputMode);
      expect(model.inputSpec[entry.inputMode]?.[entry.slot]?.max ?? 0).toBeGreaterThan(0);
      for (const direction of entry.directions) {
        const params = extendParams(entry, direction, "", 8);
        const sanitized = sanitizeSpecParams(model.paramSpec, model.priceRule, params, entry.inputMode);
        expect(sanitized.ok, `${entry.id} ${direction}`).toBe(true);
        if (sanitized.ok) expect(sanitized.params.duration).toBe(8);
      }
    }
  });

  test("Seedance zna oba smera, Veo samo napred", () => {
    expect(route("seedance").directions).toEqual(["napred", "nazad"]);
    expect(route("veo").directions).toEqual(["napred"]);
    expect(extendPrompt(route("seedance"), "napred", "")).toMatch(/^Extend video 1 forward: .*Keep the same characters/);
    expect(extendPrompt(route("seedance"), "nazad", "Ona ulazi u kafić.")).toBe(
      "Extend video 1 backward: show what happens right before its first frame, ending exactly where video 1 begins. Ona ulazi u kafić. Keep the same characters, place, lighting, style and aspect ratio.",
    );
    expect(extendPrompt(route("veo"), "napred", "")).toBe("Continue the scene naturally");
    expect(extendPrompt(route("veo"), "napred", "Pada sneg.")).toBe("Pada sneg");
  });

  test("Veo produžava samo Veo klip do 15 MB", () => {
    const veo = route("veo");
    expect(extendRouteProblem(veo, { modelSlug: "veo-31-lite", bytes: 4_000_000 })).toBeNull();
    expect(extendRouteProblem(veo, { modelSlug: "kling-3", bytes: 4_000_000 })).toBe("drugi-model");
    expect(extendRouteProblem(veo, { modelSlug: "veo-31", bytes: VEO_INLINE_MAX_BYTES + 1 })).toBe("prevelik");
    expect(extendRouteProblem(route("seedance"), { modelSlug: "kling-3", bytes: 150_000_000 })).toBeNull();
  });
});
