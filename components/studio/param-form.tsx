"use client";

import { useState } from "react";

import { ParamControl } from "@/components/studio/param-control";
import { cn } from "@/components/ui/primitives";
import type { ParamControl as ParamControlSpec } from "@/convex/studioParamSpec";
import type { PriceRule } from "@/convex/studioPricing";
import type { Locale } from "@/lib/i18n";
import { buildParams, paramValuesForMode, visibleControls, type ParamValue, type ParamValues } from "@/lib/studio-params";

export type ParamFormState = {
  /** Vrednosti kontrola, po ključu iz `paramSpec`-a. */
  values: ParamValues;
  setValue: (key: string, value: ParamValue) => void;
  setAllValues: (next: ParamValues) => void;
  /**
   * Očišćen objekat parametara. ISTI objekat ide u `computeCredits` (cena na
   * dugmetu) i u `createJob` (naplata) - katalog 1.3 zabranjuje dve računice,
   * a dva objekta su dve računice.
   */
  params: Record<string, unknown>;
};

/**
 * Stanje forme za jedan model i jedan ulazni režim.
 *
 * `spec` mora da bude referencijalno stabilan (parsira se jednom po modelu,
 * `useMemo`). Promena modela ili režima automatski prenosi kompatibilne vrednosti
 * (C4 carry-forward), dok nekompatibilne padaju na podrazumevane vrednosti novog modela.
 */
export function useParamValues(
  spec: ParamControlSpec[],
  inputMode?: string,
  measured: Record<string, number> = {},
  /**
   * Početne vrednosti - "Generiši ponovo" (S7) njima vraća formu u stanje
   * ranijeg posla. Zadržava se samo ono što kontrola i dalje prihvata, isto
   * kao pri promeni režima; čita se JEDNOM, na prvom renderu.
   */
  initial: ParamValues = {},
): ParamFormState {
  const [state, setState] = useState(() => ({
    spec,
    mode: inputMode,
    values: paramValuesForMode(spec, inputMode, initial),
  }));

  const stale = state.spec !== spec || state.mode !== inputMode;
  const values = stale
    ? paramValuesForMode(spec, inputMode, state.values)
    : state.values;

  if (stale) setState({ spec, mode: inputMode, values });

  return {
    values,
    setValue: (key, value) =>
      setState((current) => ({ ...current, values: { ...current.values, [key]: value } })),
    setAllValues: (next) =>
      setState((current) => ({ ...current, values: next })),
    params: buildParams(spec, values, inputMode, measured),
  };
}

/**
 * Ceo set kontrola jednog modela (STUDIO-CATALOG-V4 sekcija 6): gradi se iz
 * `paramSpec`-a, filtrira po ulaznom režimu i ne zna ime nijednog modela.
 * Kontrola koja utiče na cenu nosi značku sa razlikom, iz istog cenovnog
 * pravila po kojem se posao naplaćuje.
 *
 * Podržava podelu na osnovna i napredna podešavanja kada model ima više od 4 kontrole.
 */
export function ParamForm({
  spec,
  state,
  rule,
  locale,
  inputMode,
  disabled = false,
  hidePromptOnDesktop = false,
}: {
  spec: ParamControlSpec[];
  state: ParamFormState;
  rule: PriceRule;
  locale: Locale;
  inputMode?: string;
  disabled?: boolean;
  hidePromptOnDesktop?: boolean;
}) {
  const controls = visibleControls(spec, inputMode);
  const [advOpen, setAdvOpen] = useState(false);

  if (controls.length === 0) return null;

  const isPrompt = (c: ParamControlSpec) => c.type === "textarea" || c.key === "prompt";
  const promptControls = hidePromptOnDesktop ? controls.filter(isPrompt) : [];
  const standardControls = hidePromptOnDesktop ? controls.filter((c) => !isPrompt(c)) : controls;

  if (hidePromptOnDesktop && promptControls.length === 0 && standardControls.length === 0) {
    return null;
  }

  const shouldSplit = standardControls.length > 4;
  const basicControls = shouldSplit ? standardControls.slice(0, 3) : standardControls;
  const advControls = shouldSplit ? standardControls.slice(3) : [];

  return (
    <div className={cn("space-y-4", standardControls.length === 0 && "sm:hidden")}>
      {promptControls.length > 0 ? (
        <div className="space-y-4 sm:hidden">
          {promptControls.map((control) => (
            <ParamControl
              key={control.key}
              control={control}
              value={state.values[control.key] ?? control.default}
              onChange={(next) => state.setValue(control.key, next)}
              locale={locale}
              rule={rule}
              params={state.params}
              inputMode={inputMode}
              disabled={disabled}
            />
          ))}
        </div>
      ) : null}

      {basicControls.map((control) => (
        <ParamControl
          key={control.key}
          control={control}
          value={state.values[control.key] ?? control.default}
          onChange={(next) => state.setValue(control.key, next)}
          locale={locale}
          rule={rule}
          params={state.params}
          inputMode={inputMode}
          disabled={disabled}
        />
      ))}

      {advControls.length > 0 ? (
        <div className="border-t-2 border-ink/10 pt-2">
          <button
            type="button"
            onClick={() => setAdvOpen((prev) => !prev)}
            className="inline-flex w-full items-center justify-between py-1 text-xs font-black uppercase tracking-wider text-muted transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span>
              {locale === "sr" ? "Napredna podešavanja" : "Advanced settings"} · {advControls.length}
            </span>
            <span className="font-mono text-sm">{advOpen ? "−" : "+"}</span>
          </button>
          {advOpen ? (
            <div className="mt-3 space-y-4">
              {advControls.map((control) => (
                <ParamControl
                  key={control.key}
                  control={control}
                  value={state.values[control.key] ?? control.default}
                  onChange={(next) => state.setValue(control.key, next)}
                  locale={locale}
                  rule={rule}
                  params={state.params}
                  inputMode={inputMode}
                  disabled={disabled}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
