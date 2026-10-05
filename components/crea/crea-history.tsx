import type { ReactNode } from "react";

import { CREA_HISTORY_COPY } from "@/lib/crea-copy";
import { CREA_AREA_META, type CreaArea } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

/**
 * Desna kolona radionice: postojeća galerija, filtrirana na oblast. Na početnom
 * ekranu (bez oblasti) pokazuje sve radove.
 */
export function CreaHistory({
  locale,
  area,
  children,
}: {
  locale: Locale;
  area: CreaArea | null;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="crea-history-title" className="min-w-0">
      <h2 id="crea-history-title" className="mb-3 flex min-h-11 items-center type-h3 text-ink">
        {area
          ? `${CREA_HISTORY_COPY.title[locale]} · ${CREA_AREA_META[area].label[locale]}`
          : CREA_HISTORY_COPY.allTitle[locale]}
      </h2>
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
