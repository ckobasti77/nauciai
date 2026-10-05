"use client";

import { Layers, Palette, PenTool, Sticker, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { CREA_ICONS } from "@/components/crea/crea-icons";
import { CREA_RECIPE_GROUPS, CREA_RECIPES, SERIES_RECIPE_ID, STICKERS_RECIPE_TOOL_ID, type CreaRecipeGroup } from "@/lib/crea-recipes";
import { CREA_RECIPE_COPY as T } from "@/lib/crea-recipes-copy";
import { creaShellQuery, type CreaShellState } from "@/lib/crea-shell";
import type { Locale, LocalizedText } from "@/lib/i18n";

type Card = { id: string; icon: LucideIcon; title: LocalizedText; summary: LocalizedText; next: Partial<CreaShellState> };

/** Kartice koje nisu recepti nego alati/serija, a pripadaju istoj grupi (S38-S41). */
const EXTRA_CARDS: Record<CreaRecipeGroup, readonly Card[]> = {
  ja: [
    {
      id: STICKERS_RECIPE_TOOL_ID,
      icon: Sticker,
      title: T.stickersCard,
      summary: T.stickersCardHint,
      next: { tool: STICKERS_RECIPE_TOOL_ID, recipe: null },
    },
  ],
  posao: [
    { id: "slika.brend-kit", icon: Palette, title: T.brandCard, summary: T.brandCardHint, next: { tool: "slika.brend-kit", recipe: null } },
    { id: SERIES_RECIPE_ID, icon: Layers, title: T.seriesCard, summary: T.seriesCardHint, next: { recipe: SERIES_RECIPE_ID, tool: null } },
    { id: "slika.logo", icon: PenTool, title: T.logoCard, summary: T.logoCardHint, next: { tool: "slika.logo", recipe: null } },
  ],
  proslave: [],
  deca: [],
};

/**
 * Recepti na početnom ekranu (S37, K15), po grupama. Svaka kartica je pravi link
 * (deljiv) koji otvara recept u radionici Slika (`?recept=`) ili alat.
 */
export function CreaRecipeCards({ locale, pathname, searchParams }: { locale: Locale; pathname: string; searchParams: URLSearchParams }) {
  const href = (next: Partial<CreaShellState>) =>
    `${pathname}?${creaShellQuery({ area: "slika", mode: "napravi", goal: null, model: null, ...next }, searchParams)}`;

  return (
    <section aria-labelledby="crea-recipes-title" className="mt-10 min-w-0">
      <h2 id="crea-recipes-title" className="font-display type-display-sm text-ink">
        {T.sectionTitle[locale]}
      </h2>
      <p className="mt-1 max-w-2xl type-body-sm font-semibold text-muted">{T.sectionBody[locale]}</p>
      <div className="mt-5 space-y-6">
        {CREA_RECIPE_GROUPS.map((group) => {
          const cards: Card[] = [
            ...CREA_RECIPES.filter((recipe) => recipe.group === group.id).map((recipe) => ({
              id: recipe.id,
              icon: CREA_ICONS[recipe.icon],
              title: recipe.title,
              summary: recipe.summary,
              next: { recipe: recipe.id, tool: null },
            })),
            ...EXTRA_CARDS[group.id],
          ];
          return (
            <div key={group.id}>
              <h3 className="type-h4 text-ink">{group.label[locale]}</h3>
              <ul className="mt-3 grid grid-cols-2 gap-3 @min-[640px]:grid-cols-3 @min-[1000px]:grid-cols-4">
                {cards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <li key={card.id} className="min-w-0">
                      <Link
                        href={href(card.next)}
                        className="group surface-card flex h-full min-h-[120px] flex-col border-2 border-ink bg-paper p-3 text-ink shadow-[2px_2px_0_0_var(--shadow-hard)] transition-[translate,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--shadow-hard)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0 motion-reduce:transition-none"
                      >
                        <span className="flex items-center gap-2">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink">
                            <Icon aria-hidden="true" className="size-4" />
                          </span>
                          <span className="min-w-0 type-body-sm font-black leading-tight text-ink">{card.title[locale]}</span>
                        </span>
                        <span className="mt-2 line-clamp-3 text-xs font-semibold leading-snug text-muted">{card.summary[locale]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
