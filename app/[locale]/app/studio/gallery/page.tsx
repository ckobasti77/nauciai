import type { Metadata } from "next";

import { StudioGalleryPage } from "@/components/app/studio-gallery-page";
import { Panel, SectionHeader } from "@/components/ui/primitives";
import { appPageMetadata } from "@/lib/app-metadata";
import { normalizeLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Galerija", en: "Gallery" });
}

export default async function StudioGalleryRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  // Isti fallback obrazac kao `/app/studio` i `/app/credits`: bez Convex URL-a
  // nema provider-a, pa stranica kaže zašto umesto da padne pri renderu.
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title={locale === "sr" ? "Galerija" : "Gallery"}
          body={
            locale === "sr"
              ? "Sve tvoje generacije na jednom mestu."
              : "All your generations in one place."
          }
        />
        <Panel className="p-6">
          <p className="text-base font-bold text-muted">
            {locale === "sr"
              ? "Backend nije povezan na ovoj instalaciji, pa galerija ne može da učita generacije."
              : "The backend is not connected on this installation, so the gallery cannot load generations."}
          </p>
        </Panel>
      </div>
    );
  }

  return <StudioGalleryPage locale={locale} />;
}
