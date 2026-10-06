"use client";

import { ShieldAlert } from "lucide-react";

import { CREA_CHECK_COPY } from "@/lib/crea-fair-copy";
import { promptCheckAdvice } from "@/lib/crea-prompt-check";
import type { Locale } from "@/lib/i18n";

/** Kategorija iz greške `NEISPRAVAN_PROMPT:ZABRANJEN_POJAM:<kategorija>` (radionica je dopisuje). */
export function blockedCategoryOf(error: string | null): string | null {
  if (!error) return null;
  const match = /ZABRANJEN_POJAM:([a-z_]+)/.exec(error);
  return match ? match[1]! : null;
}

/**
 * Provera opisa pre plaćanja (K28, C7): server je odbio opis PRE rezervacije
 * kredita; ovde korisnik vidi zašto i kako da ga ispravi, na srpskom.
 */
export function PromptCheckCard({ locale, category, onClose }: { locale: Locale; category: string; onClose?: () => void }) {
  const advice = promptCheckAdvice(category);
  return (
    <div role="alert" className="surface-inset mt-2 border border-line bg-paper p-3 text-ink">
      <p className="flex items-center gap-1.5 text-xs font-black">
        <ShieldAlert aria-hidden="true" className="size-4 shrink-0" />
        {CREA_CHECK_COPY.title[locale]}
      </p>
      <dl className="mt-1.5 space-y-1.5 text-xs">
        <div>
          <dt className="font-black">{CREA_CHECK_COPY.why[locale]}</dt>
          <dd className="font-semibold text-muted">{advice.reason[locale]}</dd>
        </div>
        <div>
          <dt className="font-black">{CREA_CHECK_COPY.fix[locale]}</dt>
          <dd className="font-semibold text-muted">{advice.suggestion[locale]}</dd>
        </div>
      </dl>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="mt-2 inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {CREA_CHECK_COPY.close[locale]}
        </button>
      ) : null}
    </div>
  );
}
