"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/components/ui/primitives";
import { withLocale, type Locale } from "@/lib/i18n";
import { useMutation } from "convex/react";
import {
  BookOpen,
  Check,
  FileText,
  FileUp,
  Layers,
  ListPlus,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";

type ButtonTone = "inline" | "compact";
type CourseStatus = "draft" | "published" | "archived";
type LessonPartKind = "text" | "video" | "file";
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

function labelFor(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function statusLabel(locale: Locale, status: CourseStatus) {
  if (status === "published") return labelFor(locale, "Objavljeno", "Published");
  if (status === "archived") return labelFor(locale, "Arhivirano", "Archived");
  return labelFor(locale, "Nacrt", "Draft");
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
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-white text-sm font-extrabold text-ink shadow-[3px_3px_0_0_rgba(14,49,88,0.16)] transition hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50",
        tone === "inline" && "min-h-10 px-3",
        tone === "compact" && "min-h-8 px-2 text-xs",
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
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-ink bg-white text-ink shadow-[2px_2px_0_0_rgba(14,49,88,0.14)] transition hover:bg-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </motion.button>
  );
}

function AdminComposerSheet({
  title,
  eyebrow,
  children,
  open,
  onClose,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !contentRef.current || shouldReduceMotion) return;

    const context = gsap.context(() => {
      gsap.from(".composer-stagger", {
        autoAlpha: 0,
        y: 14,
        duration: 0.36,
        ease: "power2.out",
        stagger: 0.05,
      });
    }, contentRef);

    return () => context.revert();
  }, [open, shouldReduceMotion]);

  const sheet = (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 bg-ink/35 p-0 backdrop-blur-[2px] sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={onClose}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(event) => event.stopPropagation()}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 42, scale: 0.985 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-hidden border-l-2 border-ink bg-paper shadow-[-12px_0_0_0_rgba(14,49,88,0.16)] sm:rounded-[10px] sm:border-2"
          >
            <div className="flex items-start justify-between gap-4 border-b-2 border-ink bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-muted">{eyebrow}</p>
                <h2 className="mt-1 text-2xl font-black leading-tight text-ink sm:text-3xl">{title}</h2>
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                aria-label="Close"
                whileHover={{ rotate: 3 }}
                whileTap={{ scale: 0.92 }}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-paper text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <X className="size-4" />
              </motion.button>
            </div>
            <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {children}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return typeof document === "undefined" ? null : createPortal(sheet, document.body);
}

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
    <section className="composer-stagger rounded-[8px] border-2 border-ink bg-white p-4 shadow-[5px_5px_0_0_rgba(14,49,88,0.12)]">
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

const inputClass =
  "h-11 w-full rounded-[8px] border-2 border-ink bg-white px-3 text-sm font-bold text-ink outline-none transition placeholder:text-muted/70 focus:border-yellow focus:ring-4 focus:ring-yellow/25";
const textareaClass =
  "w-full resize-none rounded-[8px] border-2 border-ink bg-white p-3 text-sm font-bold leading-6 text-ink outline-none transition placeholder:text-muted/70 focus:border-yellow focus:ring-4 focus:ring-yellow/25";

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
      hint={labelFor(
        locale,
        "URL identifikator. Ako ostane prazno, generise se iz naziva.",
        "URL identifier. Leave empty to generate it from the title.",
      )}
    >
      <div className="flex overflow-hidden rounded-[8px] border-2 border-ink bg-white focus-within:border-yellow focus-within:ring-4 focus-within:ring-yellow/25">
        <span className="flex min-h-11 items-center border-r-2 border-line bg-paper px-3 text-xs font-black text-muted">
          /
        </span>
        <input
          className="h-11 min-w-0 flex-1 bg-white px-3 text-sm font-bold text-ink outline-none"
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
      label: labelFor(locale, "Nacrt", "Draft"),
      body: labelFor(locale, "Vidljivo adminu", "Admin visible"),
    },
    {
      value: "published",
      label: labelFor(locale, "Objavljeno", "Published"),
      body: labelFor(locale, "Vidljivo korisnicima", "Visible to users"),
    },
    {
      value: "archived",
      label: labelFor(locale, "Arhiva", "Archive"),
      body: labelFor(locale, "Sklonjeno iz toka", "Removed from flow"),
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
              active ? "border-ink bg-yellow text-ink" : "border-line bg-paper text-muted hover:border-ink hover:bg-white",
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
        <span className="block text-sm font-black">{labelFor(locale, "Objavi odmah", "Publish now")}</span>
        <span className="mt-1 block text-xs font-bold">
          {checked
            ? labelFor(locale, "Korisnici mogu da vide ovaj sadrzaj.", "Users can see this content.")
            : labelFor(locale, "Sacuvano kao radna verzija.", "Saved as a draft.")}
        </span>
      </span>
      <span
        className={cn(
          "relative h-7 w-12 rounded-full border-2 border-ink bg-white transition",
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
              active ? "border-ink bg-yellow text-ink" : "border-line bg-paper text-muted hover:border-ink hover:bg-white",
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
          {labelFor(locale, "Trenutni fajl", "Current file")}: {currentFile}
        </p>
      ) : null}
      <label
        htmlFor={id}
        className="mt-2 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed border-ink bg-white p-4 text-center transition hover:bg-yellow/25"
      >
        <UploadCloud className="size-8 text-ink" />
        <span className="mt-3 text-sm font-black text-ink">
          {file?.name ?? labelFor(locale, "Izaberi ili prevuci fajl", "Choose or drop a file")}
        </span>
        <span className="mt-1 text-xs font-bold text-muted">
          {file
            ? `${Math.max(1, Math.round(file.size / 1024))} KB`
            : labelFor(locale, "Upload se cuva kroz Convex storage.", "Upload is saved through Convex storage.")}
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
    <aside className="composer-stagger h-fit rounded-[8px] border-2 border-ink bg-ink p-4 text-white shadow-[5px_5px_0_0_#f4be30]">
      <p className="text-xs font-black uppercase text-white/65">{labelFor(locale, "Pregled", "Preview")}</p>
      <p className="mt-3 text-2xl font-black leading-tight">{title?.trim() || emptyLabel}</p>
      {subtitle ? <p className="mt-3 text-sm font-bold leading-6 text-white/75">{subtitle}</p> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {status ? (
          <span className="rounded-[8px] border-2 border-white bg-yellow px-3 py-1 text-xs font-black text-ink">
            {status}
          </span>
        ) : null}
        {meta ? (
          <span className="rounded-[8px] border-2 border-white/35 px-3 py-1 text-xs font-black text-white">
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
          <p className="text-xs font-bold text-muted">Enter saves the form. Escape closes the composer.</p>
        )}
        <motion.button
          type="submit"
          disabled={pending}
          whileHover={pending ? undefined : { y: -1 }}
          whileTap={pending ? undefined : { scale: 0.98 }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-yellow px-5 text-sm font-extrabold text-ink shadow-[4px_4px_0_0_#0e3158] transition disabled:cursor-wait disabled:opacity-70"
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
  status: CourseStatus;
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
  const [status, setStatus] = useState<CourseStatus>(initial?.status ?? "draft");
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
      <AdminComposerSheet
        title={actionLabel}
        eyebrow={labelFor(locale, "Composer smera", "Track composer")}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <FormSection
                icon={<Sparkles className="size-5" />}
                title={labelFor(locale, "Identitet smera", "Track identity")}
                body={labelFor(locale, "Naziv, URL i status koji odredjuju kako smer ulazi u aplikaciju.", "Name, URL, and status that control how this track appears in the app.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Naziv SR">
                    <input className={inputClass} value={titleSr} onChange={(event) => setTitleSr(event.target.value)} required />
                  </Field>
                  <Field label="Title EN">
                    <input className={inputClass} value={titleEn} onChange={(event) => setTitleEn(event.target.value)} />
                  </Field>
                  <SlugField
                    label="Slug"
                    value={slug}
                    onChange={setSlug}
                    placeholder={slugify(titleSr || titleEn)}
                    locale={locale}
                  />
                  <Field label={labelFor(locale, "Status", "Status")}>
                    <CourseStatusControl locale={locale} value={status} onChange={setStatus} />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                icon={<BookOpen className="size-5" />}
                title={labelFor(locale, "Opis i pozicioniranje", "Description and positioning")}
                body={labelFor(locale, "Kratak podnaslov i opis koji korisniku objasnjavaju zasto ovaj smer postoji.", "A short subtitle and description that explain why this track exists.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Podnaslov SR">
                    <input className={inputClass} value={subtitleSr} onChange={(event) => setSubtitleSr(event.target.value)} required />
                  </Field>
                  <Field label="Subtitle EN">
                    <input className={inputClass} value={subtitleEn} onChange={(event) => setSubtitleEn(event.target.value)} />
                  </Field>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Opis SR">
                    <textarea className={textareaClass} rows={5} value={descriptionSr} onChange={(event) => setDescriptionSr(event.target.value)} required />
                  </Field>
                  <Field label="Description EN">
                    <textarea className={textareaClass} rows={5} value={descriptionEn} onChange={(event) => setDescriptionEn(event.target.value)} />
                  </Field>
                </div>
              </FormSection>
            </div>
            <EntityPreview
              locale={locale}
              title={titleSr || titleEn}
              subtitle={subtitleSr || subtitleEn || descriptionSr || descriptionEn}
              status={statusLabel(locale, status)}
              meta={slug || slugify(titleSr || titleEn) || "slug"}
              emptyLabel={labelFor(locale, "Novi smer", "New track")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={isEditing ? labelFor(locale, "Sacuvaj smer", "Save track") : labelFor(locale, "Dodaj smer", "Add track")}
            message={message}
          />
        </form>
      </AdminComposerSheet>
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
      <AdminComposerSheet
        title={actionLabel}
        eyebrow={labelFor(locale, "Composer modula", "Module composer")}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <FormSection
              icon={<Layers className="size-5" />}
              title={labelFor(locale, "Naziv modula", "Module name")}
              body={labelFor(locale, "Moduli grupisu lekcije u jasne korake kroz smer.", "Modules group lessons into clear steps through the track.")}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Naziv SR">
                  <input className={inputClass} value={titleSr} onChange={(event) => setTitleSr(event.target.value)} required />
                </Field>
                <Field label="Title EN">
                  <input className={inputClass} value={titleEn} onChange={(event) => setTitleEn(event.target.value)} />
                </Field>
              </div>
            </FormSection>
            <EntityPreview
              locale={locale}
              title={titleSr || titleEn}
              subtitle={labelFor(locale, "Modul u trenutnom smeru", "Module in the current track")}
              meta={`${initial?.sortOrder ?? nextSortOrder}`}
              emptyLabel={labelFor(locale, "Novi modul", "New module")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={isEditing ? labelFor(locale, "Sacuvaj modul", "Save module") : labelFor(locale, "Dodaj modul", "Add module")}
            message={message}
            icon={<Layers className="size-4" />}
          />
        </form>
      </AdminComposerSheet>
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
      <AdminComposerSheet
        title={dialogTitle}
        eyebrow={labelFor(locale, "Composer lekcije", "Lesson composer")}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <FormSection
                icon={<ListPlus className="size-5" />}
                title={labelFor(locale, "Osnovni podaci", "Basics")}
                body={labelFor(locale, "Naziv, URL i trajanje lekcije za navigaciju i player.", "Name, URL, and duration used by navigation and the player.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Naziv SR">
                    <input className={inputClass} value={titleSr} onChange={(event) => setTitleSr(event.target.value)} required />
                  </Field>
                  <Field label="Title EN">
                    <input className={inputClass} value={titleEn} onChange={(event) => setTitleEn(event.target.value)} />
                  </Field>
                  <SlugField
                    label="Slug"
                    value={slug}
                    onChange={setSlug}
                    placeholder={slugify(titleSr || titleEn)}
                    locale={locale}
                  />
                  <Field label={labelFor(locale, "Trajanje u minutima", "Duration in minutes")}>
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      value={durationMinutes}
                      onChange={(event) => setDurationMinutes(Number(event.target.value))}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                icon={<FileText className="size-5" />}
                title={labelFor(locale, "Kratak opis", "Summary")}
                body={labelFor(locale, "Ovo korisnik vidi pre ulaska u lekciju.", "This is what a user sees before opening the lesson.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Summary SR">
                    <textarea className={textareaClass} rows={5} value={summarySr} onChange={(event) => setSummarySr(event.target.value)} required />
                  </Field>
                  <Field label="Summary EN">
                    <textarea className={textareaClass} rows={5} value={summaryEn} onChange={(event) => setSummaryEn(event.target.value)} />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                icon={<Check className="size-5" />}
                title={labelFor(locale, "Vidljivost", "Visibility")}
                body={labelFor(locale, "Admin moze da radi na nacrtu bez prikaza korisnicima.", "Admins can work on drafts before users see them.")}
              >
                <PublishToggle locale={locale} checked={isPublished} onChange={setIsPublished} />
              </FormSection>
            </div>
            <EntityPreview
              locale={locale}
              title={titleSr || titleEn}
              subtitle={summarySr || summaryEn}
              status={isPublished ? labelFor(locale, "Objavljeno", "Published") : labelFor(locale, "Nacrt", "Draft")}
              meta={`${Math.max(1, durationMinutes || 1)} min`}
              emptyLabel={labelFor(locale, "Nova lekcija", "New lesson")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={isEditing ? labelFor(locale, "Sacuvaj lekciju", "Save lesson") : labelFor(locale, "Dodaj lekciju", "Add lesson")}
            message={message}
            icon={<ListPlus className="size-4" />}
          />
        </form>
      </AdminComposerSheet>
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
  kind: LessonPartKind;
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
  const [kind, setKind] = useState<LessonPartKind>(initial?.kind ?? "text");
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
      <AdminComposerSheet
        title={dialogTitle}
        eyebrow={labelFor(locale, "Composer dela lekcije", "Lesson part composer")}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <FormSection
                icon={<FileText className="size-5" />}
                title={labelFor(locale, "Naslov i tip", "Title and type")}
                body={labelFor(locale, "Delovi mogu biti tekst, video ili fajl za rad.", "Parts can be text, video, or a working file.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Naziv SR">
                    <input className={inputClass} value={titleSr} onChange={(event) => setTitleSr(event.target.value)} required />
                  </Field>
                  <Field label="Title EN">
                    <input className={inputClass} value={titleEn} onChange={(event) => setTitleEn(event.target.value)} />
                  </Field>
                  <SlugField
                    label="Slug"
                    value={slug}
                    onChange={setSlug}
                    placeholder={slugify(titleSr || titleEn)}
                    locale={locale}
                  />
                </div>
                <div className="mt-4">
                  <KindControl<LessonPartKind>
                    value={kind}
                    onChange={(nextKind) => {
                      setKind(nextKind);
                      setFile(null);
                    }}
                    options={[
                      { value: "text", label: labelFor(locale, "Tekst", "Text"), body: labelFor(locale, "Lekcija u pisanom obliku", "Written lesson content") },
                      { value: "video", label: labelFor(locale, "Video", "Video"), body: labelFor(locale, "Upload video fajla", "Video file upload") },
                      { value: "file", label: labelFor(locale, "Fajl", "File"), body: labelFor(locale, "Materijal za preuzimanje", "Downloadable material") },
                    ]}
                  />
                </div>
              </FormSection>

              <FormSection
                icon={kind === "text" ? <BookOpen className="size-5" /> : <UploadCloud className="size-5" />}
                title={kind === "text" ? labelFor(locale, "Sadrzaj", "Content") : labelFor(locale, "Upload", "Upload")}
                body={
                  kind === "text"
                    ? labelFor(locale, "Tekst ostaje direktno u delu lekcije.", "Text stays directly inside the lesson part.")
                    : labelFor(locale, "Fajl se prvo uploaduje u Convex storage, zatim se cuva deo lekcije.", "The file uploads to Convex storage before the lesson part is saved.")
                }
              >
                {kind === "text" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Tekst SR">
                      <textarea className={textareaClass} rows={8} value={bodySr} onChange={(event) => setBodySr(event.target.value)} />
                    </Field>
                    <Field label="Text EN">
                      <textarea className={textareaClass} rows={8} value={bodyEn} onChange={(event) => setBodyEn(event.target.value)} />
                    </Field>
                  </div>
                ) : (
                  <FileDropzone
                    locale={locale}
                    label={kind === "video" ? "Video fajl" : labelFor(locale, "Fajl za preuzimanje", "Download file")}
                    accept={kind === "video" ? "video/*" : undefined}
                    file={file}
                    onFileChange={setFile}
                    required={!hasExistingFile}
                    currentFile={initial?.fileName}
                  />
                )}
              </FormSection>

              <FormSection
                icon={<Check className="size-5" />}
                title={labelFor(locale, "Vidljivost", "Visibility")}
                body={labelFor(locale, "Poddelovi nasledjuju kontekst lekcije, ali imaju svoj publish status.", "Subparts inherit the lesson context but keep their own publish state.")}
              >
                <PublishToggle locale={locale} checked={isPublished} onChange={setIsPublished} />
              </FormSection>
            </div>
            <EntityPreview
              locale={locale}
              title={titleSr || titleEn}
              subtitle={kind === "text" ? bodySr || bodyEn : file?.name || initial?.fileName}
              status={isPublished ? labelFor(locale, "Objavljeno", "Published") : labelFor(locale, "Nacrt", "Draft")}
              meta={effectiveParentPartId ? labelFor(locale, "Poddeo", "Subpart") : kind}
              emptyLabel={labelFor(locale, "Novi deo", "New part")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={isEditing ? labelFor(locale, "Sacuvaj deo", "Save part") : labelFor(locale, "Dodaj deo", "Add part")}
            message={message}
          />
        </form>
      </AdminComposerSheet>
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
  const [kind, setKind] = useState<AssetKind>("pdf");
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
      <AdminComposerSheet
        title={labelFor(locale, "Dodaj fajl", "Add file")}
        eyebrow={labelFor(locale, "Composer materijala", "Material composer")}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={submit}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <FormSection
                icon={<FileUp className="size-5" />}
                title={labelFor(locale, "Naziv materijala", "Material name")}
                body={labelFor(locale, "Materijali stoje uz lekciju kao PDF, prompt, worksheet ili projekat.", "Materials sit next to the lesson as PDFs, prompts, worksheets, or projects.")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Naziv SR">
                    <input className={inputClass} value={titleSr} onChange={(event) => setTitleSr(event.target.value)} required />
                  </Field>
                  <Field label="Title EN">
                    <input className={inputClass} value={titleEn} onChange={(event) => setTitleEn(event.target.value)} />
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
                body={labelFor(locale, "Izaberi fajl koji ce biti povezan sa ovom lekcijom.", "Choose the file that will be attached to this lesson.")}
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
              emptyLabel={labelFor(locale, "Novi materijal", "New material")}
            />
          </div>
          <ComposerFooter
            pending={pending}
            submitLabel={labelFor(locale, "Upload fajla", "Upload file")}
            message={message}
            icon={<UploadCloud className="size-4" />}
          />
        </form>
      </AdminComposerSheet>
    </>
  );
}
