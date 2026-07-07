"use client";

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Clock,
  Gauge,
  Lock,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

import { CheckoutButton } from "@/components/app/checkout-button";
import { LinkButton, Panel, cn } from "@/components/ui/primitives";
import type { ViewerProfile } from "@/lib/current-viewer";
import { dictionary, localized, type Locale, type LocalizedText, withLocale } from "@/lib/i18n";

export type DashboardLesson = {
  slug: string;
  title: LocalizedText;
  duration: string;
  isPublished?: boolean;
  sortOrder?: number;
};

export type DashboardModule = {
  title: LocalizedText;
  sortOrder?: number;
  lessons: DashboardLesson[];
};

export type DashboardCourse = {
  slug: string;
  title: LocalizedText;
  description: LocalizedText;
  status: "draft" | "published" | "archived";
  hasAccess: boolean;
  lessons: DashboardLesson[];
  modules?: DashboardModule[];
};

let dashboardScrollTriggerRegistered = false;

function statusCopy(locale: Locale, course: DashboardCourse, isAdmin: boolean) {
  if (isAdmin) {
    return course.status === "published"
      ? labelFor(locale, "Objavljen smer", "Published track")
      : course.status === "archived"
        ? labelFor(locale, "Arhiviran smer", "Archived track")
        : labelFor(locale, "Admin nacrt", "Admin draft");
  }
  if (course.status !== "published") return labelFor(locale, "Uskoro", "Coming soon");
  if (!course.hasAccess) return labelFor(locale, "Zakljucano", "Locked");
  return labelFor(locale, "Aktivan pristup", "Active access");
}

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function flattenModules(course: DashboardCourse, locale: Locale): DashboardModule[] {
  const liveModules = course.modules?.filter((module) => module.lessons.length || module.title.sr || module.title.en);
  if (liveModules?.length) return liveModules;

  return [
    {
      title: {
        sr: locale === "sr" ? "Lekcije" : "Lessons",
        en: "Lessons",
      },
      sortOrder: 0,
      lessons: course.lessons,
    },
  ];
}

function StatPanel({
  label,
  value,
  icon: Icon,
  tone = "paper",
}: {
  label: string;
  value: string;
  icon: typeof BarChart3;
  tone?: "paper" | "yellow" | "ink";
}) {
  return (
    <motion.div layout whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}>
      <Panel
        className={cn(
          "dashboard-reveal p-5 transition",
          tone === "yellow" && "bg-yellow",
          tone === "ink" && "bg-ink text-white",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={cn("text-sm font-extrabold", tone === "ink" ? "text-white/70" : "text-muted")}>{label}</p>
            <p className={cn("mt-2 text-3xl font-black", tone === "ink" ? "text-white" : "text-ink")}>{value}</p>
          </div>
          <span
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-[8px] border-2",
              tone === "ink" ? "border-white bg-yellow text-ink" : "border-ink bg-white text-ink",
            )}
          >
            <Icon className="size-5" />
          </span>
        </div>
      </Panel>
    </motion.div>
  );
}

function LessonRow({
  locale,
  courseSlug,
  lesson,
  index,
  canOpen,
  isAdmin,
}: {
  locale: Locale;
  courseSlug: string;
  lesson: DashboardLesson;
  index: number;
  canOpen: boolean;
  isAdmin: boolean;
}) {
  const content = (
    <motion.div
      layout
      whileHover={canOpen ? { x: 3 } : undefined}
      whileTap={canOpen ? { scale: 0.99 } : undefined}
      className={cn(
        "group flex min-h-16 items-center gap-3 border-t-2 border-line px-1 py-3 transition first:border-t-0",
        canOpen ? "text-ink" : "text-muted",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[8px] border-2 text-xs font-black",
          index === 0 && canOpen ? "border-ink bg-yellow text-ink" : "border-line bg-paper text-muted",
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black">{localized(lesson.title, locale)}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
          <Clock className="size-3.5" />
          {lesson.duration}
          {isAdmin && lesson.isPublished === false ? (
            <span className="rounded-[6px] border-2 border-ink bg-white px-2 py-0.5 text-[10px] font-black text-ink">
              {labelFor(locale, "Nacrt", "Draft")}
            </span>
          ) : null}
        </span>
      </span>
      {canOpen ? (
        <ArrowRight className="size-4 shrink-0 text-ink transition group-hover:translate-x-0.5" />
      ) : (
        <Lock className="size-4 shrink-0" />
      )}
    </motion.div>
  );

  if (!canOpen) return <div>{content}</div>;

  return (
    <Link href={withLocale(locale, `/app/courses/${courseSlug}/lessons/${lesson.slug}`)} className="block">
      {content}
    </Link>
  );
}

export function DashboardContent({
  locale,
  profile,
  course,
  isAdmin = false,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  course: DashboardCourse;
  isAdmin?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const t = dictionary[locale];
  const modules = useMemo(() => flattenModules(course, locale), [course, locale]);
  const lessons = modules.reduce((count, module) => count + module.lessons.length, 0);
  const publishedLessons = modules.reduce(
    (count, module) => count + module.lessons.filter((lesson) => lesson.isPublished !== false).length,
    0,
  );
  const draftLessons = Math.max(0, lessons - publishedLessons);
  const firstLesson = modules.flatMap((module) => module.lessons)[0];
  const profileName = profile?.name ?? "Student";
  const courseIsPublished = course.status === "published";
  const canOpenCheckout = courseIsPublished && !course.hasAccess && !isAdmin;
  const canContinue = Boolean(firstLesson && (course.hasAccess || isAdmin));
  const completionPercent = isAdmin ? 100 : course.hasAccess ? 42 : 0;

  useEffect(() => {
    if (!rootRef.current || shouldReduceMotion) return;
    if (!dashboardScrollTriggerRegistered) {
      gsap.registerPlugin(ScrollTrigger);
      dashboardScrollTriggerRegistered = true;
    }

    const context = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".dashboard-reveal").forEach((element, index) => {
        gsap.from(element, {
          autoAlpha: 0,
          y: 18,
          duration: 0.45,
          delay: index * 0.015,
          ease: "power2.out",
          scrollTrigger: {
            trigger: element,
            start: "top 88%",
            once: true,
          },
        });
      });
    }, rootRef);

    return () => context.revert();
  }, [shouldReduceMotion]);

  return (
    <div ref={rootRef} className="space-y-6">
      <section className="dashboard-reveal overflow-hidden rounded-[10px] border-2 border-ink bg-white shadow-[8px_8px_0_0_rgba(14,49,88,0.14)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-3 py-1 text-xs font-black text-ink">
                <ShieldCheck className="size-4" />
                {statusCopy(locale, course, isAdmin)}
              </span>
              {isAdmin && draftLessons ? (
                <span className="rounded-[8px] border-2 border-ink bg-paper px-3 py-1 text-xs font-black text-ink">
                  {draftLessons} {labelFor(locale, "nacrta", "drafts")}
                </span>
              ) : null}
            </div>
            <p className="mt-6 text-sm font-black uppercase text-muted">
              {locale === "sr" ? `Zdravo, ${profileName}` : `Hi, ${profileName}`}
            </p>
            <h1 className="mt-2 max-w-4xl text-4xl font-black leading-tight text-ink sm:text-5xl">
              {localized(course.title, locale)}
            </h1>
            <p className="mt-4 max-w-3xl text-base font-bold leading-7 text-muted sm:text-lg">
              {localized(course.description, locale)}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {canContinue && firstLesson ? (
                <LinkButton href={withLocale(locale, `/app/courses/${course.slug}/lessons/${firstLesson.slug}`)} tone="yellow">
                  <PlayCircle className="size-4" />
                  {t.continueLesson}
                </LinkButton>
              ) : canOpenCheckout ? (
                <CheckoutButton courseSlug={course.slug} locale={locale} label={t.checkout} />
              ) : (
                <div className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper px-5 py-2.5 text-sm font-extrabold text-ink">
                  <Sparkles className="size-4" />
                  {courseIsPublished ? labelFor(locale, "Pristup nije aktivan", "Access is not active") : labelFor(locale, "U pripremi", "In preparation")}
                </div>
              )}
              <LinkButton href={withLocale(locale, `/app/community?course=${course.slug}`)} tone="paper">
                <MessageCircle className="size-4" />
                {t.community}
              </LinkButton>
            </div>
          </div>
          <div className="border-t-2 border-ink bg-ink p-5 text-white lg:border-l-2 lg:border-t-0">
            <p className="text-sm font-black uppercase text-white/65">{labelFor(locale, "Snimak napretka", "Progress snapshot")}</p>
            <div className="mt-5 flex items-end gap-3">
              <p className="text-6xl font-black leading-none">{isAdmin ? "Admin" : `${completionPercent}%`}</p>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-[8px] border-2 border-white bg-white/15">
              <motion.div
                className="h-full bg-yellow"
                initial={{ width: 0 }}
                animate={{ width: `${completionPercent}%` }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.7, ease: "easeOut" }}
              />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs font-black">
              <div className="rounded-[8px] border-2 border-white/25 p-3">
                <p className="text-white/60">{labelFor(locale, "Moduli", "Modules")}</p>
                <p className="mt-1 text-xl text-white">{modules.length}</p>
              </div>
              <div className="rounded-[8px] border-2 border-white/25 p-3">
                <p className="text-white/60">{t.lessons}</p>
                <p className="mt-1 text-xl text-white">{lessons}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <StatPanel label={t.progress} value={isAdmin ? labelFor(locale, "Editor", "Editor") : `${completionPercent}%`} icon={BarChart3} tone="yellow" />
        <StatPanel label={t.lessons} value={`${publishedLessons}/${lessons || 0}`} icon={BookOpen} />
        <StatPanel label={t.community} value={locale === "sr" ? "2 nova" : "2 new"} icon={MessageCircle} tone="ink" />
      </div>

      <Panel className="dashboard-reveal overflow-hidden">
        <div className="border-b-2 border-ink bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-muted">{labelFor(locale, "Roadmap smera", "Track roadmap")}</p>
              <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">
                {labelFor(locale, "Sta sledi dalje", "What comes next")}
              </h2>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-[8px] border-2 border-ink bg-paper px-3 py-2 text-xs font-black text-ink">
              <Gauge className="size-4" />
              {publishedLessons} / {lessons || 0} {labelFor(locale, "spremno", "ready")}
            </span>
          </div>
        </div>
        <div className="divide-y-2 divide-line p-5 sm:p-6">
          {modules.map((module, moduleIndex) => (
            <motion.section key={`${localized(module.title, locale)}-${moduleIndex}`} layout className="dashboard-reveal py-4 first:pt-0 last:pb-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase text-muted">
                    {labelFor(locale, "Modul", "Module")} {moduleIndex + 1}
                  </p>
                  <h3 className="truncate text-lg font-black text-ink">{localized(module.title, locale)}</h3>
                </div>
                <span className="shrink-0 rounded-[8px] border-2 border-line bg-paper px-3 py-1 text-xs font-black text-muted">
                  {module.lessons.length} {labelFor(locale, "lekcija", "lessons")}
                </span>
              </div>
              {module.lessons.length ? (
                <div>
                  {module.lessons.map((lesson, lessonIndex) => (
                    <LessonRow
                      key={lesson.slug}
                      locale={locale}
                      courseSlug={course.slug}
                      lesson={lesson}
                      index={lessonIndex}
                      canOpen={canContinue}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[8px] border-2 border-dashed border-line bg-paper p-4 text-sm font-black text-muted">
                  {locale === "sr" ? "Modul jos nema lekcija." : "This module has no lessons yet."}
                </div>
              )}
            </motion.section>
          ))}
          {!lessons ? (
            <div className="rounded-[8px] border-2 border-dashed border-ink bg-paper p-5 text-sm font-black text-muted">
              {locale === "sr" ? "Lekcije za ovaj smer stizu uskoro." : "Lessons for this track are coming soon."}
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel className="dashboard-reveal p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xl font-black text-ink">{locale === "sr" ? "Pretplata i pristup" : "Subscription and access"}</p>
            <p className="mt-2 text-base leading-7 text-muted">
              {isAdmin
                ? labelFor(
                    locale,
                    "Admin vidi sve nacrte i zakljucane lekcije direktno u aplikaciji.",
                    "Admins see all drafts and locked lessons directly in the app.",
                  )
                : course.hasAccess
                  ? labelFor(locale, "Pristup je aktivan. Mozes nastaviti od prve dostupne lekcije.", "Access is active. You can continue from the first available lesson.")
                  : labelFor(locale, "Aktiviraj pristup da otvoris kompletan roadmap lekcija.", "Activate access to open the full lesson roadmap.")}
            </p>
          </div>
          {canOpenCheckout ? (
            <CheckoutButton courseSlug={course.slug} locale={locale} label={t.checkout} />
          ) : (
            <div className="inline-flex min-h-11 items-center justify-center rounded-[8px] border-2 border-ink bg-paper px-5 text-sm font-extrabold text-ink">
              {isAdmin ? "Admin" : course.hasAccess ? labelFor(locale, "Aktivno", "Active") : labelFor(locale, "Uskoro", "Coming soon")}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
