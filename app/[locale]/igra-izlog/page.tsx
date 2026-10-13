import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { IzlogSlike } from "@/components/igra/izlog/izlog-slike";
import { normalizeLocale, t } from "@/lib/i18n";

// Razvojni izlog: nije za pretragu i ne postoji u produkciji (vidi `notFound()` ispod).
export const metadata: Metadata = {
  title: "IGRA izlog",
  robots: { index: false, follow: false },
};

/**
 * Izlog IGRA-e (`docs/IGRA-PLAN.md` §8): prezentacione komponente sa test podacima, bez
 * prijave i bez upita - odavde se prave snimci ekrana. Postoji SAMO u razvoju; produkcioni
 * build ovu rutu renderuje kao 404. K02 donosi deo „slike i tokeni", ostalo dodaje K05.
 */
export default async function IgraIzlogPage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();

  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

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
        <IzlogSlike locale={locale} />
      </div>
    </main>
  );
}
