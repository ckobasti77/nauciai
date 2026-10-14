import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createElement } from "react";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { IZLOG_PARTS } from "@/components/igra/izlog/registry";
import { cn } from "@/components/ui/primitives";
import { IGRA_FIXTURE_IDS } from "@/lib/igra-fixtures";
import { normalizeLocale, t, withLocale } from "@/lib/i18n";

// Razvojni izlog: nije za pretragu i ne postoji u produkciji (vidi `notFound()` ispod).
// Naslov samo u razvoju: metadata stiže i uz 404, pa bi produkcija inače javila ime izloga.
export const metadata: Metadata = {
  title: process.env.NODE_ENV === "production" ? undefined : "IGRA izlog",
  robots: { index: false, follow: false },
};

/**
 * Izlog IGRA-e (`docs/IGRA-PLAN.md` §8): prezentacione komponente sa test podacima, bez
 * prijave i bez upita - odavde se prave snimci ekrana. Postoji SAMO u razvoju; produkcioni
 * build ovu rutu renderuje kao 404. Delovi (`?deo=`) su u `components/igra/izlog/registry.ts`;
 * `?stanje=novi|aktivan|legenda` bira test korisnika iz `lib/igra-fixtures.ts`.
 */
export default async function IgraIzlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deo?: string; stanje?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const query = await searchParams;
  const part = IZLOG_PARTS.find((item) => item.id === query.deo) ?? IZLOG_PARTS[0]!;
  const stanje = IGRA_FIXTURE_IDS.find((id) => id === query.stanje) ?? "aktivan";

  return (
    <main id="main-content" tabIndex={-1} data-igra-ui className="min-h-screen bg-paper px-4 py-6 text-ink sm:px-6 md:px-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="type-eyebrow text-muted">{t(locale, "Samo u razvoju", "Development only")}</p>
            <h1 className="font-display type-display-sm text-ink">IGRA · {t(locale, "izlog", "showcase")}</h1>
          </div>
          <ThemeToggle locale={locale} className="igra-hit" />
        </header>
        <nav aria-label={t(locale, "Delovi izloga", "Showcase sections")} className="flex flex-wrap gap-2">
          {IZLOG_PARTS.map((item) => (
            <Link
              key={item.id}
              href={`${withLocale(locale, "/igra-izlog")}?deo=${item.id}`}
              aria-current={item.id === part.id ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                item.id === part.id ? "bg-yellow" : "bg-paper-strong hover:bg-paper",
              )}
            >
              {item.label[locale]}
            </Link>
          ))}
        </nav>
        {createElement(part.Part, { locale, stanje })}
      </div>
    </main>
  );
}
