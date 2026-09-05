"use client";

import { Mark, Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes, type NodeViewProps } from "@tiptap/react";
import { X } from "lucide-react";
import { useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { communityRichText } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spoiler: {
      toggleSpoiler: () => ReturnType;
    };
  }
}

/**
 * Blob preview-ovi za slike koje se šalju/prikazuju u trenutnoj editor sesiji.
 * Ključ je storageId (ili privremeni `pending:*` id dok upload traje). Ne ulazi u
 * JSON dokumenta — služi samo da NodeView ima šta da prikaže dok Convex URL ne
 * postoji na klijentu.
 */
const imagePreviews = new Map<string, string>();

export const PENDING_PREFIX = "pending:";
export function makePendingImageId(): string {
  return `${PENDING_PREFIX}${Math.random().toString(36).slice(2)}`;
}
export function registerImagePreview(id: string, url: string): void {
  imagePreviews.set(id, url);
}
export function renameImagePreview(oldId: string, newId: string): void {
  const url = imagePreviews.get(oldId);
  if (url) {
    imagePreviews.set(newId, url);
    imagePreviews.delete(oldId);
  }
}
export function releaseImagePreview(id: string): void {
  const url = imagePreviews.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    imagePreviews.delete(id);
  }
}

/** Spoiler mark — u editoru žuti šrafirani marker (CSS `[data-spoiler]`). */
export const Spoiler = Mark.create({
  name: "spoiler",
  parseHTML() {
    return [{ tag: "span[data-spoiler]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-spoiler": "" }), 0];
  },
  addCommands() {
    return {
      toggleSpoiler: () => ({ commands }) => commands.toggleMark(this.name),
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-h": () => this.editor.commands.toggleSpoiler() };
  },
});

function ImageNodeView({ node, selected, updateAttributes, deleteNode, extension }: NodeViewProps) {
  const locale = (extension.options.locale as Locale) ?? "sr";
  const t = communityRichText[locale];
  const storageId = (node.attrs.storageId as string | null) ?? "";
  const alt = (node.attrs.alt as string | null) ?? "";
  const [altDraft, setAltDraft] = useState(alt);
  const uploading = storageId.startsWith(PENDING_PREFIX);
  const preview = imagePreviews.get(storageId);

  return (
    <NodeViewWrapper className="my-3" data-drag-handle>
      <div className={`relative overflow-hidden border-2 surface-media ${selected ? "border-ink" : "border-line"}`}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob preview, dimensions unknown until measured
          <img src={preview} alt={alt} className="block max-h-96 w-full object-contain bg-paper" />
        ) : (
          <div className="grid h-40 w-full place-items-center bg-paper" />
        )}
        {uploading ? (
          <div className="absolute inset-0 grid place-items-center bg-scrim/45">
            <Spinner size="lg" label={t.uploading} className="text-paper-strong" />
          </div>
        ) : (
          <button
            type="button"
            aria-label={t.removeImage}
            title={t.removeImage}
            onClick={() => deleteNode()}
            className="absolute right-2 top-2 grid size-9 place-items-center rounded-full border-2 border-ink bg-paper-strong text-ink transition hover:bg-yellow"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {!uploading && selected ? (
        <input
          value={altDraft}
          onChange={(event) => setAltDraft(event.target.value)}
          onBlur={() => updateAttributes({ alt: altDraft.trim() || null })}
          placeholder={t.altPlaceholder}
          className="mt-1.5 w-full surface-inset border-2 border-line bg-paper-strong px-3 py-2 type-caption font-semibold text-ink"
        />
      ) : null}
    </NodeViewWrapper>
  );
}

/** Slika u tekstu — atom node sa storageId/alt/width/height. Nikad spoljni src. */
export const EditorImage = Node.create<{ locale: Locale }>({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addOptions() {
    return { locale: "sr" };
  },
  addAttributes() {
    return {
      storageId: { default: null },
      alt: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-rich-image]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-rich-image": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
