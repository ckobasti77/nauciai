import type { Metadata } from "next";

import { EmailVerificationPage } from "@/components/app/email-verification-page";
import { locales, normalizeLocale, publicMeta, type Locale } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).locale);
  // Token-gated utility strana — van indeksa, ali sa smislenim naslovom/opisom.
  return {
    title: publicMeta.verifyEmail.title[locale],
    description: publicMeta.verifyEmail.description[locale],
    robots: { index: false, follow: false },
  };
}

export default async function VerifyEmailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const locale = normalizeLocale(localeParam) as Locale;
  const rawToken = resolvedSearchParams.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  return <EmailVerificationPage locale={locale} token={token} />;
}
