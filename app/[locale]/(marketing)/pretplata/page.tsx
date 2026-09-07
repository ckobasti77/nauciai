import type { Metadata } from "next";

import { buildPricingMetadata, PricingPage } from "@/components/marketing/pricing-page";
import { normalizeLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return buildPricingMetadata(normalizeLocale((await params).locale));
}

/**
 * Srpska ruta strane pretplate; engleska je `/pricing`, ista komponenta. Segment je
 * jedini javni koji se prevodi (`pricingPath`), a suprotnu kombinaciju
 * (`/en/pretplata`) preusmerava `redirects()` u `next.config.ts` — da isti sadržaj
 * nikad ne postoji na dva URL-a.
 */
export default async function PretplataRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return <PricingPage locale={normalizeLocale((await params).locale)} />;
}
