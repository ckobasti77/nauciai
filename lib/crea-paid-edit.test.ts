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
  ANGLES_ROUTES,
  BRUSH_ROUTES,
  EXPAND_ROUTES,
  LAYERIZE_ROUTES,
  MASK_DEFAULT_QUALITY,
  nearestAspectRatio,
  paidEditParams,
  paidEditPrompt,
  paidEditSlots,
  PRODUCT_ROUTES,
  productScenePrompt,
  RELIGHT_ROUTES,
  RESTORE_ROUTES,
  SCENE_ROUTES,
  TRYON_ROUTES,
  ZONE_ASPECT_RATIOS,
} from "./crea-paid-edit";
import { ANGLES_GRID_PARAMS } from "./crea-grid-crop";

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

describe("K12 rute (S15, S18-S23)", () => {
  /** Ruta + parametri koje alat šalje; slotovi koje puni. */
  const K12: ReadonlyArray<{ name: string; routes: typeof EXPAND_ROUTES; params: Record<string, string | number>; slots: Record<string, number> }> = [
    { name: "proširi", routes: EXPAND_ROUTES, params: { prompt: "x", aspect_ratio: "9:16" }, slots: { image: 1 } },
    { name: "svetlo", routes: RELIGHT_ROUTES, params: { prompt: "x", aspect_ratio: "2:3" }, slots: { image: 1 } },
    { name: "uglovi", routes: ANGLES_ROUTES, params: { prompt: "x", ...ANGLES_GRID_PARAMS }, slots: { image: 1 } },
    { name: "slojevi", routes: LAYERIZE_ROUTES, params: { prompt: "x", layers: 6 }, slots: { image: 1 } },
    { name: "restauracija", routes: RESTORE_ROUTES, params: { prompt: "x", aspect_ratio: "3:2" }, slots: { image: 1 } },
    { name: "proba odeće", routes: TRYON_ROUTES, params: {}, slots: { person: 1, garment: 1 } },
    { name: "proizvod u scenu", routes: PRODUCT_ROUTES, params: { prompt: "x", aspect_ratio: "16:9" }, slots: { image: 2 } },
  ];

  test("svaka ruta je model iz kataloga sa tim režimom, slotovima i parametrima koje server ne odbacuje", () => {
    for (const entry of K12) {
      expect(entry.routes.length, entry.name).toBeGreaterThan(0);
      for (const route of entry.routes) {
        const model = STUDIO_MODELS.find((candidate) => candidate.slug === route.modelSlug);
        expect(model, `${entry.name}: ${route.modelSlug}`).toBeDefined();
        expect(model!.inputModes, entry.name).toContain(route.inputMode);
        const slots = model!.inputSpec[route.inputMode]!;
        for (const [slot, count] of Object.entries(entry.slots)) {
          expect(slots[slot], `${entry.name}: ${slot}`).toBeDefined();
          expect(slots[slot]!.max).toBeGreaterThanOrEqual(count);
        }
        const spec = parseParamSpec(JSON.stringify(model!.paramSpec)) ?? [];
        const keys = new Set(spec.map((control) => control.key));
        for (const [key, value] of Object.entries(entry.params)) {
          expect(keys.has(key), `${entry.name}: ${route.modelSlug}.${key}`).toBe(true);
          const control = spec.find((candidate) => candidate.key === key);
          if (control && (control.type === "segmented" || control.type === "select")) {
            expect(control.options?.map((option) => option.value), `${entry.name}: ${key}`).toContain(value);
          }
        }
        const params = buildParams(spec, { ...paramValuesForMode(spec, route.inputMode), ...entry.params }, route.inputMode);
        expect(computeCredits(model!.priceRule, params, route.inputMode), entry.name).toBeGreaterThan(0);
      }
    }
  });

  test("dve rute iste vrste imaju svoje natpise (izbor modela u alatu)", () => {
    for (const routes of [RELIGHT_ROUTES, RESTORE_ROUTES]) {
      expect(routes.map((route) => route.modelSlug)).toEqual(["nano-banana-pro", "nano-banana-2"]);
      for (const route of routes) expect(route.label?.sr && route.label.en).toBeTruthy();
    }
  });

  test("uglovi: mreža 4K je skuplja od jedne obične slike, ali mnogo jeftinija od devet", () => {
    const model = STUDIO_MODELS.find((candidate) => candidate.slug === "nano-banana-2")!;
    const grid = computeCredits(model.priceRule, { ...ANGLES_GRID_PARAMS }, "image_multi");
    const single = computeCredits(model.priceRule, { resolution: "1K" }, "image_multi");
    expect(grid).toBeGreaterThan(single);
    expect(grid).toBeLessThan(single * 9);
  });

  test("slojevi se plaćaju po sloju", () => {
    const model = STUDIO_MODELS.find((candidate) => candidate.slug === "seedream-5-pro")!;
    const two = computeCredits(model.priceRule, { layers: 2, resolution: "1.5K" }, "layerize");
    const eight = computeCredits(model.priceRule, { layers: 8, resolution: "1.5K" }, "layerize");
    expect(eight).toBeGreaterThan(two);
  });

  test("proizvod u scenu: sa fotkom scene i bez nje; proizvod ostaje isti", () => {
    const withScene = productScenePrompt(true, "na stolu", "sr");
    expect(withScene).toContain("Prva slika je proizvod");
    expect(withScene).toContain("Druga slika je scena");
    expect(withScene).toContain("na stolu");
    expect(withScene).toContain("ostaje potpuno isti");
    const alone = productScenePrompt(false, "plaža", "en");
    expect(alone).toContain("Place it in a new scene: plaža.");
    expect(alone).not.toContain("second");
  });
});
