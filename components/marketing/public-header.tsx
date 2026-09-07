"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { AccountMenu } from "@/components/marketing/account-menu";
import { LanguageToggle } from "@/components/marketing/language-toggle";
import { BrandMark, LinkButton } from "@/components/ui/primitives";
import { SmartStickyHeader } from "@/components/ui/smart-sticky";
import type { ViewerProfile } from "@/lib/current-viewer";
import { dictionary, otherLocale, withLocale, type Locale } from "@/lib/i18n";
import { parsePath } from "@/lib/routes";

const NAV_LINK_CLASS =
  "rounded-[8px] underline-offset-4 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Kanonske putanje čije strane pod providnim navbarom imaju SVETAO full-bleed heroj
 * (krem ostrvo u obe teme). Dve posledice, obe kroz `data-over-light` na headeru:
 *  1. tokeni u navbaru se drže svetle palete dok se ne skrola (globals.css),
 *     jer bi mastilo tamne teme nestalo na kremu;
 *  2. `.public-shell` ne rezerviše visinu navbara — heroj namerno ide POD njega.
 * Poredi se sa `parsePath(pathname).canonicalPath`, pa važi u oba jezika i bez obzira
 * na to da li rewrite otkrije javnu ili internu formu putanje.
 * N7: /courses i /community dele isti full-bleed krem hero (`PageHero`).
 */
const LIGHT_HERO_PATHS = ["/", "/studio", "/courses", "/community"];

/**
 * Gornja navigacija SVIH javnih strana — renderuje je `(marketing)/layout.tsx`,
 * isto kao što je sidebar wrapper za komandnu tablu. Klijentska je zbog
 * `usePathname()`: iz putanje se izvodi i `data-over-light` i jezički prekidač
 * koji ostaje na istoj strani umesto da vraća na početnu.
 */
export function PublicHeader({
  locale,
  viewerProfile,
}: {
  locale: Locale;
  viewerProfile: ViewerProfile;
}) {
  const t = dictionary[locale];
  const pathname = usePathname();
  const { canonicalPath } = parsePath(pathname);
  const overLight = LIGHT_HERO_PATHS.includes(canonicalPath);

  // Prekidač jezika ostaje na istoj strani: kanonska putanja se samo prevede u drugi
  // jezik (prevedeni segment, npr. /pretplata <-> /en/pricing, pređe sam).
  const languageHref = withLocale(otherLocale(locale), canonicalPath);

  return (
    <SmartStickyHeader
      overlay
      scrollBackground
      data-marketing-auth={viewerProfile ? "authenticated" : "anonymous"}
      data-over-light={overLight ? "true" : "false"}
      className="marketing-header top-0 z-40"
    >
      {/* Tri jednake kolone (1fr) unutar istog `max-w-7xl` kontejnera, pa nav
          linkovi padaju tačno na sredinu strane. Ispod `md` sredina se sakriva,
          a mreža se vraća na `justify-between` da desni klaster ne bude stisnut
          u trećinu uskog ekrana. */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6 md:grid md:grid-cols-3 lg:px-8">
        <div className="flex min-w-0 items-center justify-start">
          <BrandMark href={withLocale(locale)} label={t.appName} />
        </div>
        <nav className="hidden items-center justify-center gap-6 text-sm font-extrabold md:flex">
          <Link href={withLocale(locale, "/courses")} className={NAV_LINK_CLASS}>
            {t.navCourses}
          </Link>
          <Link href={withLocale(locale, "/community")} className={NAV_LINK_CLASS}>
            {t.navCommunity}
          </Link>
          <Link href={withLocale(locale, "/studio")} className={NAV_LINK_CLASS}>
            {t.navStudio}
          </Link>
          {/* N6: pretplata ima svoju stranu (segment se prevodi kroz `withLocale`), pa
              link više ne vodi na sidro „#pricing" na landingu. */}
          <Link href={withLocale(locale, "/pricing")} className={NAV_LINK_CLASS}>
            {t.navPricing}
          </Link>
        </nav>
        <div className="flex items-center justify-end gap-2">
          <LanguageToggle locale={locale} href={languageHref} />
          <ThemeToggle locale={locale} />
          {viewerProfile ? (
            <Link
              href={withLocale(locale, "/app")}
              className="inline-flex min-h-9 items-center justify-center rounded-full border-2 border-ink bg-ink px-2.5 py-1.5 text-[11px] font-black uppercase text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_var(--yellow)] active:translate-y-0 active:shadow-[3px_3px_0_0_var(--yellow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink max-[380px]:hidden sm:px-3 sm:text-xs"
            >
              {t.navDashboard}
            </Link>
          ) : null}
          {viewerProfile ? (
            <AccountMenu locale={locale} profile={viewerProfile} />
          ) : (
            <LinkButton href={withLocale(locale, "/sign-in")} tone="paper" className="hidden sm:inline-flex">
              {t.signIn}
            </LinkButton>
          )}
        </div>
      </div>
    </SmartStickyHeader>
  );
}
