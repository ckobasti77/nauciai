import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n";
import {
  alternatesFor,
  canonicalSegment,
  internalPath,
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
    ["sr", "/studio-terms", "/uslovi-studio"],
    ["sr", "/app/classroom", "/app/classroom"],
    ["en", "/app/classroom", "/en/app/classroom"],
    ["sr", "/studio/krediti", "/studio/krediti"],
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

describe("alternatesFor", () => {
  it("daje canonical za locale + languages (sr/en/x-default)", () => {
    const origin = "https://nauciai.com";
    expect(alternatesFor(origin, "/studio", "sr")).toEqual({
      canonical: "https://nauciai.com/studio",
      languages: {
        sr: "https://nauciai.com/studio",
        en: "https://nauciai.com/en/studio",
        "x-default": "https://nauciai.com/studio",
      },
    });
    expect(alternatesFor(origin, "/studio", "en").canonical).toBe("https://nauciai.com/en/studio");
  });
});
