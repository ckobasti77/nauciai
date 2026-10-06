"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { LanguageToggle } from "@/components/marketing/language-toggle";
import { LinkButton } from "@/components/ui/primitives";
import { otherLocale, withLocale, type Locale } from "@/lib/i18n";
import { parsePath } from "@/lib/routes";

/**
 * Jezik i prijava u zaglavlju Cree ostaju na ISTOJ strani (K29 S-02): galerija,
 * sveska ili otvoren alat se ne gube kad se promeni jezik ili prijavi.
 */
export function StudioShellLanguageToggle({ locale }: { locale: Locale }) {
  const { canonicalPath } = parsePath(usePathname());
  return <LanguageToggle locale={locale} href={withLocale(otherLocale(locale), canonicalPath)} />;
}

export function StudioShellSignIn({ locale, label }: { locale: Locale; label: string }) {
  const { canonicalPath } = parsePath(usePathname());
  const query = useSearchParams().toString();
  const next = `${withLocale(locale, canonicalPath)}${query ? `?${query}` : ""}`;
  return (
    <LinkButton href={`${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(next)}`} tone="paper">
      {label}
    </LinkButton>
  );
}
