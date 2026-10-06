"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Bot, Check, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Bubble, credits, DraftReplyBody, PlanProgress, type AssistantDraft } from "@/components/crea/assistant/assistant-parts";
import { PromptCheckCard } from "@/components/crea/fair/prompt-check-card";
import { ToolHeader } from "@/components/crea/tool-runner";
import type { CreaToolProps } from "@/components/crea/tools/types";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { DraftReply } from "@/convex/creaAssistant";
import { ASSISTANT_LIMITS, isConfirmation } from "@/convex/creaAssistantCore";
import { assistantTotal, priceAssistantSteps } from "@/lib/crea-assistant";
import { CREA_ASSISTANT_COPY as T } from "@/lib/crea-fair-copy";
import { studioErrorMessage } from "@/lib/studio-messages";
import type { StudioModel } from "@/lib/studio-models";

type Note = { id: number; who: "you" | "helper"; body: ReactNode };

/**
 * Pomoćnik (K28, U12): rečenica → koraci → ukupna cena → „da". Ništa plaćeno ne
 * kreće bez izričitog „da" (`creaAssistant.confirmPlan` ga traži i na serveru);
 * sledeći korak kreće tek kad prethodni stigne (`advancePlan`).
 */
export default function AssistantTool({ tool, locale, paid, projectId }: CreaToolProps) {
  const draftPlan = useAction(api.creaAssistant.draftPlan);
  const confirmPlan = useMutation(api.creaAssistant.confirmPlan);
  const advancePlan = useMutation(api.creaAssistant.advancePlan);
  const stopPlan = useMutation(api.creaAssistant.stopPlan);
  const latest = useQuery(api.creaAssistant.getLatestPlan, {});

  const [text, setText] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidePlanId, setHidePlanId] = useState<string | null>(null);
  const noteId = useRef(0);

  const available = useMemo(
    () => (model: StudioModel) => !(paid?.publicEnabled && !paid.isStaff && paid.providerStatus?.[model.provider] === false),
    [paid],
  );

  const plan = latest && latest._id !== hidePlanId ? latest : null;
  const showProgress = plan !== null && draft === null && (plan.status === "running" || notes.length === 0);

  // Sledeći korak kreće kad prethodni stigne (ili plan staje kad prethodni padne). Jedan poziv po stanju.
  const advanced = useRef<string | null>(null);
  useEffect(() => {
    if (!plan || plan.status !== "running") return;
    const current = plan.steps.reduce((last, step, index) => (step.jobId ? index : last), -1);
    const step = plan.steps[current];
    if (!step) return;
    const settled = step.ready || step.status === "failed" || step.status === "refunded";
    const key = `${plan._id}:${current}:${step.status}:${step.ready}`;
    if (!settled || advanced.current === key) return;
    advanced.current = key;
    void advancePlan({ planId: plan._id }).catch((thrown: unknown) => setError(studioErrorMessage(String(thrown), locale)));
  }, [plan, advancePlan, locale]);

  function say(who: "you" | "helper", body: ReactNode) {
    noteId.current += 1;
    const id = noteId.current;
    setNotes((list) => [...list, { id, who, body }]);
  }

  async function handlePlan(event: FormEvent) {
    event.preventDefault();
    const request = text.trim();
    if (!request || busy || !paid) return;
    setBusy(true);
    setError(null);
    setBlocked(null);
    setDraft(null);
    setHidePlanId(latest?._id ?? null);
    say("you", request);
    try {
      const reply: DraftReply = await draftPlan({ text: request, locale });
      if (!reply.ok) {
        if (reply.reason === "PROVERA") setBlocked(reply.category);
        else say("helper", reply.reason === "LIMIT" ? T.limit[locale] : T.error[locale]);
        return;
      }
      setDraft({ request, reply: reply.reply, demo: reply.demo, priced: priceAssistantSteps(reply.steps, paid.catalog, available) });
      setText("");
    } catch {
      say("helper", T.error[locale]);
    } finally {
      setBusy(false);
    }
  }

  async function handleAnswer(value: string) {
    if (!draft || busy) return;
    say("you", value);
    setAnswer("");
    if (!isConfirmation(value)) {
      // Bez „da" se ništa ne šalje serveru.
      say("helper", T.notYes[locale]);
      setDraft(null);
      return;
    }
    const steps = draft.priced.filter((entry) => entry.model !== null);
    setBusy(true);
    setError(null);
    try {
      await confirmPlan({
        answer: value,
        request: draft.request,
        steps: steps.map((entry) => ({
          kind: entry.model!.kind,
          title: entry.step.title,
          modelSlug: entry.model!.slug,
          inputMode: entry.inputMode,
          params: JSON.stringify(entry.params),
          maxCredits: entry.credits,
          ...(entry.fromStep !== undefined ? { fromStep: entry.fromStep } : {}),
        })),
        ...(projectId ? { projectId } : {}),
      });
      setDraft(null);
      setNotes([]);
      setHidePlanId(null);
    } catch (thrown) {
      setError(studioErrorMessage(thrown instanceof Error ? thrown.message : String(thrown), locale));
    } finally {
      setBusy(false);
    }
  }

  const total = draft ? assistantTotal(draft.priced) : 0;
  const runnable = draft ? draft.priced.some((entry) => entry.model !== null) : false;

  return (
    <section aria-labelledby="crea-tool-title" className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard)] sm:p-6">
      <ToolHeader tool={tool} locale={locale} icon={<Bot aria-hidden="true" className="size-5" />} />

      {showProgress && plan ? (
        <PlanProgress plan={plan} locale={locale} onStop={() => void stopPlan({ planId: plan._id })} onNew={() => setHidePlanId(plan._id)} />
      ) : (
        <div className="mt-4 border-t border-line pt-4">
          <p className="type-body-sm font-semibold text-muted">{T.intro[locale]}</p>

          {notes.length > 0 || draft ? (
            <ol className="mt-4 space-y-2.5" aria-live="polite">
              {notes.map((note) => (
                <Bubble key={note.id} who={note.who} locale={locale}>
                  {note.body}
                </Bubble>
              ))}
              {draft ? (
                <Bubble who="helper" locale={locale}>
                  <DraftReplyBody draft={draft} locale={locale} />
                </Bubble>
              ) : null}
            </ol>
          ) : null}

          {blocked ? <PromptCheckCard locale={locale} category={blocked} onClose={() => setBlocked(null)} /> : null}
          {error ? (
            <p role="alert" className="mt-3 text-xs font-black text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : null}

          {draft && runnable ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAnswer("da")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {busy ? <Spinner size="sm" /> : <Check aria-hidden="true" className="size-4 text-yellow" />}
                  {T.yes[locale]} · {credits(total, locale)}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAnswer(locale === "sr" ? "ne" : "no")}
                  className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                >
                  {T.no[locale]}
                </button>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (answer.trim()) void handleAnswer(answer.trim());
                }}
              >
                <label className="sr-only" htmlFor="crea-assistant-answer">
                  {T.answerLabel[locale]}
                </label>
                <input
                  id="crea-assistant-answer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder={locale === "sr" ? "da" : "yes"}
                  className="surface-inset min-h-11 min-w-0 flex-1 border-2 border-ink bg-paper-strong px-3 text-sm font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                />
                <button
                  type="submit"
                  aria-label={T.send[locale]}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <Send aria-hidden="true" className="size-4" />
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={(event) => void handlePlan(event)} className="mt-4">
              <label htmlFor="crea-assistant-text" className="sr-only">
                {T.placeholder[locale]}
              </label>
              <textarea
                id="crea-assistant-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={ASSISTANT_LIMITS.textChars}
                rows={3}
                placeholder={T.placeholder[locale]}
                className="surface-inset w-full resize-y border-2 border-ink bg-paper-strong p-3 type-body-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={busy || text.trim().length === 0 || !paid}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_0_var(--ink)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {busy ? <Spinner size="sm" /> : <Bot aria-hidden="true" className="size-4" />}
                  {busy ? T.planning[locale] : T.plan[locale]}
                </button>
                <span className="text-xs font-bold text-muted">{T.free[locale]}</span>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
