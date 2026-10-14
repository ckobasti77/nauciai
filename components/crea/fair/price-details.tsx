"use client";

import { Banknote } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { formatDinars, formatEuros, rateNote } from "@/lib/crea-dinars";
import { CREA_PRICE_COPY } from "@/lib/crea-fair-copy";
import type { Locale } from "@/lib/i18n";

function Row({ label, credits, locale, strong = false }: { label: string; credits: number; locale: Locale; strong?: boolean }) {
  const unit = locale === "sr" ? "kr" : "cr";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className={cn("type-body-sm", strong ? "font-black text-ink" : "font-bold text-muted")}>{label}</dt>
      <dd className="text-right">
        <span className="font-mono text-sm font-black tabular-nums text-ink">
          {credits} {unit}
        </span>
        {credits > 0 ? (
          <span className="block text-xs font-bold tabular-nums text-muted">
            {formatEuros(credits, locale)} · {formatDinars(credits, locale)}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * Pošteni krediti (K28, U7): klik na „din" pokaže cenu ovog rada u evrima i
 * dinarima (kurs je konstanta sa datumom, `lib/crea-dinars.ts`), jeftinu probu
 * kad postoji, i koliko je danas potrošeno prema ličnom limitu.
 */
export function PriceDetails({
  locale,
  credits,
  draftCredits,
  spentToday,
  dailyLimit,
  creditsHref,
  opensDown = false,
}: {
  locale: Locale;
  credits: number | null;
  draftCredits: number | null;
  spentToday: number | null;
  dailyLimit: number | null;
  creditsHref: string;
  opensDown?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unit = locale === "sr" ? "kr" : "cr";

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        title={CREA_PRICE_COPY.open[locale]}
        className="igra-press igra-shadow igra-depth-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 py-1.5 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Banknote aria-hidden="true" className="size-4" />
        <span>{credits !== null && credits > 0 ? formatDinars(credits, locale) : "din"}</span>
        <span className="sr-only">{CREA_PRICE_COPY.open[locale]}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={CREA_PRICE_COPY.title[locale]}
          className={cn(
            "surface-card absolute left-0 z-40 w-[min(300px,calc(100vw-2rem))] border-2 border-ink bg-paper-strong p-3 text-ink shadow-[4px_4px_0_0_var(--shadow-hard)]",
            opensDown ? "top-full mt-2" : "bottom-full mb-2",
          )}
        >
          <p className="type-eyebrow-sm text-muted">{CREA_PRICE_COPY.title[locale]}</p>
          <dl className="mt-1 divide-y divide-line">
            {credits !== null ? (
              credits === 0 ? (
                <div className="py-1.5 type-body-sm font-black">{CREA_PRICE_COPY.free[locale]}</div>
              ) : (
                <Row label={CREA_PRICE_COPY.final[locale]} credits={credits} locale={locale} strong />
              )
            ) : null}
            {draftCredits !== null && credits !== null && draftCredits < credits ? (
              <div>
                <Row label={CREA_PRICE_COPY.draft[locale]} credits={draftCredits} locale={locale} />
                <p className="pb-1.5 text-xs font-semibold text-muted">{CREA_PRICE_COPY.draftHint[locale]}</p>
              </div>
            ) : null}
            {spentToday !== null ? (
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="type-body-sm font-bold text-muted">{CREA_PRICE_COPY.today[locale]}</dt>
                <dd className="text-right font-mono text-sm font-black tabular-nums">
                  {spentToday} {unit}
                  {dailyLimit !== null ? (
                    <span className="block font-sans text-xs font-bold text-muted">
                      {fillCopy(CREA_PRICE_COPY.limit[locale], { limit: dailyLimit })}
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-2 text-xs font-semibold text-muted">
            {rateNote(locale)}. {CREA_PRICE_COPY.rateHint[locale]}
          </p>
          {dailyLimit === null ? (
            <Link
              href={creditsHref}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-black text-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {CREA_PRICE_COPY.noLimit[locale]}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
