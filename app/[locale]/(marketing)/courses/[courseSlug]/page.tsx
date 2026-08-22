import { ArrowLeft, BookOpen, CheckCircle2, ChevronDown, Clock3, Layers, LogIn, PlayCircle, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckoutButton } from "@/components/app/checkout-button";
import { PublicCourseIntroVideo } from "@/components/marketing/public-course-intro-video";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { BrandMark, HandUnderline, LinkButton } from "@/components/ui/primitives";
import { courses } from "@/lib/content";
import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { getCurrentViewerProfile } from "@/lib/current-viewer";
import { dictionary, locales, localized, normalizeLocale, otherLocale, type Locale, type LocalizedText, withLocale } from "@/lib/i18n";

type StaticCourse = (typeof courses)[number];

type CourseOutlineLesson = {
  id?: string;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  durationSeconds: number;
  sortOrder: number;
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
    lessons: lessons.length,
    durationSeconds: lessons.reduce((total, lesson) => total + lesson.durationSeconds, 0),
  };
}

function lessonHref(locale: Locale, courseSlug: string, lessonSlug: string, signedIn: boolean) {
  const dashboardHref = withLocale(locale, `/app/courses/${courseSlug}/lessons/${lessonSlug}`);
  if (signedIn) return dashboardHref;
  return `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(dashboardHref)}`;
}

function CurriculumSection({
  locale,
  outline,
  signedIn,
}: {
  locale: Locale;
  outline: CourseOutline;
  signedIn: boolean;
}) {
  const totals = outlineTotals(outline);
  const directLessons = outline.modules.flatMap((module) => module.lessons);

  return (
    <section id="program" className="border-t-2 border-ink bg-paper-strong px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <div>
            <p className="font-display text-2xl text-ink">{locale === "sr" ? "Sta je u kursu" : "What is inside"}</p>
            <h2 className="mt-2 text-4xl font-black leading-tight text-ink">
              {locale === "sr" ? "Sve lekcije, direktno i pregledno." : "Every lesson, directly and clearly."}
            </h2>
            <p className="mt-4 text-base font-bold leading-7 text-muted">
              {locale === "sr"
                ? "Pregledaj program, trajanje svake lekcije i redosled rada. Kada otvoris lekciju, prijava ili kreiranje profila te vodi tacno na sledecu stranicu."
                : "Review the program, each lesson duration, and the work order. Opening a lesson sends sign-in or account creation back to the exact next page."}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[16px] border-2 border-ink bg-paper p-4">
                <p className="flex items-center gap-2 text-xs font-black uppercase text-muted">
                  <Layers className="size-4 text-ink" />
                  {locale === "sr" ? "Struktura" : "Structure"}
                </p>
                <p className="mt-2 text-xl font-black text-ink">{locale === "sr" ? "Kurs → lekcije" : "Course → lessons"}</p>
              </div>
              <div className="rounded-[16px] border-2 border-ink bg-paper p-4">
                <p className="flex items-center gap-2 text-xs font-black uppercase text-muted">
                  <BookOpen className="size-4 text-ink" />
                  {locale === "sr" ? "Lekcije" : "Lessons"}
                </p>
                <p className="mt-2 text-3xl font-black text-ink">{totals.lessons}</p>
              </div>
              <div className="rounded-[16px] border-2 border-ink bg-paper p-4">
                <p className="flex items-center gap-2 text-xs font-black uppercase text-muted">
                  <Clock3 className="size-4 text-ink" />
                  {locale === "sr" ? "Trajanje" : "Duration"}
                </p>
                <p className="mt-2 text-3xl font-black text-ink">{formatDuration(totals.durationSeconds, locale)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {directLessons.length ? (
              directLessons.map((lesson, lessonIndex) => {
                const href = lessonHref(locale, outline.course.slug, lesson.slug, signedIn);
                return (
                  <details key={lesson.id ?? lesson.slug} open={lessonIndex === 0} className="group overflow-hidden rounded-[16px] border-2 border-ink bg-paper shadow-[6px_6px_0_0_var(--shadow-hard-12)]">
                    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 bg-paper-strong px-5 py-4 marker:hidden focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-xs font-black">{lessonIndex + 1}</span>
                      <div className="min-w-0 flex-1"><h3 className="text-lg font-black leading-tight text-ink">{localized(lesson.title, locale)}</h3><p className="mt-1 text-xs font-bold text-muted">{formatDuration(lesson.durationSeconds, locale)}</p></div>
                      <ChevronDown className="size-5 text-ink transition group-open:rotate-180" />
                    </summary>
                    <div className="grid gap-4 border-t-2 border-ink p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><p className="text-sm font-bold leading-6 text-muted">{localized(lesson.summary, locale)}</p><Link href={href} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-4 text-xs font-black text-paper-strong shadow-[3px_3px_0_0_var(--yellow)] transition hover:-translate-y-0.5 hover:bg-yellow hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">{signedIn ? <PlayCircle className="size-4" /> : <LogIn className="size-4" />}{signedIn ? (locale === "sr" ? "Otvori u dashboardu" : "Open in dashboard") : (locale === "sr" ? "Prijavi se / napravi profil" : "Sign in / create profile")}</Link></div>
                  </details>
                );
              })
            ) : (
              <div className="rounded-[16px] border-2 border-dashed border-ink bg-paper p-8 text-center">
                <BookOpen className="mx-auto size-10 text-ink" />
                <p className="mt-4 text-2xl font-black text-ink">
                  {locale === "sr" ? "Program je u pripremi" : "The program is being prepared"}
                </p>
                <p className="mt-2 text-sm font-bold leading-6 text-muted">
                  {locale === "sr"
                    ? "Objavljene lekcije ce se pojaviti ovde cim budu spremne."
                    : "Published lessons will appear here as soon as they are ready."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
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
  const t = dictionary[locale];
  const nextLocale = otherLocale(locale);
  const freeVideoLabel = locale === "sr" ? "Odgledaj besplatan video" : "Watch free video";
  const buyLabel = locale === "sr" ? "Kupi sada" : "Buy now";
  const signedIn = Boolean(viewerProfile);

  return (
    <main className="bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark href={withLocale(locale)} label={t.appName} />
          <div className="flex items-center gap-2">
            <ThemeToggle locale={locale} compact />
            <Link
              href={withLocale(nextLocale, `/courses/${outline.course.slug}`)}
              className="rounded-[8px] border-2 border-ink bg-paper-strong px-3 py-2 text-sm font-black"
            >
              {nextLocale.toUpperCase()}
            </Link>
            <LinkButton
              href={withLocale(locale, signedIn ? "/app" : "/sign-in")}
              tone="paper"
              className="hidden sm:inline-flex"
            >
              {signedIn ? "Dashboard" : t.signIn}
            </LinkButton>
          </div>
        </div>
      </header>

      <div data-motion="page">
      <section data-motion="hero" className="sketch-grid border-b-2 border-ink px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div data-motion="copy">
            <Link href={withLocale(locale, "/#courses")} className="inline-flex items-center gap-2 text-sm font-black text-ink underline">
              <ArrowLeft className="size-4" />
              {locale === "sr" ? "Svi kursevi" : "All courses"}
            </Link>
            <p className="mt-8 font-display text-2xl text-ink">{localized(fallbackCourse.detail.kicker, locale)}</p>
            <h1 className="mt-3 text-5xl font-black leading-[0.95] text-ink sm:text-6xl lg:text-7xl">
              {localized(outline.course.title, locale)}
            </h1>
            <HandUnderline className="mt-5" />
            <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-muted">
              {localized(fallbackCourse.detail.longDescription, locale)}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:max-w-sm">
              <LinkButton href="#besplatan-video" tone="yellow">
                <PlayCircle className="size-4" />
                {freeVideoLabel}
              </LinkButton>
              <LinkButton href="#program" tone="paper">
                <BookOpen className="size-4" />
                {locale === "sr" ? "Pogledaj program" : "View curriculum"}
              </LinkButton>
              <CheckoutButton courseSlug={outline.course.slug} locale={locale} label={buyLabel} tone="ink" fullWidth />
            </div>
          </div>

          <div data-motion="card" className="overflow-hidden rounded-[16px] border-[2px] border-ink bg-paper-strong p-3 shadow-[8px_8px_0_0_var(--shadow-hard-16)]">
            <Image
              src={fallbackCourse.image.src}
              alt={localized(fallbackCourse.image.alt, locale)}
              width={1200}
              height={720}
              priority
              className="h-auto w-full rounded-[8px] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="border-b-2 border-ink bg-paper-strong px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-display text-2xl text-ink">{locale === "sr" ? "Sta dobijas" : "What you get"}</p>
            <h2 className="mt-2 text-4xl font-black leading-tight text-ink">
              {locale === "sr" ? "Konkretan kurs, spreman za rad." : "A concrete course, ready to use."}
            </h2>
          </div>
          <div className="grid gap-4">
            {fallbackCourse.detail.outcomes.map((outcome) => (
              <div key={localized(outcome, locale)} data-motion="card" className="flex items-start gap-3 rounded-[16px] border-[2px] border-ink bg-paper px-5 py-4">
                <CheckCircle2 className="mt-1 size-5 shrink-0 text-ink" />
                <p className="text-base font-extrabold leading-7 text-ink">{localized(outcome, locale)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="besplatan-video" className="bg-paper px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div data-motion="card" className="overflow-hidden rounded-[16px] border-[2px] border-ink bg-ink p-3 text-paper-strong shadow-[8px_8px_0_0_var(--yellow)]">
            <PublicCourseIntroVideo
              videoUrl={outline.course.videoUrl}
              posterSrc={fallbackCourse.image.src}
              title={localized(outline.course.title, locale)}
              locale={locale}
            />
          </div>
          <div className="flex flex-col justify-center">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border-[2px] border-ink bg-yellow px-3 py-1 text-sm font-black text-ink">
              <Sparkles className="size-4" />
              {localized(fallbackCourse.priceLabel, locale)}
            </p>
            <h2 className="mt-5 text-4xl font-black leading-tight text-ink">
              {localized(fallbackCourse.detail.freeVideoTitle, locale)}
            </h2>
            <p className="mt-4 text-lg font-bold leading-8 text-muted">
              {localized(fallbackCourse.detail.freeVideoDescription, locale)}
            </p>
            <div className="mt-7 max-w-sm">
              <CheckoutButton courseSlug={outline.course.slug} locale={locale} label={buyLabel} tone="yellow" fullWidth />
            </div>
          </div>
        </div>
      </section>

      <CurriculumSection locale={locale} outline={outline} signedIn={signedIn} />
      </div>
    </main>
  );
}
