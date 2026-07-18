/* eslint-disable @next/next/no-img-element -- Convex storage URLs are signed and dynamic. */
"use client";

import type { FunctionReturnType } from "convex/server";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";

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

export function label(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

export function creationError(locale: Locale, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("DM_PRIVACY")) return label(locale, "Ovaj član trenutno ne prima nove poruke.", "This member is not accepting new messages right now.");
  if (message.includes("CHAT_BLOCKED")) return label(locale, "Razgovor nije dostupan zbog blokiranja.", "This conversation is unavailable because of a block.");
  if (message.includes("RATE_LIMIT")) return label(locale, "Previše poziva odjednom. Pokušaj ponovo kasnije.", "Too many invites at once. Try again later.");
  return label(locale, "Razgovor nije mogao da se kreira. Pokušaj ponovo.", "The conversation could not be created. Try again.");
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
