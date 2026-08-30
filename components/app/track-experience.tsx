"use client";

import { ArrowRight, MessageCircle, PlayCircle, Trash2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useMutation } from "convex/react";

import { InlineContentText } from "@/components/app/inline-content";
import { DashboardCourseCard, type DashboardCourse } from "@/components/app/dashboard-content";
import { InlineRichText } from "@/components/app/rich-text";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { findCourse } from "@/lib/content";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

type Copy = { sr: string; en: string };
export type TrackExperienceData = {
  track: {
    _id?: string;
    slug: string;
    titleSr: string;
    titleEn: string;
    subtitleSr?: string;
    subtitleEn?: string;
    descriptionSr?: string;
    descriptionEn?: string;
    descriptionRichSr?: string;
    descriptionRichEn?: string;
    status: string;
    videoUrl?: string | null;
    videoFileName?: string;
    pageCopy?: {
      primaryCta?: Copy;
      communityCta?: Copy;
      sectionEyebrow?: Copy;
      sectionTitle?: Copy;
      introVideoEmpty?: Copy;
      introVideoTitle?: Copy;
    };
  };
  courses: Array<{
    _id: string; slug: string; titleSr: string; titleEn: string; subtitleSr: string; subtitleEn: string; descriptionSr: string; descriptionEn: string;
    status: "draft" | "published" | "archived"; coverUrl?: string | null; hasAccess?: boolean;
    lessons?: Array<{ _id: string; slug: string; titleSr: string; titleEn: string; summarySr: string; summaryEn: string; durationSeconds: number; isPublished: boolean; sortOrder: number; progress?: { completed?: boolean; positionSeconds?: number; updatedAt?: number } | null }>;
    progress?: { totalLessons: number; completedLessons: number; percent: number; startedAt?: number; lastActivityAt?: number; nextLessonSlug?: string; nextLessonTitleSr?: string; nextLessonTitleEn?: string; activity?: Array<{ day: string; completed: number }> };
  }>;
  featuredThreads?: Array<{ _id: string; title: string; body: string }>;
};

function local(locale: Locale, sr?: string, en?: string) {
  return (locale === "sr" ? sr || en : en || sr) || "";
}

function asDashboardCourse(course: TrackExperienceData["courses"][number]): DashboardCourse {
  const fallback = findCourse(course.slug);
  return {
    id: course._id,
    slug: course.slug,
    title: { sr: course.titleSr, en: course.titleEn },
    subtitle: { sr: course.subtitleSr, en: course.subtitleEn },
    description: { sr: course.descriptionSr, en: course.descriptionEn },
    image: fallback?.image,
    coverUrl: course.coverUrl,
    status: course.status,
    hasAccess: Boolean(course.hasAccess),
    progress: course.progress ? { ...course.progress, nextLessonTitle: course.progress.nextLessonTitleSr || course.progress.nextLessonTitleEn ? { sr: course.progress.nextLessonTitleSr ?? course.progress.nextLessonTitleEn ?? "", en: course.progress.nextLessonTitleEn ?? course.progress.nextLessonTitleSr ?? "" } : undefined } : undefined,
    lessons: (course.lessons ?? []).map((lesson) => ({ id: lesson._id, slug: lesson.slug, title: { sr: lesson.titleSr, en: lesson.titleEn }, summary: { sr: lesson.summarySr, en: lesson.summaryEn }, duration: `${Math.max(1, Math.round(lesson.durationSeconds / 60))} min`, durationSeconds: lesson.durationSeconds, isPublished: lesson.isPublished, sortOrder: lesson.sortOrder, progress: lesson.progress })),
  };
}

function TrackVideoSection({ locale, trackId, videoUrl, videoFileName, admin, title }: { locale: Locale; trackId: string; videoUrl?: string | null; videoFileName?: string; admin: boolean; title?: Copy }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const createUploadUrl = useMutation(api.video.createDocumentUploadUrl);
  const saveTrackVideo = useMutation(api.video.saveTrackVideo);
  const deleteTrackVideo = useMutation(api.video.deleteTrackVideo);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Nativni `confirm()` nije radio u tamnoj temi i nije rekao sta se tacno gubi.
  const [confirmRemoveVideo, setConfirmRemoveVideo] = useState(false);

  async function removeVideo() {
    setPending(true);
    try {
      await deleteTrackVideo({ trackId: trackId as Id<"courseTracks"> });
      setConfirmRemoveVideo(false);
    } finally {
      setPending(false);
    }
  }

  async function upload(file: File) {
    if (!file.type.startsWith("video/")) { setMessage(local(locale, "Ovde ide samo video fajl (na primer .mp4). Izaberi drugi fajl.", "Only a video file goes here (for example .mp4). Choose a different file.")); return; }
    setPending(true); setMessage(null);
    try {
      const uploadUrl = await createUploadUrl();
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error(local(locale, "Video nije poslat na server. Proveri internet i pokušaj ponovo.", "The video was not uploaded. Check your connection and try again."));
      const { storageId } = await response.json() as { storageId: Id<"_storage"> };
      await saveTrackVideo({ trackId: trackId as Id<"courseTracks">, storageId, fileName: file.name, byteSize: file.size, mimeType: file.type });
    } catch (error) { setMessage(error instanceof Error ? error.message : local(locale, "Slanje nije uspelo. Proveri internet i pokušaj ponovo.", "The upload failed. Check your connection and try again.")); }
    finally { setPending(false); }
  }
  const uploadDropped = useEffectEvent(upload);

  useEffect(() => {
    if (!admin || !trackId) return;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); dragDepth.current += 1; setDragging(true); };
    const over = (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; };
    const leave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); };
    const drop = (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); dragDepth.current = 0; setDragging(false); const file = event.dataTransfer?.files?.[0]; if (file) void uploadDropped(file); };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [admin, trackId]);

  const shownTitle = local(locale, title?.sr, title?.en);
  return <section className="relative rounded-[16px] border-2 border-ink bg-paper-strong p-3 shadow-[6px_6px_0_var(--shadow-hard-10)]">
    <div className="relative overflow-hidden rounded-[8px]">
      {videoUrl ? <video controls preload="metadata" src={videoUrl} className="aspect-video max-h-[520px] w-full bg-scrim object-contain" /> : <div className="grid aspect-video max-h-[520px] w-full place-items-center border-2 border-dashed border-ink bg-paper text-center"><div><PlayCircle className="mx-auto size-12" /><p className="mt-3 font-black">Uvodni video smera još nije dodat.</p></div></div>}
      {(shownTitle || admin) ? <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-[16px] bg-scrim/88 px-5 py-3 text-white backdrop-blur"><div className="pointer-events-auto text-xl font-black"><InlineContentText entityId={trackId} kind="track" field="pageCopy_introVideoTitle" locale={locale} sr={title?.sr ?? ""} en={title?.en ?? ""} admin={admin}>{shownTitle || "Dodaj naslov videa"}</InlineContentText></div></div> : null}
    </div>
    {admin ? <div className="mt-3 flex flex-wrap items-center gap-2"><input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /><button type="button" disabled={pending} onClick={() => inputRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black">{pending ? <Spinner /> : <UploadCloud className="size-4" />}{videoUrl ? "Zameni video" : "Dodaj video"}</button>{videoUrl ? <button type="button" disabled={pending} onClick={() => setConfirmRemoveVideo(true)} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-red-700 bg-paper-strong px-4 text-xs font-black text-red-700"><Trash2 className="size-4" />Ukloni</button> : null}<span className="text-xs font-bold text-muted">{videoFileName}</span></div> : null}
    {message ? <p className="mt-3 rounded-[8px] border-2 border-red-700 bg-red-50 p-3 text-sm font-black text-red-800">{message}</p> : null}
    {dragging ? <div className="fixed inset-0 z-[200] grid place-items-center bg-scrim/88 p-6 text-center text-white backdrop-blur"><div className="rounded-[16px] border-2 border-paper-strong bg-ink p-8 shadow-[8px_8px_0_var(--yellow)]"><UploadCloud className="mx-auto size-12" /><p className="mt-4 font-display text-4xl">Pusti video za ovaj smer</p></div></div> : null}
    <ConfirmDialog
      open={confirmRemoveVideo}
      onClose={() => setConfirmRemoveVideo(false)}
      onConfirm={removeVideo}
      busy={pending}
      destructive
      eyebrow={local(locale, "Brisanje", "Delete")}
      title={local(locale, "Ukloniti uvodni video smera?", "Remove the track intro video?")}
      description={local(
        locale,
        "Video se trajno brise sa servera i ne moze da se vrati. Na vrhu stranice smera ostace prazan okvir dok ne dodas nov video.",
        "The video is deleted from the server for good and cannot be brought back. The top of the track page will show an empty frame until you add a new one.",
      )}
      confirmLabel={local(locale, "Ukloni video", "Remove video")}
      cancelLabel={local(locale, "Odustani", "Cancel")}
      closeLabel={local(locale, "Zatvori", "Close")}
    />
  </section>;
}

export function TrackExperience({ data, locale, admin = false, inlineLocale = locale, profileName = "student" }: { data: TrackExperienceData; locale: Locale; admin?: boolean; inlineLocale?: Locale; profileName?: string }) {
  const trackId = data.track._id ?? "";
  const primaryCta = data.track.pageCopy?.primaryCta;
  const communityCta = data.track.pageCopy?.communityCta;
  const sectionEyebrow = data.track.pageCopy?.sectionEyebrow;
  const sectionTitle = data.track.pageCopy?.sectionTitle;

  return (
    <div className="mx-auto max-w-[1440px] space-y-7">
      <section className="overflow-hidden rounded-[16px] border-2 border-ink bg-paper-strong shadow-[8px_8px_0_var(--shadow-hard-13)]">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-7 sm:p-9">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border-2 border-ink bg-yellow px-4 py-1.5 text-xs font-black uppercase">{data.track.status === "published" ? "Objavljen smer" : "Nacrt"}</span></div>
            <p className="mt-7 text-sm font-black uppercase tracking-[0.08em] text-muted">{locale === "sr" ? `Zdravo, ${profileName}` : `Hi, ${profileName}`}</p>
            <h1 className="mt-3 font-display text-5xl leading-none text-ink sm:text-6xl"><InlineContentText entityId={trackId} kind="track" field="title" locale={inlineLocale} sr={data.track.titleSr} en={data.track.titleEn} admin={admin && Boolean(trackId)}>{local(locale, data.track.titleSr, data.track.titleEn)}</InlineContentText></h1>
            <p className="mt-4 text-xl font-black text-muted"><InlineContentText entityId={trackId} kind="track" field="subtitle" locale={inlineLocale} sr={data.track.subtitleSr ?? ""} en={data.track.subtitleEn ?? ""} admin={admin && Boolean(trackId)}>{local(locale, data.track.subtitleSr, data.track.subtitleEn)}</InlineContentText></p>
            <InlineRichText kind="track" entityId={trackId} field="description" locale={inlineLocale} richSr={data.track.descriptionRichSr} richEn={data.track.descriptionRichEn} sr={data.track.descriptionSr ?? ""} en={data.track.descriptionEn ?? ""} admin={admin && Boolean(trackId)} className="mt-5 max-w-3xl text-base font-semibold leading-8 text-muted" />
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#kursevi" className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black"><InlineContentText entityId={trackId} kind="track" field="pageCopy_primaryCta" locale={inlineLocale} sr={primaryCta?.sr ?? "Pogledaj kurseve"} en={primaryCta?.en ?? "View courses"} admin={admin && Boolean(trackId)}>{local(locale, primaryCta?.sr ?? "Pogledaj kurseve", primaryCta?.en ?? "View courses")}</InlineContentText><ArrowRight className="size-4" /></a>
              <Link href={`${withLocale(locale, "/app/community/discussions")}?scope=track&track=${data.track.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-5 text-sm font-black"><MessageCircle className="size-4" /><InlineContentText entityId={trackId} kind="track" field="pageCopy_communityCta" locale={inlineLocale} sr={communityCta?.sr ?? "Zajednica"} en={communityCta?.en ?? "Community"} admin={admin && Boolean(trackId)}>{local(locale, communityCta?.sr ?? "Zajednica", communityCta?.en ?? "Community")}</InlineContentText></Link>
            </div>
          </div>
          <div className="flex min-h-72 flex-col justify-between bg-ink p-7 text-paper-strong"><p className="text-xs font-black uppercase tracking-[0.14em] text-paper-strong/60">Pregled smera</p><p className="font-display text-5xl">{data.courses.length}</p><p className="text-sm font-black">{data.courses.length === 1 ? "kurs" : "kurseva"}</p></div>
        </div>
      </section>
      <TrackVideoSection locale={locale} trackId={trackId} videoUrl={data.track.videoUrl} videoFileName={data.track.videoFileName} admin={admin && Boolean(trackId)} title={data.track.pageCopy?.introVideoTitle} />
      {data.featuredThreads?.length ? <section><h2 className="font-display text-4xl text-ink">Izdvojeno iz zajednice</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{data.featuredThreads.map((thread) => <Link key={thread._id} href={withLocale(locale, `/app/community/${thread._id}`)} className="rounded-[16px] border-2 border-ink bg-paper-strong p-5 shadow-[4px_4px_0_var(--shadow-hard-10)]"><p className="font-black">{thread.title}</p><p className="mt-2 line-clamp-2 text-sm font-semibold text-muted">{thread.body}</p></Link>)}</div></section> : null}
      <section id="kursevi" className="scroll-mt-6"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-muted"><InlineContentText entityId={trackId} kind="track" field="pageCopy_sectionEyebrow" locale={inlineLocale} sr={sectionEyebrow?.sr ?? "Nastavni sadržaj"} en={sectionEyebrow?.en ?? "Learning content"} admin={admin && Boolean(trackId)}>{local(locale, sectionEyebrow?.sr ?? "Nastavni sadržaj", sectionEyebrow?.en ?? "Learning content")}</InlineContentText></p><h2 className="mt-1 font-display text-4xl text-ink"><InlineContentText entityId={trackId} kind="track" field="pageCopy_sectionTitle" locale={inlineLocale} sr={sectionTitle?.sr ?? "Kursevi ovog smera"} en={sectionTitle?.en ?? "Courses in this track"} admin={admin && Boolean(trackId)}>{local(locale, sectionTitle?.sr ?? "Kursevi ovog smera", sectionTitle?.en ?? "Courses in this track")}</InlineContentText></h2></div><div className="mt-5 grid gap-5 md:grid-cols-2">{data.courses.map((course) => <DashboardCourseCard key={course._id} locale={locale} course={asDashboardCourse(course)} isAdmin={admin} />)}</div></section>
    </div>
  );
}
