"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, BarChart3, CheckCircle2, CirclePlus, Loader2, Megaphone, Save, Settings2, Users, XCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { changeContentSelection } from "@/lib/content-selection";
import { DashboardContent, type DashboardCourse } from "@/components/app/dashboard-content";
import { CoursePlayer } from "@/components/app/course-player";
import { TrackExperience, type TrackExperienceData } from "@/components/app/track-experience";
import { findCourse } from "@/lib/content";
import type { Course, Lesson, LessonAsset, LessonPart } from "@/lib/content";

type Status = "draft" | "published" | "archived";
type LessonRow = {
  _id: Id<"lessons">;
  slug: string;
  titleSr: string;
  titleEn: string;
  summarySr: string;
    summaryEn: string;
    summaryRichSr?: string;
    summaryRichEn?: string;
  durationSeconds: number;
  isPublished: boolean;
  proEnabled?: boolean;
  lightEnabled?: boolean;
  sortOrder: number;
  parts?: Array<{
    _id: Id<"lessonParts">;
    parentPartId?: Id<"lessonParts">;
    slug: string;
    titleSr: string;
    titleEn: string;
    kind: "text" | "image" | "video" | "file";
    bodySr?: string;
    bodyEn?: string;
    bodyRichSr?: string;
    bodyRichEn?: string;
    downloadUrl?: string | null;
    fileName?: string;
    byteSize?: number;
  }>;
  assets?: Array<{
    _id: Id<"lessonAssets">;
    titleSr: string;
    titleEn: string;
    kind: "pdf" | "prompt" | "worksheet" | "project";
    fileName: string;
    byteSize?: number;
    downloadUrl?: string | null;
  }>;
};
type CourseRow = {
  _id: Id<"courses">;
  slug: string;
  titleSr: string;
  titleEn: string;
  subtitleSr: string;
  subtitleEn: string;
  descriptionSr: string;
  descriptionEn: string;
  descriptionRichSr?: string;
  descriptionRichEn?: string;
  coverUrl?: string | null;
  status: Status;
  stripePriceId?: string;
  sortOrder: number;
  pageCopy?: {
    primaryCta?: { sr: string; en: string };
    communityCta?: { sr: string; en: string };
    continueCta?: { sr: string; en: string };
    sectionEyebrow?: { sr: string; en: string };
    sectionTitle?: { sr: string; en: string };
    sectionDescription?: { sr: string; en: string };
    introVideoEmpty?: { sr: string; en: string };
  };
  lessons: LessonRow[];
};
type TrackRow = {
  _id: Id<"courseTracks">;
  slug: string;
  titleSr: string;
  titleEn: string;
  subtitleSr?: string;
  subtitleEn?: string;
  descriptionSr?: string;
  descriptionEn?: string;
  descriptionRichSr?: string;
  descriptionRichEn?: string;
  status: Status;
  sortOrder: number;
  videoUrl?: string | null;
  pageCopy?: {
    primaryCta?: { sr: string; en: string };
    communityCta?: { sr: string; en: string };
    continueCta?: { sr: string; en: string };
    sectionEyebrow?: { sr: string; en: string };
    sectionTitle?: { sr: string; en: string };
    sectionDescription?: { sr: string; en: string };
    introVideoEmpty?: { sr: string; en: string };
  };
  courses: CourseRow[];
};
type AdminDetail = { lesson: LessonRow | null };

const inputClass = "min-h-11 w-full rounded-[8px] border-2 border-ink bg-white px-3 text-sm font-bold text-ink outline-none transition focus:ring-4 focus:ring-yellow/35 disabled:cursor-not-allowed disabled:border-line disabled:bg-slate-100 disabled:text-muted";
const labelClass = "grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-ink";

function slugify(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function nextOrder(rows: Array<{ sortOrder: number }>) {
  return rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 10;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={labelClass}>{label}{children}</label>;
}

function dashboardCourseFromRow(course: CourseRow, trackId: Id<"courseTracks">): DashboardCourse {
  return {
    id: course._id,
    trackId,
    slug: course.slug,
    title: { sr: course.titleSr, en: course.titleEn },
    subtitle: { sr: course.subtitleSr, en: course.subtitleEn },
    description: { sr: course.descriptionSr, en: course.descriptionEn },
    descriptionRich: course.descriptionRichSr || course.descriptionRichEn ? { sr: course.descriptionRichSr ?? "", en: course.descriptionRichEn ?? "" } : undefined,
    coverUrl: course.coverUrl,
    status: course.status,
    hasAccess: true,
    stripePriceId: course.stripePriceId,
    pageCopy: course.pageCopy,
    lessons: course.lessons.map((lesson) => ({
      id: lesson._id,
      slug: lesson.slug,
      title: { sr: lesson.titleSr, en: lesson.titleEn },
      summary: { sr: lesson.summarySr, en: lesson.summaryEn },
      summaryRich: lesson.summaryRichSr || lesson.summaryRichEn ? { sr: lesson.summaryRichSr ?? "", en: lesson.summaryRichEn ?? "" } : undefined,
      duration: `${Math.max(1, Math.round(lesson.durationSeconds / 60))} min`,
      durationSeconds: lesson.durationSeconds,
      isPublished: lesson.isPublished,
      sortOrder: lesson.sortOrder,
    })),
  };
}

function lessonFromRow(row: LessonRow): Lesson {
  const assets = (row.assets ?? []).map((asset): LessonAsset => ({
    id: asset._id,
    label: { sr: asset.titleSr, en: asset.titleEn },
    kind: asset.kind,
    size: asset.byteSize ? `${Math.round(asset.byteSize / 1024)} KB` : asset.fileName,
    downloadUrl: asset.downloadUrl,
  }));
  return {
    id: row._id,
    slug: row.slug,
    title: { sr: row.titleSr, en: row.titleEn },
    duration: `${Math.max(1, Math.round(row.durationSeconds / 60))} min`,
    durationSeconds: row.durationSeconds,
    summary: { sr: row.summarySr, en: row.summaryEn },
    summaryRich: row.summaryRichSr || row.summaryRichEn ? { sr: row.summaryRichSr ?? "", en: row.summaryRichEn ?? "" } : undefined,
    isPublished: row.isPublished,
    sortOrder: row.sortOrder,
    assets,
    parts: (row.parts ?? []).map((part): LessonPart => ({
      id: part._id,
      parentPartId: part.parentPartId,
      slug: part.slug,
      title: { sr: part.titleSr, en: part.titleEn },
      kind: part.kind,
      body: { sr: part.bodySr ?? "", en: part.bodyEn ?? "" },
      bodyRich: part.bodyRichSr || part.bodyRichEn ? { sr: part.bodyRichSr ?? "", en: part.bodyRichEn ?? "" } : undefined,
      downloadUrl: part.downloadUrl,
      fileName: part.fileName,
      size: part.byteSize ? `${Math.round(part.byteSize / 1024)} KB` : undefined,
    })),
  };
}

function courseFromRows(course: CourseRow, lesson: LessonRow): Course {
  const fallback = findCourse(course.slug);
  const liveLesson = lessonFromRow(lesson);
  return {
    ...fallback,
    slug: course.slug,
    title: { sr: course.titleSr, en: course.titleEn },
    subtitle: { sr: course.subtitleSr, en: course.subtitleEn },
    description: { sr: course.descriptionSr, en: course.descriptionEn },
    descriptionRich: course.descriptionRichSr || course.descriptionRichEn ? { sr: course.descriptionRichSr ?? "", en: course.descriptionRichEn ?? "" } : undefined,
    status: course.status === "published" ? "published" : "coming-soon",
    modules: [{ title: { sr: "Lekcija", en: "Lesson" }, lessons: [liveLesson] }],
  };
}

function ResetButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="text-[11px] font-black text-muted underline decoration-2 underline-offset-4 disabled:opacity-35">Poništi</button>;
}

function FutureModule({ icon: Icon, title, body }: { icon: typeof Users; title: string; body: string }) {
  return (
    <article className="rounded-[16px] border-2 border-ink bg-white p-6 shadow-[6px_6px_0_rgba(14,49,88,0.12)]">
      <span className="grid size-11 place-items-center rounded-full border-2 border-ink bg-yellow"><Icon className="size-5" /></span>
      <p className="mt-5 text-xl font-black text-ink">{title}</p>
      <p className="mt-2 text-sm font-bold leading-6 text-muted">{body}</p>
      <span className="mt-5 inline-flex rounded-full border border-line bg-paper px-3 py-1 text-[10px] font-black uppercase text-muted">Planirano</span>
    </article>
  );
}

export function AdminContentManager({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hierarchy = useQuery(api.contentHierarchy.getAdminHierarchy) as TrackRow[] | undefined;
  const upsertTrack = useMutation(api.contentHierarchy.upsertTrack);
  const upsertCourse = useMutation(api.courses.upsertCourse);
  const upsertLesson = useMutation(api.contentHierarchy.upsertDirectLesson);
  const createDraftEntity = useMutation(api.contentHierarchy.createDraftEntity);
  const [tab, setTab] = useState<"content" | "users" | "growth" | "analytics">("content");
  const [trackId, setTrackId] = useState(() => searchParams.get("track") ?? "");
  const [courseId, setCourseId] = useState(() => searchParams.get("course") ?? "");
  const [lessonId, setLessonId] = useState(() => searchParams.get("lesson") ?? "");
  const lessonView = searchParams.get("view") === "pro" ? "pro" : "light";
  const [creating, setCreating] = useState<"track" | "course" | "lesson" | null>(null);
  const [creationIntent, setCreationIntent] = useState<"course" | "lesson" | null>(null);
  const [creationPending, setCreationPending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const trackSelectRef = useRef<HTMLSelectElement>(null);
  const courseSelectRef = useRef<HTMLSelectElement>(null);

  function select(level: "track" | "course" | "lesson", id: string) {
    const next = changeContentSelection({ trackId, courseId, lessonId }, level, id);
    setTrackId(next.trackId);
    setCourseId(next.courseId);
    setLessonId(next.lessonId);
    setCreating(null);
    setSettingsOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (next.trackId) params.set("track", next.trackId); else params.delete("track");
    if (next.courseId) params.set("course", next.courseId); else params.delete("course");
    if (next.lessonId) params.set("lesson", next.lessonId); else params.delete("lesson");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setLessonView(view: "pro" | "light") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const selectedTrack = hierarchy?.find((row) => row._id === trackId);
  const selectedCourse = selectedTrack?.courses.find((row) => row._id === courseId);
  const selectedLesson = selectedCourse?.lessons.find((row) => row._id === lessonId);
  const detail = useQuery(
    api.contentHierarchy.getAdminDetail,
    selectedTrack
      ? {
          trackId: selectedTrack._id,
          ...(selectedCourse ? { courseId: selectedCourse._id } : {}),
          ...(selectedLesson ? { lessonId: selectedLesson._id } : {}),
        }
      : "skip",
  ) as AdminDetail | undefined;
  const activeKind = creating ?? (selectedLesson ? "lesson" : selectedCourse ? "course" : "track");
  const readiness = useQuery(
    api.contentReadiness.getReadiness,
    selectedLesson
      ? { kind: "lesson", lessonId: selectedLesson._id }
      : selectedCourse
        ? { kind: "course", courseId: selectedCourse._id }
        : selectedTrack
          ? { kind: "track", trackId: selectedTrack._id }
          : "skip",
  );

  function replaceSelection(next: { trackId: string; courseId: string; lessonId: string }) {
    setTrackId(next.trackId);
    setCourseId(next.courseId);
    setLessonId(next.lessonId);
    const params = new URLSearchParams(searchParams.toString());
    if (next.trackId) params.set("track", next.trackId); else params.delete("track");
    if (next.courseId) params.set("course", next.courseId); else params.delete("course");
    if (next.lessonId) params.set("lesson", next.lessonId); else params.delete("lesson");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function createTemplate(kind: "track" | "course" | "lesson", parents: { trackId?: string; courseId?: string } = {}) {
    if (creationPending) return;
    setCreationPending(true);
    setMessage(null);
    try {
      const result = await createDraftEntity({
        kind,
        ...(parents.trackId ? { trackId: parents.trackId as Id<"courseTracks"> } : {}),
        ...(parents.courseId ? { courseId: parents.courseId as Id<"courses"> } : {}),
      });
      const next =
        result.kind === "track"
          ? { trackId: result.id, courseId: "", lessonId: "" }
          : result.kind === "course"
            ? { trackId: result.trackId, courseId: result.id, lessonId: "" }
            : { trackId: result.trackId ?? parents.trackId ?? "", courseId: result.courseId, lessonId: result.id };
      replaceSelection(next);
      setCreationIntent(null);
      setMessage({ tone: "success", text: kind === "track" ? "Prazan smer je spreman za inline unos." : kind === "course" ? "Prazan kurs je dodat izabranom smeru." : "Prazna lekcija je dodata na dno kursa." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Novi template nije napravljen." });
    } finally {
      setCreationPending(false);
    }
  }

  async function handleTrackSelection(id: string) {
    select("track", id);
    if (id && creationIntent === "course") await createTemplate("course", { trackId: id });
  }

  async function handleCourseSelection(id: string) {
    select("course", id);
    if (id && creationIntent === "lesson" && trackId) await createTemplate("lesson", { trackId, courseId: id });
  }

  useEffect(() => {
    if (creationIntent === "course" && !selectedTrack) trackSelectRef.current?.focus();
    if (creationIntent === "lesson") {
      if (!selectedTrack) trackSelectRef.current?.focus();
      else if (!selectedCourse) courseSelectRef.current?.focus();
    }
  }, [creationIntent, selectedCourse, selectedTrack]);

  function openNativeSelect(ref: RefObject<HTMLSelectElement | null>) {
    requestAnimationFrame(() => {
      ref.current?.focus();
      try {
        (ref.current as HTMLSelectElement & { showPicker?: () => void } | null)?.showPicker?.();
      } catch {
        // Focus plus the amber outline remains the accessible fallback.
      }
    });
  }

  const [titleSr, setTitleSr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [slug, setSlug] = useState("");
  const [subtitleSr, setSubtitleSr] = useState("");
  const [subtitleEn, setSubtitleEn] = useState("");
  const [descriptionSr, setDescriptionSr] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [status, setStatus] = useState<Status>("draft");
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [proEnabled, setProEnabled] = useState(true);
  const [lightEnabled, setLightEnabled] = useState(true);

  useEffect(() => {
    const entity = creating ? null : selectedLesson ?? selectedCourse ?? selectedTrack ?? null;
    queueMicrotask(() => {
      setTitleSr(entity?.titleSr ?? "");
      setTitleEn(entity?.titleEn ?? "");
      setSlug(entity?.slug ?? "");
      setSubtitleSr((entity && "subtitleSr" in entity ? entity.subtitleSr : "") ?? "");
      setSubtitleEn((entity && "subtitleEn" in entity ? entity.subtitleEn : "") ?? "");
      setDescriptionSr(entity && "summarySr" in entity ? entity.summarySr : entity && "descriptionSr" in entity ? entity.descriptionSr ?? "" : "");
      setDescriptionEn(entity && "summaryEn" in entity ? entity.summaryEn : entity && "descriptionEn" in entity ? entity.descriptionEn ?? "" : "");
      setStatus(entity && "isPublished" in entity ? (entity.isPublished ? "published" : "draft") : entity?.status ?? "draft");
      setDurationMinutes(entity && "durationSeconds" in entity ? Math.max(1, Math.round(entity.durationSeconds / 60)) : 10);
      setProEnabled(entity && "proEnabled" in entity ? entity.proEnabled ?? true : true);
      setLightEnabled(entity && "lightEnabled" in entity ? entity.lightEnabled ?? true : true);
      setMessage(null);
    });
  }, [creating, selectedCourse, selectedLesson, selectedTrack]);

  const tabs = [
    { id: "content" as const, label: "Nastavni sadržaj" },
    { id: "users" as const, label: "Korisnici" },
    { id: "growth" as const, label: "Affiliate i oglasi" },
    { id: "analytics" as const, label: "Analitika" },
  ];

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const resolvedSlug = slug || slugify(titleSr || titleEn);
      if (activeKind === "track") {
        const id = await upsertTrack({
          ...(!creating && selectedTrack ? { trackId: selectedTrack._id } : {}),
          slug: resolvedSlug,
          titleSr,
          titleEn,
          subtitleSr: subtitleSr || undefined,
          subtitleEn: subtitleEn || undefined,
          descriptionSr: descriptionSr || undefined,
          descriptionEn: descriptionEn || undefined,
          status,
          sortOrder: selectedTrack?.sortOrder ?? nextOrder(hierarchy ?? []),
        });
        setTrackId(id);
        setCourseId("");
        setLessonId("");
      } else if (activeKind === "course") {
        if (!selectedTrack) throw new Error("Prvo izaberi smer.");
        const id = await upsertCourse({
          ...(!creating && selectedCourse ? { courseId: selectedCourse._id } : {}),
          trackId: selectedTrack._id,
          slug: resolvedSlug,
          titleSr,
          titleEn,
          subtitleSr,
          subtitleEn,
          descriptionSr,
          descriptionEn,
          status,
          sortOrder: selectedCourse?.sortOrder ?? nextOrder(selectedTrack.courses),
        });
        setCourseId(id);
        setLessonId("");
      } else {
        if (!selectedCourse) throw new Error("Prvo izaberi kurs.");
        const id = await upsertLesson({
          ...(!creating && selectedLesson ? { lessonId: selectedLesson._id } : {}),
          courseId: selectedCourse._id,
          slug: resolvedSlug,
          titleSr,
          titleEn,
          summarySr: descriptionSr,
          summaryEn: descriptionEn,
          durationSeconds: durationMinutes * 60,
          isPublished: status === "published",
          proEnabled,
          lightEnabled,
          sortOrder: selectedLesson?.sortOrder ?? nextOrder(selectedCourse.lessons),
        });
        setLessonId(id);
      }
      setCreating(null);
      setMessage({ tone: "success", text: "Izmene su sačuvane i odmah dostupne u preview prikazu." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Čuvanje nije uspelo." });
    } finally {
      setPending(false);
    }
  }

  if (!hierarchy) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-8 animate-spin" /></div>;

  const trackSurface: TrackExperienceData | null = selectedTrack
    ? {
        track: {
          _id: selectedTrack._id,
          slug: selectedTrack.slug,
          titleSr: selectedTrack.titleSr,
          titleEn: selectedTrack.titleEn,
          subtitleSr: selectedTrack.subtitleSr,
          subtitleEn: selectedTrack.subtitleEn,
          descriptionSr: selectedTrack.descriptionSr,
          descriptionEn: selectedTrack.descriptionEn,
          descriptionRichSr: selectedTrack.descriptionRichSr,
          descriptionRichEn: selectedTrack.descriptionRichEn,
          status: selectedTrack.status,
          videoUrl: selectedTrack.videoUrl,
          pageCopy: selectedTrack.pageCopy,
        },
        courses: selectedTrack.courses,
        featuredThreads: [],
      }
    : null;
  const courseSurface = selectedCourse && selectedTrack ? dashboardCourseFromRow(selectedCourse, selectedTrack._id) : null;
  const previewLesson = detail?.lesson ?? selectedLesson;
  const lessonSurface = previewLesson && selectedCourse ? lessonFromRow(previewLesson) : null;
  const lessonCourseSurface = previewLesson && selectedCourse ? courseFromRows(selectedCourse, previewLesson) : null;
  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">Administracija</p>
        <h1 className="mt-2 font-display text-5xl text-ink sm:text-6xl">Kontrolni centar</h1>
      </header>

      <nav aria-label="Admin sekcije" className="relative flex w-full gap-1 overflow-x-auto border-b-2 border-ink">
        {tabs.map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("relative min-h-12 shrink-0 px-4 text-sm font-black", tab === item.id ? "text-ink" : "text-muted")}>
            {item.label}
            {tab === item.id ? <motion.span layoutId="admin-tab-indicator" className="absolute inset-x-2 bottom-[-2px] h-1 rounded-full bg-yellow ring-2 ring-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
          </button>
        ))}
      </nav>

      {tab !== "content" ? (
        <div className="grid gap-5 md:grid-cols-3">
          {tab === "users" ? <FutureModule icon={Users} title="Upravljanje korisnicima" body="Pregled, suspenzija i administracija naloga biće dodati bez izmišljanja privremenih podataka." /> : null}
          {tab === "growth" ? <><FutureModule icon={Megaphone} title="Affiliate i influenseri" body="Evidencija partnera, kampanja i atribucije." /><FutureModule icon={Megaphone} title="Meta i Google Ads" body="Povezivanje stvarnih oglasnih naloga i podataka." /></> : null}
          {tab === "analytics" ? <FutureModule icon={BarChart3} title="Google Analytics" body="Metrike će se prikazati tek nakon povezivanja stvarnog izvora podataka." /> : null}
        </div>
      ) : (
        <>
          <section className="rounded-[16px] border-2 border-ink bg-white p-4 shadow-[6px_6px_0_rgba(14,49,88,0.12)]">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto] lg:items-end">
              <Field label="1. Smer"><select ref={trackSelectRef} className={cn(inputClass, creationIntent && !selectedTrack && "border-amber-600 ring-4 ring-amber-400/30")} value={trackId} onChange={(e) => void handleTrackSelection(e.target.value)}><option value="">Izaberi smer</option>{hierarchy.map((track) => <option key={track._id} value={track._id}>{track.titleSr || "Novi smer (nacrt)"}</option>)}</select></Field>
              <ResetButton disabled={!trackId} onClick={() => select("track", "")} />
              <Field label="2. Kurs"><select ref={courseSelectRef} className={cn(inputClass, creationIntent === "lesson" && selectedTrack && !selectedCourse && "border-amber-600 ring-4 ring-amber-400/30")} disabled={!selectedTrack} value={courseId} onChange={(e) => void handleCourseSelection(e.target.value)}><option value="">{selectedTrack ? "Izaberi kurs" : "Prvo izaberi smer"}</option>{selectedTrack?.courses.map((course) => <option key={course._id} value={course._id}>{course.titleSr || "Novi kurs (nacrt)"}</option>)}</select></Field>
              <ResetButton disabled={!courseId} onClick={() => select("course", "")} />
              <Field label="3. Lekcija"><select className={inputClass} disabled={!selectedCourse} value={lessonId} onChange={(e) => select("lesson", e.target.value)}><option value="">{selectedCourse ? "Izaberi lekciju" : "Prvo izaberi kurs"}</option>{selectedCourse?.lessons.map((lesson) => <option key={lesson._id} value={lesson._id}>{lesson.titleSr || "Nova lekcija (nacrt)"}</option>)}</select></Field>
              <ResetButton disabled={!lessonId} onClick={() => select("lesson", "")} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <button type="button" disabled={creationPending} onClick={() => void createTemplate("track")} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black disabled:opacity-50"><CirclePlus className="size-4" /> Novi smer</button>
              <button type="button" disabled={creationPending} onClick={() => { if (selectedTrack) void createTemplate("course", { trackId: selectedTrack._id }); else { setCreationIntent("course"); openNativeSelect(trackSelectRef); } }} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-white px-4 text-xs font-black disabled:opacity-50"><CirclePlus className="size-4" /> Novi kurs</button>
              <button type="button" disabled={creationPending} onClick={() => { if (selectedCourse && selectedTrack) void createTemplate("lesson", { trackId: selectedTrack._id, courseId: selectedCourse._id }); else { setCreationIntent("lesson"); if (!selectedTrack) openNativeSelect(trackSelectRef); else openNativeSelect(courseSelectRef); } }} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-white px-4 text-xs font-black disabled:opacity-50"><CirclePlus className="size-4" /> Nova lekcija</button>
            </div>
            {creationIntent ? <p role="status" className="mt-3 inline-flex items-center gap-2 rounded-[8px] border-2 border-amber-700 bg-amber-50 px-3 py-2 text-xs font-black text-amber-950"><AlertTriangle className="size-4" />{creationIntent === "course" ? "Izaberi smer u označenom selectu. Novi kurs će se odmah napraviti u njemu." : selectedTrack ? "Izaberi kurs u označenom selectu. Nova lekcija biće dodata na njegovo dno." : "Prvo izaberi smer, zatim kurs za novu lekciju."}</p> : null}
            {message ? <p role="status" className={cn("mt-3 rounded-[8px] border-2 px-3 py-2 text-xs font-black", message.tone === "success" ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-red-700 bg-red-50 text-red-800")}>{message.text}</p> : null}
          </section>

          {readiness ? <section className="mt-5 rounded-[16px] border-2 border-ink bg-white p-4 shadow-[6px_6px_0_rgba(14,49,88,0.12)]" aria-label="Spremno za objavu">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Kontrola sadržaja</p><h2 className="mt-1 font-display text-3xl text-ink">{readiness.ready ? "Spremno za objavu" : "Dovrši pre objave"}</h2></div><span className={cn("rounded-full border-2 border-ink px-4 py-2 text-xs font-black uppercase", readiness.ready ? "bg-emerald-100 text-emerald-900" : "bg-yellow text-ink")}>{readiness.items.filter((item) => item.ok).length}/{readiness.items.length}</span></div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{readiness.items.map((entry) => <button key={entry.key} type="button" onClick={() => { if (entry.key === "slug" || entry.key === "view" || entry.key === "duration") setSettingsOpen(true); document.getElementById("admin-live-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={cn("flex min-h-12 items-center gap-3 rounded-[16px] border-2 px-3 py-2 text-left text-xs font-black", entry.ok ? "border-emerald-700 bg-emerald-50 text-emerald-900" : entry.blocking ? "border-red-700 bg-red-50 text-red-900" : "border-amber-700 bg-amber-50 text-amber-950")}>{entry.ok ? <CheckCircle2 className="size-5 shrink-0" /> : entry.blocking ? <XCircle className="size-5 shrink-0" /> : <AlertTriangle className="size-5 shrink-0" />}<span>{entry.labelSr}</span></button>)}</div>
          </section> : null}

          {false ? <AnimatePresence mode="wait">
            <motion.section key={`${activeKind}-${creating ?? lessonId ?? courseId ?? trackId ?? "empty"}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="overflow-hidden rounded-[16px] border-2 border-ink bg-white shadow-[8px_8px_0_rgba(14,49,88,0.13)]">
              <div className="grid bg-yellow px-6 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div><p className="text-xs font-black uppercase tracking-[0.12em] text-muted">{creating ? "Novi nacrt" : activeKind === "track" ? "Smer" : activeKind === "course" ? "Kurs" : "Lekcija"}</p><h2 className="mt-1 font-display text-4xl text-ink">{titleSr || (creating ? "Unesi naziv" : "Izaberi sadržaj")}</h2></div>
                <span className="mt-3 w-fit rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black uppercase lg:mt-0">{status === "published" ? "Objavljeno" : "Nacrt"}</span>
              </div>
              <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
                <form onSubmit={save} className="grid gap-5 p-6">
                  <div className="grid gap-4 md:grid-cols-2"><Field label="Naziv SR"><input required className={inputClass} value={titleSr} onChange={(e) => setTitleSr(e.target.value)} placeholder="Jasan naziv sadržaja" /></Field><Field label="Title EN"><input className={inputClass} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></Field></div>
                  <Field label="URL naziv"><input required className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={slugify(titleSr) || "url-naziv"} /></Field>
                  {activeKind !== "lesson" ? <div className="grid gap-4 md:grid-cols-2"><Field label="Podnaslov SR"><input className={inputClass} value={subtitleSr} onChange={(e) => setSubtitleSr(e.target.value)} placeholder="Kratko obećanje sadržaja" /></Field><Field label="Subtitle EN"><input className={inputClass} value={subtitleEn} onChange={(e) => setSubtitleEn(e.target.value)} /></Field></div> : null}
                  <div className="grid gap-4 md:grid-cols-2"><Field label={activeKind === "lesson" ? "Sažetak SR" : "Opis SR"}><textarea required={status === "published"} className={cn(inputClass, "min-h-32 py-3")} value={descriptionSr} onChange={(e) => setDescriptionSr(e.target.value)} placeholder="Objasni šta student dobija i šta treba da uradi." /></Field><Field label={activeKind === "lesson" ? "Summary EN" : "Description EN"}><textarea className={cn(inputClass, "min-h-32 py-3")} value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} /></Field></div>
                  {activeKind === "lesson" ? <div className="grid gap-4 md:grid-cols-3"><Field label="Trajanje (min)"><input type="number" min={1} className={inputClass} value={durationMinutes} onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))} /></Field><label className="flex min-h-11 items-center gap-3 rounded-[8px] border-2 border-ink px-3 text-sm font-black"><input type="checkbox" checked={proEnabled} onChange={(e) => setProEnabled(e.target.checked)} /> Pro prikaz</label><label className="flex min-h-11 items-center gap-3 rounded-[8px] border-2 border-ink px-3 text-sm font-black"><input type="checkbox" checked={lightEnabled} onChange={(e) => setLightEnabled(e.target.checked)} /> Light prikaz</label></div> : null}
                  <div className="flex flex-wrap items-end justify-between gap-4 border-t-2 border-line pt-5"><Field label="Status"><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as Status)}><option value="draft">Nacrt</option><option value="published">Objavljeno</option>{activeKind !== "lesson" ? <option value="archived">Arhivirano</option> : null}</select></Field><button type="submit" disabled={pending || (!trackId && !creating && !selectedTrack)} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-ink px-5 text-sm font-black text-white shadow-[3px_3px_0_#f4be30] disabled:opacity-50">{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Sačuvaj izmene</button></div>
                  {message ? <p role="status" className={cn("rounded-[8px] border-2 p-3 text-sm font-black", message?.tone === "success" ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-red-700 bg-red-50 text-red-800")}>{message?.text}</p> : null}
                </form>
                <aside className="border-t-2 border-ink bg-paper p-6 lg:border-l-2 lg:border-t-0"><p className="text-xs font-black uppercase tracking-[0.12em] text-muted">Studentski prikaz</p><p className="mt-3 text-sm font-bold leading-6 text-muted">Ispod ove forme nalazi se stvarna stranica smera, kursa ili lekcije. Inline izmene se rade direktno u tom prikazu.</p></aside>
              </div>
            </motion.section>
          </AnimatePresence> : null}
          {trackSurface || courseSurface || lessonSurface ? (
            <section id="admin-live-preview" className="relative mt-8 scroll-mt-6 overflow-hidden rounded-[16px] border-2 border-ink bg-paper shadow-[8px_8px_0_rgba(14,49,88,0.13)]">
              <div className="absolute right-3 top-3 z-40">
                <button type="button" onClick={() => setSettingsOpen((open) => !open)} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-white/95 px-4 text-xs font-black shadow-[3px_3px_0_rgba(14,49,88,0.18)] backdrop-blur"><Settings2 className="size-4" /> Podešavanja</button>
                {settingsOpen ? (
                  <form onSubmit={save} className="mt-2 grid w-[min(320px,calc(100vw-3rem))] gap-3 rounded-[16px] border-2 border-ink bg-white p-4 shadow-[7px_7px_0_rgba(14,49,88,0.18)]">
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-muted">Sistemska podešavanja</p>
                    <Field label="URL / SEO naziv"><input className={inputClass} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder={slugify(titleSr || titleEn) || "automatski-iz-naslova"} /></Field>
                    <Field label="Status"><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as Status)}><option value="draft">Nacrt</option><option value="published">Objavljeno</option>{activeKind !== "lesson" ? <option value="archived">Arhivirano</option> : null}</select></Field>
                    {activeKind === "lesson" ? <><Field label="Trajanje (min)"><input type="number" min={1} className={inputClass} value={durationMinutes} onChange={(event) => setDurationMinutes(Math.max(1, Number(event.target.value)))} /></Field><label className="flex items-center gap-2 text-xs font-black"><input type="checkbox" checked={proEnabled} onChange={(event) => setProEnabled(event.target.checked)} /> Pro prikaz</label><label className="flex items-center gap-2 text-xs font-black"><input type="checkbox" checked={lightEnabled} onChange={(event) => setLightEnabled(event.target.checked)} /> Light prikaz</label></> : null}
                    <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-4 text-xs font-black text-white disabled:opacity-50">{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Sačuvaj podešavanja</button>
                  </form>
                ) : null}
              </div>
              <div className="p-4 sm:p-6">
                {lessonSurface && lessonCourseSurface ? <CoursePlayer course={lessonCourseSurface} lesson={lessonSurface} locale={locale} courseId={selectedCourse?._id} lessonId={selectedLesson?._id} isAdmin inlineLocale={locale} inlinePreview initialView={lessonView} onViewChange={setLessonView} /> : null}
                {!lessonSurface && courseSurface ? <DashboardContent locale={locale} course={courseSurface} isAdmin inlineLocale={locale} inlinePreview /> : null}
                {!lessonSurface && !courseSurface && trackSurface ? <TrackExperience data={trackSurface} locale={locale} inlineLocale={locale} admin profileName="admin" /> : null}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
