/**
 * Plaćene izmene iz alata (K11): rute vode na modele i režime iz kataloga,
 * parametri imaju cenu, model bez maske dobija uputstvo „gde", a odnos
 * stranica prati fotku.
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { computeCredits } from "@/convex/studioPricing";
import { parseParamSpec } from "@/convex/studioParamSpec";
import { buildParams, paramValuesForMode } from "./studio-params";

import {
  BRUSH_ROUTES,
  MASK_DEFAULT_QUALITY,
  nearestAspectRatio,
  paidEditParams,
  paidEditPrompt,
  paidEditSlots,
  SCENE_ROUTES,
  ZONE_ASPECT_RATIOS,
} from "./crea-paid-edit";

const ROUTES = [...BRUSH_ROUTES, ...SCENE_ROUTES];

describe("rute", () => {
  test("svaka ruta je model iz kataloga sa tim režimom i slotovima", () => {
    for (const route of ROUTES) {
      const model = STUDIO_MODELS.find((entry) => entry.slug === route.modelSlug);
      expect(model, route.modelSlug).toBeDefined();
      expect(model?.inputModes, route.modelSlug).toContain(route.inputMode);
      const slots = model!.inputSpec[route.inputMode];
      for (const [slot, count] of Object.entries(paidEditSlots(route))) {
        expect(slots[slot], `${route.modelSlug}.${slot}`).toBeDefined();
        expect(slots[slot].max).toBeGreaterThanOrEqual(count);
      }
    }
    expect(BRUSH_ROUTES[0]).toEqual({ modelSlug: "ideogram-45", inputMode: "mask", kind: "mask" });
  });

  test("parametri rute imaju cenu > 0 (dugme nikad ne kaže 0 za plaćenu izmenu)", () => {
    for (const route of ROUTES) {
      const model = STUDIO_MODELS.find((entry) => entry.slug === route.modelSlug)!;
      const spec = parseParamSpec(JSON.stringify(model.paramSpec))!;
      const raw = paidEditParams(route, { prompt: "crvena kapa", width: 1200, height: 800 });
      const params = buildParams(spec, { ...paramValuesForMode(spec, route.inputMode), ...raw }, route.inputMode);
      expect(computeCredits(model.priceRule, params, route.inputMode), route.modelSlug).toBeGreaterThan(0);
    }
  });

  test("Ideogram sa maskom: podrazumevano nizak kvalitet, $0,03; najbrži $0,008", () => {
    const ideogram = STUDIO_MODELS.find((entry) => entry.slug === "ideogram-45")!;
    expect(paidEditParams(BRUSH_ROUTES[0], { prompt: "x", width: 1, height: 1 })).toEqual({ prompt: "x", quality: MASK_DEFAULT_QUALITY });
    // Isti brojevi kao fal tabela (https://fal.ai/models/ideogram/v4.5/edit/llms.txt) × 0,865 × 2,5 × 100.
    expect(computeCredits(ideogram.priceRule, { quality: "low" }, "mask")).toBe(Math.ceil(0.03 * 0.865 * 2.5 * 100));
    expect(computeCredits(ideogram.priceRule, { quality: "very_low" }, "mask")).toBe(Math.ceil(0.008 * 0.865 * 2.5 * 100));
    // Tekst režim i dalje nema „very_low" i ostaje na $0,06 za srednji.
    expect(() => computeCredits(ideogram.priceRule, { quality: "very_low" }, "text")).toThrow();
  });
});

describe("opis i oblik", () => {
  test("model bez maske dobija uputstvo za obojenu zonu, sa korisnikovim rečima", () => {
    const zone = BRUSH_ROUTES[1];
    const sr = paidEditPrompt(zone, "edit", "  crvena kapa ", "sr");
    expect(sr).toContain("crvenom označen");
    expect(sr.endsWith("crvena kapa")).toBe(true);
    expect(paidEditPrompt(zone, "edit", "red hat", "en")).toContain("ONLY");
    // Prava maska: opis ostaje korisnikov.
    expect(paidEditPrompt(BRUSH_ROUTES[0], "edit", " crvena kapa ", "sr")).toBe("crvena kapa");
  });

  test("brisanje i scena imaju sopstven opis", () => {
    expect(paidEditPrompt(BRUSH_ROUTES[0], "erase", "", "sr")).toContain("Ukloni");
    expect(paidEditPrompt(BRUSH_ROUTES[1], "erase", "", "en")).toContain("marked in red");
    const scene = paidEditPrompt(SCENE_ROUTES[0], "scene", "plaža u zalasku", "sr");
    expect(scene).toContain("plaža u zalasku");
    expect(scene).toContain("ostaje potpuno isti");
  });

  test("odnos stranica: najbliži ponuđen, a uspravna fotka ne postaje kvadrat", () => {
    expect(nearestAspectRatio(1000, 1000)).toBe("1:1");
    expect(nearestAspectRatio(1920, 1080)).toBe("16:9");
    expect(nearestAspectRatio(1080, 1920)).toBe("9:16");
    expect(nearestAspectRatio(1200, 800)).toBe("3:2");
    expect(nearestAspectRatio(3000, 4000)).toBe("2:3");
    expect(paidEditParams(BRUSH_ROUTES[1], { prompt: "p", width: 800, height: 1200 })).toEqual({ prompt: "p", aspect_ratio: "2:3" });
    for (const ratio of ZONE_ASPECT_RATIOS) expect(ratio).toMatch(/^\d+:\d+$/);
  });

  test("slotovi: maska = slika + maska; zona = original + oznaka; scena = fotka", () => {
    expect(paidEditSlots(BRUSH_ROUTES[0])).toEqual({ image: 1, mask: 1 });
    expect(paidEditSlots(BRUSH_ROUTES[1])).toEqual({ image: 2 });
    expect(paidEditSlots(SCENE_ROUTES[0])).toEqual({ image: 1 });
  });
});
