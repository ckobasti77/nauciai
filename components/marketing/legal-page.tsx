import Link from "next/link";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { BrandMark, HandUnderline, Panel } from "@/components/ui/primitives";
import type { LegalDocument } from "@/lib/legal-copy";
import { PRIVACY_POLICY, STUDIO_TERMS } from "@/lib/legal-copy";
import { dictionary, otherLocale, type Locale, withLocale } from "@/lib/i18n";

/**
 * Jedan izgled za oba pravna dokumenta (X7). Dva `page.tsx`-a samo biraju koji
 * `LegalDocument` prosleđuju - tekst je podatak, a stranica je njegov prikaz.
 * Prati marketing stranice: `sketch-grid` pozadina, `BrandMark`, `Panel`,
 * `HandUnderline`, prekidač jezika u zaglavlju. Radijusi su samo iz četiri
 * sankcionisana stepena: `Panel` je card, sadržaj u njemu inset, prekidač pill.
 */
export function LegalPage({ locale, document }: { locale: Locale; document: LegalDocument }) {
  const nextLocale = otherLocale(locale);
  // Uslovi i privatnost su jedan drugom jedina prava unakrsna referenca, pa
  // svaki od dva dokumenta u podnožju vodi na onaj drugi.
  const sibling = document.path === STUDIO_TERMS.path ? PRIVACY_POLICY : STUDIO_TERMS;

  return (
    <main data-motion="page" className="sketch-grid min-h-screen bg-paper px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <BrandMark href={withLocale(locale)} label={dictionary[locale].appName} />
          <div className="flex items-center gap-2">
            <ThemeToggle locale={locale} />
          <Link
            href={withLocale(nextLocale, document.path)}
            className="rounded-full border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black"
          >
            {nextLocale.toUpperCase()}
          </Link>
          </div>
        </div>

        <h1 className="mt-10 text-4xl font-black leading-tight text-ink md:text-5xl" data-motion="copy">
          {document.title[locale]}
        </h1>
        <HandUnderline className="mt-5" />
        <p className="mt-6 text-base font-bold leading-8 text-muted">{document.intro[locale]}</p>
        <p className="mt-3 text-sm font-extrabold uppercase tracking-wide text-muted">
          {document.updated[locale]}
        </p>

        <div className="mt-10 space-y-6">
          {document.sections.map((section) => (
            <Panel key={section.id} as="article" className="p-6">
              <h2 id={section.id} className="text-2xl font-black text-ink">
                {section.title[locale]}
              </h2>
              <div className="mt-4 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph.sr} className="text-base font-bold leading-7 text-muted">
                    {paragraph[locale]}
                  </p>
                ))}
              </div>
            </Panel>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-4 pb-10 text-sm font-extrabold">
          <Link href={withLocale(locale, sibling.path)} className="text-ink underline">
            {sibling.title[locale]}
          </Link>
          <Link href={withLocale(locale)} className="text-ink underline">
            {locale === "sr" ? "Nazad na početnu" : "Back home"}
          </Link>
        </div>
      </div>
    </main>
  );
}
