"use client";

import { useMutation, useQuery } from "convex/react";
import { CircleCheck, Gift, LockKeyhole, LockKeyholeOpen, Sprout } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useCreaGame } from "@/components/crea/game/crea-game-context";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_MAP_COPY } from "@/lib/crea-game-copy";
import { skillMap, type CreaUnlockState } from "@/lib/crea-skills";
import { CREA_AREA_META, CREA_AREAS, type CreaArea } from "@/lib/crea-shell";
import { toolById } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";

/**
 * Mapa veština (K26, G7) kao stranica sveske: po oblasti, koren su osnovni alati, a
 * grane su mini-lekcije. Svaka grana kaže da li je otključana, koliko si njenih alata
 * probao i nudi lekciju (2 min) ili test. „Otključaj sve" (U10) je za iskusne.
 */
export function CreaSkillMap({
  locale,
  lessonHref,
}: {
  locale: Locale;
  lessonHref: (lessonId: string, test?: boolean) => string;
}) {
  const { game, unlock } = useCreaGame();
  const album = useQuery(api.creaGame.myAlbum, game ? {} : "skip");
  const setUnlockAll = useMutation(api.creaGame.setUnlockAll);
  const owned = useMemo(() => new Set((album?.stickers ?? []).map((s) => s.stickerId)), [album]);
  return (
    <CreaSkillMapView
      locale={locale}
      lessonHref={lessonHref}
      unlock={unlock}
      auto={game?.unlock.auto === true}
      chosen={game?.unlock.chosen === true}
      passed={game?.unlock.lessons ?? []}
      owned={owned}
      onToggleAll={game ? (next) => setUnlockAll({ unlockAll: next }) : null}
    />
  );
}

/** Mapa bez upita - podatke daje `CreaSkillMap` (ili provera izgleda). */
export function CreaSkillMapView({
  locale,
  lessonHref,
  unlock,
  auto,
  chosen,
  passed: passedIds,
  owned,
  onToggleAll,
}: {
  locale: Locale;
  lessonHref: (lessonId: string, test?: boolean) => string;
  unlock: CreaUnlockState;
  auto: boolean;
  chosen: boolean;
  passed: readonly string[];
  owned: ReadonlySet<string>;
  onToggleAll: ((next: boolean) => Promise<unknown>) | null;
}) {
  const [area, setArea] = useState<CreaArea>("slika");
  const [busy, setBusy] = useState(false);
  const map = skillMap(area, unlock, owned);
  const passed = new Set(passedIds);

  async function toggleAll(next: boolean) {
    if (!onToggleAll) return;
    setBusy(true);
    try {
      await onToggleAll(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="type-body type-measure font-semibold text-muted">{CREA_MAP_COPY.intro[locale]}</p>
        {auto ? (
          <p className="type-body-sm font-bold text-muted">{CREA_MAP_COPY.unlockAllAuto[locale]}</p>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              aria-pressed={chosen}
              disabled={busy || !onToggleAll}
              onClick={() => void toggleAll(!chosen)}
              className={cn(
                "igra-press inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink px-4 text-sm font-black text-ink disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                chosen ? "bg-yellow" : "bg-paper-strong",
              )}
            >
              <LockKeyholeOpen aria-hidden="true" className="size-4" />
              {chosen ? CREA_MAP_COPY.showGradual[locale] : CREA_MAP_COPY.unlockAll[locale]}
            </button>
            <p className="max-w-xs text-xs font-semibold text-muted">
              {chosen ? CREA_MAP_COPY.unlockAllOn[locale] : CREA_MAP_COPY.unlockAllHint[locale]}
            </p>
          </div>
        )}
      </div>

      <div role="group" aria-label={CREA_MAP_COPY.title[locale]} className="flex flex-wrap gap-2">
        {CREA_AREAS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={area === id}
            onClick={() => setArea(id)}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none",
              area === id ? "bg-ink text-paper-strong" : "igra-press bg-paper-strong text-ink",
            )}
          >
            {CREA_AREA_META[id].label[locale]}
          </button>
        ))}
      </div>

      {/* Stranica sveske: linije kao u svesci, koren gore, grane ispod na „konopcu". */}
      <section
        aria-label={`${CREA_MAP_COPY.title[locale]}: ${CREA_AREA_META[area].label[locale]}`}
        className="surface-card border-2 border-ink bg-paper-strong bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,var(--line)_31px,var(--line)_32px)] p-4 text-ink shadow-[6px_6px_0_0_var(--shadow-hard-16)] sm:p-6"
      >
        <div className="surface-inset bg-surface-b p-4">
          <p className="flex items-center gap-2 type-h3">
            <Sprout aria-hidden="true" className="size-5" />
            {CREA_MAP_COPY.starter[locale]}
          </p>
          <p className="mt-0.5 type-body-sm font-semibold text-muted">{CREA_MAP_COPY.starterBody[locale]}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {map.starter.tools.map((toolId) => (
              <li key={toolId} className="inline-flex items-center gap-1.5 rounded-full bg-paper-strong px-3 py-1.5 text-sm font-black">
                {owned.has(`alat:${toolId}`) ? <CircleCheck aria-hidden="true" className="size-4" /> : null}
                {toolById(toolId)?.title[locale]}
              </li>
            ))}
          </ul>
        </div>

        <ol className="relative mt-2 space-y-4 pl-8 before:absolute before:bottom-6 before:left-[0.95rem] before:top-0 before:border-l-2 before:border-dashed before:border-ink/40">
          {map.nodes.map(({ lesson, unlocked, tried, total }) => (
            <li key={lesson.id} className="relative pt-4">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -left-[1.55rem] top-8 grid size-6 place-items-center rounded-full border-2 border-ink",
                  unlocked ? "bg-yellow" : "bg-paper-strong",
                )}
              >
                {unlocked ? <LockKeyholeOpen className="size-3" /> : <LockKeyhole className="size-3" />}
              </span>
              <article className="surface-inset bg-paper p-4 shadow-[3px_3px_0_0_var(--shadow-hard)]">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="type-h3">{lesson.title[locale]}</h3>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-black", unlocked ? "bg-ink text-paper-strong" : "bg-surface-b text-ink")}>
                    {unlocked ? CREA_MAP_COPY.unlocked[locale] : CREA_MAP_COPY.locked[locale]}
                  </span>
                  {lesson.freeTry ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow px-2.5 py-0.5 text-xs font-black text-ink">
                      <Gift aria-hidden="true" className="size-3.5" />
                      {CREA_MAP_COPY.freeTry[locale]}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 type-body-sm font-semibold text-muted">{lesson.summary[locale]}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span aria-hidden="true" className="h-2 w-32 overflow-hidden rounded-full bg-surface-b">
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.round((tried / Math.max(1, total)) * 100)}%` }} />
                  </span>
                  <span className="text-xs font-black tabular-nums text-muted">{fillCopy(CREA_MAP_COPY.tried[locale], { n: tried, total })}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-muted">
                  <span className="font-black text-ink">{CREA_MAP_COPY.tools[locale]}:</span>{" "}
                  {lesson.unlocks.map((id) => toolById(id)?.title[locale]).filter(Boolean).join(" · ")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={lessonHref(lesson.id)}
                    className="igra-press igra-shadow-yellow inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-paper-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {passed.has(lesson.id) ? CREA_MAP_COPY.review[locale] : CREA_MAP_COPY.lesson[locale]}
                  </Link>
                  {!passed.has(lesson.id) ? (
                    <Link
                      href={lessonHref(lesson.id, true)}
                      className="igra-press inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      {CREA_MAP_COPY.test[locale]}
                    </Link>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
