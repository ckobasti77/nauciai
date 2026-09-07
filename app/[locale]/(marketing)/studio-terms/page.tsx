import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { locales, normalizeLocale, type Locale } from "@/lib/i18n";
import { STUDIO_TERMS } from "@/lib/legal-copy";
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
  const title = STUDIO_TERMS.title[locale];
  const description = STUDIO_TERMS.intro[locale];
  return {
    title,
    description,
    alternates: alternatesFor(origin, "/studio-terms", locale),
    openGraph: { title, description, type: "website" },
  };
}

export default async function StudioTermsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam) as Locale;

  return <LegalPage locale={locale} document={STUDIO_TERMS} />;
}
