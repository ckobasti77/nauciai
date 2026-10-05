"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";

import { ElementCover, useMyElements, type MyElement } from "@/components/crea/elements/shared";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { CREA_RECIPE_COPY as T } from "@/lib/crea-recipes-copy";
import type { Locale } from "@/lib/i18n";

/** Najviše slika jednog lika koje idu modelu (isto kao `ELEMENT_REFS_PER_ELEMENT`, K14). */
export const CHARACTER_REF_IMAGES = 3;

/** Slike lika koje idu modelu kao reference. */
export function characterImages(element: MyElement): string[] {
  return element.images.slice(0, CHARACTER_REF_IMAGES).map((image) => image.storageId);
}

/**
 * Izbor sačuvanog Lika (K14) za recept ili nalepnice: naslovna slika + ime, kao
 * radio grupa. Bez likova - poziv u „Likove".
 */
export function CharacterPicker({
  locale,
  legend,
  hint,
  enabled,
  value,
  onChange,
  charactersHref,
  disabled,
}: {
  locale: Locale;
  legend: string;
  hint?: string;
  enabled: boolean;
  value: string | null;
  onChange: (element: MyElement) => void;
  charactersHref: string;
  disabled?: boolean;
}) {
  const elements = useMyElements(enabled);
  const characters = (elements ?? []).filter((element) => element.kind === "lik" && element.images.length > 0);

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="type-body-sm font-black text-ink">{legend}</legend>
      {hint ? <p className="mt-1 type-body-sm font-semibold text-muted">{hint}</p> : null}
      {elements === undefined && enabled ? (
        <Spinner size="sm" className="mt-3 text-muted" />
      ) : characters.length === 0 ? (
        <div className="surface-inset mt-2 flex flex-wrap items-center gap-3 bg-paper p-3">
          <UserRound aria-hidden="true" className="size-5 shrink-0 text-muted" />
          <p className="min-w-0 flex-1 type-body-sm font-semibold text-muted">{T.noCharacters[locale]}</p>
          <Link
            href={charactersHref}
            className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper-strong px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {T.openCharacters[locale]}
          </Link>
        </div>
      ) : (
        <div role="radiogroup" aria-label={legend} className="mt-2 flex flex-wrap gap-2">
          {characters.map((element) => {
            const selected = value === element._id;
            return (
              <button
                key={element._id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(element)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-4 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  selected ? "border-ink bg-ink text-paper-strong" : "border-ink/25 bg-paper text-ink hover:border-ink",
                )}
              >
                <ElementCover element={element} className="size-9 shrink-0 rounded-full" />
                <span className="max-w-40 truncate">{element.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
