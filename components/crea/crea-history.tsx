"use client";

import Link from "next/link";
import { LibraryBig } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/components/ui/primitives";
import { CREA_HISTORY_COPY } from "@/lib/crea-copy";
import { CREA_BOARD_COPY } from "@/lib/crea-fair-copy";
import { CREA_LIBRARY_COPY } from "@/lib/crea-library-copy";
import { CREA_AREA_META, type CreaArea } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

/**
 * Desna kolona radionice: postojeća galerija, filtrirana na oblast. Na početnom
 * ekranu (bez oblasti) pokazuje sve radove. Uz `board` (K28, U13) kolona ima dva
 * taba - Istorija i Tabla - pa je tabla na ekranu zajedno sa composerom.
 */
export function CreaHistory({
  locale,
  area,
  libraryHref,
  board,
  children,
}: {
  locale: Locale;
  area: CreaArea | null;
  /** Biblioteka (K16): svi radovi preko cele širine - pretraga, filteri, masovne akcije. */
  libraryHref?: string;
  /** Tabla (K28): drugi tab kolone. */
  board?: ReactNode;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<"istorija" | "tabla">("istorija");
  const tabs = board ? (
    <div role="tablist" aria-label={CREA_BOARD_COPY.title[locale]} className="mb-3 inline-flex rounded-full border-2 border-ink bg-paper-strong p-0.5">
      {(["istorija", "tabla"] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`crea-side-tab-${id}`}
          aria-selected={tab === id}
          aria-controls="crea-side-panel"
          onClick={() => setTab(id)}
          className={cn(
            "inline-flex min-h-10 items-center rounded-full px-4 text-xs font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            tab === id ? "bg-ink text-paper-strong" : "text-ink",
          )}
        >
          {id === "istorija" ? CREA_BOARD_COPY.tabHistory[locale] : CREA_BOARD_COPY.tabBoard[locale]}
        </button>
      ))}
    </div>
  ) : null;

  if (board && tab === "tabla") {
    return (
      <section aria-label={CREA_BOARD_COPY.title[locale]} className="min-w-0">
        {tabs}
        <div id="crea-side-panel" role="tabpanel" aria-labelledby="crea-side-tab-tabla">
          {board}
        </div>
      </section>
    );
  }

  const history = (
    <>
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
    </>
  );

  return (
    <section aria-labelledby="crea-history-title" className="min-w-0">
      {tabs}
      {board ? (
        <div id="crea-side-panel" role="tabpanel" aria-labelledby="crea-side-tab-istorija">
          {history}
        </div>
      ) : (
        history
      )}
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
