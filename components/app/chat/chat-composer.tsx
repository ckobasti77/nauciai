"use client";

import { ImagePlus, Loader2, Paperclip, Reply, Send, X } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { type ChatMessage, type PreparedChatImage, label } from "@/components/app/chat/chat-shared";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";

export function ChatComposer({
  locale,
  body,
  preparedImages,
  imageError,
  sendFailure,
  disabledReason,
  replyTo,
  sending,
  uploadingImages,
  onBodyChange,
  onTyping,
  onSubmit,
  onFiles,
  onRemoveImage,
  onRetry,
  onDismissFailure,
  onCancelReply,
}: {
  locale: Locale;
  body: string;
  preparedImages: PreparedChatImage[];
  imageError?: string;
  sendFailure?: string;
  disabledReason?: string;
  replyTo: ChatMessage | null;
  sending: boolean;
  uploadingImages: boolean;
  onBodyChange: (value: string) => void;
  onTyping: () => void;
  onSubmit: () => void;
  onFiles: (files: FileList) => void;
  onRemoveImage: (imageId: Id<"chatImages">) => void;
  onRetry: () => void;
  onDismissFailure: () => void;
  onCancelReply: () => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = Boolean(disabledReason);

  // field-sizing:content handles Chrome/Edge/Safari 17.4+. Firefox still needs
  // the scrollHeight sync for min-h-6 / max-h-32 to mean anything.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || "fieldSizing" in document.documentElement.style) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [body]);

  return (
    <div className="border-t-2 border-ink bg-paper-strong p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {preparedImages.length ? <div className="mb-2 flex gap-2 overflow-x-auto pb-1">{preparedImages.map((image) => <div key={image.imageId} className="relative shrink-0 rounded-[12px] border-2 border-ink bg-paper px-3 py-2 pr-9 text-[10px] font-black"><ImagePlus className="mb-1 size-4" /><p className="max-w-28 truncate">{image.fileName}</p><p className="font-mono text-muted">{Math.ceil(image.byteSize / 1024)} KB</p><button type="button" onClick={() => onRemoveImage(image.imageId)} className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border border-ink bg-paper-strong" aria-label={label(locale, "Ukloni sliku", "Remove image")}><X className="size-3" /></button></div>)}</div> : null}
      {imageError ? <p role="alert" className="mb-2 rounded-[8px] border border-red-400 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{imageError}</p> : null}
      {sendFailure ? <div role="alert" className="mb-2 flex items-center gap-2 rounded-[8px] border border-red-400 bg-red-50 px-3 py-2"><p className="min-w-0 flex-1 text-xs font-black text-red-800">{sendFailure}</p><button type="button" onClick={onRetry} disabled={sending} className="rounded-full border border-red-700 bg-paper-strong px-3 py-1 text-[10px] font-black text-red-800 disabled:opacity-50">{label(locale, "Pokušaj ponovo", "Retry")}</button><button type="button" onClick={onDismissFailure} className="grid size-7 place-items-center rounded-full border border-red-300" aria-label={label(locale, "Sakrij grešku", "Dismiss error")}><X className="size-3.5" /></button></div> : null}
      {replyTo ? <div className="mb-2 flex items-center gap-2 rounded-[8px] border-l-4 border-ink bg-paper px-3 py-2 text-xs font-bold"><Reply className="size-4" /><span className="min-w-0 flex-1 truncate">{replyTo.sender?.name}: {replyTo.body}</span><button type="button" onClick={onCancelReply} aria-label={label(locale, "Otkaži odgovor", "Cancel reply")}><X className="size-4" /></button></div> : null}
      <div className="flex items-end gap-2">
        <button type="button" onClick={() => imageInputRef.current?.click()} disabled={disabled || uploadingImages || preparedImages.length >= 4} className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper-strong disabled:opacity-40" aria-label={label(locale, "Dodaj slike", "Add images")}>{uploadingImages ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}</button>
        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { if (event.target.files?.length) onFiles(event.target.files); event.currentTarget.value = ""; }} />
        <label className="min-w-0 flex-1 rounded-[16px] border-2 border-ink bg-paper px-3 py-2 focus-within:bg-paper-strong">
          <span className="sr-only">{label(locale, "Poruka", "Message")}</span>
          <textarea ref={textareaRef} value={body} disabled={disabled} onChange={(event) => { onBodyChange(event.target.value); onTyping(); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); } }} onPaste={(event) => { if (!event.clipboardData.files.length) return; event.preventDefault(); onFiles(event.clipboardData.files); }} rows={1} placeholder={label(locale, "Napiši poruku…", "Write a message…")} className="max-h-32 min-h-6 w-full resize-none overflow-y-auto bg-transparent text-sm font-semibold leading-6 field-sizing-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed" />
        </label>
        <button type="button" onClick={onSubmit} disabled={disabled || sending || (!body.trim() && !preparedImages.length)} className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow disabled:opacity-40" aria-label={label(locale, "Pošalji", "Send")}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button>
      </div>
      <p className="mt-2 px-12 text-center text-[9px] font-bold text-muted">{disabledReason ?? label(locale, "Poruke nisu end-to-end enkriptovane.", "Messages are not end-to-end encrypted.")}</p>
    </div>
  );
}
