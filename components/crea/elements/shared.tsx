/* eslint-disable @next/next/no-img-element -- slike elementa su potpisani Convex URL-ovi i lokalni `blob:` pregledi. */
"use client";

import { useQuery } from "convex/react";
import { CircleAlert, CircleCheck, CircleX, MapPin, Package, UserRound } from "lucide-react";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { ElementKind } from "@/convex/creaElementsCore";
import { photoCheckItemText } from "@/lib/crea-copy";
import type { PhotoCheckItem, PhotoCheckStatus } from "@/lib/crea-photo-check";
import type { Locale } from "@/lib/i18n";

/**
 * Delovi koje dele ekran „Likovi", kreator, „Zameni lik" i composer (K14).
 */

/** Moji elementi; `undefined` dok se učitavaju, `null` kad nema pristupa (gost). */
export function useMyElements(enabled = true) {
  return useQuery(api.creaElements.listMine, enabled ? {} : "skip");
}

export type MyElement = NonNullable<ReturnType<typeof useMyElements>>[number];

export const ELEMENT_KIND_ICON: Record<ElementKind, typeof UserRound> = {
  lik: UserRound,
  mesto: MapPin,
  predmet: Package,
};

/** Naslovna slika elementa (ili ikona vrste dok slike nema). */
export function ElementCover({
  element,
  className,
}: {
  element: { kind: ElementKind; images: ReadonlyArray<{ url: string | null }> };
  className?: string;
}) {
  const url = element.images[0]?.url ?? null;
  const Icon = ELEMENT_KIND_ICON[element.kind];
  return url ? (
    <img src={url} alt="" className={cn("object-cover", className)} />
  ) : (
    <span aria-hidden="true" className={cn("grid place-items-center bg-paper text-muted", className)}>
      <Icon className="size-1/2 max-h-8 max-w-8" />
    </span>
  );
}

/** Pristanak (O5): ceo red je meta za dodir, kućica stoji uz prvi red teksta. */
export function ConsentCheck({
  id,
  checked,
  onChange,
  text,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  text: string;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="surface-inset flex min-h-11 cursor-pointer gap-3 border border-line bg-paper p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-ink"
      />
      <span className="type-body-sm font-bold text-ink">{text}</span>
    </label>
  );
}

const STATUS_ICON: Record<PhotoCheckStatus, typeof CircleCheck> = { ok: CircleCheck, warn: CircleAlert, fail: CircleX };

export const PHOTO_STATUS_TONE: Record<PhotoCheckStatus, string> = {
  ok: "text-ink",
  warn: "text-amber-700 dark:text-amber-300",
  fail: "text-red-700 dark:text-red-300",
};

/** Stavke provere fotke kao spisak sa ikonom stanja (S35). */
export function PhotoCheckItems({
  items,
  locale,
  className,
  onlyProblems = false,
}: {
  items: readonly PhotoCheckItem[];
  locale: Locale;
  className?: string;
  /** Samo ono što treba popraviti (kompaktan prikaz uz sličicu). */
  onlyProblems?: boolean;
}) {
  const shown = onlyProblems ? items.filter((item) => item.status !== "ok") : items;
  if (shown.length === 0) return null;
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {shown.map((item) => {
        const Icon = STATUS_ICON[item.status];
        return (
          <li key={item.id} className="flex items-start gap-2 py-2 type-body-sm font-semibold text-ink">
            <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", PHOTO_STATUS_TONE[item.status])} />
            <span>{photoCheckItemText(item, locale)}</span>
          </li>
        );
      })}
    </ul>
  );
}
