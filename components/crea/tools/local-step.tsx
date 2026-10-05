"use client";

import { Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CREA_TOOL_COPY } from "@/lib/crea-copy";
import { localAiErrorMessage, toLocalAiError, type LocalAiErrorCode } from "@/lib/crea-local-ai/errors";
import type { AggregateProgress } from "@/lib/crea-local-ai/progress";
import type { Locale } from "@/lib/i18n";

/**
 * Korak na uređaju usred alata sa više koraka (K12: prepoznaj tekst → obriši ga
 * → postavi kao sloj; iseci mrežu u 9 radova). `ToolRunner` vodi jedan ulaz do
 * jednog rezultata; ovo je isti obrazac (preuzimanje modela sa napretkom,
 * odustajanje, srpska poruka greške) za korak koji ne završava čuvanjem.
 */
export type LocalStepState =
  | { name: "idle" }
  | { name: "downloading"; percent: number | null }
  | { name: "running" }
  | { name: "error"; code: LocalAiErrorCode };

export type LocalStepContext = {
  signal: AbortSignal;
  reportDownload: (progress: AggregateProgress) => void;
  reportRunning: () => void;
};

export function useLocalStep() {
  const [state, setState] = useState<LocalStepState>({ name: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async <T,>(task: (context: LocalStepContext) => Promise<T>, downloads = false): Promise<T | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState(downloads ? { name: "downloading", percent: null } : { name: "running" });
    try {
      const result = await task({
        signal: controller.signal,
        reportDownload: (progress) => {
          if (!controller.signal.aborted) setState({ name: "downloading", percent: progress.percent });
        },
        reportRunning: () => {
          if (!controller.signal.aborted) setState({ name: "running" });
        },
      });
      if (controller.signal.aborted) return null;
      setState({ name: "idle" });
      return result;
    } catch (error) {
      if (!controller.signal.aborted) setState({ name: "error", code: toLocalAiError(error, "INFERENCE_FAILED").code });
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState({ name: "error", code: "ABORTED" });
  }, []);

  const reset = useCallback(() => setState({ name: "idle" }), []);

  return { state, run, cancel, reset, busy: state.name === "downloading" || state.name === "running" };
}

/** Stanje koraka ispod dugmeta: napredak preuzimanja, „Radim…", greška; uz „Odustani" dok traje. */
export function LocalStepStatus({ locale, state, onCancel }: { locale: Locale; state: LocalStepState; onCancel: () => void }) {
  if (state.name === "idle") return null;
  if (state.name === "error") {
    return (
      <p role="alert" className={state.code === "ABORTED" ? "type-body-sm font-black text-muted" : "type-body-sm font-black text-red-700 dark:text-red-300"}>
        {localAiErrorMessage(state.code, locale)}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" aria-live="polite">
      <p className="inline-flex items-center gap-2 type-body-sm font-black text-ink">
        <Spinner size="sm" />
        {state.name === "downloading"
          ? `${CREA_TOOL_COPY.downloading[locale]}${state.percent !== null ? ` · ${state.percent} %` : ""}`
          : CREA_TOOL_COPY.running[locale]}
      </p>
      <Button variant="secondary" onClick={onCancel} icon={<Square aria-hidden="true" className="size-4" />}>
        {CREA_TOOL_COPY.cancel[locale]}
      </Button>
    </div>
  );
}
