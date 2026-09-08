import { Mail } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { LanguageToggle } from "@/components/marketing/language-toggle";
import { SectionWave } from "@/components/marketing/section-wave";
import { BrandMark } from "@/components/ui/primitives";
import { courses, primaryCourseSlug, websitesCourseSlug } from "@/lib/content";
import { dictionary, localized, marketingContent, withLocale, type Locale } from "@/lib/i18n";

const CONTACT_EMAIL = "kontakt@nauciai.com";
// Mreže: dodaj { label, href } parove kad budu spremni — red se sam pojavi.
const SOCIALS: ReadonlyArray<{ label: string; href: string }> = [];

// 44px klik meta obavezna samo na dodirnim uređajima; na desktopu linkovi u
// koloni smeju biti gušći (N4: podnožje je bilo previsoko i prazno).
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center py-0.5 text-sm font-bold text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink pointer-coarse:min-h-11"
    >
      {children}
    </Link>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = dictionary[locale];
  const f = marketingContent[locale].footer;
  const videoCourse = courses.find((course) => course.slug === primaryCourseSlug) ?? courses[0];
  const vibeCourse = courses.find((course) => course.slug === websitesCourseSlug) ?? courses[1];
  const year = new Date().getFullYear();

  return (
    <footer className="relative bg-surface-b text-ink">
      {/* Talas deli stranicu od podnožja (v3): footer je površina B, a poslednja sekcija
          svake javne strane je A (level 0) → jedan talas A→B. Ista neprovidna traka kao
          razdelnici između sekcija; jaše na granici (`section-wave-top`, translateY -50%). */}
      <SectionWave to={1} className="section-wave section-wave-top" />

      <div className="mx-auto max-w-7xl px-4 pb-5 pt-8 sm:px-6 lg:px-8">
        <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Kolona 1 — Brend */}
          <div className="flex flex-col gap-3">
            <BrandMark href={withLocale(locale)} label={t.appName} />
            <p className="max-w-xs text-sm font-bold leading-6 text-muted">{f.tagline}</p>
          </div>

          {/* Kolona 2 — Kursevi */}
          <nav aria-label={f.coursesHeading} className="flex flex-col gap-1">
            <p className="type-eyebrow text-muted">{f.coursesHeading}</p>
            <FooterLink href={withLocale(locale, `/courses/${videoCourse.slug}`)}>
              {localized(videoCourse.title, locale)}
            </FooterLink>
            <FooterLink href={withLocale(locale, `/courses/${vibeCourse.slug}`)}>
              {localized(vibeCourse.title, locale)}
            </FooterLink>
          </nav>

          {/* Kolona 3 — Platforma */}
          <nav aria-label={f.platformHeading} className="flex flex-col gap-1">
            <p className="type-eyebrow text-muted">{f.platformHeading}</p>
            {/* N6: pretplata ima svoju stranu; segment se prevodi kroz `withLocale`. */}
            <FooterLink href={withLocale(locale, "/pricing")}>{t.navPricing}</FooterLink>
            <FooterLink href={withLocale(locale, "/community")}>{f.community}</FooterLink>
            <FooterLink href={withLocale(locale, "/sign-in")}>{f.signIn}</FooterLink>
            <FooterLink href={withLocale(locale, "/app")}>{f.openApp}</FooterLink>
          </nav>

          {/* Kolona 4 — Pravno i kontakt */}
          <nav aria-label={f.legalHeading} className="flex flex-col gap-1">
            <p className="type-eyebrow text-muted">{f.legalHeading}</p>
            <FooterLink href={withLocale(locale, "/politika-privatnosti")}>{f.privacy}</FooterLink>
            <FooterLink href={withLocale(locale, "/uslovi-studio")}>{f.terms}</FooterLink>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 py-0.5 text-sm font-bold text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink pointer-coarse:min-h-11"
            >
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              {CONTACT_EMAIL}
            </a>
            {SOCIALS.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1">
                <p className="type-eyebrow text-muted">{f.socialsHeading}</p>
                {SOCIALS.map((social) => (
                  <FooterLink key={social.href} href={social.href}>
                    {social.label}
                  </FooterLink>
                ))}
              </div>
            ) : null}
          </nav>
        </div>

        {/* Dno — copyright, jezik i tema u jednom redu na >=640px (N4). */}
        <div className="mt-6 flex flex-col gap-3 border-t-2 border-line pt-4 text-sm font-bold text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {t.appName}. {f.rights}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageToggle locale={locale} />
            <ThemeToggle locale={locale} />
          </div>
        </div>
      </div>
    </footer>
  );
}
