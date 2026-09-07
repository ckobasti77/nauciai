"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/components/ui/primitives";
import { marketingContent, otherLocale, withLocale, type Locale } from "@/lib/i18n";

/**
 * Kolačić jezika. Piše ga ISKLJUČIVO ovaj prekidač (klijent), zato NIJE HttpOnly.
 * Middleware (`proxy.ts`) ga samo ČITA za meko 307 na "/". Ime mora da bude identično
 * literalu u `proxy.ts`.
 */
export const LOCALE_COOKIE = "nauciai_locale";

// Zastavica trenutnog jezika; klik vodi na drugi jezik (kao theme toggle: prikazuje
// tekuce stanje, klik prebacuje). Srbija = crveno/plavo/belo tricolor, UK = Union Jack.
function SerbianFlag() {
  return (
    <svg viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <rect width="3" height="0.667" y="0" fill="#c6363c" />
      <rect width="3" height="0.667" y="0.667" fill="#0c4076" />
      <rect width="3" height="0.666" y="1.334" fill="#ffffff" />
    </svg>
  );
}

function BritishFlag() {
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <clipPath id="lang-uk-clip">
        <path d="M0 0v30h60V0z" />
      </clipPath>
      <clipPath id="lang-uk-diag">
        <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
      </clipPath>
      <g clipPath="url(#lang-uk-clip)">
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#ffffff" strokeWidth="6" />
        <path d="M0 0l60 30m0-30L0 30" clipPath="url(#lang-uk-diag)" stroke="#c8102e" strokeWidth="4" />
        <path d="M30 0v30M0 15h60" stroke="#ffffff" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  );
}

// `href`: kad prekidac stoji u navbaru koji je wrapper za sve javne strane, on
// vodi na ISTU stranu na drugom jeziku; bez njega ostaje stara meta (pocetna).
export function LanguageToggle({
  locale,
  className,
  href,
}: {
  locale: Locale;
  className?: string;
  href?: string;
}) {
  const nextLocale = otherLocale(locale);
  const m = marketingContent[locale];
  const searchParams = useSearchParams();

  // href nosi i POSTOJEĆE query parametre (ne samo putanju): /kursevi?tag=x -> /en/courses?tag=x.
  const base = href ?? withLocale(nextLocale);
  const query = searchParams.toString();
  const finalHref = query ? `${base}${base.includes("?") ? "&" : "?"}${query}` : base;

  // Klik SINHRONO upiše kolačić PRE nego što meka navigacija krene (isti obrazac kao
  // APP_SIDEBAR_COOKIE u components/app/app-sidebar.tsx): vrednost = ciljni jezik,
  // Max-Age 1 god., Path=/, SameSite=Lax, Secure na https, bez HttpOnly.
  const writeLocaleCookie = () => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  };

  return (
    <Link
      href={finalHref}
      scroll={false}
      onClick={writeLocaleCookie}
      aria-label={m.footer.langLabel}
      title={m.footer.switchTo}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink transition hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        className,
      )}
    >
      {locale === "sr" ? <SerbianFlag /> : <BritishFlag />}
    </Link>
  );
}
