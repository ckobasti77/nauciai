"use client";

/* eslint-disable @next/next/no-img-element -- potpisani Convex URL-ovi izlaza, kao u ostatku radionice. */

import { Check, Clapperboard, Image as ImageIcon, Mic, Music, Square } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import type { Id } from "@/convex/_generated/dataModel";
import type { AssistantStepKind } from "@/convex/creaAssistantCore";
import { assistantTotal, type PricedStep } from "@/lib/crea-assistant";
import { fillCopy } from "@/lib/crea-copy";
import { formatDinars } from "@/lib/crea-dinars";
import { CREA_ASSISTANT_COPY as T } from "@/lib/crea-fair-copy";
import type { Locale } from "@/lib/i18n";
import { studioErrorMessage } from "@/lib/studio-messages";
import { modelLabel } from "@/lib/studio-models";

/** Prikazni delovi pomoćnika (K28, U12) - bez Convex-a, da ih vidi i prikaz za proveru. */

const STEP_ICON: Record<AssistantStepKind, typeof ImageIcon> = { slika: ImageIcon, video: Clapperboard, muzika: Music, govor: Mic };

export type AssistantDraft = { request: string; reply: string; demo: boolean; priced: PricedStep[] };

export type AssistantPlanView = {
  _id: Id<"creaAssistantPlans">;
  request: string;
  status: "running" | "done" | "stopped";
  error: string | null;
  steps: Array<{
    kind: "image" | "video" | "audio";
    title: string;
    maxCredits: number;
    jobId: Id<"generationJobs"> | null;
    status: string | null;
    creditCost: number | null;
    outputUrl: string | null;
    ready: boolean;
  }>;
};

export function credits(value: number, locale: Locale) {
  return `${value} ${locale === "sr" ? "kr" : "cr"}`;
}

export function Bubble({ who, locale, children }: { who: "you" | "helper"; locale: Locale; children: ReactNode }) {
  return (
    <li className={cn("flex", who === "you" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "surface-inset max-w-[92%] px-3.5 py-2.5 type-body-sm",
          who === "you" ? "bg-ink font-bold text-paper-strong" : "border border-line bg-paper text-ink",
        )}
      >
        <span className={cn("block type-eyebrow-sm", who === "you" ? "text-paper-strong/75" : "text-muted")}>
          {who === "you" ? T.you[locale] : T.helper[locale]}
        </span>
        <div className="mt-0.5">{children}</div>
      </div>
    </li>
  );
}

/** Predlog pomoćnika: koraci sa modelom i cenom, ukupno u kreditima i dinarima. */
export function DraftReplyBody({ draft, locale }: { draft: AssistantDraft; locale: Locale }) {
  const total = assistantTotal(draft.priced);
  const runnable = draft.priced.some((entry) => entry.model !== null);
  return (
    <>
  {draft.reply ? <p className="font-bold">{draft.reply}</p> : null}
  {draft.demo ? <p className="mt-1 text-xs font-bold text-muted">{T.demo[locale]}</p> : null}
  <ol className="mt-2 divide-y divide-line">
    {draft.priced.map((entry, index) => {
      const Icon = STEP_ICON[entry.step.kind];
      return (
        <li key={index} className="flex items-start gap-2.5 py-2">
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-black">
              {index + 1}. {T.steps[entry.step.kind][locale]} · {entry.step.title}
            </span>
            <span className="block text-xs font-semibold text-muted">
              {entry.model
                ? `${modelLabel(entry.model, locale)}${entry.fromStep !== undefined ? ` · ${fillCopy(T.fromStep[locale], { step: entry.fromStep + 1 })}` : ""}`
                : T.unavailable[locale]}
            </span>
          </span>
          {entry.model ? (
            <span className="shrink-0 text-right font-mono text-xs font-black tabular-nums">
              {credits(entry.credits, locale)}
            </span>
          ) : null}
        </li>
      );
    })}
  </ol>
  <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2 font-black">
    <span>{T.total[locale]}</span>
    <span className="text-right font-mono tabular-nums">
      {credits(total, locale)}
      <span className="block font-sans text-xs font-bold text-muted">{formatDinars(total, locale)}</span>
    </span>
  </p>
  {runnable ? <p className="mt-2 font-bold">{T.askYes[locale]}</p> : null}
    </>
  );
}

/** Potvrđen plan: koraci jedan za drugim, sa stanjem i cenom. */
export function PlanProgress({ plan, locale, onStop, onNew }: { plan: AssistantPlanView; locale: Locale; onStop: () => void; onNew: () => void }) {
  return (
  <div className="mt-4 border-t border-line pt-4">
    <p className="type-body-sm font-black text-ink">„{plan.request}”</p>
    <p className="mt-1 text-xs font-bold text-muted" role="status">
      {plan.status === "running" ? T.running[locale] : plan.status === "done" ? T.done[locale] : T.stopped[locale]}
      {plan.status === "stopped" && plan.error ? ` ${studioErrorMessage(plan.error, locale)}` : ""}
    </p>
    <ol className="mt-3 divide-y divide-line">
      {plan.steps.map((step, index) => {
        const state = step.ready
          ? T.ready[locale]
          : step.status === "failed" || step.status === "refunded"
            ? T.failed[locale]
            : step.jobId
              ? T.working[locale]
              : T.waiting[locale];
        return (
          <li key={`${plan._id}-${index}`} className="flex items-center gap-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper font-mono text-xs font-black text-ink">
              {step.ready ? <Check aria-hidden="true" className="size-4" /> : index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate type-body-sm font-black text-ink">{step.title}</span>
              <span className="block text-xs font-bold text-muted">
                {state} · {credits(step.creditCost ?? step.maxCredits, locale)}
              </span>
            </span>
            {step.ready && step.outputUrl && step.kind === "image" ? (
              <img src={step.outputUrl} alt="" className="surface-media size-12 shrink-0 object-cover shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
            ) : step.jobId && !step.ready && step.status !== "failed" && step.status !== "refunded" ? (
              <Spinner size="sm" className="text-muted" />
            ) : null}
          </li>
        );
      })}
    </ol>
    <div className="mt-3 flex flex-wrap gap-2">
      {plan.status === "running" ? (
        <button
          type="button"
          onClick={onStop}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-4 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Square aria-hidden="true" className="size-3.5" />
          {T.stop[locale]}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onNew}
        className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {T.newPlan[locale]}
      </button>
    </div>
  </div>
  );
}
