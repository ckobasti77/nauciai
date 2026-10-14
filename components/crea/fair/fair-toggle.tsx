"use client";

import { Infinity as InfinityIcon } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_FAIR_COPY } from "@/lib/crea-fair-copy";
import type { Locale } from "@/lib/i18n";

/**
 * Prekidač „Neograničeno · spori red" (K28, C8). Vidi se samo uz Premium plan,
 * upaljen fleg `crea_fair_unlimited` i jeftin model sa spiska; server ponovo
 * proverava sve (`creaFairDb.assertFairUnlimited`). Isti oblik kao noćna tura.
 */
export function FairToggle({
  locale,
  on,
  onChange,
  left,
  monthly,
  disabled = false,
}: {
  locale: Locale;
  on: boolean;
  onChange: (next: boolean) => void;
  left: number;
  monthly: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled || left === 0}
      onClick={() => onChange(!on)}
      title={fillCopy(CREA_FAIR_COPY.toggleTitle[locale], { monthly })}
      className={cn(
        "igra-press igra-shadow igra-depth-2 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40",
        on ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2",
          on ? "border-yellow bg-yellow" : "border-ink bg-paper",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 size-3 rounded-full bg-ink transition-transform duration-200 motion-reduce:transition-none",
            on ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
      <InfinityIcon aria-hidden="true" className={cn("size-4", on ? "text-yellow" : "text-ink")} />
      <span>{CREA_FAIR_COPY.toggle[locale]}</span>
      <span className={cn("font-bold", on ? "text-paper-strong/85" : "text-muted")}>
        {fillCopy(CREA_FAIR_COPY.toggleHint[locale], { left })}
      </span>
    </button>
  );
}
