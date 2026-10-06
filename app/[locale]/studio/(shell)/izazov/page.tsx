import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreaChallenge } from "@/components/crea/community/crea-challenge";
import { CREA_CHALLENGE_COPY } from "@/lib/crea-community-copy";
import { isCreaGalleryEnabled } from "@/lib/crea-community-server";
import { normalizeLocale } from "@/lib/i18n";

// Izazov je iza istog flega kao galerija (prijava = objava; ODLUKA K27).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { ...((await isCreaGalleryEnabled()) ? { title: CREA_CHALLENGE_COPY.title[normalizeLocale(locale)] } : {}), robots: { index: false, follow: false } };
}

/** Dnevni izazov Cree (K27, G3): javno `/crea/izazov`. */
export default async function CreaChallengeRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await isCreaGalleryEnabled())) notFound();
  return <CreaChallenge locale={normalizeLocale(locale)} />;
}
