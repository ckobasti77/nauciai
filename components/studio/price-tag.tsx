"use client";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { priceDeltaLabel, type PriceDelta } from "@/lib/studio-params";

/**
 * Značka uz kontrolu koja menja cenu (STUDIO-CATALOG-V4 1.2): `+12 kr`, `×2`,
 * `ista cena`. Razlika dolazi iz `computeCredits`-a nad hipotetičkom vrednošću
 * te opcije, pa korisnik vidi šta ga skuplja PRE nego što klikne.
 *
 * `PriceDelta` se računa u `lib/studio-params.ts` - ova komponenta ga samo
 * ispisuje, i zato test cene ne mora da renderuje ništa.
 */
export function PriceTag({
  delta,
  locale,
  className,
}: {
  delta: PriceDelta;
  locale: Locale;
  className?: string;
}) {
  const label = priceDeltaLabel(delta, locale);
  if (label === null) return null;

  const cheaper = delta.kind === "delta" && delta.credits < 0;
  const neutral = delta.kind === "same";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border-2 border-ink px-2 py-0.5 text-[11px] font-black uppercase leading-4 tracking-wide",
        neutral && "bg-white text-muted",
        cheaper && "bg-white text-ink",
        !neutral && !cheaper && "bg-yellow text-ink",
        className,
      )}
    >
      {label}
    </span>
  );
}
