import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n";
import {
  alternatesFor,
  canonicalSegment,
  internalPath,
  needsInternalRewrite,
  parsePath,
  publicSegment,
  toPublicPath,
} from "@/lib/routes";

/** Kanonski javni URL za sirovu putanju: isto što `withLocale(...parsePath(p))` daje. */
function publicOf(pathname: string): string {
  const { locale, canonicalPath } = parsePath(pathname);
  return toPublicPath(locale, canonicalPath);
}

const CANONICALS = ["courses", "community", "studio", "pricing", "privacy-policy", "studio-terms"] as const;

describe("parsePath", () => {
  it.each<[string, Locale, string]>([
    ["/", "sr", "/"],
    ["/sr", "sr", "/"],
    ["/sr/", "sr", "/"],
    ["/kursevi", "sr", "/courses"],
    ["/courses", "sr", "/courses"],
    ["/sr/courses", "sr", "/courses"],
    ["/kursevi/video-audio-ai", "sr", "/courses/video-audio-ai"],
    ["/zajednica/neki-slug", "sr", "/community/neki-slug"],
    ["/pretplata", "sr", "/pricing"],
    ["/pricing", "sr", "/pricing"],
    ["/en", "en", "/"],
    ["/en/courses", "en", "/courses"],
    ["/en/kursevi", "en", "/courses"],
    ["/en/pretplata", "en", "/pricing"],
    ["/en/politika-privatnosti", "en", "/privacy-policy"],
    ["/politika-privatnosti", "sr", "/privacy-policy"],
    ["/app/classroom", "sr", "/app/classroom"],
    ["/sr/app/classroom", "sr", "/app/classroom"],
    ["/en/app/classroom", "en", "/app/classroom"],
    ["/studio", "sr", "/studio"],
    ["/en/studio", "en", "/studio"],
    // Crea: javni slug `crea` vodi na kanonski `studio`; stari `uslovi-studio` je alias.
    ["/crea", "sr", "/studio"],
    ["/crea/app/m/abc", "sr", "/studio/app/m/abc"],
    ["/en/crea/krediti", "en", "/studio/krediti"],
    ["/uslovi-crea", "sr", "/studio-terms"],
    ["/uslovi-studio", "sr", "/studio-terms"],
    ["/en/crea-terms", "en", "/studio-terms"],
    ["/en/studio-terms", "en", "/studio-terms"],
    ["/sign-in?next=%2Fapp", "sr", "/sign-in"],
    ["/app/billing?plan=premium", "sr", "/app/billing"],
    ["/nepostojeca-ruta", "sr", "/nepostojeca-ruta"],
    // `/en` samo kao ceo prvi segment je locale; `/english` nije.
    ["/english", "sr", "/english"],
  ])("parses %s", (input, locale, canonicalPath) => {
    expect(parsePath(input)).toEqual({ locale, canonicalPath });
  });
});

describe("toPublicPath", () => {
  it.each<[Locale, string, string]>([
    ["sr", "/", "/"],
    ["sr", "", "/"],
    ["en", "/", "/en"],
    ["en", "", "/en"],
    ["sr", "/courses", "/kursevi"],
    ["en", "/courses", "/en/courses"],
    ["sr", "/courses/video-audio-ai", "/kursevi/video-audio-ai"],
    ["sr", "/community/neki-slug", "/zajednica/neki-slug"],
    ["sr", "/pricing", "/pretplata"],
    ["en", "/pricing", "/en/pricing"],
    ["sr", "/privacy-policy", "/politika-privatnosti"],
    ["sr", "/studio-terms", "/uslovi-crea"],
    ["en", "/studio-terms", "/en/crea-terms"],
    ["sr", "/studio", "/crea"],
    ["en", "/studio/app", "/en/crea/app"],
    ["sr", "/app/classroom", "/app/classroom"],
    ["en", "/app/classroom", "/en/app/classroom"],
    ["sr", "/studio/krediti", "/crea/krediti"],
    // Query/hash preživljavaju, prvi segment prevodi se; auth-utility ruta se ne prevodi.
    ["sr", "/sign-in?next=%2Fapp", "/sign-in?next=%2Fapp"],
    ["sr", "/app/billing?plan=premium", "/app/billing?plan=premium"],
    ["sr", "/courses#cta", "/kursevi#cta"],
  ])("toPublicPath(%s, %s)", (locale, canonicalPath, expected) => {
    expect(toPublicPath(locale, canonicalPath)).toBe(expected);
  });
});

describe("internalPath", () => {
  it.each<[Locale, string, string]>([
    ["sr", "/", "/sr"],
    ["en", "/", "/en"],
    ["sr", "/courses", "/sr/courses"],
    ["sr", "/app/classroom", "/sr/app/classroom"],
    ["en", "/courses", "/en/courses"],
  ])("internalPath(%s, %s)", (locale, canonicalPath, expected) => {
    expect(internalPath(locale, canonicalPath)).toBe(expected);
  });
});

describe("kanonizacija (308) — publicOf != input znači redirect", () => {
  it.each<[string, string, boolean]>([
    ["/", "/", false],
    ["/sr", "/", true],
    ["/sr/", "/", true],
    ["/kursevi", "/kursevi", false],
    ["/courses", "/kursevi", true],
    ["/sr/courses", "/kursevi", true],
    ["/pretplata", "/pretplata", false],
    ["/pricing", "/pretplata", true],
    ["/en", "/en", false],
    ["/en/courses", "/en/courses", false],
    ["/en/kursevi", "/en/courses", true],
    ["/en/pretplata", "/en/pricing", true],
    ["/en/politika-privatnosti", "/en/privacy-policy", true],
    ["/politika-privatnosti", "/politika-privatnosti", false],
    ["/app/classroom", "/app/classroom", false],
    ["/sr/app/classroom", "/app/classroom", true],
    ["/en/app/classroom", "/en/app/classroom", false],
    ["/nepostojeca-ruta", "/nepostojeca-ruta", false],
    // Crea (K02): stari Studio URL-ovi idu 308 na nove, query/hash ostaju u proxy-ju.
    ["/studio", "/crea", true],
    ["/studio/app", "/crea/app", true],
    ["/studio/app/m/abc", "/crea/app/m/abc", true],
    ["/studio/krediti", "/crea/krediti", true],
    ["/sr/studio/app", "/crea/app", true],
    ["/en/studio", "/en/crea", true],
    ["/en/studio/app", "/en/crea/app", true],
    ["/uslovi-studio", "/uslovi-crea", true],
    ["/sr/uslovi-studio", "/uslovi-crea", true],
    ["/en/studio-terms", "/en/crea-terms", true],
    ["/en/uslovi-studio", "/en/crea-terms", true],
    ["/crea", "/crea", false],
    ["/crea/app", "/crea/app", false],
    ["/crea/app/m/abc", "/crea/app/m/abc", false],
    ["/crea/krediti", "/crea/krediti", false],
    ["/uslovi-crea", "/uslovi-crea", false],
    ["/en/crea", "/en/crea", false],
    ["/en/crea-terms", "/en/crea-terms", false],
  ])("%s -> %s", (input, expectedPublic, expectRedirect) => {
    const publicPath = publicOf(input);
    expect(publicPath).toBe(expectedPublic);
    expect(publicPath !== input).toBe(expectRedirect);
  });
});

describe("invarijante", () => {
  const inputs = [
    "/", "/sr", "/kursevi", "/courses", "/sr/courses", "/zajednica/x", "/pretplata",
    "/pricing", "/en", "/en/courses", "/en/kursevi", "/app/classroom", "/sr/app/classroom",
    "/politika-privatnosti", "/en/politika-privatnosti", "/studio", "/nepostojeca",
    "/crea/app", "/studio/app/m/x", "/uslovi-studio", "/en/studio-terms", "/en/crea",
  ];

  it("kanonizacija je idempotentna (308 ne može u petlju)", () => {
    for (const p of inputs) {
      const once = publicOf(p);
      expect(publicOf(once)).toBe(once);
    }
  });

  it("nijedan javni slug se ne deli između dva kanonska segmenta", () => {
    const srSlugs = CANONICALS.map((c) => publicSegment(c, "sr"));
    const enSlugs = CANONICALS.map((c) => publicSegment(c, "en"));
    expect(new Set(srSlugs).size).toBe(srSlugs.length);
    expect(new Set(enSlugs).size).toBe(enSlugs.length);
    for (const c of CANONICALS) {
      expect(canonicalSegment(c)).toBe(c);
      expect(canonicalSegment(publicSegment(c, "sr"))).toBe(c);
      expect(canonicalSegment(publicSegment(c, "en"))).toBe(c);
    }
  });

  it("round-trip: parsePath(toPublicPath(locale, '/'+seg)) == { locale, '/'+seg }", () => {
    for (const seg of CANONICALS) {
      for (const locale of ["sr", "en"] as const) {
        expect(parsePath(toPublicPath(locale, `/${seg}`))).toEqual({ locale, canonicalPath: `/${seg}` });
      }
    }
  });
});

describe("needsInternalRewrite", () => {
  it.each<[Locale, string, string, boolean]>([
    // sr uvek: javni URL nema prefiks, folder je /sr/...
    ["sr", "/courses", "/kursevi", true],
    ["sr", "/studio/app", "/crea/app", true],
    ["sr", "/", "/", true],
    // en samo kad se slug razlikuje od foldera (Crea).
    ["en", "/courses", "/en/courses", false],
    ["en", "/app/classroom", "/en/app/classroom", false],
    ["en", "/", "/en", false],
    ["en", "/studio", "/en/crea", true],
    ["en", "/studio/app/m/abc", "/en/crea/app/m/abc", true],
    ["en", "/studio-terms", "/en/crea-terms", true],
  ])("%s %s (%s) -> %s", (locale, canonicalPath, pathname, expected) => {
    expect(needsInternalRewrite(locale, canonicalPath, pathname)).toBe(expected);
  });

  it("rewrite cilja interni folder `studio`", () => {
    expect(internalPath("en", parsePath("/en/crea/app").canonicalPath)).toBe("/en/studio/app");
    expect(internalPath("sr", parsePath("/crea/krediti").canonicalPath)).toBe("/sr/studio/krediti");
  });
});

describe("alternatesFor", () => {
  it("daje canonical za locale + languages (sr/en/x-default)", () => {
    const origin = "https://nauciai.com";
    expect(alternatesFor(origin, "/studio", "sr")).toEqual({
      canonical: "https://nauciai.com/crea",
      languages: {
        sr: "https://nauciai.com/crea",
        en: "https://nauciai.com/en/crea",
        "x-default": "https://nauciai.com/crea",
      },
    });
    expect(alternatesFor(origin, "/studio", "en").canonical).toBe("https://nauciai.com/en/crea");
  });
});
