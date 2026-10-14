/* eslint-disable @next/next/no-img-element -- naslovne slike elemenata su potpisani Convex URL-ovi. */
"use client";

import { AtSign, X } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type KeyboardEvent, type RefObject, type SyntheticEvent } from "react";

import { cn } from "@/components/ui/primitives";
import {
  insertMention,
  mentionAtCaret,
  mentionedElements,
  removeMention,
  suggestElements,
  type ElementImage,
  type ElementKind,
} from "@/convex/creaElementsCore";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_ELEMENT_KIND_COPY, CREA_MENTION_COPY } from "@/lib/crea-elements-copy";
import type { Locale } from "@/lib/i18n";

/**
 * @pominjanje u opisu (K14, S34/V6): dok korisnik kuca `@`, ispod polja se
 * otvori spisak njegovih likova (strelice, Enter/Tab bira, Esc zatvara); svaki
 * pomenut element stoji kao čip iznad polja (× ga briše iz opisa). Mapiranje u
 * ulaze modela radi composer (`creaElementsCore.elementInputs`).
 */

export type MentionElement = {
  _id: string;
  kind: ElementKind;
  name: string;
  handle: string;
  description: string | null;
  images: ReadonlyArray<ElementImage & { url: string | null }>;
};

export function useElementMentions<E extends MentionElement>({
  elements,
  prompt,
  onChange,
  textareaRef,
}: {
  elements: readonly E[] | undefined;
  prompt: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const listboxId = useId();
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  // `@` na ovom mestu je korisnik zatvorio (Esc) - spisak se ne otvara ponovo dok ne kuca dalje.
  const [dismissed, setDismissed] = useState<string | null>(null);

  const list = useMemo<readonly E[]>(() => elements ?? [], [elements]);
  const at = elements !== undefined && caret !== null ? mentionAtCaret(prompt, caret) : null;
  const atKey = at ? `${at.start}:${at.query}` : null;
  const open = at !== null && atKey !== dismissed;
  const suggestions = open && at ? suggestElements(list, at.query) : [];
  const activeIndex = suggestions.length > 0 ? Math.min(active, suggestions.length - 1) : 0;
  // Isti niz dok se opis i elementi ne promene - composer od njega računa ulaze i cenu.
  const mentioned = useMemo(() => mentionedElements(prompt, list), [prompt, list]);

  function moveCaret(position: number) {
    setCaret(position);
    requestAnimationFrame(() => {
      const field = textareaRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(position, position);
    });
  }

  function pick(element: E) {
    if (!at || caret === null) return;
    const next = insertMention(prompt, at.start, caret, element.handle);
    onChange(next.text);
    setActive(0);
    moveCaret(next.caret);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissed(atKey);
      return;
    }
    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      pick(suggestions[activeIndex]);
    }
  }

  function trackCaret(event: SyntheticEvent<HTMLTextAreaElement>) {
    setCaret(event.currentTarget.selectionStart);
  }

  /** Dugme „Lik": upiše `@` na mesto kursora i otvori spisak. */
  function openPicker() {
    // Poslednji položaj kursora koji je korisnik stvarno postavio; inače na kraj opisa
    // (polje koje nije bilo u fokusu prijavljuje 0, pa bi `@` pao ispred prve reči).
    const position = Math.min(caret ?? prompt.length, prompt.length);
    const before = prompt.slice(0, position);
    const after = prompt.slice(position);
    const glue = before.length === 0 || /\s$/.test(before) ? "" : " ";
    const tail = after.length === 0 || /^\s/.test(after) ? "" : " ";
    onChange(`${before}${glue}@${tail}${after}`);
    setDismissed(null);
    setActive(0);
    moveCaret(position + glue.length + 1);
  }

  function remove(element: E) {
    onChange(removeMention(prompt, element, list));
  }

  const comboboxProps =
    elements === undefined
      ? {}
      : {
          role: "combobox" as const,
          "aria-autocomplete": "list" as const,
          "aria-expanded": open,
          "aria-controls": listboxId,
          ...(open && suggestions.length > 0 ? { "aria-activedescendant": `${listboxId}-${activeIndex}` } : {}),
          onKeyDown,
          onSelect: trackCaret,
          onClick: trackCaret,
          onKeyUp: trackCaret,
        };

  return { open, suggestions, activeIndex, setActive, pick, mentioned, remove, openPicker, listboxId, comboboxProps, query: at?.query ?? "" };
}

/** Spisak predloga ispod polja (u toku dokumenta, pa radi i u fioci na telefonu). */
export function MentionSuggestions<E extends MentionElement>({
  locale,
  listboxId,
  suggestions,
  activeIndex,
  onHover,
  onPick,
  hasElements,
  createHref,
}: {
  locale: Locale;
  listboxId: string;
  suggestions: readonly E[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (element: E) => void;
  hasElements: boolean;
  createHref: string | null;
}) {
  return (
    <div className="surface-inset mt-2 border border-line bg-paper p-1.5">
      <p className="px-2 pb-1 pt-0.5 text-xs font-black text-muted">{CREA_MENTION_COPY.listLabel[locale]}</p>
      {suggestions.length > 0 ? (
        <ul id={listboxId} role="listbox" aria-label={CREA_MENTION_COPY.listLabel[locale]} className="grid gap-0.5">
          {suggestions.map((element, index) => (
            <li
              key={element._id}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // `mousedown` + `preventDefault`: polje ne gubi fokus (ni kursor) pre izbora.
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(element);
              }}
              onMouseEnter={() => onHover(index)}
              className={cn(
                "surface-inset flex min-h-11 cursor-pointer items-center gap-2.5 px-2 py-1.5",
                index === activeIndex ? "bg-ink text-paper-strong" : "text-ink hover:bg-paper-strong",
              )}
            >
              <MentionAvatar element={element} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">{element.name}</span>
                <span className={cn("block truncate font-mono text-xs font-bold", index === activeIndex ? "text-paper-strong/80" : "text-muted")}>
                  @{element.handle} · {CREA_ELEMENT_KIND_COPY[element.kind].one[locale]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div id={listboxId} role="listbox" aria-label={CREA_MENTION_COPY.listLabel[locale]} className="flex flex-wrap items-center gap-2 px-2 py-2">
          <span className="text-sm font-bold text-muted">{hasElements ? CREA_MENTION_COPY.noMatch[locale] : CREA_MENTION_COPY.none[locale]}</span>
          {!hasElements && createHref ? (
            <Link
              href={createHref}
              className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {CREA_MENTION_COPY.create[locale]}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MentionAvatar({ element }: { element: MentionElement }) {
  const url = element.images[0]?.url ?? null;
  return url ? (
    <img src={url} alt="" className="size-8 shrink-0 rounded-full object-cover shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]" />
  ) : (
    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-paper-strong">
      <AtSign className="size-4" />
    </span>
  );
}

/** Pomenuti elementi kao čipovi iznad polja; uz svaki broj slika koje idu modelu. */
export function MentionChips<E extends MentionElement>({
  locale,
  elements,
  sentCounts,
  onRemove,
  disabled,
}: {
  locale: Locale;
  elements: readonly E[];
  /** Koliko slika elementa ide modelu (iz mapiranja); bez broja dok mapiranje nije moguće. */
  sentCounts: ReadonlyMap<string, number>;
  onRemove: (element: E) => void;
  disabled?: boolean;
}) {
  if (elements.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-2" aria-label={CREA_MENTION_COPY.listLabel[locale]}>
      {elements.map((element) => {
        const count = sentCounts.get(element.handle);
        return (
          <li key={element._id} className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-yellow py-0.5 pl-0.5 pr-0.5 text-ink">
            <MentionAvatar element={element} />
            <span className="max-w-[10rem] truncate text-xs font-black">@{element.handle}</span>
            {count !== undefined ? <span className="font-mono text-[11px] font-bold">×{count}</span> : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(element)}
              aria-label={fillCopy(CREA_MENTION_COPY.remove[locale], { name: element.name })}
              // Vidljivo 32 px, meta za dodir 44 px (`after:` proširuje površinu klika).
              className="relative inline-flex size-8 items-center justify-center rounded-full text-ink after:absolute after:-inset-1.5 after:content-[''] hover:bg-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:opacity-40"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Dugme „Lik" pored polja: upiše `@` i otvori spisak (za one koji ne znaju za `@`). */
export function MentionButton({ locale, onClick, disabled }: { locale: Locale; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={CREA_MENTION_COPY.buttonLabel[locale]}
      aria-label={CREA_MENTION_COPY.buttonLabel[locale]}
      className="igra-press igra-shadow igra-depth-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-3 py-1.5 text-xs font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
    >
      <AtSign aria-hidden="true" className="size-3.5" />
      <span>{CREA_MENTION_COPY.button[locale]}</span>
    </button>
  );
}
