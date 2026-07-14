export type RichTextMark = {
  type: "bold" | "italic" | "underline" | "textStyle";
  attrs?: { color?: string; fontSize?: string };
};

export type RichTextNode = {
  type: "doc" | "paragraph" | "text" | "bulletList" | "orderedList" | "listItem" | "hardBreak";
  text?: string;
  marks?: RichTextMark[];
  content?: RichTextNode[];
};

const ALLOWED_NODES = new Set(["doc", "paragraph", "text", "bulletList", "orderedList", "listItem", "hardBreak"]);
const ALLOWED_MARKS = new Set(["bold", "italic", "underline", "textStyle"]);
export const RICH_TEXT_FONT_SIZES = ["14px", "16px", "18px", "24px", "32px"] as const;
const ALLOWED_FONT_SIZES = new Set<string>(RICH_TEXT_FONT_SIZES);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_RICH_TEXT_LENGTH = 200_000;

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

function validateNode(value: unknown, isRoot = false): RichTextNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Rich text dokument nije ispravan.");
  const node = value as Record<string, unknown>;
  if (typeof node.type !== "string" || !ALLOWED_NODES.has(node.type)) throw new Error("Rich text sadrži nedozvoljen blok.");
  if (isRoot && node.type !== "doc") throw new Error("Rich text mora imati doc koren.");
  if (node.type === "text" && typeof node.text !== "string") throw new Error("Rich text tekst nije ispravan.");
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks)) throw new Error("Rich text formatiranje nije ispravno.");
    for (const rawMark of node.marks) {
      if (!rawMark || typeof rawMark !== "object" || Array.isArray(rawMark)) throw new Error("Rich text formatiranje nije ispravno.");
      const mark = rawMark as Record<string, unknown>;
      if (typeof mark.type !== "string" || !ALLOWED_MARKS.has(mark.type)) throw new Error("Rich text sadrži nedozvoljeno formatiranje.");
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
    node.content.forEach((child) => validateNode(child));
  }
  return node as RichTextNode;
}

export function parseRichText(value?: string): RichTextNode | null {
  if (!value?.trim()) return null;
  if (value.length > MAX_RICH_TEXT_LENGTH) throw new Error("Rich text je predugačak.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Rich text JSON nije ispravan.");
  }
  return validateNode(parsed, true);
}

function collectText(node: RichTextNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const joined = (node.content ?? []).map(collectText).join("");
  return node.type === "paragraph" || node.type === "listItem" ? `${joined}\n` : joined;
}

export function richTextToPlainText(value?: string): string {
  const document = parseRichText(value);
  return document ? collectText(document).replace(/\n{3,}/g, "\n\n").trim() : "";
}

export function richTextHasContent(value?: string, fallback = ""): boolean {
  if (!value?.trim()) return Boolean(fallback.trim());
  try {
    return Boolean(richTextToPlainText(value));
  } catch {
    return false;
  }
}
