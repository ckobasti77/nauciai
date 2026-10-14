import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { igraArt, igraArtIds } from "./igra-art";
import {
  IGRA_BANNERS,
  IGRA_DEFAULT_BANNER,
  igraBanner,
  igraBannerArt,
  isBannerUnlocked,
  isIgraBannerKey,
  resolveBanner,
  type IgraBannerKey,
} from "./igra-banners";

describe("katalog banera (K13)", () => {
  it("šest banera, nivoi iz plana §6.5 (1, 3, 5, 7, 9, 11)", () => {
    expect(IGRA_BANNERS.map((banner) => [banner.key, banner.level])).toEqual([
      ["sveska", 1],
      ["laboratorija", 3],
      ["studio", 5],
      ["svemir", 7],
      ["grad", 9],
      ["okean", 11],
    ]);
    expect(IGRA_DEFAULT_BANNER).toBe("sveska");
    expect(igraBanner(IGRA_DEFAULT_BANNER).level).toBe(1);
  });

  it("svaki baner je slika iz manifesta, vrste `baner`, sa istim nazivom kao alt", () => {
    const manifestBanners = igraArtIds().filter((id) => id.startsWith("baner."));
    expect(manifestBanners.sort()).toEqual(IGRA_BANNERS.map((banner) => igraBannerArt(banner.key)).sort());
    for (const banner of IGRA_BANNERS) {
      const art = igraArt(igraBannerArt(banner.key));
      expect(art.kind, banner.key).toBe("baner");
      expect(art.alt.sr).toBe(`Baner: ${banner.name.sr}`);
      expect(art.alt.en).toBe(`Banner: ${banner.name.en}`);
    }
  });

  it("prepoznaje samo ključeve kataloga (ne ID slike, ne druge vrednosti)", () => {
    expect(isIgraBannerKey("okean")).toBe(true);
    for (const value of ["baner.okean", "Okean", "", "toString", null, undefined, 7]) expect(isIgraBannerKey(value), String(value)).toBe(false);
  });

  it("otključava se tačno na pragu nivoa; loš nivo je nivo 1", () => {
    expect(isBannerUnlocked("laboratorija", 2)).toBe(false);
    expect(isBannerUnlocked("laboratorija", 3)).toBe(true);
    expect(isBannerUnlocked("okean", 10)).toBe(false);
    expect(isBannerUnlocked("okean", 12)).toBe(true);
    expect(isBannerUnlocked("sveska", 1)).toBe(true);
    expect(isBannerUnlocked("sveska", Number.NaN)).toBe(true);
    expect(isBannerUnlocked("laboratorija", Number.NaN)).toBe(false);
  });

  it("prikazuje se samo izbor koji je u katalogu i i dalje otključan", () => {
    expect(resolveBanner(undefined, 12)).toBeNull();
    expect(resolveBanner(null, 12)).toBeNull();
    expect(resolveBanner("zlato", 12)).toBeNull();
    expect(resolveBanner("studio", 5)).toBe("studio");
    // XP je pao ispod praga: podrazumevani, ali izbor se ne briše (to radi pozivalac).
    expect(resolveBanner("studio", 4)).toBeNull();
    const keys: IgraBannerKey[] = IGRA_BANNERS.map((banner) => banner.key);
    for (const key of keys) expect(resolveBanner(key, 12)).toBe(key);
  });

  it("katalog ne uvozi manifest slika (ulazi u Convex bundle)", () => {
    const source = readFileSync(join(process.cwd(), "lib/igra-banners.ts"), "utf8");
    expect(source).not.toMatch(/from "\.\/igra-art"|manifest\.json/);
  });
});
