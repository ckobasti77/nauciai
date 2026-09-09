import type { Metadata } from "next";

import { MascotViewer } from "@/components/marketing/mascot-viewer";
import { HandUnderline } from "@/components/ui/primitives";
import { locales, mascotPageContent, normalizeLocale, type Locale } from "@/lib/i18n";
import { alternatesFor } from "@/lib/routes";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const t = mascotPageContent[locale];
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: alternatesFor(origin, "/3d", locale),
    openGraph: { title: t.metaTitle, description: t.metaDescription, type: "website" },
  };
}

export default async function MascotPreviewRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam) as Locale;
  const t = mascotPageContent[locale];

  return (
    <main data-motion="page" className="sketch-grid min-h-screen bg-surface-a px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-black leading-tight text-ink md:text-5xl" data-motion="copy">
            {t.hero.titleLead}
            {t.hero.titleHighlight}
          </h1>
          <HandUnderline className="mt-5" />
          <p className="mt-6 type-reading type-measure text-muted">{t.hero.subtitle}</p>
        </div>

        <div className="mt-10 pb-10">
          <MascotViewer locale={locale} />
        </div>
      </div>
    </main>
  );
}
