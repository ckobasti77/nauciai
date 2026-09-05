"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Bold, EyeOff, Image as ImageIcon, Italic, List, ListOrdered, Redo2, RemoveFormatting, Strikethrough, UnderlineIcon, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useMutation } from "convex/react";

import { cn } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast-provider";
import { api } from "@/convex/_generated/api";
import { communityRichText, type Locale } from "@/lib/i18n";
import { COMMUNITY_RICH_TEXT, parseRichText, plainTextToRichText, RICH_TEXT_FONT_SIZES, richTextToPlainText, type RichTextConfig, type RichTextNode } from "@/lib/rich-text";
import { EditorImage, Spoiler, makePendingImageId, registerImagePreview, releaseImagePreview, renameImagePreview } from "@/components/app/rich-text-extensions";

const COLORS = ["#0e3158", "#475569", "#b91c1c", "#047857", "#1d4ed8", "#7c3aed"];

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INLINE_IMAGES = 6;

function safeDocument(value: string | undefined, fallback: string, config?: RichTextConfig): RichTextNode {
  try {
    return parseRichText(value, config) ?? parseRichText(plainTextToRichText(fallback), config)!;
  } catch {
    return parseRichText(plainTextToRichText(fallback), config)!;
  }
}

function ToolbarButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={cn("grid size-11 place-items-center rounded-[8px] border-2 border-ink bg-paper-strong text-ink transition hover:bg-yellow sm:size-9", active && "bg-yellow")}>{children}</button>;
}

function countInlineImages(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "image") count += 1;
  });
  return count;
}

function updateImageNode(editor: Editor, pendingId: string, attrs: Record<string, unknown> | null): void {
  editor.commands.command(({ tr, state, dispatch }) => {
    let handled = false;
    state.doc.descendants((node, pos) => {
      if (handled || node.type.name !== "image" || node.attrs.storageId !== pendingId) return;
      handled = true;
      if (attrs) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
      else tr.delete(pos, pos + node.nodeSize);
    });
    if (handled && dispatch) dispatch(tr);
    return handled;
  });
}

function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const probe = new window.Image();
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => resolve({ width: 0, height: 0 });
    probe.src = url;
  });
}

function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

/** Community preset toolbar: B/I/S/U + spoiler + inline slike (createAttachmentUploadUrl). */
function CommunityToolbar({ editor, locale, uploadRef, onUploadingChange }: { editor: Editor; locale: Locale; uploadRef: RefObject<(file: File) => void>; onUploadingChange?: (count: number) => void }) {
  const t = communityRichText[locale];
  const toast = useToast();
  const generateUploadUrl = useMutation(api.community.createAttachmentUploadUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  async function uploadImage(file: File) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return toast.error(t.uploadErrorTitle, t.errorType);
    if (file.size > MAX_IMAGE_BYTES) return toast.error(t.uploadErrorTitle, t.errorSize);
    if (countInlineImages(editor) >= MAX_INLINE_IMAGES) return toast.error(t.uploadErrorTitle, t.errorCount);

    const pendingId = makePendingImageId();
    const previewUrl = URL.createObjectURL(file);
    registerImagePreview(pendingId, previewUrl);
    const dims = await measureImage(previewUrl);
    editor.chain().focus().insertContent({ type: "image", attrs: { storageId: pendingId } }).run();
    setUploading((count) => count + 1);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("upload failed");
      const { storageId } = (await response.json()) as { storageId: string };
      renameImagePreview(pendingId, storageId);
      updateImageNode(editor, pendingId, { storageId, width: dims.width || null, height: dims.height || null });
    } catch {
      updateImageNode(editor, pendingId, null);
      releaseImagePreview(pendingId);
      toast.error(t.uploadErrorTitle, t.errorUpload);
    } finally {
      setUploading((count) => count - 1);
    }
  }
  useEffect(() => {
    uploadRef.current = (file: File) => void uploadImage(file);
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      bold: current.isActive("bold"), italic: current.isActive("italic"), strike: current.isActive("strike"),
      underline: current.isActive("underline"), spoiler: current.isActive("spoiler"),
    } : null,
  });

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1.5 rounded-t-[14px] border-b-2 border-ink bg-paper p-2">
      <ToolbarButton label={t.undo} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="size-4" /></ToolbarButton>
      <ToolbarButton label={t.redo} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="size-4" /></ToolbarButton>
      <span className="mx-1 h-7 w-px bg-line" />
      <ToolbarButton label={t.bold} active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolbarButton>
      <ToolbarButton label={t.italic} active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolbarButton>
      <ToolbarButton label={t.strike} active={state?.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="size-4" /></ToolbarButton>
      <ToolbarButton label={t.underline} active={state?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="size-4" /></ToolbarButton>
      <ToolbarButton label={t.spoiler} active={state?.spoiler} onClick={() => editor.chain().focus().toggleSpoiler().run()}><EyeOff className="size-4" /></ToolbarButton>
      <span className="mx-1 h-7 w-px bg-line" />
      <ToolbarButton label={t.image} onClick={() => fileInputRef.current?.click()}><ImageIcon className="size-4" /></ToolbarButton>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          Array.from(event.target.files ?? []).forEach((file) => void uploadImage(file));
          event.target.value = "";
        }}
      />
    </div>
  );
}

function CourseToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      bold: current.isActive("bold"), italic: current.isActive("italic"), underline: current.isActive("underline"),
      bulletList: current.isActive("bulletList"), orderedList: current.isActive("orderedList"),
    } : null,
  });

  return (
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
  );
}

export default function RichTextEditor({ value, fallback = "", onChange, minHeight = 240, preset = "course", locale = "sr", onUploadingChange }: { value?: string; fallback?: string; onChange: (json: string, plain: string) => void; minHeight?: number; preset?: "course" | "community"; locale?: Locale; onUploadingChange?: (count: number) => void }) {
  const community = preset === "community";
  const config = community ? COMMUNITY_RICH_TEXT : undefined;
  const uploadRef = useRef<(file: File) => void>(() => {});

  const editor = useEditor({
    extensions: community
      ? [StarterKit.configure({ heading: false, link: false, bulletList: false, orderedList: false, listItem: false }), Underline, Spoiler, EditorImage.configure({ locale })]
      : [StarterKit.configure({ heading: false, link: false }), Underline, TextStyleKit.configure({ backgroundColor: false, fontFamily: false, lineHeight: false })],
    content: safeDocument(value, fallback, config),
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => {
      const json = JSON.stringify(current.getJSON());
      onChange(json, richTextToPlainText(json, config));
    },
    editorProps: {
      attributes: {
        class: "rich-editor-content min-h-[var(--editor-min-height)] px-4 py-4 type-body font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
      },
      ...(community
        ? {
            handlePaste: (_view, event) => {
              const files = imageFilesFrom(event.clipboardData);
              if (!files.length) return false;
              event.preventDefault();
              files.forEach((file) => uploadRef.current(file));
              return true;
            },
            handleDrop: (_view, event) => {
              const files = imageFilesFrom((event as DragEvent).dataTransfer);
              if (!files.length) return false;
              event.preventDefault();
              files.forEach((file) => uploadRef.current(file));
              return true;
            },
          }
        : {}),
    },
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = safeDocument(value, fallback, config);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, fallback, value, config]);

  if (!editor) return <div className="min-h-60 animate-pulse rounded-[16px] border-2 border-line bg-paper" />;
  return (
    <div className={cn("rounded-[16px] border-2 border-ink bg-paper-strong shadow-[4px_4px_0_var(--shadow-hard-12)]", !community && "overflow-hidden")} style={{ "--editor-min-height": `${minHeight}px` } as CSSProperties}>
      {community ? <CommunityToolbar editor={editor} locale={locale} uploadRef={uploadRef} onUploadingChange={onUploadingChange} /> : <CourseToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
