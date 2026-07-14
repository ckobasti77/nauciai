"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Bold, Italic, List, ListOrdered, Redo2, RemoveFormatting, UnderlineIcon, Undo2 } from "lucide-react";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useState } from "react";
import { useMutation } from "convex/react";

import { cn } from "@/components/ui/primitives";
import { parseRichText, plainTextToRichText, RICH_TEXT_FONT_SIZES, richTextToPlainText, type RichTextMark, type RichTextNode } from "@/lib/rich-text";
import { AppComposerSheet } from "@/components/app/app-composer-sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";

const COLORS = ["#0e3158", "#475569", "#b91c1c", "#047857", "#1d4ed8", "#7c3aed"];

function safeDocument(value: string | undefined, fallback: string): RichTextNode {
  try {
    return parseRichText(value) ?? parseRichText(plainTextToRichText(fallback))!;
  } catch {
    return parseRichText(plainTextToRichText(fallback))!;
  }
}

function ToolbarButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={cn("grid size-9 place-items-center rounded-[8px] border-2 border-ink bg-white text-ink transition hover:bg-yellow", active && "bg-yellow")}>{children}</button>;
}

export function RichTextEditor({ value, fallback = "", onChange, minHeight = 240 }: { value?: string; fallback?: string; onChange: (json: string, plain: string) => void; minHeight?: number }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, link: false }), Underline, TextStyleKit.configure({ backgroundColor: false, fontFamily: false, lineHeight: false })],
    content: safeDocument(value, fallback),
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => {
      const json = JSON.stringify(current.getJSON());
      onChange(json, richTextToPlainText(json));
    },
    editorProps: {
      attributes: {
        class: "rich-editor-content min-h-[var(--editor-min-height)] px-4 py-4 text-base font-semibold leading-7 text-ink outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = safeDocument(value, fallback);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, fallback, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      bold: current.isActive("bold"), italic: current.isActive("italic"), underline: current.isActive("underline"),
      bulletList: current.isActive("bulletList"), orderedList: current.isActive("orderedList"),
    } : null,
  });

  if (!editor) return <div className="min-h-60 animate-pulse rounded-[16px] border-2 border-line bg-paper" />;
  return (
    <div className="overflow-hidden rounded-[16px] border-2 border-ink bg-white shadow-[4px_4px_0_rgba(14,49,88,0.12)]" style={{ "--editor-min-height": `${minHeight}px` } as CSSProperties}>
      <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-ink bg-paper p-2">
        <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="size-4" /></ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="size-4" /></ToolbarButton>
        <span className="mx-1 h-7 w-px bg-line" />
        <ToolbarButton label="Bold" active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolbarButton>
        <ToolbarButton label="Italic" active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolbarButton>
        <ToolbarButton label="Underline" active={state?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="size-4" /></ToolbarButton>
        <select aria-label="Veličina teksta" className="h-9 rounded-[8px] border-2 border-ink bg-white px-2 text-xs font-black" value={editor.getAttributes("textStyle").fontSize ?? "16px"} onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}>
          {RICH_TEXT_FONT_SIZES.map((size) => <option key={size} value={size}>{size.replace("px", "")}</option>)}
        </select>
        <div className="flex items-center gap-1 rounded-full border-2 border-ink bg-white p-1">
          {COLORS.map((color) => <button key={color} type="button" aria-label={`Boja ${color}`} onClick={() => editor.chain().focus().setColor(color).run()} className="size-5 rounded-full border border-ink" style={{ backgroundColor: color }} />)}
          <input aria-label="Izaberi boju" type="color" value={editor.getAttributes("textStyle").color ?? "#0e3158"} onChange={(event) => editor.chain().focus().setColor(event.target.value).run()} className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
        </div>
        <ToolbarButton label="Tačkasta lista" active={state?.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="size-4" /></ToolbarButton>
        <ToolbarButton label="Numerisana lista" active={state?.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolbarButton>
        <ToolbarButton label="Ukloni formatiranje" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting className="size-4" /></ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
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
