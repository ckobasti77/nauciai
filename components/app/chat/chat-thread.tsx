/* eslint-disable @next/next/no-img-element -- Convex storage URLs are signed and dynamic. */
"use client";

import {
  Archive,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Flag,
  ImagePlus,
  Link2,
  Loader2,
  MessageCircle,
  Minus,
  MoreHorizontal,
  Pin,
  Reply,
  Search,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatComposer } from "@/components/app/chat/chat-composer";
import { ReportDialog } from "@/components/app/chat/chat-dialogs";
import { ConversationDetailsDialog } from "@/components/app/chat/chat-group-details";
import { requestChatMotion } from "@/components/app/chat/chat-motion";
import {
  Avatar,
  type ChatMessage,
  type ConversationParticipant,
  type LinkPreviewResult,
  type MessageLinkPreview,
  type PendingSend,
  type PreparedChatImage,
  type ReportTarget,
  firstHttpUrl,
  label,
  newMessagesLabel,
  preferredScrollBehavior,
} from "@/components/app/chat/chat-shared";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

function MessageBubble({
  locale,
  conversationId,
  conversationKind,
  message,
  viewerId,
  onReply,
  onReport,
  animateIn = false,
  highlighted = false,
}: {
  locale: Locale;
  conversationId: Id<"chatConversations">;
  conversationKind: "direct" | "support" | "group";
  message: ChatMessage;
  viewerId?: string;
  onReply: (message: ChatMessage) => void;
  onReport: (messageId: Id<"chatMessages">) => void;
  animateIn?: boolean;
  highlighted?: boolean;
}) {
  const [revealRequested, setRevealRequested] = useState(false);
  const revealedMessage = useQuery(api.chat.revealBlockedMessage, message.collapsed && revealRequested ? { messageId: message.id } : "skip");
  const visibleMessage = revealedMessage ?? message;
  const sender = visibleMessage.sender as { userId?: Id<"users">; name?: string; avatarUrl?: string | null } | null;
  const mine = sender?.userId && String(sender.userId) === viewerId;
  const toggleReaction = useMutation(api.chat.toggleReaction);
  const editMessage = useMutation(api.chat.editMessage);
  const deleteMessage = useMutation(api.chat.deleteMessageForEveryone);
  const allowRequestImages = useMutation(api.chat.allowRequestImages);
  const requestLinkPreview = useAction(api.chatLinkPreview.requestLinkPreview);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body ?? "");
  const [withinEditWindow, setWithinEditWindow] = useState(false);
  const [linkPreview, setLinkPreview] = useState<LinkPreviewResult | null>(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
  const [linkPreviewError, setLinkPreviewError] = useState(false);
  const linkUrl = firstHttpUrl(visibleMessage.body);
  const persistedLinkPreview = (visibleMessage as ChatMessage & { linkPreview?: MessageLinkPreview | null }).linkPreview;
  const readyLinkPreview: MessageLinkPreview | null = persistedLinkPreview?.status === "ready"
    ? persistedLinkPreview
    : linkPreview?.status === "ready"
      ? {
          url: linkPreview.normalizedUrl,
          title: linkPreview.title,
          description: linkPreview.description,
          imageUrl: linkPreview.imageUrl,
          siteName: new URL(linkPreview.normalizedUrl).hostname,
          status: "ready",
        }
      : null;
  const seenNames = visibleMessage.seenBy.map((user) => user?.name).filter((name): name is string => Boolean(name));
  const seenCount = visibleMessage.seenCount ?? seenNames.length;
  const seenTitle = `${seenNames.join(", ")}${visibleMessage.seenByTruncated ? `${seenNames.length ? ", " : ""}…` : ""}`;
  const readStatusRef = useRef<HTMLSpanElement>(null);
  const previousSeenCountRef = useRef(seenCount);

  useEffect(() => {
    const remaining = message.createdAt + 15 * 60 * 1000 - Date.now();
    if (remaining <= 0) return;
    const frame = window.requestAnimationFrame(() => setWithinEditWindow(true));
    const timer = window.setTimeout(() => setWithinEditWindow(false), remaining);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [message.createdAt]);

  useEffect(() => {
    if (!mine || previousSeenCountRef.current === seenCount) return;
    previousSeenCountRef.current = seenCount;
    if (readStatusRef.current) requestChatMotion(readStatusRef.current, { kind: "read-status" });
  }, [mine, seenCount]);

  if (message.kind === "system") return <p id={`message-${message.id}`} className={cn("mx-auto my-3 max-w-md rounded-full border border-line bg-white px-4 py-2 text-center text-[11px] font-black text-muted", highlighted && "ring-4 ring-yellow/70")}>{message.body}</p>;

  return (
    <article id={`message-${message.id}`} data-chat-motion="bubble" data-chat-motion-new={animateIn ? "true" : undefined} data-chat-motion-direction={mine ? "right" : "left"} className={cn("group flex max-w-[88%] gap-2 rounded-[16px] transition-shadow", mine ? "ml-auto flex-row-reverse" : "mr-auto", highlighted && "ring-4 ring-yellow/70 ring-offset-2")}>
      {!mine ? <Avatar src={sender?.avatarUrl} name={sender?.name ?? "Član"} size="sm" /> : null}
      <div className="min-w-0">
        {!mine ? <p className="mb-1 px-1 text-[10px] font-black text-muted">{sender?.name}</p> : null}
        <div className={cn("relative rounded-[16px] border-2 border-ink px-3.5 py-2.5 shadow-[2px_2px_0_0_rgba(14,49,88,0.14)]", mine ? "bg-yellow" : "bg-white")}>
          {visibleMessage.replyTo ? <div className="mb-2 rounded-[8px] border-l-4 border-ink bg-paper/80 px-2 py-1.5 text-[11px] font-bold text-muted">{visibleMessage.replyTo.senderName}: {visibleMessage.replyTo.body}</div> : null}
          {message.collapsed && !revealedMessage ? <button type="button" onClick={() => setRevealRequested(true)} disabled={revealRequested} className="inline-flex items-center gap-2 text-xs font-black underline disabled:no-underline" aria-label={label(locale, "Prikaži poruku blokiranog člana", "Show blocked member message")}>{revealRequested ? <Loader2 className="size-3.5 animate-spin" /> : null}{label(locale, "Prikaži poruku blokiranog člana", "Show blocked member message")}</button> : editing ? (
            <form onSubmit={async (event) => { event.preventDefault(); const body = editBody.trim(); if (!body) return; await editMessage({ messageId: message.id, body }); setEditing(false); }} className="flex gap-2">
              <input value={editBody} onChange={(event) => setEditBody(event.target.value)} className="min-w-0 flex-1 rounded-[8px] border-2 border-ink bg-white px-2 py-1 text-sm font-bold" autoFocus />
              <button type="submit" className="grid size-8 place-items-center rounded-full bg-ink text-white" aria-label={label(locale, "Sačuvaj", "Save")}><Check className="size-4" /></button>
            </form>
          ) : <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-6">{visibleMessage.deletedAt ? label(locale, "Poruka je obrisana.", "Message deleted.") : visibleMessage.body}</p>}
          {visibleMessage.images?.length ? <div className={cn("mt-2 grid gap-2", visibleMessage.images.length > 1 && "grid-cols-2")}>{visibleMessage.images.map((image) => image.url ? <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-[8px] border-2 border-ink bg-paper"><img src={image.url} alt={image.fileName || ""} className="max-h-72 w-full object-cover" /></a> : <button key={image.id} type="button" onClick={() => void allowRequestImages({ conversationId })} className="rounded-[8px] border-2 border-dashed border-ink bg-paper p-4 text-xs font-black"><ImagePlus className="mx-auto mb-2 size-5" />{image.fileName} · <span className="font-mono">{Math.ceil(image.byteSize / 1024)} KB</span><br />{label(locale, "Potvrdi otvaranje slike", "Confirm opening image")}</button>)}</div> : null}
          {linkUrl && !message.collapsed && !visibleMessage.deletedAt ? <div className="mt-2">
            {readyLinkPreview ? <a href={readyLinkPreview.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[12px] border-2 border-ink bg-paper transition hover:bg-white">{readyLinkPreview.imageUrl ? <img src={readyLinkPreview.imageUrl} alt="" className="max-h-40 w-full object-cover" /> : null}<span className="block p-3"><span className="flex items-center gap-2 text-[10px] font-black uppercase text-[#2e6f9f]"><Link2 className="size-3.5" />{readyLinkPreview.siteName || label(locale, "Pregled linka", "Link preview")}</span><span className="mt-1 block text-sm font-black">{readyLinkPreview.title || readyLinkPreview.url}</span>{readyLinkPreview.description ? <span className="mt-1 line-clamp-2 block text-[11px] font-semibold text-muted">{readyLinkPreview.description}</span> : null}<span className="mt-1 block truncate text-[9px] font-bold text-muted">{readyLinkPreview.url}</span></span></a> : <button type="button" disabled={linkPreviewLoading} onClick={() => { setLinkPreviewLoading(true); setLinkPreviewError(false); void requestLinkPreview({ messageId: message.id, url: linkUrl }).then((result) => { setLinkPreview(result); setLinkPreviewError(result.status !== "ready"); }).catch(() => setLinkPreviewError(true)).finally(() => setLinkPreviewLoading(false)); }} className="inline-flex items-center gap-2 rounded-full border border-ink bg-paper px-3 py-1.5 text-[10px] font-black disabled:opacity-60">{linkPreviewLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}{linkPreviewError || persistedLinkPreview?.status === "failed" ? label(locale, "Pokušaj pregled ponovo", "Retry preview") : label(locale, "Učitaj bezbedan pregled linka", "Load safe link preview")}</button>}
          </div> : null}
          <div className="mt-1.5 flex items-center justify-end gap-1 text-[9px] font-black text-muted">
            {visibleMessage.editedAt ? <span>{label(locale, "izmenjeno", "edited")}</span> : null}
            <span className="font-mono">{new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}</span>
            {mine ? <span ref={readStatusRef} data-chat-motion="read-status" className="inline-flex items-center gap-1 text-[#2e6f9f]" title={seenTitle || undefined}>{seenCount ? <><CheckCheck className="size-3.5" /><span>{conversationKind === "group" ? label(locale, `Videlo ${seenCount}`, `Seen by ${seenCount}`) : label(locale, "Viđeno", "Seen")}</span></> : <Check className="size-3.5" />}</span> : null}
          </div>
          {!visibleMessage.deletedAt && !message.collapsed ? <button type="button" onClick={() => setMenuOpen((value) => !value)} className={cn("absolute -top-3 grid size-7 place-items-center rounded-full border border-ink bg-white opacity-0 transition group-hover:opacity-100 focus:opacity-100", mine ? "-left-4" : "-right-4")} aria-label={label(locale, "Opcije poruke", "Message options")}><MoreHorizontal className="size-4" /></button> : null}
          {menuOpen ? <div className={cn("absolute top-7 z-20 flex min-w-max gap-1 rounded-full border-2 border-ink bg-white p-1 shadow-lg", mine ? "right-full mr-2" : "left-full ml-2")}>
            <button type="button" onClick={() => { onReply(message); setMenuOpen(false); }} className="grid size-8 place-items-center rounded-full hover:bg-paper" aria-label={label(locale, "Odgovori", "Reply")}><Reply className="size-4" /></button>
            <button type="button" onClick={() => void toggleReaction({ messageId: message.id, emoji: "👍" })} className="grid size-8 place-items-center rounded-full hover:bg-paper" aria-label={label(locale, "Reaguj", "React")}>👍</button>
            {!mine ? <button type="button" onClick={() => { onReport(message.id); setMenuOpen(false); }} className="grid size-8 place-items-center rounded-full text-red-700 hover:bg-red-50" aria-label={label(locale, "Prijavi poruku", "Report message")}><Flag className="size-4" /></button> : null}
            {mine && withinEditWindow ? <button type="button" onClick={() => { setEditing(true); setMenuOpen(false); }} className="rounded-full px-2 text-[10px] font-black hover:bg-paper">{label(locale, "Izmeni", "Edit")}</button> : null}
            {mine && withinEditWindow ? <button type="button" onClick={() => void deleteMessage({ messageId: message.id })} className="rounded-full px-2 text-[10px] font-black text-red-700 hover:bg-red-50">{label(locale, "Obriši", "Delete")}</button> : null}
          </div> : null}
        </div>
        {visibleMessage.reactions?.length ? <div className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}>{visibleMessage.reactions.map((reaction) => <button key={reaction.emoji} type="button" data-chat-motion="reaction" onClick={(event) => { requestChatMotion(event.currentTarget, { kind: "reaction" }); void toggleReaction({ messageId: message.id, emoji: reaction.emoji }); }} className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-black">{reaction.emoji} <span className="font-mono">{reaction.count}</span></button>)}</div> : null}
      </div>
    </article>
  );
}

export function ConversationPanel({
  locale,
  conversationId,
  compact = false,
  onBack,
  onMinimize,
  onClose,
}: {
  locale: Locale;
  conversationId: Id<"chatConversations">;
  compact?: boolean;
  onBack?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  const conversation = useQuery(api.chat.getConversation, { conversationId });
  const messages = usePaginatedQuery(api.chat.listMessagesPage, { conversationId }, { initialNumItems: compact ? 20 : 40 });
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const messageSearch = usePaginatedQuery(
    api.chat.searchConversationMessagesPage,
    messageSearchOpen && messageSearchQuery.trim().length >= 2 ? { conversationId, query: messageSearchQuery.trim() } : "skip",
    { initialNumItems: 20 },
  );
  const typing = useQuery(api.chat.listTyping, { conversationId });
  const draft = useQuery(api.chat.getDraft, { conversationId });
  const conversationPreferences = useQuery(api.chat.getNotificationPreferences, { conversationId });
  const sendMessage = useMutation(api.chat.sendMessage);
  const markRead = useMutation(api.chat.markRead);
  const setTyping = useMutation(api.chat.setTyping);
  const saveDraft = useMutation(api.chat.saveDraft);
  const createImageUploadUrl = useMutation(api.chat.createImageUploadUrl);
  const prepareImage = useAction(api.chatMedia.prepareImage);
  const updateMemberState = useMutation(api.chat.updateMemberState);
  const respondDirectRequest = useMutation(api.chat.respondDirectRequest);
  const respondGroupInvite = useMutation(api.chat.respondGroupInvite);
  const deleteConversationForMe = useMutation(api.chat.deleteConversationForMe);
  const blockUser = useMutation(api.chat.blockUser);
  const setNotificationPreference = useMutation(api.chat.setNotificationPreferences);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [sendFailure, setSendFailure] = useState<PendingSend>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [requestBusy, setRequestBusy] = useState<"accept" | "decline">();
  const [requestError, setRequestError] = useState<string>();
  const [destructiveAction, setDestructiveAction] = useState<"delete" | "block">();
  const [destructiveBusy, setDestructiveBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget>();
  const [preparedImages, setPreparedImages] = useState<PreparedChatImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageError, setImageError] = useState<string>();
  const [draggingImages, setDraggingImages] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [animationCutoffSequence, setAnimationCutoffSequence] = useState<number | null>(null);
  const [targetMessageId, setTargetMessageId] = useState<Id<"chatMessages">>();
  const [highlightedMessageId, setHighlightedMessageId] = useState<Id<"chatMessages">>();
  const hydratedDraftRef = useRef<string | null>(null);
  const typingAtRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const settingsPopoverRef = useRef<HTMLDivElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const nearBottomRef = useRef(true);
  const initialScrollRef = useRef<string | undefined>(undefined);
  const previousLatestSequenceRef = useRef(0);

  const processImageFiles = useCallback(async (incoming: FileList | File[]) => {
    const files = Array.from(incoming).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      setImageError(label(locale, "Možeš dodati samo slike.", "Only images can be added."));
      return;
    }
    if (preparedImages.length + files.length > 4) {
      setImageError(label(locale, "Jedna poruka može imati najviše četiri slike.", "A message can contain up to four images."));
      return;
    }
    if (preparedImages.reduce((sum, image) => sum + image.byteSize, 0) + files.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) {
      setImageError(label(locale, "Slike u jednoj poruci mogu imati ukupno najviše 25 MB.", "Images in one message may total at most 25 MB."));
      return;
    }
    setUploadingImages(true);
    setImageError(undefined);
    try {
      const next: PreparedChatImage[] = [];
      for (const file of files) {
        const uploadUrl = await createImageUploadUrl({});
        const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!response.ok) throw new Error("Upload failed");
        const { storageId } = await response.json() as { storageId: Id<"_storage"> };
        next.push(await prepareImage({ storageId, fileName: file.name }));
      }
      setPreparedImages((current) => [...current, ...next]);
    } catch {
      setImageError(label(locale, "Slika nije prošla bezbednosnu obradu. Pokušaj drugu sliku.", "The image failed security processing. Try another image."));
    } finally {
      setUploadingImages(false);
    }
  }, [createImageUploadUrl, locale, prepareImage, preparedImages]);

  useEffect(() => {
    if (compact || conversation?.viewer.status !== "active") return;
    const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onDragEnter = (event: DragEvent) => { if (!isFileDrag(event)) return; event.preventDefault(); setDraggingImages(true); };
    const onDragOver = (event: DragEvent) => { if (!isFileDrag(event)) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; };
    const onDragLeave = (event: DragEvent) => { if (!event.relatedTarget) setDraggingImages(false); };
    const onDrop = (event: DragEvent) => { if (!isFileDrag(event)) return; event.preventDefault(); setDraggingImages(false); if (event.dataTransfer?.files.length) void processImageFiles(event.dataTransfer.files); };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [compact, conversation?.viewer.status, processImageFiles]);

  useEffect(() => {
    if (draft === undefined || hydratedDraftRef.current === String(conversationId)) return;
    hydratedDraftRef.current = String(conversationId);
    setBody(draft?.body ?? "");
  }, [conversationId, draft]);

  useEffect(() => {
    if (!settingsOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!settingsPopoverRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSettingsOpen(false);
      requestAnimationFrame(() => settingsTriggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (hydratedDraftRef.current !== String(conversationId)) return;
    const timer = window.setTimeout(() => void saveDraft({ conversationId, body }).catch(() => undefined), 550);
    return () => window.clearTimeout(timer);
  }, [body, conversationId, saveDraft]);

  const latestSequence = conversation?.conversation.lastMessageSequence ?? 0;
  const orderedMessages = useMemo(() => [...messages.results].reverse(), [messages.results]);

  useEffect(() => {
    if (messages.status === "LoadingFirstPage" || animationCutoffSequence !== null) return;
    const frame = window.requestAnimationFrame(() => setAnimationCutoffSequence((current) => current ?? latestSequence));
    return () => window.cancelAnimationFrame(frame);
  }, [animationCutoffSequence, latestSequence, messages.status]);

  useEffect(() => {
    if (messages.status === "LoadingFirstPage" || initialScrollRef.current === String(conversationId)) return;
    initialScrollRef.current = String(conversationId);
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollTop = viewport.scrollHeight;
      nearBottomRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversationId, messages.status]);

  useEffect(() => {
    if (!latestSequence || conversation?.viewer.status !== "active") return;
    const previous = previousLatestSequenceRef.current;
    previousLatestSequenceRef.current = latestSequence;
    if (!previous) {
      void markRead({ conversationId, sequence: latestSequence }).catch(() => undefined);
      return;
    }
    if (latestSequence <= previous) return;
    if (nearBottomRef.current) {
      const frame = window.requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      });
      setNewMessageCount(0);
      void markRead({ conversationId, sequence: latestSequence }).catch(() => undefined);
      return () => window.cancelAnimationFrame(frame);
    }
    setNewMessageCount((count) => count + Math.max(1, latestSequence - previous));
  }, [conversation?.viewer.status, conversationId, latestSequence, markRead]);

  useEffect(() => {
    if (!targetMessageId) return;
    const element = document.getElementById(`message-${targetMessageId}`);
    if (element) {
      const messageId = targetMessageId;
      const frame = window.requestAnimationFrame(() => {
        element.scrollIntoView({ block: "center", behavior: preferredScrollBehavior() });
        setHighlightedMessageId(messageId);
        setTargetMessageId(undefined);
        window.setTimeout(() => setHighlightedMessageId((current) => current === messageId ? undefined : current), 1800);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (messages.status === "CanLoadMore") {
      messages.loadMore(compact ? 20 : 40);
      return;
    }
    if (messages.status === "Exhausted") {
      const frame = window.requestAnimationFrame(() => setTargetMessageId(undefined));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [compact, messages, messages.results.length, messages.status, targetMessageId]);

  function handleViewportScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 120;
    nearBottomRef.current = nearBottom;
    if (nearBottom && newMessageCount) {
      setNewMessageCount(0);
      if (latestSequence && conversation?.viewer.status === "active") void markRead({ conversationId, sequence: latestSequence }).catch(() => undefined);
    }
  }

  function jumpToLatest() {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: preferredScrollBehavior() });
    nearBottomRef.current = true;
    setNewMessageCount(0);
    if (latestSequence && conversation?.viewer.status === "active") void markRead({ conversationId, sequence: latestSequence }).catch(() => undefined);
  }

  const title = conversation?.conversation.title || conversation?.members.find((member) => String(member.userId) !== String(conversation.viewer.userId))?.name || label(locale, "Razgovor", "Conversation");

  function mentionIdsFor(text: string) {
    if (conversation?.conversation.kind !== "group") return [];
    const usernames = new Set(Array.from(text.matchAll(/(?:^|\s)@([\p{L}\p{N}._]+)/gu), (match) => match[1].toLocaleLowerCase()));
    return conversation.members
      .filter((member): member is ConversationParticipant & { userId: Id<"users">; username: string } => Boolean(member.userId && member.username && member.status === "active" && usernames.has(member.username.toLocaleLowerCase())))
      .map((member) => member.userId)
      .slice(0, 20);
  }

  async function attemptSend(payload: PendingSend, bodyToRestore?: string) {
    if (sending) return;
    setSending(true);
    try {
      await sendMessage(payload);
      setSendFailure(undefined);
      setBody((current) => current.trim() === (payload.body ?? "") ? "" : current);
      setReplyTo((current) => current?.id === payload.replyToMessageId ? null : current);
      const sentImageIds = new Set(payload.imageIds);
      setPreparedImages((current) => current.filter((image) => !sentImageIds.has(image.imageId)));
    } catch {
      if (bodyToRestore) setBody((current) => current || bodyToRestore);
      setSendFailure(payload);
    } finally {
      setSending(false);
    }
  }

  async function submit() {
    const text = body.trim();
    if ((!text && !preparedImages.length) || sending) return;
    const payload: PendingSend = {
      conversationId,
      body: text || undefined,
      imageIds: preparedImages.map((image) => image.imageId),
      replyToMessageId: replyTo?.id,
      mentionUserIds: mentionIdsFor(text),
      clientNonce: crypto.randomUUID(),
    };
    const optimisticBody = body;
    setBody("");
    setSendFailure(undefined);
    await attemptSend(payload, optimisticBody);
  }

  if (conversation === undefined) return <div className="grid h-full min-h-72 place-items-center"><Loader2 className="size-7 animate-spin" /></div>;
  if (conversation === null) return <div className="grid h-full min-h-72 place-items-center p-6 text-center font-black">{label(locale, "Razgovor nije dostupan.", "Conversation is unavailable.")}</div>;

  const pendingDirect = conversation.viewer.requestStatus === "pending";
  const invited = conversation.viewer.status === "invited";
  const viewerSentPendingDirect = pendingDirect && conversation.directRequest?.senderId === conversation.viewer.userId;
  const counterpart = conversation.members.find((member) => member.userId && member.userId !== conversation.viewer.userId);
  const chatPreference = conversationPreferences?.find((preference) => preference.category === "chat");

  function exitConversation() {
    onClose?.();
    if (!onClose) router.push(withLocale(locale, "/app/messages"));
  }

  async function runDestructiveAction() {
    if (!destructiveAction || destructiveBusy) return;
    setDestructiveBusy(true);
    try {
      if (destructiveAction === "block" && counterpart?.userId) await blockUser({ userId: counterpart.userId });
      else await deleteConversationForMe({ conversationId });
      exitConversation();
    } finally {
      setDestructiveBusy(false);
    }
  }

  async function answerPendingRequest(accept: boolean) {
    if (requestBusy) return;
    setRequestBusy(accept ? "accept" : "decline");
    setRequestError(undefined);
    try {
      if (invited) await respondGroupInvite({ conversationId, accept });
      else await respondDirectRequest({ conversationId, accept });
    } catch {
      setRequestError(label(locale, "Odgovor nije sačuvan. Pokušaj ponovo.", "Your response was not saved. Try again."));
    } finally {
      setRequestBusy(undefined);
    }
  }

  function toggleConversationPreference(key: "inApp" | "push" | "sound") {
    const current = chatPreference ?? { inApp: true, push: true, sound: true };
    void setNotificationPreference({
      category: "chat",
      conversationId,
      inApp: key === "inApp" ? !current.inApp : current.inApp,
      push: key === "push" ? !current.push : current.push,
      sound: key === "sound" ? !current.sound : current.sound,
    });
  }

  return (
    <section
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white", !compact && "rounded-[16px] border-2 border-ink shadow-[5px_5px_0_0_rgba(14,49,88,0.12)]")}
      onDragEnter={compact ? (event) => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); setDraggingImages(true); } } : undefined}
      onDragOver={compact ? (event) => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } } : undefined}
      onDragLeave={compact ? (event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingImages(false); } : undefined}
      onDrop={compact ? (event) => { if (!Array.from(event.dataTransfer.types).includes("Files")) return; event.preventDefault(); setDraggingImages(false); void processImageFiles(event.dataTransfer.files); } : undefined}
    >
      {draggingImages ? <div data-chat-motion="drag-overlay" data-chat-motion-new="true" className={cn("pointer-events-none z-50 grid place-items-center bg-ink/55 p-5 backdrop-blur-[2px]", compact ? "absolute inset-0" : "fixed inset-0")}><div className="w-[min(92vw,32rem)] rounded-[16px] border-[3px] border-ink bg-yellow p-6 text-center shadow-[8px_8px_0_0_#fff]"><UploadCloud className="mx-auto size-10" /><p className="mt-3 text-xl font-black">{label(locale, "Pusti slike bilo gde u razgovoru", "Drop images anywhere in the conversation")}</p><p className="mt-2 text-xs font-bold">{label(locale, "Do četiri slike, ukupno 25 MB. Sve slike prolaze decode i ponovni encode.", "Up to four images, 25 MB total. Every image is decoded and re-encoded.")}</p></div></div> : null}
      <header className="flex min-h-16 items-center gap-3 border-b-2 border-ink bg-white px-3 sm:px-4">
        {onBack ? <button type="button" onClick={onBack} className="grid size-10 place-items-center rounded-full border-2 border-ink xl:hidden" aria-label={label(locale, "Nazad", "Back")}><ArrowLeft className="size-5" /></button> : null}
        <Avatar src={conversation.conversation.imageUrl} name={title} />
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-black text-ink">{title}</h2><p className="truncate text-[10px] font-bold text-muted">{typing?.length ? <span data-chat-motion="typing" data-chat-motion-new="true">{`${typing.map((item) => item.name).filter(Boolean).join(", ")} ${label(locale, "kuca…", "typing…")}`}</span> : conversation.conversation.kind === "group" ? (() => { const memberCount = conversation.members.filter((item) => item.status === "active").length; return `${memberCount} ${label(locale, memberCount === 1 ? "član" : "članova", memberCount === 1 ? "member" : "members")}`; })() : label(locale, "Razgovor uživo", "Live conversation")}</p></div>
        {onMinimize ? <button type="button" onClick={onMinimize} className="grid size-9 place-items-center rounded-full border-2 border-ink bg-white" aria-label={label(locale, "Minimizuj", "Minimize")}><Minus className="size-4" /></button> : null}
        {onClose ? <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full border-2 border-ink bg-white" aria-label={label(locale, "Ukloni iz dock-a", "Remove from dock")}><X className="size-4" /></button> : null}
        {!compact ? <button type="button" onClick={() => setMessageSearchOpen((value) => !value)} aria-expanded={messageSearchOpen} className={cn("grid size-10 place-items-center rounded-full border-2 border-ink", messageSearchOpen ? "bg-ink text-white" : "bg-white")} aria-label={label(locale, "Pretraži ovaj razgovor", "Search this conversation")}><Search className="size-4" /></button> : null}
        <div ref={settingsPopoverRef} className="relative">
          <button ref={settingsTriggerRef} type="button" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen} aria-haspopup="dialog" className="grid size-10 place-items-center rounded-full border-2 border-ink" aria-label={label(locale, "Podešavanja razgovora", "Conversation settings")}><ChevronDown className={cn("size-4 transition", settingsOpen && "rotate-180")} /></button>
          {settingsOpen ? <div role="dialog" aria-label={label(locale, "Podešavanja razgovora", "Conversation settings")} className="absolute right-0 top-12 z-30 w-60 rounded-[16px] border-2 border-ink bg-white p-2 shadow-xl">
            <button type="button" onClick={() => void updateMemberState({ conversationId, isPinned: true })} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black hover:bg-paper"><Pin className="size-4" />{label(locale, "Zakači", "Pin")}</button>
            <button type="button" onClick={() => void updateMemberState({ conversationId, isArchived: true })} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black hover:bg-paper"><Archive className="size-4" />{label(locale, "Arhiviraj", "Archive")}</button>
            <button type="button" onClick={() => { setSettingsOpen(false); setDetailsOpen(true); }} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black hover:bg-paper">{conversation.conversation.kind === "group" ? <Users className="size-4" /> : <ImagePlus className="size-4" />}{conversation.conversation.kind === "group" ? label(locale, "Detalji i članovi", "Details and members") : label(locale, "Mediji i detalji", "Media and details")}</button>
            {conversation.conversation.kind === "group" ? <button type="button" onClick={() => { setSettingsOpen(false); setReportTarget({ type: "group", conversationId }); }} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black text-red-700 hover:bg-red-50"><Flag className="size-4" />{label(locale, "Prijavi grupu", "Report group")}</button> : null}
            <div className="mt-1 border-t border-line pt-1"><p className="px-3 py-1 text-[9px] font-black uppercase text-muted">{label(locale, "Utišaj", "Mute")}</p>{[[1, "1h"], [8, "8h"], [168, "7d"], [-1, label(locale, "Zauvek", "Forever")]].map(([hours, text]) => <button key={String(hours)} type="button" onClick={() => void updateMemberState({ conversationId, mutedUntil: hours === -1 ? -1 : Date.now() + Number(hours) * 60 * 60 * 1000 })} className="rounded-full px-3 py-1.5 font-mono text-[10px] font-black hover:bg-paper">{text}</button>)}</div>
            <div className="mt-1 border-t border-line pt-2"><p className="px-3 py-1 text-[9px] font-black uppercase text-muted">{label(locale, "Obaveštenja ovog razgovora", "This conversation notifications")}</p><div className="flex flex-wrap gap-1 px-2">{(["inApp", "push", "sound"] as const).map((key) => { const active = chatPreference?.[key] ?? true; const text = key === "inApp" ? label(locale, "U aplikaciji", "In app") : key === "push" ? "Push" : label(locale, "Zvuk", "Sound"); return <button key={key} type="button" aria-pressed={active} onClick={() => toggleConversationPreference(key)} className={cn("rounded-full border border-ink px-2 py-1 text-[9px] font-black", active ? "bg-ink text-white" : "bg-white")}>{text}</button>; })}</div></div>
            <div className="mt-2 border-t border-red-200 pt-1">{conversation.conversation.kind !== "group" && counterpart?.userId ? <button type="button" onClick={() => setDestructiveAction("block")} className="flex min-h-9 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black text-red-700 hover:bg-red-50"><X className="size-4" />{label(locale, "Blokiraj člana", "Block member")}</button> : null}<button type="button" onClick={() => setDestructiveAction("delete")} className="flex min-h-9 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black text-red-700 hover:bg-red-50"><Archive className="size-4" />{label(locale, "Obriši za mene", "Delete for me")}</button>{destructiveAction ? <div className="m-1 rounded-[10px] border border-red-400 bg-red-50 p-2"><p className="text-[10px] font-black text-red-800">{destructiveAction === "block" ? label(locale, "Blokiranje arhivira direktan razgovor.", "Blocking archives the direct conversation.") : label(locale, "Istorija pre ove tačke biće sakrivena samo tebi.", "History up to this point will be hidden only for you.")}</p><div className="mt-2 flex gap-1"><button type="button" onClick={() => setDestructiveAction(undefined)} className="flex-1 rounded-full border border-ink bg-white px-2 py-1 text-[9px] font-black">{label(locale, "Otkaži", "Cancel")}</button><button type="button" onClick={() => void runDestructiveAction()} disabled={destructiveBusy} className="flex-1 rounded-full border border-red-700 bg-red-600 px-2 py-1 text-[9px] font-black text-white disabled:opacity-50">{label(locale, "Potvrdi", "Confirm")}</button></div></div> : null}</div>
          </div> : null}
        </div>
      </header>

      {messageSearchOpen && !compact ? <div data-chat-motion-surface="panel" className="border-b-2 border-ink bg-[#d7e9f5] p-3 sm:p-4">
        <div className="mx-auto max-w-3xl">
          <label className="flex h-11 items-center gap-2 rounded-full border-2 border-ink bg-white px-4"><Search className="size-4 text-muted" /><span className="sr-only">{label(locale, "Pretraži sadržaj razgovora", "Search conversation content")}</span><input autoFocus value={messageSearchQuery} onChange={(event) => setMessageSearchQuery(event.target.value)} placeholder={label(locale, "Reč ili fraza u porukama", "Word or phrase in messages")} className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" /><button type="button" onClick={() => { setMessageSearchOpen(false); setMessageSearchQuery(""); }} className="grid size-8 place-items-center rounded-full border border-line" aria-label={label(locale, "Zatvori pretragu", "Close search")}><X className="size-4" /></button></label>
          {messageSearchQuery.trim().length >= 2 ? <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-[16px] border-2 border-line bg-white p-2" aria-live="polite">
            {messageSearch.results.map((result) => <button key={result.messageId} type="button" onClick={() => setTargetMessageId(result.messageId)} className="flex w-full items-start gap-3 rounded-[12px] px-3 py-2 text-left hover:bg-paper"><span className="min-w-0 flex-1"><span className="block text-[10px] font-black text-[#2e6f9f]">{result.senderName}</span><span className="mt-0.5 line-clamp-2 block text-xs font-bold text-ink">{result.body}</span></span><span className="shrink-0 font-mono text-[9px] font-bold text-muted">{new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(result.createdAt))}</span></button>)}
            {!messageSearch.results.length && messageSearch.status !== "LoadingFirstPage" ? <p className="p-5 text-center text-xs font-black text-muted">{label(locale, "Nema pronađenih poruka.", "No messages found.")}</p> : null}
            {messageSearch.status === "LoadingFirstPage" ? <div className="grid min-h-20 place-items-center"><Loader2 className="size-5 animate-spin" /></div> : null}
            {messageSearch.status === "CanLoadMore" ? <button type="button" onClick={() => messageSearch.loadMore(20)} className="w-full rounded-full border border-ink bg-white px-3 py-2 text-[10px] font-black">{label(locale, "Učitaj još rezultata", "Load more results")}</button> : null}
          </div> : <p className="mt-2 px-2 text-[10px] font-bold text-muted">{label(locale, "Unesi najmanje dva znaka.", "Enter at least two characters.")}</p>}
        </div>
      </div> : null}

      {(pendingDirect || invited) ? <div data-chat-motion="request" data-chat-motion-new="true" className="border-b-2 border-ink bg-yellow/25 p-3 text-center">
        <p className="text-xs font-black">{invited ? label(locale, "Poziv u ovu grupu čeka tvoj odgovor.", "A group invite is waiting for your response.") : viewerSentPendingDirect ? label(locale, "Zahtev je poslat. Čekaš da član prihvati razgovor.", "Request sent. Waiting for the member to accept the conversation.") : label(locale, "Prihvati zahtev da biste slobodno razmenjivali poruke.", "Accept the request to continue messaging freely.")}</p>
        {requestError ? <p role="alert" className="mt-2 text-[10px] font-black text-red-800">{requestError}</p> : null}
        {!viewerSentPendingDirect ? <div className="mt-2 flex justify-center gap-2"><button type="button" disabled={Boolean(requestBusy)} onClick={(event) => { requestChatMotion(event.currentTarget, { kind: "reaction" }); void answerPendingRequest(true); }} className="inline-flex min-w-24 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-4 py-2 text-xs font-black text-white disabled:opacity-50">{requestBusy === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : null}{label(locale, "Prihvati", "Accept")}</button><button type="button" disabled={Boolean(requestBusy)} onClick={(event) => { requestChatMotion(event.currentTarget, { kind: "reaction" }); void answerPendingRequest(false); }} className="inline-flex min-w-24 items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black disabled:opacity-50">{requestBusy === "decline" ? <Loader2 className="size-3.5 animate-spin" /> : null}{label(locale, "Odbij", "Decline")}</button></div> : null}
      </div> : null}

      <div ref={viewportRef} onScroll={handleViewportScroll} role="log" aria-live="polite" aria-relevant="additions text" aria-label={label(locale, "Poruke u razgovoru", "Conversation messages")} data-chat-motion-surface="thread" className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-paper p-3 sm:p-4">
        {messages.status === "CanLoadMore" ? <button type="button" onClick={() => messages.loadMore(compact ? 20 : 40)} className="mx-auto block rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black">{label(locale, "Starije poruke", "Older messages")}</button> : null}
        {orderedMessages.map((message) => <MessageBubble key={message.id} locale={locale} conversationId={conversationId} conversationKind={conversation.conversation.kind} message={message} viewerId={String(conversation.viewer.userId)} onReply={setReplyTo} onReport={(messageId) => setReportTarget({ type: "message", messageId })} animateIn={animationCutoffSequence !== null && message.sequence > animationCutoffSequence} highlighted={highlightedMessageId === message.id} />)}
        {!orderedMessages.length && messages.status !== "LoadingFirstPage" ? <div className="grid min-h-48 place-items-center text-center"><div><MessageCircle className="mx-auto size-9 text-muted" /><p className="mt-3 text-sm font-black">{label(locale, "Pošalji prvu poruku.", "Send the first message.")}</p></div></div> : null}
        {newMessageCount > 0 ? <button type="button" onClick={jumpToLatest} className="sticky bottom-2 mx-auto flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black shadow-[3px_3px_0_0_rgba(14,49,88,0.18)]"><ChevronDown className="size-4" /><span className="font-mono">{newMessagesLabel(locale, newMessageCount)}</span></button> : null}
      </div>

      {conversation.viewer.status === "active" && (!pendingDirect || conversation.directRequest?.senderId === conversation.viewer.userId) ? <ChatComposer
        locale={locale}
        body={body}
        preparedImages={preparedImages}
        imageError={imageError}
        sendFailed={Boolean(sendFailure)}
        replyTo={replyTo}
        sending={sending}
        uploadingImages={uploadingImages}
        onBodyChange={setBody}
        onTyping={() => { const now = Date.now(); if (now - typingAtRef.current > 2500) { typingAtRef.current = now; void setTyping({ conversationId }).catch(() => undefined); } }}
        onSubmit={() => void submit()}
        onFiles={(files) => void processImageFiles(files)}
        onRemoveImage={(imageId) => setPreparedImages((items) => items.filter((item) => item.imageId !== imageId))}
        onRetry={() => { if (sendFailure) void attemptSend(sendFailure); }}
        onDismissFailure={() => setSendFailure(undefined)}
        onCancelReply={() => setReplyTo(null)}
      /> : null}
      {reportTarget ? <ReportDialog locale={locale} target={reportTarget} onClose={() => setReportTarget(undefined)} /> : null}
      {detailsOpen ? <ConversationDetailsDialog locale={locale} conversation={conversation} onClose={() => setDetailsOpen(false)} onExit={exitConversation} /> : null}
    </section>
  );
}
