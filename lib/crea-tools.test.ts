/**
 * Registar alata (K04): jedan spisak za UI, Convex i kasnije korake. Testovi
 * čuvaju invarijante koje UI i `creaLocal.saveLocalResult` uzimaju zdravo za
 * gotovo - stabilan oblik id-ja, ispravna oblast/režim, 0 kredita za lokalne
 * alate, postojeći modeli i server isključen (O2).
 */

import { describe, expect, test } from "vitest";

import { localToolProblem } from "@/convex/creaLocalCore";
import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { deviceClassRank, MODEL_BUDGET_BYTES } from "./crea-device";
import { CREA_GOALS } from "./crea-goals";
import { CREA_LOCAL_MODELS, modelWeightBytes } from "./crea-local-ai/models";
import { CREA_AREAS, CREA_MODES } from "./crea-shell";
import {
  CREA_TOOLS,
  isLocalTier,
  localModelSlug,
  savesLocalResults,
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

  test("K04 pušta format i proveru fotke, K09 sedam besplatnih alata za sliku, K10 editor, šablone i 3D foto, K11 i K12 izmene, K13 pravljenje, K14 likovi, K18 video, K19 montaža, K20 dorada, pokret i govor, K21 strip, titlovi, shorts, retro, explainer i reklama, K22 glas, K23 muzika, efekti, prevod i trake", () => {
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
      // K16: „Kako je ovo napravljeno?" (Alati)
      "slika.opis",
      "slika.cetkica",
      "slika.klik",
      "slika.obrisi",
      "slika.pozadina",
      "slika.uvecaj",
      "slika.boje",
      "slika.prosiri",
      "slika.svetlo",
      "slika.uglovi",
      "slika.slojevi",
      "slika.tekst",
      "slika.retus",
      "slika.odeca",
      // K14: zamena lika (Izmeni) i Likovi
      "slika.zameni-lik",
      "slika.likovi",
      "slika.kreator-lika",
      // K13: Slika · Napravi
      "slika.probni-list",
      "slika.ko-gde-kako",
      "slika.crtaj",
      "slika.skica",
      // K15: nalepnice, logo i brend kit (3D model ostaje „uskoro" - nema endpointa)
      "slika.nalepnice",
      "slika.logo",
      "slika.brend-kit",
      // K18: Video · Napravi (V4, V11, V12) i Video · Izmeni (V5)
      "video.poslednji-kadar",
      "video.vise-scena",
      "video.crtaj-pokret",
      // K21: Video · Napravi (V10, V28, V31)
      "video.strip",
      "video.objasnjenje",
      "video.reklama",
      "video.produzi",
      // K19: Video · Montaža (V24, V29, V30)
      "video.montaza",
      "video.ritam-sabloni",
      "video.izvoz",
      // K20: Video · Izmeni (V13-V18), Pokret (V20) i Govor (V21-V23); novo svetlo (V19) čeka endpoint
      "video.izmeni-recima",
      "video.zameni",
      "video.reframe",
      "video.boje",
      "video.pozadina",
      "video.uvecaj",
      "video.slowmo",
      "video.bez-treperenja",
      "video.odglumi",
      "video.lik-govori",
      // K21: titlovi i kratki klipovi (Montaža), retro (Izmeni)
      "video.titlovi",
      "video.shorts",
      "video.retro",
      // K22: Zvuk · Govor (A2, A4, A5, A6) i Glasovi (A3, A7, A8)
      "zvuk.govor",
      "zvuk.dijalog",
      "zvuk.podkast",
      "zvuk.glasovi",
      "zvuk.dizajn",
      "zvuk.kloniraj",
      // K23: Promena glasa (A9), Prevod (A10), Muzika (A11, A12), Efekti (A13), trake (A18)
      "zvuk.promena",
      "zvuk.prevod",
      "zvuk.muzika",
      "zvuk.ozvuci",
      "zvuk.efekti",
      "zvuk.trake",
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

  test("K12 izmene: plaćeni delovi idu kroz katalog, besplatni koraci čuvaju u galeriju", () => {
    // Plaćeni alati sa besplatnim korakom na uređaju (isecanje, 9 uglova, izvoz slojeva, isečak proizvoda).
    for (const id of ["slika.prosiri", "slika.uglovi", "slika.slojevi", "slika.odeca"]) {
      const tool = toolById(id)!;
      expect(tool, id).toMatchObject({ tier: "paid", mode: "izmeni", status: "ready", localSave: true, savesToGallery: true });
      expect(savesLocalResults(tool), id).toBe(true);
    }
    // Novo svetlo je samo plaćeno: nema lokalnog rezultata.
    expect(toolById("slika.svetlo")).toMatchObject({
      tier: "paid",
      price: { kind: "credits", modelSlug: "nano-banana-pro", inputMode: "image_multi" },
      paidFallback: { modelSlug: "nano-banana-2", inputMode: "image_multi" },
    });
    expect(savesLocalResults(toolById("slika.svetlo")!)).toBe(false);
    expect(savesLocalResults(toolById("slika.cetkica")!)).toBe(false);
    expect(toolById("slika.slojevi")?.price).toEqual({ kind: "credits", modelSlug: "seedream-5-pro", inputMode: "layerize" });
    expect(toolById("slika.odeca")?.price).toEqual({ kind: "credits", modelSlug: "kling-tryon", inputMode: "image_multi" });
    // Tekst kao sloj i retuš su besplatni (lokalno), sa plaćenim rezervnim putem.
    expect(toolById("slika.tekst")).toMatchObject({
      tier: "local-ai",
      price: { kind: "free" },
      localModels: ["tess-srp", "tess-srp-latn", "migan"],
      paidFallback: { modelSlug: "ideogram-45", inputMode: "mask" },
    });
    expect(toolById("slika.retus")).toMatchObject({
      tier: "local-code",
      price: { kind: "free" },
      device: { minClass: "phone" },
      paidFallback: { modelSlug: "nano-banana-pro", inputMode: "image_multi" },
    });
    // Zameni lik (S24) je stigao sa Likovima u K14 (vidi test „K14").
    expect(toolById("slika.zameni-lik")?.status).toBe("ready");
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
    // K16: u Slika · Alati više nema „uskoro" alata (`findIndex` = -1), pa se gleda ceo region.
    const firstSoon = tools.findIndex((tool) => tool.status === "soon");
    expect(tools.slice(firstSoon === -1 ? tools.length : firstSoon).every((tool) => tool.status === "soon")).toBe(true);
    expect(toolsFor("video").findIndex((tool) => tool.status === "soon")).toBeGreaterThanOrEqual(0);
    expect(toolsFor("zvuk").every((tool) => tool.area === "zvuk")).toBe(true);
  });

  test("oznake: besplatno i na uređaju za lokalne, krediti za plaćene, uskoro za nespremne", () => {
    expect(toolBadges(toolById("slika.format")!)).toEqual(["besplatno", "na-uredjaju"]);
    expect(toolBadges(toolById("slika.pozadina")!)).toEqual(["besplatno", "na-uredjaju"]);
    expect(toolBadges(toolById("slika.retus")!)).toEqual(["besplatno", "na-uredjaju"]);
    expect(toolBadges(toolById("video.reframe")!)).toEqual(["besplatno", "na-uredjaju"]);
    expect(toolBadges(toolById("video.retro")!)).toEqual(["besplatno", "na-uredjaju"]);
    expect(toolBadges(toolById("zvuk.snimac")!)).toEqual(["besplatno", "na-uredjaju", "uskoro"]);
    // K12: plaćen alat sa besplatnim korakom na uređaju nosi obe oznake.
    expect(toolBadges(toolById("slika.prosiri")!)).toEqual(["krediti", "na-uredjaju"]);
    expect(toolBadges(toolById("slika.svetlo")!)).toEqual(["krediti"]);
    expect(toolBadges(toolById("slika.zameni-lik")!)).toEqual(["krediti"]);
    expect(toolBadges(toolById("video.svetlo")!)).toEqual(["krediti", "uskoro"]);
  });

  test("modelSlug lokalnog posla ide u oba smera", () => {
    expect(localModelSlug("slika.format")).toBe("local:slika.format");
    expect(toolIdFromModelSlug("local:slika.format")).toBe("slika.format");
    expect(toolIdFromModelSlug("nano-banana-2")).toBeNull();
    expect(toolOfJob({ modelSlug: "local:slika.provera" })?.id).toBe("slika.provera");
    expect(toolOfJob({ modelSlug: "veo-31" })).toBeUndefined();
  });
});

describe("K14: Likovi, provera fotke, kreator, zamena lika", () => {
  test("ekran Likovi je besplatan, proverava lice na uređaju i ne pravi rad u galeriji", () => {
    expect(toolById("slika.likovi")).toMatchObject({
      mode: "likovi",
      tier: "local-ai",
      status: "ready",
      price: { kind: "free" },
      localModels: ["mp-face-detector"],
      savesToGallery: false,
    });
    // Lokalni alat, ali bez rada u galeriji: `creaLocal.saveLocalResult` ga odbija (`savesToGallery: false`).
    expect(toolBadges(toolById("slika.likovi")!)).toEqual(["besplatno", "na-uredjaju"]);
  });

  test("kreator i zamena idu kroz Nano Banana Pro (NB2 jeftinije), zamena proverava fotku", () => {
    expect(toolById("slika.kreator-lika")).toMatchObject({
      tier: "paid",
      status: "ready",
      price: { kind: "credits", modelSlug: "nano-banana-pro" },
      paidFallback: { modelSlug: "nano-banana-2" },
    });
    expect(toolById("slika.zameni-lik")).toMatchObject({
      tier: "paid",
      mode: "izmeni",
      price: { kind: "credits", modelSlug: "nano-banana-pro", inputMode: "image_multi" },
      localModels: ["mp-face-detector"],
    });
    expect(savesLocalResults(toolById("slika.zameni-lik")!)).toBe(false);
    expect(savesLocalResults(toolById("slika.kreator-lika")!)).toBe(false);
  });

  test("režim Likovi otvara spisak likova kad alat nije izabran", () => {
    const likovi = CREA_MODES.slika.find((mode) => mode.id === "likovi")!;
    expect(likovi).toMatchObject({ status: "ready", tools: true, defaultTool: "slika.likovi" });
    expect(toolById(likovi.defaultTool)?.mode).toBe("likovi");
    expect(toolsFor("slika", "likovi").map((tool) => tool.id)).toEqual(["slika.likovi", "slika.kreator-lika"]);
  });
});

describe("K13: Slika · Napravi", () => {
  test("četiri plaćena alata u Napravi, sa modelom iz kataloga; čuvaju preko plaćenog posla, ne lokalno", () => {
    const ids = ["slika.probni-list", "slika.ko-gde-kako", "slika.crtaj", "slika.skica"];
    for (const id of ids) {
      const tool = toolById(id)!;
      expect(tool, id).toMatchObject({ area: "slika", mode: "napravi", tier: "paid", status: "ready" });
      expect(tool.price.kind, id).toBe("credits");
      expect(tool.localSave, id).toBeUndefined();
    }
    expect(toolById("slika.probni-list")?.featureIds).toEqual(["S4", "S5"]);
    expect(toolById("slika.crtaj")?.featureIds).toEqual(["S9"]);
  });
});

describe("K18: Video · Napravi i Izmeni", () => {
  test("poslednji kadar je besplatan, radi od telefona i bez WebCodecs-a, čuva sliku", () => {
    expect(toolById("video.poslednji-kadar")).toMatchObject({
      tier: "local-code",
      status: "ready",
      mode: "napravi",
      output: "image",
      savesToGallery: true,
      device: { minClass: "phone" },
    });
    expect(toolById("video.poslednji-kadar")?.device.requires).toBeUndefined();
  });

  test("više scena, crtaj pokret i produži: plaćeni, model i režim postoje u katalogu", () => {
    for (const [id, mode] of [["video.vise-scena", "napravi"], ["video.crtaj-pokret", "napravi"], ["video.produzi", "izmeni"]] as const) {
      const tool = toolById(id)!;
      expect(tool, id).toMatchObject({ area: "video", mode, tier: "paid", status: "ready", output: "video" });
      const price = tool.price;
      if (price.kind !== "credits") throw new Error(id);
      const model = STUDIO_MODELS.find((entry) => entry.slug === price.modelSlug)!;
      expect(model.inputModes, id).toContain(price.inputMode);
      expect(toolBadges(tool)).toEqual(["krediti"]);
    }
  });
});

describe("K19: Video · Montaža", () => {
  test("montaža, ritam i izvoz: besplatni, na svakom uređaju (bez WebCodecs-a pregled i GIF), čuvaju i GIF", () => {
    for (const id of ["video.montaza", "video.ritam-sabloni", "video.izvoz"]) {
      const tool = toolById(id)!;
      expect(tool, id).toMatchObject({
        area: "video",
        mode: "montaza",
        tier: "local-code",
        status: "ready",
        output: "video",
        savesToGallery: true,
        alsoSaves: ["image"],
        device: { minClass: "weak" },
        price: { kind: "free" },
      });
      expect(tool.device.requires, id).toBeUndefined();
      expect(toolBadges(tool), id).toEqual(["besplatno", "na-uredjaju"]);
    }
    // Gotovi alati montaže stoje pre titlova i shorts-a (K21, „uskoro").
    expect(toolsFor("video", "montaza").map((tool) => tool.id)).toEqual([
      "video.montaza",
      "video.ritam-sabloni",
      "video.izvoz",
      "video.titlovi",
      "video.shorts",
    ]);
  });
});

describe("K21: strip, titlovi, kratki klipovi, retro, objašnjenje, reklama", () => {
  test("strip, objašnjenje i reklama su u Video · Napravi; plaćeni, a model i režim postoje u katalogu", () => {
    for (const id of ["video.strip", "video.objasnjenje", "video.reklama"]) {
      const tool = toolById(id)!;
      expect(tool, id).toMatchObject({ area: "video", mode: "napravi", tier: "paid", status: "ready", output: "video", device: { minClass: "weak" } });
      const price = tool.price;
      if (price.kind !== "credits") throw new Error(id);
      expect(STUDIO_MODELS.find((entry) => entry.slug === price.modelSlug)?.inputModes, id).toContain(price.inputMode);
    }
    // Objašnjenje i reklama izvoze montažu na uređaju i čuvaju je kao lokalni rad (i GIF); strip otvara Montažu.
    for (const id of ["video.objasnjenje", "video.reklama", "video.titlovi", "video.shorts", "video.retro"]) {
      expect(localToolProblem(id, "video"), id).toBeNull();
    }
    expect(localToolProblem("video.objasnjenje", "image")).toBeNull();
    expect(localToolProblem("video.titlovi", "image")).toBeNull();
    expect(localToolProblem("video.strip", "video")).toBe("NEPOZNAT_ALAT");
  });

  test("titlovi rade svuda (besplatno, plaćeno prepoznavanje kao rezerva), shorts traži računar, retro WebGL2", () => {
    expect(toolById("video.titlovi")).toMatchObject({ tier: "local-code", device: { minClass: "weak" }, paidFallback: { modelSlug: "stt", inputMode: "video" } });
    expect(toolById("video.titlovi")?.localModels).toBeUndefined();
    expect(toolById("video.shorts")).toMatchObject({ tier: "paid", localSave: true, device: { minClass: "desktop", requires: ["webcodecs-video"] }, price: { modelSlug: "stt", inputMode: "video" } });
    expect(toolBadges(toolById("video.shorts")!)).toEqual(["krediti", "na-uredjaju"]);
    expect(toolById("video.retro")).toMatchObject({ tier: "local-code", device: { minClass: "desktop", requires: ["webgl2", "webcodecs-video"] } });
    expect(toolsFor("video", "montaza").map((tool) => tool.id)).toEqual(["video.montaza", "video.ritam-sabloni", "video.izvoz", "video.titlovi", "video.shorts"]);
  });
});
