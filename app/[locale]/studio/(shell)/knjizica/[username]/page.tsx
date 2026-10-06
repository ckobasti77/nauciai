import type { Metadata } from "next";

import { CreaReportCardView } from "@/components/crea/game/crea-report-card";
import { LinkButton } from "@/components/ui/primitives";
import { fillCopy } from "@/lib/crea-copy";
import { CREA_CARD_COPY } from "@/lib/crea-game-copy";
import { loadSharedReportCard } from "@/lib/crea-report-card-share";
import { normalizeLocale, withLocale } from "@/lib/i18n";

type Params = Promise<{ locale: string; username: string }>;

/**
 * Javna đačka knjižica (K26, G5): link za deljenje. Postoji samo kad je vlasnik
 * knjižicu učinio javnom; slika za mreže (`openGraph`) je `/api/crea/knjizica/<ime>`.
 * Lična stranica, pa se ne indeksira.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: localeParam, username } = await params;
  const locale = normalizeLocale(localeParam);
  const data = await loadSharedReportCard(decodeURIComponent(username));
  const robots = { index: false, follow: false };
  if (!data) return { title: CREA_CARD_COPY.title[locale], robots };
  const title = fillCopy(CREA_CARD_COPY.sharedTitle[locale], { name: data.name });
  const image = { url: `/api/crea/knjizica/${encodeURIComponent(data.username)}?lang=${locale}`, width: 1200, height: 630, alt: title };
  return {
    title,
    robots,
    openGraph: { title, images: [image] },
    twitter: { card: "summary_large_image", title, images: [image.url] },
  };
}

export default async function SharedReportCardRoute({ params }: { params: Params }) {
  const { locale: localeParam, username } = await params;
  const locale = normalizeLocale(localeParam);
  const data = await loadSharedReportCard(decodeURIComponent(username));

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-4 text-ink">
      {data ? (
        <CreaReportCardView locale={locale} name={data.name} username={data.username} card={data.card} />
      ) : (
        <section className="surface-card border-2 border-ink bg-paper-strong p-6 text-center shadow-[6px_6px_0_0_var(--shadow-hard-16)]">
          <p className="type-h3">{CREA_CARD_COPY.notShared[locale]}</p>
        </section>
      )}
      <div className="flex justify-center">
        <LinkButton href={withLocale(locale, "/studio")} tone="yellow">
          {CREA_CARD_COPY.sharedCta[locale]}
        </LinkButton>
      </div>
    </div>
  );
}
