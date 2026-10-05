"use client";

import { Square } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CREA_AUDIO_TOOLS_COPY as T } from "@/lib/crea-audio-tools-copy";
import { localAiErrorMessage, type LocalAiErrorCode } from "@/lib/crea-local-ai/errors";
import type { Locale } from "@/lib/i18n";

/**
 * Sitni delovi alata Zvuka III (Crea K24). Jedan okvir po grupi: deo alata se od
 * prethodnog deli tankom linijom, nikad drugim okvirom (AGENTS.md).
 */

export const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function ToolSection({ title, hint, children, id }: { title: string; hint?: string; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="mt-5 space-y-3 border-t border-line pt-5">
      <div>
        <h3 id={id} className="type-h4 text-ink">
          {title}
        </h3>
        {hint ? <p className="mt-1 type-body-sm font-semibold text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Klizač sa oznakom i vrednošću (meta ≥ 44 px). */
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid min-h-11 grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)_3.5rem] items-center gap-3 type-body-sm font-black text-ink">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full cursor-pointer accent-ink disabled:cursor-not-allowed"
      />
      <span className="text-right font-mono text-xs text-muted">{format ? format(value) : value}</span>
    </label>
  );
}

/** Decimalni broj u pismu jezika („1,25" / „1.25"). */
export function formatNumber(value: number, locale: Locale, digits: number): string {
  return value.toLocaleString(locale === "sr" ? "sr-Latn" : "en", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Broj sekundi kao „1:05,3" (desetinke) ili „4,2 s". */
export function formatSeconds(seconds: number, locale: Locale, precise = false): string {
  const safe = Math.max(0, seconds);
  if (safe < 60 && !precise) return `${safe.toLocaleString(locale === "sr" ? "sr-Latn" : "en", { maximumFractionDigits: 1 })} s`;
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const secondsText = rest.toLocaleString(locale === "sr" ? "sr-Latn" : "en", { minimumIntegerDigits: 2, minimumFractionDigits: precise ? 1 : 0, maximumFractionDigits: precise ? 1 : 0 });
  return `${minutes}:${secondsText}`;
}

export type WorkState =
  | { name: "idle" }
  | { name: "downloading"; percent: number | null }
  | { name: "running"; label?: string; percent?: number | null }
  | { name: "error"; code: LocalAiErrorCode; message?: string };

/** Stanje rada na uređaju ispod dugmeta: preuzimanje, rad, greška; „Odustani" dok traje. */
export function WorkStatus({ locale, state, onCancel }: { locale: Locale; state: WorkState; onCancel?: () => void }) {
  if (state.name === "idle") return null;
  if (state.name === "error") {
    const aborted = state.code === "ABORTED";
    return (
      <p role="alert" className={aborted ? "type-body-sm font-black text-muted" : "type-body-sm font-black text-red-700 dark:text-red-300"}>
        {state.message ?? (aborted ? T.common.cancelled[locale] : localAiErrorMessage(state.code, locale))}
      </p>
    );
  }
  const label =
    state.name === "downloading"
      ? `${T.common.downloading[locale]}${state.percent !== null ? ` ${state.percent} %` : ""}`
      : `${state.label ?? T.common.working[locale]}${state.percent !== null && state.percent !== undefined ? ` ${state.percent} %` : ""}`;
  return (
    <div className="flex flex-wrap items-center gap-3" aria-live="polite">
      <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
        <Spinner size="sm" />
        {label}
      </p>
      {onCancel ? (
        <Button variant="secondary" onClick={onCancel} icon={<Square aria-hidden="true" className="size-4" />}>
          {T.common.cancel[locale]}
        </Button>
      ) : null}
    </div>
  );
}
