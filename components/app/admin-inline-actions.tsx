"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/components/ui/primitives";
import { withLocale, type Locale } from "@/lib/i18n";
import { useMutation } from "convex/react";
import { FileUp, Layers, ListPlus, Pencil, Plus, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";

type ButtonTone = "inline" | "compact";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function AdminActionButton({
  children,
  onClick,
  tone = "inline",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white text-sm font-extrabold text-ink transition hover:bg-yellow disabled:cursor-not-allowed disabled:opacity-50",
        tone === "inline" && "min-h-10 px-3",
        tone === "compact" && "min-h-8 px-2 text-xs",
      )}
    >
      {children}
    </button>
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
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] border-2 border-ink bg-white text-ink transition hover:bg-yellow disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function AdminDialog({
  title,
  children,
  open,
  onClose,
}: {
  title: string;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[8px] border-2 border-ink bg-white p-5 shadow-[8px_8px_0_0_rgba(14,49,88,0.25)]">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xl font-black text-ink">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-[8px] border-2 border-ink bg-paper text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-ink">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-[8px] border-2 border-ink bg-white px-3 text-sm font-bold text-ink outline-none focus:border-yellow";
const textareaClass =
  "w-full resize-none rounded-[8px] border-2 border-ink bg-white p-3 text-sm font-bold text-ink outline-none focus:border-yellow";

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_#0e3158] disabled:cursor-wait disabled:opacity-70"
    >
      <Plus className="size-4" />
      {label}
    </button>
  );
}

type CourseActionInitial = {
  slug: string;
  title: { sr: string; en: string };
  subtitle: { sr: string; en: string };
  description: { sr: string; en: string };
  status: "draft" | "published" | "archived";
  sortOrder: number;
};

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
  const [open, setOpen] = useState(false);
  const [titleSr, setTitleSr] = useState(initial?.title.sr ?? "");
  const [titleEn, setTitleEn] = useState(initial?.title.en ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [subtitleSr, setSubtitleSr] = useState(initial?.subtitle.sr ?? "");
  const [subtitleEn, setSubtitleEn] = useState(initial?.subtitle.en ?? "");
  const [descriptionSr, setDescriptionSr] = useState(initial?.description.sr ?? "");
  const [descriptionEn, setDescriptionEn] = useState(initial?.description.en ?? "");
  const [status, setStatus] = useState<"draft" | "published" | "archived">(initial?.status ?? "draft");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isEditing = Boolean(courseId);
  const actionLabel =
    buttonLabel ?? (isEditing ? labelFor(locale, "Izmeni smer", "Edit track") : labelFor(locale, "Dodaj smer", "Add track"));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const savedSlug = slug || slugify(titleSr || titleEn);
      await upsertCourse({
        ...(courseId ? { courseId: courseId as Id<"courses"> } : {}),
        slug: savedSlug,
        titleSr,
        titleEn: titleEn || titleSr,
        subtitleSr,
        subtitleEn: subtitleEn || subtitleSr,
        descriptionSr,
        descriptionEn: descriptionEn || descriptionSr,
        status,
        sortOrder: initial?.sortOrder ?? nextSortOrder,
      });
      setOpen(false);
      router.push(`${withLocale(locale, "/app")}?course=${savedSlug}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labelFor(locale, "Cuvanje nije uspelo.", "Save failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {iconOnly ? (
        <AdminIconButton label={actionLabel} onClick={() => setOpen(true)}>
          {isEditing ? <Pencil className="size-3.5" /> : <Plus className="size-4" />}
        </AdminIconButton>
      ) : (
        <AdminActionButton onClick={() => setOpen(true)} tone="compact">
          {isEditing ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {actionLabel}
        </AdminActionButton>
      )}
      <AdminDialog title={actionLabel} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Naziv SR"><input className={inputClass} value={titleSr} onChange={(e) => setTitleSr(e.target.value)} required /></Field>
            <Field label="Title EN"><input className={inputClass} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></Field>
            <Field label="Slug"><input className={inputClass} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder={slugify(titleSr || titleEn)} /></Field>
            <Field label="Status">
              <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published" | "archived")}>
                <option value="draft">{labelFor(locale, "Uskoro / nacrt", "Coming soon / draft")}</option>
                <option value="published">{labelFor(locale, "Objavljeno", "Published")}</option>
                <option value="archived">{labelFor(locale, "Arhivirano", "Archived")}</option>
              </select>
            </Field>
            <Field label="Podnaslov SR"><input className={inputClass} value={subtitleSr} onChange={(e) => setSubtitleSr(e.target.value)} required /></Field>
            <Field label="Subtitle EN"><input className={inputClass} value={subtitleEn} onChange={(e) => setSubtitleEn(e.target.value)} /></Field>
          </div>
          <Field label="Opis SR"><textarea className={textareaClass} rows={3} value={descriptionSr} onChange={(e) => setDescriptionSr(e.target.value)} required /></Field>
          <Field label="Description EN"><textarea className={textareaClass} rows={3} value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} /></Field>
          <SubmitButton pending={pending} label={isEditing ? labelFor(locale, "Sacuvaj", "Save") : labelFor(locale, "Dodaj", "Add")} />
          {message ? <p className="text-sm font-bold text-red-700">{message}</p> : null}
        </form>
      </AdminDialog>
    </>
  );
}

export function EditCourseAction(props: Omit<Parameters<typeof AddCourseAction>[0], "buttonLabel">) {
  return <AddCourseAction {...props} buttonLabel={labelFor(props.locale, "Izmeni smer", "Edit track")} />;
}

export function AddModuleAction({
  locale,
  courseId,
  moduleId,
  initial,
  nextSortOrder,
  tone = "compact",
  iconOnly = false,
  buttonLabel,
}: {
  locale: Locale;
  courseId?: string;
  moduleId?: string;
  initial?: { title: { sr: string; en: string }; sortOrder: number };
  nextSortOrder: number;
  tone?: ButtonTone;
  iconOnly?: boolean;
  buttonLabel?: string;
}) {
  const router = useRouter();
  const upsertModule = useMutation(api.courses.upsertModule);
  const [open, setOpen] = useState(false);
  const [titleSr, setTitleSr] = useState(initial?.title.sr ?? "");
  const [titleEn, setTitleEn] = useState(initial?.title.en ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isEditing = Boolean(moduleId);
  const actionLabel =
    buttonLabel ?? (isEditing ? labelFor(locale, "Izmeni modul", "Edit module") : labelFor(locale, "Dodaj modul", "Add module"));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!courseId) return;
    setPending(true);
    setMessage(null);
    try {
      await upsertModule({
        ...(moduleId ? { moduleId: moduleId as Id<"modules"> } : {}),
        courseId: courseId as Id<"courses">,
        titleSr,
        titleEn: titleEn || titleSr,
        sortOrder: initial?.sortOrder ?? nextSortOrder,
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labelFor(locale, "Cuvanje nije uspelo.", "Save failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {iconOnly ? (
        <AdminIconButton label={actionLabel} onClick={() => setOpen(true)} disabled={!courseId}>
          {isEditing ? <Pencil className="size-3.5" /> : <Plus className="size-4" />}
        </AdminIconButton>
      ) : (
        <AdminActionButton onClick={() => setOpen(true)} tone={tone} disabled={!courseId}>
          {isEditing ? <Pencil className="size-4" /> : <Layers className="size-4" />}
          {actionLabel}
        </AdminActionButton>
      )}
      <AdminDialog title={actionLabel} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Naziv SR"><input className={inputClass} value={titleSr} onChange={(e) => setTitleSr(e.target.value)} required /></Field>
          <Field label="Title EN"><input className={inputClass} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></Field>
          <SubmitButton pending={pending} label={isEditing ? labelFor(locale, "Sacuvaj", "Save") : labelFor(locale, "Dodaj", "Add")} />
          {message ? <p className="text-sm font-bold text-red-700">{message}</p> : null}
        </form>
      </AdminDialog>
    </>
  );
}

export function EditModuleAction(props: Omit<Parameters<typeof AddModuleAction>[0], "buttonLabel">) {
  return <AddModuleAction {...props} buttonLabel={labelFor(props.locale, "Izmeni modul", "Edit module")} />;
}

type LessonActionInitial = {
  slug: string;
  title: { sr: string; en: string };
  summary: { sr: string; en: string };
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
}) {
  const router = useRouter();
  const upsertLesson = useMutation(api.courses.upsertLesson);
  const [open, setOpen] = useState(false);
  const [titleSr, setTitleSr] = useState(initial?.title.sr ?? "");
  const [titleEn, setTitleEn] = useState(initial?.title.en ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [summarySr, setSummarySr] = useState(initial?.summary.sr ?? "");
  const [summaryEn, setSummaryEn] = useState(initial?.summary.en ?? "");
  const [durationMinutes, setDurationMinutes] = useState(Math.max(1, Math.round((initial?.durationSeconds ?? 600) / 60)));
  const [isPublished, setIsPublished] = useState(initial?.isPublished ?? true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isEditing = Boolean(lessonId);
  const actionLabel = buttonLabel ?? (isEditing ? labelFor(locale, "Izmeni lekciju", "Edit lesson") : labelFor(locale, "Dodaj lekciju", "Add lesson"));
  const dialogTitle = isEditing ? labelFor(locale, "Izmeni lekciju", "Edit lesson") : labelFor(locale, "Dodaj lekciju", "Add lesson");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!courseId || !moduleId) return;
    setPending(true);
    setMessage(null);
    try {
      const savedSlug = slug || slugify(titleSr || titleEn);
      await upsertLesson({
        ...(lessonId ? { lessonId: lessonId as Id<"lessons"> } : {}),
        courseId: courseId as Id<"courses">,
        moduleId: moduleId as Id<"modules">,
        slug: savedSlug,
        titleSr,
        titleEn: titleEn || titleSr,
        summarySr,
        summaryEn: summaryEn || summarySr,
        durationSeconds: Math.max(1, durationMinutes) * 60,
        isPublished,
        sortOrder: initial?.sortOrder ?? nextSortOrder,
      });
      setOpen(false);
      if (!lessonId && courseSlug) {
        router.push(withLocale(locale, `/app/courses/${courseSlug}/lessons/${savedSlug}`));
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labelFor(locale, "Cuvanje nije uspelo.", "Save failed."));
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
      <AdminDialog title={dialogTitle} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Naziv SR"><input className={inputClass} value={titleSr} onChange={(e) => setTitleSr(e.target.value)} required /></Field>
            <Field label="Title EN"><input className={inputClass} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></Field>
            <Field label="Slug"><input className={inputClass} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder={slugify(titleSr || titleEn)} /></Field>
            <Field label={labelFor(locale, "Trajanje (min)", "Duration (min)")}>
              <input className={inputClass} type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Summary SR"><textarea className={textareaClass} rows={3} value={summarySr} onChange={(e) => setSummarySr(e.target.value)} required /></Field>
          <Field label="Summary EN"><textarea className={textareaClass} rows={3} value={summaryEn} onChange={(e) => setSummaryEn(e.target.value)} /></Field>
          <label className="inline-flex items-center gap-2 text-sm font-black text-ink">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
            {labelFor(locale, "Objavljeno", "Published")}
          </label>
          <SubmitButton pending={pending} label={isEditing ? labelFor(locale, "Sacuvaj", "Save") : labelFor(locale, "Dodaj", "Add")} />
          {message ? <p className="text-sm font-bold text-red-700">{message}</p> : null}
        </form>
      </AdminDialog>
    </>
  );
}

export function EditLessonAction(props: Omit<Parameters<typeof AddLessonAction>[0], "buttonLabel">) {
  return <AddLessonAction {...props} buttonLabel={labelFor(props.locale, "Izmeni lekciju", "Edit lesson")} />;
}

type LessonPartActionInitial = {
  slug: string;
  parentPartId?: string;
  title: { sr: string; en: string };
  kind: "text" | "video" | "file";
  body?: { sr: string; en: string };
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
  const generateUploadUrl = useMutation(api.video.createDocumentUploadUrl);
  const [open, setOpen] = useState(false);
  const [titleSr, setTitleSr] = useState(initial?.title.sr ?? "");
  const [titleEn, setTitleEn] = useState(initial?.title.en ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [kind, setKind] = useState<"text" | "video" | "file">(initial?.kind ?? "text");
  const [bodySr, setBodySr] = useState(initial?.body?.sr ?? "");
  const [bodyEn, setBodyEn] = useState(initial?.body?.en ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [isPublished, setIsPublished] = useState(initial?.isPublished ?? true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isEditing = Boolean(lessonPartId);
  const hasExistingFile = Boolean(initial?.fileName || initial?.downloadUrl);
  const effectiveParentPartId = parentPartId ?? initial?.parentPartId;
  const actionLabel =
    buttonLabel ??
    (isEditing
      ? labelFor(locale, "Izmeni deo", "Edit part")
      : effectiveParentPartId
        ? labelFor(locale, "Dodaj poddeo", "Add subpart")
        : labelFor(locale, "Dodaj deo", "Add part"));
  const dialogTitle = isEditing
    ? labelFor(locale, "Izmeni deo lekcije", "Edit lesson part")
    : effectiveParentPartId
      ? labelFor(locale, "Dodaj poddeo lekcije", "Add lesson subpart")
      : labelFor(locale, "Dodaj deo lekcije", "Add lesson part");

  async function uploadSelectedFile() {
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
          ? `${labelFor(locale, "Upload nije uspeo", "Upload failed")}: ${detail.slice(0, 240)}`
          : labelFor(locale, "Upload nije uspeo.", "Upload failed."),
      );
    }
    const result = (await response.json()) as { storageId?: Id<"_storage"> };
    if (!result.storageId) {
      throw new Error(labelFor(locale, "Convex nije vratio storageId.", "Convex did not return a storageId."));
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
    if ((kind === "video" || kind === "file") && !file && !hasExistingFile) {
      setMessage(labelFor(locale, "Izaberi fajl za ovaj deo.", "Choose a file for this part."));
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const filePayload = await uploadSelectedFile();
      await upsertLessonPart({
        ...(lessonPartId ? { lessonPartId: lessonPartId as Id<"lessonParts"> } : {}),
        courseId: courseId as Id<"courses">,
        lessonId: lessonId as Id<"lessons">,
        ...(effectiveParentPartId ? { parentPartId: effectiveParentPartId as Id<"lessonParts"> } : {}),
        slug: slug || slugify(titleSr || titleEn),
        titleSr,
        titleEn: titleEn || titleSr,
        kind,
        bodySr: bodySr || undefined,
        bodyEn: bodyEn || bodySr || undefined,
        ...filePayload,
        isPublished,
        sortOrder: initial?.sortOrder ?? nextSortOrder,
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labelFor(locale, "Cuvanje nije uspelo.", "Save failed."));
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
      <AdminDialog title={dialogTitle} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Naziv SR"><input className={inputClass} value={titleSr} onChange={(e) => setTitleSr(e.target.value)} required /></Field>
            <Field label="Title EN"><input className={inputClass} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></Field>
            <Field label="Slug"><input className={inputClass} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder={slugify(titleSr || titleEn)} /></Field>
            <Field label={labelFor(locale, "Tip", "Type")}>
              <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as "text" | "video" | "file")}>
                <option value="text">{labelFor(locale, "Tekst", "Text")}</option>
                <option value="video">{labelFor(locale, "Video", "Video")}</option>
                <option value="file">{labelFor(locale, "Fajl", "File")}</option>
              </select>
            </Field>
          </div>
          {kind === "text" ? (
            <>
              <Field label="Tekst SR"><textarea className={textareaClass} rows={5} value={bodySr} onChange={(e) => setBodySr(e.target.value)} /></Field>
              <Field label="Text EN"><textarea className={textareaClass} rows={5} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} /></Field>
            </>
          ) : (
            <Field label={kind === "video" ? "Video fajl" : "Fajl za preuzimanje"}>
              {hasExistingFile ? (
                <p className="mb-2 rounded-[6px] border-2 border-line bg-paper px-3 py-2 text-xs font-black text-muted">
                  {locale === "sr" ? "Trenutni fajl" : "Current file"}: {initial?.fileName ?? "storage"}
                </p>
              ) : null}
              <input
                className="w-full rounded-[8px] border-2 border-ink bg-white p-3 text-sm font-bold text-ink"
                type="file"
                accept={kind === "video" ? "video/*" : undefined}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required={!hasExistingFile}
              />
            </Field>
          )}
          <label className="inline-flex items-center gap-2 text-sm font-black text-ink">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
            {labelFor(locale, "Objavljeno", "Published")}
          </label>
          <SubmitButton pending={pending} label={isEditing ? labelFor(locale, "Sacuvaj", "Save") : labelFor(locale, "Dodaj", "Add")} />
          {message ? <p className="text-sm font-bold text-red-700">{message}</p> : null}
        </form>
      </AdminDialog>
    </>
  );
}

export function EditLessonPartAction(props: Omit<Parameters<typeof AddLessonPartAction>[0], "buttonLabel">) {
  return <AddLessonPartAction {...props} buttonLabel={labelFor(props.locale, "Izmeni deo", "Edit part")} />;
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
  const [kind, setKind] = useState<"pdf" | "prompt" | "worksheet" | "project">("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!courseId || !lessonId || !file) return;
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
            ? `${labelFor(locale, "Upload nije uspeo", "Upload failed")}: ${detail.slice(0, 240)}`
            : labelFor(locale, "Upload nije uspeo.", "Upload failed."),
        );
      }
      const { storageId } = (await upload.json()) as { storageId?: Id<"_storage"> };
      if (!storageId) {
        throw new Error(labelFor(locale, "Convex nije vratio storageId.", "Convex did not return a storageId."));
      }
      await saveLessonAsset({
        courseId: courseId as Id<"courses">,
        lessonId: lessonId as Id<"lessons">,
        titleSr,
        titleEn: titleEn || titleSr,
        kind,
        storageId,
        fileName: file.name,
        byteSize: file.size,
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labelFor(locale, "Cuvanje nije uspelo.", "Save failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AdminActionButton onClick={() => setOpen(true)} tone={tone} disabled={!courseId || !lessonId}>
        <FileUp className="size-4" />
        {labelFor(locale, "Dodaj fajl", "Add file")}
      </AdminActionButton>
      <AdminDialog title={labelFor(locale, "Dodaj fajl", "Add file")} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Naziv SR"><input className={inputClass} value={titleSr} onChange={(e) => setTitleSr(e.target.value)} required /></Field>
            <Field label="Title EN"><input className={inputClass} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></Field>
            <Field label={labelFor(locale, "Tip fajla", "File type")}>
              <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as "pdf" | "prompt" | "worksheet" | "project")}>
                <option value="pdf">PDF</option>
                <option value="prompt">Prompt</option>
                <option value="worksheet">Worksheet</option>
                <option value="project">Project</option>
              </select>
            </Field>
            <Field label="Upload">
              <input
                className="w-full rounded-[8px] border-2 border-ink bg-white p-3 text-sm font-bold text-ink"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-5 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_#0e3158] disabled:cursor-wait disabled:opacity-70"
          >
            <UploadCloud className="size-4" />
            {labelFor(locale, "Upload", "Upload")}
          </button>
          {message ? <p className="text-sm font-bold text-red-700">{message}</p> : null}
        </form>
      </AdminDialog>
    </>
  );
}
