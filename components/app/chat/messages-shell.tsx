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
  Inbox,
  Link2,
  Loader2,
  MessageCircle,
  Minus,
  MoreHorizontal,
  Paperclip,
  Pin,
  Reply,
  Search,
  Send,
  Settings2,
  UserPlus,
  Users,
  UploadCloud,
  X,
} from "lucide-react";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { PushNotificationButton } from "@/components/app/chat/push-notifications";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

export type InboxSection = "all" | "unread" | "requests" | "groups" | "archive";

type InboxItem = NonNullable<FunctionReturnType<typeof api.chat.listInboxPage>["page"][number]>;
type SearchHit = FunctionReturnType<typeof api.chat.searchMessages>[number];
type ChatMessage = FunctionReturnType<typeof api.chat.listMessagesPage>["page"][number];
type ConversationData = FunctionReturnType<typeof api.chat.getConversation>;
type ConversationParticipant = ConversationData["members"][number];
type ConversationMember = NonNullable<FunctionReturnType<typeof api.chat.listConversationMembersPage>["page"][number]>;
type CommunityMember = NonNullable<FunctionReturnType<typeof api.community.listMembersPage>["page"][number]>;
type NotificationPreference = FunctionReturnType<typeof api.chat.getNotificationPreferences>[number];
type LinkPreviewResult = FunctionReturnType<typeof api.chatLinkPreview.requestLinkPreview>;
type MessageLinkPreview = {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  status: "pending" | "ready" | "failed";
};
type ReportTarget =
  | { type: "message"; messageId: Id<"chatMessages"> }
  | { type: "group"; conversationId: Id<"chatConversations"> };
type PendingSend = {
  conversationId: Id<"chatConversations">;
  body?: string;
  imageIds: Array<Id<"chatImages">>;
  replyToMessageId?: Id<"chatMessages">;
  mentionUserIds: Array<Id<"users">>;
  clientNonce: string;
};
type InboxRowItem = {
  conversationId: Id<"chatConversations">;
  kind: "direct" | "support" | "group";
  title?: string;
  imageUrl?: string | null;
  counterpart?: { name: string; avatarUrl?: string | null } | null;
  lastMessage?: { sequence?: number; body?: string; kind: string } | null;
  lastMessageAt?: number;
  unreadCount: number;
  isPinned?: boolean;
  requestStatus?: string;
  memberStatus?: string;
};

const sections: Array<{ value: InboxSection; sr: string; en: string }> = [
  { value: "all", sr: "Sve", en: "All" },
  { value: "unread", sr: "Nepročitano", en: "Unread" },
  { value: "requests", sr: "Requesti", en: "Requests" },
  { value: "groups", sr: "Grupe", en: "Groups" },
  { value: "archive", sr: "Arhiva", en: "Archive" },
];

function label(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function relativeTime(locale: Locale, timestamp?: number) {
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

function firstHttpUrl(body?: string) {
  return body?.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.!?]+$/, "");
}

function Avatar({ src, name, size = "md" }: { src?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const className = size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10";
  const initials = name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "AI";
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-ink bg-yellow text-xs font-black", className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

function InboxRow({ locale, item, selected }: { locale: Locale; item: InboxRowItem; selected: boolean }) {
  const counterpart = item.counterpart;
  const name = item.title || counterpart?.name || label(locale, "Razgovor", "Conversation");
  const preview = item.lastMessage?.body || (item.lastMessage?.kind === "system" ? label(locale, "Sistemska poruka", "System message") : label(locale, "Još nema poruka", "No messages yet"));
  return (
    <Link
      href={withLocale(locale, `/app/messages/${item.conversationId}`)}
      className={cn(
        "group flex min-w-0 gap-3 rounded-[16px] border-2 p-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        selected ? "border-ink bg-yellow/25" : "border-line bg-white hover:border-ink",
      )}
    >
      <div className="relative">
        <Avatar src={item.imageUrl || counterpart?.avatarUrl} name={name} size="lg" />
        {item.kind === "group" ? <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-white bg-ink text-white"><Users className="size-3" /></span> : null}
      </div>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", item.unreadCount ? "font-black" : "font-bold")}>{name}</span>
          <span className="shrink-0 text-[10px] font-bold text-muted">{relativeTime(locale, item.lastMessageAt)}</span>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-xs", item.unreadCount ? "font-black text-ink" : "font-semibold text-muted")}>{preview}</span>
          {item.isPinned ? <Pin className="size-3.5 shrink-0 fill-current" /> : null}
          {item.unreadCount ? <span className="grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">{item.unreadCount > 99 ? "99+" : item.unreadCount}</span> : null}
        </span>
        {item.requestStatus === "pending" || item.memberStatus === "invited" ? <span className="mt-2 inline-flex rounded-full border border-ink bg-paper px-2 py-0.5 text-[9px] font-black uppercase">{item.memberStatus === "invited" ? label(locale, "Poziv u grupu", "Group invite") : label(locale, "Message request", "Message request")}</span> : null}
      </span>
    </Link>
  );
}

function notificationCategoryLabel(locale: Locale, category: NotificationPreference["category"]) {
  const labels: Record<NotificationPreference["category"], [string, string]> = {
    chat: ["Poruke", "Messages"],
    requests: ["Requesti", "Requests"],
    groups: ["Grupe", "Groups"],
    mentions: ["Pominjanja", "Mentions"],
    study: ["Partneri za učenje", "Study partners"],
  };
  return labels[category][locale === "sr" ? 0 : 1];
}

function NotificationPreferencesPopover({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const preferences = useQuery(api.chat.getNotificationPreferences, {});
  const updatePreference = useMutation(api.chat.setNotificationPreferences);

  async function togglePreference(preference: NotificationPreference, key: "inApp" | "push" | "sound") {
    await updatePreference({
      category: preference.category,
      inApp: key === "inApp" ? !preference.inApp : preference.inApp,
      push: key === "push" ? !preference.push : preference.push,
      sound: key === "sound" ? !preference.sound : preference.sound,
    });
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" className="grid size-11 place-items-center rounded-full border-2 border-ink bg-white" aria-label={label(locale, "Podešavanja obaveštenja", "Notification settings")}>
        <Settings2 className="size-4" />
      </button>
      {open ? (
        <div role="dialog" aria-label={label(locale, "Podešavanja obaveštenja", "Notification settings")} className="absolute right-0 top-13 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-[16px] border-2 border-ink bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-black">{label(locale, "Obaveštenja", "Notifications")}</p>
            <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full border border-line" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button>
          </div>
          {preferences === undefined ? <div className="grid min-h-24 place-items-center"><Loader2 className="size-5 animate-spin" /></div> : (
            <div className="space-y-2">
              {preferences.map((preference) => (
                <div key={preference.category} className="rounded-[12px] border border-line bg-paper p-2.5">
                  <p className="text-xs font-black">{notificationCategoryLabel(locale, preference.category)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["inApp", "push", "sound"] as const).map((key) => {
                      const active = preference[key];
                      const text = key === "inApp" ? label(locale, "U aplikaciji", "In app") : key === "push" ? "Push" : label(locale, "Zvuk", "Sound");
                      return <button key={key} type="button" aria-pressed={active} onClick={() => void togglePreference(preference, key)} className={cn("rounded-full border border-ink px-2.5 py-1 text-[10px] font-black", active ? "bg-ink text-white" : "bg-white text-ink")}>{text}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function creationError(locale: Locale, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("DM_PRIVACY")) return label(locale, "Ovaj član trenutno ne prima nove poruke.", "This member is not accepting new messages right now.");
  if (message.includes("CHAT_BLOCKED")) return label(locale, "Razgovor nije dostupan zbog blokiranja.", "This conversation is unavailable because of a block.");
  if (message.includes("RATE_LIMIT")) return label(locale, "Previše poziva odjednom. Pokušaj ponovo kasnije.", "Too many invites at once. Try again later.");
  return label(locale, "Razgovor nije mogao da se kreira. Pokušaj ponovo.", "The conversation could not be created. Try again.");
}

function NewConversationDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Array<Id<"users">>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [creatingUserId, setCreatingUserId] = useState<Id<"users">>();
  const [error, setError] = useState<string>();
  const memberArgs = search.trim() ? { search: search.trim() } : {};
  const members = usePaginatedQuery(api.community.listMembersPage, memberArgs, { initialNumItems: 30 });
  const createDirect = useMutation(api.chat.createOrGetDirect);
  const createGroup = useMutation(api.chat.createGroup);
  const availableMembers = members.results.filter(
    (member): member is CommunityMember & { userId: Id<"users"> } => Boolean(member.userId && member.role !== "admin" && member.canFollow),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function startDirect(recipientId: Id<"users">) {
    setCreatingUserId(recipientId);
    setError(undefined);
    try {
      const result = await createDirect({ recipientId });
      onClose();
      router.push(withLocale(locale, `/app/messages/${result.conversationId}`));
    } catch (caught) {
      setError(creationError(locale, caught));
    } finally {
      setCreatingUserId(undefined);
    }
  }

  async function submitGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (groupName.trim().length < 2 || selectedIds.length < 1 || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await createGroup({ name: groupName.trim(), memberIds: selectedIds });
      onClose();
      router.push(withLocale(locale, `/app/messages/${result.conversationId}`));
    } catch (caught) {
      setError(creationError(locale, caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <button type="button" tabIndex={-1} onClick={onClose} aria-label={label(locale, "Zatvori novi razgovor", "Close new conversation")} className="absolute inset-0 rounded-none border-0 bg-ink/55 p-0 backdrop-blur-[2px]" style={{ borderRadius: 0 }} />
      <div role="dialog" aria-modal="true" aria-labelledby="new-conversation-title" onKeyDown={trapFocus} className="relative flex max-h-[min(760px,92dvh)] w-[min(560px,100%)] flex-col overflow-hidden rounded-[16px] border-[3px] border-ink bg-white shadow-[9px_9px_0_0_rgba(14,49,88,0.24)]">
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink p-4">
          <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2e6f9f]">Nauči AI</p><h2 id="new-conversation-title" className="font-display text-2xl">{label(locale, "Novi razgovor", "New conversation")}</h2></div>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full border-2 border-ink" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button>
        </div>
        <div className="border-b border-line p-4">
          <div role="tablist" aria-label={label(locale, "Vrsta razgovora", "Conversation type")} className="flex gap-2">
            <button type="button" role="tab" aria-selected={mode === "direct"} onClick={() => setMode("direct")} className={cn("flex-1 rounded-full border-2 border-ink px-4 py-2 text-xs font-black", mode === "direct" ? "bg-ink text-white" : "bg-white")}>{label(locale, "Jedan na jedan", "One to one")}</button>
            <button type="button" role="tab" aria-selected={mode === "group"} onClick={() => setMode("group")} className={cn("flex-1 rounded-full border-2 border-ink px-4 py-2 text-xs font-black", mode === "group" ? "bg-ink text-white" : "bg-white")}><Users className="mr-1.5 inline size-4" />{label(locale, "Grupa", "Group")}</button>
          </div>
          {mode === "group" ? <label className="mt-3 block text-xs font-black">{label(locale, "Naziv grupe", "Group name")}<input autoFocus value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} className="mt-1 h-11 w-full rounded-[12px] border-2 border-ink px-3 text-sm font-bold outline-none" placeholder={label(locale, "npr. AI study ekipa", "e.g. AI study group")} /></label> : null}
          <label className="mt-3 flex h-11 items-center gap-2 rounded-full border-2 border-line bg-paper px-4 focus-within:border-ink"><Search className="size-4 text-muted" /><span className="sr-only">{label(locale, "Pretraži članove", "Search members")}</span><input autoFocus={mode === "direct"} value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" placeholder={label(locale, "Ime ili korisničko ime", "Name or username")} /></label>
          {mode === "group" ? <p className="mt-2 text-[10px] font-black text-muted">{label(locale, `Izabrano: ${selectedIds.length}`, `Selected: ${selectedIds.length}`)}</p> : null}
          {error ? <p role="alert" className="mt-3 rounded-[8px] border border-red-400 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{error}</p> : null}
        </div>
        <div role="listbox" aria-multiselectable={mode === "group"} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {availableMembers.map((member) => {
            const selected = selectedIds.includes(member.userId);
            return <button key={member.userId} type="button" role="option" aria-selected={mode === "group" ? selected : undefined} disabled={Boolean(creatingUserId)} onClick={() => mode === "direct" ? void startDirect(member.userId) : setSelectedIds((current) => selected ? current.filter((id) => id !== member.userId) : [...current, member.userId])} className={cn("flex w-full items-center gap-3 rounded-[16px] border-2 p-3 text-left transition disabled:opacity-60", selected ? "border-ink bg-yellow/25" : "border-line bg-white hover:border-ink")}>
              <Avatar src={member.avatarUrl} name={member.name} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{member.name}</span>{member.username ? <span className="block truncate text-[10px] font-bold text-muted">@{member.username}</span> : null}</span>
              {creatingUserId === member.userId ? <Loader2 className="size-4 animate-spin" /> : mode === "group" ? <span className={cn("grid size-6 place-items-center rounded-full border-2 border-ink", selected && "bg-ink text-white")}>{selected ? <Check className="size-3.5" /> : null}</span> : <UserPlus className="size-4" />}
            </button>;
          })}
          {members.status === "LoadingFirstPage" ? <div className="grid min-h-36 place-items-center"><Loader2 className="size-6 animate-spin" /></div> : null}
          {!availableMembers.length && members.status !== "LoadingFirstPage" ? <p className="p-8 text-center text-sm font-black text-muted">{label(locale, "Nema dostupnih članova.", "No available members.")}</p> : null}
          {members.status === "CanLoadMore" ? <button type="button" onClick={() => members.loadMore(30)} className="w-full rounded-full border-2 border-ink bg-white px-4 py-2.5 text-xs font-black">{label(locale, "Učitaj još", "Load more")}</button> : null}
        </div>
        {mode === "group" ? <form onSubmit={submitGroup} className="border-t-2 border-ink p-4"><button type="submit" disabled={submitting || groupName.trim().length < 2 || selectedIds.length < 1} className="flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black disabled:opacity-40">{submitting ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}{label(locale, "Kreiraj grupu", "Create group")}</button></form> : null}
      </div>
    </div>
  );
}

function GroupSettingsDialog({
  locale,
  conversation,
  onClose,
  onExit,
}: {
  locale: Locale;
  conversation: ConversationData;
  onClose: () => void;
  onExit: () => void;
}) {
  const conversationId = conversation.conversation.id;
  const isOwner = conversation.viewer.role === "owner" && conversation.conversation.ownerId === conversation.viewer.userId;
  const isStudyManaged = Boolean((conversation.conversation as ConversationData["conversation"] & { studyGroupId?: Id<"studyGroups"> }).studyGroupId);
  const [name, setName] = useState(conversation.conversation.title ?? "");
  const [inviteSearch, setInviteSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [confirmMemberAction, setConfirmMemberAction] = useState<{ kind: "remove" | "transfer"; userId: Id<"users"> }>();
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const members = usePaginatedQuery(api.chat.listConversationMembersPage, { conversationId }, { initialNumItems: 30 });
  const candidates = usePaginatedQuery(
    api.community.listMembersPage,
    isOwner && !isStudyManaged ? (inviteSearch.trim() ? { search: inviteSearch.trim() } : {}) : "skip",
    { initialNumItems: 20 },
  );
  const updateGroup = useMutation(api.chat.updateGroup);
  const inviteGroupMember = useMutation(api.chat.inviteGroupMember);
  const removeGroupMember = useMutation(api.chat.removeGroupMember);
  const transferGroupOwnership = useMutation(api.chat.transferGroupOwnership);
  const leaveGroup = useMutation(api.chat.leaveGroup);
  const memberIds = new Set(members.results.map((member) => String(member.userId)));
  const inviteCandidates = candidates.results.filter(
    (member): member is CommunityMember & { userId: Id<"users"> } => Boolean(member.userId && member.role !== "admin" && member.canFollow && !memberIds.has(String(member.userId))),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    setBusyKey("rename");
    setNotice(undefined);
    try {
      await updateGroup({ conversationId, name: name.trim() });
      setNotice(label(locale, "Naziv je sačuvan.", "Name saved."));
    } catch {
      setNotice(label(locale, "Naziv nije sačuvan.", "Name was not saved."));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function invite(userId: Id<"users">) {
    setBusyKey(`invite:${userId}`);
    setNotice(undefined);
    try {
      await inviteGroupMember({ conversationId, userId });
      setNotice(label(locale, "Poziv je poslat.", "Invite sent."));
    } catch {
      setNotice(label(locale, "Poziv nije poslat.", "Invite was not sent."));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function manageMember(kind: "remove" | "transfer", userId: Id<"users">) {
    if (confirmMemberAction?.kind !== kind || confirmMemberAction.userId !== userId) {
      setConfirmMemberAction({ kind, userId });
      return;
    }
    setBusyKey(`${kind}:${userId}`);
    setNotice(undefined);
    try {
      if (kind === "remove") await removeGroupMember({ conversationId, userId });
      else await transferGroupOwnership({ conversationId, newOwnerId: userId });
      setConfirmMemberAction(undefined);
      setNotice(kind === "remove" ? label(locale, "Član je uklonjen.", "Member removed.") : label(locale, "Vlasništvo je preneto.", "Ownership transferred."));
    } catch {
      setNotice(label(locale, "Akcija nije uspela.", "The action failed."));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function leave() {
    if (!leaveConfirm) {
      setLeaveConfirm(true);
      return;
    }
    setBusyKey("leave");
    try {
      await leaveGroup({ conversationId });
      onExit();
    } catch {
      setNotice(label(locale, "Pre izlaska prenesi vlasništvo drugom članu.", "Transfer ownership before leaving."));
      setBusyKey(undefined);
    }
  }

  return (
    <div className="fixed inset-0 z-[105] grid place-items-center p-4">
      <button type="button" tabIndex={-1} onClick={onClose} aria-label={label(locale, "Zatvori podešavanja grupe", "Close group settings")} className="absolute inset-0 rounded-none border-0 bg-ink/55 p-0 backdrop-blur-[2px]" style={{ borderRadius: 0 }} />
      <div role="dialog" aria-modal="true" aria-labelledby="group-settings-title" className="relative flex max-h-[min(820px,94dvh)] w-[min(620px,100%)] flex-col overflow-hidden rounded-[16px] border-[3px] border-ink bg-white shadow-[9px_9px_0_0_rgba(14,49,88,0.24)]">
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2e6f9f]">{label(locale, "Grupa", "Group")}</p><h2 id="group-settings-title" className="font-display text-2xl">{label(locale, "Podešavanja grupe", "Group settings")}</h2></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full border-2 border-ink" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button></div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {notice ? <p role="status" className="rounded-[8px] border border-line bg-paper px-3 py-2 text-xs font-black">{notice}</p> : null}
          {isOwner ? <form onSubmit={rename} className="rounded-[16px] border-2 border-line p-3"><label className="text-xs font-black">{label(locale, "Naziv grupe", "Group name")}<span className="mt-2 flex gap-2"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="h-10 min-w-0 flex-1 rounded-[10px] border-2 border-ink px-3 text-sm font-bold outline-none" /><button type="submit" disabled={busyKey === "rename" || name.trim().length < 2} className="rounded-full border-2 border-ink bg-yellow px-4 text-xs font-black disabled:opacity-40">{label(locale, "Sačuvaj", "Save")}</button></span></label></form> : null}
          {isOwner && !isStudyManaged ? <div className="rounded-[16px] border-2 border-line p-3"><p className="text-xs font-black">{label(locale, "Pozovi člana", "Invite a member")}</p><label className="mt-2 flex h-10 items-center gap-2 rounded-full border-2 border-line bg-paper px-3"><Search className="size-4" /><span className="sr-only">{label(locale, "Pretraži članove", "Search members")}</span><input value={inviteSearch} onChange={(event) => setInviteSearch(event.target.value)} placeholder={label(locale, "Ime ili @username", "Name or @username")} className="min-w-0 flex-1 bg-transparent text-xs font-bold outline-none" /></label><div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">{inviteCandidates.map((member) => <button key={member.userId} type="button" onClick={() => void invite(member.userId)} disabled={Boolean(busyKey)} className="flex w-full items-center gap-2 rounded-[12px] border border-line p-2 text-left hover:border-ink disabled:opacity-50"><Avatar src={member.avatarUrl} name={member.name} size="sm" /><span className="min-w-0 flex-1 truncate text-xs font-black">{member.name}</span>{busyKey === `invite:${member.userId}` ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}</button>)}{candidates.status === "LoadingFirstPage" ? <Loader2 className="mx-auto my-4 size-5 animate-spin" /> : null}</div></div> : null}
          {isStudyManaged ? <p className="rounded-[12px] border border-line bg-paper p-3 text-[10px] font-bold text-muted">{label(locale, "Članstvo ove grupe prati study grupu; pozive i uklanjanja menjaj kroz study partner podešavanja.", "This membership follows the study group; manage invites and removals in study partner settings.")}</p> : null}
          <div><div className="flex items-center justify-between"><p className="text-xs font-black">{label(locale, "Članovi", "Members")}</p><span className="text-[10px] font-bold text-muted">{members.results.length}{members.status === "CanLoadMore" ? "+" : ""}</span></div><div className="mt-2 space-y-2">{members.results.map((member: ConversationMember) => {
            if (!member.userId) return null;
            const isViewer = member.userId === conversation.viewer.userId;
            const confirmingRemove = confirmMemberAction?.kind === "remove" && confirmMemberAction.userId === member.userId;
            const confirmingTransfer = confirmMemberAction?.kind === "transfer" && confirmMemberAction.userId === member.userId;
            return <div key={member.userId} className="flex items-center gap-2 rounded-[12px] border border-line p-2"><Avatar src={member.avatarUrl} name={member.name ?? label(locale, "Član", "Member")} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{member.name}</span><span className="text-[9px] font-bold uppercase text-muted">{member.membershipRole === "owner" ? label(locale, "Vlasnik", "Owner") : label(locale, "Član", "Member")}</span></span>{isOwner && !isViewer ? <span className="flex flex-wrap justify-end gap-1"><button type="button" onClick={() => void manageMember("transfer", member.userId!)} disabled={Boolean(busyKey)} className={cn("rounded-full border border-ink px-2 py-1 text-[9px] font-black", confirmingTransfer ? "bg-yellow" : "bg-white")}>{confirmingTransfer ? label(locale, "Potvrdi prenos", "Confirm transfer") : label(locale, "Prenesi", "Transfer")}</button>{!isStudyManaged ? <button type="button" onClick={() => void manageMember("remove", member.userId!)} disabled={Boolean(busyKey)} className={cn("rounded-full border border-red-500 px-2 py-1 text-[9px] font-black text-red-700", confirmingRemove && "bg-red-50")}>{confirmingRemove ? label(locale, "Potvrdi uklanjanje", "Confirm removal") : label(locale, "Ukloni", "Remove")}</button> : null}</span> : null}</div>;
          })}</div>{members.status === "CanLoadMore" ? <button type="button" onClick={() => members.loadMore(30)} className="mt-2 w-full rounded-full border border-ink px-3 py-2 text-[10px] font-black">{label(locale, "Učitaj još", "Load more")}</button> : null}</div>
          <div className="rounded-[16px] border-2 border-red-300 bg-red-50 p-3"><button type="button" onClick={() => void leave()} disabled={isOwner || busyKey === "leave"} className="w-full rounded-full border-2 border-red-600 bg-white px-4 py-2 text-xs font-black text-red-700 disabled:opacity-45">{busyKey === "leave" ? <Loader2 className="mr-2 inline size-3.5 animate-spin" /> : null}{leaveConfirm ? label(locale, "Potvrdi izlazak", "Confirm leaving") : label(locale, "Napusti grupu", "Leave group")}</button>{isOwner ? <p className="mt-2 text-center text-[10px] font-bold text-red-800">{label(locale, "Vlasnik prvo mora da prenese vlasništvo.", "The owner must transfer ownership first.")}</p> : null}</div>
        </div>
      </div>
    </div>
  );
}

function ReportDialog({ locale, target, onClose }: { locale: Locale; target: ReportTarget; onClose: () => void }) {
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  const reportContent = useMutation(api.chatModeration.reportContent);
  const reasons = [
    { value: "spam", sr: "Spam ili neželjen sadržaj", en: "Spam or unwanted content" },
    { value: "harassment", sr: "Uznemiravanje ili vređanje", en: "Harassment or abuse" },
    { value: "unsafe", sr: "Opasan ili neprikladan sadržaj", en: "Unsafe or inappropriate content" },
    { value: "other", sr: "Drugi razlog", en: "Another reason" },
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedReason = reasons.find((item) => item.value === reason);
    const base = selectedReason ? (locale === "sr" ? selectedReason.sr : selectedReason.en) : reason;
    const reportReason = `${base}${details.trim() ? `: ${details.trim()}` : ""}`;
    if (reason === "other" && details.trim().length < 3) {
      setError(label(locale, "Dodaj kratko objašnjenje.", "Add a short explanation."));
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      if (target.type === "message") {
        await reportContent({ targetType: "message", targetMessageId: target.messageId, reason: reportReason });
      } else {
        await reportContent({ targetType: "group", targetConversationId: target.conversationId, reason: reportReason });
      }
      setSubmitted(true);
    } catch {
      setError(label(locale, "Prijava nije poslata. Pokušaj ponovo.", "The report was not sent. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center p-4">
      <button type="button" tabIndex={-1} onClick={onClose} aria-label={label(locale, "Zatvori prijavu", "Close report")} className="absolute inset-0 rounded-none border-0 bg-ink/55 p-0 backdrop-blur-[2px]" style={{ borderRadius: 0 }} />
      <div role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" className="relative w-[min(440px,100%)] rounded-[16px] border-[3px] border-ink bg-white p-5 shadow-[8px_8px_0_0_rgba(14,49,88,0.24)]">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-700">{label(locale, "Bezbednost", "Safety")}</p><h2 id="report-dialog-title" className="font-display text-2xl">{target.type === "message" ? label(locale, "Prijavi poruku", "Report message") : label(locale, "Prijavi grupu", "Report group")}</h2></div><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full border-2 border-ink" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button></div>
        {submitted ? <div className="mt-5"><p className="rounded-[12px] border-2 border-ink bg-yellow/25 p-4 text-sm font-black">{label(locale, "Prijava je poslata moderatorskom timu.", "The report was sent to the moderation team.")}</p><button type="button" onClick={onClose} className="mt-4 h-11 w-full rounded-full border-2 border-ink bg-ink px-4 text-sm font-black text-white">{label(locale, "Gotovo", "Done")}</button></div> : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block text-xs font-black">{label(locale, "Razlog", "Reason")}<select autoFocus value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-11 w-full rounded-[12px] border-2 border-ink bg-white px-3 text-sm font-bold outline-none">{reasons.map((item) => <option key={item.value} value={item.value}>{locale === "sr" ? item.sr : item.en}</option>)}</select></label>
            <label className="block text-xs font-black">{label(locale, "Dodatno objašnjenje (opciono)", "Additional details (optional)")}<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={900} rows={4} className="mt-1 w-full resize-y rounded-[12px] border-2 border-ink px-3 py-2 text-sm font-semibold outline-none" /></label>
            {error ? <p role="alert" className="rounded-[8px] border border-red-400 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{error}</p> : null}
            <button type="submit" disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-red-600 px-4 text-sm font-black text-white disabled:opacity-50">{submitting ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}{label(locale, "Pošalji prijavu", "Send report")}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function InboxPane({ locale, selectedConversationId }: { locale: Locale; selectedConversationId?: string }) {
  const [section, setSection] = useState<InboxSection>("all");
  const [search, setSearch] = useState("");
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const inbox = usePaginatedQuery(api.chat.listInboxPage, { section }, { initialNumItems: 20 });
  const searchResults = useQuery(api.chat.searchMessages, search.trim().length >= 2 ? { query: search.trim(), limit: 30 } : "skip");
  const rows: Array<InboxItem | InboxRowItem> = search.trim().length >= 2
    ? (searchResults ?? []).map((hit: SearchHit): InboxRowItem => ({
        conversationId: hit.conversationId,
        kind: hit.kind ?? "direct",
        title: hit.title,
        lastMessage: { body: hit.body, kind: "user" },
        lastMessageAt: hit.createdAt,
        unreadCount: 0,
      }))
    : inbox.results.filter((item): item is InboxItem => item !== null);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[16px] border-2 border-ink bg-paper shadow-[5px_5px_0_0_rgba(14,49,88,0.12)]">
      <div className="border-b-2 border-ink bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2e6f9f]">Nauči AI</p>
            <h1 className="font-display text-3xl leading-none text-ink">{label(locale, "Poruke", "Messages")}</h1>
          </div>
          <div className="flex gap-2"><PushNotificationButton locale={locale} /><NotificationPreferencesPopover locale={locale} /><button type="button" onClick={() => setNewConversationOpen(true)} className="grid size-11 place-items-center rounded-full border-2 border-ink bg-yellow" aria-label={label(locale, "Novi razgovor", "New conversation")}><MessageCircle className="size-5" /></button></div>
        </div>
        <label className="mt-4 flex h-11 items-center gap-2 rounded-full border-2 border-line bg-paper px-4 focus-within:border-ink">
          <Search className="size-4 text-muted" />
          <span className="sr-only">{label(locale, "Pretraži poruke", "Search messages")}</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={label(locale, "Pretraži ljude, grupe i poruke", "Search people, groups and messages")} className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-muted" />
          {search ? <button type="button" onClick={() => setSearch("")} aria-label={label(locale, "Obriši pretragu", "Clear search")}><X className="size-4" /></button> : null}
        </label>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-3" role="tablist" aria-label={label(locale, "Filter razgovora", "Conversation filter")}>
          {sections.map((item) => (
            <button key={item.value} type="button" role="tab" aria-selected={section === item.value} onClick={() => setSection(item.value)} className={cn("min-w-0 rounded-full border-2 border-ink px-2 py-1.5 text-[10px] font-black sm:text-[11px]", section === item.value ? "bg-ink text-white" : "bg-white text-ink")}>
              {locale === "sr" ? item.sr : item.en}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
        {rows.map((item: InboxItem | InboxRowItem) => <InboxRow key={`${item.conversationId}:${item.lastMessage?.sequence ?? "empty"}`} locale={locale} item={item} selected={selectedConversationId === String(item.conversationId)} />)}
        {!rows.length && (searchResults !== undefined || inbox.status !== "LoadingFirstPage") ? (
          <div className="grid min-h-52 place-items-center rounded-[16px] border-2 border-dashed border-line bg-white p-8 text-center">
            <div><Inbox className="mx-auto size-9 text-muted" /><p className="mt-3 text-sm font-black text-ink">{label(locale, "Ovde je za sada mirno.", "It is quiet here for now.")}</p></div>
          </div>
        ) : null}
        {inbox.status === "LoadingFirstPage" && search.trim().length < 2 ? <div className="grid min-h-52 place-items-center"><Loader2 className="size-7 animate-spin" /></div> : null}
        {inbox.status === "CanLoadMore" && search.trim().length < 2 ? <button type="button" onClick={() => inbox.loadMore(20)} className="w-full rounded-full border-2 border-ink bg-white px-4 py-3 text-sm font-black">{label(locale, "Učitaj još", "Load more")}</button> : null}
      </div>
      {newConversationOpen ? <NewConversationDialog locale={locale} onClose={() => setNewConversationOpen(false)} /> : null}
    </section>
  );
}

function MessageBubble({
  locale,
  conversationId,
  conversationKind,
  message,
  viewerId,
  onReply,
  onReport,
}: {
  locale: Locale;
  conversationId: Id<"chatConversations">;
  conversationKind: "direct" | "support" | "group";
  message: ChatMessage;
  viewerId?: string;
  onReply: (message: ChatMessage) => void;
  onReport: (messageId: Id<"chatMessages">) => void;
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

  if (message.kind === "system") return <p className="mx-auto my-3 max-w-md rounded-full border border-line bg-white px-4 py-2 text-center text-[11px] font-black text-muted">{message.body}</p>;

  return (
    <article className={cn("group flex max-w-[88%] gap-2", mine ? "ml-auto flex-row-reverse" : "mr-auto")}>
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
          {visibleMessage.images?.length ? <div className={cn("mt-2 grid gap-2", visibleMessage.images.length > 1 && "grid-cols-2")}>{visibleMessage.images.map((image) => image.url ? <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-[8px] border-2 border-ink bg-paper"><img src={image.url} alt={image.fileName || ""} className="max-h-72 w-full object-cover" /></a> : <button key={image.id} type="button" onClick={() => void allowRequestImages({ conversationId })} className="rounded-[8px] border-2 border-dashed border-ink bg-paper p-4 text-xs font-black"><ImagePlus className="mx-auto mb-2 size-5" />{image.fileName} · {Math.ceil(image.byteSize / 1024)} KB<br />{label(locale, "Potvrdi otvaranje slike", "Confirm opening image")}</button>)}</div> : null}
          {linkUrl && !message.collapsed && !visibleMessage.deletedAt ? <div className="mt-2">
            {readyLinkPreview ? <a href={readyLinkPreview.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[12px] border-2 border-ink bg-paper transition hover:bg-white">{readyLinkPreview.imageUrl ? <img src={readyLinkPreview.imageUrl} alt="" className="max-h-40 w-full object-cover" /> : null}<span className="block p-3"><span className="flex items-center gap-2 text-[10px] font-black uppercase text-[#2e6f9f]"><Link2 className="size-3.5" />{readyLinkPreview.siteName || label(locale, "Pregled linka", "Link preview")}</span><span className="mt-1 block text-sm font-black">{readyLinkPreview.title || readyLinkPreview.url}</span>{readyLinkPreview.description ? <span className="mt-1 line-clamp-2 block text-[11px] font-semibold text-muted">{readyLinkPreview.description}</span> : null}<span className="mt-1 block truncate text-[9px] font-bold text-muted">{readyLinkPreview.url}</span></span></a> : <button type="button" disabled={linkPreviewLoading} onClick={() => { setLinkPreviewLoading(true); setLinkPreviewError(false); void requestLinkPreview({ messageId: message.id, url: linkUrl }).then((result) => { setLinkPreview(result); setLinkPreviewError(result.status !== "ready"); }).catch(() => setLinkPreviewError(true)).finally(() => setLinkPreviewLoading(false)); }} className="inline-flex items-center gap-2 rounded-full border border-ink bg-paper px-3 py-1.5 text-[10px] font-black disabled:opacity-60">{linkPreviewLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}{linkPreviewError || persistedLinkPreview?.status === "failed" ? label(locale, "Pokušaj pregled ponovo", "Retry preview") : label(locale, "Učitaj bezbedan pregled linka", "Load safe link preview")}</button>}
          </div> : null}
          <div className="mt-1.5 flex items-center justify-end gap-1 text-[9px] font-black text-muted">
            {visibleMessage.editedAt ? <span>{label(locale, "izmenjeno", "edited")}</span> : null}
            <span>{new Intl.DateTimeFormat(locale === "sr" ? "sr-Latn" : "en", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}</span>
            {mine ? seenCount ? <span className="inline-flex items-center gap-1 text-[#2e6f9f]" title={seenTitle || undefined}><CheckCheck className="size-3.5" /><span>{conversationKind === "group" ? label(locale, `Videlo ${seenCount}`, `Seen by ${seenCount}`) : label(locale, "Viđeno", "Seen")}</span></span> : <Check className="size-3.5" /> : null}
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
        {visibleMessage.reactions?.length ? <div className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}>{visibleMessage.reactions.map((reaction) => <button key={reaction.emoji} type="button" onClick={() => void toggleReaction({ messageId: message.id, emoji: reaction.emoji })} className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-black">{reaction.emoji} {reaction.count}</button>)}</div> : null}
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
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [destructiveAction, setDestructiveAction] = useState<"delete" | "block">();
  const [destructiveBusy, setDestructiveBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget>();
  const [preparedImages, setPreparedImages] = useState<Array<{ imageId: Id<"chatImages">; fileName: string; mimeType: string; byteSize: number; width: number; height: number }>>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageError, setImageError] = useState<string>();
  const [draggingImages, setDraggingImages] = useState(false);
  const hydratedDraftRef = useRef<string | null>(null);
  const typingAtRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
      const next: Array<{ imageId: Id<"chatImages">; fileName: string; mimeType: string; byteSize: number; width: number; height: number }> = [];
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
    if (hydratedDraftRef.current !== String(conversationId)) return;
    const timer = window.setTimeout(() => void saveDraft({ conversationId, body }).catch(() => undefined), 550);
    return () => window.clearTimeout(timer);
  }, [body, conversationId, saveDraft]);

  const latestSequence = conversation?.conversation.lastMessageSequence ?? 0;
  useEffect(() => {
    if (!latestSequence || conversation?.viewer.status !== "active") return;
    void markRead({ conversationId, sequence: latestSequence }).catch(() => undefined);
  }, [conversation?.viewer.status, conversationId, latestSequence, markRead]);

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "auto" });
  }, [messages.results.length]);

  const orderedMessages = useMemo(() => [...messages.results].reverse(), [messages.results]);
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
      {draggingImages ? <div className={cn("pointer-events-none z-50 grid place-items-center bg-ink/55 p-5 backdrop-blur-[2px]", compact ? "absolute inset-0" : "fixed inset-0")}><div className="w-[min(92vw,32rem)] rounded-[16px] border-[3px] border-ink bg-yellow p-6 text-center shadow-[8px_8px_0_0_#fff]"><UploadCloud className="mx-auto size-10" /><p className="mt-3 text-xl font-black">{label(locale, "Pusti slike bilo gde u razgovoru", "Drop images anywhere in the conversation")}</p><p className="mt-2 text-xs font-bold">{label(locale, "Do četiri slike, ukupno 25 MB. Sve slike prolaze decode i ponovni encode.", "Up to four images, 25 MB total. Every image is decoded and re-encoded.")}</p></div></div> : null}
      <header className="flex min-h-16 items-center gap-3 border-b-2 border-ink bg-white px-3 sm:px-4">
        {onBack ? <button type="button" onClick={onBack} className="grid size-10 place-items-center rounded-full border-2 border-ink xl:hidden" aria-label={label(locale, "Nazad", "Back")}><ArrowLeft className="size-5" /></button> : null}
        <Avatar src={conversation.conversation.imageUrl} name={title} />
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-black text-ink">{title}</h2><p className="truncate text-[10px] font-bold text-muted">{typing?.length ? `${typing.map((item) => item.name).filter(Boolean).join(", ")} ${label(locale, "kuca…", "typing…")}` : conversation.conversation.kind === "group" ? `${conversation.members.filter((item) => item.status === "active").length} ${label(locale, "članova", "members")}` : label(locale, "Realtime razgovor", "Realtime conversation")}</p></div>
        {onMinimize ? <button type="button" onClick={onMinimize} className="grid size-9 place-items-center rounded-full border-2 border-ink bg-white" aria-label={label(locale, "Minimizuj", "Minimize")}><Minus className="size-4" /></button> : null}
        {onClose ? <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full border-2 border-ink bg-white" aria-label={label(locale, "Ukloni iz dock-a", "Remove from dock")}><X className="size-4" /></button> : null}
        <div className="relative">
          <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="grid size-10 place-items-center rounded-full border-2 border-ink" aria-label={label(locale, "Podešavanja razgovora", "Conversation settings")}><ChevronDown className={cn("size-4 transition", settingsOpen && "rotate-180")} /></button>
          {settingsOpen ? <div className="absolute right-0 top-12 z-30 w-60 rounded-[16px] border-2 border-ink bg-white p-2 shadow-xl">
            <button type="button" onClick={() => void updateMemberState({ conversationId, isPinned: true })} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black hover:bg-paper"><Pin className="size-4" />{label(locale, "Zakači", "Pin")}</button>
            <button type="button" onClick={() => void updateMemberState({ conversationId, isArchived: true })} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black hover:bg-paper"><Archive className="size-4" />{label(locale, "Arhiviraj", "Archive")}</button>
            {conversation.conversation.kind === "group" ? <button type="button" onClick={() => { setSettingsOpen(false); setGroupSettingsOpen(true); }} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black hover:bg-paper"><Users className="size-4" />{label(locale, "Upravljaj grupom", "Manage group")}</button> : null}
            {conversation.conversation.kind === "group" ? <button type="button" onClick={() => { setSettingsOpen(false); setReportTarget({ type: "group", conversationId }); }} className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black text-red-700 hover:bg-red-50"><Flag className="size-4" />{label(locale, "Prijavi grupu", "Report group")}</button> : null}
            <div className="mt-1 border-t border-line pt-1"><p className="px-3 py-1 text-[9px] font-black uppercase text-muted">{label(locale, "Utišaj", "Mute")}</p>{[[1, "1h"], [8, "8h"], [168, "7d"], [-1, label(locale, "Zauvek", "Forever")]].map(([hours, text]) => <button key={String(hours)} type="button" onClick={() => void updateMemberState({ conversationId, mutedUntil: hours === -1 ? -1 : Date.now() + Number(hours) * 60 * 60 * 1000 })} className="rounded-full px-3 py-1.5 text-[10px] font-black hover:bg-paper">{text}</button>)}</div>
            <div className="mt-1 border-t border-line pt-2"><p className="px-3 py-1 text-[9px] font-black uppercase text-muted">{label(locale, "Obaveštenja ovog razgovora", "This conversation notifications")}</p><div className="flex flex-wrap gap-1 px-2">{(["inApp", "push", "sound"] as const).map((key) => { const active = chatPreference?.[key] ?? true; const text = key === "inApp" ? label(locale, "U aplikaciji", "In app") : key === "push" ? "Push" : label(locale, "Zvuk", "Sound"); return <button key={key} type="button" aria-pressed={active} onClick={() => toggleConversationPreference(key)} className={cn("rounded-full border border-ink px-2 py-1 text-[9px] font-black", active ? "bg-ink text-white" : "bg-white")}>{text}</button>; })}</div></div>
            <div className="mt-2 border-t border-red-200 pt-1">{conversation.conversation.kind !== "group" && counterpart?.userId ? <button type="button" onClick={() => setDestructiveAction("block")} className="flex min-h-9 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black text-red-700 hover:bg-red-50"><X className="size-4" />{label(locale, "Blokiraj člana", "Block member")}</button> : null}<button type="button" onClick={() => setDestructiveAction("delete")} className="flex min-h-9 w-full items-center gap-2 rounded-[10px] px-3 text-left text-xs font-black text-red-700 hover:bg-red-50"><Archive className="size-4" />{label(locale, "Obriši za mene", "Delete for me")}</button>{destructiveAction ? <div className="m-1 rounded-[10px] border border-red-400 bg-red-50 p-2"><p className="text-[10px] font-black text-red-800">{destructiveAction === "block" ? label(locale, "Blokiranje arhivira direktan razgovor.", "Blocking archives the direct conversation.") : label(locale, "Istorija pre ove tačke biće sakrivena samo tebi.", "History up to this point will be hidden only for you.")}</p><div className="mt-2 flex gap-1"><button type="button" onClick={() => setDestructiveAction(undefined)} className="flex-1 rounded-full border border-ink bg-white px-2 py-1 text-[9px] font-black">{label(locale, "Otkaži", "Cancel")}</button><button type="button" onClick={() => void runDestructiveAction()} disabled={destructiveBusy} className="flex-1 rounded-full border border-red-700 bg-red-600 px-2 py-1 text-[9px] font-black text-white disabled:opacity-50">{label(locale, "Potvrdi", "Confirm")}</button></div></div> : null}</div>
          </div> : null}
        </div>
      </header>

      {(pendingDirect || invited) ? <div className="border-b-2 border-ink bg-yellow/25 p-3 text-center">
        <p className="text-xs font-black">{invited ? label(locale, "Pozvan/a si u ovu grupu.", "You were invited to this group.") : label(locale, "Prihvati request da biste slobodno razmenjivali poruke.", "Accept the request to continue messaging freely.")}</p>
        <div className="mt-2 flex justify-center gap-2"><button type="button" onClick={() => void (invited ? respondGroupInvite({ conversationId, accept: true }) : respondDirectRequest({ conversationId, accept: true }))} className="rounded-full border-2 border-ink bg-ink px-4 py-2 text-xs font-black text-white">{label(locale, "Prihvati", "Accept")}</button><button type="button" onClick={() => void (invited ? respondGroupInvite({ conversationId, accept: false }) : respondDirectRequest({ conversationId, accept: false }))} className="rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black">{label(locale, "Odbij", "Decline")}</button></div>
      </div> : null}

      <div ref={viewportRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-paper p-3 sm:p-4">
        {messages.status === "CanLoadMore" ? <button type="button" onClick={() => messages.loadMore(compact ? 20 : 40)} className="mx-auto block rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black">{label(locale, "Starije poruke", "Older messages")}</button> : null}
        {orderedMessages.map((message) => <MessageBubble key={message.id} locale={locale} conversationId={conversationId} conversationKind={conversation.conversation.kind} message={message} viewerId={String(conversation.viewer.userId)} onReply={setReplyTo} onReport={(messageId) => setReportTarget({ type: "message", messageId })} />)}
        {!orderedMessages.length && messages.status !== "LoadingFirstPage" ? <div className="grid min-h-48 place-items-center text-center"><div><MessageCircle className="mx-auto size-9 text-muted" /><p className="mt-3 text-sm font-black">{label(locale, "Pošalji prvu poruku.", "Send the first message.")}</p></div></div> : null}
      </div>

      {conversation.viewer.status === "active" && (!pendingDirect || conversation.directRequest?.senderId === conversation.viewer.userId) ? <div className="border-t-2 border-ink bg-white p-3">
        {preparedImages.length ? <div className="mb-2 flex gap-2 overflow-x-auto pb-1">{preparedImages.map((image) => <div key={image.imageId} className="relative shrink-0 rounded-[12px] border-2 border-ink bg-paper px-3 py-2 pr-9 text-[10px] font-black"><ImagePlus className="mb-1 size-4" /><p className="max-w-28 truncate">{image.fileName}</p><p className="text-muted">{Math.ceil(image.byteSize / 1024)} KB</p><button type="button" onClick={() => setPreparedImages((items) => items.filter((item) => item.imageId !== image.imageId))} className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border border-ink bg-white" aria-label={label(locale, "Ukloni sliku", "Remove image")}><X className="size-3" /></button></div>)}</div> : null}
        {imageError ? <p role="alert" className="mb-2 rounded-[8px] border border-red-400 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{imageError}</p> : null}
        {sendFailure ? <div role="alert" className="mb-2 flex items-center gap-2 rounded-[8px] border border-red-400 bg-red-50 px-3 py-2"><p className="min-w-0 flex-1 text-xs font-black text-red-800">{label(locale, "Poruka nije poslata.", "Message was not sent.")}</p><button type="button" onClick={() => void attemptSend(sendFailure)} disabled={sending} className="rounded-full border border-red-700 bg-white px-3 py-1 text-[10px] font-black text-red-800 disabled:opacity-50">{label(locale, "Pokušaj ponovo", "Retry")}</button><button type="button" onClick={() => setSendFailure(undefined)} className="grid size-7 place-items-center rounded-full border border-red-300" aria-label={label(locale, "Sakrij grešku", "Dismiss error")}><X className="size-3.5" /></button></div> : null}
        {replyTo ? <div className="mb-2 flex items-center gap-2 rounded-[8px] border-l-4 border-ink bg-paper px-3 py-2 text-xs font-bold"><Reply className="size-4" /><span className="min-w-0 flex-1 truncate">{replyTo.sender?.name}: {replyTo.body}</span><button type="button" onClick={() => setReplyTo(null)} aria-label={label(locale, "Otkaži odgovor", "Cancel reply")}><X className="size-4" /></button></div> : null}
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImages || preparedImages.length >= 4} className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-white disabled:opacity-40" aria-label={label(locale, "Dodaj slike", "Add images")}>{uploadingImages ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}</button>
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { if (event.target.files?.length) void processImageFiles(event.target.files); event.currentTarget.value = ""; }} />
          <label className="min-w-0 flex-1 rounded-[16px] border-2 border-ink bg-paper px-3 py-2 focus-within:bg-white">
            <span className="sr-only">{label(locale, "Poruka", "Message")}</span>
            <textarea value={body} onChange={(event) => { setBody(event.target.value); const now = Date.now(); if (now - typingAtRef.current > 2500) { typingAtRef.current = now; void setTyping({ conversationId }).catch(() => undefined); } }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={1} placeholder={label(locale, "Napiši poruku…", "Write a message…")} className="max-h-32 min-h-6 w-full resize-none bg-transparent text-sm font-semibold leading-6 outline-none" />
          </label>
          <button type="button" onClick={() => void submit()} disabled={sending || (!body.trim() && !preparedImages.length)} className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-yellow disabled:opacity-40" aria-label={label(locale, "Pošalji", "Send")}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button>
        </div>
        <p className="mt-2 px-12 text-center text-[9px] font-bold text-muted">{label(locale, "Poruke nisu end-to-end enkriptovane.", "Messages are not end-to-end encrypted.")}</p>
      </div> : null}
      {reportTarget ? <ReportDialog locale={locale} target={reportTarget} onClose={() => setReportTarget(undefined)} /> : null}
      {groupSettingsOpen ? <GroupSettingsDialog locale={locale} conversation={conversation} onClose={() => setGroupSettingsOpen(false)} onExit={exitConversation} /> : null}
    </section>
  );
}

export function MessagesShell({ locale, selectedConversationId }: { locale: Locale; selectedConversationId?: string }) {
  const router = useRouter();
  const selected = selectedConversationId as Id<"chatConversations"> | undefined;
  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] min-h-[560px] max-w-[1500px] min-w-0 gap-4 lg:h-[calc(100vh-4rem)]">
      <div className={cn("min-w-0 flex-1 xl:max-w-[410px]", selected && "hidden xl:flex")}><InboxPane locale={locale} selectedConversationId={selectedConversationId} /></div>
      <div className={cn("min-w-0 flex-[1.7]", !selected && "hidden xl:flex")}>
        {selected ? <ConversationPanel key={selected} locale={locale} conversationId={selected} onBack={() => router.push(withLocale(locale, "/app/messages"))} /> : <div className="grid h-full flex-1 place-items-center rounded-[16px] border-2 border-dashed border-line bg-white p-8 text-center"><div><MessageCircle className="mx-auto size-12 text-muted" /><h2 className="mt-4 font-display text-3xl">{label(locale, "Izaberi razgovor", "Choose a conversation")}</h2><p className="mt-2 text-sm font-bold text-muted">{label(locale, "Poruke, requesti i grupe ostaju na jednom mestu.", "Messages, requests and groups stay in one place.")}</p></div></div>}
      </div>
    </div>
  );
}
