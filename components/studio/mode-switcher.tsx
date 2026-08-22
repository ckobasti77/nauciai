"use client";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { modeLabel } from "@/lib/studio-slots";

/**
 * Prekidač ulaznih režima iznad forme (STUDIO-CATALOG-V4 sekcija 5). Vidljiv
 * je SAMO ako model ima više od jednog režima - jedan režim nije izbor nego
 * kontrola koja laže da nešto može drugačije.
 *
 * Prebacivanje menja endpoint (isti model), čisti slotove kojih u novom režimu
 * nema - uz tihu potvrdu šta je sklonjeno, jer fajl ne sme da nestane bez reči -
 * i time preračunava cenu, pošto cena zavisi i od režima (`modeMultipliers`).
 * Čišćenje i potvrda žive u composeru (`switchMode`, SP2), jer režim menjaju
 * i traka sposobnosti i `+` dugme - jedan put za sva tri.
 */
export function ModeSwitcher({
  modes,
  value,
  onChange,
  locale,
  disabled = false,
}: {
  modes: string[];
  value: string;
  onChange: (mode: string) => void;
  locale: Locale;
  disabled?: boolean;
}) {
  if (modes.length < 2) return null;

  function select(mode: string) {
    if (mode === value) return;
    onChange(mode);
  }

  return (
    <div>
      <div
        role="group"
        aria-label={locale === "sr" ? "Šta daješ modelu" : "What you give the model"}
        className="surface-inset flex flex-wrap gap-1 border-2 border-ink bg-paper p-1"
      >
        {modes.map((mode) => {
          const active = mode === value;

          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => select(mode)}
              className={cn(
                "rounded-full border-2 border-ink px-3 py-1.5 text-sm font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60",
                active ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink hover:-translate-y-0.5",
              )}
            >
              {modeLabel(mode, locale)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
