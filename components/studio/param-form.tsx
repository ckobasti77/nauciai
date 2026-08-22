"use client";

import { useState } from "react";

import { ParamControl } from "@/components/studio/param-control";
import { cn } from "@/components/ui/primitives";
import type { ParamControl as ParamControlSpec } from "@/convex/studioParamSpec";
import type { PriceRule } from "@/convex/studioPricing";
import type { Locale } from "@/lib/i18n";
import { splitControlsByImportance } from "@/lib/studio-panel";
import { buildParams, paramValuesForMode, visibleControls, type ParamValue, type ParamValues } from "@/lib/studio-params";

/**
 * Kontrola koja u dvokolonskoj mreži zauzima CEO red (2 kolone): sve široko
 * (tekst, klizač), pun `select`, i brojčane kontrole (broj slika se rasteže na
 * ceo red). Uske kontrole (segmentovano, odnos-ikone, prekidač) staju u pola
 * reda - pa rezolucija i odnos stranica sednu jedno pored drugog.
 */
function spanFull(control: ParamControlSpec): boolean {
  if (control.type === "textarea" || control.type === "text" || control.type === "slider") return true;
  if (control.type === "number") return true;
  if (control.type === "select") {
    const options = control.options ?? [];
    const ratio = options.length > 0 && options.every((option) => /^\d+:\d+$/.test(option.value));
    return !ratio; // dug dropdown = ceo red; odnos-ikone = pola reda
  }
  return false; // segmented, switch = pola reda
}

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
  const promptControls = controls.filter(isPrompt);
  const nonPromptControls = controls.filter((c) => !isPrompt(c));

  if (hidePromptOnDesktop && promptControls.length === 0 && nonPromptControls.length === 0) {
    return null;
  }

  // Osnovno vs napredno se izvodi iz paramSpec-a (SP1, tačka 3), ne iz fiksnog
  // preseka: kontrola koja menja cenu ili bira oblik izlaza je osnovna, ostalo
  // je napredno i stoji sklopljeno. Ako po pravilu NIŠTA nije osnovno (npr. TTS,
  // gde cenu diktira dužina teksta a ne kontrole), prikaži prvu kontrolu iz
  // paramSpec-a (najvažniju, npr. glas) a ostalo sklopi - da panel nikad ne
  // krene sa nula vidljivih kontrola, ni sa svih devet otvorenih.
  const split = splitControlsByImportance(nonPromptControls);
  const hasBasic = split.basic.length > 0;
  const basicControls = hasBasic ? split.basic : split.advanced.slice(0, 1);
  const advControls = hasBasic ? split.advanced : split.advanced.slice(1);

  return (
    <div className={cn("space-y-4", nonPromptControls.length === 0 && hidePromptOnDesktop && "sm:hidden")}>
      {promptControls.length > 0 ? (
        <div className={cn("space-y-4", hidePromptOnDesktop && "sm:hidden")}>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {basicControls.map((control) => (
          <div key={control.key} className={cn(spanFull(control) && "sm:col-span-2")}>
            <ParamControl
              control={control}
              value={state.values[control.key] ?? control.default}
              onChange={(next) => state.setValue(control.key, next)}
              locale={locale}
              rule={rule}
              params={state.params}
              inputMode={inputMode}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

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
