import type { Metadata } from "next";
import { Suspense } from "react";

import { OAuthConsentPage } from "@/components/app/oauth-consent-page";
import { Panel } from "@/components/ui/primitives";
import { locales, normalizeLocale, oauthConsentContent } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normalizeLocale((await params).locale);
  // Auth-utility strana kao `/sign-in`: van indeksa (i u robots.ts disallow).
  return { title: oauthConsentContent[locale].metaTitle, robots: { index: false, follow: false } };
}

/**
 * `authorization_endpoint` OAuth toka za MCP (MCP-P4-OAUTH). Živi na Next
 * aplikaciji, ne na Convex site-u, jer je Convex Auth sesija ovde; sve ostale
 * OAuth rute su `httpAction`-i u `convex/oauth/http.ts`. Parametre čita
 * klijentska komponenta (`useSearchParams`), pa Suspense granica.
 */
export default async function OAuthAuthorizeRoute({ params }: { params: Promise<{ locale: string }> }) {
  const locale = normalizeLocale((await params).locale);
  const t = oauthConsentContent[locale];

  return (
    <main data-motion="page" className="sketch-grid min-h-screen bg-surface-a px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-2xl items-center">
        <div className="w-full">
          {process.env.NEXT_PUBLIC_CONVEX_URL ? (
            <Suspense fallback={null}>
              <OAuthConsentPage locale={locale} />
            </Suspense>
          ) : (
            <Panel className="p-6">
              <p className="type-body type-measure font-bold text-muted">{t.noConvex}</p>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}
