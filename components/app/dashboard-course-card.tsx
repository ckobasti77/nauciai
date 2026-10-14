"use client";

import { Check, Clock3, Lock, MessageCircle, PlayCircle, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { CourseCover, getProgressSummary, statusCopy, type DashboardCourse } from "@/components/app/dashboard-content";
import { IgraLik } from "@/components/igra/igra-lik";
import { ProgressRing } from "@/components/igra/progress-ring";
import { LinkButton, cn } from "@/components/ui/primitives";
import { coursePath, lessonPath } from "@/lib/app-routes";
import { IGRA_CLASSROOM_COPY } from "@/lib/igra-copy";
import { courseCardState, courseLik } from "@/lib/igra-course-art";
import { localized, t as tr, withLocale, type Locale } from "@/lib/i18n";
import { progressEncouragement } from "@/lib/progress-encouragement";
import { nextLevel, surfaceClass, type SurfaceLevel } from "@/lib/surface";

function formatLastActivity(locale: Locale, timestamp?: number) {
  if (!timestamp) return tr(locale, "Jos nema aktivnosti", "No activity yet");
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-RS" : "en-US", {
    day: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}

function courseCommunityHref(locale: Locale, courseSlug: string) {
  return `${withLocale(locale, "/app/community")}?course=${courseSlug}`;
}

/**
 * Kartica otključanog kursa. Živi van `dashboard-content.tsx` (IGRA K09): taj fajl se
 * učitava na svakoj ruti aplikacije, a kartica nosi lik ekipe i prsten napretka.
 *
 * Kurs je „svet": lik po temi stoji na naslovnoj slici (`courseLik`), prsten kaže koliko
 * je pređeno, a stanje se čita bez teksta - prazan prsten (nije počet), prsten sa
 * procentom (u toku), pun prsten sa kvačicom i pečat „Završeno".
 */
export function DashboardCourseCard({
  locale,
  course,
  isAdmin,
  summary = getProgressSummary(course, locale),
  loop = false,
  level,
  trackSlug,
}: {
  locale: Locale;
  course: DashboardCourse;
  isAdmin: boolean;
  summary?: ReturnType<typeof getProgressSummary>;
  /** Naslovna vitrina pušta petlju kursa (N10, zona „Kursevi" u Učionici). */
  loop?: boolean;
  /**
   * Nivo površine SEKCIJE u kojoj kartica stoji (v3, `lib/surface.ts`). Kartica crta svoju
   * pozadinu → uzima suprotnu boju, a medijski bunar u njoj još jednu dublje. Bez `level`
   * ostaje zatečeni `paper-strong` (stranica smera), pa se ništa van Učionice ne pomera.
   */
  level?: SurfaceLevel;
  /** Smer kursa, kad ga pozivalac zna: i on bira lik. */
  trackSlug?: string;
}) {
  // Isti ugovor kao na `CourseCatalogCard`: `layout`, podizanje i pritisak staju kada
  // korisnik traži manje pokreta. Bez ovoga je otključana kartica jedina u mreži koja se
  // i dalje pomera pod `prefers-reduced-motion`.
  const reduceMotion = useReducedMotion();
  const cardBg = level === undefined ? "bg-paper-strong" : surfaceClass(nextLevel(level));
  const mediaBg = level === undefined ? "bg-paper" : surfaceClass(nextLevel(nextLevel(level)));
  const canOpen = isAdmin || course.hasAccess;
  const title = localized(course.title, locale);
  const state = courseCardState(summary);
  const primaryLabel =
    state === "done"
      ? IGRA_CLASSROOM_COPY.courseReview[locale]
      : state === "progress"
        ? tr(locale, "Nastavi", "Continue")
        : tr(locale, "Otvori kurs", "Open course");
  const ringLabel = `${tr(locale, `Napredak kursa ${title}`, `Progress for ${title}`)}: ${
    state === "done" ? IGRA_CLASSROOM_COPY.courseDoneRing[locale] : `${summary.percent}%`
  }`;

  return (
    <motion.article
      data-motion="card"
      layout={!reduceMotion}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      // Ista mikro-interakcija kao na kartici zaključanog kursa: `whileHover` diže, CSS
      // produbljuje tvrdu senku. Otključan i zaključan kurs u istoj mreži moraju da se
      // ponašaju isto, inače mreža izgleda kao dva različita sistema.
      className={cn(
        "card-anim-elevate dashboard-reveal group relative overflow-hidden surface-card border-2 border-ink shadow-[6px_6px_0_0_var(--shadow-hard-12)] hover:shadow-[9px_9px_0_0_var(--shadow-hard-20)] has-[a:focus-visible]:outline has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ink",
        cardBg,
      )}
    >
      {/* CELA kartica je klik meta ka kursu (N10): sloj linka je ispod sadržaja, sadržaj
          ne prima klik, a dugmad na dnu ga vraćaju sebi (`pointer-events-auto`, z-20) —
          isti obrazac kao kartica kursa na javnim stranama. */}
      <Link
        href={coursePath(locale, course.slug)}
        aria-label={tr(locale, `Otvori kurs ${title}`, `Open ${title}`)}
        className="absolute inset-0 z-0"
      />
      {/* Naslovna slika: media radius (8px) i isti odnos 16/9 kao na zaključanoj kartici.
          Okvir nosi kartica, pa medij ima samo tanku unutrašnju ivicu (N12). */}
      <div className="pointer-events-none relative z-10 p-3">
        <div className={cn("relative aspect-[16/9] overflow-hidden surface-media shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]", mediaBg)}>
          <CourseCover course={course} locale={locale} loop={loop} />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border-2 border-ink bg-paper-strong px-3 py-1 type-eyebrow text-ink">
            <ShieldCheck className="size-3.5" />
            {statusCopy(locale, course, isAdmin)}
          </span>
          {state === "done" ? (
            // Pečat miruje: „udar" pripada slavlju na kraju kursa.
            <span className="igra-stamp absolute right-3 top-3 bg-paper-strong px-3 py-1 type-eyebrow">
              <span className="text-ink">{IGRA_CLASSROOM_COPY.stampDone[locale]}</span>
            </span>
          ) : null}
          <IgraLik lik={courseLik({ slug: course.slug, trackSlug, title: course.title })} decorative className="absolute bottom-2 right-2" />
        </div>
      </div>
      <div className="pointer-events-none relative z-10 space-y-4 px-5 pb-5 pt-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="type-h2 text-ink">{title}</h3>
            <p className="mt-2 line-clamp-2 type-body-sm font-bold text-muted">{localized(course.subtitle, locale)}</p>
          </div>
          {/* Prsten je odgovor na „gde sam": procenat u sredini, a odnos lekcija i jedna
              topla rečenica (`lib/progress-encouragement.ts`) ispod, kao detalj. */}
          <ProgressRing progress={summary.percent / 100} label={ringLabel}>
            {state === "done" ? <Check className="size-5" strokeWidth={3} /> : `${summary.percent}%`}
          </ProgressRing>
        </div>

        <p className="type-caption font-bold text-muted">
          <span className="font-black text-ink">
            {summary.completedLessons}/{summary.totalLessons || 0} {tr(locale, "lekcija", "lessons")}
          </span>
          {" · "}
          {progressEncouragement(locale, {
            completedLessons: summary.completedLessons,
            totalLessons: summary.totalLessons,
          })}
        </p>

        <p className="inline-flex items-center gap-2 text-sm font-bold text-muted">
          <Clock3 className="size-4 text-ink" />
          {formatLastActivity(locale, summary.lastActivityAt)}
        </p>

        {summary.nextLesson && state !== "done" ? (
          <p className="surface-inset border border-line bg-paper px-3 py-2 type-body-sm font-bold text-muted">
            <span className="font-black text-ink">{tr(locale, "Sledece:", "Next:")}</span>{" "}
            {localized(summary.nextLesson.title, locale)}
          </p>
        ) : null}

        {/* „Detalji" je otišao: sloj linka preko cele kartice vodi na isto mesto, pa je
            zaseban link bio drugi put ista destinacija u istom redu. */}
        <div className="pointer-events-auto relative z-20 flex flex-wrap items-center gap-x-5 gap-y-3">
          {canOpen ? (
            <LinkButton
              href={summary.nextLesson ? lessonPath(locale, course.slug, summary.nextLesson.slug) : coursePath(locale, course.slug)}
              tone="smoke"
              className="min-h-10 px-4 text-xs font-black"
            >
              <PlayCircle className="size-4" />
              {primaryLabel}
            </LinkButton>
          ) : (
            <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border-2 border-line bg-paper px-4 text-xs font-black text-muted">
              <Lock className="size-4" />
              {tr(locale, "U pripremi", "In preparation")}
            </span>
          )}
          <Link
            href={courseCommunityHref(locale, course.slug)}
            className="inline-flex min-h-11 items-center gap-1 text-xs font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {tr(locale, "Zajednica", "Community")}
            <MessageCircle className="size-3.5" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
