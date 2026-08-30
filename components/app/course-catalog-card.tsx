"use client";

import { ArrowRight, BookOpen, Check, Lock, PlayCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import { CheckoutButton } from "@/components/app/checkout-button";
import { CourseCover, type DashboardCourse } from "@/components/app/dashboard-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { coursePath } from "@/lib/app-routes";
import {
  catalogPriceLabel,
  courseLengthLabel,
  totalDurationSeconds,
} from "@/lib/course-catalog";
import { localized, t as tr, type Locale } from "@/lib/i18n";

/** Koliko naslova lekcija stane u „Šta se uči" pre nego što kartica postane spisak. */
const PREVIEW_TOPICS = 3;

function publishedLessons(course: DashboardCourse) {
  return course.lessons.filter((lesson) => lesson.isPublished !== false);
}

/**
 * Kartica kursa koji student još nema — jedina prodajna površina unutar aplikacije.
 *
 * Redosled je namerno „šta je to → koliko traje → šta se uči → koliko košta →
 * otključaj": početnik prvo mora da razume šta kupuje. Cena stoji na naslovnoj
 * slici, isto mesto i isti žuti pill kao na marketing stranici, da se ista cena ne
 * bi pojavila u dva različita oblika.
 *
 * Okvir (16px, ofset senka, 8px naslovna slika) prati `DashboardCourseCard` da bi
 * otključan i zaključan kurs u istoj mreži izgledali kao jedan sistem; razlikuju ih
 * značka „Zaključano", cena i dugmad.
 */
export function CourseCatalogCard({ locale, course }: { locale: Locale; course: DashboardCourse }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  // Kartica se pojavljuje i prerađuje kroz filter, pa `layout` i podizanje na hover
  // moraju da stanu kad korisnik traži manje pokreta (`prefers-reduced-motion`).
  const reduceMotion = useReducedMotion();

  const lessons = publishedLessons(course);
  const price = catalogPriceLabel(course.slug);
  const title = localized(course.title, locale);
  const topics = lessons.slice(0, PREVIEW_TOPICS);
  const remainingTopics = lessons.length - topics.length;

  return (
    <motion.article
      data-motion="card"
      layout={!reduceMotion}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      // Senka raste na hover, a `whileHover` u istom trenutku podiže karticu za 3px:
      // zajedno to čita kao „papir se odvojio od stola". Transform vodi Framer, senku CSS
      // (`card-anim-elevate`), pa se dve animacije ne otimaju o istu osobinu.
      className="card-anim-elevate flex flex-col overflow-hidden surface-card border-2 border-ink bg-paper-strong shadow-[6px_6px_0_0_var(--shadow-hard-12)] hover:shadow-[9px_9px_0_0_var(--shadow-hard-20)]"
    >
      <div className="p-3">
        <div className="relative aspect-[16/9] overflow-hidden surface-media border-2 border-ink bg-paper">
          <CourseCover course={course} locale={locale} />
          {/* Zaključan kurs se ne sivi i ne zatamnjuje — na naslovnu sliku ide postojeća
              školska šrafura (`ink-hatch`, mastilo na 8%). Slika ostaje u boji i ostaje
              poželjna, ali se vidi da preko nje još stoji olovka: „ovo još nije tvoje". */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 ink-hatch" />
          <Badge tone="ink" icon={<Lock className="size-3.5" />} className="absolute left-3 top-3">
            {tr(locale, "Zaključano", "Locked")}
          </Badge>
          {price ? (
            <span className="absolute right-3 top-3 rounded-full border-2 border-ink bg-yellow px-3 py-1 text-sm font-black leading-none text-ink shadow-[3px_3px_0_0_var(--shadow-hard-22)]">
              {localized(price, locale)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-2">
        <div>
          <h3 className="type-h2 text-ink">{title}</h3>
          <p className="mt-2 line-clamp-2 type-body-sm font-bold text-muted">
            {localized(course.subtitle, locale)}
          </p>
        </div>

        <p className="inline-flex items-center gap-2 text-sm font-bold text-muted">
          <BookOpen className="size-4 shrink-0 text-ink" />
          {courseLengthLabel(locale, lessons.length, totalDurationSeconds(lessons))}
        </p>

        {topics.length ? (
          <div className="surface-inset border-2 border-line bg-paper px-3 py-3">
            <p className="type-eyebrow text-muted">{tr(locale, "Šta se uči", "What you learn")}</p>
            <ul className="mt-2 space-y-1.5">
              {topics.map((lesson) => (
                <li key={lesson.slug} className="flex items-start gap-2 type-body-sm font-bold text-ink">
                  <Check className="mt-1 size-3.5 shrink-0 text-ink" aria-hidden="true" />
                  <span className="min-w-0">{localized(lesson.title, locale)}</span>
                </li>
              ))}
            </ul>
            {remainingTopics > 0 ? (
              <p className="mt-2 text-xs font-bold text-muted">
                {tr(locale, `+ još ${remainingTopics} u kursu`, `+ ${remainingTopics} more in the course`)}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-3 pt-1">
          <CheckoutButton
            courseSlug={course.slug}
            locale={locale}
            label={tr(locale, "Otključaj", "Unlock")}
            tone="yellow"
          />
          {course.videoUrl ? (
            <Button
              variant="secondary"
              onClick={() => setPreviewOpen(true)}
              icon={<PlayCircle className="size-4" />}
            >
              {tr(locale, "Pogledaj uvod", "Watch the intro")}
            </Button>
          ) : null}
          <Link
            href={coursePath(locale, course.slug)}
            className="inline-flex items-center gap-1 text-xs font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {tr(locale, "Detalji", "Details")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {course.videoUrl ? (
        <Dialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={title}
          description={tr(
            locale,
            "Besplatan uvodni video. Ostatak kursa se otključava kupovinom.",
            "A free intro video. The rest of the course unlocks with a purchase.",
          )}
          closeLabel={tr(locale, "Zatvori video", "Close video")}
          size="lg"
        >
          {/* Video se montira tek kad je dijalog otvoren (Dialog ne renderuje decu
              dok je zatvoren), pa zaključan kurs ne povlači snimak na svakoj kartici. */}
          <div className="overflow-hidden surface-media bg-ink">
            <video className="aspect-video w-full bg-ink object-contain" src={course.videoUrl} controls preload="metadata" />
          </div>
        </Dialog>
      ) : null}
    </motion.article>
  );
}

/**
 * Kompaktan red istog kursa za zonu „Smerovi".
 *
 * Zone „Smerovi" i „Kursevi" pokazuju iste kurseve; da se ista kartica ne bi
 * pojavila dvaput na jednom ekranu (početnik to čita kao „imam ovo dva puta"),
 * smerovi dobijaju spisak — mala naslovna slika, naziv, dužina i stanje — a
 * prodajna kartica sa cenom i dugmetom ostaje samo u zoni „Kursevi".
 */
export function CourseCatalogRow({
  locale,
  course,
  owned,
  percent,
}: {
  locale: Locale;
  course: DashboardCourse;
  owned: boolean;
  percent: number;
}) {
  const lessons = publishedLessons(course);
  const done = owned && lessons.length > 0 && percent === 100;

  return (
    <li>
      <Link
        href={coursePath(locale, course.slug)}
        className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink sm:gap-4 sm:px-6"
      >
        {/* <div>, ne <span>: CourseCover u fallback grani renderuje <div>. */}
        <div className="relative aspect-[16/9] w-16 shrink-0 overflow-hidden surface-media border-2 border-ink bg-paper sm:w-24">
          <CourseCover course={course} locale={locale} />
        </div>
        <span className="min-w-0 flex-1">
          <span className="block truncate type-h4 text-ink">{localized(course.title, locale)}</span>
          {/* Značka stoji u istom redu sa dužinom i prelama se ispod nje na uskom
              telefonu; kao zaseban stubac gurala bi naslov na desetak piksela. */}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-muted">
            {courseLengthLabel(locale, lessons.length, totalDurationSeconds(lessons))}
            {owned ? (
              <Badge tone={done ? "yellow" : "neutral"} size="sm">
                {done ? tr(locale, "Završen", "Done") : tr(locale, "Otključan", "Unlocked")}
              </Badge>
            ) : (
              <Badge tone="muted" size="sm" icon={<Lock className="size-3" />}>
                {tr(locale, "Zaključano", "Locked")}
              </Badge>
            )}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-ink" />
      </Link>
    </li>
  );
}
