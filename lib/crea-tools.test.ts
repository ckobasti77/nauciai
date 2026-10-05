/**
 * Registar alata (K04): jedan spisak za UI, Convex i kasnije korake. Testovi
 * čuvaju invarijante koje UI i `creaLocal.saveLocalResult` uzimaju zdravo za
 * gotovo - stabilan oblik id-ja, ispravna oblast/režim, 0 kredita za lokalne
 * alate, postojeći modeli i server isključen (O2).
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { deviceClassRank, MODEL_BUDGET_BYTES } from "./crea-device";
import { CREA_GOALS } from "./crea-goals";
import { CREA_LOCAL_MODELS, modelWeightBytes } from "./crea-local-ai/models";
import { CREA_AREAS, CREA_MODES } from "./crea-shell";
import {
  CREA_TOOLS,
  isLocalTier,
  localModelSlug,
  toolBadges,
  toolById,
  toolIdFromModelSlug,
  toolOfJob,
  toolsFor,
} from "./crea-tools";

describe("registar alata", () => {
  test("id-jevi su jedinstveni i u obliku <oblast>.<kebab>", () => {
    const ids = CREA_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tool of CREA_TOOLS) {
      expect(tool.id).toMatch(/^(slika|video|zvuk)\.[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(tool.id.split(".")[0]).toBe(tool.area);
    }
  });

  test("oblast i režim postoje u ljusci", () => {
    for (const tool of CREA_TOOLS) {
      expect(CREA_AREAS).toContain(tool.area);
      expect(CREA_MODES[tool.area].map((mode) => mode.id), tool.id).toContain(tool.mode);
    }
  });

  test("tekstovi postoje na oba jezika, feature id-jevi su iz tabela §7", () => {
    for (const tool of CREA_TOOLS) {
      for (const text of [tool.title, tool.summary]) {
        expect(text.sr.trim(), tool.id).not.toBe("");
        expect(text.en.trim(), tool.id).not.toBe("");
      }
      expect(tool.featureIds.length, tool.id).toBeGreaterThan(0);
      for (const feature of tool.featureIds) expect(feature).toMatch(/^[SVA]\d{1,2}$/);
    }
  });

  test("lokalni alati su besplatni, plaćeni imaju model iz kataloga kad su gotovi", () => {
    for (const tool of CREA_TOOLS) {
      if (isLocalTier(tool.tier)) {
        expect(tool.price, tool.id).toEqual({ kind: "free" });
        continue;
      }
      const price = tool.price;
      if (price.kind !== "credits") throw new Error(`${tool.id}: plaćen alat bez cene u kreditima`);
      if (price.modelSlug !== undefined) {
        const model = STUDIO_MODELS.find((entry) => entry.slug === price.modelSlug);
        expect(model, tool.id).toBeDefined();
        if (price.inputMode) expect(model?.inputModes, tool.id).toContain(price.inputMode);
      }
      if (tool.status === "ready") expect(price.modelSlug, tool.id).toBeDefined();
    }
  });

  test("rezervni plaćeni put vodi na model iz kataloga", () => {
    for (const tool of CREA_TOOLS) {
      if (!tool.paidFallback) continue;
      const model = STUDIO_MODELS.find((entry) => entry.slug === tool.paidFallback?.modelSlug);
      expect(model, tool.id).toBeDefined();
      if (tool.paidFallback.inputMode) expect(model?.inputModes, tool.id).toContain(tool.paidFallback.inputMode);
    }
  });

  test("lokalni modeli postoje u registru i staju u budžet klase za koju je alat označen", () => {
    for (const tool of CREA_TOOLS) {
      const models = tool.localModels ?? [];
      for (const id of models) expect(CREA_LOCAL_MODELS[id], `${tool.id}: ${id}`).toBeDefined();
      if (models.length === 0) continue;

      // Puna varijanta = najteži model; mala = najlakši (npr. BiRefNet / MODNet).
      const weights = models.map((id) => modelWeightBytes([id]));
      expect(Math.max(...weights), tool.id).toBeLessThanOrEqual(MODEL_BUDGET_BYTES[tool.device.minClass]);
      if (tool.device.smallVariantFrom) {
        expect(Math.min(...weights), tool.id).toBeLessThanOrEqual(MODEL_BUDGET_BYTES[tool.device.smallVariantFrom]);
        expect(deviceClassRank(tool.device.smallVariantFrom)).toBeLessThan(deviceClassRank(tool.device.minClass));
      }
    }
  });

  test("teški modeli (> budžet telefona) nikad nisu označeni za telefon", () => {
    for (const tool of CREA_TOOLS) {
      for (const id of tool.localModels ?? []) {
        if (CREA_LOCAL_MODELS[id].bytes <= MODEL_BUDGET_BYTES.phone) continue;
        expect(deviceClassRank(tool.device.minClass), `${tool.id}: ${id}`).toBeGreaterThan(deviceClassRank("phone"));
      }
    }
  });

  test("izlaz koji nije medij se ne čuva u galeriji", () => {
    for (const tool of CREA_TOOLS) {
      if (tool.output === "text" || tool.output === "svg" || tool.output === "zip") {
        expect(tool.savesToGallery, tool.id).toBe(false);
      }
    }
  });

  test("server (O2) je uvek „uskoro\"", () => {
    for (const tool of CREA_TOOLS) if (tool.tier === "server") expect(tool.status).toBe("soon");
  });

  test("K04 pušta format i proveru fotke, K09 sedam besplatnih alata za sliku, K10 editor, šablone i 3D foto, K11 izmene", () => {
    const ready = CREA_TOOLS.filter((tool) => tool.status === "ready").map((tool) => tool.id);
    expect(ready).toEqual([
      "slika.format",
      "slika.provera",
      "slika.iseci",
      "slika.pametni-isecak",
      "slika.paleta",
      "slika.qr",
      "slika.vektor",
      "slika.gif",
      "slika.ocr",
      "slika.editor",
      "slika.sabloni",
      "slika.3d-foto",
      "slika.cetkica",
      "slika.klik",
      "slika.obrisi",
      "slika.pozadina",
      "slika.uvecaj",
      "slika.boje",
    ]);
    expect(toolById("slika.format")).toMatchObject({ tier: "local-code", featureIds: ["S27"], output: "image" });
    expect(toolById("slika.provera")).toMatchObject({
      tier: "local-ai",
      featureIds: ["S35"],
      localModels: ["mp-face-detector"],
    });
  });

  test("K09 alati: 0 kredita, tekst i SVG se ne čuvaju u galeriju, medij se čuva", () => {
    const k09 = ["slika.iseci", "slika.pametni-isecak", "slika.paleta", "slika.qr", "slika.vektor", "slika.gif", "slika.ocr"];
    for (const id of k09) {
      const tool = toolById(id)!;
      expect(tool.price, id).toEqual({ kind: "free" });
      expect(tool.savesToGallery, id).toBe(tool.output === "image");
    }
    expect(toolById("slika.pametni-isecak")?.localModels).toEqual(["mp-face-detector"]);
    expect(toolById("slika.ocr")?.localModels).toEqual(["tess-srp", "tess-srp-latn"]);
    expect(toolById("slika.gif")?.inputs).toEqual(["images"]);
  });

  test("K10 alati: 0 kredita, slika/video u galeriju; 3D foto samo na računaru sa WebGL2 i WebCodecs", () => {
    for (const id of ["slika.editor", "slika.sabloni", "slika.3d-foto"]) {
      const tool = toolById(id)!;
      expect(tool.price, id).toEqual({ kind: "free" });
      expect(tool.savesToGallery, id).toBe(true);
    }
    expect(toolById("slika.editor")).toMatchObject({ tier: "local-code", output: "image", featureIds: ["S28"] });
    expect(toolById("slika.sabloni")).toMatchObject({ tier: "local-code", output: "image", featureIds: ["S29"] });
    expect(toolById("slika.3d-foto")).toMatchObject({
      tier: "local-ai",
      output: "video",
      featureIds: ["S33"],
      localModels: ["depth-anything-v2-small"],
      device: { minClass: "desktop", requires: ["webgl2", "webcodecs-video"] },
    });
  });

  test("K11 izmene: lokalne su besplatne i čuvaju sliku; četkica je plaćena maskom kroz katalog", () => {
    for (const id of ["slika.klik", "slika.obrisi", "slika.pozadina", "slika.uvecaj", "slika.boje"]) {
      const tool = toolById(id)!;
      expect(tool.mode, id).toBe("izmeni");
      expect(tool.price, id).toEqual({ kind: "free" });
      expect(tool.savesToGallery, id).toBe(true);
      expect(tool.output, id).toBe("image");
    }
    expect(toolById("slika.cetkica")).toMatchObject({
      tier: "paid",
      price: { kind: "credits", modelSlug: "ideogram-45", inputMode: "mask" },
      paidFallback: { modelSlug: "nano-banana-2", inputMode: "image_multi" },
    });
    // Brisanje: mali predmet na uređaju, veliki kroz isti put maske.
    expect(toolById("slika.obrisi")).toMatchObject({ localModels: ["migan"], paidFallback: { modelSlug: "ideogram-45", inputMode: "mask" } });
    // Pozadina: MODNet (osoba) i klik (predmet) na svakom uređaju od telefona naviše; BiRefNet ne (ORT 1.30).
    expect(toolById("slika.pozadina")).toMatchObject({
      localModels: ["modnet", "mp-interactive-segmenter"],
      device: { minClass: "phone" },
    });
    expect(toolById("slika.uvecaj")?.localModels).toEqual(["swin2sr-x2"]);
    expect(toolById("slika.boje")?.device.requires).toEqual(["webgl2"]);
  });

  test("svaki alat sa kartice „Šta praviš danas?\" postoji u registru", () => {
    for (const goal of CREA_GOALS) {
      if (goal.toolId) expect(toolById(goal.toolId), goal.id).toBeDefined();
    }
  });
});

describe("pomoćne funkcije", () => {
  test("toolById i toolsFor", () => {
    expect(toolById("nema.takvog")).toBeUndefined();
    expect(toolById(null)).toBeUndefined();
    const tools = toolsFor("slika", "alati");
    expect(tools.slice(0, 2).map((tool) => tool.id)).toEqual(["slika.format", "slika.provera"]);
    expect(tools.every((tool) => tool.area === "slika" && tool.mode === "alati")).toBe(true);
    // Gotovi alati idu pre onih koji stižu.
    const firstSoon = tools.findIndex((tool) => tool.status === "soon");
    expect(tools.slice(firstSoon).every((tool) => tool.status === "soon")).toBe(true);
    expect(toolsFor("zvuk").every((tool) => tool.area === "zvuk")).toBe(true);
  });

  test("oznake: besplatno i na uređaju za lokalne, krediti za plaćene, uskoro za nespremne", () => {
    expect(toolBadges(toolById("slika.format")!)).toEqual(["besplatno", "na-uredjaju"]);
    expect(toolBadges(toolById("slika.pozadina")!)).toEqual(["besplatno", "na-uredjaju"]);
    expect(toolBadges(toolById("slika.retus")!)).toEqual(["besplatno", "na-uredjaju", "uskoro"]);
    expect(toolBadges(toolById("slika.prosiri")!)).toEqual(["krediti", "uskoro"]);
  });

  test("modelSlug lokalnog posla ide u oba smera", () => {
    expect(localModelSlug("slika.format")).toBe("local:slika.format");
    expect(toolIdFromModelSlug("local:slika.format")).toBe("slika.format");
    expect(toolIdFromModelSlug("nano-banana-2")).toBeNull();
    expect(toolOfJob({ modelSlug: "local:slika.provera" })?.id).toBe("slika.provera");
    expect(toolOfJob({ modelSlug: "veo-31" })).toBeUndefined();
  });
});
