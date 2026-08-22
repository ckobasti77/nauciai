"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Bold, Italic, List, ListOrdered, Redo2, RemoveFormatting, UnderlineIcon, Undo2 } from "lucide-react";
import { useEffect, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/components/ui/primitives";
import { parseRichText, plainTextToRichText, RICH_TEXT_FONT_SIZES, type RichTextNode } from "@/lib/rich-text";
import { richTextToPlainText } from "@/lib/rich-text";

const COLORS = ["#0e3158", "#475569", "#b91c1c", "#047857", "#1d4ed8", "#7c3aed"];

function safeDocument(value: string | undefined, fallback: string): RichTextNode {
  try {
    return parseRichText(value) ?? parseRichText(plainTextToRichText(fallback))!;
  } catch {
    return parseRichText(plainTextToRichText(fallback))!;
  }
}

function ToolbarButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={cn("grid size-9 place-items-center rounded-[8px] border-2 border-ink bg-paper-strong text-ink transition hover:bg-yellow", active && "bg-yellow")}>{children}</button>;
}

export default function RichTextEditor({ value, fallback = "", onChange, minHeight = 240 }: { value?: string; fallback?: string; onChange: (json: string, plain: string) => void; minHeight?: number }) {
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
    <div className="overflow-hidden rounded-[16px] border-2 border-ink bg-paper-strong shadow-[4px_4px_0_var(--shadow-hard-12)]" style={{ "--editor-min-height": `${minHeight}px` } as CSSProperties}>
      <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-ink bg-paper p-2">
        <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="size-4" /></ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="size-4" /></ToolbarButton>
        <span className="mx-1 h-7 w-px bg-line" />
        <ToolbarButton label="Bold" active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolbarButton>
        <ToolbarButton label="Italic" active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolbarButton>
        <ToolbarButton label="Underline" active={state?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="size-4" /></ToolbarButton>
        <select aria-label="Veličina teksta" className="h-9 rounded-[8px] border-2 border-ink bg-paper-strong px-2 text-xs font-black" value={editor.getAttributes("textStyle").fontSize ?? "16px"} onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}>
          {RICH_TEXT_FONT_SIZES.map((size) => <option key={size} value={size}>{size.replace("px", "")}</option>)}
        </select>
        <div className="flex items-center gap-1 rounded-full border-2 border-ink bg-paper-strong p-1">
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
