"use client";

import { CircleAlert, MessageSquareText } from "lucide-react";

import { ToolBadges } from "@/components/crea/tool-badges";
import { useCreaDeviceCaps } from "@/components/crea/use-crea-device";
import { cn } from "@/components/ui/primitives";
import { CREA_DEVICE_COPY, CREA_TOOL_COPY } from "@/lib/crea-copy";
import { CREA_CREATE_COPY } from "@/lib/crea-create-copy";
import { deviceProblem } from "@/lib/crea-device";
import type { CreaArea, CreaModeId } from "@/lib/crea-shell";
import { toolsFor } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";

/**
 * Spisak alata jednog režima (K04): gotovi alati kao izbor, a oni koji stižu kao
 * tiha lista imena. Alat koji ovaj uređaj ne može da pokrene se ne nudi - red je
 * ugašen i kaže zašto (U15).
 *
 * `onDescribe` (Slika · Izmeni, K11): prvi red vraća na composer („opiši izmenu
 * rečima"), jer u tom režimu alati stoje pored njega.
 */
export function CreaToolList({
  locale,
  area,
  mode,
  activeToolId,
  onSelect,
  onDescribe,
}: {
  locale: Locale;
  area: CreaArea;
  mode: CreaModeId;
  activeToolId: string | null;
  onSelect: (toolId: string) => void;
  onDescribe?: () => void;
}) {
  const caps = useCreaDeviceCaps();
  const tools = toolsFor(area, mode);
  const ready = tools.filter((tool) => tool.status === "ready");
  const soon = tools.filter((tool) => tool.status === "soon");
  // Slika · Napravi (K13): prvi red je „opiši sliku", ne „opiši izmenu".
  const making = mode === "napravi";
  const describe = making
    ? { title: CREA_CREATE_COPY.describeTitle, body: CREA_CREATE_COPY.describeBody, list: CREA_CREATE_COPY.listTitle }
    : { title: CREA_TOOL_COPY.describeTitle, body: CREA_TOOL_COPY.describeBody, list: CREA_TOOL_COPY.editListTitle };

  return (
    <nav aria-label={(onDescribe ? describe.list : CREA_TOOL_COPY.listTitle)[locale]} className="space-y-4">
      <ul className="surface-card space-y-1 border-2 border-ink bg-paper-strong p-2 shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
        {onDescribe ? (
          <li className="border-b border-line pb-1">
            <button
              type="button"
              onClick={onDescribe}
              className="surface-inset flex w-full gap-3 p-3 text-left text-ink transition-colors duration-150 hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
            >
              <MessageSquareText aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span className="min-w-0">
                <span className="block type-body font-black">{describe.title[locale]}</span>
                <span className="mt-0.5 block type-body-sm font-semibold text-muted">{describe.body[locale]}</span>
                <span className="mt-2 inline-block rounded-full border border-ink/30 bg-paper px-2 py-0.5 text-xs font-black text-ink">
                  {CREA_TOOL_COPY.badges.krediti[locale]}
                </span>
              </span>
            </button>
          </li>
        ) : null}
        {ready.map((tool) => {
          const active = tool.id === activeToolId;
          const problem = caps ? deviceProblem(tool, caps) : null;
          const blocked = problem !== null && !problem.ok;
          return (
            <li key={tool.id}>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                disabled={blocked}
                onClick={() => onSelect(tool.id)}
                className={cn(
                  "surface-inset block w-full p-3 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed motion-reduce:transition-none",
                  active ? "bg-ink text-paper-strong" : "text-ink hover:bg-paper",
                )}
              >
                <span className="block type-body font-black">{tool.title[locale]}</span>
                <span className={cn("mt-0.5 block type-body-sm font-semibold", active ? "text-paper-strong/85" : "text-muted")}>
                  {tool.summary[locale]}
                </span>
                {problem && !problem.ok ? (
                  <span className="mt-2 flex gap-1.5 type-body-sm font-bold">
                    <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    {CREA_DEVICE_COPY.reasons[problem.reason][locale]}
                  </span>
                ) : (
                  <ToolBadges tool={tool} locale={locale} onInk={active} className="mt-2" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {soon.length > 0 ? (
        <div>
          <h3 className="type-body-sm font-black text-ink">{CREA_TOOL_COPY.soonTitle[locale]}</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {soon.map((tool) => (
              <li
                key={tool.id}
                className="rounded-full border border-ink/25 px-2.5 py-1 text-xs font-bold text-muted"
              >
                {tool.title[locale]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
