"use client";

import { Copy, X } from "lucide-react";

import { CREA_PICK_COPY } from "@/lib/crea-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Keš istih zahteva (Crea C4): korisnik je naručio TAČNO ono što već ima
 * (isti model, opis, podešavanja i fajlovi). Pre plaćanja dobija izbor -
 * otvori postojeći rad za 0 kr ili ipak napravi novu varijantu.
 *
 * Ovo je samostalan blok iznad composera, pa nosi svoj okvir (AGENTS.md).
 */
export function CreaCacheOffer({
  locale,
  newCredits,
  onOpen,
  onNew,
  onDismiss,
}: {
  locale: Locale;
  /** Cena nove varijante, kad je poznata. */
  newCredits: number | null;
  onOpen: () => void;
  onNew: () => void;
  onDismiss: () => void;
}) {
  const copy = CREA_PICK_COPY;

  return (
    <div
      role="status"
      className="surface-card relative mb-3 flex w-full max-w-[720px] flex-col gap-3 border-2 border-ink bg-paper-strong p-4 pr-12 shadow-[4px_4px_0_0_var(--shadow-hard-14)] sm:flex-row sm:items-center"
    >
      <Copy aria-hidden="true" className="hidden size-5 shrink-0 text-ink sm:block" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-ink">{copy.cacheTitle[locale]}</p>
        <p className="text-xs font-semibold text-muted">{copy.cacheBody[locale]}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="igra-press igra-shadow-ink inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {copy.cacheOpen[locale]}
        </button>
        <button
          type="button"
          onClick={onNew}
          className="igra-press igra-shadow igra-depth-2 inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper px-4 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {newCredits !== null
            ? `${copy.cacheNew[locale]} · ${newCredits} ${locale === "sr" ? "kr" : "cr"}`
            : copy.cacheNew[locale]}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={locale === "sr" ? "Zatvori" : "Close"}
        className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
