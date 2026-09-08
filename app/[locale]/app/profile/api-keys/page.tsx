import type { Metadata } from "next";

import { ApiKeysPage } from "@/components/app/api-keys-page";
import { Panel, SectionHeader } from "@/components/ui/primitives";
import { appPageMetadata } from "@/lib/app-metadata";
import { apiKeysContent, normalizeLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return appPageMetadata(locale, { sr: apiKeysContent.sr.title, en: apiKeysContent.en.title });
}

export default async function ApiKeysRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const t = apiKeysContent[locale];

  // Lista i kreiranje su Convex pretplata i mutacija; bez provider-a strana
  // kaže zašto umesto da padne pri renderu (isti obrazac kao `credits/page.tsx`).
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="space-y-6">
        <SectionHeader variant="app" underline title={t.title} body={t.body} />
        <Panel className="p-6">
          <p className="type-body type-measure font-bold text-muted">{t.noConvex}</p>
        </Panel>
      </div>
    );
  }

  return <ApiKeysPage locale={locale} />;
}
