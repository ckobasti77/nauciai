import { ArrowLeft, CheckCircle2, Clock3, Lock, Minus, PlayCircle, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckoutButton } from "@/components/app/checkout-button";
import { MarkerHighlight } from "@/components/marketing/marker-highlight";
import { PublicCourseIntroVideo } from "@/components/marketing/public-course-intro-video";
import { SectionMarginalia } from "@/components/marketing/section-marginalia";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { BrandMark, HandUnderline, LinkButton, Panel, SectionHeader } from "@/components/ui/primitives";
import { courses } from "@/lib/content";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import {
  coursePageContent,
  dictionary,
  locales,
  localized,
  normalizeLocale,
  otherLocale,
  pluralize,
  type Locale,
  type LocalizedText,
  withLocale,
} from "@/lib/i18n";

type StaticCourse = (typeof courses)[number];

type CourseOutlineLesson = {
  id?: string;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  durationSeconds: number;
  sortOrder: number;
  isPublished: boolean;
};

type CourseOutlineModule = {
  id?: string;
  title: LocalizedText;
  description?: LocalizedText;
  sortOrder: number;
  lessons: CourseOutlineLesson[];
};

type CourseOutline = {
  course: {
    slug: string;
    title: LocalizedText;
    subtitle: LocalizedText;
    description: LocalizedText;
    videoUrl?: string | null;
  };
  modules: CourseOutlineModule[];
};

type LiveCourseOutline = {
  course: {
    _id: string;
    slug: string;
    titleSr: string;
    titleEn: string;
    subtitleSr: string;
    subtitleEn: string;
    descriptionSr: string;
    descriptionEn: string;
    videoUrl?: string | null;
  };
  modules: Array<{
    _id: string;
    titleSr: string;
    titleEn: string;
    descriptionSr?: string;
    descriptionEn?: string;
    sortOrder: number;
    lessons: Array<{
      _id: string;
      slug: string;
      titleSr: string;
      titleEn: string;
      summarySr: string;
      summaryEn: string;
      durationSeconds: number;
      sortOrder: number;
    }>;
  }>;
} | null;

export function generateStaticParams() {
  return locales.flatMap((locale) => courses.map((course) => ({ locale, courseSlug: course.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; courseSlug: string }>;
}): Promise<Metadata> {
  const { locale: localeParam, courseSlug } = await params;
  const locale = normalizeLocale(localeParam);
  const course = courses.find((item) => item.slug === courseSlug);
  if (!course) return {};

  const title = localized(course.title, locale);
  const description = localized(course.description, locale);

  return {
    title: `${title} — ${dictionary[locale].appName}`,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: course.image.src }],
    },
  };
}

function formatDuration(durationSeconds: number, locale: Locale) {
  const minutes = Math.max(0, Math.round(durationSeconds / 60));
  if (minutes === 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours <= 0) return `${minutes} min`;
  if (remainingMinutes === 0) {
    return locale === "sr" ? `${hours}h` : `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

function lessonDurationSeconds(lesson: StaticCourse["modules"][number]["lessons"][number]) {
  if (typeof lesson.durationSeconds === "number") return lesson.durationSeconds;
  const minutes = Number.parseInt(lesson.duration, 10);
  return Number.isFinite(minutes) ? minutes * 60 : 60;
}

function staticOutline(course: StaticCourse): CourseOutline {
  return {
    course: {
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
    },
    modules: course.modules.map((module, moduleIndex) => ({
      title: module.title,
      sortOrder: moduleIndex * 10,
      lessons: module.lessons.map((lesson, lessonIndex) => ({
        slug: lesson.slug,
        title: lesson.title,
        summary: lesson.summary,
        durationSeconds: lessonDurationSeconds(lesson),
        sortOrder: lessonIndex * 10,
        isPublished: lesson.isPublished ?? true,
      })),
    })),
  };
}

function outlineFromLive(liveOutline: LiveCourseOutline, fallbackCourse: StaticCourse): CourseOutline {
  if (!liveOutline) return staticOutline(fallbackCourse);

  return {
    course: {
      slug: liveOutline.course.slug,
      title: {
        sr: liveOutline.course.titleSr,
        en: liveOutline.course.titleEn,
      },
      subtitle: {
        sr: liveOutline.course.subtitleSr,
        en: liveOutline.course.subtitleEn,
      },
      description: {
        sr: liveOutline.course.descriptionSr,
        en: liveOutline.course.descriptionEn,
      },
      videoUrl: liveOutline.course.videoUrl,
    },
    modules: liveOutline.modules.map((module) => ({
      id: module._id,
      title: {
        sr: module.titleSr,
        en: module.titleEn,
      },
      description:
        module.descriptionSr || module.descriptionEn
          ? {
              sr: module.descriptionSr ?? module.descriptionEn ?? "",
              en: module.descriptionEn ?? module.descriptionSr ?? "",
            }
          : undefined,
      sortOrder: module.sortOrder,
      lessons: module.lessons.map((lesson) => ({
        id: lesson._id,
        slug: lesson.slug,
        title: {
          sr: lesson.titleSr,
          en: lesson.titleEn,
        },
        summary: {
          sr: lesson.summarySr,
          en: lesson.summaryEn,
        },
        durationSeconds: lesson.durationSeconds,
        sortOrder: lesson.sortOrder,
        // Živi outline vraća samo objavljene lekcije.
        isPublished: true,
      })),
    })),
  };
}

async function getLiveOutline(courseSlug: string): Promise<LiveCourseOutline> {
  const convex = getConvexHttpClient();
  if (!convex) return null;
  return (await convex.query(convexQueries.getPublishedCourseOutline, { slug: courseSlug }).catch(() => null)) as LiveCourseOutline;
}

function outlineTotals(outline: CourseOutline) {
  const lessons = outline.modules.flatMap((module) => module.lessons);
  return {
    modules: outline.modules.length,
    lessons: lessons.length,
    durationSeconds: lessons.reduce((total, lesson) => total + lesson.durationSeconds, 0),
  };
}

export default async function CourseInfoPage({
  params,
}: {
  params: Promise<{ locale: string; courseSlug: string }>;
}) {
  const { locale: localeParam, courseSlug } = await params;
  const locale = normalizeLocale(localeParam);
  const fallbackCourse = courses.find((item) => item.slug === courseSlug);

  if (!fallbackCourse) {
    notFound();
  }

  const [liveOutline, viewerProfile] = await Promise.all([
    getLiveOutline(courseSlug),
    getCurrentViewerProfile(),
  ]);
  const outline = outlineFromLive(liveOutline, fallbackCourse);
  const totals = outlineTotals(outline);
  const t = dictionary[locale];
  const cp = coursePageContent[locale];
  const perCourse =
    cp.perCourse[courseSlug as keyof typeof cp.perCourse] ?? cp.perCourse["video-audio-ai"];
  const nextLocale = otherLocale(locale);
  const signedIn = Boolean(viewerProfile);
  const otherCourse = courses.find((item) => item.slug !== courseSlug) ?? courses[0];

  return (
    <main className="bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark href={withLocale(locale)} label={t.appName} />
          <div className="flex items-center gap-2">
            <ThemeToggle locale={locale} />
            <Link
              href={withLocale(nextLocale, `/courses/${outline.course.slug}`)}
              className="inline-flex min-h-11 items-center rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {nextLocale.toUpperCase()}
            </Link>
            <LinkButton
              href={withLocale(locale, signedIn ? "/app" : "/sign-in")}
              tone="paper"
              className="hidden sm:inline-flex"
            >
              {signedIn ? t.dashboard : t.signIn}
            </LinkButton>
          </div>
        </div>
      </header>

      <div data-motion="page">
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section data-motion="hero" className="sketch-grid overflow-hidden border-b-2 border-ink">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-16">
            <div className="max-w-3xl" data-motion="copy">
              <Link
                href={withLocale(locale, "/#courses")}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-ink underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <ArrowLeft className="size-4" />
                {cp.allCourses}
              </Link>
              <p className="mt-6 font-display text-2xl text-ink">
                {localized(fallbackCourse.detail.kicker, locale)}
              </p>
              <h1 className="mt-3 text-4xl font-black leading-[1.03] text-ink sm:text-5xl lg:text-6xl">
                {perCourse.titleLead}
                <MarkerHighlight>{perCourse.titleHighlight}</MarkerHighlight>
                {perCourse.titleTail}
              </h1>
              <HandUnderline className="mt-4" />
              <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-muted">
                {localized(fallbackCourse.detail.longDescription, locale)}
              </p>

              <p className="mt-8 flex items-end gap-2">
                <span className="text-5xl font-black text-ink">{cp.priceAmount}</span>
                <span className="pb-1.5 text-base font-extrabold text-muted">{cp.priceUnit}</span>
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <CheckoutButton
                  courseSlug={outline.course.slug}
                  locale={locale}
                  label={cp.buyNow}
                  tone="yellow"
                  fullWidth
                  className="sm:w-auto sm:min-w-52"
                />
                <LinkButton href="#besplatan-video" tone="paper" className="w-full sm:w-auto">
                  <PlayCircle className="size-4" />
                  {cp.watchFree}
                </LinkButton>
              </div>

              <ul className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-extrabold text-muted">
                {totals.lessons > 0 ? (
                  <>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-ink" />
                      {totals.modules} {pluralize(locale, totals.modules, cp.moduleForms)}
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-ink" />
                      {totals.lessons} {pluralize(locale, totals.lessons, cp.lessonForms)}
                    </li>
                  </>
                ) : null}
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-ink" />
                  {cp.cancelAnytime}
                </li>
              </ul>
            </div>

            <Panel as="div" className="p-3">
              <div className="relative aspect-[16/9] overflow-hidden rounded-[8px] border-2 border-ink bg-paper">
                <Image
                  src={fallbackCourse.image.src}
                  alt={localized(fallbackCourse.image.alt, locale)}
                  fill
                  sizes="(min-width: 1024px) 48vw, 100vw"
                  priority
                  className="object-cover"
                />
              </div>
            </Panel>
          </div>
        </section>

        {/* ── BESPLATAN VIDEO ──────────────────────────────────────────────── */}
        <section id="besplatan-video" className="scroll-mt-20 border-b-2 border-ink bg-paper-strong px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div data-motion="card" className="overflow-hidden rounded-[16px] border-2 border-ink bg-ink p-3 text-paper-strong shadow-[8px_8px_0_0_var(--yellow)]">
              <PublicCourseIntroVideo
                videoUrl={outline.course.videoUrl}
                posterSrc={fallbackCourse.image.src}
                title={localized(outline.course.title, locale)}
                locale={locale}
              />
            </div>
            <div className="flex flex-col justify-center" data-motion="copy">
              <p className="inline-flex w-fit items-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 py-1 text-sm font-black text-ink">
                <Sparkles className="size-4" />
                {cp.program.freeBadge}
              </p>
              <h2 className="mt-5 text-3xl font-black leading-tight text-ink md:text-4xl">
                {localized(fallbackCourse.detail.freeVideoTitle, locale)}
              </h2>
              <p className="mt-4 text-lg font-bold leading-8 text-muted">
                {localized(fallbackCourse.detail.freeVideoDescription, locale)}
              </p>
              <div className="mt-7 max-w-sm">
                <CheckoutButton courseSlug={outline.course.slug} locale={locale} label={cp.buyNow} tone="yellow" fullWidth />
              </div>
            </div>
          </div>
        </section>

        {/* ── ŠTA ĆEŠ UMETI ────────────────────────────────────────────────── */}
        <section className="border-b-2 border-ink bg-paper px-4 py-14 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="star"
              className="absolute right-1 top-0 hidden h-12 w-12 text-yellow sm:block"
            />
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <SectionHeader kicker={cp.outcomes.kicker} title={cp.outcomes.title} underline />
              <div className="grid gap-4">
                {fallbackCourse.detail.outcomes.map((outcome) => (
                  <div
                    key={localized(outcome, locale)}
                    data-motion="card"
                    className="flex items-start gap-3 rounded-[16px] border-2 border-ink bg-paper-strong px-5 py-4 shadow-[4px_4px_0_0_var(--shadow-hard-13)]"
                  >
                    <CheckCircle2 className="mt-1 size-5 shrink-0 text-ink" />
                    <p className="text-base font-extrabold leading-7 text-ink">{localized(outcome, locale)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── PROGRAM KURSA ────────────────────────────────────────────────── */}
        <section id="program" className="scroll-mt-20 border-b-2 border-ink bg-paper-strong px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <SectionMarginalia
              variant="arrow"
              className="absolute right-1 top-0 hidden h-12 w-16 text-ink sm:block"
            />
            <SectionHeader kicker={cp.program.kicker} title={cp.program.title} body={cp.program.intro} underline />

            {totals.lessons > 0 ? (
              <>
                <ul className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-extrabold text-muted" data-motion="copy">
                  <li>{totals.modules} {pluralize(locale, totals.modules, cp.moduleForms)}</li>
                  <li>{totals.lessons} {pluralize(locale, totals.lessons, cp.lessonForms)}</li>
                  <li className="flex items-center gap-2">
                    <Clock3 className="size-4 text-ink" />
                    {formatDuration(totals.durationSeconds, locale)}
                  </li>
                </ul>

                <div className="mt-8 grid gap-6">
                  {outline.modules.map((module, moduleIndex) => (
                    <Panel key={module.id ?? moduleIndex} as="article" className="overflow-hidden">
                      <div className="border-b-2 border-ink bg-paper px-5 py-5 sm:px-6">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">
                          {cp.program.moduleLabel} {moduleIndex + 1}
                        </p>
                        <h3 className="mt-1 text-2xl font-black leading-tight text-ink">
                          {localized(module.title, locale)}
                        </h3>
                        {module.description ? (
                          <p className="mt-2 text-sm font-bold leading-6 text-muted">
                            {localized(module.description, locale)}
                          </p>
                        ) : null}
                      </div>
                      <ul>
                        {module.lessons.map((lesson, lessonIndex) => {
                          const isFree = moduleIndex === 0 && lessonIndex === 0;
                          const isComingSoon = !lesson.isPublished;
                          return (
                            <li
                              key={lesson.id ?? lesson.slug}
                              className={`flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6 ${lessonIndex > 0 ? "border-t-2 border-ink" : ""} ${isComingSoon ? "opacity-60" : ""}`}
                            >
                              <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper text-xs font-black text-ink">
                                {lessonIndex + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-base font-extrabold leading-snug text-ink sm:text-lg">
                                  {localized(lesson.title, locale)}
                                </p>
                                <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-muted">
                                  <Clock3 className="size-3.5" />
                                  {isComingSoon ? cp.program.comingSoon : formatDuration(lesson.durationSeconds, locale)}
                                </p>
                              </div>
                              {isFree ? (
                                <span className="shrink-0 rounded-full border-2 border-ink bg-yellow px-3 py-1 text-[11px] font-black text-ink">
                                  {cp.program.freeBadge}
                                </span>
                              ) : isComingSoon ? (
                                <span className="shrink-0 rounded-full border-2 border-ink bg-paper px-3 py-1 text-[11px] font-black text-muted">
                                  {cp.program.comingSoon}
                                </span>
                              ) : (
                                <span
                                  className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper text-ink"
                                  title={cp.program.lockedLabel}
                                >
                                  <Lock className="size-4" aria-hidden="true" />
                                  <span className="sr-only">{cp.program.lockedLabel}</span>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </Panel>
                  ))}
                </div>
              </>
            ) : (
              <div data-motion="card" className="mt-8 rounded-[16px] border-2 border-dashed border-ink bg-paper p-8 text-center">
                <Clock3 className="mx-auto size-10 text-ink" />
                <p className="mt-4 text-2xl font-black text-ink">{cp.program.emptyTitle}</p>
                <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-6 text-muted">{cp.program.emptyBody}</p>
                <div className="mt-6 flex justify-center">
                  <LinkButton href="#besplatan-video" tone="yellow">
                    <PlayCircle className="size-4" />
                    {cp.watchFree}
                  </LinkButton>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── FAQ PO KURSU ─────────────────────────────────────────────────── */}
        <section className="border-b-2 border-ink bg-paper px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-3xl">
            <SectionMarginalia
              variant="spark"
              className="absolute right-1 top-0 hidden h-11 w-11 text-yellow sm:block"
            />
            <SectionHeader title={cp.faq.title} underline />
            <div className="mt-10 flex flex-col gap-3">
              {perCourse.faq.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-[16px] border-2 border-ink bg-paper-strong shadow-[4px_4px_0_0_var(--shadow-hard-13)]"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-black text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
                    <span className="inline-flex shrink-0 text-ink" aria-hidden="true">
                      <Plus className="faq-icon-closed size-5" />
                      <Minus className="faq-icon-open size-5" />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-base font-bold leading-7 text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── ZAVRŠNI CTA ──────────────────────────────────────────────────── */}
        <section className="bg-paper-strong px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div
              data-motion="card"
              className="ink-dots relative overflow-hidden rounded-[16px] border-2 border-ink bg-ink px-6 py-14 text-center shadow-[8px_8px_0_0_var(--shadow-hard-16)] sm:px-10"
            >
              <p className="font-display text-4xl leading-tight text-paper-strong sm:text-5xl">
                {cp.finalCta.title}
              </p>
              <p className="mx-auto mt-4 max-w-xl text-lg font-bold text-paper-strong/80">
                {cp.finalCta.body}
              </p>
              <div className="mx-auto mt-8 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
                <CheckoutButton
                  courseSlug={outline.course.slug}
                  locale={locale}
                  label={cp.buyNow}
                  tone="yellow"
                  fullWidth
                  className="sm:w-auto sm:min-w-52"
                />
                <LinkButton
                  href={withLocale(locale, `/courses/${otherCourse.slug}`)}
                  tone="paper"
                  className="w-full sm:w-auto"
                >
                  {cp.finalCta.crossSell}
                </LinkButton>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
