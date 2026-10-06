"use client";

import { useMutation, useQuery } from "convex/react";
import { LifeBuoy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FreeRedoReason } from "@/convex/creaFairCore";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_REDO_COPY, CREA_REDO_REASONS } from "@/lib/crea-fair-copy";
import type { Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";

const REASONS_BY_KIND: Record<"image" | "video" | "audio", readonly FreeRedoReason[]> = {
  image: ["prazno", "iskrivljeno", "pogresno", "tekst"],
  video: ["prazno", "iskrivljeno", "pogresno", "pokret"],
  audio: ["prazno", "zvuk", "pogresno"],
};

function initialClock() {
  return Date.now();
}

/**
 * Besplatno ponavljanje očigledno pokvarenog rada (K28, U7). Vidi se samo kad ga
 * server dozvoljava (`creaFair.getRedoOffer`); korisnik bira šta nije u redu, pa
 * isti zahtev ide još jednom za 0 kredita.
 */
export function RedoBroken({ jobId, kind, locale }: { jobId: string; kind: "image" | "video" | "audio"; locale: Locale }) {
  const [clock] = useState(initialClock);
  const offer = useQuery(api.creaFair.getRedoOffer, { jobId: jobId as Id<"generationJobs">, now: clock });
  const redo = useMutation(api.creaFair.redoBroken);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FreeRedoReason | null>(null);
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; message: string }>({ kind: "idle" });

  if (state.kind === "done") {
    return (
      <p role="status" className="type-body-sm font-bold text-ink">
        {CREA_REDO_COPY.started[locale]}
      </p>
    );
  }
  if (!offer?.ok) return null;

  async function submit() {
    if (!reason) return;
    setState({ kind: "busy" });
    try {
      await redo({ jobId: jobId as Id<"generationJobs">, reason });
      setState({ kind: "done" });
    } catch (error) {
      setState({ kind: "error", message: studioErrorMessage(error instanceof Error ? error.message : String(error), locale) });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper py-2 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <LifeBuoy aria-hidden="true" className="size-3.5" />
        <span>{CREA_REDO_COPY.open[locale]}</span>
      </button>
    );
  }

  return (
    <fieldset className="surface-inset border border-line bg-paper p-3">
      <legend className="sr-only">{CREA_REDO_COPY.title[locale]}</legend>
      <p className="text-sm font-black text-ink" aria-hidden="true">
        {CREA_REDO_COPY.title[locale]}
      </p>
      <p className="mt-1 text-xs font-semibold text-muted">
        {CREA_REDO_COPY.body[locale]} {fillCopy(CREA_REDO_COPY.left[locale], { count: offer.leftToday })}.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REASONS_BY_KIND[kind].map((id) => (
          <label
            key={id}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 border-ink px-3 text-xs font-black focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink",
              reason === id ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink",
            )}
          >
            <input type="radio" name={`redo-${jobId}`} value={id} checked={reason === id} onChange={() => setReason(id)} className="sr-only" />
            {CREA_REDO_REASONS[id][locale]}
          </label>
        ))}
      </div>
      {state.kind === "error" ? (
        <p role="alert" className="mt-2 text-xs font-black text-red-700 dark:text-red-300">
          {state.message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!reason || state.kind === "busy"}
          onClick={() => void submit()}
          className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
        >
          {CREA_REDO_COPY.confirm[locale]}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-4 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {CREA_REDO_COPY.cancel[locale]}
        </button>
      </div>
    </fieldset>
  );
}
