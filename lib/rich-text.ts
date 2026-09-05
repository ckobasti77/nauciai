export type RichTextMark = {
  type: "bold" | "italic" | "underline" | "strike" | "spoiler" | "textStyle";
  attrs?: { color?: string; fontSize?: string };
};

export type RichTextNode = {
  type: "doc" | "paragraph" | "text" | "bulletList" | "orderedList" | "listItem" | "hardBreak" | "image";
  text?: string;
  marks?: RichTextMark[];
  content?: RichTextNode[];
  attrs?: { storageId?: string; alt?: string; width?: number; height?: number };
};

export type RichTextConfig = {
  nodes: Set<string>;
  marks: Set<string>;
  maxLength: number;
  maxImages?: number;
};

export const RICH_TEXT_FONT_SIZES = ["14px", "16px", "18px", "24px", "32px"] as const;
const ALLOWED_FONT_SIZES = new Set<string>(RICH_TEXT_FONT_SIZES);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Default whitelist — courses/lessons/admin rich text. Unchanged behaviour. */
export const COURSE_RICH_TEXT: RichTextConfig = {
  nodes: new Set(["doc", "paragraph", "text", "bulletList", "orderedList", "listItem", "hardBreak"]),
  marks: new Set(["bold", "italic", "underline", "textStyle"]),
  maxLength: 200_000,
};

/** Community discussions: B/I/S/U + spoiler + inline images. No lists, no colors. */
export const COMMUNITY_RICH_TEXT: RichTextConfig = {
  nodes: new Set(["doc", "paragraph", "text", "hardBreak", "image"]),
  marks: new Set(["bold", "italic", "strike", "underline", "spoiler"]),
  maxLength: 40_000,
  maxImages: 6,
};

export function plainTextToRichText(value: string): string {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      type: "paragraph" as const,
      content: paragraph.split("\n").flatMap((line, index) => [
        ...(index ? [{ type: "hardBreak" as const }] : []),
        ...(line ? [{ type: "text" as const, text: line }] : []),
      ]),
    }));
  return JSON.stringify({ type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] });
}

function validateImageAttrs(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Slika u tekstu nije ispravna.");
  const attrs = value as Record<string, unknown>;
  if (typeof attrs.storageId !== "string" || !attrs.storageId.trim()) throw new Error("Slika u tekstu nema ispravan storageId.");
  if (attrs.alt !== undefined && typeof attrs.alt !== "string") throw new Error("Opis slike nije ispravan.");
  for (const key of ["width", "height"] as const) {
    if (attrs[key] !== undefined && (typeof attrs[key] !== "number" || !Number.isFinite(attrs[key]) || (attrs[key] as number) <= 0)) {
      throw new Error("Dimenzije slike nisu ispravne.");
    }
  }
  if (Object.keys(attrs).some((key) => key !== "storageId" && key !== "alt" && key !== "width" && key !== "height")) {
    throw new Error("Slika u tekstu sadrži nedozvoljeno svojstvo.");
  }
}

function validateNode(value: unknown, config: RichTextConfig, counters: { images: number }, isRoot = false): RichTextNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Rich text dokument nije ispravan.");
  const node = value as Record<string, unknown>;
  if (typeof node.type !== "string" || !config.nodes.has(node.type)) throw new Error("Rich text sadrži nedozvoljen blok.");
  if (isRoot && node.type !== "doc") throw new Error("Rich text mora imati doc koren.");
  if (node.type === "text" && typeof node.text !== "string") throw new Error("Rich text tekst nije ispravan.");
  if (node.type === "image") {
    counters.images += 1;
    if (config.maxImages !== undefined && counters.images > config.maxImages) throw new Error(`Najviše ${config.maxImages} slika po diskusiji.`);
    validateImageAttrs(node.attrs);
  }
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) throw new Error("Rich text formatiranje nije ispravno.");
    for (const rawMark of node.marks) {
      if (!rawMark || typeof rawMark !== "object" || Array.isArray(rawMark)) throw new Error("Rich text formatiranje nije ispravno.");
      const mark = rawMark as Record<string, unknown>;
      if (typeof mark.type !== "string" || !config.marks.has(mark.type)) throw new Error("Rich text sadrži nedozvoljeno formatiranje.");
      if (mark.type === "textStyle" && mark.attrs !== undefined) {
        if (!mark.attrs || typeof mark.attrs !== "object" || Array.isArray(mark.attrs)) throw new Error("Stil teksta nije ispravan.");
        const attrs = mark.attrs as Record<string, unknown>;
        if (attrs.color !== undefined && (typeof attrs.color !== "string" || !HEX_COLOR.test(attrs.color))) throw new Error("Boja teksta nije ispravna.");
        if (attrs.fontSize !== undefined && (typeof attrs.fontSize !== "string" || !ALLOWED_FONT_SIZES.has(attrs.fontSize))) throw new Error("Veličina teksta nije dozvoljena.");
        if (Object.keys(attrs).some((key) => key !== "color" && key !== "fontSize")) throw new Error("Stil teksta sadrži nedozvoljeno svojstvo.");
      }
    }
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) throw new Error("Rich text sadržaj nije ispravan.");
    node.content.forEach((child) => validateNode(child, config, counters));
  }
  return node as RichTextNode;
}

export function parseRichText(value?: string, config: RichTextConfig = COURSE_RICH_TEXT): RichTextNode | null {
  if (!value?.trim()) return null;
  if (value.length > config.maxLength) throw new Error("Rich text je predugačak.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Rich text JSON nije ispravan.");
  }
  return validateNode(parsed, config, { images: 0 }, true);
}

function collectText(node: RichTextNode): string {
  if (node.type === "text") return node.marks?.some((mark) => mark.type === "spoiler") ? "▮▮▮" : node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "image") return "";
  const joined = (node.content ?? []).map(collectText).join("");
  return node.type === "paragraph" || node.type === "listItem" ? `${joined}\n` : joined;
}

export function richTextToPlainText(value?: string, config: RichTextConfig = COURSE_RICH_TEXT): string {
  const document = parseRichText(value, config);
  return document ? collectText(document).replace(/\n{3,}/g, "\n\n").trim() : "";
}

export function richTextHasContent(value?: string, fallback = "", config: RichTextConfig = COURSE_RICH_TEXT): boolean {
  if (!value?.trim()) return Boolean(fallback.trim());
  try {
    return Boolean(richTextToPlainText(value, config));
  } catch {
    return false;
  }
}

/** Storage ids referenced by inline image nodes in a rich-text document. */
export function collectImageStorageIds(value?: string, config: RichTextConfig = COMMUNITY_RICH_TEXT): string[] {
  const document = parseRichText(value, config);
  if (!document) return [];
  const ids: string[] = [];
  const walk = (node: RichTextNode) => {
    if (node.type === "image" && node.attrs?.storageId) ids.push(node.attrs.storageId);
    (node.content ?? []).forEach(walk);
  };
  walk(document);
  return ids;
}
