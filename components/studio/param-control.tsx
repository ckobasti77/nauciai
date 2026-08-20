"use client";

import { Minus, Plus } from "lucide-react";
import { useId } from "react";

import { PriceTag } from "@/components/studio/price-tag";
import { cn } from "@/components/ui/primitives";
import { availableOptionValues, type ParamControl as ParamControlSpec } from "@/convex/studioParamSpec";
import type { PriceRule } from "@/convex/studioPricing";
import type { Locale } from "@/lib/i18n";
import {
  clampControlNumber,
  controlHelp,
  controlLabel,
  controlUnit,
  optionLabel,
  priceDelta,
  stepPriceDelta,
  type ParamValue,
} from "@/lib/studio-params";

const FIELD =
  "surface-inset w-full border-2 border-ink bg-white px-4 py-2.5 text-base font-extrabold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

const LABEL = "text-sm font-black uppercase tracking-wide text-muted";

const STEPPER =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white text-ink transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Jedna kontrola iz `paramSpec`-a (STUDIO-CATALOG-V4 1.2). Grana ISKLJUČIVO po
 * `type`-u - `segmented`, `select`, `slider`, `number`, `switch`, `textarea`,
 * `text` - i ne zna ime nijednog modela.
 *
 * Opcija koja uz trenutne ostale parametre nema cenu se ne skriva nego gasi:
 * Seedance Mini nema 1080p, i korisnik treba da vidi zašto mu nedostaje, a ne
 * da mu se ponuda tiho menja. Odgovor dolazi iz cenovnog pravila
 * (`availableOptionValues`), ne iz spiska zabrana.
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
  /** Trenutni parametri - značka cene se računa nad njima, ne nad podrazumevanima. */
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

  function optionTag(optionValue: string) {
    if (!control.affectsPrice) return null;

    return <PriceTag delta={priceDelta(rule, params, control.key, optionValue, inputMode)} locale={locale} />;
  }

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {control.type === "slider" || control.type === "number" ? (
        <span className="text-sm font-black text-ink">
          {typeof value === "number" ? value : control.default}
          {unit ? ` ${unit}` : ""}
        </span>
      ) : null}
      {control.affectsPrice && (control.type === "slider" || control.type === "number") ? (
        <PriceTag delta={stepPriceDelta(rule, params, control, inputMode)} locale={locale} />
      ) : null}
    </div>
  );

  const helpText = help ? <p className="mt-1 text-xs font-bold leading-5 text-muted">{help}</p> : null;

  if (control.type === "segmented") {
    return (
      <div>
        {header}
        {/* ToggleGroup: jedan izbor, sve opcije u redu. */}
        <div
          id={id}
          role="group"
          aria-label={label}
          className="surface-inset mt-2 flex flex-wrap gap-1 border-2 border-ink bg-paper p-1"
        >
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
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-sm font-black transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40",
                  active ? "bg-ink text-white" : "bg-white text-ink hover:-translate-y-0.5",
                )}
              >
                {optionLabel(option, locale)}
                {active ? null : optionTag(option.value)}
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
          className={cn(FIELD, "mt-2")}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={!available.includes(option.value)}>
              {optionLabel(option, locale)}
            </option>
          ))}
        </select>
        {/* Kod `select`-a značka stoji uz kontrolu, za trenutno izabranu vrednost
            se ne prikazuje razlika prema samoj sebi - zato se gleda prva druga
            opcija koja menja cenu. */}
        {control.affectsPrice ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {options
              .filter((option) => option.value !== value && available.includes(option.value))
              .slice(0, 4)
              .map((option) => (
                <span key={option.value} className="inline-flex items-center gap-1 text-xs font-bold text-muted">
                  {optionLabel(option, locale)}
                  {optionTag(option.value)}
                </span>
              ))}
          </div>
        ) : null}
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
          className="mt-3 w-full accent-ink"
        />
        <div className="flex justify-between text-xs font-bold text-muted">
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

    return (
      <div>
        {header}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            aria-label={locale === "sr" ? `Manje: ${label}` : `Less: ${label}`}
            disabled={disabled || (control.min !== undefined && current <= control.min)}
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
            min={control.min}
            max={control.max}
            step={step}
            disabled={disabled}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) onChange(clampControlNumber(control, next));
            }}
            className={cn(FIELD, "w-24 text-center")}
          />
          <button
            type="button"
            aria-label={locale === "sr" ? `Više: ${label}` : `More: ${label}`}
            disabled={disabled || (control.max !== undefined && current >= control.max)}
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
              on ? "bg-yellow" : "bg-white",
            )}
          >
            <span
              className={cn(
                "size-5 rounded-full border-2 border-ink bg-white transition duration-200",
                on && "translate-x-5",
              )}
            />
          </button>
          <span className={LABEL}>{label}</span>
          {control.affectsPrice ? (
            <PriceTag delta={priceDelta(rule, params, control.key, !on, inputMode)} locale={locale} />
          ) : null}
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
          rows={5}
          value={text}
          maxLength={max}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(FIELD, "mt-2 py-3 font-bold placeholder:font-bold placeholder:text-muted")}
        />
        {max !== undefined ? (
          <p
            className={cn(
              "mt-1 text-xs font-black",
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
        className={cn(FIELD, "mt-2")}
      />
      {helpText}
    </div>
  );
}
