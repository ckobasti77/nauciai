import Link from "next/link";
import { LibraryBig } from "lucide-react";
import type { ReactNode } from "react";

import { CREA_HISTORY_COPY } from "@/lib/crea-copy";
import { CREA_LIBRARY_COPY } from "@/lib/crea-library-copy";
import { CREA_AREA_META, type CreaArea } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

/**
 * Desna kolona radionice: postojeća galerija, filtrirana na oblast. Na početnom
 * ekranu (bez oblasti) pokazuje sve radove.
 */
export function CreaHistory({
  locale,
  area,
  libraryHref,
  children,
}: {
  locale: Locale;
  area: CreaArea | null;
  /** Biblioteka (K16): svi radovi preko cele širine - pretraga, filteri, masovne akcije. */
  libraryHref?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="crea-history-title" className="min-w-0">
      <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-x-3">
        <h2 id="crea-history-title" className="type-h3 text-ink">
          {area
            ? `${CREA_HISTORY_COPY.title[locale]} · ${CREA_AREA_META[area].label[locale]}`
            : CREA_HISTORY_COPY.allTitle[locale]}
        </h2>
        {libraryHref ? (
          <Link
            href={libraryHref}
            scroll={false}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-black text-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <LibraryBig aria-hidden="true" className="size-4" />
            {CREA_LIBRARY_COPY.open[locale]}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Tiho prazno stanje uske kolone - scena već kaže šta sad da uradiš. */
export function CreaHistoryEmpty({
  locale,
  area,
  guest = false,
}: {
  locale: Locale;
  area: CreaArea | null;
  guest?: boolean;
}) {
  return (
    <p className="border-t border-line pt-3 type-body-sm font-semibold text-muted">
      {guest
        ? CREA_HISTORY_COPY.guest[locale]
        : area
          ? CREA_HISTORY_COPY.empty[locale]
          : CREA_HISTORY_COPY.emptyAll[locale]}
    </p>
  );
}
