"use client";

import { useMutation } from "convex/react";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { Spinner } from "@/components/ui/spinner";
import type { Locale } from "@/lib/i18n";

export type InlineEntityKind = "track" | "course" | "lesson" | "part" | "step" | "task";
export type InlineField =
  | "title"
  | "subtitle"
  | "description"
  | "summary"
  | "body"
  | "prompt"
  | "hint"
  | "promptLabel"
  | "pageCopy_primaryCta"
  | "pageCopy_communityCta"
  | "pageCopy_continueCta"
  | "pageCopy_sectionEyebrow"
  | "pageCopy_sectionTitle"
  | "pageCopy_sectionDescription"
  | "pageCopy_introVideoEmpty"
  | "pageCopy_introVideoTitle";

type Props = {
  entityId: string;
  parentId?: string;
  kind: InlineEntityKind;
  field: InlineField;
  locale: Locale;
  sr: string;
  en: string;
  admin?: boolean;
  multiline?: boolean;
  promptIndex?: number;
  className?: string;
  block?: boolean;
  children?: ReactNode;
  onSaved?: () => void;
};

export function InlineContentText({
  entityId,
  parentId,
  kind,
  field,
  locale,
  sr,
  en,
  admin = false,
  multiline = false,
  promptIndex,
  className,
  block = false,
  children,
  onSaved,
}: Props) {
  const update = useMutation(api.contentHierarchy.updateInlineField);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [editingLocale, setEditingLocale] = useState<Locale>(locale);
  const [draftSr, setDraftSr] = useState(sr);
  const [draftEn, setDraftEn] = useState(en);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) {
      queueMicrotask(() => {
        setDraftSr(sr);
        setDraftEn(en);
      });
    }
  }, [editing, en, sr]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing, editingLocale]);

  if (!admin) return <>{children ?? (locale === "sr" ? sr : en)}</>;

  const visible = editingLocale === "sr" ? draftSr : draftEn;
  const setVisible = editingLocale === "sr" ? setDraftSr : setDraftEn;
  const missingSr = Boolean(draftEn.trim() && !draftSr.trim());
  const missingEn = Boolean(draftSr.trim() && !draftEn.trim());

  function begin(event?: { preventDefault?: () => void }) {
    event?.preventDefault?.();
    setError(null);
    setEditingLocale(locale);
    setEditing(true);
  }

  function cancel() {
    setDraftSr(sr);
    setDraftEn(en);
    setError(null);
    setEditing(false);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await update({
        kind,
        entityId: entityId as Id<"courseTracks">,
        ...(parentId ? { parentId: parentId as Id<"courseTracks"> } : {}),
        field,
        sr: draftSr,
        en: draftEn,
        ...(promptIndex === undefined ? {} : { promptIndex }),
      });
      setEditing(false);
      toast.success(
        locale === "sr" ? "Sadržaj je sačuvan" : "Content saved",
        locale === "sr" ? "Izmena je odmah dostupna u preview prikazu." : "The change is immediately available in preview.",
      );
      onSaved?.();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Čuvanje nije uspelo.";
      setError(message);
      toast.error(locale === "sr" ? "Čuvanje nije uspelo" : "Save failed", message);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === "Enter" && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      void save();
    }
  }

  const Shell = block ? "div" : "span";
  if (!editing) {
    const rawContent = children ?? (locale === "sr" ? sr : en);
    const placeholder =
      locale === "sr"
        ? field === "title"
          ? "Dupli klik — dodaj naslov"
          : "Dupli klik — dodaj sadržaj"
        : field === "title"
          ? "Double-click — add title"
          : "Double-click — add content";
    return (
      <Shell
        className={cn("group/inline relative inline-block min-h-[1em] min-w-[6rem] cursor-text rounded-[8px] transition hover:bg-yellow/20 focus-visible:bg-yellow/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink", !sr.trim() && !en.trim() && "border border-dashed border-amber-600/70 bg-amber-50/70 px-2 py-1 text-amber-900", className)}
        tabIndex={0}
        onDoubleClick={begin}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "F2") begin(event);
        }}
        title={locale === "sr" ? "Dupli klik za izmenu" : "Double-click to edit"}
      >
        {rawContent || placeholder}
        <span className="pointer-events-none absolute -right-2 -top-2 grid size-5 scale-90 place-items-center rounded-full border border-ink bg-yellow opacity-0 transition group-hover/inline:scale-100 group-hover/inline:opacity-100 group-focus-visible/inline:scale-100 group-focus-visible/inline:opacity-100">
          <Pencil className="size-2.5" />
        </span>
      </Shell>
    );
  }

  return (
    <Shell className={cn("relative inline-flex min-w-[16rem] max-w-full flex-col rounded-[8px] border-2 border-ink bg-paper-strong p-2 shadow-[3px_3px_0_var(--shadow-hard)]", block && "flex w-full", className)}>
      <span className="mb-2 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-paper p-1" role="group" aria-label={locale === "sr" ? "Jezik polja" : "Field language"}>
          {(["sr", "en"] as const).map((item) => {
            const warning = item === "sr" ? missingSr : missingEn;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setEditingLocale(item)}
                className={cn(
                  "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 type-eyebrow transition",
                  editingLocale === item ? "border-ink bg-ink text-paper-strong" : "border-transparent text-muted",
                  warning && "border-amber-600 bg-amber-100 text-amber-950 ring-2 ring-amber-400/45",
                )}
              >
                {warning ? <AlertTriangle className="size-3" /> : null}
                {item}
              </button>
            );
          })}
        </span>
        <span className="flex shrink-0 gap-1">
          <button type="button" onClick={() => void save()} disabled={saving} aria-label="Sačuvaj" className="grid size-7 place-items-center rounded-full border-2 border-ink bg-yellow disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? <Spinner size="xs" /> : <Check className="size-3.5" />}
          </button>
          <button type="button" onClick={cancel} disabled={saving} aria-label="Otkaži" className="grid size-7 place-items-center rounded-full border-2 border-ink bg-paper-strong disabled:opacity-40"><X className="size-3.5" /></button>
        </span>
      </span>
      {multiline ? (
        <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={visible} onChange={(event) => setVisible(event.target.value)} onKeyDown={handleKeyDown} rows={3} className="min-h-[5rem] w-full resize-y rounded-[8px] bg-paper/60 px-3 py-2 text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" />
      ) : (
        <input ref={inputRef as React.RefObject<HTMLInputElement>} value={visible} onChange={(event) => setVisible(event.target.value)} onKeyDown={handleKeyDown} className="min-h-[2.5rem] w-full rounded-[8px] bg-paper/60 px-3 text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" />
      )}
      {missingEn ? <span className="mt-2 inline-flex items-center gap-1 rounded-[8px] border-2 border-amber-700 bg-amber-50 px-2 py-1 type-caption font-black text-amber-900"><AlertTriangle className="size-3" /> EN nedostaje, ali ne blokira čuvanje.</span> : null}
      {missingSr ? <span className="mt-2 inline-flex items-center gap-1 rounded-[8px] border-2 border-red-700 bg-red-50 px-2 py-1 type-caption font-black text-red-800"><AlertTriangle className="size-3" /> SR je obavezan pre objave.</span> : null}
      {error ? <span role="alert" className="absolute left-1 top-full z-30 mt-1 rounded-[8px] border-2 border-red-700 bg-red-50 px-2 py-1 type-caption font-black text-red-800">{error}</span> : null}
    </Shell>
  );
}
