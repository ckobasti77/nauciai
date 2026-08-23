"use client";

import { CreditIcon } from "@/components/studio/credit-icon";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { priceDeltaLabel, priceDeltaValue, type PriceDelta } from "@/lib/studio-params";

/**
 * Značka uz kontrolu koja menja cenu (STUDIO-CATALOG-V4 1.2): `+12`, `×2`,
 * `ista cena` sa ikonicom kredita. Razlika dolazi iz `computeCredits`-a nad hipotetičkom vrednošću
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
  const fullLabel = priceDeltaLabel(delta, locale);
  if (fullLabel === null) return null;

  const cheaper = delta.kind === "delta" && delta.credits < 0;
  const neutral = delta.kind === "same";
  const value = priceDeltaValue(delta, locale);

  return (
    <span
      aria-label={fullLabel}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-ink px-2 py-0.5 text-[11px] font-black uppercase leading-4 tracking-wide",
        neutral && "bg-paper-strong text-muted",
        cheaper && "bg-paper-strong text-ink",
        !neutral && !cheaper && "bg-yellow text-ink",
        className,
      )}
    >
      <span>{value}</span>
      {delta.kind === "delta" ? <CreditIcon className="size-3" /> : null}
    </span>
  );
}
