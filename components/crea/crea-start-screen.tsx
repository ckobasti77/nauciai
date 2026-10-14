"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { CREA_ICONS } from "@/components/crea/crea-icons";
import { CreaRecipeCards } from "@/components/crea/recipes/recipe-cards";
import { CreaStartHero } from "@/components/igra/crea/crea-start-hero";
import { CREA_SHELL_COPY, CREA_START_COPY } from "@/lib/crea-copy";
import { CREA_GOALS, goalHref } from "@/lib/crea-goals";
import { CREA_AREA_META, CREA_AREAS, creaModeDef, creaShellQuery } from "@/lib/crea-shell";
import { toolById } from "@/lib/crea-tools";
import { IGRA_CREA_COPY } from "@/lib/igra-copy";
import type { Locale } from "@/lib/i18n";
import { creaMotionFor } from "@/lib/motion-contract";

const TILE_SUB = {
  slika: IGRA_CREA_COPY.tileSubSlika,
  video: IGRA_CREA_COPY.tileSubVideo,
  zvuk: IGRA_CREA_COPY.tileSubZvuk,
} as const;

/**
 * „Šta praviš danas?" (U2): heroj sa tri radionice i njihovim likovima (IGRA K15), kartice po cilju (kartice za sliku vode u recepte, K15),
 * pa svi recepti po grupama. Svaka je pravi link (deljiv, otvara
 * se i u novom tabu) koji vodi u oblast i režim sa popunjenim opisom i
 * preporučenim modelom. Na telefonu mreža 2 × N.
 */
export function CreaStartScreen({
  locale,
  pathname,
  searchParams,
}: {
  locale: Locale;
  pathname: string;
  searchParams: URLSearchParams;
}) {
  const reduceMotion = useReducedMotion();
  const crea = creaMotionFor(Boolean(reduceMotion));
  const tiles = CREA_AREAS.map((area) => ({
    area,
    href: `${pathname}?${creaShellQuery({ area, mode: null }, searchParams)}`,
    label: CREA_AREA_META[area].label[locale],
    sub: TILE_SUB[area][locale],
  }));

  return (
    <section aria-labelledby="crea-start-title" className="min-w-0">
      <CreaStartHero locale={locale} title={CREA_START_COPY.title[locale]} titleId="crea-start-title" tiles={tiles} />
      <p className="mt-6 max-w-2xl type-body-sm font-semibold text-muted">{CREA_START_COPY.body[locale]}</p>

      <ul className="mt-4 grid grid-cols-2 gap-3 @min-[640px]:grid-cols-3 @min-[1000px]:grid-cols-4 sm:gap-4">
        {CREA_GOALS.map((goal, index) => {
          const Icon = CREA_ICONS[goal.icon];
          const AreaIcon = CREA_ICONS[CREA_AREA_META[goal.area].icon];
          const mode = creaModeDef(goal.area, goal.mode);
          return (
            // Kartice se okreću na mesto kao listovi sveske (K25, U16).
            <motion.li
              key={goal.id}
              initial={reduceMotion ? false : { opacity: 0, rotateY: crea.sheetFlip.rotateY }}
              animate={{ opacity: 1, rotateY: 0 }}
              transition={{
                duration: crea.sheetFlip.duration,
                ease: crea.sheetFlip.ease,
                delay: Math.min(index, crea.sheetFlip.maxStaggerItems) * crea.sheetFlip.stagger,
              }}
              style={{ transformOrigin: "0% 50%", transformPerspective: 1100 }}
              className="min-w-0"
            >
              <Link
                href={`${pathname}${goalHref(goal, searchParams)}`}
                className="group surface-card flex h-full min-h-[148px] flex-col border-2 border-ink bg-paper-strong p-3.5 text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition-[translate,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--shadow-hard)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0 motion-reduce:transition-none sm:p-4"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="paper-island grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-2 size-4 shrink-0 text-muted transition-colors group-hover:text-ink"
                  />
                </span>
                <span className="mt-3 type-h4 text-ink">{goal.title[locale]}</span>
                <span className="mt-1 type-body-sm font-semibold leading-snug text-muted">{goal.hint[locale]}</span>
                <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-xs font-black text-muted">
                  <AreaIcon aria-hidden="true" className="size-3.5" />
                  <span>
                    {CREA_AREA_META[goal.area].label[locale]} · {mode.label[locale]}
                  </span>
                  {mode.status === "soon" || toolById(goal.toolId)?.status === "soon" ? (
                    <span className="rounded-full border border-ink/30 px-1.5 py-px type-eyebrow-sm">
                      {CREA_SHELL_COPY.soonBadge[locale]}
                    </span>
                  ) : null}
                </span>
              </Link>
            </motion.li>
          );
        })}
      </ul>

      <CreaRecipeCards locale={locale} pathname={pathname} searchParams={searchParams} />
    </section>
  );
}
