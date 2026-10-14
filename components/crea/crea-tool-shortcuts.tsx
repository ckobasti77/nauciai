"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { useCreaGame } from "@/components/crea/game/crea-game-context";
import { useLessonHref } from "@/components/crea/game/crea-locked-tools";
import { cn } from "@/components/ui/primitives";
import { CREA_TOOL_COPY, fillCopy } from "@/lib/crea-copy";
import { CREA_LOCKED_COPY } from "@/lib/crea-game-copy";
import { splitToolsByUnlock } from "@/lib/crea-skills";
import type { CreaArea, CreaModeId } from "@/lib/crea-shell";
import { isLocalTier, toolsFor } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";

/**
 * Alati režima kao red pilula iznad scene (Slika · Izmeni, K11): composer
 * („opiši izmenu") ostaje glavni put, a alat je jedan dodir dalje. Pilula je
 * dugme, pa nosi svoj okvir; grupa nema okvir (jedan okvir po grupi).
 */
export function CreaToolShortcuts({
  locale,
  area,
  mode,
  onSelect,
}: {
  locale: Locale;
  area: CreaArea;
  mode: CreaModeId;
  onSelect: (toolId: string) => void;
}) {
  const { unlock } = useCreaGame();
  const lessonHref = useLessonHref(locale);
  // Postepeno otkrivanje (K26, U10): zaključani alati su jedna pilula ka mini-lekciji.
  const { visible, locked, lessons } = splitToolsByUnlock(toolsFor(area, mode), unlock);
  const ready = visible.filter((tool) => tool.status === "ready");
  if (ready.length === 0 && locked.length === 0) return null;

  return (
    <nav aria-label={CREA_TOOL_COPY.editListTitle[locale]}>
      <h3 className="type-body-sm font-black text-ink">{CREA_TOOL_COPY.shortcutsTitle[locale]}</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {ready.map((tool) => {
          const free = isLocalTier(tool.tier);
          return (
            <li key={tool.id}>
              <button
                type="button"
                onClick={() => onSelect(tool.id)}
                className="igra-press igra-shadow-soft inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {tool.title[locale]}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-black",
                    free ? "bg-ink text-paper-strong" : "border border-ink/30 bg-paper text-ink",
                  )}
                >
                  {(free ? CREA_TOOL_COPY.badges.besplatno : CREA_TOOL_COPY.badges.krediti)[locale]}
                </span>
              </button>
            </li>
          );
        })}
        {locked.length > 0 && lessons[0] ? (
          <li>
            <Link
              href={lessonHref(lessons[0].id)}
              className="igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-dashed border-ink bg-paper px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <LockKeyhole aria-hidden="true" className="size-4" />
              {fillCopy(CREA_LOCKED_COPY.title[locale], { n: locked.length })}
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
