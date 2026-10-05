"use client";

import { useId, type ReactNode } from "react";

import { useBrandKit } from "@/components/crea/brand-kit/use-brand-kit";
import { cn } from "@/components/ui/primitives";
import { CREA_SCENE_COLORS } from "@/lib/crea-editor-scene";
import type { Locale, LocalizedText } from "@/lib/i18n";

/**
 * Sitne kontrole panela editora (K10). Ivica `border-2` je ovde oznaka
 * kontrole (dugme, pilula, uzorak boje), ne okvir grupe - grupe se dele samo
 * tankom linijom (AGENTS.md, „jedan okvir po grupi").
 */

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        pressed ? "bg-ink text-paper-strong" : "bg-paper text-ink",
        FOCUS,
      )}
    >
      {children}
    </button>
  );
}

/** Pilula sa ikonom i tekstom (dodaj tekst, oblik...). */
export function PillButton({
  onClick,
  disabled,
  icon,
  children,
  pressed,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        pressed === true ? "border-ink bg-ink text-paper-strong" : pressed === false ? "border-ink/25 bg-paper text-ink hover:border-ink" : "border-ink bg-paper text-ink",
        FOCUS,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

const SWATCHES: ReadonlyArray<{ value: string; label: LocalizedText }> = [
  { value: CREA_SCENE_COLORS.mastilo, label: { sr: "Mastilo", en: "Ink" } },
  { value: CREA_SCENE_COLORS.zuta, label: { sr: "Žuta", en: "Yellow" } },
  { value: CREA_SCENE_COLORS.papir, label: { sr: "Papir", en: "Paper" } },
  { value: CREA_SCENE_COLORS.bela, label: { sr: "Bela", en: "White" } },
  { value: CREA_SCENE_COLORS.krem, label: { sr: "Krem", en: "Cream" } },
  { value: CREA_SCENE_COLORS.plava, label: { sr: "Plava", en: "Blue" } },
  { value: CREA_SCENE_COLORS.crvena, label: { sr: "Crvena", en: "Red" } },
  { value: CREA_SCENE_COLORS.zelena, label: { sr: "Zelena", en: "Green" } },
  { value: CREA_SCENE_COLORS.siva, label: { sr: "Siva", en: "Grey" } },
];

/** Paleta brenda kao okrugli uzorci + „svoja boja". Boje su podaci slike, ne tema interfejsa. */
export function ColorPicker({
  locale,
  legend,
  value,
  onChange,
  customLabel,
}: {
  locale: Locale;
  legend: string;
  value: string;
  onChange: (value: string) => void;
  customLabel: string;
}) {
  const customId = useId();
  // Boje brend kita (S38, K15) stoje prve, uz paletu, u svakom izboru boje.
  const brandColors = useBrandKit()?.colors ?? [];
  const swatches = [
    ...brandColors
      .filter((hex) => !SWATCHES.some((swatch) => swatch.value === hex))
      .map((hex) => ({ value: hex, label: { sr: `Brend ${hex}`, en: `Brand ${hex}` } })),
    ...SWATCHES,
  ];
  const known = swatches.some((swatch) => swatch.value === value);
  return (
    <fieldset className="min-w-0">
      <legend className="type-body-sm font-black text-ink">{legend}</legend>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {swatches.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            aria-label={swatch.label[locale]}
            title={swatch.label[locale]}
            aria-pressed={value === swatch.value}
            onClick={() => onChange(swatch.value)}
            className={cn(
              "grid size-11 place-items-center rounded-full border-2 transition motion-reduce:transition-none",
              value === swatch.value ? "border-ink" : "border-ink/25 hover:border-ink",
              FOCUS,
            )}
          >
            <span
              aria-hidden="true"
              className="block size-7 rounded-full shadow-[inset_0_0_0_1px_var(--shadow-hard-25)]"
              // Boja uzorka je podatak slike (HEX iz palete), ne boja interfejsa.
              style={{ backgroundColor: swatch.value }}
            />
          </button>
        ))}
        <label
          htmlFor={customId}
          className={cn(
            "relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 px-3 text-sm font-black text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
            known ? "border-ink/25 hover:border-ink" : "border-ink",
          )}
        >
          <span aria-hidden="true" className="block size-6 rounded-full shadow-[inset_0_0_0_1px_var(--shadow-hard-25)]" style={{ backgroundColor: value }} />
          {customLabel}
          <input
            id={customId}
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </fieldset>
  );
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="type-body-sm font-black text-ink">
          {label}
        </label>
        <span className="font-mono text-xs font-bold text-muted">{display ?? value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full cursor-pointer accent-ink"
      />
    </div>
  );
}
