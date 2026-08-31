import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { locales, normalizeLocale, type Locale } from "@/lib/i18n";
import { STUDIO_TERMS } from "@/lib/legal-copy";

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
  const title = STUDIO_TERMS.title[locale];
  const description = STUDIO_TERMS.intro[locale];
  return {
    title,
    description,
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
