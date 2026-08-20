"use client";

import { useState } from "react";

import { ParamControl } from "@/components/studio/param-control";
import type { ParamControl as ParamControlSpec } from "@/convex/studioParamSpec";
import type { PriceRule } from "@/convex/studioPricing";
import type { Locale } from "@/lib/i18n";
import { buildParams, paramValuesForMode, visibleControls, type ParamValue, type ParamValues } from "@/lib/studio-params";

export type ParamFormState = {
  /** Vrednosti kontrola, po ključu iz `paramSpec`-a. */
  values: ParamValues;
  setValue: (key: string, value: ParamValue) => void;
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
 * `useMemo`) - promena reference znači "drugi model", pa se vrednosti ne
 * prenose. Promena samo režima ih prenosi tamo gde kontrola i dalje postoji i
 * dalje prihvata istu vrednost; ostalo pada na podrazumevano.
 *
 * Stanje se podešava tokom rendera umesto u efektu: efekat bi prvo iscrtao
 * cenu za stari režim pa je ispravio, a cena ne sme da treperi.
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
    ? paramValuesForMode(spec, inputMode, state.spec === spec ? state.values : {})
    : state.values;

  if (stale) setState({ spec, mode: inputMode, values });

  return {
    values,
    setValue: (key, value) =>
      setState((current) => ({ ...current, values: { ...current.values, [key]: value } })),
    params: buildParams(spec, values, inputMode, measured),
  };
}

/**
 * Ceo set kontrola jednog modela (STUDIO-CATALOG-V4 sekcija 6): gradi se iz
 * `paramSpec`-a, filtrira po ulaznom režimu i ne zna ime nijednog modela.
 * Kontrola koja utiče na cenu nosi značku sa razlikom, iz istog cenovnog
 * pravila po kojem se posao naplaćuje.
 */
export function ParamForm({
  spec,
  state,
  rule,
  locale,
  inputMode,
  disabled = false,
}: {
  spec: ParamControlSpec[];
  state: ParamFormState;
  rule: PriceRule;
  locale: Locale;
  inputMode?: string;
  disabled?: boolean;
}) {
  const controls = visibleControls(spec, inputMode);
  if (controls.length === 0) return null;

  return (
    <div className="space-y-5">
      {controls.map((control) => (
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
  );
}
