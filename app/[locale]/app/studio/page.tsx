import type { Metadata } from "next";

import { StudioPage } from "@/components/app/studio-page";
import { Panel, SectionHeader } from "@/components/ui/primitives";
import { appPageMetadata } from "@/lib/app-metadata";
import { normalizeLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Studio", en: "Studio" });
}

export default async function StudioRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  // Katalog, balans i status posla su Convex pretplate; bez
  // `NEXT_PUBLIC_CONVEX_URL` nema provider-a, pa stranica kaže zašto umesto da
  // padne pri renderu (isti obrazac kao `/app/credits`).
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title={locale === "sr" ? "Studio" : "Studio"}
          body={
            locale === "sr"
              ? "Opiši šta hoćeš, izaberi model i generiši. Svaka generacija se plaća kreditima."
              : "Describe what you want, pick a model and generate. Every generation is paid in credits."
          }
        />
        <Panel className="p-6">
          <p className="text-base font-bold text-muted">
            {locale === "sr"
              ? "Backend nije povezan na ovoj instalaciji, pa Studio ne može da generiše."
              : "The backend is not connected on this installation, so the Studio cannot generate."}
          </p>
        </Panel>
      </div>
    );
  }

  return <StudioPage locale={locale} />;
}
