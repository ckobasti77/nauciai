/* eslint-disable @next/next/no-img-element -- Convex storage URLs are signed and dynamic. */
"use client";

import type { FunctionReturnType } from "convex/server";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { t, type Locale } from "@/lib/i18n";

export { t as label } from "@/lib/i18n";

export type InboxSection = "all" | "unread" | "requests" | "groups" | "archive";
export type InboxItem = NonNullable<FunctionReturnType<typeof api.chat.listInboxPage>["page"][number]>;
export type ChatMessage = FunctionReturnType<typeof api.chat.listMessagesPage>["page"][number];
export type ConversationData = FunctionReturnType<typeof api.chat.getConversation>;
export type ConversationParticipant = ConversationData["members"][number];
export type ConversationMember = NonNullable<FunctionReturnType<typeof api.chat.listConversationMembersPage>["page"][number]>;
export type CommunityMember = NonNullable<FunctionReturnType<typeof api.community.listMembersPage>["page"][number]>;
export type NotificationPreference = FunctionReturnType<typeof api.chat.getNotificationPreferences>[number];
export type LinkPreviewResult = FunctionReturnType<typeof api.chatLinkPreview.requestLinkPreview>;

export type MessageLinkPreview = {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  status: "pending" | "ready" | "failed";
};

export type ReportTarget =
  | { type: "message"; messageId: Id<"chatMessages"> }
  | { type: "group"; conversationId: Id<"chatConversations"> };

export type PendingSend = {
  conversationId: Id<"chatConversations">;
  body?: string;
  imageIds: Array<Id<"chatImages">>;
  replyToMessageId?: Id<"chatMessages">;
  mentionUserIds: Array<Id<"users">>;
  clientNonce: string;
};

export type PreparedChatImage = {
  imageId: Id<"chatImages">;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
};

export const sections: Array<{ value: InboxSection; sr: string; en: string }> = [
  { value: "all", sr: "Sve", en: "All" },
  { value: "unread", sr: "Nepročitano", en: "Unread" },
  { value: "requests", sr: "Zahtevi", en: "Requests" },
  { value: "groups", sr: "Grupe", en: "Groups" },
  { value: "archive", sr: "Arhiva", en: "Archive" },
];

export function creationError(locale: Locale, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("DM_PRIVACY")) return t(locale, "Ovaj član trenutno ne prima nove poruke.", "This member is not accepting new messages right now.");
  if (message.includes("CHAT_BLOCKED")) return t(locale, "Razgovor nije dostupan zbog blokiranja.", "This conversation is unavailable because of a block.");
  if (message.includes("RATE_LIMIT")) return t(locale, "Poslao/la si previše poziva u kratkom roku. Sačekaj par minuta pa pokušaj ponovo.", "You have sent too many invites in a short time. Wait a few minutes and try again.");
  return t(locale, "Razgovor nije otvoren. Proveri internet i pokušaj ponovo.", "The conversation did not open. Check your connection and try again.");
}

// Codes thrown by api.chat.sendMessage. Kept separate from creationError, whose
// fallback copy is about creating a conversation and whose RATE_LIMIT branch is
// only reachable from the invite path.
export function sendError(locale: Locale, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("CHAT_SUSPENDED")) return t(locale, "Slanje poruka ti je privremeno zaustavljeno. Ako misliš da je ovo greška, javi se podršci preko Pomoći.", "Sending messages is paused for your account. If you think this is a mistake, contact support through Help.");
  if (message.includes("CHAT_BLOCKED")) return t(locale, "Razgovor nije dostupan zbog blokiranja.", "This conversation is unavailable because of a block.");
  if (message.includes("REQUEST_DECLINED")) return t(locale, "Zahtev za razgovor je odbijen.", "The conversation request was declined.");
  if (message.includes("REQUEST_MESSAGE_LIMIT")) return t(locale, "Sačekaj da član prihvati razgovor pre nego što pošalješ još poruka.", "Wait for the member to accept before sending more messages.");
  if (message.includes("REQUEST_NOT_ACCEPTED")) return t(locale, "Zahtev za razgovor još nije prihvaćen.", "The conversation request has not been accepted yet.");
  if (message.includes("IMAGES_TOO_LARGE")) return t(locale, "Slike u jednoj poruci mogu imati ukupno najviše 25 MB.", "Images in one message may total at most 25 MB.");
  if (message.includes("TOO_MANY_IMAGES")) return t(locale, "Jedna poruka može imati najviše četiri slike.", "A message can contain up to four images.");
  if (message.includes("INVALID_PREPARED_IMAGE")) return t(locale, "Slika više nije spremna za slanje. Dodaj je ponovo.", "The image is no longer ready to send. Add it again.");
  return t(locale, "Poruka nije poslata. Tekst ti je ostao u polju - proveri internet i pošalji ponovo.", "The message was not sent. Your text is still in the box - check your connection and send it again.");
}

const OPTIMISTIC_PREFIX = "optimistic:";

// The synthetic id doubles as the pending marker so the server-derived
// ChatMessage type does not have to be widened with a `pending` field.
export function optimisticMessageId(clientNonce: string) {
  return `${OPTIMISTIC_PREFIX}${clientNonce}` as Id<"chatMessages">;
}

export function isOptimisticMessage(message: ChatMessage) {
  return String(message.id).startsWith(OPTIMISTIC_PREFIX);
}

export function buildOptimisticMessage({
  clientNonce,
  sequence,
  body,
  sender,
  replyTo,
  mentionUserIds,
  images,
}: {
  clientNonce: string;
  sequence: number;
  body?: string;
  sender: ChatMessage["sender"];
  replyTo: ChatMessage | null;
  mentionUserIds: Array<Id<"users">>;
  images: PreparedChatImage[];
}): ChatMessage {
  return {
    id: optimisticMessageId(clientNonce),
    sequence,
    sender,
    kind: "user",
    body,
    replyTo: replyTo
      ? { id: replyTo.id, senderName: replyTo.sender?.name, body: replyTo.body, collapsed: false }
      : null,
    mentions: mentionUserIds,
    imageCount: images.length,
    images: images.map((image) => ({
      id: image.imageId,
      fileName: image.fileName,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
      url: null,
    })),
    reactions: [],
    editedAt: undefined,
    deletedAt: undefined,
    createdAt: Date.now(),
    seenCount: 0,
    seenBy: [],
    seenByTruncated: false,
    linkPreview: null,
    collapsed: false,
  };
}

export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function newMessagesLabel(locale: Locale, count: number) {
  if (locale === "en") return count === 1 ? "New message" : `${count} new messages`;
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return count === 1 ? "Nova poruka" : `${count} nova poruka`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} nove poruke`;
  return `${count} novih poruka`;
}

export function dayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dayLabel(locale: Locale, timestamp: number) {
  const now = new Date();
  if (dayKey(now.getTime()) === dayKey(timestamp)) return t(locale, "Danas", "Today");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(yesterday.getTime()) === dayKey(timestamp)) return t(locale, "Juče", "Yesterday");
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

const GROUPING_WINDOW_MS = 5 * 60 * 1000;

export function canGroupMessages(previous: ChatMessage, current: ChatMessage) {
  if (previous.kind !== "user" || current.kind !== "user") return false;
  const previousSender = previous.sender;
  const currentSender = current.sender;
  if (!previousSender || !currentSender || !("userId" in previousSender) || !("userId" in currentSender)) return false;
  if (previousSender.userId !== currentSender.userId) return false;
  return current.createdAt - previous.createdAt <= GROUPING_WINDOW_MS;
}

export function relativeTime(locale: Locale, timestamp?: number) {
  if (!timestamp) return "";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  const formatter = new Intl.RelativeTimeFormat(locale === "sr" ? "sr-Latn" : "en", { numeric: "auto" });
  if (seconds < 60) return formatter.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  return formatter.format(-Math.round(hours / 24), "day");
}

export function firstHttpUrl(body?: string) {
  return body?.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.!?]+$/, "");
}

export function Avatar({ src, name, size = "md" }: { src?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const className = size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10";
  const initials = name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "AI";
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-ink bg-yellow text-xs font-black", className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}
