"use client";

import dynamic from "next/dynamic";
import { type CSSProperties, type ReactNode } from "react";
import { useState } from "react";
import { useMutation } from "convex/react";

import { cn } from "@/components/ui/primitives";
import { parseRichText, plainTextToRichText, richTextToPlainText, type RichTextMark, type RichTextNode } from "@/lib/rich-text";
import { AppComposerSheet } from "@/components/app/app-composer-sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";

const RichTextEditor = dynamic(() => import("@/components/app/rich-text-editor"), {
  ssr: false,
  loading: () => <div className="min-h-60 animate-pulse rounded-[16px] border-2 border-line bg-paper" />,
});

function safeDocument(value: string | undefined, fallback: string): RichTextNode {
  try {
    return parseRichText(value) ?? parseRichText(plainTextToRichText(fallback))!;
  } catch {
    return parseRichText(plainTextToRichText(fallback))!;
  }
}

function markStyle(marks?: RichTextMark[]): CSSProperties {
  const style = marks?.find((mark) => mark.type === "textStyle")?.attrs;
  return { color: style?.color, fontSize: style?.fontSize };
}

function renderNode(node: RichTextNode, key: string): ReactNode {
  if (node.type === "text") {
    let content: ReactNode = node.text ?? "";
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") content = <strong>{content}</strong>;
      if (mark.type === "italic") content = <em>{content}</em>;
      if (mark.type === "underline") content = <u>{content}</u>;
    }
    return <span key={key} style={markStyle(node.marks)}>{content}</span>;
  }
  if (node.type === "hardBreak") return <br key={key} />;
  const children = (node.content ?? []).map((child, index) => renderNode(child, `${key}-${index}`));
  if (node.type === "paragraph") return <p key={key}>{children}</p>;
  if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
  if (node.type === "orderedList") return <ol key={key}>{children}</ol>;
  if (node.type === "listItem") return <li key={key}>{children}</li>;
  return <>{children}</>;
}

export function RichTextContent({ value, fallback = "", className }: { value?: string; fallback?: string; className?: string }) {
  const document = safeDocument(value, fallback);
  return <div className={cn("rich-text-content", className)}>{(document.content ?? []).map((node, index) => renderNode(node, String(index)))}</div>;
}

export function InlineRichText({
  kind, entityId, parentId, field, locale, richSr, richEn, sr, en, admin, className,
}: {
  kind: "track" | "course" | "lesson" | "part";
  entityId: string;
  parentId?: string;
  field: "description" | "summary" | "body";
  locale: Locale;
  richSr?: string;
  richEn?: string;
  sr: string;
  en: string;
  admin?: boolean;
  className?: string;
}) {
  const update = useMutation(api.contentHierarchy.updateRichTextField);
  const [open, setOpen] = useState(false);
  const [contentLocale, setContentLocale] = useState<Locale>(locale);
  const [nextRichSr, setNextRichSr] = useState(richSr || plainTextToRichText(sr));
  const [nextRichEn, setNextRichEn] = useState(richEn || plainTextToRichText(en));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shownRich = locale === "sr" ? richSr : richEn;
  const shownPlain = locale === "sr" ? sr : en || sr;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await update({
        kind,
        entityId: entityId as Id<"courseTracks">,
        ...(parentId ? { parentId: parentId as Id<"courseTracks"> } : {}),
        field,
        richSr: nextRichSr,
        richEn: nextRichEn,
      });
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Čuvanje nije uspelo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div onDoubleClick={admin ? () => setOpen(true) : undefined} title={admin ? "Dvoklik za rich-text uređivanje" : undefined} className={cn("relative", admin && "min-h-12 cursor-text rounded-[8px] outline-offset-4 hover:outline hover:outline-2 hover:outline-yellow", className)}>
        <RichTextContent value={shownRich} fallback={shownPlain} />
      </div>
      <AppComposerSheet title="Uredi formatirani tekst" eyebrow="Live Admin rich text" open={open} onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <div className="inline-flex rounded-full border-2 border-ink bg-paper p-1">
            {(["sr", "en"] as const).map((entry) => <button key={entry} type="button" onClick={() => setContentLocale(entry)} className={cn("rounded-full px-4 py-2 text-xs font-black uppercase", contentLocale === entry && "bg-ink text-white")}>{entry}</button>)}
          </div>
          <RichTextEditor value={contentLocale === "sr" ? nextRichSr : nextRichEn} fallback={contentLocale === "sr" ? sr : en} onChange={(json) => contentLocale === "sr" ? setNextRichSr(json) : setNextRichEn(json)} />
          {contentLocale === "en" && !richTextToPlainText(nextRichEn) ? <p className="rounded-[8px] border-2 border-amber-700 bg-amber-50 p-3 text-sm font-black text-amber-950">EN tekst nedostaje. Ovo upozorenje ne blokira objavu.</p> : null}
          {message ? <p className="rounded-[8px] border-2 border-red-700 bg-red-50 p-3 text-sm font-black text-red-800">{message}</p> : null}
          <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 rounded-full border-2 border-ink bg-yellow px-5 text-sm font-black disabled:opacity-50">{saving ? "Čuvam…" : "Sačuvaj tekst"}</button></div>
        </div>
      </AppComposerSheet>
    </>
  );
}
