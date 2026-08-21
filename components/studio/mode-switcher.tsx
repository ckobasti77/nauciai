"use client";

import { useState } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { modeLabel, pruneFilesForMode, slotLabel, type InputSpec, type SlotFiles } from "@/lib/studio-slots";

/**
 * Prekidač ulaznih režima iznad forme (STUDIO-CATALOG-V4 sekcija 5). Vidljiv
 * je SAMO ako model ima više od jednog režima - jedan režim nije izbor nego
 * kontrola koja laže da nešto može drugačije.
 *
 * Prebacivanje menja endpoint (isti model), čisti slotove kojih u novom režimu
 * nema - uz tihu potvrdu šta je sklonjeno, jer fajl ne sme da nestane bez reči -
 * i time preračunava cenu, pošto cena zavisi i od režima (`modeMultipliers`).
 */
export function ModeSwitcher({
  spec,
  modes,
  value,
  onChange,
  files,
  onFilesChange,
  locale,
  disabled = false,
}: {
  spec: InputSpec;
  modes: string[];
  value: string;
  onChange: (mode: string) => void;
  files: SlotFiles;
  onFilesChange: (files: SlotFiles) => void;
  locale: Locale;
  disabled?: boolean;
}) {
  const [removed, setRemoved] = useState<string[]>([]);

  if (modes.length < 2) return null;

  function select(mode: string) {
    if (mode === value) return;
    const pruned = pruneFilesForMode(files, spec, mode);
    setRemoved(pruned.removed);
    if (pruned.removed.length > 0) onFilesChange(pruned.files);
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
                active ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5",
              )}
            >
              {modeLabel(mode, locale)}
            </button>
          );
        })}
      </div>

      {removed.length > 0 ? (
        <p role="status" className="mt-2 text-xs font-bold text-muted">
          {locale === "sr"
            ? `Ovaj režim ne koristi: ${removed.map((slot) => slotLabel(slot, locale).toLowerCase()).join(", ")}. Sklonjeno je iz forme.`
            : `This mode does not use: ${removed.map((slot) => slotLabel(slot, locale).toLowerCase()).join(", ")}. It was removed from the form.`}
        </p>
      ) : null}
    </div>
  );
}
