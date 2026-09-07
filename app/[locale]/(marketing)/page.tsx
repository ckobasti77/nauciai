import type { Metadata } from "next";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { locales, normalizeLocale, publicMeta, withLocale } from "@/lib/i18n";
import { getPlanPricing, getPremiumCredits } from "@/lib/pricing-data";
import { alternatesFor } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** Javni fleg Studija (N3) — bira metu hero CTA „Otvori Studio" za goste. Bez
 *  Convex-a (ili na grešci) pada na OFF, isti podrazumevani smer kao na serveru. */
async function getStudioPublic(): Promise<boolean> {
  const convex = getConvexHttpClient();
  if (!convex) return false;
  try {
    return Boolean(await convex.query(convexQueries.isStudioPublicEnabled, {}));
  } catch {
    return false;
  }
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).locale);
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const title = publicMeta.home.title[locale];
  const description = publicMeta.home.description[locale];
  return {
    title,
    description,
    alternates: alternatesFor(origin, "/", locale),
    openGraph: { title, description, type: "website", url: withLocale(locale) },
  };
}

export default async function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const [viewerProfile, premiumCredits, pricing, studioPublic] = await Promise.all([
    getCurrentViewerProfile(),
    getPremiumCredits(),
    getPlanPricing(),
    getStudioPublic(),
  ]);

  return (
    <MarketingPage
      locale={locale}
      viewerProfile={viewerProfile}
      premiumCredits={premiumCredits}
      pricing={pricing}
      studioPublic={studioPublic}
    />
  );
}
