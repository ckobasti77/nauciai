"use client";

import dynamic from "next/dynamic";
import NextImage from "next/image";
import { type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useState } from "react";
import { useMutation } from "convex/react";

import { cn } from "@/components/ui/primitives";
import { parseRichText, plainTextToRichText, richTextToPlainText, type RichTextConfig, type RichTextMark, type RichTextNode } from "@/lib/rich-text";
import { AppComposerSheet } from "@/components/app/app-composer-sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { communityRichText, type Locale } from "@/lib/i18n";

const RichTextEditor = dynamic(() => import("@/components/app/rich-text-editor"), {
  ssr: false,
  loading: () => <div className="min-h-60 animate-pulse rounded-[16px] border-2 border-line bg-paper" />,
});

function safeDocument(value: string | undefined, fallback: string, config?: RichTextConfig): RichTextNode {
  try {
    return parseRichText(value, config) ?? parseRichText(plainTextToRichText(fallback), config)!;
  } catch {
    return parseRichText(plainTextToRichText(fallback), config)!;
  }
}

function markStyle(marks?: RichTextMark[]): CSSProperties {
  const style = marks?.find((mark) => mark.type === "textStyle")?.attrs;
  return { color: style?.color, fontSize: style?.fontSize };
}

/** Spoiler u prikazu: tekst prekriven markerom boje mastila; klik/tap/Enter/Space otkriva. */
function SpoilerText({ children, locale }: { children: ReactNode; locale: Locale }) {
  const [revealed, setRevealed] = useState(false);
  const t = communityRichText[locale];
  const toggle = () => setRevealed((value) => !value);
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };
  return (
    <span role="button" tabIndex={0} aria-pressed={revealed} aria-label={revealed ? t.hideSpoiler : t.revealSpoiler} onClick={toggle} onKeyDown={onKeyDown} className={cn("rich-spoiler", revealed && "is-revealed")}>
      {children}
    </span>
  );
}

type RenderContext = { images?: Record<string, string>; locale: Locale };

function renderNode(node: RichTextNode, key: string, ctx: RenderContext): ReactNode {
  if (node.type === "text") {
    let content: ReactNode = node.text ?? "";
    let spoiler = false;
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") content = <strong>{content}</strong>;
      if (mark.type === "italic") content = <em>{content}</em>;
      if (mark.type === "underline") content = <u>{content}</u>;
      if (mark.type === "strike") content = <s>{content}</s>;
      if (mark.type === "spoiler") spoiler = true;
    }
    const span = <span key={key} style={markStyle(node.marks)}>{content}</span>;
    return spoiler ? <SpoilerText key={key} locale={ctx.locale}>{span}</SpoilerText> : span;
  }
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "image") {
    const storageId = node.attrs?.storageId;
    const url = storageId ? ctx.images?.[storageId] : undefined;
    if (!url) return null;
    const label = node.attrs?.alt?.trim() || "Slika u diskusiji";
    const { width, height } = node.attrs ?? {};
    return (
      <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="my-3 block w-fit surface-media border-2 border-line bg-paper">
        {width && height ? (
          <NextImage src={url} alt={label} width={width} height={height} className="h-auto max-h-[560px] w-auto max-w-full surface-media object-contain" unoptimized />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- legacy slike bez izmerenih dimenzija
          <img src={url} alt={label} className="max-h-[560px] max-w-full surface-media object-contain" />
        )}
      </a>
    );
  }
  const children = (node.content ?? []).map((child, index) => renderNode(child, `${key}-${index}`, ctx));
  if (node.type === "paragraph") return <p key={key}>{children}</p>;
  if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
  if (node.type === "orderedList") return <ol key={key}>{children}</ol>;
  if (node.type === "listItem") return <li key={key}>{children}</li>;
  return <>{children}</>;
}

export function RichTextContent({ value, fallback = "", className, config, images, locale = "sr" }: { value?: string; fallback?: string; className?: string; config?: RichTextConfig; images?: Record<string, string>; locale?: Locale }) {
  const document = safeDocument(value, fallback, config);
  return <div className={cn("rich-text-content", className)}>{(document.content ?? []).map((node, index) => renderNode(node, String(index), { images, locale }))}</div>;
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
            {(["sr", "en"] as const).map((entry) => <button key={entry} type="button" onClick={() => setContentLocale(entry)} className={cn("rounded-full px-4 py-2 type-eyebrow", contentLocale === entry && "bg-ink text-paper-strong")}>{entry}</button>)}
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
