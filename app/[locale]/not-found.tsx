"use client";

import { Compass, Home, MessageSquare, PlayCircle } from "lucide-react";
import { usePathname } from "next/navigation";

import { BrandMark, LinkButton, SketchIcon } from "@/components/ui/primitives";
import { normalizeLocale, notFoundContent, withLocale } from "@/lib/i18n";

/**
 * Zajednička 404 stranica u živi-papir stilu. `not-found.tsx` u App Router-u NE
 * dobija route params (renderuje se van param konteksta), pa se jezik izvlači iz
 * `usePathname()` — `/en/...` → "en", sve ostalo padne na `sr` kroz `normalizeLocale`.
 * Stranica sedi van `(marketing)` grupe, pa nema deljeni header/footer; tri
 * `LinkButton`-a nose povratak (početna / kursevi / zajednica).
 */
export default function NotFound() {
  const pathname = usePathname();
  const locale = normalizeLocale(pathname?.split("/")[1]);
  const c = notFoundContent[locale];

  return (
    <main className="flex min-h-[80svh] flex-col items-center justify-center gap-8 bg-paper px-4 py-16 text-center text-ink">
      <BrandMark href={withLocale(locale)} />
      <div className="flex flex-col items-center">
        <SketchIcon>
          <Compass className="size-5" aria-hidden="true" />
        </SketchIcon>
        <p className="mt-6 type-eyebrow text-muted">{c.eyebrow}</p>
        <p className="mt-2 type-display tabular-nums text-ink">404</p>
        <h1 className="mt-2 type-h1 text-ink">{c.title}</h1>
        <p className="mx-auto mt-3 max-w-md type-body text-muted">{c.body}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <LinkButton href={withLocale(locale)} tone="yellow">
            <Home className="size-4" aria-hidden="true" />
            {c.home}
          </LinkButton>
          <LinkButton href={`${withLocale(locale)}#courses`} tone="paper">
            <PlayCircle className="size-4" aria-hidden="true" />
            {c.courses}
          </LinkButton>
          <LinkButton href={withLocale(locale, "/community")} tone="paper">
            <MessageSquare className="size-4" aria-hidden="true" />
            {c.community}
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
