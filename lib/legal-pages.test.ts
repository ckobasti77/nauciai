import { isValidElement, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

// `next/image` traži `document` pri uvozu, a testovi se vrte u edge-runtime
// okruženju bez DOM-a. Zamena je prazna komponenta: ova stranica nema nijednu
// sliku osim logotipa u zaglavlju, pa mock ne skriva ništa što se proverava.
vi.mock("next/image", () => ({ default: () => null }));

import PrivacyPolicyRoute, {
  generateMetadata as privacyMetadata,
  generateStaticParams as privacyParams,
} from "@/app/[locale]/(marketing)/politika-privatnosti/page";
import StudioTermsRoute, {
  generateMetadata as termsMetadata,
  generateStaticParams as termsParams,
} from "@/app/[locale]/(marketing)/uslovi-studio/page";
import { locales } from "@/lib/i18n";
import { PRIVACY_POLICY, STUDIO_TERMS, type LegalDocument } from "@/lib/legal-copy";

/**
 * Stablo elemenata se spljošti u tekst: svaka komponenta koja je obična
 * funkcija se POZOVE, pa se rezultat obiđe dalje. To je dovoljno da se dokaže
 * ono zbog čega test postoji - da ruta prima `params` u obliku koji Next 16
 * daje (Promise), da se ceo dokument stvarno nadje u izlazu, i da na oba jezika
 * izlazi tekst TOG jezika. Sam HTML pravi `npm run build`, koji obe stranice
 * statički generiše iz `generateStaticParams`.
 */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node)) {
    if (typeof node.type === "function") {
      const render = node.type as (props: unknown) => ReactNode;
      return textOf(render(node.props));
    }
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

type LegalRoute = (args: { params: Promise<{ locale: string }> }) => Promise<ReactNode>;

const ROUTES: Array<[string, LegalRoute, LegalDocument]> = [
  ["uslovi-studio", StudioTermsRoute, STUDIO_TERMS],
  ["politika-privatnosti", PrivacyPolicyRoute, PRIVACY_POLICY],
];

describe("pravne stranice", () => {
  test("obe rute su statički generisane za oba jezika", () => {
    expect(termsParams()).toEqual(locales.map((locale) => ({ locale })));
    expect(privacyParams()).toEqual(locales.map((locale) => ({ locale })));
  });

  test("naslov stranice u metapodacima prati jezik rute", async () => {
    for (const locale of locales) {
      await expect(termsMetadata({ params: Promise.resolve({ locale }) })).resolves.toMatchObject({
        title: STUDIO_TERMS.title[locale],
      });
      await expect(privacyMetadata({ params: Promise.resolve({ locale }) })).resolves.toMatchObject({
        title: PRIVACY_POLICY.title[locale],
      });
    }
  });

  test("svaka ruta na oba jezika ispisuje SVE svoje klauzule na tom jeziku", async () => {
    for (const [name, route, document] of ROUTES) {
      for (const locale of locales) {
        const text = textOf(await route({ params: Promise.resolve({ locale }) }));

        expect(text, `${name}.${locale}.title`).toContain(document.title[locale]);
        expect(text, `${name}.${locale}.intro`).toContain(document.intro[locale]);
        for (const section of document.sections) {
          expect(text, `${name}.${locale}.${section.id}`).toContain(section.title[locale]);
          for (const paragraph of section.body) {
            expect(text, `${name}.${locale}.${section.id}`).toContain(paragraph[locale]);
          }
        }
      }
    }
  });

  test("srpska stranica ne ispisuje engleski tekst i obrnuto", async () => {
    const srpski = textOf(await StudioTermsRoute({ params: Promise.resolve({ locale: "sr" }) }));
    const engleski = textOf(await StudioTermsRoute({ params: Promise.resolve({ locale: "en" }) }));

    expect(srpski).not.toContain(STUDIO_TERMS.sections[0].title.en);
    expect(engleski).not.toContain(STUDIO_TERMS.sections[0].title.sr);
  });

  test("nepoznat jezik u URL-u pada na srpski umesto da pukne", async () => {
    const text = textOf(await StudioTermsRoute({ params: Promise.resolve({ locale: "de" }) }));
    expect(text).toContain(STUDIO_TERMS.title.sr);
  });
});
