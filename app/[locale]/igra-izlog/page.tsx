import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { IzlogPokret } from "@/components/igra/izlog/izlog-pokret";
import { IzlogSlike } from "@/components/igra/izlog/izlog-slike";
import { cn } from "@/components/ui/primitives";
import { normalizeLocale, t, withLocale } from "@/lib/i18n";

// Razvojni izlog: nije za pretragu i ne postoji u produkciji (vidi `notFound()` ispod).
export const metadata: Metadata = {
  title: "IGRA izlog",
  robots: { index: false, follow: false },
};

/**
 * Izlog IGRA-e (`docs/IGRA-PLAN.md` §8): prezentacione komponente sa test podacima, bez
 * prijave i bez upita - odavde se prave snimci ekrana. Postoji SAMO u razvoju; produkcioni
 * build ovu rutu renderuje kao 404. K02 donosi deo „slike i tokeni", K03 „pokret i 3D"
 * (`?deo=pokret`), ostalo dodaje K05.
 */
export default async function IgraIzlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deo?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const deo = (await searchParams).deo === "pokret" ? "pokret" : "slike";
  const parts = [
    { id: "slike", label: t(locale, "Slike i tokeni", "Images and tokens") },
    { id: "pokret", label: t(locale, "Pokret i 3D", "Motion and 3D") },
  ] as const;

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-paper px-4 py-6 text-ink sm:px-6 md:px-8">
      <div className="mx-auto max-w-[1380px] space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="type-eyebrow text-muted">{t(locale, "Samo u razvoju", "Development only")}</p>
            <h1 className="font-display type-display-sm text-ink">IGRA · {t(locale, "izlog", "showcase")}</h1>
          </div>
          <ThemeToggle locale={locale} />
        </header>
        <nav aria-label={t(locale, "Delovi izloga", "Showcase sections")} className="flex flex-wrap gap-2">
          {parts.map((part) => (
            <Link
              key={part.id}
              href={`${withLocale(locale, "/igra-izlog")}?deo=${part.id}`}
              aria-current={part.id === deo ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 text-sm font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                part.id === deo ? "bg-yellow" : "bg-paper-strong hover:bg-paper",
              )}
            >
              {part.label}
            </Link>
          ))}
        </nav>
        {deo === "pokret" ? <IzlogPokret locale={locale} /> : <IzlogSlike locale={locale} />}
      </div>
    </main>
  );
}
