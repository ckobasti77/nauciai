import Link from "next/link";

import { cn } from "@/components/ui/primitives";
import { marketingContent, otherLocale, withLocale, type Locale } from "@/lib/i18n";

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

export function LanguageToggle({ locale, className }: { locale: Locale; className?: string }) {
  const nextLocale = otherLocale(locale);
  const m = marketingContent[locale];

  return (
    <Link
      href={withLocale(nextLocale)}
      aria-label={m.footer.langLabel}
      title={m.footer.switchTo}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-ink transition hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        className,
      )}
    >
      {locale === "sr" ? <SerbianFlag /> : <BritishFlag />}
    </Link>
  );
}
