import Link from "next/link";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { SectionMarginalia } from "@/components/marketing/section-marginalia";
import { BrandMark, HandUnderline, Panel } from "@/components/ui/primitives";
import type { LegalDocument } from "@/lib/legal-copy";
import { PRIVACY_POLICY, STUDIO_TERMS } from "@/lib/legal-copy";
import { dictionary, otherLocale, type Locale, withLocale } from "@/lib/i18n";

/**
 * Jedan izgled za oba pravna dokumenta (X7). Dva `page.tsx`-a samo biraju koji
 * `LegalDocument` prosleđuju - tekst je podatak, a stranica je njegov prikaz.
 * Prati marketing stranice: `sketch-grid` pozadina, `BrandMark`, `Panel`,
 * `HandUnderline`, prekidač jezika u zaglavlju. Radijusi su samo iz četiri
 * sankcionisana stepena: `Panel` je card, sadržaj u njemu inset, prekidač media (8px).
 *
 * Naslovi (h1/h2) ostaju na `font-black` skali koju već koriste marketing-page.tsx
 * i /courses/[courseSlug] (živi-papir reference), NE `type-display` + `font-display`:
 * to poslednje je u ostatku sajta rezervisano za kicker fraze i završni CTA banner,
 * a rukom-pisan Patrick Hand font preko naslova ugovora bi delovao neozbiljno za
 * pravni tekst. Telo pasusa ide na `type-reading` (prored 1.85) + `type-measure`
 * (68ch) - isti par koji već nosi telo lekcije u `course-player.tsx`.
 */
export function LegalPage({ locale, document }: { locale: Locale; document: LegalDocument }) {
  const nextLocale = otherLocale(locale);
  // Uslovi i privatnost su jedan drugom jedina prava unakrsna referenca, pa
  // svaki od dva dokumenta u podnožju vodi na onaj drugi.
  const sibling = document.path === STUDIO_TERMS.path ? PRIVACY_POLICY : STUDIO_TERMS;
  const tocLabel = locale === "sr" ? "Sadržaj" : "Contents";
  const tocAriaLabel = locale === "sr" ? "Sadržaj dokumenta" : "Table of contents";

  return (
    <main data-motion="page" className="sketch-grid min-h-screen bg-paper px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl lg:max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <BrandMark href={withLocale(locale)} label={dictionary[locale].appName} />
          <div className="flex items-center gap-2">
            <ThemeToggle locale={locale} />
            <Link
              href={withLocale(nextLocale, document.path)}
              className="inline-flex min-h-11 items-center rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {nextLocale.toUpperCase()}
            </Link>
          </div>
        </div>

        <div className="mt-10 max-w-3xl">
          <h1 className="text-4xl font-black leading-tight text-ink md:text-5xl" data-motion="copy">
            {document.title[locale]}
          </h1>
          <HandUnderline className="mt-5" />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <SectionMarginalia
              variant="spark"
              className="hidden h-6 w-6 shrink-0 text-yellow sm:block"
            />
            <span className="inline-flex items-center rounded-full border-2 border-ink bg-yellow px-3 py-1.5 text-xs font-black uppercase tracking-wide text-ink">
              {document.updated[locale]}
            </span>
          </div>
          <p className="mt-6 type-reading type-measure text-muted">{document.intro[locale]}</p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_240px]">
          <div className="space-y-6">
            {document.sections.map((section) => (
              <Panel key={section.id} as="article" className="p-6 sm:p-8">
                <h2 id={section.id} className="scroll-mt-6 text-2xl font-black leading-tight text-ink">
                  {section.title[locale]}
                </h2>
                <div className="mt-4 space-y-4">
                  {section.body.map((paragraph) => (
                    <p key={paragraph.sr} className="type-reading type-measure text-muted">
                      {paragraph[locale]}
                    </p>
                  ))}
                </div>
              </Panel>
            ))}
          </div>

          <aside className="hidden lg:block">
            <nav aria-label={tocAriaLabel} className="sticky top-8 flex flex-col gap-1 border-l-2 border-line pl-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">{tocLabel}</p>
              <ul className="mt-2 flex flex-col">
                {document.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="flex min-h-11 items-center text-sm font-extrabold leading-snug text-muted underline decoration-transparent underline-offset-4 transition hover:text-ink hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      {section.title[locale]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>

        <div className="mt-10 flex flex-wrap gap-4 pb-10 text-sm font-extrabold">
          <Link
            href={withLocale(locale, sibling.path)}
            className="inline-flex min-h-11 items-center text-ink underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {sibling.title[locale]}
          </Link>
          <Link
            href={withLocale(locale)}
            className="inline-flex min-h-11 items-center text-ink underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {locale === "sr" ? "Nazad na početnu" : "Back home"}
          </Link>
        </div>
      </div>
    </main>
  );
}
