"use client";

import { BarChart3, BookOpen, CheckCircle2, Clock, MessageCircle, PlayCircle } from "lucide-react";
import Link from "next/link";

import { CheckoutButton } from "@/components/app/checkout-button";
import { LinkButton, Panel, SectionHeader } from "@/components/ui/primitives";
import type { ViewerProfile } from "@/lib/current-viewer";
import { dictionary, localized, type Locale, type LocalizedText, withLocale } from "@/lib/i18n";

export type DashboardLesson = {
  slug: string;
  title: LocalizedText;
  duration: string;
};

export type DashboardCourse = {
  slug: string;
  title: LocalizedText;
  description: LocalizedText;
  status: "draft" | "published" | "archived";
  hasAccess: boolean;
  lessons: DashboardLesson[];
};

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
  const t = dictionary[locale];
  const firstLesson = course.lessons[0];
  const lessons = course.lessons.length;
  const profileName = profile?.name ?? "Student";
  const courseIsPublished = course.status === "published";
  const canOpenCheckout = courseIsPublished && !isAdmin;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <SectionHeader
          title={locale === "sr" ? `Zdravo, ${profileName}` : `Hi, ${profileName}`}
          body={
            locale === "sr"
              ? "Tvoj pregled smerova, statusa pretplate i zajednice."
              : "Your track, billing, and community overview."
          }
        />
        {firstLesson ? (
          <LinkButton href={withLocale(locale, `/app/courses/${course.slug}/lessons/${firstLesson.slug}`)} tone="yellow">
            <PlayCircle className="size-4" />
            {t.continueLesson}
          </LinkButton>
        ) : (
          <div className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper px-5 py-2.5 text-sm font-extrabold text-ink">
            {locale === "sr" ? "Uskoro" : "Coming soon"}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: t.progress, value: isAdmin ? "Admin" : "42%", icon: BarChart3 },
          { label: t.lessons, value: `${lessons}`, icon: BookOpen },
          { label: t.community, value: locale === "sr" ? "2 nova" : "2 new", icon: MessageCircle },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Panel key={stat.label} className="p-5">
              <Icon className="size-5 text-ink" />
              <p className="mt-4 text-sm font-extrabold text-muted">{stat.label}</p>
              <p className="text-3xl font-black text-ink">{stat.value}</p>
            </Panel>
          );
        })}
      </div>

      <Panel className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-display text-3xl text-ink">{localized(course.title, locale)}</p>
            <p className="mt-2 max-w-3xl text-base leading-7 text-muted">{localized(course.description, locale)}</p>
          </div>
          <div className="rounded-[8px] border-2 border-ink bg-yellow px-4 py-2 text-sm font-black text-ink">
            {courseIsPublished
              ? locale === "sr"
                ? "Aktivno"
                : "Active"
              : locale === "sr"
                ? "Nacrt"
                : "Draft"}
          </div>
        </div>
        <div className="mt-6 h-3 overflow-hidden rounded-[8px] border-2 border-ink bg-paper">
          <div className="h-full w-[42%] bg-yellow" />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {course.lessons.slice(0, 3).map((lesson, index) => (
            <Link
              key={lesson.slug}
              href={withLocale(locale, `/app/courses/${course.slug}/lessons/${lesson.slug}`)}
              className="rounded-[8px] border-2 border-ink bg-white p-4 transition hover:-translate-y-0.5 hover:bg-paper"
            >
              <div className="flex items-center justify-between gap-4">
                <Clock className="size-4 text-muted" />
                {index === 0 ? <CheckCircle2 className="size-4 text-ink" /> : null}
              </div>
              <p className="mt-4 text-base font-black text-ink">{localized(lesson.title, locale)}</p>
              <p className="mt-1 text-sm font-bold text-muted">{lesson.duration}</p>
            </Link>
          ))}
          {!lessons ? (
            <div className="rounded-[8px] border-2 border-dashed border-ink bg-paper p-4 text-sm font-black text-muted">
              {locale === "sr" ? "Lekcije za ovaj smer stizu uskoro." : "Lessons for this track are coming soon."}
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel className="p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xl font-black text-ink">{locale === "sr" ? "Pretplata i pristup" : "Subscription and access"}</p>
            <p className="mt-2 text-base leading-7 text-muted">
              {locale === "sr"
                ? "Ako status pretplate istekne, lekcije ostaju vidljive u navigaciji, ali zakljucane server-side."
                : "If subscription status expires, lessons remain visible in navigation but are locked server-side."}
            </p>
          </div>
          {canOpenCheckout ? (
            <CheckoutButton courseSlug={course.slug} locale={locale} label={t.checkout} />
          ) : (
            <div className="inline-flex min-h-11 items-center justify-center rounded-[8px] border-2 border-ink bg-paper px-5 text-sm font-extrabold text-ink">
              {isAdmin ? "Admin" : locale === "sr" ? "Uskoro" : "Coming soon"}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
