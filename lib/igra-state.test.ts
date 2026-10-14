import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../public/brand/igra/manifest.json";
import { IGRA_STATE_COPY } from "./igra-state-copy";
import {
  IGRA_STATE_VARIANTS,
  igraErrorVariant,
  igraStateArt,
  igraStateBody,
  igraStateCta,
  igraStateRole,
  igraStateTitle,
} from "./igra-state";

/**
 * Stanja unutar aplikacije (K23): slika, tekst i uloga po varijanti, i da granice greške
 * i 404 stvarno koriste zajedničku komponentu umesto golog teksta.
 */

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const assets = manifest.assets as Record<string, { ready: boolean } | undefined>;

describe("IgraState: podaci", () => {
  it("svaka varijanta ima spremnu sliku iz manifesta", () => {
    for (const variant of IGRA_STATE_VARIANTS) {
      expect(assets[igraStateArt(variant)]?.ready, variant).toBe(true);
    }
  });

  it("svaka varijanta ima sr i en naslov i rečenicu, bez uzvičnika i bez krivice", () => {
    for (const variant of IGRA_STATE_VARIANTS) {
      for (const locale of ["sr", "en"] as const) {
        const title = igraStateTitle(variant, locale);
        const body = igraStateBody(variant, locale);
        expect(title.length, `${variant} ${locale}`).toBeGreaterThan(0);
        expect(body.length, `${variant} ${locale}`).toBeGreaterThan(0);
        expect(`${title}${body}`, `${variant} ${locale}`).not.toContain("!");
        expect(`${title}${body}`.toLowerCase(), `${variant} ${locale}`).not.toMatch(/your fault|tvoja greška|pogrešio|pogrešila/);
      }
    }
  });

  it("dugme imaju samo greška, 404 i offline", () => {
    const withCta = IGRA_STATE_VARIANTS.filter((variant) => igraStateCta(variant, "sr") !== null);
    expect(withCta).toEqual(["greska", "404", "offline"]);
    for (const variant of withCta) expect(igraStateCta(variant, "en")).toBeTruthy();
    expect(Object.keys(IGRA_STATE_COPY).sort()).toEqual([...IGRA_STATE_VARIANTS].sort());
  });

  it("uloge: greška je alert, čekanje i veza su status, ostalo je sadržaj", () => {
    expect(igraStateRole("greska")).toBe("alert");
    expect(igraStateRole("ucitavanje")).toBe("status");
    expect(igraStateRole("offline")).toBe("status");
    expect(igraStateRole("prazno")).toBeUndefined();
    expect(igraStateRole("404")).toBeUndefined();
  });

  it("bez mreže greška postaje offline", () => {
    expect(igraErrorVariant(true)).toBe("greska");
    expect(igraErrorVariant(false)).toBe("offline");
  });
});

describe("IgraState: ugrađenost", () => {
  it("granice greške u aplikaciji i Crei koriste IgraErrorState, bez ručnog okvira", () => {
    for (const file of [
      "app/[locale]/app/error.tsx",
      "app/[locale]/app/community/error.tsx",
      "app/[locale]/app/messages/error.tsx",
      "app/[locale]/studio/(shell)/app/error.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain("IgraErrorState");
      expect(source, file).not.toContain("border-2");
    }
  });

  it("404 u aplikaciji je u ljusci: not-found + hvatač pod /app, javni 404 netaknut", () => {
    expect(read("app/[locale]/app/not-found.tsx")).toContain('variant="404"');
    expect(read("app/[locale]/app/[...notFound]/page.tsx")).toContain("notFound()");
    expect(read("app/[locale]/not-found.tsx")).toContain("notFoundContent");
  });

  it("traka bez veze stoji u ljusci i crta samo kad nema mreže", () => {
    expect(read("components/app/app-shell.tsx")).toContain("IgraOfflineNotice");
    expect(read("components/igra/igra-offline-notice.tsx")).toContain("online ? null");
    expect(read("components/igra/igra-offline-notice.tsx")).toContain("ssr: false");
  });

  it("IgraState, granica greške i traka ne vuku GSAP, three ni nove pakete", () => {
    for (const file of ["components/igra/igra-state.tsx", "components/igra/igra-error-state.tsx", "components/igra/igra-offline-notice.tsx", "components/igra/igra-offline-bar.tsx", "components/igra/use-online.ts"]) {
      expect(read(file), file).not.toMatch(/gsap|three/);
    }
  });
});
