import { Mail } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { BrandMark } from "@/components/ui/primitives";
import { courses, primaryCourseSlug, websitesCourseSlug } from "@/lib/content";
import { dictionary, localized, marketingContent, otherLocale, withLocale, type Locale } from "@/lib/i18n";

// TODO(lansiranje): zameni pravim kontaktom i mrežama pre objave.
// `SOCIALS` je namerno prazan — red "Mreže" se ne renderuje dok se ne popuni.
const CONTACT_EMAIL = "kontakt@nauciai.com"; // placeholder
const SOCIALS: ReadonlyArray<{ label: string; href: string }> = [];

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center text-sm font-bold text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {children}
    </Link>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = dictionary[locale];
  const f = marketingContent[locale].footer;
  const nextLocale = otherLocale(locale);
  const videoCourse = courses.find((course) => course.slug === primaryCourseSlug) ?? courses[0];
  const vibeCourse = courses.find((course) => course.slug === websitesCourseSlug) ?? courses[1];
  const year = new Date().getFullYear();

  return (
    <footer className="relative bg-paper text-ink">
      {/* Pocepana ivica papira: neravna ručna linija u boji mastila, deli stranicu od podnožja.
          preserveAspectRatio="none" rasteže je preko cele širine; non-scaling-stroke drži debljinu. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 24"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 top-0 h-4 w-full text-ink"
        fill="none"
      >
        <path
          d="M0 13C90 6 180 19 270 11S450 5 540 14 720 20 810 10 990 6 1080 15 1260 20 1350 11 1440 8 1440 8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M0 18C120 12 210 22 330 16S540 12 660 19 870 22 990 15 1200 12 1320 18 1440 15 1440 15"
          className="stroke-ink/40"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Kolona 1 — Brend */}
          <div className="flex flex-col gap-5">
            <BrandMark href={withLocale(locale)} label={t.appName} />
            <p className="max-w-xs text-sm font-bold leading-6 text-muted">{f.tagline}</p>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle locale={locale} />
              <Link
                href={withLocale(nextLocale)}
                aria-label={f.langLabel}
                title={f.switchTo}
                className="inline-flex min-h-11 items-center rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black text-ink transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {nextLocale.toUpperCase()}
              </Link>
            </div>
          </div>

          {/* Kolona 2 — Kursevi */}
          <nav aria-label={f.coursesHeading} className="flex flex-col gap-2">
            <p className="font-display text-xl text-ink">{f.coursesHeading}</p>
            <FooterLink href={withLocale(locale, `/courses/${videoCourse.slug}`)}>
              {localized(videoCourse.title, locale)}
            </FooterLink>
            <FooterLink href={withLocale(locale, `/courses/${vibeCourse.slug}`)}>
              {localized(vibeCourse.title, locale)}
            </FooterLink>
          </nav>

          {/* Kolona 3 — Platforma */}
          <nav aria-label={f.platformHeading} className="flex flex-col gap-2">
            <p className="font-display text-xl text-ink">{f.platformHeading}</p>
            <FooterLink href={withLocale(locale, "/app/community")}>{f.community}</FooterLink>
            <FooterLink href={withLocale(locale, "/sign-in")}>{f.signIn}</FooterLink>
            <FooterLink href={withLocale(locale, "/app")}>{f.openApp}</FooterLink>
          </nav>

          {/* Kolona 4 — Pravno i kontakt */}
          <nav aria-label={f.legalHeading} className="flex flex-col gap-2">
            <p className="font-display text-xl text-ink">{f.legalHeading}</p>
            <FooterLink href={withLocale(locale, "/politika-privatnosti")}>{f.privacy}</FooterLink>
            <FooterLink href={withLocale(locale, "/uslovi-studio")}>{f.terms}</FooterLink>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              {CONTACT_EMAIL}
            </a>
            {SOCIALS.length > 0 ? (
              <div className="mt-2 flex flex-col gap-2">
                <p className="font-display text-xl text-ink">{f.socialsHeading}</p>
                {SOCIALS.map((social) => (
                  <FooterLink key={social.href} href={social.href}>
                    {social.label}
                  </FooterLink>
                ))}
              </div>
            ) : null}
          </nav>
        </div>

        {/* Dno */}
        <div className="mt-12 flex flex-col gap-3 border-t-2 border-line pt-6 text-sm font-bold text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {t.appName}. {f.rights}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link
              href={withLocale(locale, "/politika-privatnosti")}
              className="inline-flex min-h-11 items-center transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {f.privacy}
            </Link>
            <Link
              href={withLocale(locale, "/uslovi-studio")}
              className="inline-flex min-h-11 items-center transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {f.terms}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
