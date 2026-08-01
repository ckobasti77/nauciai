"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  Clock3,
  Gauge,
  ImageIcon,
  Layers,
  Loader2,
  Lock,
  MessageCircle,
  Pencil,
  PlayCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { InlineContentText } from "@/components/app/inline-content";
import { InlineRichText } from "@/components/app/rich-text";
import { CheckoutButton } from "@/components/app/checkout-button";
import { LinkButton, Panel, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ViewerProfile } from "@/lib/current-viewer";
import { dictionary, localized, t as tr, type Locale, type LocalizedText, withLocale } from "@/lib/i18n";

const EditCourseAction = dynamic(() => import("@/components/app/admin-inline-actions").then((m) => m.EditCourseAction), { ssr: false });

export type DashboardLesson = {
  id?: string;
  slug: string;
  title: LocalizedText;
  summary?: LocalizedText;
  summaryRich?: LocalizedText;
  duration: string;
  durationSeconds?: number;
  isPublished?: boolean;
  sortOrder?: number;
  progress?: {
    completed?: boolean;
    positionSeconds?: number;
    updatedAt?: number;
  } | null;
};

export type DashboardModule = {
  id?: string;
  title: LocalizedText;
  description?: LocalizedText;
  imageUrl?: string | null;
  imageFileName?: string;
  imageAlt?: LocalizedText;
  sortOrder?: number;
  lessons: DashboardLesson[];
};

export type DashboardCourse = {
  id?: string;
  trackId?: string;
  slug: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  description: LocalizedText;
  descriptionRich?: LocalizedText;
  image?: {
    src: string;
    alt: LocalizedText;
  };
  coverUrl?: string | null;
  status: "draft" | "published" | "archived";
  hasAccess: boolean;
  stripePriceId?: string;
  videoUrl?: string | null;
  videoFileName?: string;
  videoByteSize?: number;
  videoMimeType?: string;
  videoUpdatedAt?: number;
  sortOrder?: number;
  pageCopy?: {
    primaryCta?: LocalizedText;
    communityCta?: LocalizedText;
    continueCta?: LocalizedText;
    sectionEyebrow?: LocalizedText;
    sectionTitle?: LocalizedText;
    sectionDescription?: LocalizedText;
  };
  progress?: {
    totalLessons: number;
    completedLessons: number;
    percent: number;
    startedAt?: number;
    lastActivityAt?: number;
    nextLessonSlug?: string;
    nextLessonTitle?: LocalizedText;
    activity?: Array<{
      day: string;
      completed: number;
    }>;
  };
  lessons: DashboardLesson[];
  modules?: DashboardModule[];
};

function statusCopy(locale: Locale, course: DashboardCourse, isAdmin: boolean) {
  if (isAdmin) {
    return course.status === "published"
      ? tr(locale, "Objavljen kurs", "Published course")
      : course.status === "archived"
        ? tr(locale, "Arhiviran kurs", "Archived course")
        : tr(locale, "Admin nacrt", "Admin draft");
  }
  if (course.status !== "published") return tr(locale, "Uskoro", "Coming soon");
  if (!course.hasAccess) return tr(locale, "Zakljucano", "Locked");
  return tr(locale, "Aktivan pristup", "Active access");
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

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function allCourseLessons(course: DashboardCourse, locale: Locale) {
  return flattenModules(course, locale).flatMap((module) => module.lessons);
}

function getProgressSummary(course: DashboardCourse, locale: Locale) {
  const lessons = allCourseLessons(course, locale).filter((lesson) => lesson.isPublished !== false);
  const completedFromLessons = lessons.filter((lesson) => lesson.progress?.completed).length;
  const totalLessons = course.progress?.totalLessons ?? lessons.length;
  const completedLessons = course.progress?.completedLessons ?? completedFromLessons;
  const percent = clampPercent(course.progress?.percent ?? (totalLessons ? (completedLessons / totalLessons) * 100 : 0));
  const nextLesson =
    lessons.find((lesson) => lesson.slug === course.progress?.nextLessonSlug) ??
    lessons.find((lesson) => !lesson.progress?.completed) ??
    lessons[0];
  const lastActivityAt =
    course.progress?.lastActivityAt ??
    lessons.reduce<number | undefined>((latest, lesson) => {
      const updatedAt = lesson.progress?.updatedAt;
      if (!updatedAt) return latest;
      return latest === undefined ? updatedAt : Math.max(latest, updatedAt);
    }, undefined);
  const startedAt =
    course.progress?.startedAt ??
    lessons.reduce<number | undefined>((earliest, lesson) => {
      const updatedAt = lesson.progress?.updatedAt;
      if (!updatedAt) return earliest;
      return earliest === undefined ? updatedAt : Math.min(earliest, updatedAt);
    }, undefined);

  return {
    totalLessons,
    completedLessons,
    percent,
    nextLesson,
    startedAt,
    lastActivityAt,
    activity: course.progress?.activity ?? activityFromLessons(lessons),
  };
}

function activityFromLessons(lessons: DashboardLesson[]) {
  const counts = new Map<string, number>();
  for (const lesson of lessons) {
    const updatedAt = lesson.progress?.completed ? lesson.progress.updatedAt : undefined;
    if (!updatedAt) continue;
    const day = new Date(updatedAt).toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([day, completed]) => ({ day, completed }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// Takes already-computed summaries; recomputing them here walked every lesson a second time.
function mergeActivity(summaries: Array<{ activity: Array<{ day: string; completed: number }> }>) {
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    for (const item of summary.activity) {
      counts.set(item.day, (counts.get(item.day) ?? 0) + item.completed);
    }
  }
  return Array.from(counts.entries())
    .map(([day, completed]) => ({ day, completed }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// Rolling window only. An uncapped series produced one bar per day since the account's
// first activity, so a year-old account rendered ~365 bars in a ~300px card.
const activityRanges = [30, 90] as const;
type ActivityRange = (typeof activityRanges)[number];

// Days are bucketed in UTC on the server (convex/courses.ts activityCounts) and in
// activityFromLessons above, so the window has to be UTC too or counts land on the wrong bar.
function dailyActivitySeries(activity: Array<{ day: string; completed: number }>, days: ActivityRange) {
  const byDay = new Map(activity.map((item) => [item.day, item.completed]));
  const end = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - index));
    const day = date.toISOString().slice(0, 10);
    return {
      day,
      completed: byDay.get(day) ?? 0,
    };
  });
}

function formatLastActivity(locale: Locale, timestamp?: number) {
  if (!timestamp) return tr(locale, "Jos nema aktivnosti", "No activity yet");
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-RS" : "en-US", {
    day: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}

function courseDetailHref(locale: Locale, courseSlug: string) {
  return withLocale(locale, `/app/courses/${courseSlug}`);
}

function courseCommunityHref(locale: Locale, courseSlug: string) {
  return `${withLocale(locale, "/app/community")}?course=${courseSlug}`;
}

function courseContinueHref(locale: Locale, course: DashboardCourse, nextLesson?: DashboardLesson) {
  if (!nextLesson) return courseDetailHref(locale, course.slug);
  return withLocale(locale, `/app/courses/${course.slug}/lessons/${nextLesson.slug}`);
}

function MetricTile({
  icon,
  label,
  value,
  tone = "paper",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "paper" | "yellow" | "ink";
}) {
  return (
    <div
      className={cn(
        "rounded-[8px] border-2 p-4",
        tone === "paper" && "border-line bg-paper text-ink",
        tone === "yellow" && "border-ink bg-yellow text-ink",
        tone === "ink" && "border-white/25 bg-white/10 text-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn("text-xs font-black uppercase", tone === "ink" ? "text-white/65" : "text-muted")}>{label}</p>
          <p className={cn("mt-2 text-2xl font-black leading-none", tone === "ink" ? "text-white" : "text-ink")}>{value}</p>
        </div>
        <span
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border-2",
            tone === "ink" ? "border-white bg-yellow text-ink" : "border-ink bg-white text-ink",
          )}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

type PlaybackTokenPayload = Record<string, string>;

function DashboardVideoPlayer({ videoUrl, title }: { videoUrl: string; title: string }) {
  return (
    <video
      className="h-full w-full bg-ink object-contain"
      src={videoUrl}
      controls
      preload="metadata"
    />
  );
}

function CourseCoverEditor({ locale, course }: { locale: Locale; course: DashboardCourse }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const generateUploadUrl = useMutation(api.video.createDocumentUploadUrl);
  const saveCover = useMutation(api.video.saveCourseCover);
  const deleteCover = useMutation(api.video.deleteCourseCover);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    if (!course.id || !file.type.startsWith("image/")) { setMessage(tr(locale, "Izaberi sliku.", "Choose an image.")); return; }
    setPending(true); setMessage(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error(tr(locale, "Upload slike nije uspeo.", "Image upload failed."));
      const { storageId } = await response.json() as { storageId: Id<"_storage"> };
      await saveCover({ courseId: course.id as Id<"courses">, storageId, fileName: file.name, byteSize: file.size, mimeType: file.type });
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : tr(locale, "Upload nije uspeo.", "Upload failed.")); }
    finally { setPending(false); }
  }

  const preview = course.coverUrl || course.image?.src;
  return <Panel className="dashboard-reveal p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="relative aspect-video w-full overflow-hidden rounded-[8px] border-2 border-ink bg-paper lg:w-80">{preview ? <Image src={preview} alt={localized(course.title, locale)} fill unoptimized className="object-cover" /> : <div className="grid h-full place-items-center text-sm font-black text-muted">Naslovna slika nije dodata</div>}</div><div className="flex-1"><p className="font-display text-2xl text-ink">Naslovna slika kursa</p><p className="mt-1 text-sm font-bold text-muted">Koristi se na dashboard kartici i stranici smera.</p><input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => inputRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black">{pending ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}{course.coverUrl ? "Zameni sliku" : "Dodaj sliku"}</button>{course.coverUrl ? <button type="button" disabled={pending} onClick={async () => { if (!course.id || !confirm("Ukloniti naslovnu sliku kursa?")) return; setPending(true); try { await deleteCover({ courseId: course.id as Id<"courses"> }); router.refresh(); } finally { setPending(false); } }} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-red-700 bg-white px-4 text-xs font-black text-red-700"><Trash2 className="size-4" />Ukloni</button> : null}</div>{message ? <p className="mt-3 text-sm font-black text-red-700">{message}</p> : null}</div></div></Panel>;
}

function CourseVideoSection({ locale, isAdmin, course }: { locale: Locale; isAdmin: boolean; course: DashboardCourse }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const generateUploadUrl = useMutation(api.video.createDocumentUploadUrl);
  const saveCourseVideo = useMutation(api.video.saveCourseVideo);
  const deleteCourseVideo = useMutation(api.video.deleteCourseVideo);

  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const videoUrl = course.videoUrl;

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  function openPicker() {
    if (!isAdmin || isUploading || isDeleting) return;
    inputRef.current?.click();
  }

  async function uploadVideo(file: File) {
    if (!course.id) {
      setMessage(tr(locale, "Kurs mora biti sacuvan pre upload-a videa.", "Save the course before uploading video."));
      return;
    }

    setMessage(null);
    setIsUploading(true);
    setLocalPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });

    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          detail
            ? `${tr(locale, "Upload nije uspeo", "Upload failed")}: ${detail.slice(0, 240)}`
            : tr(locale, "Upload nije uspeo.", "Upload failed."),
        );
      }

      const { storageId } = (await response.json()) as { storageId?: Id<"_storage"> };
      if (!storageId) {
        throw new Error(tr(locale, "Convex nije vratio storageId.", "Convex did not return a storageId."));
      }

      await saveCourseVideo({
        courseId: course.id as Id<"courses">,
        storageId,
        fileName: file.name,
        byteSize: file.size,
        mimeType: file.type || "application/octet-stream",
      });

      setMessage(tr(locale, "Video je uspesno sacuvan.", "Video uploaded successfully."));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr(locale, "Upload nije uspeo.", "Upload failed."));
      setLocalPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  }

  function setVideoFromList(files?: FileList | null) {
    const file = files?.[0];
    if (!file || !isAdmin) return;
    void uploadVideo(file);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setVideoFromList(event.target.files);
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!isAdmin) return;
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!isAdmin) return;
    event.preventDefault();
    setIsDragging(false);
    setVideoFromList(event.dataTransfer.files);
  }

  async function deleteVideo(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!course.id || isDeleting) return;
    setIsDeleting(true);
    setMessage(null);
    try {
      await deleteCourseVideo({ courseId: course.id as Id<"courses"> });
      setLocalPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr(locale, "Brisanje nije uspelo.", "Delete failed."));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Panel className="dashboard-reveal overflow-hidden">
      <div className="p-4 sm:p-5">
        <div
          role={isAdmin ? "button" : undefined}
          tabIndex={isAdmin ? 0 : undefined}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (!isAdmin) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openPicker();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "group relative flex min-h-[320px] overflow-hidden rounded-[8px] border-2 bg-ink text-white sm:min-h-[360px] lg:h-[42vh] lg:min-h-[380px]",
            isAdmin ? "cursor-pointer border-dashed border-ink bg-paper text-ink" : "border-ink",
            (videoUrl || localPreviewUrl) && "border-solid bg-ink text-white",
            isDragging && "bg-yellow/25",
          )}
        >
          {localPreviewUrl ? (
            <video className="h-full w-full bg-ink object-contain" src={localPreviewUrl} controls muted preload="metadata" />
          ) : videoUrl ? (
            <DashboardVideoPlayer videoUrl={videoUrl} title={localized(course.title, locale)} />
          ) : (
            <>
              <span
                className={cn(
                  "absolute inset-0",
                  isAdmin
                    ? "bg-[linear-gradient(135deg,rgba(14,49,88,0.07)_0,rgba(14,49,88,0.07)_1px,transparent_1px,transparent_18px)]"
                    : "bg-[radial-gradient(circle_at_18%_18%,rgba(244,190,48,0.35),transparent_26%),linear-gradient(135deg,#0e3158,#173d6b)]",
                )}
              />
                  <span className="relative z-10 flex w-full items-center justify-center p-6 text-center">
                <span className="max-w-md">
                  <span className="mx-auto inline-flex size-16 items-center justify-center rounded-[8px] border-2 border-ink bg-white text-ink shadow-[4px_4px_0_0_rgba(14,49,88,0.18)]">
                    {isUploading ? <Loader2 className="size-8 animate-spin" /> : isAdmin ? <UploadCloud className="size-8" /> : <PlayCircle className="size-9" />}
                  </span>
                  <span className={cn("mt-5 block text-2xl font-black", isAdmin ? "text-ink" : "text-white")}>
                    {isUploading
                      ? tr(locale, "Video se uploaduje", "Video is uploading")
                      : isAdmin
                        ? tr(locale, "Prevuci video ili klikni za upload", "Drop a video or click to upload")
                        : tr(locale, "Video lekcija uskoro", "Video lesson soon")}
                  </span>
                  <span className={cn("mt-2 block text-sm font-extrabold", isAdmin ? "text-muted" : "text-white/75")}>
                    {isAdmin
                      ? tr(locale, "Glavni video kursa se cuva preko Convex storage.", "The main course video is saved through Convex storage.")
                      : tr(locale, "Ovaj prostor cuva mesto za glavni video kursa.", "This surface reserves the main course video.")}
                  </span>
                </span>
              </span>
            </>
          )}

          {isAdmin ? (
            <div className="absolute right-3 top-3 z-20 flex gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openPicker();
                }}
                disabled={isUploading || isDeleting}
                aria-label={tr(locale, "Zameni video", "Replace video")}
                title={tr(locale, "Zameni video", "Replace video")}
                className="inline-flex size-10 items-center justify-center rounded-[8px] border-2 border-ink bg-white text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition hover:bg-yellow disabled:cursor-wait disabled:opacity-60"
              >
                {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
              </button>
              {videoUrl || localPreviewUrl ? (
                <button
                  type="button"
                  onClick={deleteVideo}
                  disabled={isUploading || isDeleting}
                  aria-label={tr(locale, "Ukloni video", "Remove video")}
                  title={tr(locale, "Ukloni video", "Remove video")}
                  className="inline-flex size-10 items-center justify-center rounded-[8px] border-2 border-red-700 bg-white text-red-700 shadow-[3px_3px_0_0_rgba(127,29,29,0.18)] transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>
              ) : null}
            </div>
          ) : null}
          {message ? (
            <span className="absolute bottom-3 left-3 right-3 z-20 rounded-[8px] border-2 border-ink bg-white px-3 py-2 text-xs font-black text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.18)]">
              {message}
            </span>
          ) : null}
          {isAdmin ? (
            <input ref={inputRef} className="sr-only" type="file" accept="video/*" onChange={handleInputChange} />
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function FeaturedThreadsSection({ locale, course }: { locale: Locale; course: DashboardCourse }) {
  const featuredPosts = useQuery(
    api.community.listFeaturedPosts,
    course.id ? { courseId: course.id as Id<"courses">, limit: 4 } : "skip",
  ) as
    | Array<{
        _id: string;
        title: string;
        body: string;
        courseId?: string;
        featuredCourseId?: string;
        isFeaturedGlobal?: boolean;
        courseTitleSr?: string;
        courseTitleEn?: string;
        commentsCount?: number;
        reactionsCount?: number;
      }>
    | undefined;
  const posts = featuredPosts ?? [];

  return (
    <Panel className="dashboard-reveal p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink">
              <MessageCircle className="size-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase text-muted">{tr(locale, "Zajednica", "Community")}</p>
              <h2 className="text-2xl font-black leading-tight text-ink">
                {tr(locale, "Featured tredovi", "Featured threads")}
              </h2>
            </div>
          </div>
          {!course.id ? (
            <p className="mt-4 max-w-3xl text-base font-bold leading-7 text-muted">
              {tr(locale, "Featured tredovi su dostupni kada je kurs povezan sa Convex-om.", "Featured threads are available when this course is connected to Convex.")}
            </p>
          ) : featuredPosts === undefined ? (
            <div className="mt-5 flex items-center gap-3 rounded-[8px] border-2 border-line bg-paper px-4 py-3 text-sm font-black text-muted">
              <Loader2 className="size-4 animate-spin" />
              {tr(locale, "Ucitavanje threadova", "Loading threads")}
            </div>
          ) : posts.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {posts.map((post) => {
                const courseFeatured = post.featuredCourseId === course.id;
                return (
                  <Link
                    key={post._id}
                    href={withLocale(locale, `/app/community?course=${course.slug}`)}
                    className="block rounded-[8px] border-2 border-line bg-paper p-4 transition hover:-translate-y-0.5 hover:border-ink hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <div className="flex flex-wrap gap-2">
                      {courseFeatured ? (
                        <span className="rounded-[6px] border-2 border-ink bg-yellow px-2 py-0.5 text-[10px] font-black uppercase text-ink">
                          {tr(locale, "Kurs", "Course")}
                        </span>
                      ) : null}
                      {post.isFeaturedGlobal ? (
                        <span className="rounded-[6px] border-2 border-ink bg-white px-2 py-0.5 text-[10px] font-black uppercase text-ink">
                          {tr(locale, "Opsti", "Global")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 line-clamp-2 text-base font-black leading-tight text-ink">{post.title}</p>
                    <p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-muted">{post.body}</p>
                    <div className="mt-3 flex gap-3 text-xs font-black text-muted">
                      <span>{post.reactionsCount ?? 0} likes</span>
                      <span>{post.commentsCount ?? 0} comments</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 max-w-3xl text-base font-bold leading-7 text-muted">
              {tr(
                locale,
                "Za ovaj kurs jos nisu izabrani featured tredovi. Otvori zajednicu i oznaci najvaznije diskusije.",
                "No featured threads have been selected for this course yet. Open community and mark the most useful discussions.",
              )}
            </p>
          )}
        </div>
        <Link
          href={withLocale(locale, `/app/community?course=${course.slug}`)}
          className="group flex min-h-32 items-center justify-center rounded-[8px] border-2 border-dashed border-ink bg-paper p-5 text-center text-ink transition hover:-translate-y-0.5 hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <span>
            <span className="mx-auto inline-flex size-12 items-center justify-center rounded-[8px] border-2 border-ink bg-white shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition group-hover:rotate-2">
              <Plus className="size-6" />
            </span>
            <span className="mt-3 block text-sm font-black">
              {tr(locale, "Otvori zajednicu", "Open community")}
            </span>
          </span>
        </Link>
      </div>
    </Panel>
  );
}

function ActivityPanel({ locale, activity }: { locale: Locale; activity: Array<{ day: string; completed: number }> }) {
  const [range, setRange] = useState<ActivityRange>(30);
  const labelFormatter = new Intl.DateTimeFormat(locale === "sr" ? "sr-RS" : "en-US", { day: "2-digit", month: "2-digit" });
  const formatDay = (day: string) => labelFormatter.format(new Date(`${day}T12:00:00.000Z`));

  // A user with no completed lessons gets a single nudge elsewhere, not an axis of empty bars.
  if (!activity.length) return null;

  const days = dailyActivitySeries(activity, range);
  const max = Math.max(1, ...days.map((item) => item.completed));
  const middleTick = Math.max(1, Math.ceil(max / 2));
  const total = days.reduce((sum, item) => sum + item.completed, 0);
  const isDense = range > 30;

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-muted">{tr(locale, "Dnevni ritam", "Daily pace")}</p>
          <h2 className="mt-1 text-xl font-black text-ink sm:text-2xl">{tr(locale, "Završene lekcije", "Completed lessons")}</h2>
        </div>
        <div
          role="group"
          aria-label={tr(locale, "Vremenski opseg", "Time range")}
          className="flex items-center gap-1 rounded-full border-2 border-ink bg-paper p-1"
        >
          {activityRanges.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              aria-pressed={range === option}
              className={cn(
                "min-h-8 rounded-full px-3 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                range === option ? "bg-ink text-white" : "text-muted hover:text-ink",
              )}
            >
              {option}
              {tr(locale, "d", "d")}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-stretch gap-2">
        <div className="relative h-40 w-7 shrink-0 text-[10px] font-black text-muted" aria-hidden="true">
          <span className="absolute -top-1 right-0">{max}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{middleTick}</span>
          <span className="absolute -bottom-1 right-0">0</span>
        </div>
        <div className="min-w-0 flex-1">
          {/* data-motion lives on the container, not per bar: page-motion staggers `chart`
              by 0.035s with no cap, and its onComplete is what clears will-change page-wide. */}
          <div
            data-motion="chart"
            role="img"
            aria-label={tr(
              locale,
              `Završene lekcije po danu, poslednjih ${range} dana. Ukupno ${total}, najviše ${max} u jednom danu.`,
              `Completed lessons per day, last ${range} days. ${total} total, up to ${max} in a single day.`,
            )}
            className={cn(
              "flex h-40 items-end border-b border-line px-1 [background-image:linear-gradient(to_bottom,rgba(14,49,88,0.08)_1px,transparent_1px)] [background-size:100%_50%]",
              isDense ? "gap-px" : "gap-[2px]",
            )}
          >
            {days.map((item) => (
              <div
                key={item.day}
                // flex-1 with no min-width: bars always divide the available width, so the
                // chart can never scroll horizontally at any viewport. At 90d a 2px bar is
                // narrower than its own border, so the dense view drops the border and
                // fills with ink (12.92:1 on paper) instead of yellow (1.69:1).
                className={cn(
                  "min-w-0 flex-1 rounded-t-[4px]",
                  isDense
                    ? item.completed
                      ? "bg-ink"
                      : "bg-line"
                    : cn("border-2 border-b-0 border-ink", item.completed ? "bg-yellow" : "bg-paper"),
                )}
                style={{ height: `${item.completed ? Math.max(7, (item.completed / max) * 100) : 3}%` }}
                title={`${formatDay(item.day)}: ${item.completed}`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] font-black uppercase text-muted" aria-hidden="true">
            <span>{formatDay(days[0].day)}</span>
            <span>{formatDay(days[days.length - 1].day)}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function CourseCover({ course, locale }: { course: DashboardCourse; locale: Locale }) {
  const imageSrc = course.coverUrl || course.image?.src;
  if (imageSrc) {
    return (
      <Image
        src={imageSrc}
        alt={course.image ? localized(course.image.alt, locale) : localized(course.title, locale)}
        fill
        sizes="(min-width: 1024px) 50vw, 100vw"
        unoptimized
        className="rounded-[8px] object-cover"
      />
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded-[8px] bg-paper">
      <div className="absolute inset-0 ink-hatch" />
      <div className="relative flex h-full items-center justify-center p-6 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full border-2 border-ink bg-yellow text-ink shadow-[4px_4px_0_0_rgba(14,49,88,0.15)]">
          <BookOpen className="size-7" />
        </span>
      </div>
    </div>
  );
}

// Single progress-bar implementation for the card and the hero. Both were bare <div>s that
// exposed nothing to assistive tech, and only one of the two honoured reduced motion.
function CourseProgress({
  percent,
  label,
  tone = "paper",
}: {
  percent: number;
  label: string;
  tone?: "paper" | "ink";
}) {
  const shouldReduceMotion = useReducedMotion();
  const safePercent = clampPercent(percent);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={safePercent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-3 overflow-hidden border-2",
        // paper: ink fill on paper track = 12.92:1. Yellow on paper was 1.69:1, under the
        // 3:1 floor for graphical objects (WCAG 1.4.11), and yellow is now the primary CTA only.
        tone === "paper" ? "rounded-full border-line bg-paper" : "rounded-[8px] border-white bg-white/15",
      )}
    >
      <motion.div
        className={cn("h-full", tone === "paper" ? "rounded-full bg-ink" : "bg-yellow")}
        initial={{ width: 0 }}
        animate={{ width: `${safePercent}%` }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.65, ease: "easeOut" }}
      />
    </div>
  );
}

export function DashboardCourseCard({
  locale,
  course,
  isAdmin,
  summary = getProgressSummary(course, locale),
}: {
  locale: Locale;
  course: DashboardCourse;
  isAdmin: boolean;
  summary?: ReturnType<typeof getProgressSummary>;
}) {
  const canOpen = isAdmin || course.hasAccess;
  const primaryLabel =
    summary.completedLessons > 0
      ? tr(locale, "Nastavi", "Continue")
      : tr(locale, "Otvori kurs", "Open course");

  return (
    <motion.article
      data-motion="card"
      layout
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      className="dashboard-reveal overflow-hidden rounded-[16px] border-2 border-ink bg-white shadow-[6px_6px_0_0_rgba(14,49,88,0.12)]"
    >
      <div className="p-3">
        <div className="relative aspect-[16/9] overflow-hidden rounded-[8px] bg-paper">
          <CourseCover course={course} locale={locale} />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border-2 border-ink bg-white px-3 py-1 text-[11px] font-black uppercase text-ink">
            <ShieldCheck className="size-3.5" />
            {statusCopy(locale, course, isAdmin)}
          </span>
        </div>
      </div>
      <div className="space-y-4 px-5 pb-5 pt-2">
        <div>
          <h3 className="text-2xl font-black leading-tight text-ink">{localized(course.title, locale)}</h3>
          <p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-muted">{localized(course.subtitle, locale)}</p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 text-xs font-black uppercase text-muted">
            <span>{tr(locale, "Napredak", "Progress")}</span>
            <span>
              {summary.completedLessons}/{summary.totalLessons || 0} {tr(locale, "lekcija", "lessons")}
            </span>
          </div>
          <div className="mt-2">
            <CourseProgress
              percent={summary.percent}
              label={tr(
                locale,
                `Napredak kursa ${localized(course.title, locale)}`,
                `Progress for ${localized(course.title, locale)}`,
              )}
            />
          </div>
        </div>

        <p className="inline-flex items-center gap-2 text-sm font-bold text-muted">
          <Clock3 className="size-4 text-ink" />
          {formatLastActivity(locale, summary.lastActivityAt)}
        </p>

        {summary.nextLesson ? (
          <p className="rounded-[16px] border-2 border-line bg-paper px-3 py-2 text-sm font-bold leading-6 text-muted">
            <span className="font-black text-ink">{tr(locale, "Sledece:", "Next:")}</span>{" "}
            {localized(summary.nextLesson.title, locale)}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {canOpen ? (
            <LinkButton href={courseContinueHref(locale, course, summary.nextLesson)} tone="paper" className="min-h-10 px-4 text-xs">
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
            href={courseDetailHref(locale, course.slug)}
            className="inline-flex items-center gap-1 text-xs font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {tr(locale, "Detalji", "Details")}
            <ArrowRight className="size-3.5" />
          </Link>
          <Link
            href={courseCommunityHref(locale, course.slug)}
            className="inline-flex items-center gap-1 text-xs font-black text-ink underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {tr(locale, "Zajednica", "Community")}
            <MessageCircle className="size-3.5" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

// Rendered while the Convex query is in flight. Previously this window rendered the static
// marketing courses from lib/content with progress: undefined, so a student mid-course saw
// "0%" and CTAs pointing at fallback lesson slugs before the real data swapped in.
export function DashboardHomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Učitavanje / Loading">
      {/* Heights track the loaded layout so the swap does not shift anything below it. */}
      <div className="h-[22rem] animate-pulse rounded-[16px] border-2 border-line bg-white sm:h-64" />
      <div className="rounded-[16px] border-2 border-line bg-white p-5 sm:p-6">
        <div className="h-12 w-64 max-w-full animate-pulse rounded-[8px] bg-ink/8" />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {[0, 1].map((item) => (
            <div key={item} className="h-[30rem] animate-pulse rounded-[16px] border-2 border-line bg-paper" />
          ))}
        </div>
      </div>
      <div className="h-72 animate-pulse rounded-[16px] border-2 border-line bg-white" />
    </div>
  );
}

// Day one. Reached whenever the viewer has no course they can actually open, so it also
// covers "signed out" and "every course locked" — never a 0% hero over courses they don't own.
function DashboardFirstRun({ locale, profileName }: { locale: Locale; profileName: string }) {
  const steps = [
    {
      title: tr(locale, "Izaberi kurs", "Choose a course"),
      body: tr(
        locale,
        "Pogledaj šta te čeka i otključaj onaj koji ti treba.",
        "See what is on offer and unlock the one you need.",
      ),
    },
    {
      title: tr(locale, "Odgledaj prvu lekciju", "Watch the first lesson"),
      body: tr(
        locale,
        "Napredak se pamti sam, pa možeš da nastaviš kad god.",
        "Progress saves itself, so you can pick up whenever you want.",
      ),
    },
    {
      title: tr(locale, "Pitaj u zajednici", "Ask in the community"),
      body: tr(
        locale,
        "Zapneš negde? Postavi pitanje i dobićeš odgovor.",
        "Stuck somewhere? Post a question and get an answer.",
      ),
    },
  ];

  return (
    <Panel className="overflow-hidden">
      <div data-motion="hero" className="p-5 sm:p-7">
        <div data-motion="copy">
          <p className="text-sm font-black uppercase text-muted">
            {locale === "sr" ? `Zdravo, ${profileName}` : `Hi, ${profileName}`}
          </p>
          <h1 className="mt-2 max-w-3xl text-3xl font-black leading-tight tracking-[-0.035em] text-ink sm:text-4xl">
            {tr(locale, "Spremni smo kad i ti", "Ready when you are")}
          </h1>
          <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-muted">
            {tr(
              locale,
              "Još nemaš nijedan otključan kurs. Tri koraka te dele od prve lekcije.",
              "You do not have an unlocked course yet. Three steps stand between you and your first lesson.",
            )}
          </p>
        </div>

        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-[16px] border-2 border-line bg-paper p-4">
              <span className="grid size-9 place-items-center rounded-full border-2 border-ink bg-yellow text-sm font-black text-ink">
                {index + 1}
              </span>
              <p className="mt-3 text-base font-black text-ink">{step.title}</p>
              <p className="mt-1 text-sm font-bold leading-6 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <LinkButton href={`${withLocale(locale)}#pricing`} tone="yellow" size="lg">
            <Sparkles className="size-5" />
            {tr(locale, "Pogledaj kurseve", "Browse courses")}
          </LinkButton>
          <LinkButton href={withLocale(locale, "/app/community")} tone="paper">
            <MessageCircle className="size-4" />
            {tr(locale, "Otvori zajednicu", "Open community")}
          </LinkButton>
        </div>
      </div>
    </Panel>
  );
}

export function DashboardHomeContent({
  locale,
  profile,
  courses,
  isAdmin = false,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  courses: DashboardCourse[];
  isAdmin?: boolean;
}) {
  const profileName = profile?.name ?? "Student";
  const visibleCourses = courses.filter((course) => isAdmin || course.status === "published");
  // One pass per course. getProgressSummary used to run four times per course per render.
  const entries = visibleCourses.map((course) => ({ course, summary: getProgressSummary(course, locale) }));
  // Anything the viewer cannot actually open is excluded from every number on this screen,
  // so a locked course can no longer drag the overall percentage down.
  const accessible = entries.filter((entry) => isAdmin || entry.course.hasAccess);

  if (!accessible.length) {
    return <DashboardFirstRun locale={locale} profileName={profileName} />;
  }

  const totalLessons = accessible.reduce((count, entry) => count + entry.summary.totalLessons, 0);
  const completedLessons = accessible.reduce((count, entry) => count + entry.summary.completedLessons, 0);
  const overallPercent = clampPercent(totalLessons ? (completedLessons / totalLessons) * 100 : 0);
  const activity = mergeActivity(accessible.map((entry) => entry.summary));

  // Resume target: most recently touched accessible course that still has a lesson left.
  // Array.sort is stable, so a viewer with no activity anywhere falls through to sortOrder.
  const resume = accessible
    .filter((entry) => Boolean(entry.summary.nextLesson))
    .sort((a, b) => (b.summary.lastActivityAt ?? 0) - (a.summary.lastActivityAt ?? 0))[0];

  const resumeLesson = resume?.summary.nextLesson;
  // Server totals and the client-filtered lesson list can disagree (an admin's draft lessons
  // count on one side but not the other), so clamp into a range that always reads sensibly.
  const resumePosition = resume
    ? Math.max(1, Math.min(resume.summary.completedLessons + 1, resume.summary.totalLessons))
    : 0;
  const resumeTotal = resume ? Math.max(resumePosition, resume.summary.totalLessons) : 0;

  return (
    <div className="space-y-6">
      <section
        data-motion="hero"
        className="overflow-hidden rounded-[16px] border-2 border-ink bg-white shadow-[6px_6px_0_0_rgba(14,49,88,0.12)]"
      >
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="p-4 sm:p-5 lg:p-6" data-motion="copy">
            <p className="text-sm font-black uppercase text-muted">
              {locale === "sr" ? `Zdravo, ${profileName}` : `Hi, ${profileName}`}
            </p>

            {resume && resumeLesson ? (
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-[8px] bg-paper sm:w-44">
                  <CourseCover course={resume.course} locale={locale} />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-black leading-tight tracking-[-0.035em] text-ink sm:text-3xl">
                    {localized(resume.course.title, locale)}
                  </h1>
                  <p className="mt-2 text-sm font-bold leading-6 text-muted sm:text-base">
                    <span className="font-black text-ink">{tr(locale, "Sledeća lekcija", "Next lesson")}</span>
                    {" · "}
                    {localized(resumeLesson.title, locale)}
                  </p>
                  <div className="mt-4">
                    <LinkButton href={courseContinueHref(locale, resume.course, resumeLesson)} tone="yellow" size="lg">
                      <PlayCircle className="size-5" />
                      {resume.summary.completedLessons === 0
                        ? tr(
                            locale,
                            `Započni lekciju ${resumePosition}/${resumeTotal}`,
                            `Start lesson ${resumePosition}/${resumeTotal}`,
                          )
                        : tr(
                            locale,
                            `Nastavi lekciju ${resumePosition}/${resumeTotal}`,
                            `Continue lesson ${resumePosition}/${resumeTotal}`,
                          )}
                    </LinkButton>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <h1 className="text-2xl font-black leading-tight tracking-[-0.035em] text-ink sm:text-3xl">
                  {tr(locale, "Sve lekcije su završene", "Every lesson is done")}
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-muted sm:text-base">
                  {tr(
                    locale,
                    "Nema više lekcija na čekanju. Vrati se bilo kom kursu ispod da ponoviš gradivo.",
                    "Nothing is queued up. Revisit any course below to go over the material again.",
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="border-t-2 border-ink bg-ink p-4 text-white xl:border-l-2 xl:border-t-0">
            <div className="flex h-full flex-col justify-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-white/65">
                {tr(locale, "Ukupno", "Overall")}
              </p>
              <p className="text-4xl font-black leading-none">{overallPercent}%</p>
              <CourseProgress
                percent={overallPercent}
                tone="ink"
                label={tr(locale, "Ukupan napredak", "Overall progress")}
              />
              <p className="text-xs font-bold leading-5 text-white/70">
                {completedLessons}/{totalLessons || 0} {tr(locale, "zavrsenih lekcija", "completed lessons")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <Panel className="overflow-hidden">
        <div className="border-b-2 border-ink bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-muted">{tr(locale, "Kursevi", "Courses")}</p>
              <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">
                {tr(locale, "Izaberi gde nastavljas", "Choose where to continue")}
              </h2>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border-2 border-ink bg-paper px-4 py-2 text-xs font-black text-ink">
              <BookOpen className="size-4" />
              {visibleCourses.length} {tr(locale, "kursa", "courses")}
            </span>
          </div>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2 sm:p-6">
          {entries.map((entry) => (
            <DashboardCourseCard
              key={entry.course.slug}
              locale={locale}
              course={entry.course}
              isAdmin={isAdmin}
              summary={entry.summary}
            />
          ))}
        </div>
      </Panel>

      {/* Own full-width section. As the N+1-th cell of a course grid its width depended on
          how many courses existed. Renders nothing at all when there is no activity yet. */}
      {activity.length ? (
        <ActivityPanel locale={locale} activity={activity} />
      ) : (
        <p className="flex items-center gap-2 px-1 text-sm font-bold text-muted">
          <BarChart3 className="size-4 shrink-0 text-ink" />
          {tr(
            locale,
            "Završi prvu lekciju i ovde se pojavljuje tvoj dnevni ritam.",
            "Finish your first lesson and your daily pace shows up here.",
          )}
        </p>
      )}
    </div>
  );
}

export function DashboardContent({
  locale,
  profile,
  course,
  isAdmin = false,
  inlineLocale = locale,
  inlinePreview = false,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  course: DashboardCourse;
  isAdmin?: boolean;
  inlineLocale?: Locale;
  inlinePreview?: boolean;
}) {
  const t = dictionary[locale];
  const modules = useMemo(() => flattenModules(course, locale), [course, locale]);
  const lessons = modules.reduce((count, module) => count + module.lessons.length, 0);
  const publishedLessons = modules.reduce(
    (count, module) => count + module.lessons.filter((lesson) => lesson.isPublished !== false).length,
    0,
  );
  const draftLessons = Math.max(0, lessons - publishedLessons);
  const firstLesson = modules.flatMap((module) => module.lessons)[0];
  const progressSummary = getProgressSummary(course, locale);
  const nextLesson = progressSummary.nextLesson ?? firstLesson;
  const profileName = profile?.name ?? "Student";
  const courseIsPublished = course.status === "published";
  const surfaceIsAdmin = isAdmin && !inlinePreview;
  const canOpenCheckout = courseIsPublished && !course.hasAccess && !surfaceIsAdmin;
  const canContinue = Boolean(nextLesson && (course.hasAccess || surfaceIsAdmin));
  const completionPercent = surfaceIsAdmin ? 100 : progressSummary.percent;

  return (
    <div className="space-y-6">
      <section data-motion="hero" className="dashboard-reveal overflow-hidden rounded-[10px] border-2 border-ink bg-white shadow-[8px_8px_0_0_rgba(14,49,88,0.14)]">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-5 sm:p-7" data-motion="copy">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-3 py-1 text-xs font-black text-ink">
                <ShieldCheck className="size-4" />
                {statusCopy(locale, course, surfaceIsAdmin)}
              </span>
              {surfaceIsAdmin && draftLessons ? (
                <span className="rounded-[8px] border-2 border-ink bg-paper px-3 py-1 text-xs font-black text-ink">
                  {draftLessons} {tr(locale, "nacrta", "drafts")}
                </span>
              ) : null}
              {surfaceIsAdmin && course.id ? (
                <EditCourseAction
                  locale={locale}
                  courseId={course.id}
                  initial={{
                    slug: course.slug,
                    title: course.title,
                    subtitle: course.subtitle,
                    description: course.description,
                    descriptionRich: course.descriptionRich,
                    status: course.status,
                    stripePriceId: course.stripePriceId,
                    videoUrl: course.videoUrl,
                    videoFileName: course.videoFileName,
                    videoByteSize: course.videoByteSize,
                    videoMimeType: course.videoMimeType,
                    videoUpdatedAt: course.videoUpdatedAt,
                    sortOrder: course.sortOrder ?? 0,
                  }}
                  nextSortOrder={course.sortOrder ?? 0}
                  iconOnly
                />
              ) : null}
            </div>
            <p className="mt-6 text-sm font-black uppercase text-muted">
              {locale === "sr" ? `Zdravo, ${profileName}` : `Hi, ${profileName}`}
            </p>
            <h1 className="mt-2 max-w-4xl text-4xl font-black leading-tight text-ink sm:text-5xl">
              <InlineContentText entityId={course.id ?? ""} parentId={course.trackId} kind="course" field="title" locale={inlineLocale} sr={course.title.sr} en={course.title.en} admin={isAdmin && Boolean(course.id && course.trackId)}>{localized(course.title, locale)}</InlineContentText>
            </h1>
            <p className="mt-3 max-w-3xl text-lg font-black leading-7 text-ink/75">
              <InlineContentText entityId={course.id ?? ""} parentId={course.trackId} kind="course" field="subtitle" locale={inlineLocale} sr={course.subtitle.sr} en={course.subtitle.en} admin={isAdmin && Boolean(course.id && course.trackId)}>{localized(course.subtitle, locale)}</InlineContentText>
            </p>
            <InlineRichText kind="course" entityId={course.id ?? ""} parentId={course.trackId} field="description" locale={inlineLocale} richSr={course.descriptionRich?.sr} richEn={course.descriptionRich?.en} sr={course.description.sr} en={course.description.en} admin={isAdmin && Boolean(course.id && course.trackId)} className="mt-4 max-w-3xl text-base font-bold leading-7 text-muted sm:text-lg" />
            <div className="mt-6 flex flex-wrap gap-3">
              {canContinue && nextLesson ? (
                <LinkButton href={courseContinueHref(locale, course, nextLesson)} tone="yellow">
                  <PlayCircle className="size-4" />
                  <InlineContentText entityId={course.id ?? ""} parentId={course.trackId} kind="course" field="pageCopy_continueCta" locale={inlineLocale} sr={course.pageCopy?.continueCta?.sr ?? t.continueLesson} en={course.pageCopy?.continueCta?.en ?? t.continueLesson} admin={isAdmin && Boolean(course.id && course.trackId)}>{locale === "sr" ? course.pageCopy?.continueCta?.sr ?? t.continueLesson : course.pageCopy?.continueCta?.en ?? t.continueLesson}</InlineContentText>
                </LinkButton>
              ) : canOpenCheckout ? (
                <CheckoutButton courseSlug={course.slug} locale={locale} label={t.checkout} />
              ) : (
                <div className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper px-5 py-2.5 text-sm font-extrabold text-ink">
                  <Sparkles className="size-4" />
                  {courseIsPublished
                    ? tr(locale, "Pristup nije aktivan", "Access is not active")
                    : tr(locale, "U pripremi", "In preparation")}
                </div>
              )}
              <LinkButton href={withLocale(locale, `/app/community?course=${course.slug}`)} tone="paper">
                <MessageCircle className="size-4" />
                <InlineContentText entityId={course.id ?? ""} parentId={course.trackId} kind="course" field="pageCopy_communityCta" locale={inlineLocale} sr={course.pageCopy?.communityCta?.sr ?? t.community} en={course.pageCopy?.communityCta?.en ?? t.community} admin={isAdmin && Boolean(course.id && course.trackId)}>{locale === "sr" ? course.pageCopy?.communityCta?.sr ?? t.community : course.pageCopy?.communityCta?.en ?? t.community}</InlineContentText>
              </LinkButton>
            </div>
          </div>
          <div className="border-t-2 border-ink bg-ink p-5 text-white xl:border-l-2 xl:border-t-0">
            <div className="flex h-full flex-col justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase text-white/65">{tr(locale, "Pregled kursa", "Course overview")}</p>
                <p className="mt-4 text-5xl font-black leading-none">{surfaceIsAdmin ? "Admin" : `${completionPercent}%`}</p>
                <div className="mt-5">
                  <CourseProgress
                    percent={completionPercent}
                    tone="ink"
                    label={tr(
                      locale,
                      `Napredak kursa ${localized(course.title, locale)}`,
                      `Progress for ${localized(course.title, locale)}`,
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MetricTile icon={<Layers className="size-4" />} label={tr(locale, "Struktura", "Structure")} value={tr(locale, "Kurs → lekcije", "Course → lessons")} tone="ink" />
                <MetricTile icon={<BookOpen className="size-4" />} label={t.lessons} value={`${publishedLessons}/${lessons || 0}`} tone="ink" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {surfaceIsAdmin ? <CourseCoverEditor locale={locale} course={course} /> : null}
      <CourseVideoSection locale={locale} isAdmin={surfaceIsAdmin} course={course} />

      <FeaturedThreadsSection locale={locale} course={course} />

      <Panel className="dashboard-reveal overflow-hidden">
        <div className="border-b-2 border-ink bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-muted"><InlineContentText entityId={course.id ?? ""} parentId={course.trackId} kind="course" field="pageCopy_sectionEyebrow" locale={inlineLocale} sr={course.pageCopy?.sectionEyebrow?.sr ?? "Lekcije u kursu"} en={course.pageCopy?.sectionEyebrow?.en ?? "Course lessons"} admin={isAdmin && Boolean(course.id && course.trackId)}>{locale === "sr" ? course.pageCopy?.sectionEyebrow?.sr ?? "Lekcije u kursu" : course.pageCopy?.sectionEyebrow?.en ?? "Course lessons"}</InlineContentText></p>
              <h2 className="mt-2 text-2xl font-black text-ink sm:text-3xl">
                <InlineContentText entityId={course.id ?? ""} parentId={course.trackId} kind="course" field="pageCopy_sectionTitle" locale={inlineLocale} sr={course.pageCopy?.sectionTitle?.sr ?? "Nastavni tok"} en={course.pageCopy?.sectionTitle?.en ?? "Learning path"} admin={isAdmin && Boolean(course.id && course.trackId)}>{locale === "sr" ? course.pageCopy?.sectionTitle?.sr ?? "Nastavni tok" : course.pageCopy?.sectionTitle?.en ?? "Learning path"}</InlineContentText>
              </h2>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-[8px] border-2 border-ink bg-paper px-3 py-2 text-xs font-black text-ink">
              <Gauge className="size-4" />
              {publishedLessons} / {lessons || 0} {tr(locale, "spremno", "ready")}
            </span>
          </div>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          {modules.flatMap((module) => module.lessons).map((lesson, lessonIndex) => (
            <details key={lesson.id ?? lesson.slug} className="group overflow-hidden rounded-[16px] border-2 border-ink bg-white" open={lessonIndex === 0}>
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-xs font-black">{lessonIndex + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-base font-black text-ink"><InlineContentText entityId={lesson.id ?? ""} parentId={course.id} kind="lesson" field="title" locale={inlineLocale} sr={lesson.title.sr} en={lesson.title.en} admin={isAdmin && Boolean(lesson.id && course.id)}>{localized(lesson.title, locale)}</InlineContentText></p><p className="mt-0.5 text-xs font-bold text-muted">{lesson.duration}</p></div>
                {surfaceIsAdmin && lesson.isPublished === false ? <span className="rounded-full border border-ink bg-paper px-2.5 py-1 text-[10px] font-black uppercase">Nacrt</span> : null}
                <ChevronDown className="size-5 transition group-open:rotate-180" />
              </summary>
              <div className="border-t-2 border-line bg-paper px-4 py-4 sm:pl-[4.25rem]">
                {lesson.summary ? <InlineRichText kind="lesson" entityId={lesson.id ?? ""} parentId={course.id} field="summary" locale={inlineLocale} richSr={lesson.summaryRich?.sr} richEn={lesson.summaryRich?.en} sr={lesson.summary.sr} en={lesson.summary.en} admin={isAdmin && Boolean(lesson.id && course.id)} className="max-w-3xl text-sm font-semibold leading-6 text-muted" /> : <p className="max-w-3xl text-sm font-semibold leading-6 text-muted">{tr(locale, "Sažetak lekcije još nije dodat.", "Lesson summary has not been added yet.")}</p>}
                <div className="mt-4 flex flex-wrap gap-2"><Link href={courseContinueHref(locale, course, lesson)} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black"><PlayCircle className="size-4" /> {tr(locale, "Otvori lekciju", "Open lesson")}</Link>{surfaceIsAdmin ? <Link href={withLocale(locale, "/app/admin")} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-white px-4 text-xs font-black"><ShieldCheck className="size-4" /> {tr(locale, "Uredi u admin panelu", "Edit in admin panel")}</Link> : null}</div>
              </div>
            </details>
          ))}
          {!lessons ? <div className="rounded-[16px] border-2 border-dashed border-line bg-paper p-8 text-center text-sm font-black text-muted">{tr(locale, "Kurs još nema lekcije.", "This course has no lessons yet.")}</div> : null}
          {surfaceIsAdmin ? <Link href={withLocale(locale, "/app/admin")} className="grid min-h-28 place-items-center rounded-[16px] border-2 border-dashed border-ink bg-paper text-center transition hover:bg-yellow/20"><span className="font-black">+ {tr(locale, "Dodaj novu lekciju", "Add a new lesson")}</span></Link> : null}
        </div>
      </Panel>
    </div>
  );
}
