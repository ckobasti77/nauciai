import type { Metadata } from "next";
import Link from "next/link";

import { CourseCard } from "@/components/marketing/course-card";
import { MarkerHighlight } from "@/components/marketing/marker-highlight";
import { Panel } from "@/components/ui/primitives";
import { courses } from "@/lib/content";
import { coursesListingContent, localized, locales, normalizeLocale, publicMeta, withLocale } from "@/lib/i18n";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const canonicalUrl = `${origin}${withLocale(locale, "/courses")}`;
  const srUrl = `${origin}${withLocale("sr", "/courses")}`;
  const enUrl = `${origin}${withLocale("en", "/courses")}`;

  const title = localized(publicMeta.coursesListing.title, locale);
  const description = localized(publicMeta.coursesListing.description, locale);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        sr: srUrl,
        en: enUrl,
        "x-default": srUrl,
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      title,
      description,
    },
    twitter: { card: "summary" },
  };
}

export default async function PublicCoursesListingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = normalizeLocale(localeParam);
  const t = coursesListingContent[locale];
  const hasConvex = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const canonicalUrl = `${origin}${withLocale(locale, "/courses")}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: localized(publicMeta.coursesListing.title, locale),
    description: t.subtitle,
    url: canonicalUrl,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: courses.map((course, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${origin}${withLocale(locale, `/courses/${course.slug}`)}`,
        name: localized(course.title, locale),
      })),
    },
  };

  const safeJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <main className="sketch-grid min-h-screen bg-surface-a px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Breadcrumb navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-black text-muted">
          <Link
            href={withLocale(locale)}
            className="rounded-[4px] underline transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {t.breadcrumbHome}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{t.breadcrumbCourses}</span>
        </nav>

        {/* Hero title panel — na površini A (main), panel je B */}
        <Panel level={1} className="overflow-hidden p-6 sm:p-8 md:p-10">
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-muted">{t.kicker}</p>
            <h1 className="text-balance font-display text-3xl font-black leading-tight text-ink sm:text-4xl md:text-5xl">
              {t.heroTitleLead}
              <MarkerHighlight>{t.heroTitleHighlight}</MarkerHighlight>
            </h1>
            <p className="max-w-2xl text-sm font-medium leading-relaxed text-muted sm:text-base">
              {t.subtitle}
            </p>
          </div>
        </Panel>

        {/* Courses grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {courses.map((course) => (
            <CourseCard key={course.slug} course={course} locale={locale} hasConvex={hasConvex} level={0} />
          ))}
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />
    </main>
  );
}
