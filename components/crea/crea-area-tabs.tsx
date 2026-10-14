"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { CREA_ICONS } from "@/components/crea/crea-icons";
import { cn } from "@/components/ui/primitives";
import { CREA_SHELL_COPY } from "@/lib/crea-copy";
import { CREA_AREA_META, CREA_AREAS, type CreaArea } from "@/lib/crea-shell";
import type { Locale } from "@/lib/i18n";

export const CREA_AREA_PANEL_ID = "crea-area-panel";

/**
 * Strelice levo/desno (i Home/End) šetaju fokus po tabovima; Enter ili razmak
 * aktivira (ručna aktivacija - svaki tab je navigacija, pa strelica ne sme da
 * okida novu adresu na svaki pritisak).
 */
export function moveTabFocus(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
  const index = tabs.indexOf(document.activeElement as HTMLElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.focus();
}

/** Drži izabrani tab u vidu u vodoravnoj traci (telefon), bez skrola cele strane. */
export function useKeepActiveTabVisible(activeKey: string) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: Math.max(0, left - 16), behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [activeKey, reduceMotion]);

  return listRef;
}

/**
 * Veliki tabovi radionica: Početak · Slika · Video · Zvuk (U1). Izabrani tab nosi
 * žutu „nalepnicu" koja klizi sa taba na tab (`layoutId`); bez pokreta kad korisnik
 * to traži.
 */
export function CreaAreaTabs({
  locale,
  area,
  onSelect,
}: {
  locale: Locale;
  area: CreaArea | null;
  onSelect: (area: CreaArea | null) => void;
}) {
  const reduceMotion = useReducedMotion();
  const listRef = useKeepActiveTabVisible(area ?? "start");
  const tabs: Array<{ key: CreaArea | null; label: string; Icon: (typeof CREA_ICONS)[keyof typeof CREA_ICONS] }> = [
    { key: null, label: CREA_SHELL_COPY.start[locale], Icon: CREA_ICONS.House },
    ...CREA_AREAS.map((key) => ({ key, label: CREA_AREA_META[key].label[locale], Icon: CREA_ICONS[CREA_AREA_META[key].icon] })),
  ];

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={CREA_SHELL_COPY.areaTabs[locale]}
      onKeyDown={moveTabFocus}
      className="studio-command-row relative -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pt-1 pb-2 sm:gap-3"
    >
      {tabs.map(({ key, label, Icon }) => {
        const selected = key === area;
        return (
          <button
            key={key ?? "start"}
            id={`crea-area-tab-${key ?? "start"}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={CREA_AREA_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              if (!selected) onSelect(key);
            }}
            className={cn(
              "relative inline-flex min-h-12 shrink-0 snap-start items-center gap-2 rounded-full border-2 border-ink px-4 type-h4 text-ink transition-[translate,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none sm:px-5",
              key === null ? "pr-4 sm:pr-4" : "sm:min-w-32 sm:justify-center",
              // `paper-island`: žuta nalepnica je svetlo ostrvo i u tamnoj temi (mastilo tekst
              // ostaje čitljiv na žutom); krem ispod pokriva trenutak dok nalepnica klizi.
              selected
                ? "paper-island bg-paper-strong shadow-[3px_3px_0_0_var(--ink)]"
                : "igra-press igra-shadow igra-depth-2 bg-paper-strong",
            )}
          >
            {selected ? (
              <motion.span
                aria-hidden="true"
                layoutId="crea-area-tab-fill"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                className="absolute inset-0 rounded-full bg-yellow"
              />
            ) : null}
            <Icon aria-hidden="true" className="relative size-5 shrink-0" />
            <span className={cn("relative", key === null && "max-sm:sr-only")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
