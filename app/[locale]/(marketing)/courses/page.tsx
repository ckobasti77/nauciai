import { PlayCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CourseCard } from "@/components/marketing/course-card";
import { PageHero } from "@/components/marketing/page-hero";
import { courses } from "@/lib/content";
import {
  coursesListingContent,
  localized,
  locales,
  normalizeLocale,
  publicMeta,
  withLocale,
} from "@/lib/i18n";
import { existingPublicPath } from "@/lib/public-media";

/** Sidro liste kurseva — meta hero CTA „Pogledaj kurseve". */
const COURSES_LIST_ID = "kursevi";

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
    <main className="bg-surface-a text-ink">
      <div data-motion="page">
        {/* Hero (N7): full-bleed krem, isti jezik kao landing, bez talasa ispod. */}
        <PageHero
          titleLead={t.heroTitleLead}
          titleHighlight={t.heroTitleHighlight}
          subtitle={t.subtitle}
          ctas={[
            { label: t.heroCtaCourses, href: `#${COURSES_LIST_ID}`, icon: <PlayCircle className="size-4" /> },
            { label: t.heroCtaPlans, href: withLocale(locale, "/pricing") },
          ]}
          mediaLabel={t.heroMediaAlt}
          posterSrc={existingPublicPath("/images/landing/courses-hero-poster.webp")}
          mp4Src={existingPublicPath("/images/landing/courses-hero-loop.mp4")}
        />

        <section className="sketch-grid bg-surface-a px-4 py-12 sm:px-6 lg:px-8">
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

            {/* Courses grid — meta hero CTA „Pogledaj kurseve". */}
            <div id={COURSES_LIST_ID} className="grid gap-6 lg:grid-cols-2">
              {courses.map((course) => (
                <CourseCard key={course.slug} course={course} locale={locale} hasConvex={hasConvex} level={0} />
              ))}
            </div>
          </div>
        </section>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd }}
      />
    </main>
  );
}
