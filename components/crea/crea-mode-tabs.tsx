"use client";

import { motion, useReducedMotion } from "motion/react";

import { moveTabFocus, useKeepActiveTabVisible } from "@/components/crea/crea-area-tabs";
import { CREA_ICONS } from "@/components/crea/crea-icons";
import { cn } from "@/components/ui/primitives";
import { CREA_SHELL_COPY } from "@/lib/crea-copy";
import { CREA_MODES, type CreaArea, type CreaModeId } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

export const CREA_MODE_PANEL_ID = "crea-mode-panel";

/**
 * Režimi jedne radionice (Slika: Napravi · Izmeni · Alati · Likovi…). Vodoravna
 * traka koja se na telefonu skroluje; režim koji još nema sadržaj nosi bedž
 * „uskoro", ali se otvara - pokazuje šta će raditi, nije mrtvo dugme.
 */
export function CreaModeTabs({
  locale,
  area,
  mode,
  onSelect,
}: {
  locale: Locale;
  area: CreaArea;
  mode: CreaModeId;
  onSelect: (mode: CreaModeId) => void;
}) {
  const reduceMotion = useReducedMotion();
  const listRef = useKeepActiveTabVisible(`${area}:${mode}`);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={CREA_SHELL_COPY.modeTabs[locale]}
      onKeyDown={moveTabFocus}
      className="studio-command-row relative -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 py-1 sm:gap-2"
    >
      {CREA_MODES[area].map((def) => {
        const selected = def.id === mode;
        const Icon = CREA_ICONS[def.icon];
        return (
          <button
            key={def.id}
            id={`crea-mode-tab-${def.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={CREA_MODE_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (!selected) onSelect(def.id);
            }}
            className={cn(
              "relative inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-black transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
              selected ? "border-ink text-paper-strong" : "border-ink/25 text-ink hover:border-ink",
            )}
          >
            {selected ? (
              <motion.span
                aria-hidden="true"
                layoutId={`crea-mode-tab-fill-${area}`}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 560, damping: 40 }}
                className="absolute -inset-0.5 rounded-full bg-ink"
              />
            ) : null}
            <Icon aria-hidden="true" className="relative size-4 shrink-0" />
            <span className="relative whitespace-nowrap">{def.label[locale]}</span>
            {def.status === "soon" ? (
              <span
                className={cn(
                  "relative rounded-full border px-1.5 py-px type-eyebrow-sm",
                  selected ? "border-paper-strong/60 text-paper-strong" : "border-ink/30 text-muted",
                )}
              >
                {CREA_SHELL_COPY.soonBadge[locale]}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
