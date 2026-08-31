"use client";

import { Minus, Plus } from "lucide-react";
import { useId } from "react";

import { cn } from "@/components/ui/primitives";
import { availableOptionValues, type ParamControl as ParamControlSpec, type ParamOption } from "@/convex/studioParamSpec";
import type { PriceRule } from "@/convex/studioPricing";
import type { Locale } from "@/lib/i18n";
import {
  clampControlNumber,
  controlHelp,
  controlLabel,
  controlUnit,
  optionLabel,
  type ParamValue,
} from "@/lib/studio-params";

const FIELD =
  "surface-inset w-full border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-extrabold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

const LABEL = "text-[11px] font-black uppercase tracking-wide text-muted";

const STEPPER =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40";

// Jedan izbor iz reda (rezolucija / odnos / broj): sva tri koriste ISTI red
// dugmica iste visine, pa se dve kontrole jedna do druge poravnaju (nema više
// niskog reda pored visokog). Aktivno/neaktivno se dodaje preko `cn`.
const CHOICE_ROW = "mt-1.5 flex flex-wrap gap-1.5";
const CHOICE =
  "surface-inset inline-flex min-h-[44px] flex-1 items-center justify-center border-2 border-ink px-2 py-1 text-xs font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40";
const CHOICE_ACTIVE = "bg-ink text-paper-strong";
const CHOICE_IDLE = "bg-paper-strong text-ink hover:-translate-y-0.5";

/** Opcija oblika `W:H` (odnos stranica) - takva kontrola se crta ikonama, ne tekstom. */
const RATIO_RE = /^(\d+):(\d+)$/;

function isRatioOptions(options: ParamOption[]): boolean {
  return options.length > 0 && options.every((option) => RATIO_RE.test(option.value));
}

/** Mali pravougaonik u proporciji odnosa - ikona koja pokazuje oblik izlaza. */
function RatioIcon({ value }: { value: string }) {
  const match = RATIO_RE.exec(value);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  const box = 15;
  const rw = w >= h ? box : (box * w) / h;
  const rh = h >= w ? box : (box * h) / w;
  const x = (20 - rw) / 2;
  const y = (20 - rh) / 2;

  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x={x} y={y} width={rw} height={rh} rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** Kontrola sa opcijama-odnosima: 5 dugmica sa ikonom oblika + tekstom ispod. */
function RatioButtons({
  options,
  value,
  available,
  label,
  disabled,
  onChange,
  locale,
}: {
  options: ParamOption[];
  value: ParamValue;
  available: string[];
  label: string;
  disabled: boolean;
  onChange: (next: ParamValue) => void;
  locale: Locale;
}) {
  return (
    <div role="group" aria-label={label} className={CHOICE_ROW}>
      {options.map((option) => {
        const active = value === option.value;
        const priceable = available.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled || (!priceable && !active)}
            title={locale === "sr" ? `Odnos ${option.value}` : `Ratio ${option.value}`}
            onClick={() => onChange(option.value)}
            className={cn(
              CHOICE,
              "flex-col gap-0.5 px-1 text-[10px] leading-none",
              active ? CHOICE_ACTIVE : CHOICE_IDLE,
            )}
          >
            <RatioIcon value={option.value} />
            <span>{optionLabel(option, locale)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Jedna kontrola iz `paramSpec`-a (STUDIO-CATALOG-V4 1.2). Grana ISKLJUČIVO po
 * `type`-u i ne zna ime nijednog modela. Cena više NE stoji uz svaku opciju
 * (živa cena je na baru composera, ispod inputa) - kontrole su čiste i gušće.
 *
 * Odnos stranica se crta ikonama oblika (5 dugmica), a mali brojčani opseg
 * (npr. broj slika 1-4) kao red dugmica umesto steppera.
 */
export function ParamControl({
  control,
  value,
  onChange,
  locale,
  rule,
  params,
  inputMode,
  disabled = false,
}: {
  control: ParamControlSpec;
  value: ParamValue;
  onChange: (next: ParamValue) => void;
  locale: Locale;
  rule: PriceRule;
  /** Trenutni parametri - služe samo za `availableOptionValues` (šta je dostupno). */
  params: Record<string, unknown>;
  inputMode?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const label = controlLabel(control, locale);
  const help = controlHelp(control, locale);
  const unit = controlUnit(control, locale);
  const options = control.options ?? [];
  const available = availableOptionValues(control, rule, params, inputMode);
  const ratio = isRatioOptions(options);

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {control.type === "slider" ? (
        <span className="text-xs font-black tabular-nums text-ink">
          {typeof value === "number" ? value : control.default}
          {unit ? ` ${unit}` : ""}
        </span>
      ) : null}
    </div>
  );

  const helpText = help ? <p className="mt-1 text-xs font-bold leading-5 text-muted">{help}</p> : null;

  if (control.type === "segmented" || (control.type === "select" && ratio)) {
    if (ratio) {
      return (
        <div>
          {header}
          <RatioButtons
            options={options}
            value={value}
            available={available}
            label={label}
            disabled={disabled}
            onChange={onChange}
            locale={locale}
          />
          {helpText}
        </div>
      );
    }

    // Segmentovano: red dugmica iste visine kao odnos stranica (bez cenovnih znački).
    return (
      <div>
        {header}
        <div id={id} role="group" aria-label={label} className={CHOICE_ROW}>
          {options.map((option) => {
            const active = value === option.value;
            const priceable = available.includes(option.value);

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                disabled={disabled || (!priceable && !active)}
                title={
                  priceable
                    ? undefined
                    : locale === "sr"
                      ? "Nije dostupno uz trenutna podešavanja."
                      : "Not available with the current settings."
                }
                onClick={() => onChange(option.value)}
                className={cn(CHOICE, active ? CHOICE_ACTIVE : CHOICE_IDLE)}
              >
                {optionLabel(option, locale)}
              </button>
            );
          })}
        </div>
        {helpText}
      </div>
    );
  }

  if (control.type === "select") {
    return (
      <div>
        {header}
        <select
          id={id}
          value={typeof value === "string" ? value : String(control.default)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(FIELD, "mt-1.5")}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={!available.includes(option.value)}>
              {optionLabel(option, locale)}
            </option>
          ))}
        </select>
        {helpText}
      </div>
    );
  }

  if (control.type === "slider") {
    const min = control.min ?? 0;
    const max = control.max ?? 100;
    const step = control.step ?? 1;
    const current = typeof value === "number" ? value : Number(control.default);

    return (
      <div>
        {header}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          onChange={(event) => onChange(clampControlNumber(control, Number(event.target.value)))}
          className="mt-2 w-full accent-ink"
        />
        <div className="flex justify-between text-[10px] font-bold text-muted">
          <span>
            {min}
            {unit ? ` ${unit}` : ""}
          </span>
          <span>
            {max}
            {unit ? ` ${unit}` : ""}
          </span>
        </div>
        {helpText}
      </div>
    );
  }

  if (control.type === "number") {
    const current = typeof value === "number" ? value : Number(control.default);
    const step = control.step ?? 1;
    const min = control.min;
    const max = control.max;

    // Mali celobrojni opseg (npr. broj slika 1-4) -> red dugmica, ne stepper.
    const isCount = control.key === "num_images" || control.key === "num_outputs" || control.key === "count";
    if (min !== undefined && max !== undefined && step === 1 && max - min >= 1 && max - min <= 5) {
      const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div>
          {header}
          <div role="group" aria-label={label} className={CHOICE_ROW}>
            {values.map((n) => {
              const active = current === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => onChange(n)}
                  className={cn(CHOICE, active ? CHOICE_ACTIVE : CHOICE_IDLE)}
                >
                  {isCount ? `${n}×` : n}
                </button>
              );
            })}
          </div>
          {helpText}
        </div>
      );
    }

    return (
      <div>
        {header}
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            aria-label={locale === "sr" ? `Manje: ${label}` : `Less: ${label}`}
            disabled={disabled || (min !== undefined && current <= min)}
            onClick={() => onChange(clampControlNumber(control, current - step))}
            className={STEPPER}
          >
            <Minus className="size-4" />
          </button>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            value={current}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) onChange(clampControlNumber(control, next));
            }}
            className={cn(FIELD, "w-20 text-center")}
          />
          <button
            type="button"
            aria-label={locale === "sr" ? `Više: ${label}` : `More: ${label}`}
            disabled={disabled || (max !== undefined && current >= max)}
            onClick={() => onChange(clampControlNumber(control, current + step))}
            className={STEPPER}
          >
            <Plus className="size-4" />
          </button>
        </div>
        {helpText}
      </div>
    );
  }

  if (control.type === "switch") {
    const on = typeof value === "boolean" ? value : Boolean(control.default);

    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!on)}
            className={cn(
              "inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-ink p-0.5 transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60",
              on ? "bg-yellow" : "bg-paper-strong",
            )}
          >
            <span
              className={cn(
                "size-5 rounded-full border-2 border-ink bg-paper-strong transition duration-200",
                on && "translate-x-5",
              )}
            />
          </button>
          <span className={LABEL}>{label}</span>
        </div>
        {helpText}
      </div>
    );
  }

  if (control.type === "textarea") {
    const text = typeof value === "string" ? value : String(control.default ?? "");
    const max = control.max;

    return (
      <div>
        {header}
        <textarea
          id={id}
          rows={4}
          value={text}
          maxLength={max}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(FIELD, "mt-1.5 py-2.5 font-bold placeholder:font-bold placeholder:text-muted")}
        />
        {max !== undefined ? (
          <p
            className={cn(
              "mt-1 text-xs font-black tabular-nums",
              max - text.length < 100 ? "text-amber-900" : "text-muted",
            )}
          >
            {text.length} / {max}
          </p>
        ) : null}
        {helpText}
      </div>
    );
  }

  return (
    <div>
      {header}
      <input
        id={id}
        type="text"
        value={typeof value === "string" ? value : String(control.default ?? "")}
        maxLength={control.max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD, "mt-1.5")}
      />
      {helpText}
    </div>
  );
}
