/**
 * Ljuska Cree (K03): stanje u URL-u i raspodela kataloga po režimima. Najvažnija
 * tvrdnja je da nijedan model iz kataloga ne „nestane" u novoj ljusci - postojeće
 * generisanje slike, videa i zvuka mora da ostane dostupno kroz neki režim.
 */

import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import {
  CREA_AREA_KIND,
  CREA_AREAS,
  CREA_MODES,
  creaModeDef,
  creaShellQuery,
  inputModeForMode,
  modelsForMode,
  modeOfModel,
  parseCreaShellState,
  usableInputModes,
  type CreaArea,
} from "@/lib/crea-shell";
import { toolsFor } from "@/lib/crea-tools";

const params = (query: string) => new URLSearchParams(query);
const slugsOf = (area: CreaArea, mode: Parameters<typeof modelsForMode>[2]) =>
  modelsForMode(STUDIO_MODELS, area, mode).map((model) => model.slug);

describe("CREA_MODES", () => {
  test("svaka oblast ima režime iz plana, redom", () => {
    expect(CREA_MODES.slika.map((mode) => mode.id)).toEqual(["napravi", "izmeni", "alati", "likovi"]);
    expect(CREA_MODES.video.map((mode) => mode.id)).toEqual(["napravi", "izmeni", "pokret", "govor", "montaza"]);
    expect(CREA_MODES.zvuk.map((mode) => mode.id)).toEqual([
      "govor",
      "glasovi",
      "promena",
      "prevod",
      "muzika",
      "efekti",
      "uredjivac",
    ]);
  });

  test("svaki režim ima naziv i rečenicu na oba jezika; „uskoro” nema modele", () => {
    for (const area of CREA_AREAS) {
      for (const mode of CREA_MODES[area]) {
        expect(mode.label.sr.trim()).not.toBe("");
        expect(mode.label.en.trim()).not.toBe("");
        expect(mode.blurb.sr.trim()).not.toBe("");
        expect(mode.blurb.en.trim()).not.toBe("");
        if (mode.status === "soon") expect(mode.models).toBeUndefined();
        // Režim koji radi nudi modele ili lokalne alate (K04: Slika · Alati) - nikad oba.
        else if (mode.tools) expect(mode.models, `${area}/${mode.id}`).toBeUndefined();
        else expect(mode.models).toBeDefined();
      }
    }
  });

  test("režim sa alatima ima bar jedan gotov alat u registru (K04)", () => {
    for (const area of CREA_AREAS) {
      for (const mode of CREA_MODES[area]) {
        if (!mode.tools) continue;
        const ready = toolsFor(area, mode.id).filter((tool) => tool.status === "ready");
        expect(ready.length, `${area}/${mode.id}`).toBeGreaterThan(0);
      }
    }
    expect(creaModeDef("slika", "alati")).toMatchObject({ status: "ready", tools: true });
  });

  test("prvi režim svake oblasti radi (podrazumevani ekran nije prazan)", () => {
    for (const area of CREA_AREAS) {
      expect(CREA_MODES[area][0].status).toBe("ready");
      expect(modelsForMode(STUDIO_MODELS, area, null).length).toBeGreaterThan(0);
    }
  });
});

describe("modelsForMode", () => {
  test("svaki model iz kataloga je dostupan u bar jednom režimu svoje oblasti", () => {
    for (const model of STUDIO_MODELS) {
      const area = (Object.keys(CREA_AREA_KIND) as CreaArea[]).find((key) => CREA_AREA_KIND[key] === model.kind)!;
      const homes = CREA_MODES[area].filter((mode) => slugsOf(area, mode.id).includes(model.slug));
      expect(homes.length, `${model.slug} nema režim`).toBeGreaterThan(0);
    }
  });

  test("režim nudi samo modele vrste svoje oblasti", () => {
    for (const area of CREA_AREAS) {
      for (const mode of CREA_MODES[area]) {
        for (const model of modelsForMode(STUDIO_MODELS, area, mode.id)) {
          expect(model.kind).toBe(CREA_AREA_KIND[area]);
        }
      }
    }
  });

  test("raspodela prati plan K01 §2.2", () => {
    expect(slugsOf("slika", "napravi")).not.toContain("kling-tryon");
    expect(slugsOf("slika", "izmeni")).toContain("kling-tryon");
    expect(slugsOf("slika", "izmeni")).toContain("seedream-5-pro");
    expect(slugsOf("slika", "alati")).toEqual([]);
    expect(slugsOf("video", "napravi")).not.toEqual(expect.arrayContaining(["kling-avatar"]));
    expect(slugsOf("video", "napravi")).not.toContain("kling-lipsync");
    expect(slugsOf("video", "napravi")).not.toContain("kling-motion");
    expect(slugsOf("video", "napravi")).toContain("veo-31-lite");
    expect(slugsOf("video", "izmeni")).toEqual(expect.arrayContaining(["veo-31", "kling-omni"]));
    expect(slugsOf("video", "pokret")).toEqual(["kling-motion"]);
    expect(slugsOf("video", "govor").sort()).toEqual(["kling-avatar", "kling-lipsync"]);
    expect(slugsOf("zvuk", "govor").sort()).toEqual(["dialogue", "tts"]);
    expect(slugsOf("zvuk", "promena")).toEqual(["voice-changer"]);
    expect(slugsOf("zvuk", "prevod")).toEqual(["dubbing"]);
    expect(slugsOf("zvuk", "muzika")).toEqual(["music"]);
    expect(slugsOf("zvuk", "efekti").sort()).toEqual(["kling-v2a", "sfx"]);
    expect(slugsOf("zvuk", "uredjivac").sort()).toEqual(["audio-isolation", "stt"]);
  });

  test("režim-nastavak (Gemini Omni `video`) se ne nudi kao izmena: forma još nema izbor izvora", () => {
    const omni = STUDIO_MODELS.find((model) => model.slug === "gemini-omni")!;
    expect(usableInputModes(omni)).not.toContain("video");
    expect(slugsOf("video", "izmeni")).not.toContain("gemini-omni");
    expect(slugsOf("video", "napravi")).toContain("gemini-omni");
  });

  test("nepoznat režim pada na prvi režim oblasti", () => {
    expect(creaModeDef("slika", null).id).toBe("napravi");
    expect(slugsOf("slika", null)).toEqual(slugsOf("slika", "napravi"));
  });
});

describe("inputModeForMode", () => {
  const model = (slug: string) => STUDIO_MODELS.find((entry) => entry.slug === slug)!;

  test("forma se otvara režimom koji odgovara poslu", () => {
    expect(inputModeForMode(model("nano-banana-2"), "slika", "napravi")).toBe("text");
    expect(inputModeForMode(model("nano-banana-2"), "slika", "izmeni")).toBe("image_multi");
    expect(inputModeForMode(model("veo-31"), "video", "napravi")).toBe("text");
    expect(inputModeForMode(model("veo-31"), "video", "izmeni")).toBe("video");
    expect(inputModeForMode(model("kling-motion"), "video", "pokret")).toBe("video_image");
    expect(inputModeForMode(model("stt"), "zvuk", "uredjivac")).toBe("audio");
  });

  test("model van režima nema ulazni režim", () => {
    expect(inputModeForMode(model("tts"), "slika", "napravi")).toBeUndefined();
    expect(inputModeForMode(model("kling-avatar"), "video", "napravi")).toBeUndefined();
  });
});

describe("modeOfModel", () => {
  const model = (slug: string) => STUDIO_MODELS.find((entry) => entry.slug === slug)!;

  test("vodi u prvi režim modela, a uz ulazni režim u onaj koji ga nudi", () => {
    expect(modeOfModel(model("nano-banana-pro"))).toEqual({ area: "slika", mode: "napravi" });
    expect(modeOfModel(model("nano-banana-pro"), "image_multi")).toEqual({ area: "slika", mode: "izmeni" });
    expect(modeOfModel(model("veo-31"), "video")).toEqual({ area: "video", mode: "izmeni" });
    expect(modeOfModel(model("kling-lipsync"))).toEqual({ area: "video", mode: "govor" });
    expect(modeOfModel(model("music"))).toEqual({ area: "zvuk", mode: "muzika" });
  });

  test("nepoznat ulazni režim ne obara izbor", () => {
    expect(modeOfModel(model("gemini-omni"), "video")).toEqual({ area: "video", mode: "napravi" });
  });
});

describe("parseCreaShellState", () => {
  test("prazan URL je početni ekran", () => {
    expect(parseCreaShellState(params(""))).toEqual({ area: null, mode: null, tool: null, goal: null, recipe: null });
  });

  test("čita oblast, režim i cilj", () => {
    expect(parseCreaShellState(params("oblast=video&rezim=pokret&cilj=tiktok"))).toEqual({
      area: "video",
      mode: "pokret",
      tool: null,
      goal: "tiktok",
      recipe: null,
    });
  });

  test("stari ?kind= znači oblast", () => {
    expect(parseCreaShellState(params("kind=image")).area).toBe("slika");
    expect(parseCreaShellState(params("kind=video")).area).toBe("video");
    expect(parseCreaShellState(params("kind=audio")).area).toBe("zvuk");
    expect(parseCreaShellState(params("kind=bogus")).area).toBeNull();
    expect(parseCreaShellState(params("oblast=zvuk&kind=image")).area).toBe("zvuk");
  });

  test("režim van oblasti i režim bez oblasti se ignorišu", () => {
    expect(parseCreaShellState(params("oblast=slika&rezim=muzika")).mode).toBeNull();
    expect(parseCreaShellState(params("rezim=napravi")).mode).toBeNull();
    expect(parseCreaShellState(params("oblast=nesto&rezim=napravi"))).toMatchObject({ area: null, mode: null });
  });

  test("id-jevi van dozvoljenog oblika se ignorišu", () => {
    expect(parseCreaShellState(params("cilj=<script>")).goal).toBeNull();
    expect(parseCreaShellState(params("oblast=slika&alat=slika.pozadina")).tool).toBe("slika.pozadina");
    expect(parseCreaShellState(params("alat=slika.pozadina")).tool).toBeNull();
  });
});

describe("creaShellQuery", () => {
  test("ne upisuje podrazumevani režim", () => {
    expect(creaShellQuery({ area: "slika", mode: "napravi" }, params(""))).toBe("oblast=slika");
    expect(creaShellQuery({ area: "video", mode: "pokret" }, params(""))).toBe("oblast=video&rezim=pokret");
  });

  test("čuva projekat, lekciju i regenerate; briše stari kind", () => {
    const query = creaShellQuery(
      { area: "zvuk" },
      params("kind=image&project=p1&lessonId=l1&taskId=t1&regenerate=j1&nepoznat=1"),
    );
    expect(query).toBe("oblast=zvuk&project=p1&lessonId=l1&taskId=t1&regenerate=j1");
  });

  test("promena režima briše cilj i alat; promena oblasti briše i model", () => {
    const current = params("oblast=slika&rezim=izmeni&cilj=profilna&model=nano-banana-pro");
    expect(creaShellQuery({ mode: "napravi" }, current)).toBe("oblast=slika&model=nano-banana-pro");
    expect(creaShellQuery({ area: "video" }, current)).toBe("oblast=video");
    expect(creaShellQuery({ mode: "izmeni" }, current)).toBe(
      "oblast=slika&rezim=izmeni&cilj=profilna&model=nano-banana-pro",
    );
  });

  test("izričit režim prvog taba se ne računa kao promena", () => {
    const current = params("oblast=slika&cilj=logo");
    expect(creaShellQuery({ mode: "napravi" }, current)).toBe("oblast=slika&cilj=logo");
  });

  test("povratak na početak briše oblast i sve što zavisi od nje", () => {
    expect(creaShellQuery({ area: null }, params("oblast=video&rezim=govor&model=kling-avatar&project=p1"))).toBe(
      "project=p1",
    );
  });

  test("parse(query(x)) vraća isto stanje", () => {
    for (const area of CREA_AREAS) {
      for (const mode of CREA_MODES[area]) {
        const state = parseCreaShellState(params(creaShellQuery({ area, mode: mode.id }, params(""))));
        expect(state.area).toBe(area);
        expect(creaModeDef(area, state.mode).id).toBe(mode.id);
      }
    }
  });
});
