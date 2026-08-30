import type { Metadata } from "next";

import { StudioPage } from "@/components/app/studio-page";
import { Panel, SectionHeader } from "@/components/ui/primitives";
import { appPageMetadata } from "@/lib/app-metadata";
import { normalizeLocale } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: "Studio · Rad", en: "Studio · Work" });
}

export default async function StudioJobDetailRoute({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale: localeParam, jobId } = await params;
  const locale = normalizeLocale(localeParam);

  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="space-y-6">
        <SectionHeader
          variant="app"
          underline
          title={locale === "sr" ? "Studio" : "Studio"}
          body={
            locale === "sr"
              ? "Opiši šta hoćeš, izaberi model i generiši. Svaka generacija se plaća kreditima."
              : "Describe what you want, pick a model and generate. Every generation is paid in credits."
          }
        />
        <Panel className="p-6">
          <p className="type-body type-measure font-bold text-muted">
            {locale === "sr"
              ? "Backend nije povezan na ovoj instalaciji, pa Studio ne može da generiše."
              : "The backend is not connected on this installation, so the Studio cannot generate."}
          </p>
        </Panel>
      </div>
    );
  }

  return <StudioPage locale={locale} initialJobId={jobId} />;
}
