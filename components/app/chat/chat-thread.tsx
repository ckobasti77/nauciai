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
import { insertAtTop, useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  buildOptimisticMessage,
  canGroupMessages,
  dayKey,
  dayLabel,
  firstHttpUrl,
  isOptimisticMessage,
  label,
  newMessagesLabel,
  preferredScrollBehavior,
  sendError,
} from "@/components/app/chat/chat-shared";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

const MAX_TARGET_LOAD_MORE = 5;

// Hoisted out of MessageBubble: at 500 messages these five hooks per row were
// ~2500 registrations per render pass, and every row rebuilt its own formatter.
function useMessageActions() {
  const toggleReaction = useMutation(api.chat.toggleReaction);
  const editMessage = useMutation(api.chat.editMessage);
  const deleteMessage = useMutation(api.chat.deleteMessageForEveryone);
  const allowRequestImages = useMutation(api.chat.allowRequestImages);
  const requestLinkPreview = useAction(api.chatLinkPreview.requestLinkPreview);
  return useMemo(
    () => ({ toggleReaction, editMessage, deleteMessage, allowRequestImages, requestLinkPreview }),
    [allowRequestImages, deleteMessage, editMessage, requestLinkPreview, toggleReaction],
  );
}

type MessageActions = ReturnType<typeof useMessageActions>;

function MessageBubble({
  locale,
  conversationId,
  conversationKind,
  message,
  viewerId,
  grouped = false,
  actions,
  timeFormatter,
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
  grouped?: boolean;
  actions: MessageActions;
  timeFormatter: Intl.DateTimeFormat;
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
  const pending = isOptimisticMessage(message);
  const { toggleReaction, editMessage, deleteMessage, allowRequestImages, requestLinkPreview } = actions;
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

  if (message.kind === "system") return <p id={`message-${message.id}`} className={cn("mx-auto my-3 max-w-md rounded-full border border-line bg-paper-strong px-4 py-2 text-center type-caption font-black text-muted", highlighted && "ring-4 ring-yellow/70")}>{message.body}</p>;

  return (
    <article id={`message-${message.id}`} data-chat-motion="bubble" data-chat-motion-new={animateIn ? "true" : undefined} data-chat-motion-direction={mine ? "right" : "left"} className={cn("group flex max-w-[min(88%,42rem)] gap-2 rounded-[16px] transition-shadow", grouped ? "mt-0.5" : "mt-3", mine ? "ml-auto flex-row-reverse" : "mr-auto", pending && "opacity-60", highlighted && "ring-4 ring-yellow/70 ring-offset-2")}>
      {!mine ? (grouped ? <span aria-hidden className="w-8 shrink-0" /> : <Avatar src={sender?.avatarUrl} name={sender?.name ?? "Član"} size="sm" />) : null}
      <div className="min-w-0">
        {!mine && !grouped ? <p className="mb-1 px-1 type-caption font-black text-muted">{sender?.name}</p> : null}
        <div className={cn("relative surface-card border-2 border-ink px-4 py-3 shadow-[2px_2px_0_0_var(--shadow-hard-14)]", mine ? "bg-yellow" : "bg-paper-strong")}>
          {visibleMessage.replyTo ? <div className="mb-2 rounded-[8px] border-l-4 border-ink bg-paper/80 px-2 py-1.5 type-caption font-bold text-muted">{visibleMessage.replyTo.senderName}: {visibleMessage.replyTo.body}</div> : null}
          {message.collapsed && !revealedMessage ? <button type="button" onClick={() => setRevealRequested(true)} disabled={revealRequested} className="inline-flex items-center gap-2 text-xs font-black underline disabled:no-underline" aria-label={label(locale, "Prikaži poruku blokiranog člana", "Show blocked member message")}>{revealRequested ? <Spinner size="xs" /> : null}{label(locale, "Prikaži poruku blokiranog člana", "Show blocked member message")}</button> : editing ? (
            <form onSubmit={async (event) => { event.preventDefault(); const body = editBody.trim(); if (!body) return; await editMessage({ messageId: message.id, body }); setEditing(false); }} className="flex gap-2">
              <input value={editBody} onChange={(event) => setEditBody(event.target.value)} className="min-w-0 flex-1 rounded-[8px] border-2 border-ink bg-paper-strong px-2 py-1 text-sm font-bold" autoFocus />
              <button type="submit" className="grid size-8 place-items-center rounded-full bg-ink text-paper-strong" aria-label={label(locale, "Sačuvaj", "Save")}><Check className="size-4" /></button>
            </form>
          ) : <p className="whitespace-pre-wrap break-words type-body-sm font-semibold">{visibleMessage.deletedAt ? label(locale, "Poruka je obrisana.", "Message deleted.") : visibleMessage.body}</p>}
          {visibleMessage.images?.length ? <div className={cn("mt-2 grid gap-2", visibleMessage.images.length > 1 && "grid-cols-2")}>{visibleMessage.images.map((image) => image.url ? <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-[8px] border-2 border-ink bg-paper"><img src={image.url} alt={image.fileName || ""} width={image.width || undefined} height={image.height || undefined} style={image.width > 0 && image.height > 0 ? { aspectRatio: `${image.width} / ${image.height}` } : undefined} className="max-h-72 w-full object-cover" /></a> : <button key={image.id} type="button" onClick={() => void allowRequestImages({ conversationId })} className="rounded-[8px] border-2 border-dashed border-ink bg-paper p-4 text-xs font-black"><ImagePlus className="mx-auto mb-2 size-5" />{image.fileName} · <span className="font-mono">{Math.ceil(image.byteSize / 1024)} KB</span><br />{label(locale, "Potvrdi otvaranje slike", "Confirm opening image")}</button>)}</div> : null}
          {linkUrl && !message.collapsed && !visibleMessage.deletedAt ? <div className="mt-2">
            {readyLinkPreview ? <a href={readyLinkPreview.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[12px] border-2 border-ink bg-paper transition hover:bg-paper-strong">{readyLinkPreview.imageUrl ? <img src={readyLinkPreview.imageUrl} alt="" className="max-h-40 w-full object-cover" /> : null}<span className="block p-3"><span className="flex items-center gap-2 type-eyebrow-sm text-blue-mid dark:text-muted"><Link2 className="size-3.5" />{readyLinkPreview.siteName || label(locale, "Pregled linka", "Link preview")}</span><span className="mt-1 block text-sm font-black">{readyLinkPreview.title || readyLinkPreview.url}</span>{readyLinkPreview.description ? <span className="mt-1 line-clamp-2 block type-caption font-semibold text-muted">{readyLinkPreview.description}</span> : null}<span className="mt-1 block truncate type-caption font-bold text-muted">{readyLinkPreview.url}</span></span></a> : <button type="button" disabled={linkPreviewLoading} onClick={() => { setLinkPreviewLoading(true); setLinkPreviewError(false); void requestLinkPreview({ messageId: message.id, url: linkUrl }).then((result) => { setLinkPreview(result); setLinkPreviewError(result.status !== "ready"); }).catch(() => setLinkPreviewError(true)).finally(() => setLinkPreviewLoading(false)); }} className="inline-flex items-center gap-2 rounded-full border border-ink bg-paper px-3 py-1.5 type-caption font-black disabled:opacity-60">{linkPreviewLoading ? <Spinner size="xs" /> : <Link2 className="size-3.5" />}{linkPreviewError || persistedLinkPreview?.status === "failed" ? label(locale, "Pokušaj pregled ponovo", "Retry preview") : label(locale, "Učitaj bezbedan pregled linka", "Load safe link preview")}</button>}
          </div> : null}
          <div className="mt-2 flex items-center justify-end gap-1 type-caption font-black text-muted">
            {visibleMessage.editedAt ? <span>{label(locale, "izmenjeno", "edited")}</span> : null}
            <span className="font-mono">{timeFormatter.format(new Date(message.createdAt))}</span>
            {pending ? <span className="inline-flex items-center gap-1 text-blue-mid dark:text-muted"><Spinner size="xs" /><span className="sr-only">{label(locale, "Šalje se", "Sending")}</span></span> : mine ? <span ref={readStatusRef} data-chat-motion="read-status" className="inline-flex items-center gap-1 text-blue-mid dark:text-muted" title={seenTitle || undefined}>{seenCount ? <><CheckCheck className="size-3.5" /><span>{conversationKind === "group" ? label(locale, `Videlo ${seenCount}`, `Seen by ${seenCount}`) : label(locale, "Viđeno", "Seen")}</span></> : <Check className="size-3.5" />}</span> : null}
          </div>
          {!visibleMessage.deletedAt && !message.collapsed && !pending ? <button type="button" onClick={() => setMenuOpen((value) => !value)} className={cn("absolute -top-3 grid size-7 place-items-center rounded-full border border-ink bg-paper-strong opacity-0 transition group-hover:opacity-100 focus:opacity-100", mine ? "-left-4" : "-right-4")} aria-label={label(locale, "Opcije poruke", "Message options")}><MoreHorizontal className="size-4" /></button> : null}
          {menuOpen ? <div className={cn("absolute top-7 z-20 flex min-w-max gap-1 rounded-full border-2 border-ink bg-paper-strong p-1 shadow-lg", mine ? "right-full mr-2" : "left-full ml-2")}>
            <button type="button" onClick={() => { onReply(message); setMenuOpen(false); }} className="grid size-8 place-items-center rounded-full hover:bg-paper" aria-label={label(locale, "Odgovori", "Reply")}><Reply className="size-4" /></button>
            <button type="button" onClick={() => void toggleReaction({ messageId: message.id, emoji: "👍" })} className="grid size-8 place-items-center rounded-full hover:bg-paper" aria-label={label(locale, "Reaguj", "React")}>👍</button>
            {!mine ? <button type="button" onClick={() => { onReport(message.id); setMenuOpen(false); }} className="grid size-8 place-items-center rounded-full text-red-700 hover:bg-red-50" aria-label={label(locale, "Prijavi poruku", "Report message")}><Flag className="size-4" /></button> : null}
            {mine && withinEditWindow ? <button type="button" onClick={() => { setEditing(true); setMenuOpen(false); }} className="rounded-full px-2 type-caption font-black hover:bg-paper">{label(locale, "Izmeni", "Edit")}</button> : null}
            {mine && withinEditWindow ? <button type="button" onClick={() => void deleteMessage({ messageId: message.id })} className="rounded-full px-2 type-caption font-black text-red-700 hover:bg-red-50">{label(locale, "Obriši", "Delete")}</button> : null}
          </div> : null}
        </div>
        {visibleMessage.reactions?.length ? <div className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}>{visibleMessage.reactions.map((reaction) => <button key={reaction.emoji} type="button" data-chat-motion="reaction" onClick={(event) => { requestChatMotion(event.currentTarget, { kind: "reaction" }); void toggleReaction({ messageId: message.id, emoji: reaction.emoji }); }} className="rounded-full border border-line bg-paper-strong px-2 py-0.5 type-caption font-black">{reaction.emoji} <span className="font-mono">{reaction.count}</span></button>)}</div> : null}
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
  const markRead = useMutation(api.chat.markRead);
  const messageActions = useMessageActions();
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { hour: "2-digit", minute: "2-digit" }), [locale]);
  const searchTimeFormatter = useMemo(() => new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), [locale]);
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
  const [sendFailure, setSendFailure] = useState<{ payload: PendingSend; message: string }>();
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
  const [atBottom, setAtBottom] = useState(true);
  const [unreadBoundary, setUnreadBoundary] = useState<{ conversationId: string; sequence: number } | null>(null);
  // A Set in state, not a ref: it must be readable during render to decide
  // animateIn, and mutating it must not trigger one.
  const [paintedSequences] = useState(() => new Set<number>());
  const [targetTooFarBack, setTargetTooFarBack] = useState(false);
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
  const listRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const latestSequenceRef = useRef(0);
  const restoreFromBottomRef = useRef<number | null>(null);
  const loadMoreRef = useRef(messages.loadMore);
  const targetLoadMoreCountRef = useRef(0);
  const messagesStatus = messages.status;
  const loadedMessageCount = messages.results.length;

  // The optimistic row is dropped by Convex once the server row lands, so the
  // clientNonce dedupe in api.chat.sendMessage is the only reconciliation needed.
  const sendMessage = useMutation(api.chat.sendMessage).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.chat.getConversation, { conversationId: args.conversationId });
    if (!current) return;
    const viewerId = current.viewer.userId;
    const firstPage = localStore
      .getAllQueries(api.chat.listMessagesPage)
      .find((entry) => entry.args.conversationId === args.conversationId && entry.args.paginationOpts.cursor === null)
      ?.value;
    const member = current.members.find((item) => item.userId === viewerId);
    // Prefer a real prior message from this viewer; the member row is the
    // fallback for the first message in a conversation. `role` there is the
    // membership role, not the user role, so it is defaulted — nothing in the
    // bubble renders sender.role.
    const sender = firstPage?.page
      .map((message) => message.sender)
      .find((value) => value && "userId" in value && value.userId === viewerId)
      ?? (member?.userId
        ? { userId: member.userId, name: member.name ?? "Član", username: member.username, avatarUrl: member.avatarUrl, role: "student" as const }
        : null);
    insertAtTop({
      paginatedQuery: api.chat.listMessagesPage,
      argsToMatch: { conversationId: args.conversationId },
      localQueryStore: localStore,
      item: buildOptimisticMessage({
        clientNonce: args.clientNonce,
        // Read the head of the loaded page rather than lastMessageSequence so
        // back-to-back sends stay ordered while earlier ones are still pending.
        sequence: (firstPage?.page[0]?.sequence ?? current.conversation.lastMessageSequence) + 1,
        body: args.body,
        sender,
        replyTo,
        mentionUserIds: args.mentionUserIds,
        images: preparedImages.filter((image) => args.imageIds.includes(image.imageId)),
      }),
    });
  });

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
  const viewerId = conversation ? String(conversation.viewer.userId) : undefined;
  const viewerActive = conversation?.viewer.status === "active";

  // Latched on the first render where the conversation resolves, so the divider
  // stays put while you read past it instead of chasing lastReadSequence.
  if (conversation && unreadBoundary?.conversationId !== String(conversationId)) {
    setUnreadBoundary({ conversationId: String(conversationId), sequence: conversation.viewer.lastReadSequence });
  }
  const unreadSequence = unreadBoundary?.conversationId === String(conversationId) ? unreadBoundary.sequence : null;

  const threadRows = useMemo(() => {
    const rows: Array<
      | { kind: "day"; key: string; text: string }
      | { kind: "unread"; key: string }
      | { kind: "message"; key: string; message: ChatMessage; grouped: boolean }
    > = [];
    let previous: ChatMessage | undefined;
    let unreadPlaced = false;
    for (const message of orderedMessages) {
      const startsDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
      if (startsDay) rows.push({ kind: "day", key: `day-${dayKey(message.createdAt)}`, text: dayLabel(locale, message.createdAt) });
      const ownMessage = Boolean(message.sender && "userId" in message.sender && String(message.sender.userId) === viewerId);
      const startsUnread = !unreadPlaced
        && !!unreadSequence
        && message.sequence > unreadSequence
        && !ownMessage
        && rows.some((row) => row.kind === "message");
      if (startsUnread) {
        rows.push({ kind: "unread", key: "unread-divider" });
        unreadPlaced = true;
      }
      rows.push({
        kind: "message",
        key: String(message.id),
        message,
        grouped: Boolean(previous && !startsDay && !startsUnread && canGroupMessages(previous, message)),
      });
      previous = message;
    }
    return rows;
  }, [locale, orderedMessages, unreadSequence, viewerId]);

  // A pending bubble is keyed by its synthetic id and the server row by the real
  // one, so the swap remounts the article. Recording what has already been
  // painted keeps the entry animation from replaying on that remount.
  useEffect(() => {
    paintedSequences.clear();
  }, [conversationId, paintedSequences]);

  useEffect(() => {
    for (const message of orderedMessages) paintedSequences.add(message.sequence);
  }, [orderedMessages, paintedSequences]);

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
    latestSequenceRef.current = latestSequence;
  }, [latestSequence]);

  // A background tab must not tell the sender their message was seen, so every
  // markRead goes through this gate rather than firing on mount or on arrival.
  const markReadIfVisible = useCallback(() => {
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    const sequence = latestSequenceRef.current;
    if (!sequence || !viewerActive) return;
    void markRead({ conversationId, sequence }).catch(() => undefined);
  }, [conversationId, markRead, viewerActive]);

  // Mount no longer zeroes the badge: the bottom of the thread has to actually
  // reach the screen first.
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    const viewport = viewportRef.current;
    if (!sentinel || !viewport) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((entry) => entry.isIntersecting)) markReadIfVisible(); },
      { root: viewport },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [markReadIfVisible]);

  useEffect(() => {
    const onWake = () => { if (nearBottomRef.current) markReadIfVisible(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [markReadIfVisible]);

  useEffect(() => {
    if (!latestSequence || conversation?.viewer.status !== "active") return;
    const previous = previousLatestSequenceRef.current;
    previousLatestSequenceRef.current = latestSequence;
    if (!previous || latestSequence <= previous) return;
    if (nearBottomRef.current) {
      const frame = window.requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      });
      setNewMessageCount(0);
      markReadIfVisible();
      return () => window.cancelAnimationFrame(frame);
    }
    setNewMessageCount((count) => count + Math.max(1, latestSequence - previous));
  }, [conversation?.viewer.status, latestSequence, markReadIfVisible]);

  // Prepend restore runs off the message count, not the ResizeObserver: the
  // click itself resizes the list (the button unmounts) and would otherwise
  // consume the pending restore before the older page has arrived.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const pending = restoreFromBottomRef.current;
    if (!viewport || pending === null) return;
    restoreFromBottomRef.current = null;
    viewport.scrollTop = viewport.scrollHeight - pending;
    const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 120;
    nearBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
  }, [loadedMessageCount]);

  // Re-pin while the reader is at the bottom as content resizes underneath
  // them: images decoding after the initial pin, link previews, replies.
  useEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;
    const observer = new ResizeObserver(() => {
      if (restoreFromBottomRef.current !== null) return;
      if (nearBottomRef.current) viewport.scrollTop = viewport.scrollHeight;
      // Content can grow below the reader without any scroll event, so the
      // jump-to-latest affordance has to be recomputed here too.
      const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 120;
      nearBottomRef.current = nearBottom;
      setAtBottom(nearBottom);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    const onResize = () => {
      const viewport = viewportRef.current;
      if (viewport && nearBottomRef.current) viewport.scrollTop = viewport.scrollHeight;
    };
    visualViewport.addEventListener("resize", onResize);
    return () => visualViewport.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    loadMoreRef.current = messages.loadMore;
  }, [messages.loadMore]);

  function jumpToMessage(messageId: Id<"chatMessages">) {
    targetLoadMoreCountRef.current = 0;
    setTargetTooFarBack(false);
    setTargetMessageId(messageId);
  }

  // `messages` gets a fresh identity every render, so depending on it here used
  // to re-run this effect continuously and walk the whole history one page at a
  // time. Depend on the primitives and cap the walk instead; the real fix is a
  // backend listMessagesAround({ messageId, before, after }).
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
    if (messagesStatus === "CanLoadMore" && targetLoadMoreCountRef.current < MAX_TARGET_LOAD_MORE) {
      targetLoadMoreCountRef.current += 1;
      loadMoreRef.current(compact ? 20 : 40);
      return;
    }
    if (messagesStatus === "CanLoadMore" || messagesStatus === "Exhausted") {
      const frame = window.requestAnimationFrame(() => {
        setTargetTooFarBack(true);
        setTargetMessageId(undefined);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [compact, loadedMessageCount, messagesStatus, targetMessageId]);

  function handleViewportScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 120;
    nearBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom && newMessageCount) {
      setNewMessageCount(0);
      markReadIfVisible();
    }
  }

  function jumpToLatest() {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: preferredScrollBehavior() });
    nearBottomRef.current = true;
    setAtBottom(true);
    setNewMessageCount(0);
    markReadIfVisible();
  }

  // Recorded before the prepend so the ResizeObserver can put the reading
  // position back; Safari has never shipped scroll anchoring, and we disable
  // Chrome's so both browsers land in the same place.
  function loadOlderMessages() {
    const viewport = viewportRef.current;
    if (viewport) restoreFromBottomRef.current = viewport.scrollHeight - viewport.scrollTop;
    messages.loadMore(compact ? 20 : 40);
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

  async function attemptSend(payload: PendingSend) {
    if (sending) return;
    setSending(true);
    try {
      await sendMessage(payload);
      setSendFailure(undefined);
      setBody((current) => current.trim() === (payload.body ?? "") ? "" : current);
      setReplyTo((current) => current?.id === payload.replyToMessageId ? null : current);
      const sentImageIds = new Set(payload.imageIds);
      setPreparedImages((current) => current.filter((image) => !sentImageIds.has(image.imageId)));
    } catch (error) {
      setSendFailure({ payload, message: sendError(locale, error) });
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
    // The pending bubble is the feedback now, so the body is not restored on
    // failure; the retry button re-sends the same payload under the same nonce.
    setBody("");
    setSendFailure(undefined);
    await attemptSend(payload);
  }

  if (conversation === undefined) return <div className="grid h-full min-h-72 place-items-center"><Spinner size="xl" /></div>;
  if (conversation === null) return <div className="grid h-full min-h-72 place-items-center p-6 text-center font-black">{label(locale, "Razgovor nije dostupan.", "Conversation is unavailable.")}</div>;

  const pendingDirect = conversation.viewer.requestStatus === "pending";
  const invited = conversation.viewer.status === "invited";
  const viewerSentPendingDirect = pendingDirect && conversation.directRequest?.senderId === conversation.viewer.userId;
  const counterpart = conversation.members.find((member) => member.userId && member.userId !== conversation.viewer.userId);
  const chatPreference = conversationPreferences?.find((preference) => preference.category === "chat");
  // A disabled composer with a reason beats an absent one: the field stays where
  // the eye expects it and the reason explains itself.
  const composerDisabledReason = invited
    ? label(locale, "Prihvati poziv da bi pisao u ovoj grupi.", "Accept the invite to write in this group.")
    : conversation.viewer.status !== "active"
      ? label(locale, "Više nisi član ovog razgovora.", "You are no longer a member of this conversation.")
      : pendingDirect && !viewerSentPendingDirect
        ? label(locale, "Prihvati zahtev da bi odgovorio.", "Accept the request to reply.")
        : undefined;

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
      setRequestError(label(locale, "Odgovor nije sačuvan. Proveri internet i pokušaj ponovo.", "Your response was not saved. Check your connection and try again."));
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
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden bg-paper-strong", !compact && "rounded-[16px] border-2 border-ink shadow-[5px_5px_0_0_var(--shadow-hard-12)]")}
      onDragEnter={compact ? (event) => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); setDraggingImages(true); } } : undefined}
      onDragOver={compact ? (event) => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } } : undefined}
      onDragLeave={compact ? (event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingImages(false); } : undefined}
      onDrop={compact ? (event) => { if (!Array.from(event.dataTransfer.types).includes("Files")) return; event.preventDefault(); setDraggingImages(false); void processImageFiles(event.dataTransfer.files); } : undefined}
    >
      {draggingImages ? <div data-chat-motion="drag-overlay" data-chat-motion-new="true" className={cn("pointer-events-none z-50 grid place-items-center bg-scrim/55 p-6 backdrop-blur-[2px]", compact ? "absolute inset-0" : "fixed inset-0")}><div className="w-[min(92vw,32rem)] rounded-[16px] border-[3px] border-ink bg-yellow p-6 text-center shadow-[8px_8px_0_0_var(--paper-strong)]"><UploadCloud className="mx-auto size-10" /><p className="mt-3 type-h2">{label(locale, "Pusti slike bilo gde u razgovoru", "Drop images anywhere in the conversation")}</p><p className="mt-2 text-xs font-bold">{label(locale, "Do četiri slike, ukupno 25 MB. Sve slike prolaze decode i ponovni encode.", "Up to four images, 25 MB total. Every image is decoded and re-encoded.")}</p></div></div> : null}
      <header className="flex min-h-16 items-center gap-3 border-b-2 border-ink bg-paper-strong px-4">
        {onBack ? <button type="button" onClick={onBack} className="grid size-10 place-items-center rounded-full border-2 border-ink lg:hidden" aria-label={label(locale, "Nazad", "Back")}><ArrowLeft className="size-5" /></button> : null}
        <Avatar src={conversation.conversation.imageUrl} name={title} />
        <div className="min-w-0 flex-1"><h2 className="truncate type-h4 text-ink">{title}</h2><p className="truncate type-caption font-bold text-muted">{typing?.length ? <span data-chat-motion="typing" data-chat-motion-new="true">{`${typing.map((item) => item.name).filter(Boolean).join(", ")} ${label(locale, "kuca…", "typing…")}`}</span> : conversation.conversation.kind === "group" ? (() => { const memberCount = conversation.members.filter((item) => item.status === "active").length; return `${memberCount} ${label(locale, memberCount === 1 ? "član" : "članova", memberCount === 1 ? "member" : "members")}`; })() : label(locale, "Razgovor uživo", "Live conversation")}</p></div>
        {onMinimize ? <button type="button" onClick={onMinimize} className="grid size-9 place-items-center rounded-full border-2 border-ink bg-paper-strong" aria-label={label(locale, "Minimizuj", "Minimize")}><Minus className="size-4" /></button> : null}
        {onClose ? <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full border-2 border-ink bg-paper-strong" aria-label={label(locale, "Ukloni iz dock-a", "Remove from dock")}><X className="size-4" /></button> : null}
        {!compact ? <button type="button" onClick={() => setMessageSearchOpen((value) => !value)} aria-expanded={messageSearchOpen} className={cn("grid size-10 place-items-center rounded-full border-2 border-ink", messageSearchOpen ? "bg-ink text-paper-strong" : "bg-paper-strong")} aria-label={label(locale, "Pretraži ovaj razgovor", "Search this conversation")}><Search className="size-4" /></button> : null}
        <div ref={settingsPopoverRef} className="relative">
          <button ref={settingsTriggerRef} type="button" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen} aria-haspopup="dialog" className="grid size-10 place-items-center rounded-full border-2 border-ink" aria-label={label(locale, "Podešavanja razgovora", "Conversation settings")}><ChevronDown className={cn("size-4 transition", settingsOpen && "rotate-180")} /></button>
          {settingsOpen ? <div role="dialog" aria-label={label(locale, "Podešavanja razgovora", "Conversation settings")} className="absolute right-0 top-12 z-30 w-60 rounded-[16px] border-2 border-ink bg-paper-strong p-2 shadow-xl">
            <button type="button" onClick={() => void updateMemberState({ conversationId, isPinned: true })} className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-xs font-black hover:bg-paper"><Pin className="size-4" />{label(locale, "Zakači", "Pin")}</button>
            <button type="button" onClick={() => void updateMemberState({ conversationId, isArchived: true })} className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-xs font-black hover:bg-paper"><Archive className="size-4" />{label(locale, "Arhiviraj", "Archive")}</button>
            <button type="button" onClick={() => { setSettingsOpen(false); setDetailsOpen(true); }} className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-xs font-black hover:bg-paper">{conversation.conversation.kind === "group" ? <Users className="size-4" /> : <ImagePlus className="size-4" />}{conversation.conversation.kind === "group" ? label(locale, "Detalji i članovi", "Details and members") : label(locale, "Mediji i detalji", "Media and details")}</button>
            {conversation.conversation.kind === "group" ? <button type="button" onClick={() => { setSettingsOpen(false); setReportTarget({ type: "group", conversationId }); }} className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-xs font-black text-red-700 hover:bg-red-50"><Flag className="size-4" />{label(locale, "Prijavi grupu", "Report group")}</button> : null}
            <div className="mt-1 border-t border-line pt-1"><p className="px-3 py-1 type-eyebrow-sm text-muted">{label(locale, "Utišaj", "Mute")}</p>{[[1, "1h"], [8, "8h"], [168, "7d"], [-1, label(locale, "Zauvek", "Forever")]].map(([hours, text]) => <button key={String(hours)} type="button" onClick={() => void updateMemberState({ conversationId, mutedUntil: hours === -1 ? -1 : Date.now() + Number(hours) * 60 * 60 * 1000 })} className="rounded-full px-3 py-1.5 font-mono type-caption font-black hover:bg-paper">{text}</button>)}</div>
            <div className="mt-1 border-t border-line pt-2"><p className="px-3 py-1 type-eyebrow-sm text-muted">{label(locale, "Obaveštenja ovog razgovora", "This conversation notifications")}</p><div className="flex flex-wrap gap-1 px-2">{(["inApp", "push", "sound"] as const).map((key) => { const active = chatPreference?.[key] ?? true; const text = key === "inApp" ? label(locale, "U aplikaciji", "In app") : key === "push" ? "Push" : label(locale, "Zvuk", "Sound"); return <button key={key} type="button" aria-pressed={active} onClick={() => toggleConversationPreference(key)} className={cn("rounded-full border border-ink px-2 py-1 type-caption font-black", active ? "bg-ink text-paper-strong" : "bg-paper-strong")}>{text}</button>; })}</div></div>
            <div className="mt-2 border-t border-red-200 pt-1">{conversation.conversation.kind !== "group" && counterpart?.userId ? <button type="button" onClick={() => setDestructiveAction("block")} className="flex min-h-9 w-full items-center gap-2 rounded-[12px] px-3 text-left text-xs font-black text-red-700 hover:bg-red-50"><X className="size-4" />{label(locale, "Blokiraj člana", "Block member")}</button> : null}<button type="button" onClick={() => setDestructiveAction("delete")} className="flex min-h-9 w-full items-center gap-2 rounded-[12px] px-3 text-left text-xs font-black text-red-700 hover:bg-red-50"><Archive className="size-4" />{label(locale, "Obriši za mene", "Delete for me")}</button>{destructiveAction ? <div className="m-1 rounded-[12px] border border-red-400 bg-red-50 p-2"><p className="type-caption font-black text-red-800">{destructiveAction === "block" ? label(locale, "Blokiranje arhivira direktan razgovor.", "Blocking archives the direct conversation.") : label(locale, "Istorija pre ove tačke biće sakrivena samo tebi.", "History up to this point will be hidden only for you.")}</p><div className="mt-2 flex gap-1"><button type="button" onClick={() => setDestructiveAction(undefined)} className="flex-1 rounded-full border border-ink bg-paper-strong px-2 py-1 type-caption font-black">{label(locale, "Otkaži", "Cancel")}</button><button type="button" onClick={() => void runDestructiveAction()} disabled={destructiveBusy} className="flex-1 rounded-full border border-red-700 bg-red-600 px-2 py-1 type-caption font-black text-white disabled:opacity-50">{label(locale, "Potvrdi", "Confirm")}</button></div></div> : null}</div>
          </div> : null}
        </div>
      </header>

      {messageSearchOpen && !compact ? <div data-chat-motion-surface="panel" className="border-b-2 border-ink bg-blue-mid/25 p-4 dark:bg-ink/15">
        <div className="mx-auto max-w-3xl">
          <label className="flex h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4"><Search className="size-4 text-muted" /><span className="sr-only">{label(locale, "Pretraži sadržaj razgovora", "Search conversation content")}</span><input autoFocus value={messageSearchQuery} onChange={(event) => setMessageSearchQuery(event.target.value)} placeholder={label(locale, "Reč ili fraza u porukama", "Word or phrase in messages")} className="min-w-0 flex-1 bg-transparent text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" /><button type="button" onClick={() => { setMessageSearchOpen(false); setMessageSearchQuery(""); }} className="grid size-8 place-items-center rounded-full border border-line" aria-label={label(locale, "Zatvori pretragu", "Close search")}><X className="size-4" /></button></label>
          {messageSearchQuery.trim().length >= 2 ? <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-[16px] border-2 border-line bg-paper-strong p-2" aria-live="polite">
            {messageSearch.results.map((result) => <button key={result.messageId} type="button" onClick={() => jumpToMessage(result.messageId)} className="flex w-full items-start gap-3 rounded-[12px] px-3 py-2 text-left hover:bg-paper"><span className="min-w-0 flex-1"><span className="block type-caption font-black text-blue-mid dark:text-muted">{result.senderName}</span><span className="mt-0.5 line-clamp-2 block text-xs font-bold text-ink">{result.body}</span></span><span className="shrink-0 font-mono type-caption font-bold text-muted">{searchTimeFormatter.format(new Date(result.createdAt))}</span></button>)}
            {!messageSearch.results.length && messageSearch.status !== "LoadingFirstPage" ? <p className="p-6 text-center text-xs font-black text-muted">{label(locale, "Nema pronađenih poruka.", "No messages found.")}</p> : null}
            {messageSearch.status === "LoadingFirstPage" ? <div className="grid min-h-20 place-items-center"><Spinner size="md" /></div> : null}
            {messageSearch.status === "CanLoadMore" ? <button type="button" onClick={() => messageSearch.loadMore(20)} className="w-full rounded-full border border-ink bg-paper-strong px-3 py-2 type-caption font-black">{label(locale, "Učitaj još rezultata", "Load more results")}</button> : null}
          </div> : <p className="mt-2 px-2 type-caption font-bold text-muted">{label(locale, "Unesi najmanje dva znaka.", "Enter at least two characters.")}</p>}
        </div>
      </div> : null}

      {(pendingDirect || invited) ? <div data-chat-motion="request" data-chat-motion-new="true" className="border-b-2 border-ink bg-yellow/25 p-4 text-center">
        <p className="text-xs font-black">{invited ? label(locale, "Poziv u ovu grupu čeka tvoj odgovor.", "A group invite is waiting for your response.") : viewerSentPendingDirect ? label(locale, "Zahtev je poslat. Čekaš da član prihvati razgovor.", "Request sent. Waiting for the member to accept the conversation.") : label(locale, "Prihvati zahtev da biste slobodno razmenjivali poruke.", "Accept the request to continue messaging freely.")}</p>
        {requestError ? <p role="alert" className="mt-2 type-caption font-black text-red-800">{requestError}</p> : null}
        {!viewerSentPendingDirect ? <div className="mt-2 flex justify-center gap-2"><button type="button" disabled={Boolean(requestBusy)} onClick={(event) => { requestChatMotion(event.currentTarget, { kind: "reaction" }); void answerPendingRequest(true); }} className="inline-flex min-w-24 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-4 py-2 text-xs font-black text-paper-strong disabled:opacity-50">{requestBusy === "accept" ? <Spinner size="xs" /> : null}{label(locale, "Prihvati", "Accept")}</button><button type="button" disabled={Boolean(requestBusy)} onClick={(event) => { requestChatMotion(event.currentTarget, { kind: "reaction" }); void answerPendingRequest(false); }} className="inline-flex min-w-24 items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper-strong px-4 py-2 text-xs font-black disabled:opacity-50">{requestBusy === "decline" ? <Spinner size="xs" /> : null}{label(locale, "Odbij", "Decline")}</button></div> : null}
      </div> : null}

      <div ref={viewportRef} onScroll={handleViewportScroll} role="log" aria-live="polite" aria-relevant="additions text" aria-label={label(locale, "Poruke u razgovoru", "Conversation messages")} data-chat-motion-surface="thread" className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none] bg-paper p-4">
        <div ref={listRef}>
          {messages.status === "CanLoadMore" ? <button type="button" onClick={loadOlderMessages} className="mx-auto block rounded-full border-2 border-ink bg-paper-strong px-4 py-2 text-xs font-black">{label(locale, "Starije poruke", "Older messages")}</button> : null}
          {targetTooFarBack ? <p role="status" className="mx-auto mt-3 max-w-md rounded-[12px] border-2 border-ink bg-yellow/40 px-4 py-2 text-center type-caption font-black">{label(locale, "Poruka je predaleko — otvori punu istoriju.", "Message is too far back — open the full history.")}</p> : null}
          {threadRows.map((row) => row.kind === "day"
            ? <p key={row.key} className="mx-auto mt-3 w-fit rounded-full border border-line bg-paper-strong px-4 py-2 text-center type-caption font-black text-muted">{row.text}</p>
            : row.kind === "unread"
              ? <p key={row.key} className="sticky top-0 z-10 mx-auto mt-3 w-fit rounded-full border-2 border-ink bg-yellow px-4 py-1.5 text-center type-caption font-black shadow-[2px_2px_0_0_var(--shadow-hard)]">{label(locale, "Nove poruke", "New messages")}</p>
              : <MessageBubble key={row.key} locale={locale} conversationId={conversationId} conversationKind={conversation.conversation.kind} message={row.message} viewerId={String(conversation.viewer.userId)} grouped={row.grouped} actions={messageActions} timeFormatter={timeFormatter} onReply={setReplyTo} onReport={(messageId) => setReportTarget({ type: "message", messageId })} animateIn={animationCutoffSequence !== null && row.message.sequence > animationCutoffSequence && !paintedSequences.has(row.message.sequence)} highlighted={highlightedMessageId === row.message.id} />)}
          {!orderedMessages.length && messages.status !== "LoadingFirstPage" ? <div className="grid min-h-48 place-items-center text-center"><div><MessageCircle className="mx-auto size-9 text-muted" /><p className="mt-3 type-h4 text-ink">{label(locale, "Pošalji prvu poruku.", "Send the first message.")}</p></div></div> : null}
          <div ref={bottomSentinelRef} aria-hidden className="h-px w-full" />
        </div>
        {!atBottom ? <button type="button" onClick={jumpToLatest} className="sticky bottom-2 mx-auto flex min-h-10 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black shadow-[3px_3px_0_0_var(--shadow-hard)]"><ChevronDown className="size-4" /><span className="font-mono">{newMessageCount > 0 ? newMessagesLabel(locale, newMessageCount) : label(locale, "Skoči na najnovije", "Jump to latest")}</span></button> : null}
      </div>

      <ChatComposer
        locale={locale}
        body={body}
        preparedImages={preparedImages}
        imageError={imageError}
        sendFailure={sendFailure?.message}
        disabledReason={composerDisabledReason}
        replyTo={replyTo}
        sending={sending}
        uploadingImages={uploadingImages}
        onBodyChange={setBody}
        onTyping={() => { const now = Date.now(); if (now - typingAtRef.current > 2500) { typingAtRef.current = now; void setTyping({ conversationId }).catch(() => undefined); } }}
        onSubmit={() => void submit()}
        onFiles={(files) => void processImageFiles(files)}
        onRemoveImage={(imageId) => setPreparedImages((items) => items.filter((item) => item.imageId !== imageId))}
        onRetry={() => { if (sendFailure) void attemptSend(sendFailure.payload); }}
        onDismissFailure={() => setSendFailure(undefined)}
        onCancelReply={() => setReplyTo(null)}
      />
      {reportTarget ? <ReportDialog locale={locale} target={reportTarget} onClose={() => setReportTarget(undefined)} /> : null}
      {detailsOpen ? <ConversationDetailsDialog locale={locale} conversation={conversation} onClose={() => setDetailsOpen(false)} onExit={exitConversation} /> : null}
    </section>
  );
}
