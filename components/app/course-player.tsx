"use client";


import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Download, FileText, LayoutDashboard, Loader2, Lock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import {
  AddAssetAction,
  AddLessonPartAction,
  EditLessonAction,
  EditLessonPartAction,
} from "@/components/app/admin-inline-actions";
import { CourseLab, type LessonLabData } from "@/components/app/course-lab";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Panel, cn } from "@/components/ui/primitives";
import type { Course, Lesson, LessonPart } from "@/lib/content";
import { localized, type Locale, withLocale } from "@/lib/i18n";

type TokenPayload = Record<string, string>;



function PartContent({ part, locale }: { part: LessonPart; locale: Locale }) {
  if (part.kind === "video") {
    if (part.downloadUrl) {
      return (
        <video
          className="mt-4 aspect-video w-full rounded-[8px] border-2 border-ink bg-ink"
          src={part.downloadUrl}
          controls
          preload="metadata"
        />
      );
    }

    return (
      <div className="mt-4 flex aspect-video items-center justify-center rounded-[8px] border-2 border-dashed border-ink bg-paper p-6 text-center">
        <div>
          <PlayCircle className="mx-auto size-10 text-ink" />
          <p className="mt-3 text-sm font-black text-muted">
            {locale === "sr" ? "Video fajl jos nije uploadovan." : "Video file has not been uploaded yet."}
          </p>
        </div>
      </div>
    );
  }

  if (part.kind === "file") {
    return (
      <div className="mt-4 rounded-[8px] border-2 border-line bg-paper p-4">
        <div className="flex items-center gap-3">
          <FileText className="size-5 text-ink" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-ink">{part.fileName ?? localized(part.title, locale)}</p>
            {part.size ? <p className="text-xs font-bold text-muted">{part.size}</p> : null}
          </div>
          {part.downloadUrl ? (
            <a
              href={part.downloadUrl}
              download={part.fileName}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white px-3 text-xs font-black text-ink hover:bg-yellow"
            >
              <Download className="size-4" />
              {locale === "sr" ? "Preuzmi" : "Download"}
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return part.body ? (
    <p className="mt-4 whitespace-pre-wrap text-base leading-8 text-muted">{localized(part.body, locale)}</p>
  ) : (
    <p className="mt-4 text-sm font-bold text-muted">
      {locale === "sr" ? "Tekst za ovaj deo jos nije dodat." : "Text for this part has not been added yet."}
    </p>
  );
}

function childParts(parts: LessonPart[], parentPartId?: string) {
  return parts
    .filter((part) => (part.parentPartId ?? undefined) === parentPartId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function nextPartSortOrder(parts: LessonPart[], parentPartId?: string) {
  return childParts(parts, parentPartId).reduce((max, part) => Math.max(max, part.sortOrder ?? 0), 0) + 10;
}

export function CoursePlayer({
  course,
  lesson,
  locale,
  lessonId,
  courseId,
  moduleId,
  isAdmin = false,
}: {
  course: Course;
  lesson: Lesson;
  locale: Locale;
  lessonId?: Id<"lessons">;
  courseId?: Id<"courses">;
  moduleId?: Id<"modules">;
  isAdmin?: boolean;
}) {
  const markProgress = useMutation(api.courses.markProgress);
  const { isAuthenticated } = useConvexAuth();
  const viewerData = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip");
  const labData = useQuery(
    api.lab.getLessonLab,
    isAuthenticated && course.slug && lesson.slug ? { courseSlug: course.slug, lessonSlug: lesson.slug } : "skip",
  ) as LessonLabData | null | undefined;
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const effectiveIsAdmin = isAdmin || viewerData?.profile?.role === "admin";

  if (courseId && lessonId && labData?.steps?.length) {
    return (
      <CourseLab
        course={course}
        lesson={lesson}
        locale={locale}
        lab={labData}
        lessonId={lessonId}
      />
    );
  }

  async function handleMarkComplete() {
    if (!lessonId) {
      setProgressMessage(
        locale === "sr"
          ? "Napredak je dostupan kada je lekcija povezana sa Convex zapisom."
          : "Progress is available after the lesson is connected to Convex.",
      );
      return;
    }

    setIsSavingProgress(true);
    setProgressMessage(null);
    try {
      await markProgress({ lessonId, completed: true, positionSeconds: 0 });
      setProgressMessage(locale === "sr" ? "Napredak sacuvan." : "Progress saved.");
    } catch (error) {
      setProgressMessage(
        error instanceof Error
          ? error.message
          : locale === "sr"
            ? "Napredak nije sacuvan."
            : "Progress was not saved.",
      );
    } finally {
      setIsSavingProgress(false);
    }
  }

  function renderPartPanels(parentPartId?: string, prefix = "", level = 0): ReactNode {
    return childParts(lesson.parts, parentPartId).map((part, index) => {
      const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      const nested = part.id ? renderPartPanels(part.id, number, level + 1) : null;

      return (
        <div key={part.id ?? part.slug} className={cn("space-y-4", level > 0 && "ml-4 border-l-2 border-line pl-4")}>
          <Panel id={`part-${part.slug}`} className="scroll-mt-6 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase text-muted">
                  {locale === "sr" ? `Deo ${number}` : `Part ${number}`}
                </p>
                <h2 className="mt-1 text-2xl font-black text-ink">{localized(part.title, locale)}</h2>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {effectiveIsAdmin && part.id ? (
                  <>
                    <EditLessonPartAction
                      locale={locale}
                      courseId={courseId}
                      lessonId={lessonId}
                      lessonPartId={part.id}
                      initial={{
                        slug: part.slug,
                        parentPartId: part.parentPartId,
                        title: part.title,
                        kind: part.kind,
                        body: part.body,
                        fileName: part.fileName,
                        downloadUrl: part.downloadUrl,
                        isPublished: part.isPublished,
                        sortOrder: part.sortOrder,
                      }}
                      nextSortOrder={part.sortOrder ?? 10}
                      iconOnly
                    />
                    {level === 0 ? (
                      <AddLessonPartAction
                        locale={locale}
                        courseId={courseId}
                        lessonId={lessonId}
                        parentPartId={part.id}
                        nextSortOrder={nextPartSortOrder(lesson.parts, part.id)}
                        iconOnly
                        buttonLabel={locale === "sr" ? "Dodaj poddeo" : "Add subpart"}
                      />
                    ) : null}
                  </>
                ) : null}
                <span className="rounded-[8px] border-2 border-ink bg-paper px-3 py-1 text-xs font-black text-ink">
                  {part.kind}
                </span>
              </div>
            </div>
            <PartContent part={part} locale={locale} />
          </Panel>
          {nested}
        </div>
      );
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <section className="space-y-5">
        <Panel className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-display text-3xl text-ink">{localized(lesson.title, locale)}</p>
              <p className="mt-2 max-w-3xl text-base leading-7 text-muted">{localized(lesson.summary, locale)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {effectiveIsAdmin ? (
                <>
                  <EditLessonAction
                    locale={locale}
                    courseId={courseId}
                    courseSlug={course.slug}
                    moduleId={moduleId}
                    lessonId={lessonId}
                    initial={{
                      slug: lesson.slug,
                      title: lesson.title,
                      summary: lesson.summary,
                      durationSeconds: lesson.durationSeconds,
                      isPublished: lesson.isPublished ?? true,
                      sortOrder: lesson.sortOrder ?? 10,
                    }}
                    nextSortOrder={lesson.sortOrder ?? 10}
                  />
                  <Link
                    href={withLocale(locale, `/app/courses/${course.slug}/lessons/${lesson.slug}/edit`)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-ink px-4 text-sm font-extrabold text-white shadow-[3px_3px_0_0_rgba(14,49,88,0.16)] transition hover:-translate-y-0.5 hover:bg-yellow hover:text-ink"
                  >
                    <LayoutDashboard className="size-4" />
                    {locale === "sr" ? "Admin editor" : "Admin editor"}
                  </Link>
                  <AddLessonPartAction
                    locale={locale}
                    courseId={courseId}
                    lessonId={lessonId}
                    nextSortOrder={nextPartSortOrder(lesson.parts)}
                  />
                </>
              ) : null}
              <button
                type="button"
                onClick={handleMarkComplete}
                disabled={isSavingProgress}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-4 text-sm font-extrabold text-ink disabled:cursor-wait disabled:opacity-70"
              >
                {isSavingProgress ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                {locale === "sr" ? "Oznaci zavrseno" : "Mark complete"}
              </button>
            </div>
          </div>
          {progressMessage ? <p className="mt-4 text-sm font-bold text-muted">{progressMessage}</p> : null}
        </Panel>

        <div className="space-y-4">
          {childParts(lesson.parts).length ? (
            renderPartPanels()
          ) : (
            <Panel className="p-6 text-sm font-black text-muted">
              {locale === "sr" ? "Ova lekcija jos nema delove." : "This lesson has no parts yet."}
            </Panel>
          )}
        </div>
      </section>

      <Panel className="p-4 xl:sticky xl:top-6 xl:h-fit">
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-black text-ink">{locale === "sr" ? "Materijali" : "Materials"}</p>
          {effectiveIsAdmin ? <AddAssetAction locale={locale} courseId={courseId} lessonId={lessonId} tone="compact" /> : null}
        </div>
        <div className="mt-4 space-y-3">
          {lesson.assets.map((asset) => {
            const content = (
              <div className="flex items-start gap-3">
                <FileText className="mt-1 size-4 text-ink" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-ink">{localized(asset.label, locale)}</p>
                  <p className="text-xs font-bold text-muted">{asset.size}</p>
                </div>
                <Download className="size-4 text-ink" />
              </div>
            );

            return asset.downloadUrl ? (
              <a
                key={localized(asset.label, locale)}
                href={asset.downloadUrl}
                download
                className="block rounded-[8px] border-2 border-line bg-paper p-3 transition hover:border-ink hover:bg-yellow"
              >
                {content}
              </a>
            ) : (
              <div key={localized(asset.label, locale)} className="rounded-[8px] border-2 border-line bg-paper p-3">
                {content}
              </div>
            );
          })}
          {!lesson.assets.length ? (
            <p className="rounded-[8px] border-2 border-dashed border-line bg-paper p-3 text-sm font-black text-muted">
              {locale === "sr" ? "Nema materijala." : "No materials yet."}
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
