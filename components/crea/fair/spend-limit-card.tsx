"use client";

import { useMutation, useQuery } from "convex/react";
import { Gauge } from "lucide-react";
import { useId, useState } from "react";

import { Panel } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { SPEND_LIMIT_BOUNDS } from "@/convex/creaFairCore";
import { fillCopy } from "@/lib/crea-copy";
import { formatDinars } from "@/lib/crea-dinars";
import { CREA_LIMIT_COPY } from "@/lib/crea-fair-copy";
import type { Locale } from "@/lib/i18n";

function initialClock() {
  return Date.now();
}

/**
 * Dnevni limit potrošnje koji korisnik sam postavi (K28, U7). Važi za sve puteve
 * (composer, MCP, pomoćnik) jer ga proverava `studio.createJobForUser`.
 */
export function SpendLimitCard({ locale }: { locale: Locale }) {
  const [clock] = useState(initialClock);
  const state = useQuery(api.creaFair.getFairState, { now: clock });
  const setLimit = useMutation(api.creaFair.setDailySpendLimit);
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const value = draft ?? (state?.dailyLimit != null ? String(state.dailyLimit) : "");

  async function save(next: number | null) {
    if (next !== null && (!Number.isFinite(next) || next < SPEND_LIMIT_BOUNDS.min || next > SPEND_LIMIT_BOUNDS.max)) {
      setMessage({ ok: false, text: CREA_LIMIT_COPY.invalid[locale] });
      return;
    }
    try {
      await setLimit({ credits: next });
      setDraft(null);
      setMessage({ ok: true, text: CREA_LIMIT_COPY.saved[locale] });
    } catch {
      setMessage({ ok: false, text: CREA_LIMIT_COPY.invalid[locale] });
    }
  }

  return (
    <Panel className="p-6">
      <h3 className="flex items-center gap-2 type-h2 text-ink">
        <Gauge aria-hidden="true" className="size-5" />
        {CREA_LIMIT_COPY.title[locale]}
      </h3>
      <p className="mt-2 type-body type-measure font-bold text-muted">{CREA_LIMIT_COPY.body[locale]}</p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save(value.trim() === "" ? null : Number(value));
        }}
      >
        <div>
          <label htmlFor={inputId} className="block text-sm font-black text-ink">
            {CREA_LIMIT_COPY.label[locale]}
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={SPEND_LIMIT_BOUNDS.min}
            max={SPEND_LIMIT_BOUNDS.max}
            step={1}
            value={value}
            onChange={(event) => {
              setDraft(event.target.value);
              setMessage(null);
            }}
            className="surface-inset mt-1 min-h-11 w-40 border-2 border-ink bg-paper-strong px-3 font-mono text-base font-black tabular-nums text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-yellow px-5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          {CREA_LIMIT_COPY.save[locale]}
        </button>
        {state?.dailyLimit != null ? (
          <button
            type="button"
            onClick={() => void save(null)}
            className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-extrabold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {CREA_LIMIT_COPY.remove[locale]}
          </button>
        ) : null}
      </form>
      <p className="mt-3 text-sm font-bold text-muted" role="status">
        {message
          ? message.text
          : state === undefined
            ? " "
            : state.dailyLimit == null
              ? CREA_LIMIT_COPY.none[locale]
              : `${fillCopy(CREA_LIMIT_COPY.current[locale], { spent: state.spentToday, limit: state.dailyLimit })} (${formatDinars(state.dailyLimit, locale)})`}
      </p>
    </Panel>
  );
}
