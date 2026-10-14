"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useQuery } from "convex/react";
import { CircleCheck, RefreshCw, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PART_TONE } from "@/components/crea/prompt-parts";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { PromptHelperReply } from "@/convex/creaLlm";
import type { PromptHelperResult } from "@/convex/creaLlmCore";
import { CREA_CREATE_COPY as T } from "@/lib/crea-create-copy";
import { fillCopy } from "@/lib/crea-copy";
import type { Locale } from "@/lib/i18n";

type State = { name: "working" } | { name: "done"; reply: PromptHelperReply };

/** Sat za upit kvote (upit ne čita sat; K07 obrazac). */
function now(): number {
  return Date.now();
}

/**
 * Pomoćnik za opis (Crea K13, S6): ideja na srpskom → precizan opis po delovima
 * (ko · šta · stil · svetlo · kamera), svaki obojen, uz srpski prevod dela i
 * kratko objašnjenje. Jeftin LLM preko postojećeg Google ključa; 0 kredita,
 * dnevni limit po korisniku. „Upotrebi" upisuje opis u polje.
 */
export function PromptHelper({
  locale,
  text,
  onUse,
  onClose,
}: {
  locale: Locale;
  text: string;
  onUse: (prompt: string) => void;
  onClose: () => void;
}) {
  const improve = useAction(api.creaLlm.improvePrompt);
  const [clock] = useState(now);
  const { isAuthenticated } = useConvexAuth();
  const quota = useQuery(api.creaLlm.getPromptHelperQuota, isAuthenticated ? { now: clock } : "skip");
  const [state, setState] = useState<State>(() =>
    text.trim().length > 0 ? { name: "working" } : { name: "done", reply: { ok: false, reason: "PRAZNO" } },
  );
  const ran = useRef(false);

  const request = useCallback(
    (input: string) =>
      improve({ text: input, locale })
        .then((reply) => setState({ name: "done", reply }))
        .catch(() => setState({ name: "done", reply: { ok: false, reason: "GRESKA" } })),
    [improve, locale],
  );

  function run(input: string) {
    setState({ name: "working" });
    void request(input);
  }

  // Prvi poziv čim se panel otvori (dugme „Pomoćnik za opis" je pristanak).
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (text.trim().length > 0) void request(text);
  }, [request, text]);

  const reply = state.name === "done" ? state.reply : null;
  const left = reply?.ok ? reply.remaining : quota ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <section aria-label={T.helper[locale]} aria-live="polite" className="surface-inset mt-3 border border-line bg-paper p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <WandSparkles aria-hidden="true" className="size-4 text-ink" />
        <h3 className="type-body-sm font-black text-ink">{T.helper[locale]}</h3>
        {left !== null ? <span className="text-xs font-bold text-muted">{fillCopy(T.helperQuota[locale], { n: left })}</span> : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label={T.helperClose[locale]}
          className="igra-press inline-flex size-11 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>

      {state.name === "working" ? (
        <p className="mt-3 inline-flex items-center gap-2 type-body-sm font-bold text-muted">
          <Spinner size="xs" />
          {T.helperWorking[locale]}
        </p>
      ) : reply && !reply.ok ? (
        <p role="alert" className="mt-3 type-body-sm font-black text-ink">
          {reply.reason === "LIMIT"
            ? fillCopy(T.helperLimit[locale], { limit: quota?.limit ?? 30 })
            : reply.reason === "PRAZNO"
              ? T.helperEmpty[locale]
              : T.helperError[locale]}
        </p>
      ) : reply && reply.ok ? (
        <PromptParts locale={locale} result={reply} demo={reply.demo} />
      ) : null}

      {state.name === "done" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {reply?.ok ? (
            <button
              type="button"
              onClick={() => onUse(reply.prompt)}
              className="igra-press igra-shadow-yellow inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <CircleCheck aria-hidden="true" className="size-4" />
              {T.helperUse[locale]}
            </button>
          ) : null}
          {reply && (reply.ok || reply.reason === "GRESKA") ? (
            <button
              type="button"
              onClick={() => run(text)}
              disabled={text.trim().length === 0}
              className="igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              {T.helperAgain[locale]}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Opis po delovima, svaki obojen, uz prevod i objašnjenje (prikaz; bez Convex-a). */
export function PromptParts({ locale, result, demo }: { locale: Locale; result: PromptHelperResult; demo: boolean }) {
  return (
    <div className="mt-3 space-y-3">
      <ol className="flex flex-wrap gap-2">
        {result.parts.map((part, index) => (
          <li key={`${part.kind}-${index}`} className={cn("surface-inset max-w-full px-3 py-2", PART_TONE[part.kind])}>
            <span className="block text-xs font-black uppercase tracking-wide">{T.parts[part.kind][locale]}</span>
            <span className="block type-body-sm font-bold">{part.text}</span>
            {locale === "sr" && part.gloss !== part.text ? <span className="block text-xs font-semibold opacity-90">{part.gloss}</span> : null}
          </li>
        ))}
      </ol>
      {result.explanation ? <p className="type-body-sm font-semibold text-ink">{result.explanation}</p> : null}
      {demo ? <p className="text-xs font-bold text-muted">{T.helperDemo[locale]}</p> : null}
    </div>
  );
}
