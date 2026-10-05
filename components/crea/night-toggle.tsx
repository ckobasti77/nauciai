"use client";

import { Moon } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { CREA_NIGHT_COPY, fillCopy } from "@/lib/crea-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Prekidač „Noćna tura — stiže do jutra, −X %" (Crea K08, C2). Vidi se samo kad
 * model u ovom režimu nudi noćnu turu (`creaNightCore.nightOptionFor`); cena koja
 * važi kad je upaljen stoji na dugmetu „Generiši", kao i svaka druga cena.
 */
export function NightToggle({
  locale,
  on,
  onChange,
  savingsPercent,
  disabled = false,
}: {
  locale: Locale;
  on: boolean;
  onChange: (next: boolean) => void;
  savingsPercent: number;
  disabled?: boolean;
}) {
  const copy = CREA_NIGHT_COPY;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      title={copy.toggleTitle[locale]}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-black shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        on ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink",
      )}
    >
      {/* Mali prekidač: vidi se da je stanje, ne radnja. */}
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2",
          on ? "border-yellow bg-yellow" : "border-ink bg-paper",
        )}
      >
        <span
          className={cn(
            // Unutar žute staze `--ink` je uvek tamnoplav (žuto ostrvo), pa je dugmence vidljivo u obe teme.
            "absolute left-0.5 size-3 rounded-full bg-ink transition-transform duration-200 motion-reduce:transition-none",
            on ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
      <Moon aria-hidden="true" className={cn("size-3.5", on ? "fill-yellow text-yellow" : "text-ink")} />
      <span>{copy.toggle[locale]}</span>
      {savingsPercent > 0 ? (
        <span className={cn("font-bold", on ? "text-paper-strong/85" : "text-muted")}>
          {fillCopy(copy.toggleHint[locale], { percent: savingsPercent })}
        </span>
      ) : null}
    </button>
  );
}
