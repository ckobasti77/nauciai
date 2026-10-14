import Link from "next/link";

import { IgraHero } from "@/components/igra/igra-hero";
import { IgraLik } from "@/components/igra/igra-lik";
import { IGRA_CREA_COPY } from "@/lib/igra-copy";
import { creaLikForArea } from "@/lib/igra-crea";
import type { CreaArea } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

export type CreaStartTile = { area: CreaArea; href: string; label: string; sub: string };

/**
 * Ulaz u Creu (K15, plan K14 §1): scena radionice i tri velika ulaza, svaki sa svojim
 * likom (Piksi slika, Kadar video, Eho zvuk). Naslov „Šta praviš danas?" je pozdrav
 * heroja, pa ostaje `h2` sa istim `id` na koji se poziva sekcija ulaza.
 *
 * Jedan okvir (kartica heroja); pločice se odvajaju površinom i tankom linijom.
 */
export function CreaStartHero({
  locale,
  title,
  titleId,
  tiles,
}: {
  locale: Locale;
  title: string;
  titleId: string;
  tiles: ReadonlyArray<CreaStartTile>;
}) {
  return (
    <IgraHero art="scena.crea-radionica" locale={locale} greeting={title} greetingAs="h2" greetingId={titleId}>
      <p id={`${titleId}-tiles`} className="type-eyebrow text-muted">
        {IGRA_CREA_COPY.tilesLabel[locale]}
      </p>
      <ul aria-labelledby={`${titleId}-tiles`} data-motion="card" className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((tile) => (
          <li key={tile.area} className="min-w-0">
            <Link
              href={tile.href}
              className="group flex h-full min-h-32 flex-col items-center justify-center gap-1.5 surface-inset bg-paper px-1.5 py-3 text-center shadow-[inset_0_0_0_1px_var(--shadow-hard-14)] transition-[background-color,translate] duration-200 hover:bg-igra-marker-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-px motion-reduce:transition-none"
            >
              <IgraLik
                lik={creaLikForArea(tile.area)}
                poza="mase"
                size={72}
                decorative
                className="transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none"
              />
              <span className="type-h4 text-ink">{tile.label}</span>
              <span className="type-caption font-bold leading-tight text-muted">{tile.sub}</span>
            </Link>
          </li>
        ))}
      </ul>
    </IgraHero>
  );
}
