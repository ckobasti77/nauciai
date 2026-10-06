import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreaPublicWork } from "@/components/crea/community/crea-public-work";
import type { Id } from "@/convex/_generated/dataModel";
import { CREA_GALLERY_COPY } from "@/lib/crea-community-copy";
import { isCreaGalleryEnabled } from "@/lib/crea-community-server";
import { normalizeLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; workId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  return { ...((await isCreaGalleryEnabled()) ? { title: CREA_GALLERY_COPY.title[normalizeLocale(locale)] } : {}), robots: { index: false, follow: false } };
}

/** Javni rad (K27, G8): `/crea/galerija/<id>` - 404 dok je galerija isključena. */
export default async function CreaPublicWorkRoute({ params }: { params: Params }) {
  const { locale, workId } = await params;
  if (!/^[a-z0-9]{16,64}$/.test(workId) || !(await isCreaGalleryEnabled())) notFound();
  return <CreaPublicWork locale={normalizeLocale(locale)} workId={workId as Id<"creaPublicWorks">} />;
}
