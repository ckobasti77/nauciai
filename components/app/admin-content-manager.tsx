"use client";

import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, ArrowLeft, BarChart3, BookOpen, CheckCircle2, CirclePlus, FileText, GraduationCap, Layers, ListTree, Loader2, Megaphone, Save, Settings2, Shield, Users, Wand2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/components/ui/primitives";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { t, withLocale, type Locale } from "@/lib/i18n";
import { changeContentSelection } from "@/lib/content-selection";
import {
  contentStatus,
  draftCount,
  listLevelAfterChange,
  listLevelForSelection,
  parentListLevel,
  type ContentStatus,
  type ListLevel,
  type SelectionLevel,
} from "@/lib/admin-content-tree";
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

const inputClass = "min-h-11 w-full rounded-[8px] border-2 border-ink bg-paper-strong px-3 text-sm font-bold text-ink transition focus:ring-4 focus:ring-yellow/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:border-line disabled:bg-slate-100 disabled:text-muted";
const labelClass = "grid gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-ink";

/** Nacrt je namerno najglasniji ton: to je jedino stanje koje studenti NE vide. */
const statusTone: Record<ContentStatus, BadgeTone> = {
  draft: "ink",
  published: "neutral",
  archived: "muted",
};

const listForKind: Record<SelectionLevel, ListLevel> = {
  track: "tracks",
  course: "courses",
  lesson: "lessons",
};

function statusLabel(status: ContentStatus, locale: Locale) {
  if (status === "published") return t(locale, "Objavljeno", "Published");
  if (status === "archived") return t(locale, "Arhivirano", "Archived");
  return t(locale, "Nacrt", "Draft");
}

function titleOf(row: { titleSr: string; titleEn: string }, locale: Locale) {
  const title = (locale === "sr" ? row.titleSr : row.titleEn) || row.titleSr || row.titleEn;
  return title.trim() || t(locale, "Bez naziva", "Untitled");
}

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

function AdminPageFrame({ locale, title, children }: { locale: Locale; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">{t(locale, "Administracija", "Administration")}</p>
        {/* Svaka admin ruta nosi svoj naslov. Ranije su sve četiri pisale
            "Kontrolni centar", pa se iz naslova nije videlo gde si (UX-BOOST-PLAN §3D). */}
        <h1 className="mt-2 font-display text-5xl text-ink sm:text-6xl">{title}</h1>
      </header>
      {children}
    </div>
  );
}

/** Linkovi ka admin modulima koji već rade, da prazna stranica ne bude ćorsokak. */
function WorkingModuleLinks({ locale }: { locale: Locale }) {
  const links: Array<{ href: string; icon: LucideIcon; label: string; body: string }> = [
    {
      href: withLocale(locale, "/app/admin/content"),
      icon: FileText,
      label: t(locale, "Sadržaj", "Content"),
      body: t(locale, "Smerovi, kursevi i lekcije - pravljenje, uređivanje i objava.", "Tracks, courses and lessons - create, edit and publish."),
    },
    {
      href: withLocale(locale, "/app/admin/chat"),
      icon: Shield,
      label: t(locale, "Chat sigurnost", "Chat safety"),
      body: t(locale, "Prijave iz poruka i mere prema nalozima.", "Message reports and account actions."),
    },
    {
      href: withLocale(locale, "/app/admin/studio"),
      icon: Wand2,
      label: t(locale, "Studio admin", "Studio admin"),
      body: t(locale, "Modeli, cene i paketi kredita u Studiju.", "Studio models, prices and credit packs."),
    },
  ];

  return (
    <section aria-labelledby="admin-working-modules" className="space-y-3">
      <h2 id="admin-working-modules" className="text-xs font-black uppercase tracking-[0.12em] text-muted">
        {t(locale, "Dotle možeš ovde", "What already works")}
      </h2>
      <ul className="grid gap-3 md:grid-cols-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="surface-card flex h-full items-start gap-3 border-2 border-ink bg-paper-strong p-4 transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
                <link.icon aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-ink">{link.label}</span>
                <span className="mt-1 block text-xs font-bold leading-5 text-muted">{link.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Modul koji još ne postoji: jedno prazno stanje sa spiskom šta će tu biti + izlaz. */
function AdminModulePlaceholder({
  locale,
  title,
  icon,
  emptyTitle,
  emptyBody,
}: {
  locale: Locale;
  title: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <AdminPageFrame locale={locale} title={title}>
      <EmptyState icon={icon} title={emptyTitle} body={emptyBody} />
      <WorkingModuleLinks locale={locale} />
    </AdminPageFrame>
  );
}

export function AdminUsersPanel({ locale }: { locale: Locale }) {
  return (
    <AdminModulePlaceholder
      locale={locale}
      icon={Users}
      title={t(locale, "Korisnici", "Users")}
      emptyTitle={t(locale, "U pripremi", "Coming soon")}
      emptyBody={t(
        locale,
        "Ovde će biti spisak naloga: ko se kad prijavio, koji kurs mu je otključan, promena uloge i privremena suspenzija. Dok to ne bude gotovo, mere prema nalogu radiš na stranici Chat sigurnost.",
        "This will list accounts: when they signed up, which course they unlocked, role changes and temporary suspension. Until then, account actions live on the Chat safety page.",
      )}
    />
  );
}

export function AdminGrowthPanel({ locale }: { locale: Locale }) {
  return (
    <AdminModulePlaceholder
      locale={locale}
      icon={Megaphone}
      title={t(locale, "Rast", "Growth")}
      emptyTitle={t(locale, "U pripremi", "Coming soon")}
      emptyBody={t(
        locale,
        "Ovde će biti evidencija partnera i influensera, njihovi linkovi i koliko su prijava doneli, plus povezivanje Meta i Google Ads naloga. Ništa se neće prikazati dok pravi podaci ne budu povezani - brojevi koje izmislimo ne vrede ništa.",
        "This will hold affiliate and influencer records, their links and how many sign-ups they brought, plus Meta and Google Ads account connections. Nothing shows until real data is connected - invented numbers are worthless.",
      )}
    />
  );
}

export function AdminAnalyticsPanel({ locale }: { locale: Locale }) {
  return (
    <AdminModulePlaceholder
      locale={locale}
      icon={BarChart3}
      title={t(locale, "Analitika", "Analytics")}
      emptyTitle={t(locale, "U pripremi", "Coming soon")}
      emptyBody={t(
        locale,
        "Ovde će biti posete, izvori saobraćaja i koliko posetilaca postane student, iz povezanog Google Analytics naloga. Broj studenata i stanje sadržaja već sada vidiš na vrhu stranice Sadržaj.",
        "This will show visits, traffic sources and how many visitors become students, from a connected Google Analytics account. Student and content counts are already at the top of the Content page.",
      )}
    />
  );
}

type StatusTally = { total: number; draft: number; published: number; archived: number };

function StatCard({
  icon: Icon,
  label,
  value,
  tally,
  hint,
  locale,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tally?: StatusTally;
  hint?: string;
  locale: Locale;
}) {
  return (
    <article className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-12)]">
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">{label}</p>
      </div>
      <p className="mt-3 font-display text-5xl leading-none text-ink">{value}</p>
      {tally ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="neutral" size="sm">{t(locale, "Objavljeno", "Published")} {tally.published}</Badge>
          <Badge tone={tally.draft > 0 ? "ink" : "muted"} size="sm">{t(locale, "Nacrt", "Draft")} {tally.draft}</Badge>
          {tally.archived > 0 ? <Badge tone="muted" size="sm">{t(locale, "Arhiva", "Archive")} {tally.archived}</Badge> : null}
        </div>
      ) : null}
      {hint ? <p className="mt-3 text-[11px] font-bold leading-4 text-muted">{hint}</p> : null}
    </article>
  );
}

type NavRow = { id: string; title: string; status: ContentStatus; meta?: string };

function NavSection({
  locale,
  level,
  activeLevel,
  kicker,
  subtitle,
  rows,
  selectedId,
  lockedLabel,
  emptyLabel,
  createLabel,
  creating,
  onSelect,
  onClear,
  onCreate,
}: {
  locale: Locale;
  level: ListLevel;
  activeLevel: ListLevel;
  kicker: string;
  subtitle?: string;
  rows: NavRow[];
  selectedId: string;
  /** Postavljeno kad roditelj nije izabran: lista ne postoji, ali sekcija ostaje vidljiva sa uputstvom. */
  lockedLabel?: string;
  emptyLabel: string;
  createLabel: string;
  creating: boolean;
  onSelect: (id: string) => void;
  onClear?: () => void;
  onCreate: () => void;
}) {
  return (
    // Na mobilnom se vidi tačno jedan nivo (koraci sa "Nazad"); od `lg` naviše sva tri stoje jedan ispod drugog.
    <section className={cn("min-w-0", activeLevel !== level && "hidden lg:block")} aria-label={kicker}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">{kicker}</p>
          {subtitle ? <p className="mt-0.5 truncate text-xs font-bold text-ink">{subtitle}</p> : null}
        </div>
        {onClear ? (
          <Button variant="ghost" size="sm" onClick={onClear} className="-mr-2 shrink-0">
            {t(locale, "Poništi izbor", "Clear")}
          </Button>
        ) : null}
      </div>

      <div className="mt-2.5">
        {lockedLabel ? (
          <p className="surface-inset border-2 border-dashed border-line bg-paper px-3 py-3 text-xs font-bold leading-5 text-muted">{lockedLabel}</p>
        ) : rows.length === 0 ? (
          <p className="surface-inset border-2 border-dashed border-line bg-paper px-3 py-3 text-xs font-bold leading-5 text-muted">{emptyLabel}</p>
        ) : (
          <ul className="grid max-h-96 gap-2 overflow-y-auto pr-1 lg:max-h-none lg:overflow-visible lg:pr-0">
            {rows.map((row) => {
              const selected = row.id === selectedId;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(row.id)}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "surface-inset flex w-full items-center gap-2 border-2 px-3 py-2.5 text-left transition",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                      // Nacrt nosi i šrafuru i najglasniji Badge - to je stavka koju studenti ne vide.
                      row.status === "draft" && "ink-hatch",
                      selected
                        ? "border-ink bg-yellow shadow-[3px_3px_0_0_var(--shadow-hard)]"
                        : "border-line bg-paper-strong hover:border-ink",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-ink">{row.title}</span>
                      {row.meta ? (
                        <span className={cn("mt-0.5 block text-[11px] font-bold", selected ? "text-ink" : "text-muted")}>{row.meta}</span>
                      ) : null}
                    </span>
                    <Badge tone={statusTone[row.status]} size="sm" className="shrink-0">{statusLabel(row.status, locale)}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        icon={<CirclePlus className="size-4" />}
        disabled={Boolean(lockedLabel)}
        loading={creating}
        onClick={onCreate}
        className="mt-2.5 w-full"
      >
        {createLabel}
      </Button>
    </section>
  );
}

export function AdminContentPanel({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hierarchy = useQuery(api.contentHierarchy.getAdminHierarchy) as TrackRow[] | undefined;
  const overview = useQuery(api.adminOverview.getAdminOverview);
  const upsertTrack = useMutation(api.contentHierarchy.upsertTrack);
  const upsertCourse = useMutation(api.courses.upsertCourse);
  const upsertLesson = useMutation(api.contentHierarchy.upsertDirectLesson);
  const createDraftEntity = useMutation(api.contentHierarchy.createDraftEntity);
  const [trackId, setTrackId] = useState(() => searchParams.get("track") ?? "");
  const [courseId, setCourseId] = useState(() => searchParams.get("course") ?? "");
  const [lessonId, setLessonId] = useState(() => searchParams.get("lesson") ?? "");
  const [listLevel, setListLevel] = useState<ListLevel>(() =>
    listLevelForSelection({
      trackId: searchParams.get("track") ?? "",
      courseId: searchParams.get("course") ?? "",
      lessonId: searchParams.get("lesson") ?? "",
    }),
  );
  const lessonView = searchParams.get("view") === "pro" ? "pro" : "light";
  const [creating, setCreating] = useState<"track" | "course" | "lesson" | null>(null);
  const [creationPending, setCreationPending] = useState<SelectionLevel | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function pushSelection(next: { trackId: string; courseId: string; lessonId: string }) {
    setTrackId(next.trackId);
    setCourseId(next.courseId);
    setLessonId(next.lessonId);
    const params = new URLSearchParams(searchParams.toString());
    if (next.trackId) params.set("track", next.trackId); else params.delete("track");
    if (next.courseId) params.set("course", next.courseId); else params.delete("course");
    if (next.lessonId) params.set("lesson", next.lessonId); else params.delete("lesson");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function select(level: SelectionLevel, id: string) {
    const next = changeContentSelection({ trackId, courseId, lessonId }, level, id);
    setListLevel(listLevelAfterChange(next, level));
    setCreating(null);
    setSettingsOpen(false);
    pushSelection(next);
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

  async function createTemplate(kind: SelectionLevel, parents: { trackId?: string; courseId?: string } = {}) {
    if (creationPending) return;
    setCreationPending(kind);
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
      setListLevel(listForKind[kind]);
      pushSelection(next);
      setMessage({ tone: "success", text: kind === "track" ? t(locale, "Prazan smer je napravljen. Sada mu upiši naziv desno.", "An empty track is ready. Give it a name on the right.") : kind === "course" ? t(locale, "Prazan kurs je dodat u izabrani smer.", "An empty course was added to the selected track.") : t(locale, "Prazna lekcija je dodata na dno kursa.", "An empty lesson was added at the end of the course.") });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t(locale, "Pravljenje nije uspelo. Pokušaj ponovo.", "Could not create it. Try again.") });
    } finally {
      setCreationPending(null);
    }
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
        if (!selectedTrack) throw new Error(t(locale, "Prvo izaberi smer.", "Pick a track first."));
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
        if (!selectedCourse) throw new Error(t(locale, "Prvo izaberi kurs.", "Pick a course first."));
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
      setMessage({ tone: "success", text: t(locale, "Sačuvano. Prikaz desno već pokazuje novu verziju.", "Saved. The preview on the right already shows the new version.") });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t(locale, "Čuvanje nije uspelo. Ništa nije izgubljeno - pokušaj ponovo.", "Saving failed. Nothing was lost - try again.") });
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

  const trackRows: NavRow[] = hierarchy.map((track) => {
    const drafts = draftCount(track.courses);
    return {
      id: track._id,
      title: titleOf(track, locale),
      status: contentStatus(track),
      meta: `${t(locale, "Kurseva", "Courses")}: ${track.courses.length}${drafts ? ` · ${t(locale, "Nacrt", "Draft")}: ${drafts}` : ""}`,
    };
  });
  const courseRows: NavRow[] = (selectedTrack?.courses ?? []).map((course) => {
    const drafts = draftCount(course.lessons);
    return {
      id: course._id,
      title: titleOf(course, locale),
      status: contentStatus(course),
      meta: `${t(locale, "Lekcija", "Lessons")}: ${course.lessons.length}${drafts ? ` · ${t(locale, "Nacrt", "Draft")}: ${drafts}` : ""}`,
    };
  });
  const lessonRows: NavRow[] = (selectedCourse?.lessons ?? []).map((lesson) => ({
    id: lesson._id,
    title: titleOf(lesson, locale),
    status: contentStatus(lesson),
    meta: `${Math.max(1, Math.round(lesson.durationSeconds / 60))} min`,
  }));

  const backLevel = parentListLevel(listLevel);
  const hasSurface = Boolean(trackSurface || courseSurface || lessonSurface);

  return (
    <AdminPageFrame locale={locale} title={t(locale, "Sadržaj", "Content")}>
      <section aria-labelledby="admin-platform-state" className="space-y-3">
        <h2 id="admin-platform-state" className="text-xs font-black uppercase tracking-[0.12em] text-muted">
          {t(locale, "Stanje platforme", "Platform state")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard locale={locale} icon={Layers} label={t(locale, "Smerovi", "Tracks")} value={overview ? String(overview.tracks.total) : "—"} tally={overview?.tracks} />
          <StatCard locale={locale} icon={BookOpen} label={t(locale, "Kursevi", "Courses")} value={overview ? String(overview.courses.total) : "—"} tally={overview?.courses} />
          <StatCard locale={locale} icon={ListTree} label={t(locale, "Lekcije", "Lessons")} value={overview ? String(overview.lessons.total) : "—"} tally={overview?.lessons} />
          <StatCard
            locale={locale}
            icon={GraduationCap}
            label={t(locale, "Studenti", "Students")}
            value={overview ? `${overview.students.count}${overview.students.capped ? "+" : ""}` : "—"}
            hint={t(locale, "Nalozi koji uče: studenti i pro studenti. Admini i moderatori se ne broje.", "Learner accounts: students and pro students. Admins and moderators are not counted.")}
          />
        </div>
      </section>

      {message ? (
        <p role="status" className={cn("surface-inset border-2 px-3 py-2 text-xs font-black", message.tone === "success" ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-red-700 bg-red-50 text-red-800")}>{message.text}</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        {/* Od `lg` naviše navigator prati skrol dugačkog pregleda desno; visina je ograničena
            na ekran da se donji nivo ne odseče, pa cela ploča skroluje kao jedna celina. */}
        <aside
          aria-label={t(locale, "Hijerarhija sadržaja", "Content hierarchy")}
          data-motion="card"
          className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_0_var(--shadow-hard-13)] lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
        >
          {backLevel ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft className="size-4" />}
              onClick={() => setListLevel(backLevel)}
              className="-ml-2 mb-3 lg:hidden"
            >
              {backLevel === "tracks" ? t(locale, "Nazad na smerove", "Back to tracks") : t(locale, "Nazad na kurseve", "Back to courses")}
            </Button>
          ) : null}

          <div className="grid gap-4 lg:divide-y lg:divide-line">
            <NavSection
              locale={locale}
              level="tracks"
              activeLevel={listLevel}
              kicker={t(locale, "1. Smerovi", "1. Tracks")}
              rows={trackRows}
              selectedId={trackId}
              emptyLabel={t(locale, "Još nema nijednog smera. Napravi prvi - dobićeš prazan nacrt koji studenti ne vide dok ga ne objaviš.", "No tracks yet. Create the first one - you get an empty draft students cannot see until you publish it.")}
              createLabel={t(locale, "Novi smer", "New track")}
              creating={creationPending === "track"}
              onSelect={(id) => select("track", id)}
              onClear={trackId ? () => select("track", "") : undefined}
              onCreate={() => void createTemplate("track")}
            />

            <NavSection
              locale={locale}
              level="courses"
              activeLevel={listLevel}
              kicker={t(locale, "2. Kursevi", "2. Courses")}
              subtitle={selectedTrack ? titleOf(selectedTrack, locale) : undefined}
              rows={courseRows}
              selectedId={courseId}
              lockedLabel={selectedTrack ? undefined : t(locale, "Prvo izaberi smer iznad. Kursevi uvek pripadaju jednom smeru.", "Pick a track above first. A course always belongs to one track.")}
              emptyLabel={t(locale, "Ovaj smer još nema kurseve.", "This track has no courses yet.")}
              createLabel={t(locale, "Novi kurs", "New course")}
              creating={creationPending === "course"}
              onSelect={(id) => select("course", id)}
              onClear={courseId ? () => select("course", "") : undefined}
              onCreate={() => { if (selectedTrack) void createTemplate("course", { trackId: selectedTrack._id }); }}
            />

            <NavSection
              locale={locale}
              level="lessons"
              activeLevel={listLevel}
              kicker={t(locale, "3. Lekcije", "3. Lessons")}
              subtitle={selectedCourse ? titleOf(selectedCourse, locale) : undefined}
              rows={lessonRows}
              selectedId={lessonId}
              lockedLabel={selectedCourse ? undefined : t(locale, "Prvo izaberi kurs iznad. Nova lekcija ide na dno tog kursa.", "Pick a course above first. A new lesson goes to the end of that course.")}
              emptyLabel={t(locale, "Ovaj kurs još nema lekcije.", "This course has no lessons yet.")}
              createLabel={selectedCourse ? t(locale, "Nova lekcija u ovom kursu", "New lesson in this course") : t(locale, "Nova lekcija", "New lesson")}
              creating={creationPending === "lesson"}
              onSelect={(id) => select("lesson", id)}
              onClear={lessonId ? () => select("lesson", "") : undefined}
              onCreate={() => { if (selectedTrack && selectedCourse) void createTemplate("lesson", { trackId: selectedTrack._id, courseId: selectedCourse._id }); }}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {readiness ? <section className="surface-card border-2 border-ink bg-paper-strong p-4 shadow-[6px_6px_0_var(--shadow-hard-12)]" aria-label={t(locale, "Spremno za objavu", "Ready to publish")}>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-muted">{t(locale, "Kontrola sadržaja", "Content check")}</p><h2 className="mt-1 font-display text-3xl text-ink">{readiness.ready ? t(locale, "Spremno za objavu", "Ready to publish") : t(locale, "Dovrši pre objave", "Finish before publishing")}</h2></div><span className={cn("rounded-full border-2 border-ink px-4 py-2 text-xs font-black uppercase", readiness.ready ? "bg-emerald-100 text-emerald-900" : "bg-yellow text-ink")}>{readiness.items.filter((item) => item.ok).length}/{readiness.items.length}</span></div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{readiness.items.map((entry) => <button key={entry.key} type="button" onClick={() => { if (entry.key === "slug" || entry.key === "view" || entry.key === "duration") setSettingsOpen(true); document.getElementById("admin-live-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className={cn("surface-card flex min-h-12 items-center gap-3 border-2 px-3 py-2 text-left text-xs font-black", entry.ok ? "border-emerald-700 bg-emerald-50 text-emerald-900" : entry.blocking ? "border-red-700 bg-red-50 text-red-900" : "border-amber-700 bg-amber-50 text-amber-950")}>{entry.ok ? <CheckCircle2 className="size-5 shrink-0" /> : entry.blocking ? <XCircle className="size-5 shrink-0" /> : <AlertTriangle className="size-5 shrink-0" />}<span>{t(locale, entry.labelSr, entry.labelEn)}</span></button>)}</div>
          </section> : null}

          {hasSurface ? (
            <section id="admin-live-preview" className="surface-card relative scroll-mt-6 overflow-hidden border-2 border-ink bg-paper shadow-[8px_8px_0_var(--shadow-hard-13)]">
              <div className="absolute right-3 top-3 z-40">
                <button type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong/95 px-4 text-xs font-black shadow-[3px_3px_0_var(--shadow-hard)] backdrop-blur"><Settings2 className="size-4" /> {t(locale, "Podešavanja", "Settings")}</button>
                {settingsOpen ? (
                  <form onSubmit={save} className="surface-card mt-2 grid w-[min(320px,calc(100vw-3rem))] gap-3 border-2 border-ink bg-paper-strong p-4 shadow-[7px_7px_0_var(--shadow-hard)]">
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-muted">{t(locale, "Sistemska podešavanja", "System settings")}</p>
                    <Field label={t(locale, "URL / SEO naziv", "URL / SEO name")}><input className={inputClass} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder={slugify(titleSr || titleEn) || "automatski-iz-naslova"} /></Field>
                    <Field label={t(locale, "Status", "Status")}><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as Status)}><option value="draft">{t(locale, "Nacrt", "Draft")}</option><option value="published">{t(locale, "Objavljeno", "Published")}</option>{activeKind !== "lesson" ? <option value="archived">{t(locale, "Arhivirano", "Archived")}</option> : null}</select></Field>
                    {activeKind === "lesson" ? <><Field label={t(locale, "Trajanje (min)", "Duration (min)")}><input type="number" min={1} className={inputClass} value={durationMinutes} onChange={(event) => setDurationMinutes(Math.max(1, Number(event.target.value)))} /></Field><label className="flex items-center gap-2 text-xs font-black"><input type="checkbox" checked={proEnabled} onChange={(event) => setProEnabled(event.target.checked)} /> {t(locale, "Pro prikaz", "Pro view")}</label><label className="flex items-center gap-2 text-xs font-black"><input type="checkbox" checked={lightEnabled} onChange={(event) => setLightEnabled(event.target.checked)} /> {t(locale, "Light prikaz", "Light view")}</label></> : null}
                    <Button type="submit" loading={pending} icon={<Save className="size-4" />} size="sm">{t(locale, "Sačuvaj podešavanja", "Save settings")}</Button>
                  </form>
                ) : null}
              </div>
              <div className="p-4 sm:p-6">
                {lessonSurface && lessonCourseSurface ? <CoursePlayer course={lessonCourseSurface} lesson={lessonSurface} locale={locale} courseId={selectedCourse?._id} lessonId={selectedLesson?._id} isAdmin inlineLocale={locale} inlinePreview initialView={lessonView} onViewChange={setLessonView} /> : null}
                {!lessonSurface && courseSurface ? <DashboardContent locale={locale} course={courseSurface} isAdmin inlineLocale={locale} inlinePreview /> : null}
                {!lessonSurface && !courseSurface && trackSurface ? <TrackExperience data={trackSurface} locale={locale} inlineLocale={locale} admin profileName="admin" /> : null}
              </div>
            </section>
          ) : (
            <EmptyState
              icon={ListTree}
              title={t(locale, "Izaberi šta uređuješ", "Pick what to edit")}
              body={t(
                locale,
                "Klikni na smer u listi levo. Zatim na kurs u njemu, pa na lekciju. Ovde se otvara tačno ono što student vidi - i menjaš ga klikom na sam tekst.",
                "Click a track in the list on the left. Then a course inside it, then a lesson. What a student sees opens here - and you edit it by clicking the text itself.",
              )}
              action={hierarchy.length === 0 ? (
                <Button loading={creationPending === "track"} icon={<CirclePlus className="size-4" />} onClick={() => void createTemplate("track")}>
                  {t(locale, "Napravi prvi smer", "Create the first track")}
                </Button>
              ) : undefined}
            />
          )}
        </div>
      </div>
    </AdminPageFrame>
  );
}
