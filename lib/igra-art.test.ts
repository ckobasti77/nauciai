import { describe, expect, test } from "vitest";

import manifest from "../public/brand/igra/manifest.json";
import {
  IGRA_ART_KINDS,
  IGRA_ART_SIZES,
  IGRA_LIKOVI,
  IGRA_NIVO_COUNT,
  IGRA_PLANNED_ART,
  IGRA_POZE,
  igraArt,
  igraArtAlt,
  igraArtFallbackShape,
  igraArtIds,
  igraArtOrNull,
  igraArtRenderable,
  igraArtWidth,
  igraBedzArt,
  igraLikArt,
  igraNivoArt,
  igraNivoOf,
  isIgraSticker,
  type IgraArtInfo,
  type IgraArtKind,
} from "./igra-art";

const entries = Object.entries(manifest.assets);

describe("manifest IGRA slika", () => {
  test("svaki red ima poznatu vrstu, AVIF adresu, dimenzije i alt na oba jezika", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, entry] of entries) {
      expect(IGRA_ART_KINDS as readonly string[], id).toContain(entry.kind);
      expect(entry.src, id).toMatch(/^\/brand\/igra\/[a-z0-9/-]+\.avif$/);
      expect(entry.w, id).toBeGreaterThan(0);
      expect(entry.h, id).toBeGreaterThan(0);
      expect(entry.alt.sr.trim(), id).not.toBe("");
      expect(entry.alt.en.trim(), id).not.toBe("");
    }
  });

  test("prefiks ID-ja odgovara vrsti", () => {
    const prefixOf: Record<IgraArtKind, string> = {
      lik: "lik.",
      nivo: "nivo.",
      bedz: "bedz.",
      rang: "rang.",
      scena: "scena.",
      "scena-nalepnica": "scena.",
      baner: "baner.",
      prazno: "prazno.",
      admin: "admin.",
      ikona: "ikona.",
    };
    for (const [id, entry] of entries) {
      expect(id.startsWith(prefixOf[entry.kind as IgraArtKind]), id).toBe(true);
    }
  });
});

describe("igraArt", () => {
  test("vraća red manifesta", () => {
    const info = igraArt("lik.robi.mase");
    expect(info).toMatchObject({ id: "lik.robi.mase", src: "/brand/igra/likovi/robi-mase.avif", w: 768, h: 768, kind: "lik" });
    expect(info.ready).toBe(manifest.assets["lik.robi.mase"].ready);
  });

  test("alt prati jezik", () => {
    const info = igraArt("lik.robi.mase");
    expect(igraArtAlt(info, "sr")).toBe("Robi maše");
    expect(igraArtAlt(info, "en")).toBe("Robi waving");
  });

  test("nepoznat ID nije slika", () => {
    expect(igraArtOrNull("lik.nepostoji.mase")).toBeNull();
    expect(igraArtOrNull("")).toBeNull();
    expect(igraArtOrNull("toString")).toBeNull();
    expect(igraArtOrNull("lik.robi.mase")).not.toBeNull();
    // @ts-expect-error nepoznat ID ne prolazi ni tipove
    expect(() => igraArt("lik.nepostoji.mase")).toThrow("nepoznata slika");
  });

  test("planirana slika postoji, ali nema fajl dok ne uđe u manifest", () => {
    const assets: Record<string, unknown> = manifest.assets;
    for (const id of Object.keys(IGRA_PLANNED_ART) as Array<keyof typeof IGRA_PLANNED_ART>) {
      const info = igraArt(id);
      expect(igraArtOrNull(id)).not.toBeNull();
      if (assets[id]) continue; // stigla je: manifest pobeđuje
      expect(info.ready, id).toBe(false);
      expect(info.src, id).toBe("");
      expect(igraArtRenderable(info), id).toBe(false);
    }
  });

  test("igraArtIds pokriva manifest i planirane, bez duplikata", () => {
    const ids = igraArtIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id] of entries) expect(ids).toContain(id);
    for (const id of Object.keys(IGRA_PLANNED_ART)) expect(ids).toContain(id);
  });
});

describe("fallback", () => {
  const base: IgraArtInfo = { id: "lik.robi.mase", src: "/brand/igra/likovi/robi-mase.avif", w: 768, h: 768, kind: "lik", ready: true, alt: { sr: "a", en: "b" } };

  test("slika se crta samo kad je spremna i ima adresu", () => {
    expect(igraArtRenderable(base)).toBe(true);
    expect(igraArtRenderable({ ...base, ready: false })).toBe(false);
    expect(igraArtRenderable({ ...base, src: "" })).toBe(false);
  });

  test("oblik fallback-a prati vrstu", () => {
    expect(igraArtFallbackShape("nivo")).toBe("level");
    expect(igraArtFallbackShape("scena")).toBe("paper");
    expect(igraArtFallbackShape("baner")).toBe("paper");
    for (const kind of ["lik", "bedz", "rang", "scena-nalepnica", "prazno", "admin", "ikona"] as const) {
      expect(igraArtFallbackShape(kind), kind).toBe("sticker");
      expect(isIgraSticker(kind), kind).toBe(true);
    }
    expect(isIgraSticker("scena")).toBe(false);
    expect(isIgraSticker("baner")).toBe(false);
  });

  test("broj nivoa se čita samo iz ID-ja amblema", () => {
    expect(igraNivoOf("nivo.07")).toBe(7);
    expect(igraNivoOf("nivo.12")).toBe(12);
    expect(igraNivoOf("nivo.7")).toBeNull();
    expect(igraNivoOf("lik.robi.mase")).toBeNull();
  });
});

describe("veličina kutije", () => {
  test("imenovane veličine, broj i hero", () => {
    expect(igraArtWidth("xs", "lik")).toBe(IGRA_ART_SIZES.xs);
    expect(igraArtWidth("lg", "bedz")).toBe(96);
    expect(igraArtWidth(200, "lik")).toBe(200);
    expect(igraArtWidth(47.6, "lik")).toBe(48);
    expect(igraArtWidth("hero", "lik")).toBeNull();
  });

  test("bez veličine: nalepnica je md, scena i baner cela širina", () => {
    expect(igraArtWidth(undefined, "lik")).toBe(IGRA_ART_SIZES.md);
    expect(igraArtWidth(undefined, "scena-nalepnica")).toBe(IGRA_ART_SIZES.md);
    expect(igraArtWidth(undefined, "scena")).toBeNull();
    expect(igraArtWidth(undefined, "baner")).toBeNull();
  });

  test("besmislen broj pada na md umesto da sruši raspored", () => {
    expect(igraArtWidth(0, "lik")).toBe(IGRA_ART_SIZES.md);
    expect(igraArtWidth(-5, "lik")).toBe(IGRA_ART_SIZES.md);
    expect(igraArtWidth(Number.NaN, "lik")).toBe(IGRA_ART_SIZES.md);
  });
});

describe("porodice ID-jeva", () => {
  test("svaki lik ima sve četiri poze u manifestu", () => {
    for (const lik of IGRA_LIKOVI) {
      for (const poza of IGRA_POZE) {
        const id = igraLikArt(lik, poza);
        expect(igraArtOrNull(id), id).not.toBeNull();
        expect(igraArt(id).kind, id).toBe("lik");
      }
    }
  });

  test("amblemi nivoa 1-12, van opsega se steže", () => {
    for (let level = 1; level <= IGRA_NIVO_COUNT; level += 1) {
      const id = igraNivoArt(level);
      expect(igraArt(id).kind, id).toBe("nivo");
      expect(igraNivoOf(id)).toBe(level);
    }
    expect(igraNivoArt(0)).toBe("nivo.01");
    expect(igraNivoArt(-3)).toBe("nivo.01");
    expect(igraNivoArt(13)).toBe("nivo.12");
    expect(igraNivoArt(4.9)).toBe("nivo.04");
    expect(igraNivoArt(Number.NaN)).toBe("nivo.01");
  });

  test("24 bedža", () => {
    const badgeIds = entries.filter(([, entry]) => entry.kind === "bedz").map(([id]) => id);
    expect(badgeIds).toHaveLength(24);
    expect(igraBedzArt("prva-lekcija")).toBe("bedz.prva-lekcija");
    expect(igraArt(igraBedzArt("top-10")).kind).toBe("bedz");
  });
});
