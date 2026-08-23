"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppComposerSheet } from "@/components/app/app-composer-sheet";
import RichTextEditor from "@/components/app/rich-text-editor";
import { cn } from "@/components/ui/primitives";
import { coursePath, lessonEditPath } from "@/lib/app-routes";
import { t, type Locale } from "@/lib/i18n";

import { useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  AlertTriangle,
  ChevronDown,
  Check,
  CreditCard,
  ExternalLink,
  FileText,
  FileUp,
  Film,
  GripVertical,
  ImageIcon,
  Layers,
  LayoutDashboard,
  ListPlus,
  Loader2,
  Pencil,
  PlayCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, DragEvent as ReactDragEvent, FormEvent, ReactNode } from "react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { plainTextToRichText, richTextHasContent } from "@/lib/rich-text";

type ButtonTone = "inline" | "compact";
type CourseStatus = "draft" | "published" | "archived";
type LessonPartKind = "text" | "image" | "video" | "file";
type AssetKind = "pdf" | "prompt" | "worksheet" | "project";
type UploadedFilePayload = {
  storageId?: Id<"_storage">;
  fileName?: string;
  byteSize?: number;
  mimeType?: string;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function statusLabel(locale: Locale, status: CourseStatus) {
  if (status === "published") return t(locale, "Objavljeno", "Published");
  if (status === "archived") return t(locale, "Arhivirano", "Archived");
  return t(locale, "Nacrt", "Draft");
}

function hasVideoCandidateDrag(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) return false;

  const items = Array.from(dataTransfer.items ?? []);
  if (items.length > 0) {
    return items.some((item) => item.kind === "file" && (!item.type || item.type.startsWith("video/")));
  }

  const types = Array.from(dataTransfer.types ?? []);
  return types.includes("Files") || (dataTransfer.files?.length ?? 0) > 0;
}

function hasFileCandidateDrag(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) return false;
  const items = Array.from(dataTransfer.items ?? []);
  if (items.some((item) => item.kind === "file")) return true;
  const types = Array.from(dataTransfer.types ?? []);
  return types.includes("Files") || (dataTransfer.files?.length ?? 0) > 0;
}

function isVideoFile(file: File | null | undefined): file is File {
  return Boolean(file && file.type.startsWith("video/"));
}

function hasImageCandidateDrag(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) return false;
  const items = Array.from(dataTransfer.items ?? []);
  if (items.length > 0) return items.some((item) => item.kind === "file" && (!item.type || item.type.startsWith("image/")));
  return hasFileCandidateDrag(dataTransfer);
}

function isImageFile(file: File | null | undefined): file is File {
  return Boolean(file && file.type.startsWith("image/"));
}

function sameIds<T extends string>(left: T[], right: T[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function moveIdAroundTarget<T extends string>(ids: T[], sourceId: T, targetId: T) {
  if (sourceId === targetId) return ids;
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return ids;

  const next = ids.slice();
  const [moved] = next.splice(sourceIndex, 1);
  const nextTargetIndex = next.indexOf(targetId);
  next.splice(sourceIndex < targetIndex ? nextTargetIndex + 1 : nextTargetIndex, 0, moved);
  return next;
}

function AdminActionButton({
  children,
  onClick,
  tone = "inline",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-paper-strong text-sm font-extrabold text-ink shadow-[3px_3px_0_0_var(--shadow-hard-16)] transition hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50",
        tone === "inline" && "min-h-10 px-3",
        tone === "compact" && "min-h-8 px-2 text-xs",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

function AdminIconButton({
  children,
  onClick,
  label,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1, rotate: -1 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard-14)] transition hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </motion.button>
  );
}

const AdminComposerSheet = AppComposerSheet;

function FormSection({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <section className="composer-stagger rounded-[16px] border-2 border-ink bg-paper-strong p-4 shadow-[5px_5px_0_0_var(--shadow-hard-12)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-yellow text-ink">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-black text-ink">{title}</h3>
          {body ? <p className="mt-1 text-sm font-bold leading-6 text-muted">{body}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-ink">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs font-bold leading-5 text-muted">{hint}</span> : null}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function LocalizedPairSwitch({ locale, onChange, sr, en }: { locale: Locale; onChange: (locale: Locale) => void; sr: string; en: string }) {
  const missingSr = Boolean(en.trim() && !sr.trim());
  const missingEn = Boolean(sr.trim() && !en.trim());
  return (
    <div className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-paper p-1" role="group" aria-label="Jezik polja">
      {(["sr", "en"] as const).map((item) => {
        const warning = item === "sr" ? missingSr : missingEn;
        return <button key={item} type="button" onClick={() => onChange(item)} className={cn("inline-flex min-h-7 items-center gap-1 rounded-full border px-3 text-[11px] font-black uppercase", locale === item ? "border-ink bg-ink text-paper-strong" : "border-transparent text-muted", warning && "border-amber-600 bg-amber-100 text-amber-950 ring-2 ring-amber-400/40")}>{warning ? <AlertTriangle className="size-3" /> : null}{item}</button>;
      })}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-[8px] border-2 border-ink bg-paper-strong px-3 text-sm font-bold text-ink outline-none transition placeholder:text-muted/70 focus:border-yellow focus:ring-4 focus:ring-yellow/25";
const textareaClass =
  "w-full resize-none rounded-[8px] border-2 border-ink bg-paper-strong p-3 text-sm font-bold leading-6 text-ink outline-none transition placeholder:text-muted/70 focus:border-yellow focus:ring-4 focus:ring-yellow/25";

function SlugField({
  label,
  value,
  onChange,
  placeholder,
  locale,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  locale: Locale;
}) {
  return (
    <Field
      label={label}
      hint={t(
        locale,
        "URL identifikator. Ako ostane prazno, generise se iz naziva.",
        "URL identifier. Leave empty to generate it from the title.",
      )}
    >
      <div className="flex overflow-hidden rounded-[8px] border-2 border-ink bg-paper-strong focus-within:border-yellow focus-within:ring-4 focus-within:ring-yellow/25">
        <span className="flex min-h-11 items-center border-r-2 border-line bg-paper px-3 text-xs font-black text-muted">
          /
        </span>
        <input
          className="h-11 min-w-0 flex-1 bg-paper-strong px-3 text-sm font-bold text-ink outline-none"
          value={value}
          onChange={(event) => onChange(slugify(event.target.value))}
          placeholder={placeholder}
        />
      </div>
    </Field>
  );
}

function CourseStatusControl({
  locale,
  value,
  onChange,
}: {
  locale: Locale;
  value: CourseStatus;
  onChange: (status: CourseStatus) => void;
}) {
  const options: Array<{ value: CourseStatus; label: string; body: string }> = [
    {
      value: "draft",
      label: t(locale, "Nacrt", "Draft"),
      body: t(locale, "Vidljivo adminu", "Admin visible"),
    },
    {
      value: "published",
      label: t(locale, "Objavljeno", "Published"),
      body: t(locale, "Vidljivo korisnicima", "Visible to users"),
    },
    {
      value: "archived",
      label: t(locale, "Arhiva", "Archive"),
      body: t(locale, "Sklonjeno iz toka", "Removed from flow"),
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <motion.button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "rounded-[8px] border-2 p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              active ? "border-ink bg-yellow text-ink" : "border-line bg-paper text-muted hover:border-ink hover:bg-paper-strong",
            )}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-black">
              {option.label}
              {active ? <Check className="size-4" /> : null}
            </span>
            <span className="mt-1 block text-xs font-bold">{option.body}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

function PublishToggle({
  locale,
  checked,
  onChange,
}: {
  locale: Locale;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-[8px] border-2 border-ink p-3 text-left transition",
        checked ? "bg-yellow text-ink" : "bg-paper text-muted",
      )}
    >
      <span>
        <span className="block text-sm font-black">{t(locale, "Objavi odmah", "Publish now")}</span>
        <span className="mt-1 block text-xs font-bold">
          {checked
            ? t(locale, "Korisnici mogu da vide ovaj sadrzaj.", "Users can see this content.")
            : t(locale, "Sacuvano kao radna verzija.", "Saved as a draft.")}
        </span>
      </span>
      <span
        className={cn(
          "relative h-7 w-12 rounded-full border-2 border-ink bg-paper-strong transition",
          checked && "bg-ink",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-yellow transition",
            checked ? "left-6" : "left-1 bg-line",
          )}
        />
      </span>
    </button>
  );
}

function KindControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; body?: string }>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <motion.button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "rounded-[8px] border-2 p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              active ? "border-ink bg-yellow text-ink" : "border-line bg-paper text-muted hover:border-ink hover:bg-paper-strong",
            )}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-black">
              {option.label}
              {active ? <Check className="size-4" /> : null}
            </span>
            {option.body ? <span className="mt-1 block text-xs font-bold">{option.body}</span> : null}
          </motion.button>
        );
      })}
    </div>
  );
}

function FileDropzone({
  locale,
  label,
  accept,
  file,
  onFileChange,
  required,
  currentFile,
}: {
  locale: Locale;
  label: string;
  accept?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  required?: boolean;
  currentFile?: string;
}) {
  const id = useId();

  return (
    <div>
      <span className="text-sm font-black text-ink">{label}</span>
      {currentFile ? (
        <p className="mt-2 rounded-[8px] border-2 border-line bg-paper px-3 py-2 text-xs font-black text-muted">
          {t(locale, "Trenutni fajl", "Current file")}: {currentFile}
        </p>
      ) : null}
      <label
        htmlFor={id}
        className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed border-ink bg-paper-strong p-4 text-center transition hover:bg-yellow/25"
      >
        <UploadCloud className="size-8 text-ink" />
        <span className="mt-3 text-sm font-black text-ink">
          {file?.name ?? t(locale, "Izaberi ili prevuci fajl", "Choose or drop a file")}
        </span>
        <span className="mt-1 text-xs font-bold text-muted">
          {file
            ? `${Math.max(1, Math.round(file.size / 1024))} KB`
            : t(locale, "Upload se cuva kroz Convex storage.", "Upload is saved through Convex storage.")}
        </span>
      </label>
      <input
        id={id}
        className="sr-only"
        type="file"
        accept={accept}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onFileChange(event.target.files?.[0] ?? null)}
        required={required}
      />
    </div>
  );
}

function EntityPreview({
  locale,
  title,
  subtitle,
  status,
  meta,
  emptyLabel,
}: {
  locale: Locale;
  title?: string;
  subtitle?: string;
  status?: string;
  meta?: string;
  emptyLabel: string;
}) {
  return (
    <aside className="composer-stagger h-fit rounded-[16px] border-2 border-ink bg-ink p-4 text-paper-strong shadow-[5px_5px_0_0_var(--yellow)]">
      <p className="text-xs font-black uppercase text-paper-strong/65">{t(locale, "Pregled", "Preview")}</p>
      <p className="mt-3 text-2xl font-black leading-tight">{title?.trim() || emptyLabel}</p>
      {subtitle ? <p className="mt-3 text-sm font-bold leading-6 text-paper-strong/75">{subtitle}</p> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {status ? (
          <span className="rounded-full border-2 border-paper-strong bg-yellow px-3 py-1 text-xs font-black text-ink">
            {status}
          </span>
        ) : null}
        {meta ? (
          <span className="rounded-full border-2 border-paper-strong/35 px-3 py-1 text-xs font-black text-paper-strong">
            {meta}
          </span>
        ) : null}
      </div>
    </aside>
  );
}

function ComposerFooter({
  pending,
  submitLabel,
  message,
  icon = <Plus className="size-4" />,
}: {
  pending: boolean;
  submitLabel: string;
  message: string | null;
  icon?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-5 border-t-2 border-ink bg-paper/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {message ? (
          <p className="rounded-[8px] border-2 border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-700">
            {message}
          </p>
        ) : (
          <p className="text-xs font-bold text-muted">Spremno za cuvanje.</p>
        )}
        <motion.button
          type="submit"
          disabled={pending}
          whileHover={pending ? undefined : { y: -1 }}
          whileTap={pending ? undefined : { scale: 0.98 }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-5 text-sm font-extrabold text-ink shadow-[4px_4px_0_0_var(--ink)] transition disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : icon}
          {submitLabel}
        </motion.button>
      </div>
    </div>
  );
}

type CourseActionInitial = {
  slug: string;
  title: { sr: string; en: string };
  subtitle: { sr: string; en: string };
  description: { sr: string; en: string };
  descriptionRich?: { sr: string; en: string };
  status: CourseStatus;
  stripePriceId?: string;
  videoUrl?: string | null;
  videoFileName?: string;
  videoByteSize?: number;
  videoMimeType?: string;
  videoUpdatedAt?: number;
  sortOrder: number;
};

type CourseEditorLesson = {
  _id: Id<"lessons">;
  slug: string;
  titleSr: string;
  titleEn: string;
  summarySr: string;
  summaryEn: string;
  durationSeconds: number;
  isPublished: boolean;
  sortOrder: number;
};

type CourseEditorModule = {
  _id: Id<"modules">;
  titleSr: string;
  titleEn: string;
  descriptionSr?: string;
  descriptionEn?: string;
  imageUrl?: string | null;
  sortOrder: number;
  lessons: CourseEditorLesson[];
};

type CourseEditorData = {
  course: {
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
    status: CourseStatus;
    stripePriceId?: string;
    videoUrl?: string | null;
    videoFileName?: string;
    videoByteSize?: number;
    videoMimeType?: string;
    videoUpdatedAt?: number;
    sortOrder: number;
  };
  modules: CourseEditorModule[];
} | null;

type PendingCourseAction =
  | { type: "close" }
  | { type: "module"; moduleId: string }
  | { type: "lesson"; lessonSlug: string }
  | null;

type PlaybackTokenPayload = Record<string, string>;
type PlaybackTokenState = {
  playbackId: string;
  status: "ready" | "error";
  tokens: PlaybackTokenPayload | null;
};



function formatMinutes(durationSeconds: number) {
  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

function CourseIntroPreview({
  title,
  videoUrl,
  localPreviewUrl,
  locale,
}: {
  title: string;
  videoUrl?: string | null;
  localPreviewUrl?: string | null;
  locale: Locale;
}) {
  const activeUrl = localPreviewUrl || videoUrl;

  if (activeUrl) {
    return <video className="aspect-video w-full rounded-[8px] bg-scrim object-contain" src={activeUrl} controls preload="metadata" />;
  }

  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-[8px] border-2 border-dashed border-ink bg-paper p-5 text-center">
      <div>
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full border-2 border-ink bg-yellow text-ink">
          <Film className="size-6" />
        </span>
        <p className="mt-3 text-sm font-black text-ink">
          {t(locale, "Intro video preview", "Intro video preview")}
        </p>
      </div>
    </div>
  );
}

export function AddCourseAction({
  locale,
  courseId,
  initial,
  nextSortOrder,
  iconOnly = false,
  buttonLabel,
}: {
  locale: Locale;
  courseId?: string;
  initial?: CourseActionInitial;
  nextSortOrder: number;
  iconOnly?: boolean;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const upsertCourse = useMutation(api.courses.upsertCourse);
  const reorderModules = useMutation(api.courses.reorderModules);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoDragDepthRef = useRef(0);
  const [open, setOpen] = useState(false);
  const courseEditorData = useQuery(
    api.courses.getCourseEditorData,
    open && courseId ? { courseId: courseId as Id<"courses"> } : "skip",
  ) as CourseEditorData | undefined;
  const [titleSr, setTitleSr] = useState(initial?.title.sr ?? "");
  const [titleEn, setTitleEn] = useState(initial?.title.en ?? "");
  const [contentLocale, setContentLocale] = useState<Locale>(locale);
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [subtitleSr, setSubtitleSr] = useState(initial?.subtitle.sr ?? "");
  const [subtitleEn, setSubtitleEn] = useState(initial?.subtitle.en ?? "");
  const [descriptionSr, setDescriptionSr] = useState(initial?.description.sr ?? "");
  const [descriptionEn, setDescriptionEn] = useState(initial?.description.en ?? "");
  const [descriptionRichSr, setDescriptionRichSr] = useState(initial?.descriptionRich?.sr || plainTextToRichText(initial?.description.sr ?? ""));
  const [descriptionRichEn, setDescriptionRichEn] = useState(initial?.descriptionRich?.en || plainTextToRichText(initial?.description.en ?? ""));
  const [status, setStatus] = useState<CourseStatus>(initial?.status ?? "draft");
  const [stripePriceId, setStripePriceId] = useState(initial?.stripePriceId ?? "");
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? nextSortOrder);
  const [localVideoPreviewUrl, setLocalVideoPreviewUrl] = useState<string | null>(null);
  const [videoMessage, setVideoMessage] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoDeleting, setVideoDeleting] = useState(false);
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const [moduleOrder, setModuleOrder] = useState<Array<Id<"modules">>>([]);
  const [draggingModuleId, setDraggingModuleId] = useState<Id<"modules"> | null>(null);
  const [dropTargetModuleId, setDropTargetModuleId] = useState<Id<"modules"> | null>(null);
  const [reorderPending, setReorderPending] = useState(false);
  const [videoDragging, setVideoDragging] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingCourseAction>(null);
  const [baseSnapshot, setBaseSnapshot] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const hydratedCourseRef = useRef<string | null>(null);
  const isEditing = Boolean(courseId);
  const actionLabel =
    buttonLabel ?? (isEditing ? t(locale, "Izmeni kurs", "Edit course") : t(locale, "Dodaj kurs", "Add course"));
  const currentSlug = slug || slugify(titleSr || titleEn);
  const currentSnapshot = JSON.stringify({
    titleSr,
    titleEn,
    slug,
    subtitleSr,
    subtitleEn,
    descriptionSr,
    descriptionEn,
    descriptionRichSr,
    descriptionRichEn,
    status,
    stripePriceId,
    sortOrder,
  });
  const isDirty = Boolean(baseSnapshot && currentSnapshot !== baseSnapshot);
  const liveCourse = courseEditorData?.course;
  const videoUrl = liveCourse?.videoUrl ?? initial?.videoUrl;
  const loadedModules = (courseEditorData?.modules ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const modules = moduleOrder.length
    ? loadedModules
      .slice()
      .sort((a, b) => {
        const aIndex = moduleOrder.indexOf(a._id);
        const bIndex = moduleOrder.indexOf(b._id);
        if (aIndex === -1 && bIndex === -1) return a.sortOrder - b.sortOrder;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      })
    : loadedModules;
  const totalLessons = modules.reduce((total, module) => total + module.lessons.length, 0);

  function snapshotFromInitial() {
    return JSON.stringify({
      titleSr: initial?.title.sr ?? "",
      titleEn: initial?.title.en ?? "",
      slug: initial?.slug ?? "",
      subtitleSr: initial?.subtitle.sr ?? "",
      subtitleEn: initial?.subtitle.en ?? "",
      descriptionSr: initial?.description.sr ?? "",
      descriptionEn: initial?.description.en ?? "",
      descriptionRichSr: initial?.descriptionRich?.sr || plainTextToRichText(initial?.description.sr ?? ""),
      descriptionRichEn: initial?.descriptionRich?.en || plainTextToRichText(initial?.description.en ?? ""),
      status: initial?.status ?? "draft",
      stripePriceId: initial?.stripePriceId ?? "",
      sortOrder: initial?.sortOrder ?? nextSortOrder,
    });
  }

  function openComposer() {
    setTitleSr(initial?.title.sr ?? "");
    setTitleEn(initial?.title.en ?? "");
    setSlug(initial?.slug ?? "");
    setSubtitleSr(initial?.subtitle.sr ?? "");
    setSubtitleEn(initial?.subtitle.en ?? "");
    setDescriptionSr(initial?.description.sr ?? "");
    setDescriptionEn(initial?.description.en ?? "");
    setDescriptionRichSr(initial?.descriptionRich?.sr || plainTextToRichText(initial?.description.sr ?? ""));
    setDescriptionRichEn(initial?.descriptionRich?.en || plainTextToRichText(initial?.description.en ?? ""));
    setStatus(initial?.status ?? "draft");
    setStripePriceId(initial?.stripePriceId ?? "");
    setSortOrder(initial?.sortOrder ?? nextSortOrder);
    setMessage(null);
    setVideoMessage(null);
    setOpenModuleId(null);
    setModuleOrder([]);
    setDraggingModuleId(null);
    setDropTargetModuleId(null);
    videoDragDepthRef.current = 0;
    setVideoDragging(false);
    setPendingAction(null);
    setBaseSnapshot(snapshotFromInitial());
    hydratedCourseRef.current = null;
    setOpen(true);
  }

  useEffect(() => {
    if (!open || !courseId || !liveCourse || hydratedCourseRef.current === courseId) return;
    const snapshot = JSON.stringify({
      titleSr: liveCourse.titleSr,
      titleEn: liveCourse.titleEn,
      slug: liveCourse.slug,
      subtitleSr: liveCourse.subtitleSr,
      subtitleEn: liveCourse.subtitleEn,
      descriptionSr: liveCourse.descriptionSr,
      descriptionEn: liveCourse.descriptionEn,
      descriptionRichSr: liveCourse.descriptionRichSr || plainTextToRichText(liveCourse.descriptionSr),
      descriptionRichEn: liveCourse.descriptionRichEn || plainTextToRichText(liveCourse.descriptionEn),
      status: liveCourse.status,
      stripePriceId: liveCourse.stripePriceId ?? "",
      sortOrder: liveCourse.sortOrder,
    });
    hydratedCourseRef.current = courseId;
    queueMicrotask(() => {
      setTitleSr(liveCourse.titleSr);
      setTitleEn(liveCourse.titleEn);
      setSlug(liveCourse.slug);
      setSubtitleSr(liveCourse.subtitleSr);
      setSubtitleEn(liveCourse.subtitleEn);
      setDescriptionSr(liveCourse.descriptionSr);
      setDescriptionEn(liveCourse.descriptionEn);
      setDescriptionRichSr(liveCourse.descriptionRichSr || plainTextToRichText(liveCourse.descriptionSr));
      setDescriptionRichEn(liveCourse.descriptionRichEn || plainTextToRichText(liveCourse.descriptionEn));
      setStatus(liveCourse.status);
      setStripePriceId(liveCourse.stripePriceId ?? "");
      setSortOrder(liveCourse.sortOrder);
      setBaseSnapshot(snapshot);
    });
  }, [courseId, liveCourse, open]);

  useEffect(() => {
    if (!open || !courseEditorData?.modules) return;
    const nextModuleIds = courseEditorData.modules
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((module) => module._id);

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setModuleOrder((current) => {
        if (!nextModuleIds.length) return [];
        if (current.length === 0) return nextModuleIds;

        const currentIds = new Set(current);
        const sameSet =
          currentIds.size === nextModuleIds.length && nextModuleIds.every((moduleId) => currentIds.has(moduleId));
        return sameSet ? current : nextModuleIds;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [courseEditorData?.modules, open]);

  useEffect(() => {
    return () => {
      if (localVideoPreviewUrl) URL.revokeObjectURL(localVideoPreviewUrl);
    };
  }, [localVideoPreviewUrl]);

  function setIntroVideoPreview(file: File | null) {
    setLocalVideoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function openVideoPicker() {
    if (!courseId || videoUploading || videoDeleting) {
      setVideoMessage(t(locale, "Sacuvaj kurs pre upload-a intro videa.", "Save the course before uploading an intro video."));
      return;
    }
    videoInputRef.current?.click();
  }

  const generateUploadUrl = useMutation(api.video.createDocumentUploadUrl);
  const saveCourseVideo = useMutation(api.video.saveCourseVideo);
  const deleteCourseVideo = useMutation(api.video.deleteCourseVideo);

  async function uploadIntroVideo(file: File) {
    if (!courseId) {
      setVideoMessage(t(locale, "Sacuvaj kurs pre upload-a intro videa.", "Save the course before uploading an intro video."));
      return;
    }

    setVideoUploading(true);
    setVideoMessage(null);
    setIntroVideoPreview(file);

    try {
      const uploadUrl = await generateUploadUrl();
      const upload = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!upload.ok) {
        const detail = await upload.text().catch(() => "");
        throw new Error(
          detail
            ? `${t(locale, "Upload nije uspeo", "Upload failed")}: ${detail.slice(0, 240)}`
            : t(locale, "Upload nije uspeo.", "Upload failed."),
        );
      }

      const { storageId } = (await upload.json()) as { storageId?: Id<"_storage"> };
      if (!storageId) {
        throw new Error(t(locale, "Convex nije vratio storageId.", "Convex did not return a storageId."));
      }

      await saveCourseVideo({
        courseId: courseId as Id<"courses">,
        storageId,
        fileName: file.name,
        byteSize: file.size,
        mimeType: file.type || "application/octet-stream",
      });

      setVideoMessage(t(locale, "Intro video je uspesno sacuvan.", "Intro video saved successfully."));
      router.refresh();
    } catch (error) {
      setVideoMessage(error instanceof Error ? error.message : t(locale, "Upload nije uspeo.", "Upload failed."));
      setIntroVideoPreview(null);
    } finally {
      setVideoUploading(false);
    }
  }

  function onVideoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void uploadIntroVideo(file);
    }
  }

  const applyDroppedVideo = useEffectEvent((file: File) => {
    if (videoUploading || videoDeleting || !isVideoFile(file)) return;
    void uploadIntroVideo(file);
  });

  useEffect(() => {
    function resetVideoDragging() {
      videoDragDepthRef.current = 0;
      setVideoDragging(false);
    }

    if (!open) {
      resetVideoDragging();
      return;
    }

    function handleWindowDragEnter(event: globalThis.DragEvent) {
      if (!hasFileCandidateDrag(event.dataTransfer)) return;

      event.preventDefault();
      if (!hasVideoCandidateDrag(event.dataTransfer)) return;

      videoDragDepthRef.current += 1;
      setVideoDragging(true);
    }

    function handleWindowDragOver(event: globalThis.DragEvent) {
      if (!hasFileCandidateDrag(event.dataTransfer)) return;

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = hasVideoCandidateDrag(event.dataTransfer) ? "copy" : "none";
      }
      setVideoDragging(hasVideoCandidateDrag(event.dataTransfer));
    }

    function handleWindowDragLeave() {
      if (videoDragDepthRef.current === 0) return;

      videoDragDepthRef.current = Math.max(0, videoDragDepthRef.current - 1);
      if (videoDragDepthRef.current === 0) {
        setVideoDragging(false);
      }
    }

    function handleWindowDrop(event: globalThis.DragEvent) {
      if (!hasFileCandidateDrag(event.dataTransfer) && videoDragDepthRef.current === 0) return;

      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      resetVideoDragging();
      if (isVideoFile(file)) {
        applyDroppedVideo(file);
      }
    }

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
      resetVideoDragging();
    };
  }, [open]);

  async function deleteIntroVideo() {
    if (!courseId || videoDeleting) return;
    setVideoDeleting(true);
    setVideoMessage(null);
    try {
      await deleteCourseVideo({ courseId: courseId as Id<"courses"> });
      setIntroVideoPreview(null);
      setVideoMessage(t(locale, "Intro video je uklonjen.", "Intro video was removed."));
      router.refresh();
    } catch (error) {
      setVideoMessage(error instanceof Error ? error.message : t(locale, "Brisanje nije uspelo.", "Delete failed."));
    } finally {
      setVideoDeleting(false);
    }
  }

  async function saveCourse() {
    if (!titleSr.trim()) throw new Error(t(locale, "Popuni naziv na srpskom.", "Complete the Serbian title."));
    if (status === "published" && (!subtitleSr.trim() || !richTextHasContent(descriptionRichSr, descriptionSr))) throw new Error(t(locale, "Popuni SR podnaslov i opis pre objave.", "Complete the Serbian subtitle and description before publishing."));
    const savedSlug = slug || slugify(titleSr || titleEn);
    if (!savedSlug) {
      throw new Error(t(locale, "Unesi naziv ili slug kursa.", "Enter a course title or slug."));
    }
    const safeSortOrder = Number.isFinite(sortOrder) ? sortOrder : nextSortOrder;
    await upsertCourse({
      ...(courseId ? { courseId: courseId as Id<"courses"> } : {}),
      slug: savedSlug,
      titleSr,
      titleEn,
      subtitleSr,
      subtitleEn,
      descriptionSr,
      descriptionEn,
      descriptionRichSr,
      descriptionRichEn: richTextHasContent(descriptionRichEn, descriptionEn) ? descriptionRichEn : undefined,
      status,
      stripePriceId: stripePriceId.trim() || undefined,
      sortOrder: safeSortOrder,
    });
    setBaseSnapshot(currentSnapshot);
    return savedSlug;
  }

  function continueAfter(action: PendingCourseAction, slugForNavigation: string) {
    if (!action) return;
    if (action.type === "close") {
      setOpen(false);
    } else if (action.type === "module") {
      setOpen(false);
      router.push(`${coursePath(locale, slugForNavigation)}?editModule=${action.moduleId}`);
    } else {
      setOpen(false);
      router.push(lessonEditPath(locale, slugForNavigation, action.lessonSlug));
    }
    router.refresh();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const savedSlug = await saveCourse();
      setOpen(false);
      router.push(coursePath(locale, savedSlug));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(locale, "Cuvanje nije uspelo.", "Save failed."));
    } finally {
      setPending(false);
    }
  }

  function requestClose() {
    if (isDirty) {
      setMessage(null);
      setPendingAction({ type: "close" });
      return;
    }
    setOpen(false);
  }

  function requestModuleEditor(moduleId: string) {
    if (isDirty) {
      setMessage(null);
      setPendingAction({ type: "module", moduleId });
      return;
    }
    continueAfter({ type: "module", moduleId }, currentSlug || initial?.slug || "");
  }

  function requestLessonEditor(lessonSlug: string) {
    if (isDirty) {
      setMessage(null);
      setPendingAction({ type: "lesson", lessonSlug });
      return;
    }
    continueAfter({ type: "lesson", lessonSlug }, currentSlug || initial?.slug || "");
  }

  function handleModuleDragStart(event: ReactDragEvent<HTMLButtonElement>, moduleId: Id<"modules">) {
    if (reorderPending) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-nauci-module", moduleId);
    setDraggingModuleId(moduleId);
    setDropTargetModuleId(moduleId);
  }

  function handleModuleDragOver(event: ReactDragEvent<HTMLDivElement>, moduleId: Id<"modules">) {
    if (!draggingModuleId || draggingModuleId === moduleId || reorderPending) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetModuleId(moduleId);
  }

  async function handleModuleDrop(event: ReactDragEvent<HTMLDivElement>, targetModuleId: Id<"modules">) {
    const sourceModuleId =
      draggingModuleId ?? (event.dataTransfer.getData("application/x-nauci-module") as Id<"modules"> | "");
    if (!sourceModuleId || sourceModuleId === targetModuleId || reorderPending || !courseId) {
      setDraggingModuleId(null);
      setDropTargetModuleId(null);
      return;
    }

    event.preventDefault();
    const previousOrder = modules.map((module) => module._id);
    const nextOrder = moveIdAroundTarget(previousOrder, sourceModuleId, targetModuleId);
    setDraggingModuleId(null);
    setDropTargetModuleId(null);
    if (sameIds(previousOrder, nextOrder)) return;

    setModuleOrder(nextOrder);
    setReorderPending(true);
    setMessage(null);
    try {
      await reorderModules({
        courseId: courseId as Id<"courses">,
        moduleIds: nextOrder,
      });
      router.refresh();
    } catch (error) {
      setModuleOrder(previousOrder);
      setMessage(error instanceof Error ? error.message : t(locale, "Promena redosleda nije uspela.", "Reorder failed."));
    } finally {
      setReorderPending(false);
    }
  }

  function handleModuleDragEnd() {
    setDraggingModuleId(null);
    setDropTargetModuleId(null);
  }

  async function saveAndContinue() {
    if (!pendingAction) return;
    setPending(true);
    setMessage(null);
    try {
      const savedSlug = await saveCourse();
      const action = pendingAction;
      setPendingAction(null);
      continueAfter(action, savedSlug);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(locale, "Cuvanje nije uspelo.", "Save failed."));
    } finally {
      setPending(false);
    }
  }

  function discardAndContinue() {
    const action = pendingAction;
    setPendingAction(null);
    continueAfter(action, liveCourse?.slug ?? initial?.slug ?? currentSlug);
  }

  return (
    <>
      {iconOnly ? (
        <AdminIconButton label={actionLabel} onClick={openComposer}>
          {isEditing ? <Pencil className="size-3.5" /> : <Plus className="size-4" />}
        </AdminIconButton>
      ) : (
        <AdminActionButton onClick={openComposer} tone="compact">
          {isEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {actionLabel}
        </AdminActionButton>
      )}
      <AdminComposerSheet
        title={actionLabel}
        eyebrow={t(locale, "Composer kursa", "Course composer")}
        open={open}
        onClose={requestClose}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <FormSection
                icon={<Sparkles className="size-5" />}
                title={t(locale, "Identitet kursa", "Course identity")}
                body={t(locale, "Naziv, URL i status koji odredjuju kako kurs ulazi u aplikaciju.", "Name, URL, and status that control how this course appears in the app.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2"><LocalizedPairSwitch locale={contentLocale} onChange={setContentLocale} sr={titleSr} en={titleEn} /></div>
                  <Field label={contentLocale === "sr" ? "Naziv kursa" : "Course title"}>
                    <input className={inputClass} value={contentLocale === "sr" ? titleSr : titleEn} onChange={(event) => contentLocale === "sr" ? setTitleSr(event.target.value) : setTitleEn(event.target.value)} required />
                  </Field>
                  <SlugField
                    label="Slug"
                    value={slug}
                    onChange={setSlug}
                    placeholder={slugify(titleSr || titleEn)}
                    locale={locale}
                  />
                  <Field label={t(locale, "Status", "Status")}>
                    <CourseStatusControl locale={locale} value={status} onChange={setStatus} />
                  </Field>
                  <Field label={t(locale, "Redosled", "Sort order")}>
                    <input
                      className={inputClass}
                      type="number"
                      value={sortOrder}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setSortOrder(Number.isFinite(nextValue) ? nextValue : 0);
                      }}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                icon={<BookOpen className="size-5" />}
                title={t(locale, "Opis i pozicioniranje", "Description and positioning")}
                body={t(locale, "Kratak podnaslov i opis koji korisniku objasnjavaju zasto ovaj kurs postoji.", "A short subtitle and description that explain why this course exists.")}
              >
                <div className="space-y-3">
                  <LocalizedPairSwitch locale={contentLocale} onChange={setContentLocale} sr={subtitleSr} en={subtitleEn} />
                  <Field label={contentLocale === "sr" ? "Podnaslov" : "Subtitle"}>
                    <input className={inputClass} value={contentLocale === "sr" ? subtitleSr : subtitleEn} onChange={(event) => contentLocale === "sr" ? setSubtitleSr(event.target.value) : setSubtitleEn(event.target.value)} required />
                  </Field>
                </div>
                <div className="mt-4 space-y-3">
                  <LocalizedPairSwitch locale={contentLocale} onChange={setContentLocale} sr={descriptionSr} en={descriptionEn} />
                  <RichTextEditor value={contentLocale === "sr" ? descriptionRichSr : descriptionRichEn} fallback={contentLocale === "sr" ? descriptionSr : descriptionEn} onChange={(json, plain) => { if (contentLocale === "sr") { setDescriptionRichSr(json); setDescriptionSr(plain); } else { setDescriptionRichEn(json); setDescriptionEn(plain); } }} />
                  {contentLocale === "en" && !descriptionEn.trim() ? <p className="rounded-[8px] border-2 border-amber-700 bg-amber-50 p-3 text-xs font-black text-amber-950">EN opis nedostaje, ali ne blokira objavu.</p> : null}
                </div>
              </FormSection>

              <FormSection
                icon={<CreditCard className="size-5" />}
                title={t(locale, "Placanje i pristup", "Billing and access")}
                body={t(locale, "Stripe price ID je live podatak kursa. Prazno polje uklanja cenu iz Convex kursa.", "The Stripe price ID is live course data. Leaving it empty removes the price from the Convex course.")}
              >
                <Field label="Stripe price ID" hint={t(locale, "Primer: price_...", "Example: price_...")}>
                  <input
                    className={inputClass}
                    value={stripePriceId}
                    onChange={(event) => setStripePriceId(event.target.value)}
                    placeholder="price_"
                  />
                </Field>
              </FormSection>

              <FormSection
                icon={<Film className="size-5" />}
                title={t(locale, "Intro video kursa", "Course intro video")}
                body={t(locale, "Ovaj video se prikazuje u dashboardu i na javnoj strani kursa.", "This video appears in the dashboard and on the public course page.")}
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <CourseIntroPreview
                    title={titleSr || titleEn || t(locale, "Intro video", "Intro video")}
                    videoUrl={videoUrl}
                    localPreviewUrl={localVideoPreviewUrl}
                    locale={locale}
                  />
                  <div className="space-y-3">
                    <div className="rounded-[16px] border-2 border-line bg-paper p-3">
                      <p className="text-[10px] font-black uppercase text-muted">{t(locale, "Status videa", "Video status")}</p>
                      <p className="mt-1 text-sm font-black text-ink">
                        {videoUrl ? t(locale, "Spreman", "Ready") : t(locale, "Nema videa", "No video")}
                      </p>
                      {liveCourse?.videoUpdatedAt ? (
                        <p className="mt-1 text-xs font-bold text-muted">
                          {new Date(liveCourse.videoUpdatedAt).toLocaleString(locale === "sr" ? "sr-RS" : "en-US")}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={openVideoPicker}
                      disabled={videoUploading || videoDeleting}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black text-ink shadow-[3px_3px_0_0_var(--shadow-hard-16)] disabled:cursor-wait disabled:opacity-60"
                    >
                      {videoUploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                      {videoUrl
                        ? t(locale, "Zameni video", "Replace video")
                        : t(locale, "Upload intro videa", "Upload intro video")}
                    </button>
                    {videoUrl ? (
                      <button
                        type="button"
                        onClick={deleteIntroVideo}
                        disabled={videoUploading || videoDeleting}
                        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border-2 border-red-700 bg-paper-strong px-4 text-xs font-black text-red-700 disabled:cursor-wait disabled:opacity-60"
                      >
                        {videoDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        {t(locale, "Ukloni video", "Remove video")}
                      </button>
                    ) : null}
                    {videoMessage ? (
                      <p className="rounded-[8px] border-2 border-line bg-paper-strong px-3 py-2 text-xs font-black text-muted">
                        {videoMessage}
                      </p>
                    ) : null}
                    <input ref={videoInputRef} className="sr-only" type="file" accept="video/*" onChange={onVideoFileChange} />
                  </div>
                </div>
              </FormSection>

              <FormSection
                icon={<Layers className="size-5" />}
                title={t(locale, "Ciklusi u kursu", "Course cycles")}
                body={t(locale, "Otvori ciklus ili lekciju direktno iz kurs editora. Ako kurs ima izmene, prvo biras sta se cuva.", "Open a cycle or lesson directly from the course editor. If the course has changes, choose what happens first.")}
              >
                {!isEditing ? (
                  <p className="rounded-[16px] border-2 border-dashed border-line bg-paper p-4 text-sm font-black text-muted">
                    {t(locale, "Ciklusi su dostupni kada sacuvas novi kurs.", "Cycles are available after you save the new course.")}
                  </p>
                ) : courseEditorData === undefined ? (
                  <div className="flex items-center gap-3 rounded-[16px] border-2 border-line bg-paper p-4 text-sm font-black text-muted">
                    <Loader2 className="size-4 animate-spin" />
                    {t(locale, "Ucitavanje ciklusa", "Loading cycles")}
                  </div>
                ) : modules.length ? (
                  <div className="space-y-3">
                    {modules.map((module) => {
                      const isOpen = openModuleId === module._id;
                      const isDraggingModule = draggingModuleId === module._id;
                      const isDropTarget = dropTargetModuleId === module._id && draggingModuleId !== module._id;
                      const moduleTitle = locale === "sr" ? module.titleSr : module.titleEn || module.titleSr;
                      const publishedLessons = module.lessons.filter((lesson) => lesson.isPublished).length;
                      return (
                        <div
                          key={module._id}
                          onDragOver={(event) => handleModuleDragOver(event, module._id)}
                          onDrop={(event) => void handleModuleDrop(event, module._id)}
                          className={cn(
                            "overflow-hidden rounded-[16px] border-2 bg-paper transition",
                            isDropTarget ? "border-ink bg-yellow/20" : "border-line",
                            isDraggingModule && "opacity-60 ring-4 ring-yellow/35",
                          )}
                        >
                          <div className="flex min-h-12 items-stretch bg-paper-strong">
                            <button
                              type="button"
                              onClick={() => setOpenModuleId((current) => (current === module._id ? null : module._id))}
                              className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left text-sm font-black text-ink transition hover:bg-yellow/25"
                              aria-expanded={isOpen}
                            >
                              <span className="min-w-0">
                                <span className="block truncate">{moduleTitle}</span>
                                <span className="mt-1 block text-[11px] font-bold text-muted">
                                  {publishedLessons}/{module.lessons.length} {t(locale, "lekcija", "lessons")}
                                </span>
                              </span>
                              <ChevronDown className={cn("size-4 shrink-0 transition", isOpen && "rotate-180")} />
                            </button>
                            <div className="flex shrink-0 items-center gap-2 border-l-2 border-line px-3">
                              <button
                                type="button"
                                onClick={() => requestModuleEditor(module._id)}
                                className="inline-flex min-h-8 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard-15)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                              >
                                <Pencil className="size-3.5" />
                                <span className="hidden sm:inline">{t(locale, "Izmeni", "Edit")}</span>
                              </button>
                              <button
                                type="button"
                                draggable={!reorderPending}
                                onDragStart={(event) => handleModuleDragStart(event, module._id)}
                                onDragEnd={handleModuleDragEnd}
                                disabled={reorderPending}
                                aria-label={t(locale, "Promeni redosled ciklusa", "Reorder cycle")}
                                title={t(locale, "Promeni redosled ciklusa", "Reorder cycle")}
                                className={cn(
                                  "inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-paper-strong text-ink shadow-[2px_2px_0_0_var(--shadow-hard-14)] transition hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60",
                                  isDraggingModule ? "cursor-grabbing bg-yellow" : "cursor-grab active:cursor-grabbing",
                                )}
                              >
                                <GripVertical className="size-4" />
                              </button>
                            </div>
                          </div>
                          <AnimatePresence initial={false}>
                            {isOpen ? (
                              <motion.div
                                className="border-t-2 border-line p-4"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <div className="space-y-2 rounded-[8px] bg-paper-strong p-2">
                                  {module.lessons.length ? (
                                    module.lessons.map((lesson) => {
                                      const lessonTitle = locale === "sr" ? lesson.titleSr : lesson.titleEn || lesson.titleSr;
                                      return (
                                        <div
                                          key={lesson._id}
                                          className="group flex min-h-9 w-full items-center gap-1 rounded-[8px] px-1 text-xs font-black text-muted transition hover:bg-paper hover:text-ink"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => requestLessonEditor(lesson.slug)}
                                            className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-1 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                          >
                                            <ExternalLink className="size-3.5 shrink-0" />
                                            <span className="min-w-0 flex-1 truncate">{lessonTitle}</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => requestLessonEditor(lesson.slug)}
                                            aria-label={t(locale, "Otvori editor lekcije", "Open lesson editor")}
                                            title={t(locale, "Otvori editor lekcije", "Open lesson editor")}
                                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-ink bg-paper-strong text-ink opacity-0 shadow-[2px_2px_0_0_var(--shadow-hard-12)] transition hover:bg-yellow focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink group-hover:opacity-100"
                                          >
                                            <LayoutDashboard className="size-3.5" />
                                          </button>
                                          <span className="shrink-0 rounded-full border border-line bg-paper-strong px-2 py-0.5 text-[10px]">
                                            {formatMinutes(lesson.durationSeconds)}
                                          </span>
                                          {!lesson.isPublished ? (
                                            <span className="shrink-0 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] uppercase">
                                              {t(locale, "Nacrt", "Draft")}
                                            </span>
                                          ) : null}
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <p className="rounded-[8px] border-2 border-dashed border-line bg-paper p-3 text-xs font-black text-muted">
                                      {t(locale, "Nema lekcija u ovom ciklusu.", "No lessons in this cycle.")}
                                    </p>
                                  )}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-[16px] border-2 border-dashed border-line bg-paper p-4 text-sm font-black text-muted">
                    {t(locale, "Kurs jos nema cikluse.", "This course has no cycles yet.")}
                  </p>
                )}
              </FormSection>
            </div>
            <EntityPreview
              locale={locale}
              title={titleSr || titleEn}
              subtitle={subtitleSr || subtitleEn || descriptionSr || descriptionEn}
              status={statusLabel(locale, status)}
              meta={`${currentSlug || "slug"} / ${modules.length} ${t(locale, "ciklusa", "cycles")} / ${totalLessons} ${t(locale, "lekcija", "lessons")}`}
              emptyLabel={t(locale, "Novi kurs", "New course")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={isEditing ? t(locale, "Sacuvaj kurs", "Save course") : t(locale, "Dodaj kurs", "Add course")}
            message={message}
          />
        </form>
        <AnimatePresence>
          {videoDragging ? (
            <motion.div
              className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-scrim/45 p-4 backdrop-blur-[3px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <div className="absolute inset-4 rounded-[28px] border-[3px] border-dashed border-yellow" />
              <motion.div
                className="relative max-w-sm rounded-[16px] border-2 border-ink bg-paper-strong p-6 text-center text-ink shadow-[8px_8px_0_0_rgba(244,190,48,0.85)]"
                initial={{ y: 10, scale: 0.98 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 8, scale: 0.99 }}
              >
                <UploadCloud className="mx-auto size-9" />
                <p className="mt-3 text-lg font-black">
                  {t(locale, "Pusti video bilo gde", "Drop the video anywhere")}
                </p>
                <p className="mt-2 text-sm font-bold leading-6 text-muted">
                  {t(
                    locale,
                    "Intro video kursa ce odmah krenuti na upload.",
                    "The course intro video will start uploading immediately.",
                  )}
                </p>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </AdminComposerSheet>
      {typeof document !== "undefined" ? (
        createPortal(
          <AnimatePresence>
            {pendingAction ? (
              <motion.div
                className="fixed inset-0 z-[70] flex items-center justify-center bg-scrim/45 p-4 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  className="w-full max-w-md rounded-[16px] border-2 border-ink bg-paper-strong p-5 shadow-[8px_8px_0_0_var(--shadow-hard-22)]"
                  initial={{ y: 16, scale: 0.98 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: 10, scale: 0.99 }}
                >
                  <p className="text-xs font-black uppercase text-muted">{t(locale, "Nesnimljene izmene", "Unsaved changes")}</p>
                  <h3 className="mt-2 text-2xl font-black text-ink">
                    {t(locale, "Sacuvati izmene na kursu?", "Save changes to this course?")}
                  </h3>
                  <p className="mt-3 text-sm font-bold leading-6 text-muted">
                    {t(locale, "Pre nastavka izaberi da li se informacije o kursu cuvaju.", "Before continuing, choose whether to save the course information.")}
                  </p>
                  {message ? (
                    <p className="mt-4 rounded-[8px] border-2 border-red-200 bg-red-50 px-3 py-2 text-sm font-black text-red-700">
                      {message}
                    </p>
                  ) : null}
                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={saveAndContinue}
                      disabled={pending}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black text-ink disabled:cursor-wait disabled:opacity-60"
                    >
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      {t(locale, "Sacuvaj i nastavi", "Save and continue")}
                    </button>
                    <button
                      type="button"
                      onClick={discardAndContinue}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink"
                    >
                      {t(locale, "Ponisti i nastavi", "Discard and continue")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingAction(null)}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-line bg-paper px-3 text-xs font-black text-muted"
                    >
                      {t(locale, "Ostani", "Stay")}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body
        )
      ) : null}
    </>
  );
}

export function EditCourseAction(props: Omit<Parameters<typeof AddCourseAction>[0], "buttonLabel">) {
  return <AddCourseAction {...props} buttonLabel={t(props.locale, "Izmeni kurs", "Edit course")} />;
}

type ModuleActionInitial = {
  title: { sr: string; en: string };
  description?: { sr: string; en: string };
  imageUrl?: string | null;
  imageFileName?: string;
  imageAlt?: { sr: string; en: string };
  sortOrder: number;
};

type ModuleEditorLesson = {
  _id: Id<"lessons">;
  slug: string;
  titleSr: string;
  titleEn: string;
  summarySr?: string;
  summaryEn?: string;
  isPublished?: boolean;
  sortOrder: number;
  parts?: Array<{
    _id: Id<"lessonParts">;
    slug: string;
    titleSr: string;
    titleEn: string;
    kind: LessonPartKind;
    parentPartId?: Id<"lessonParts">;
    isPublished?: boolean;
    sortOrder: number;
  }>;
  steps?: Array<{
    _id: string;
    titleSr?: string;
    titleEn?: string;
    promptSr?: string;
    promptEn?: string;
    sortOrder?: number;
  }>;
  tasks?: Array<{
    _id: string;
    titleSr?: string;
    titleEn?: string;
    promptSr?: string;
    promptEn?: string;
    sortOrder?: number;
  }>;
};

type ModuleEditorData = {
  course: {
    _id: Id<"courses">;
    slug: string;
    titleSr: string;
    titleEn: string;
  };
  module: {
    _id: Id<"modules">;
    titleSr: string;
    titleEn: string;
    descriptionSr?: string;
    descriptionEn?: string;
    imageUrl?: string | null;
    imageFileName?: string;
    imageAltSr?: string;
    imageAltEn?: string;
    sortOrder: number;
  };
  lessons: ModuleEditorLesson[];
} | null;

type PendingCycleAction = { type: "close" } | { type: "navigate"; href: string } | null;

export function AddModuleAction({
  locale,
  courseId,
  courseSlug,
  moduleId,
  initial,
  nextSortOrder,
  tone = "compact",
  iconOnly = false,
  buttonLabel,
  openLessonAfterCreate = false,
  triggerClassName,
  autoOpenKey,
}: {
  locale: Locale;
  courseId?: string;
  courseSlug?: string;
  moduleId?: string;
  initial?: ModuleActionInitial;
  nextSortOrder: number;
  tone?: ButtonTone;
  iconOnly?: boolean;
  buttonLabel?: string;
  openLessonAfterCreate?: boolean;
  triggerClassName?: string;
  autoOpenKey?: string | null;
}) {
  const router = useRouter();
  const upsertModule = useMutation(api.courses.upsertModule);
  const generateUploadUrl = useMutation(api.video.createDocumentUploadUrl);
  const shouldReduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [dismissedAutoOpenKey, setDismissedAutoOpenKey] = useState<string | null>(null);
  const shouldAutoOpen = Boolean(
    autoOpenKey && moduleId && autoOpenKey === moduleId && dismissedAutoOpenKey !== autoOpenKey,
  );
  const sheetOpen = open || shouldAutoOpen;
  const moduleEditorData = useQuery(
    api.courses.getModuleEditorData,
    sheetOpen && moduleId ? { moduleId: moduleId as Id<"modules"> } : "skip",
  ) as ModuleEditorData | undefined;
  const [titleSr, setTitleSr] = useState(initial?.title.sr ?? "");
  const [titleEn, setTitleEn] = useState(initial?.title.en ?? "");
  const [descriptionSr, setDescriptionSr] = useState(initial?.description?.sr ?? "");
  const [descriptionEn, setDescriptionEn] = useState(initial?.description?.en ?? "");
  const [imageAltSr, setImageAltSr] = useState(initial?.imageAlt?.sr ?? "");
  const [imageAltEn, setImageAltEn] = useState(initial?.imageAlt?.en ?? "");
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [currentImageFileName, setCurrentImageFileName] = useState(initial?.imageFileName ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingCycleAction>(null);
  const [baseSnapshot, setBaseSnapshot] = useState("");
  const hydratedModuleRef = useRef<string | null>(null);
  const isEditing = Boolean(moduleId);
  const actionLabel =
    buttonLabel ?? (isEditing ? t(locale, "Izmeni ciklus", "Edit cycle") : t(locale, "Dodaj ciklus", "Add cycle"));
  const sortOrder = initial?.sortOrder ?? moduleEditorData?.module.sortOrder ?? nextSortOrder;
  const currentSnapshot = JSON.stringify({
    titleSr,
    titleEn,
    descriptionSr,
    descriptionEn,
    imageAltSr,
    imageAltEn,
    imageFileName: imageFile?.name ?? currentImageFileName,
    sortOrder,
  });
  const isDirty = Boolean(baseSnapshot && currentSnapshot !== baseSnapshot);

  function initialSnapshot() {
    return JSON.stringify({
      titleSr: initial?.title.sr ?? "",
      titleEn: initial?.title.en ?? "",
      descriptionSr: initial?.description?.sr ?? "",
      descriptionEn: initial?.description?.en ?? "",
      imageAltSr: initial?.imageAlt?.sr ?? "",
      imageAltEn: initial?.imageAlt?.en ?? "",
      imageFileName: initial?.imageFileName ?? "",
      sortOrder: initial?.sortOrder ?? nextSortOrder,
    });
  }

  function openComposer() {
    setTitleSr(initial?.title.sr ?? "");
    setTitleEn(initial?.title.en ?? "");
    setDescriptionSr(initial?.description?.sr ?? "");
    setDescriptionEn(initial?.description?.en ?? "");
    setImageAltSr(initial?.imageAlt?.sr ?? "");
    setImageAltEn(initial?.imageAlt?.en ?? "");
    setCurrentImageUrl(initial?.imageUrl ?? null);
    setCurrentImageFileName(initial?.imageFileName ?? "");
    setCycleImage(null);
    setMessage(null);
    setOpenLessonId(null);
    setPendingAction(null);
    setBaseSnapshot(initialSnapshot());
    hydratedModuleRef.current = null;
    setOpen(true);
  }

  function closeSheet() {
    setOpen(false);
    if (autoOpenKey) {
      setDismissedAutoOpenKey(autoOpenKey);
      if (courseSlug) {
        router.replace(coursePath(locale, courseSlug), { scroll: false });
      }
    }
  }

  useEffect(() => {
    if (!sheetOpen || !moduleId || !moduleEditorData?.module || hydratedModuleRef.current === moduleId) return;
    const cycle = moduleEditorData.module;
    const snapshot = JSON.stringify({
      titleSr: cycle.titleSr,
      titleEn: cycle.titleEn,
      descriptionSr: cycle.descriptionSr ?? "",
      descriptionEn: cycle.descriptionEn ?? "",
      imageAltSr: cycle.imageAltSr ?? "",
      imageAltEn: cycle.imageAltEn ?? "",
      imageFileName: cycle.imageFileName ?? "",
      sortOrder: cycle.sortOrder,
    });
    hydratedModuleRef.current = moduleId;
    queueMicrotask(() => {
      setTitleSr(cycle.titleSr);
      setTitleEn(cycle.titleEn);
      setDescriptionSr(cycle.descriptionSr ?? "");
      setDescriptionEn(cycle.descriptionEn ?? "");
      setImageAltSr(cycle.imageAltSr ?? "");
      setImageAltEn(cycle.imageAltEn ?? "");
      setCurrentImageUrl(cycle.imageUrl ?? null);
      setCurrentImageFileName(cycle.imageFileName ?? "");
      setBaseSnapshot(snapshot);
    });
  }, [moduleEditorData, moduleId, sheetOpen]);

  useEffect(() => {
    if (!openLessonId || shouldReduceMotion) return;
    gsap.fromTo(
      ".cycle-accordion-panel",
      { autoAlpha: 0, y: -8 },
      { autoAlpha: 1, y: 0, duration: 0.24, ease: "power2.out" },
    );
  }, [openLessonId, shouldReduceMotion]);

  useEffect(() => {
    return () => {
      if (localImagePreview) URL.revokeObjectURL(localImagePreview);
    };
  }, [localImagePreview]);

  function setCycleImage(file: File | null) {
    setImageFile(file);
    setLocalImagePreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function uploadSelectedImage(): Promise<{
    imageStorageId?: Id<"_storage">;
    imageFileName?: string;
    imageMimeType?: string;
    imageByteSize?: number;
  }> {
    if (!imageFile) return {};
    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": imageFile.type || "application/octet-stream" },
      body: imageFile,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        detail
          ? `${t(locale, "Upload slike nije uspeo", "Image upload failed")}: ${detail.slice(0, 240)}`
          : t(locale, "Upload slike nije uspeo.", "Image upload failed."),
      );
    }
    const result = (await response.json()) as { storageId?: Id<"_storage"> };
    if (!result.storageId) {
      throw new Error(t(locale, "Convex nije vratio storageId za sliku.", "Convex did not return image storageId."));
    }
    return {
      imageStorageId: result.storageId,
      imageFileName: imageFile.name,
      imageMimeType: imageFile.type || "application/octet-stream",
      imageByteSize: imageFile.size,
    };
  }

  async function saveCycle() {
    if (!courseId) throw new Error(t(locale, "Nedostaje kurs za ciklus.", "Missing course for this cycle."));
    const imagePayload = await uploadSelectedImage();
    const savedModuleId = await upsertModule({
      ...(moduleId ? { moduleId: moduleId as Id<"modules"> } : {}),
      courseId: courseId as Id<"courses">,
      titleSr,
      titleEn: titleEn || titleSr,
      descriptionSr: descriptionSr || undefined,
      descriptionEn: descriptionEn || descriptionSr || undefined,
      ...imagePayload,
      imageAltSr: imageAltSr || undefined,
      imageAltEn: imageAltEn || imageAltSr || undefined,
      sortOrder,
    });
    setBaseSnapshot(currentSnapshot);
    if (imageFile) {
      setCurrentImageFileName(imageFile.name);
      setCycleImage(null);
    }
    return savedModuleId;
  }

  function continueAfter(action: PendingCycleAction) {
    if (!action) return;
    if (action.type === "close") {
      closeSheet();
    } else {
      setOpen(false);
      router.push(action.href);
    }
    router.refresh();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const savedModuleId = await saveCycle();
      closeSheet();
      if (!moduleId && courseSlug && openLessonAfterCreate) {
        router.push(`${coursePath(locale, courseSlug)}?newLessonModule=${savedModuleId}`);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(locale, "Cuvanje nije uspelo.", "Save failed."));
    } finally {
      setPending(false);
    }
  }

  function requestClose() {
    if (isDirty) {
      setPendingAction({ type: "close" });
      return;
    }
    closeSheet();
  }

  function requestNavigate(href: string) {
    if (isDirty) {
      setPendingAction({ type: "navigate", href });
      return;
    }
    router.push(href);
  }

  async function saveAndContinue() {
    if (!pendingAction) return;
    setPending(true);
    setMessage(null);
    try {
      await saveCycle();
      const action = pendingAction;
      setPendingAction(null);
      continueAfter(action);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(locale, "Cuvanje nije uspelo.", "Save failed."));
      setPendingAction(null);
    } finally {
      setPending(false);
    }
  }

  function discardAndContinue() {
    const action = pendingAction;
    setPendingAction(null);
    continueAfter(action);
  }

  const lessons = (moduleEditorData?.lessons ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const previewImage = localImagePreview ?? currentImageUrl;

  function partChildren(parts: NonNullable<ModuleEditorLesson["parts"]>, parentPartId?: Id<"lessonParts">) {
    return parts
      .filter((part) => (part.parentPartId ?? undefined) === parentPartId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function renderCyclePartTree(
    parts: NonNullable<ModuleEditorLesson["parts"]>,
    lessonHref: string,
    parentPartId?: Id<"lessonParts">,
    depth = 0,
  ): ReactNode[] {
    return partChildren(parts, parentPartId).map((part) => {
      const nested = renderCyclePartTree(parts, lessonHref, part._id, depth + 1);
      return (
        <div key={part._id} className={cn("space-y-1", depth > 0 && "ml-4")}>
          <button
            type="button"
            onClick={() => requestNavigate(`${lessonHref}?part=${part._id}`)}
            className={cn(
              "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-xs font-black text-muted transition hover:bg-paper hover:text-ink",
              depth > 0 && "text-[11px]",
            )}
          >
            <FileText className="size-3.5 shrink-0" />
            <span className="truncate">{locale === "sr" ? part.titleSr : part.titleEn || part.titleSr}</span>
            {part.isPublished === false ? (
              <span className="ml-auto shrink-0 rounded-[5px] border border-line bg-paper-strong px-1.5 py-0.5 text-[9px] uppercase text-muted">
                {t(locale, "Nacrt", "Draft")}
              </span>
            ) : null}
          </button>
          {nested.length ? <div className="space-y-1">{nested}</div> : null}
        </div>
      );
    });
  }

  function renderCycleLeafItem({
    key,
    title,
    href,
    draft,
  }: {
    key: string;
    title: string;
    href: string;
    draft?: boolean;
  }) {
    return (
      <button
        key={key}
        type="button"
        onClick={() => requestNavigate(href)}
        className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left text-xs font-black text-muted transition hover:bg-paper hover:text-ink"
      >
        <FileText className="size-3.5 shrink-0" />
        <span className="truncate">{title}</span>
        {draft ? (
          <span className="ml-auto shrink-0 rounded-[5px] border border-line bg-paper-strong px-1.5 py-0.5 text-[9px] uppercase text-muted">
            {t(locale, "Nacrt", "Draft")}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <>
      {iconOnly ? (
        <AdminIconButton label={actionLabel} onClick={openComposer} disabled={!courseId}>
          {isEditing ? <Pencil className="size-3.5" /> : <Plus className="size-4" />}
        </AdminIconButton>
      ) : (
        <AdminActionButton onClick={openComposer} tone={tone} disabled={!courseId} className={triggerClassName}>
          {isEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {actionLabel}
        </AdminActionButton>
      )}
      <AdminComposerSheet
        title={actionLabel}
        eyebrow={t(locale, "Composer ciklusa", "Cycle composer")}
        open={sheetOpen}
        onClose={requestClose}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-5">
              <FormSection
                icon={<Layers className="size-5" />}
                title={t(locale, "Osnovne informacije", "Basics")}
                body={t(locale, "Naziv, opis, slika i redosled ciklusa u kursu.", "Name, description, image, and cycle order inside the course.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Naziv SR">
                    <input className={inputClass} value={titleSr} onChange={(event) => setTitleSr(event.target.value)} required />
                  </Field>
                  <Field label="Title EN">
                    <input className={inputClass} value={titleEn} onChange={(event) => setTitleEn(event.target.value)} />
                  </Field>
                  <Field label="Opis SR">
                    <textarea className={textareaClass} rows={5} value={descriptionSr} onChange={(event) => setDescriptionSr(event.target.value)} />
                  </Field>
                  <Field label="Description EN">
                    <textarea className={textareaClass} rows={5} value={descriptionEn} onChange={(event) => setDescriptionEn(event.target.value)} />
                  </Field>
                  <Field label={t(locale, "Redosled", "Sort order")}>
                    <input className={inputClass} type="number" value={sortOrder} readOnly />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                icon={<ImageIcon className="size-5" />}
                title={t(locale, "Slika ciklusa", "Cycle image")}
                body={t(locale, "Slika se prikazuje na kartici ciklusa i u pregledu.", "The image is shown on the cycle card and preview.")}
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-4">
                    <FileDropzone
                      locale={locale}
                      label={t(locale, "Upload slike", "Image upload")}
                      accept="image/*"
                      file={imageFile}
                      onFileChange={setCycleImage}
                      currentFile={currentImageFileName}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Alt SR">
                        <input className={inputClass} value={imageAltSr} onChange={(event) => setImageAltSr(event.target.value)} />
                      </Field>
                      <Field label="Alt EN">
                        <input className={inputClass} value={imageAltEn} onChange={(event) => setImageAltEn(event.target.value)} />
                      </Field>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-[8px] border-2 border-ink bg-paper">
                    {previewImage ? (
                      <img src={previewImage} alt={imageAltSr || titleSr || "Cycle image"} className="aspect-[4/3] h-full w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center p-5 text-center text-sm font-black text-muted">
                        <ImageIcon className="mr-2 size-5" />
                        {t(locale, "Nema slike", "No image")}
                      </div>
                    )}
                  </div>
                </div>
              </FormSection>

              <FormSection
                icon={<BookOpen className="size-5" />}
                title={t(locale, "Lekcije u ciklusu", "Lessons in this cycle")}
                body={t(locale, "Otvori jednu lekciju, pa idi direktno na njen editor ili konkretan deo.", "Open one lesson, then jump directly to its editor or a specific piece.")}
              >
                {!isEditing ? (
                  <p className="rounded-[8px] border-2 border-dashed border-line bg-paper p-4 text-sm font-black text-muted">
                    {t(locale, "Lekcije su dostupne kada sacuvas novi ciklus.", "Lessons are available after you save the new cycle.")}
                  </p>
                ) : moduleEditorData === undefined ? (
                  <div className="flex items-center gap-3 rounded-[8px] border-2 border-line bg-paper p-4 text-sm font-black text-muted">
                    <Loader2 className="size-4 animate-spin" />
                    {t(locale, "Ucitavanje lekcija", "Loading lessons")}
                  </div>
                ) : lessons.length ? (
                  <div className="space-y-3">
                    {lessons.map((lesson) => {
                      const lessonTitle = locale === "sr" ? lesson.titleSr : lesson.titleEn || lesson.titleSr;
                      const lessonHref = lessonEditPath(locale, moduleEditorData?.course.slug ?? "", lesson.slug);
                      const isOpen = openLessonId === lesson._id;
                      const parts = (lesson.parts ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
                      const itemCount = parts.length + (lesson.steps?.length ?? 0) + (lesson.tasks?.length ?? 0);
                      return (
                        <div key={lesson._id} className="overflow-hidden rounded-[8px] border-2 border-line bg-paper">
                          <button
                            type="button"
                            onClick={() => setOpenLessonId((current) => (current === lesson._id ? null : lesson._id))}
                            className="flex min-h-12 w-full items-center justify-between gap-3 bg-paper-strong px-4 py-3 text-left text-sm font-black text-ink hover:bg-yellow/25"
                          >
                            <span className="flex min-w-0 items-start gap-2">
                              <PlayCircle className="mt-0.5 size-4 shrink-0" />
                              <span className="min-w-0">
                                <span className="block truncate">{lessonTitle}</span>
                              <span className="mt-1 block text-[11px] font-bold text-muted">
                                  {itemCount} {t(locale, "stavki", "items")}
                                </span>
                              </span>
                            </span>
                            <ChevronDown className={cn("size-4 shrink-0 transition", isOpen && "rotate-180")} />
                          </button>
                          <AnimatePresence initial={false}>
                            {isOpen ? (
                              <motion.div
                                className="cycle-accordion-panel border-t-2 border-line p-4"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                              >
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => requestNavigate(lessonHref)}
                                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-3 text-xs font-black text-ink shadow-[2px_2px_0_0_var(--shadow-hard-15)]"
                                  >
                                    <LayoutDashboard className="size-4" />
                                    {t(locale, "Editor lekcije", "Lesson editor")}
                                  </button>
                                </div>
                                <div className="mt-4 rounded-[8px] bg-paper-strong p-2">
                                  {itemCount ? (
                                    <div className="ml-3 space-y-1 border-l-2 border-line pl-4">
                                      {renderCyclePartTree(parts, lessonHref)}
                                      {(lesson.steps ?? []).map((step, index) =>
                                        renderCycleLeafItem({
                                          key: step._id,
                                          title:
                                            (locale === "sr" ? step.titleSr : step.titleEn) ||
                                            `${t(locale, "Korak", "Step")} ${index + 1}`,
                                          href: `${lessonHref}?step=${step._id}`,
                                        }),
                                      )}
                                      {(lesson.tasks ?? []).map((task, index) =>
                                        renderCycleLeafItem({
                                          key: task._id,
                                          title:
                                            (locale === "sr" ? task.titleSr : task.titleEn) ||
                                            `${t(locale, "Zadatak", "Task")} ${index + 1}`,
                                          href: `${lessonHref}?task=${task._id}`,
                                        }),
                                      )}
                                    </div>
                                  ) : (
                                    <p className="rounded-[8px] border-2 border-dashed border-line bg-paper p-3 text-xs font-black text-muted">
                                      {t(locale, "Nema dodatnih delova u ovoj lekciji.", "No extra items in this lesson.")}
                                    </p>
                                  )}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-[8px] border-2 border-dashed border-line bg-paper p-4 text-sm font-black text-muted">
                    {t(locale, "Nema lekcija u ovom ciklusu.", "No lessons in this cycle.")}
                  </p>
                )}
              </FormSection>
            </div>
            <EntityPreview
              locale={locale}
              title={titleSr || titleEn}
              subtitle={descriptionSr || descriptionEn || t(locale, "Ciklus u trenutnom kursu", "Cycle in the current course")}
              meta={`${sortOrder}`}
              emptyLabel={t(locale, "Novi ciklus", "New cycle")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={isEditing ? t(locale, "Sacuvaj ciklus", "Save cycle") : t(locale, "Dodaj ciklus", "Add cycle")}
            message={message}
            icon={<Layers className="size-4" />}
          />
        </form>
      </AdminComposerSheet>
      {typeof document !== "undefined" ? (
        createPortal(
          <AnimatePresence>
            {pendingAction ? (
              <motion.div
                className="fixed inset-0 z-[70] flex items-center justify-center bg-scrim/45 p-4 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  className="w-full max-w-md rounded-[10px] border-2 border-ink bg-paper-strong p-5 shadow-[8px_8px_0_0_var(--shadow-hard-22)]"
                  initial={{ y: 16, scale: 0.98 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: 10, scale: 0.99 }}
                >
                  <p className="text-xs font-black uppercase text-muted">{t(locale, "Nesnimljene izmene", "Unsaved changes")}</p>
                  <h3 className="mt-2 text-2xl font-black text-ink">
                    {t(locale, "Sacuvati izmene na ciklusu?", "Save changes to this cycle?")}
                  </h3>
                  <p className="mt-3 text-sm font-bold leading-6 text-muted">
                    {t(locale, "Pre nastavka izaberi da li se informacije o ciklusu cuvaju.", "Before continuing, choose whether to save the cycle information.")}
                  </p>
                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={saveAndContinue}
                      disabled={pending}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black text-ink disabled:cursor-wait disabled:opacity-60"
                    >
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      {t(locale, "Sacuvaj", "Save")}
                    </button>
                    <button
                      type="button"
                      onClick={discardAndContinue}
                      className="inline-flex min-h-11 items-center justify-center rounded-[8px] border-2 border-ink bg-paper-strong px-3 text-xs font-black text-ink"
                    >
                      {t(locale, "Ponisti", "Discard")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingAction(null)}
                      className="inline-flex min-h-11 items-center justify-center rounded-[8px] border-2 border-line bg-paper px-3 text-xs font-black text-muted"
                    >
                      {t(locale, "Ostani", "Stay")}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body
        )
      ) : null}
    </>
  );
}

export function EditModuleAction(props: Omit<Parameters<typeof AddModuleAction>[0], "buttonLabel">) {
  return <AddModuleAction {...props} buttonLabel={t(props.locale, "Izmeni ciklus", "Edit cycle")} />;
}

type LessonActionInitial = {
  slug: string;
  title: { sr: string; en: string };
  summary: { sr: string; en: string };
  summaryRich?: { sr: string; en: string };
  durationSeconds?: number;
  isPublished: boolean;
  sortOrder: number;
};

export function AddLessonAction({
  locale,
  courseId,
  courseSlug,
  moduleId,
  lessonId,
  initial,
  nextSortOrder,
  tone = "compact",
  iconOnly = false,
  buttonLabel,
  initialOpenKey,
}: {
  locale: Locale;
  courseId?: string;
  courseSlug?: string;
  moduleId?: string;
  lessonId?: string;
  initial?: LessonActionInitial;
  nextSortOrder: number;
  tone?: ButtonTone;
  iconOnly?: boolean;
  buttonLabel?: string;
  initialOpenKey?: string | null;
}) {
  const router = useRouter();
  const upsertLesson = useMutation(api.courses.upsertLesson);
  const [open, setOpen] = useState(false);
  const [titleSr, setTitleSr] = useState(initial?.title.sr ?? "");
  const [titleEn, setTitleEn] = useState(initial?.title.en ?? "");
  const [contentLocale, setContentLocale] = useState<Locale>(locale);
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [summarySr, setSummarySr] = useState(initial?.summary.sr ?? "");
  const [summaryEn, setSummaryEn] = useState(initial?.summary.en ?? "");
  const [summaryRichSr, setSummaryRichSr] = useState(initial?.summaryRich?.sr || plainTextToRichText(initial?.summary.sr ?? ""));
  const [summaryRichEn, setSummaryRichEn] = useState(initial?.summaryRich?.en || plainTextToRichText(initial?.summary.en ?? ""));
  const [durationMinutes, setDurationMinutes] = useState(Math.max(1, Math.round((initial?.durationSeconds ?? 600) / 60)));
  const [isPublished, setIsPublished] = useState(initial?.isPublished ?? false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dismissedOpenKey, setDismissedOpenKey] = useState<string | null>(null);
  const isEditing = Boolean(lessonId);
  const actionLabel = buttonLabel ?? (isEditing ? t(locale, "Izmeni lekciju", "Edit lesson") : t(locale, "Dodaj lekciju", "Add lesson"));
  const dialogTitle = isEditing ? t(locale, "Izmeni lekciju", "Edit lesson") : t(locale, "Dodaj lekciju", "Add lesson");
  const shouldAutoOpen = Boolean(
    initialOpenKey && moduleId && !lessonId && initialOpenKey === moduleId && dismissedOpenKey !== initialOpenKey,
  );
  const sheetOpen = open || shouldAutoOpen;

  function closeSheet() {
    setOpen(false);
    if (initialOpenKey) {
      setDismissedOpenKey(initialOpenKey);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!courseId || !moduleId) return;
    if (!titleSr.trim() || (isPublished && !richTextHasContent(summaryRichSr, summarySr))) {
      setMessage(t(locale, "Popuni SR naziv i sažetak pre objave lekcije.", "Complete the Serbian title and summary before publishing the lesson."));
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const savedSlug = slug || slugify(titleSr || titleEn);
      const safeDurationMinutes = Number.isFinite(durationMinutes) ? Math.max(1, Math.round(durationMinutes)) : 1;
      await upsertLesson({
        ...(lessonId ? { lessonId: lessonId as Id<"lessons"> } : {}),
        courseId: courseId as Id<"courses">,
        moduleId: moduleId as Id<"modules">,
        slug: savedSlug,
        titleSr,
        titleEn,
        summarySr,
        summaryEn,
        summaryRichSr,
        summaryRichEn: richTextHasContent(summaryRichEn, summaryEn) ? summaryRichEn : undefined,
        durationSeconds: safeDurationMinutes * 60,
        isPublished,
        sortOrder: initial?.sortOrder ?? nextSortOrder,
      });
      closeSheet();
      if (!lessonId && courseSlug) {
        router.push(lessonEditPath(locale, courseSlug, savedSlug));
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(locale, "Cuvanje nije uspelo.", "Save failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {iconOnly ? (
        <AdminIconButton label={actionLabel} onClick={() => setOpen(true)} disabled={!courseId || !moduleId}>
          {isEditing ? <Pencil className="size-3.5" /> : <Plus className="size-4" />}
        </AdminIconButton>
      ) : (
        <AdminActionButton onClick={() => setOpen(true)} tone={tone} disabled={!courseId || !moduleId}>
          {isEditing ? <Pencil className="size-4" /> : <ListPlus className="size-4" />}
          {actionLabel}
        </AdminActionButton>
      )}
      <AdminComposerSheet
        title={dialogTitle}
        eyebrow={t(locale, "Composer lekcije", "Lesson composer")}
        open={sheetOpen}
        onClose={closeSheet}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <FormSection
                icon={<ListPlus className="size-5" />}
                title={t(locale, "Osnovni podaci", "Basics")}
                body={t(locale, "Naziv, URL i trajanje lekcije za navigaciju i player.", "Name, URL, and duration used by navigation and the player.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2"><LocalizedPairSwitch locale={contentLocale} onChange={setContentLocale} sr={titleSr} en={titleEn} /></div>
                  <Field label={contentLocale === "sr" ? "Naziv lekcije" : "Lesson title"}>
                    <input className={inputClass} value={contentLocale === "sr" ? titleSr : titleEn} onChange={(event) => contentLocale === "sr" ? setTitleSr(event.target.value) : setTitleEn(event.target.value)} required />
                  </Field>
                  <SlugField
                    label="Slug"
                    value={slug}
                    onChange={setSlug}
                    placeholder={slugify(titleSr || titleEn)}
                    locale={locale}
                  />
                  <Field label={t(locale, "Trajanje u minutima", "Duration in minutes")}>
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      value={durationMinutes}
                      onChange={(event) => {
                        const nextDuration = Number(event.target.value);
                        setDurationMinutes(Number.isFinite(nextDuration) ? Math.max(1, nextDuration) : 1);
                      }}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                icon={<FileText className="size-5" />}
                title={t(locale, "Kratak opis", "Summary")}
                body={t(locale, "Ovo korisnik vidi pre ulaska u lekciju.", "This is what a user sees before opening the lesson.")}
              >
                <div className="space-y-3">
                  <LocalizedPairSwitch locale={contentLocale} onChange={setContentLocale} sr={summarySr} en={summaryEn} />
                  <RichTextEditor value={contentLocale === "sr" ? summaryRichSr : summaryRichEn} fallback={contentLocale === "sr" ? summarySr : summaryEn} onChange={(json, plain) => { if (contentLocale === "sr") { setSummaryRichSr(json); setSummarySr(plain); } else { setSummaryRichEn(json); setSummaryEn(plain); } }} />
                  {contentLocale === "en" && !summaryEn.trim() ? <p className="rounded-[8px] border-2 border-amber-700 bg-amber-50 p-3 text-xs font-black text-amber-950">EN sažetak nedostaje, ali ne blokira objavu.</p> : null}
                </div>
              </FormSection>

              <FormSection
                icon={<Check className="size-5" />}
                title={t(locale, "Vidljivost", "Visibility")}
                body={t(locale, "Admin moze da radi na nacrtu bez prikaza korisnicima.", "Admins can work on drafts before users see them.")}
              >
                <PublishToggle locale={locale} checked={isPublished} onChange={setIsPublished} />
              </FormSection>
            </div>
            <EntityPreview
              locale={locale}
              title={titleSr || titleEn}
              subtitle={summarySr || summaryEn}
              status={isPublished ? t(locale, "Objavljeno", "Published") : t(locale, "Nacrt", "Draft")}
              meta={`${Math.max(1, durationMinutes || 1)} min`}
              emptyLabel={t(locale, "Nova lekcija", "New lesson")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={isEditing ? t(locale, "Sacuvaj lekciju", "Save lesson") : t(locale, "Dodaj lekciju", "Add lesson")}
            message={message}
            icon={<ListPlus className="size-4" />}
          />
        </form>
      </AdminComposerSheet>
    </>
  );
}

export function EditLessonAction(props: Omit<Parameters<typeof AddLessonAction>[0], "buttonLabel">) {
  return <AddLessonAction {...props} buttonLabel={t(props.locale, "Izmeni lekciju", "Edit lesson")} />;
}

type LessonPartActionInitial = {
  slug: string;
  parentPartId?: string;
  title: { sr: string; en: string };
  kind: LessonPartKind;
  body?: { sr: string; en: string };
  bodyRich?: { sr: string; en: string };
  fileName?: string;
  downloadUrl?: string | null;
  isPublished?: boolean;
  sortOrder?: number;
};

export function AddLessonPartAction({
  locale,
  courseId,
  lessonId,
  lessonPartId,
  parentPartId,
  initial,
  nextSortOrder,
  tone = "inline",
  iconOnly = false,
  buttonLabel,
}: {
  locale: Locale;
  courseId?: string;
  lessonId?: string;
  lessonPartId?: string;
  parentPartId?: string;
  initial?: LessonPartActionInitial;
  nextSortOrder: number;
  tone?: ButtonTone;
  iconOnly?: boolean;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const upsertLessonPart = useMutation(api.courses.upsertLessonPart);
  const removeLessonPartFile = useMutation(api.courses.removeLessonPartFile);
  const generateUploadUrl = useMutation(api.video.createDocumentUploadUrl);
  const [open, setOpen] = useState(false);
  const titleSr = initial?.title.sr ?? "";
  const titleEn = initial?.title.en ?? "";
  const [contentLocale, setContentLocale] = useState<Locale>(locale);
  const [kind, setKind] = useState<LessonPartKind>(initial?.kind ?? "text");
  const [bodySr, setBodySr] = useState(initial?.body?.sr ?? "");
  const [bodyEn, setBodyEn] = useState(initial?.body?.en ?? "");
  const [bodyRichSr, setBodyRichSr] = useState(initial?.bodyRich?.sr || plainTextToRichText(initial?.body?.sr ?? ""));
  const [bodyRichEn, setBodyRichEn] = useState(initial?.bodyRich?.en || plainTextToRichText(initial?.body?.en ?? ""));
  const [file, setFile] = useState<File | null>(null);
  const [existingFileRemoved, setExistingFileRemoved] = useState(false);
  const [isPublished, setIsPublished] = useState(initial?.isPublished ?? true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [fileDragging, setFileDragging] = useState(false);
  const fileDragDepthRef = useRef(0);
  const isEditing = Boolean(lessonPartId);
  const hasExistingFile = Boolean(initial?.fileName || initial?.downloadUrl) && !existingFileRemoved;
  const effectiveParentPartId = parentPartId ?? initial?.parentPartId;
  const actionLabel =
    buttonLabel ??
    (isEditing
      ? t(locale, "Izmeni blok", "Edit block")
      : effectiveParentPartId
        ? t(locale, "Dodaj blok", "Add block")
        : t(locale, "Dodaj blok", "Add block"));
  const dialogTitle = isEditing
    ? t(locale, "Izmeni sadržajni blok", "Edit content block")
    : effectiveParentPartId
      ? t(locale, "Dodaj sadržajni blok", "Add content block")
      : t(locale, "Dodaj sadržajni blok", "Add content block");

  const applyDroppedFile = useEffectEvent((candidate: File) => {
    if (pending || (kind === "video" && !isVideoFile(candidate)) || (kind === "image" && !isImageFile(candidate))) return;
    setFile(candidate);
    setMessage(null);
  });

  useEffect(() => {
    function resetDragging() {
      fileDragDepthRef.current = 0;
      setFileDragging(false);
    }

    if (!open || kind === "text") {
      resetDragging();
      return;
    }

    function acceptsDrag(dataTransfer: DataTransfer | null | undefined) {
      return kind === "video" ? hasVideoCandidateDrag(dataTransfer) : kind === "image" ? hasImageCandidateDrag(dataTransfer) : hasFileCandidateDrag(dataTransfer);
    }

    function handleWindowDragEnter(event: globalThis.DragEvent) {
      if (!hasFileCandidateDrag(event.dataTransfer)) return;
      event.preventDefault();
      if (!acceptsDrag(event.dataTransfer)) return;
      fileDragDepthRef.current += 1;
      setFileDragging(true);
    }

    function handleWindowDragOver(event: globalThis.DragEvent) {
      if (!hasFileCandidateDrag(event.dataTransfer)) return;
      event.preventDefault();
      const accepted = acceptsDrag(event.dataTransfer);
      if (event.dataTransfer) event.dataTransfer.dropEffect = accepted ? "copy" : "none";
      setFileDragging(accepted);
    }

    function handleWindowDragLeave() {
      fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
      if (fileDragDepthRef.current === 0) setFileDragging(false);
    }

    function handleWindowDrop(event: globalThis.DragEvent) {
      if (!hasFileCandidateDrag(event.dataTransfer) && fileDragDepthRef.current === 0) return;
      event.preventDefault();
      const candidate = event.dataTransfer?.files?.[0];
      const accepted = Boolean(candidate && (kind === "file" || (kind === "video" && isVideoFile(candidate)) || (kind === "image" && isImageFile(candidate))));
      resetDragging();
      if (candidate && accepted) applyDroppedFile(candidate);
      else setMessage(t(locale, "Ovaj tip fajla nije dozvoljen.", "This file type is not allowed."));
    }

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
      resetDragging();
    };
  }, [kind, locale, open]);

  async function uploadSelectedFile(): Promise<UploadedFilePayload> {
    if (!file) return {};
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
          ? `${t(locale, "Upload nije uspeo", "Upload failed")}: ${detail.slice(0, 240)}`
          : t(locale, "Upload nije uspeo.", "Upload failed."),
      );
    }
    const result = (await response.json()) as { storageId?: Id<"_storage"> };
    if (!result.storageId) {
      throw new Error(t(locale, "Convex nije vratio storageId.", "Convex did not return a storageId."));
    }
    return {
      storageId: result.storageId,
      fileName: file.name,
      byteSize: file.size,
      mimeType: file.type || "application/octet-stream",
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!courseId || !lessonId) return;
    if (kind === "text" && isPublished && !richTextHasContent(bodyRichSr, bodySr)) {
      setMessage(t(locale, "Dodaj tekst na srpskom pre objave bloka.", "Add Serbian text before publishing the block."));
      return;
    }
    if ((kind === "image" || kind === "video" || kind === "file") && !file && !hasExistingFile) {
      setMessage(t(locale, "Izaberi fajl za ovaj blok.", "Choose a file for this block."));
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const filePayload = await uploadSelectedFile();
      const generatedTitleSr = titleSr || (kind === "text" ? "Tekst" : kind === "image" ? "Slika" : kind === "video" ? "Video" : "Fajl");
      const generatedTitleEn = titleEn || (kind === "text" ? "Text" : kind === "image" ? "Image" : kind === "video" ? "Video" : "File");
      await upsertLessonPart({
        ...(lessonPartId ? { lessonPartId: lessonPartId as Id<"lessonParts"> } : {}),
        courseId: courseId as Id<"courses">,
        lessonId: lessonId as Id<"lessons">,
        ...(effectiveParentPartId ? { parentPartId: effectiveParentPartId as Id<"lessonParts"> } : {}),
        slug: initial?.slug || `blok-${nextSortOrder}`,
        titleSr: generatedTitleSr,
        titleEn: generatedTitleEn,
        kind,
        bodySr: bodySr || undefined,
        bodyEn: bodyEn || undefined,
        bodyRichSr: kind === "text" ? bodyRichSr : undefined,
        bodyRichEn: kind === "text" && richTextHasContent(bodyRichEn, bodyEn) ? bodyRichEn : undefined,
        ...filePayload,
        isPublished,
        sortOrder: initial?.sortOrder ?? nextSortOrder,
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(locale, "Cuvanje nije uspelo.", "Save failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {iconOnly ? (
        <AdminIconButton label={actionLabel} onClick={() => setOpen(true)} disabled={!courseId || !lessonId}>
          {isEditing ? <Pencil className="size-3.5" /> : <Plus className="size-4" />}
        </AdminIconButton>
      ) : (
        <AdminActionButton onClick={() => setOpen(true)} tone={tone} disabled={!courseId || !lessonId}>
          {isEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {actionLabel}
        </AdminActionButton>
      )}
      <AdminComposerSheet
        title={dialogTitle}
        eyebrow={t(locale, "Light sadržaj lekcije", "Light lesson content")}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <FormSection
                icon={<FileText className="size-5" />}
                title={t(locale, "Tip bloka", "Block type")}
                body={t(locale, "Izaberi šta dodaješ. Interni naziv se pravi automatski i student ga ne vidi.", "Choose what to add. The internal name is generated automatically and stays hidden.")}
              >
                <div>
                  <KindControl<LessonPartKind>
                    value={kind}
                    onChange={(nextKind) => {
                      setKind(nextKind);
                      setFile(null);
                    }}
                    options={[
                      { value: "text", label: t(locale, "Tekst", "Text"), body: t(locale, "Lekcija u pisanom obliku", "Written lesson content") },
                      { value: "image", label: t(locale, "Slika", "Image"), body: t(locale, "Fotografija, ilustracija ili screenshot", "Photo, illustration, or screenshot") },
                      { value: "video", label: t(locale, "Video", "Video"), body: t(locale, "Upload video fajla", "Video file upload") },
                      { value: "file", label: t(locale, "Fajl", "File"), body: t(locale, "Materijal za preuzimanje", "Downloadable material") },
                    ]}
                  />
                </div>
              </FormSection>

              <FormSection
                icon={kind === "text" ? <BookOpen className="size-5" /> : <UploadCloud className="size-5" />}
                title={kind === "text" ? t(locale, "Sadrzaj", "Content") : t(locale, "Upload", "Upload")}
                body={
                  kind === "text"
                    ? t(locale, "Tekst ostaje direktno u delu lekcije.", "Text stays directly inside the lesson part.")
                    : t(locale, "Fajl se prvo uploaduje u Convex storage, zatim se cuva deo lekcije.", "The file uploads to Convex storage before the lesson part is saved.")
                }
              >
                {kind === "text" ? (
                  <div className="space-y-3">
                    <LocalizedPairSwitch locale={contentLocale} onChange={setContentLocale} sr={bodySr} en={bodyEn} />
                    <RichTextEditor value={contentLocale === "sr" ? bodyRichSr : bodyRichEn} fallback={contentLocale === "sr" ? bodySr : bodyEn} onChange={(json, plain) => { if (contentLocale === "sr") { setBodyRichSr(json); setBodySr(plain); } else { setBodyRichEn(json); setBodyEn(plain); } }} />
                    {contentLocale === "en" && !bodyEn.trim() ? <p className="rounded-[8px] border-2 border-amber-700 bg-amber-50 p-3 text-xs font-black text-amber-950">EN tekst nedostaje, ali ne blokira objavu.</p> : null}
                  </div>
                ) : (
                  <div><FileDropzone
                    locale={locale}
                    label={kind === "video" ? "Video fajl" : kind === "image" ? t(locale, "Slika", "Image") : t(locale, "Fajl za preuzimanje", "Download file")}
                    accept={kind === "video" ? "video/*" : kind === "image" ? "image/*" : undefined}
                    file={file}
                    onFileChange={setFile}
                    required={!hasExistingFile}
                    currentFile={initial?.fileName}
                  />
                  {lessonPartId && hasExistingFile ? <button type="button" disabled={pending} onClick={async () => { if (!confirm(t(locale, "Ukloniti fajl iz ovog bloka?", "Remove the file from this block?"))) return; setPending(true); try { await removeLessonPartFile({ lessonPartId: lessonPartId as Id<"lessonParts"> }); setExistingFileRemoved(true); setIsPublished(false); setFile(null); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Uklanjanje nije uspelo."); } finally { setPending(false); } }} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-red-700 bg-paper-strong px-4 text-xs font-black text-red-700"><Trash2 className="size-4" />{t(locale, "Ukloni postojeći fajl", "Remove existing file")}</button> : null}
                  </div>
                )}
              </FormSection>

              <FormSection
                icon={<Check className="size-5" />}
                title={t(locale, "Vidljivost", "Visibility")}
                body={t(locale, "Poddelovi nasledjuju kontekst lekcije, ali imaju svoj publish status.", "Subparts inherit the lesson context but keep their own publish state.")}
              >
                <PublishToggle locale={locale} checked={isPublished} onChange={setIsPublished} />
              </FormSection>
            </div>
            <EntityPreview
              locale={locale}
              title={kind === "text" ? t(locale, "Tekstualni blok", "Text block") : kind === "image" ? t(locale, "Slika", "Image") : kind === "video" ? "Video" : t(locale, "Fajl", "File")}
              subtitle={kind === "text" ? bodySr || bodyEn : file?.name || initial?.fileName}
              status={isPublished ? t(locale, "Objavljeno", "Published") : t(locale, "Nacrt", "Draft")}
              meta={effectiveParentPartId ? t(locale, "Poddeo", "Subpart") : kind}
              emptyLabel={t(locale, "Novi blok", "New block")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={isEditing ? t(locale, "Sačuvaj blok", "Save block") : t(locale, "Dodaj blok", "Add block")}
            message={message}
          />
        </form>
        <AnimatePresence>
          {fileDragging ? (
            <motion.div
              className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-scrim/45 p-4 backdrop-blur-[3px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="absolute inset-4 rounded-[28px] border-[3px] border-dashed border-yellow" />
              <div className="relative max-w-sm rounded-[16px] border-2 border-ink bg-paper-strong p-6 text-center shadow-[8px_8px_0_rgba(244,190,48,0.85)]">
                <UploadCloud className="mx-auto size-9" />
                <p className="mt-3 text-lg font-black">
                  {kind === "video"
                    ? t(locale, "Pusti video bilo gde", "Drop the video anywhere")
                    : kind === "image"
                      ? t(locale, "Pusti sliku bilo gde", "Drop the image anywhere")
                    : t(locale, "Pusti fajl bilo gde", "Drop the file anywhere")}
                </p>
                <p className="mt-2 text-sm font-bold text-muted">
                  {t(locale, "Fajl će biti dodat ovom Light bloku.", "The file will be attached to this Light block.")}
                </p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </AdminComposerSheet>
    </>
  );
}

export function EditLessonPartAction(props: Omit<Parameters<typeof AddLessonPartAction>[0], "buttonLabel">) {
  return <AddLessonPartAction {...props} buttonLabel={t(props.locale, "Izmeni blok", "Edit block")} />;
}

export function AddAssetAction({
  locale,
  courseId,
  lessonId,
  tone = "inline",
}: {
  locale: Locale;
  courseId?: string;
  lessonId?: string;
  tone?: ButtonTone;
}) {
  const router = useRouter();
  const generateUploadUrl = useMutation(api.video.createDocumentUploadUrl);
  const saveLessonAsset = useMutation(api.video.saveLessonAsset);
  const [open, setOpen] = useState(false);
  const [titleSr, setTitleSr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [contentLocale, setContentLocale] = useState<Locale>(locale);
  const [kind, setKind] = useState<AssetKind>("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!courseId || !lessonId || !file) return;
    if (!titleSr.trim() || !titleEn.trim()) {
      setMessage(t(locale, "Popuni naziv materijala na SR i EN.", "Complete the material name in SR and EN."));
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const upload = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!upload.ok) {
        const detail = await upload.text().catch(() => "");
        throw new Error(
          detail
            ? `${t(locale, "Upload nije uspeo", "Upload failed")}: ${detail.slice(0, 240)}`
            : t(locale, "Upload nije uspeo.", "Upload failed."),
        );
      }
      const { storageId } = (await upload.json()) as { storageId?: Id<"_storage"> };
      if (!storageId) {
        throw new Error(t(locale, "Convex nije vratio storageId.", "Convex did not return a storageId."));
      }
      await saveLessonAsset({
        courseId: courseId as Id<"courses">,
        lessonId: lessonId as Id<"lessons">,
        titleSr,
        titleEn,
        kind,
        storageId,
        fileName: file.name,
        byteSize: file.size,
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(locale, "Cuvanje nije uspelo.", "Save failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AdminActionButton onClick={() => setOpen(true)} tone={tone} disabled={!courseId || !lessonId}>
        <FileUp className="size-4" />
        {t(locale, "Dodaj fajl", "Add file")}
      </AdminActionButton>
      <AdminComposerSheet
        title={t(locale, "Dodaj fajl", "Add file")}
        eyebrow={t(locale, "Composer materijala", "Material composer")}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <FormSection
                icon={<FileUp className="size-5" />}
                title={t(locale, "Naziv materijala", "Material name")}
                body={t(locale, "Materijali stoje uz lekciju kao PDF, prompt, worksheet ili projekat.", "Materials sit next to the lesson as PDFs, prompts, worksheets, or projects.")}
              >
                <div className="space-y-3">
                  <LocalizedPairSwitch locale={contentLocale} onChange={setContentLocale} sr={titleSr} en={titleEn} />
                  <Field label={contentLocale === "sr" ? "Naziv materijala" : "Material name"}>
                    <input className={inputClass} value={contentLocale === "sr" ? titleSr : titleEn} onChange={(event) => contentLocale === "sr" ? setTitleSr(event.target.value) : setTitleEn(event.target.value)} required />
                  </Field>
                </div>
                <div className="mt-4">
                  <KindControl<AssetKind>
                    value={kind}
                    onChange={setKind}
                    options={[
                      { value: "pdf", label: "PDF" },
                      { value: "prompt", label: "Prompt" },
                      { value: "worksheet", label: "Worksheet" },
                      { value: "project", label: "Project" },
                    ]}
                  />
                </div>
              </FormSection>

              <FormSection
                icon={<UploadCloud className="size-5" />}
                title="Upload"
                body={t(locale, "Izaberi fajl koji ce biti povezan sa ovom lekcijom.", "Choose the file that will be attached to this lesson.")}
              >
                <FileDropzone locale={locale} label="Upload" file={file} onFileChange={setFile} required />
              </FormSection>
            </div>
            <EntityPreview
              locale={locale}
              title={titleSr || titleEn}
              subtitle={file?.name}
              status={kind.toUpperCase()}
              meta={file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : undefined}
              emptyLabel={t(locale, "Novi materijal", "New material")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={t(locale, "Upload fajla", "Upload file")}
            message={message}
            icon={<UploadCloud className="size-4" />}
          />
        </form>
      </AdminComposerSheet>
    </>
  );
}
