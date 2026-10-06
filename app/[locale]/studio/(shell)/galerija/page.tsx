import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreaGallery } from "@/components/crea/community/crea-gallery";
import { CREA_GALLERY_COPY } from "@/lib/crea-community-copy";
import { isCreaGalleryEnabled } from "@/lib/crea-community-server";
import { normalizeLocale } from "@/lib/i18n";

// Fleg se čita pri svakom zahtevu: isključena galerija mora da bude 404 odmah, ne posle builda.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // Korisnički sadržaj: dok se galerija ne proveri u praksi, ne ide u pretragu (ODLUKA K27).
  return { ...((await isCreaGalleryEnabled()) ? { title: CREA_GALLERY_COPY.title[normalizeLocale(locale)] } : {}), robots: { index: false, follow: false } };
}

/** Javna galerija Cree (K27, G8): javno `/crea/galerija`, samo dok je fleg `crea_public_gallery` upaljen. */
export default async function CreaGalleryRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await isCreaGalleryEnabled())) notFound();
  return <CreaGallery locale={normalizeLocale(locale)} />;
}
