import { ArrowRight, CheckCircle2, Heart, PlayCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { CourseFavoriteButton } from "@/components/marketing/course-favorite-button";
import { LoopVideo } from "@/components/marketing/loop-video";
import type { Course } from "@/lib/content";
import { localized, marketingContent, type Locale, withLocale } from "@/lib/i18n";
import { nextLevel, surfaceClass } from "@/lib/surface";

/**
 * Kartica kursa — deljena između home „KURSEVI" sekcije i javne liste kurseva
 * (`/courses`). Izdvojena da obe strane koriste identičan izgled bez dupliranja.
 */
export function CourseCard({
  course,
  locale,
  hasConvex,
  level = 1,
}: {
  course: Course;
  locale: Locale;
  hasConvex: boolean;
  /** Nivo površine SEKCIJE u kojoj kartica stoji (v3). Kartica crta svoju pozadinu →
      za jedan dublje (suprotna boja); medijski bunar u njoj → još jedan dublje. */
  level?: number;
}) {
  const m = marketingContent[locale];
  const cardLevel = nextLevel(level);
  const mediaLevel = nextLevel(cardLevel);
  const courseHref = withLocale(locale, `/courses/${course.slug}`);
  const freeVideoHref = `${courseHref}#besplatan-video`;
  const signInHref = `${withLocale(locale, "/sign-in")}?next=${encodeURIComponent(courseHref)}`;
  const favoriteLabel =
    locale === "sr"
      ? `Sačuvaj kurs ${localized(course.title, locale)} u favorite`
      : `Save ${localized(course.title, locale)} to favorites`;

  return (
    <article
      data-motion="card"
      className={`group relative flex min-h-full flex-col overflow-hidden rounded-[16px] border-2 border-ink ${surfaceClass(cardLevel)} shadow-[6px_6px_0_0_var(--shadow-hard-16)] transition hover:-translate-y-1 hover:shadow-[9px_9px_0_0_var(--shadow-hard-20)] has-[>a:focus-visible]:outline has-[>a:focus-visible]:outline-2 has-[>a:focus-visible]:outline-offset-2 has-[>a:focus-visible]:outline-ink`}
    >
      <Link
        href={courseHref}
        aria-label={locale === "sr" ? `Otvori kurs ${localized(course.title, locale)}` : `Open ${localized(course.title, locale)}`}
        className="absolute inset-0 z-0"
      />

      <div className="pointer-events-none relative z-10 p-3">
        <div className={`relative aspect-[16/9] overflow-hidden surface-media border-2 border-ink ${surfaceClass(mediaLevel)}`}>
          {course.image.loop ? (
            <LoopVideo
              webmSrc={course.image.loop.webm}
              mp4Src={course.image.loop.mp4}
              posterSrc={course.image.loop.poster}
              label={localized(course.image.alt, locale)}
              className="absolute inset-0"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          ) : (
            <Image
              src={course.image.src}
              alt={localized(course.image.alt, locale)}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          )}
          <span className="absolute left-3 top-3 rounded-full border-2 border-ink bg-yellow px-4 py-2 text-sm font-black leading-none tabular-nums text-ink shadow-[3px_3px_0_0_var(--shadow-hard-22)]">
            {localized(course.priceLabel, locale)}
          </span>
          <div className="pointer-events-auto absolute right-3 top-3">
            {hasConvex ? (
              <CourseFavoriteButton
                courseSlug={course.slug}
                signInHref={signInHref}
                label={favoriteLabel}
              />
            ) : (
              <Link
                href={signInHref}
                aria-label={favoriteLabel}
                title={favoriteLabel}
                className="relative z-10 inline-flex size-11 items-center justify-center rounded-full border-2 border-ink bg-paper-strong text-ink shadow-[3px_3px_0_0_var(--shadow-hard-24)] transition hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <Heart className="size-5" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col px-6 py-7 sm:px-8">
        <h3 className="text-3xl font-black leading-tight text-ink">{localized(course.title, locale)}</h3>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-muted">
          {m.courses.outcomesLabel}
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-base font-bold leading-7 text-muted">
          {course.detail.outcomes.map((outcome) => (
            <li key={localized(outcome, locale)} className="flex items-start gap-2">
              <CheckCircle2 className="mt-1 size-5 shrink-0 text-ink" />
              <span>{localized(outcome, locale)}</span>
            </li>
          ))}
        </ul>
        <div className="pointer-events-auto relative z-20 mt-auto flex flex-col gap-3 pt-7 lg:flex-row">
          <Link
            href={freeVideoHref}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-5 py-2.5 text-sm font-extrabold text-ink shadow-[4px_4px_0_0_var(--ink)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0_0_var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:flex-1"
          >
            <PlayCircle className="size-4" />
            {m.hero.ctaSecondary}
          </Link>
          <Link
            href={courseHref}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-ink px-5 py-2.5 text-sm font-extrabold text-paper-strong shadow-[4px_4px_0_0_var(--ink)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-[2px_2px_0_0_var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:flex-1"
          >
            {m.courses.viewCourse}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
