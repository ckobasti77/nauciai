"use client";

import { BellOff, Inbox, Loader2, MessageCircle, Pin, Search, Settings2, Users, X } from "lucide-react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Component, type ReactNode, useEffect, useRef, useState } from "react";

import { NewConversationDialog } from "@/components/app/chat/chat-dialogs";
import {
  Avatar,
  type CommunityMember,
  type InboxItem,
  type InboxSection,
  type NotificationPreference,
  creationError,
  label,
  relativeTime,
  sections,
} from "@/components/app/chat/chat-shared";
import { PushNotificationButton } from "@/components/app/chat/push-notifications";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

type InboxRowItem = {
  conversationId: Id<"chatConversations">;
  kind: "direct" | "support" | "group";
  title?: string;
  imageUrl?: string | null;
  counterpart?: { name: string; username?: string; avatarUrl?: string | null; activeNow?: boolean; lastSeenAt?: number } | null;
  lastMessage?: { sequence?: number; body?: string; kind: string } | null;
  lastMessageAt?: number;
  unreadCount: number;
  isPinned?: boolean;
  mutedUntil?: number;
  requestStatus?: string;
  memberStatus?: string;
};

function InboxRow({ locale, item, selected }: { locale: Locale; item: InboxRowItem; selected: boolean }) {
  const searchParams = useSearchParams();
  const [renderedAt] = useState(() => Date.now());
  const counterpart = item.counterpart;
  const name = item.title || counterpart?.name || label(locale, "Razgovor", "Conversation");
  const preview = item.lastMessage?.body || (item.lastMessage?.kind === "system" ? label(locale, "Sistemska poruka", "System message") : label(locale, "Još nema poruka", "No messages yet"));
  const preservedParams = new URLSearchParams(searchParams.toString());
  preservedParams.set("view", "conversations");
  preservedParams.delete("course");
  const conversationHref = `${withLocale(locale, `/app/messages/${item.conversationId}`)}?${preservedParams.toString()}`;

  return (
    <Link
      href={conversationHref}
      data-chat-inbox-item
      data-chat-selected={selected ? "true" : "false"}
      className={cn(
        "group flex min-w-0 gap-3 rounded-[16px] border-2 p-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        selected ? "border-ink bg-yellow/25" : "border-line bg-paper-strong hover:border-ink",
      )}
    >
      <div className="relative">
        <Avatar src={item.imageUrl || counterpart?.avatarUrl} name={name} size="lg" />
        {item.kind === "group" ? <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-paper-strong bg-ink text-paper-strong"><Users className="size-3" /></span> : null}
        {item.kind !== "group" && counterpart?.activeNow ? <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-paper-strong bg-emerald-500" title={label(locale, "Aktivan sada", "Active now")} /> : null}
      </div>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", item.unreadCount ? "font-black" : "font-bold")}>{name}</span>
          <span className="shrink-0 font-mono text-[10px] font-bold text-muted">{relativeTime(locale, item.lastMessageAt)}</span>
        </span>
        <span className="mt-1 flex min-h-4 items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-xs", item.unreadCount ? "font-black text-ink" : "font-semibold text-muted")}>{preview}</span>
          {item.isPinned ? <Pin className="size-3.5 shrink-0 fill-current" /> : null}
          {item.mutedUntil && (item.mutedUntil === -1 || item.mutedUntil > renderedAt) ? <BellOff className="size-3.5 shrink-0 text-muted" /> : null}
          {item.unreadCount ? <span className="grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 font-mono text-[10px] font-black text-white">{item.unreadCount > 99 ? "99+" : item.unreadCount}</span> : null}
        </span>
        <span className="mt-1 flex min-h-4 items-center gap-2 text-[9px] font-black uppercase tracking-[0.08em] text-muted">
          <span>{item.kind === "group" ? label(locale, "Grupni razgovor", "Group chat") : item.kind === "support" ? label(locale, "Podrška", "Support") : label(locale, "Jedan na jedan", "One to one")}</span>
          {item.requestStatus === "pending" || item.memberStatus === "invited" ? <span className="inline-flex rounded-full border border-ink bg-paper px-2 py-0.5 text-[9px] text-ink">{item.memberStatus === "invited" ? label(locale, "Poziv u grupu", "Group invite") : label(locale, "Zahtev za poruku", "Message request")}</span> : null}
        </span>
      </span>
    </Link>
  );
}

function notificationCategoryLabel(locale: Locale, category: NotificationPreference["category"]) {
  const labels: Record<NotificationPreference["category"], [string, string]> = {
    chat: ["Poruke", "Messages"],
    requests: ["Zahtevi", "Requests"],
    groups: ["Grupe", "Groups"],
    mentions: ["Pominjanja", "Mentions"],
    study: ["Uči zajedno", "Study together"],
  };
  return labels[category][locale === "sr" ? 0 : 1];
}

function NotificationPreferencesPopover({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const preferences = useQuery(api.chat.getNotificationPreferences, {});
  const updatePreference = useMutation(api.chat.setNotificationPreferences);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function togglePreference(preference: NotificationPreference, key: "inApp" | "push" | "sound") {
    await updatePreference({
      category: preference.category,
      inApp: key === "inApp" ? !preference.inApp : preference.inApp,
      push: key === "push" ? !preference.push : preference.push,
      sound: key === "sound" ? !preference.sound : preference.sound,
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" className="grid size-11 place-items-center rounded-full border-2 border-ink bg-paper-strong" aria-label={label(locale, "Podešavanja obaveštenja", "Notification settings")}><Settings2 className="size-4" /></button>
      {open ? (
        <div role="dialog" aria-label={label(locale, "Podešavanja obaveštenja", "Notification settings")} className="absolute right-0 top-13 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-[16px] border-2 border-ink bg-paper-strong p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm font-black">{label(locale, "Obaveštenja", "Notifications")}</p><button type="button" onClick={() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }} className="grid size-8 place-items-center rounded-full border border-line" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button></div>
          {preferences === undefined ? <div className="grid min-h-24 place-items-center"><Loader2 className="size-5 animate-spin" /></div> : (
            <div className="space-y-2">
              {preferences.map((preference) => (
                <div key={preference.category} className="rounded-[12px] border border-line bg-paper p-2.5">
                  <p className="text-xs font-black">{notificationCategoryLabel(locale, preference.category)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{(["inApp", "push", "sound"] as const).map((key) => {
                    const active = preference[key];
                    const text = key === "inApp" ? label(locale, "U aplikaciji", "In app") : key === "push" ? "Push" : label(locale, "Zvuk", "Sound");
                    return <button key={key} type="button" aria-pressed={active} onClick={() => void togglePreference(preference, key)} className={cn("rounded-full border border-ink px-2.5 py-1 text-[10px] font-black", active ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink")}>{text}</button>;
                  })}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

class GlobalSearchErrorBoundary extends Component<{ children: ReactNode; locale: Locale }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="rounded-[16px] border-2 border-red-400 bg-red-50 p-4 text-center">
        <p className="text-xs font-black text-red-800">{label(this.props.locale, "Pretraga trenutno nije dostupna.", "Search is temporarily unavailable.")}</p>
        <button type="button" onClick={() => this.setState({ hasError: false })} className="mt-3 rounded-full border-2 border-ink bg-paper-strong px-4 py-2 text-xs font-black">{label(this.props.locale, "Pokušaj ponovo", "Try again")}</button>
      </div>
    );
  }
}

function GlobalSearchResults({
  locale,
  query,
  section,
  selectedConversationId,
  onStartConversation,
  onOpenStudy,
}: {
  locale: Locale;
  query: string;
  section: InboxSection;
  selectedConversationId?: string;
  onStartConversation: () => void;
  onOpenStudy: () => void;
}) {
  const router = useRouter();
  const [creatingUserId, setCreatingUserId] = useState<Id<"users">>();
  const [creationMessage, setCreationMessage] = useState<string>();
  const conversationSearch = usePaginatedQuery(api.chat.searchViewerConversationsPage, { query }, { initialNumItems: 20 });
  const memberSearch = usePaginatedQuery(api.community.listMembersPage, { search: query }, { initialNumItems: 8 });
  const createDirect = useMutation(api.chat.createOrGetDirect);
  const conversationRows = conversationSearch.results.filter((item): item is NonNullable<typeof item> => item !== null);
  const memberRows = memberSearch.results.filter(
    (member): member is CommunityMember & { userId: Id<"users"> } => Boolean(member.userId && member.role !== "admin" && member.canFollow),
  );
  const loading = conversationSearch.status === "LoadingFirstPage"
    || conversationSearch.status === "LoadingMore"
    || memberSearch.status === "LoadingFirstPage"
    || memberSearch.status === "LoadingMore";
  const exhausted = conversationSearch.status === "Exhausted" && memberSearch.status === "Exhausted";

  async function startDirect(userId: Id<"users">) {
    setCreatingUserId(userId);
    setCreationMessage(undefined);
    try {
      const result = await createDirect({ recipientId: userId });
      const next = new URLSearchParams();
      next.set("view", "conversations");
      if (section !== "all") next.set("section", section);
      if (query) next.set("q", query);
      router.push(`${withLocale(locale, `/app/messages/${result.conversationId}`)}?${next.toString()}`);
    } catch (error) {
      setCreationMessage(creationError(locale, error));
    } finally {
      setCreatingUserId(undefined);
    }
  }

  return (
    <div className="space-y-3" aria-live="polite">
      {creationMessage ? <p role="alert" className="rounded-[8px] border border-red-400 bg-red-50 px-3 py-2 text-xs font-black text-red-800">{creationMessage}</p> : null}
      {memberRows.length || memberSearch.status === "CanLoadMore" || memberSearch.status === "LoadingMore" ? <div className="space-y-2 border-b-2 border-line pb-3">
        <p className="px-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted">{label(locale, "Ljudi", "People")}</p>
        {memberRows.map((member) => <button key={member.userId} type="button" disabled={Boolean(creatingUserId)} onClick={() => void startDirect(member.userId)} className="flex w-full items-center gap-3 rounded-[16px] border-2 border-line bg-paper-strong p-3 text-left transition hover:border-ink disabled:opacity-60"><Avatar src={member.avatarUrl} name={member.name} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{member.name}</span>{member.username ? <span className="block truncate text-[10px] font-bold text-muted">@{member.username}</span> : null}</span>{creatingUserId === member.userId ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}</button>)}
        {memberSearch.status === "CanLoadMore" ? <button type="button" onClick={() => memberSearch.loadMore(8)} className="w-full rounded-full border border-ink bg-paper-strong px-3 py-2 text-[10px] font-black">{label(locale, "Učitaj još ljudi", "Load more people")}</button> : null}
      </div> : null}
      {conversationRows.length || conversationSearch.status === "CanLoadMore" || conversationSearch.status === "LoadingMore" ? <div className="space-y-2">
        <p className="px-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted">{label(locale, "Razgovori", "Conversations")}</p>
        {conversationRows.map((item) => <InboxRow key={String(item.conversationId)} locale={locale} item={item} selected={selectedConversationId === String(item.conversationId)} />)}
        {conversationSearch.status === "CanLoadMore" ? <button type="button" onClick={() => conversationSearch.loadMore(20)} className="w-full rounded-full border-2 border-ink bg-paper-strong px-4 py-3 text-sm font-black">{label(locale, "Učitaj još razgovora", "Load more conversations")}</button> : null}
      </div> : null}
      {loading ? <div className="grid min-h-36 place-items-center"><Loader2 className="size-6 animate-spin" /></div> : null}
      {exhausted && !conversationRows.length && !memberRows.length ? <div className="grid min-h-52 place-items-center rounded-[16px] border-2 border-dashed border-line bg-paper-strong p-8 text-center"><div><Inbox className="mx-auto size-9 text-muted" /><p className="mt-3 text-sm font-black text-ink">{label(locale, "Nema ljudi ni razgovora za ovu pretragu.", "No people or conversations match this search.")}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" onClick={onStartConversation} className="rounded-full border-2 border-ink bg-yellow px-4 py-2 text-xs font-black">{label(locale, "Započni razgovor", "Start a conversation")}</button><button type="button" onClick={onOpenStudy} className="rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15 px-4 py-2 text-xs font-black">{label(locale, "Pronađi partnera", "Find a study partner")}</button></div></div></div> : null}
    </div>
  );
}

export function InboxPane({
  locale,
  selectedConversationId,
  section,
  query,
  onSectionChange,
  onQueryChange,
  onOpenStudy,
}: {
  locale: Locale;
  selectedConversationId?: string;
  section: InboxSection;
  query: string;
  onSectionChange: (section: InboxSection) => void;
  onQueryChange: (query: string) => void;
  onOpenStudy: () => void;
}) {
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  // The input is local and the URL write is debounced: router.replace on every
  // keystroke re-rendered the whole route ten times for a ten-letter word.
  const [draftQuery, setDraftQuery] = useState(query);
  const [lastUrlQuery, setLastUrlQuery] = useState(query);
  if (lastUrlQuery !== query) {
    setLastUrlQuery(query);
    setDraftQuery(query);
  }
  useEffect(() => {
    if (draftQuery === query) return;
    const timer = window.setTimeout(() => onQueryChange(draftQuery), 250);
    return () => window.clearTimeout(timer);
  }, [draftQuery, onQueryChange, query]);
  const normalizedQuery = draftQuery.trim().toLocaleLowerCase();
  const inbox = usePaginatedQuery(api.chat.listInboxPage, normalizedQuery.length < 2 ? { section } : "skip", { initialNumItems: 20 });
  const pinnedInbox = usePaginatedQuery(api.chat.listPinnedInboxPage, normalizedQuery.length < 2 ? { section } : "skip", { initialNumItems: 12 });
  const summary = useQuery(api.chat.getInboxSummary, {});
  const pinnedRows = normalizedQuery.length < 2 ? pinnedInbox.results.filter((item): item is InboxItem => item !== null) : [];
  const rows = inbox.results.filter((item): item is InboxItem => item !== null && !item.isPinned);
  const hasConversationRows = pinnedRows.length + rows.length > 0;

  function badgeFor(item: (typeof sections)[number]) {
    if (!summary) return 0;
    if (item.value === "unread") return summary.unreadConversations;
    if (item.value === "requests") return summary.pendingRequests + summary.pendingGroupInvites;
    return 0;
  }

  return (
    <section data-chat-motion-surface="inbox" className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[16px] border-2 border-ink bg-paper shadow-[5px_5px_0_0_var(--shadow-hard-12)]">
      <div className="border-b-2 border-ink bg-paper-strong p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2e6f9f] dark:text-muted">{label(locale, "Poruke", "Messages")}</p><h2 className="text-lg font-black leading-none text-ink">{label(locale, "Razgovori", "Conversations")}</h2></div>
          <div className="flex gap-2"><PushNotificationButton locale={locale} /><NotificationPreferencesPopover locale={locale} /><button type="button" onClick={() => setNewConversationOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-3 text-xs font-black" aria-label={label(locale, "Novi razgovor", "New conversation")}><MessageCircle className="size-4" /><span className="hidden 2xl:inline">{label(locale, "Novi", "New")}</span></button></div>
        </div>
        <label className="mt-4 flex h-11 items-center gap-2 rounded-full border-2 border-line bg-paper px-4 focus-within:border-ink"><Search className="size-4 text-muted" /><span className="sr-only">{label(locale, "Pretraži ljude i razgovore", "Search people and conversations")}</span><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder={label(locale, "Ljudi i razgovori", "People and conversations")} className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-muted" />{draftQuery ? <button type="button" onClick={() => { setDraftQuery(""); onQueryChange(""); }} aria-label={label(locale, "Obriši pretragu", "Clear search")}><X className="size-4" /></button> : null}</label>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-3" role="tablist" aria-label={label(locale, "Filter razgovora", "Conversation filter")}>{sections.map((item) => <button key={item.value} type="button" role="tab" aria-selected={section === item.value} onClick={() => onSectionChange(item.value)} className={cn("min-w-0 rounded-full border-2 border-ink px-2 py-1.5 text-[10px] font-black sm:text-[11px]", section === item.value ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink")}>{locale === "sr" ? item.sr : item.en}{badgeFor(item) ? <span className={cn("ml-1 rounded-full px-1.5 font-mono text-[9px]", section === item.value ? "bg-yellow text-ink" : "bg-ink text-paper-strong")}>{badgeFor(item) > 99 ? "99+" : badgeFor(item)}</span> : null}</button>)}</div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
        {/* Stable key: keying the boundary on the query text remounted the whole
            result tree on every keystroke. */}
        {normalizedQuery.length >= 2 ? <GlobalSearchErrorBoundary key="global-search" locale={locale}><GlobalSearchResults locale={locale} query={draftQuery.trim()} section={section} selectedConversationId={selectedConversationId} onStartConversation={() => setNewConversationOpen(true)} onOpenStudy={onOpenStudy} /></GlobalSearchErrorBoundary> : <>
          {pinnedRows.length || pinnedInbox.status === "CanLoadMore" ? <div className="space-y-2 border-b-2 border-line pb-3"><p className="px-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted">{label(locale, "Zakačeni", "Pinned")}</p>{pinnedRows.map((item) => <InboxRow key={`pinned:${item.conversationId}`} locale={locale} item={item} selected={selectedConversationId === String(item.conversationId)} />)}{pinnedInbox.status === "CanLoadMore" ? <button type="button" onClick={() => pinnedInbox.loadMore(12)} className="w-full rounded-full border border-ink bg-paper-strong px-3 py-2 text-[10px] font-black">{label(locale, "Učitaj još zakačenih", "Load more pinned")}</button> : null}</div> : null}
          {/* Keyed by conversation alone: folding the sequence into the key
              remounted the row on every new message and stole keyboard focus. */}
          {rows.map((item: InboxItem | InboxRowItem) => <InboxRow key={String(item.conversationId)} locale={locale} item={item} selected={selectedConversationId === String(item.conversationId)} />)}
          {!hasConversationRows && inbox.status !== "LoadingFirstPage" && pinnedInbox.status !== "LoadingFirstPage" ? <div className="grid min-h-52 place-items-center rounded-[16px] border-2 border-dashed border-line bg-paper-strong p-8 text-center"><div><Inbox className="mx-auto size-9 text-muted" /><p className="mt-3 text-sm font-black text-ink">{label(locale, "Ovde je za sada mirno.", "It is quiet here for now.")}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => setNewConversationOpen(true)} className="rounded-full border-2 border-ink bg-yellow px-4 py-2 text-xs font-black">{label(locale, "Započni razgovor", "Start a conversation")}</button><button type="button" onClick={onOpenStudy} className="rounded-full border-2 border-ink bg-[#d7e9f5] dark:bg-ink/15 px-4 py-2 text-xs font-black">{label(locale, "Pronađi partnera", "Find a study partner")}</button></div></div></div> : null}
          {inbox.status === "LoadingFirstPage" ? <div className="grid min-h-52 place-items-center"><Loader2 className="size-7 animate-spin" /></div> : null}
          {inbox.status === "CanLoadMore" ? <button type="button" onClick={() => inbox.loadMore(20)} className="w-full rounded-full border-2 border-ink bg-paper-strong px-4 py-3 text-sm font-black">{label(locale, "Učitaj još", "Load more")}</button> : null}
        </>}
      </div>
      {newConversationOpen ? <NewConversationDialog locale={locale} onClose={() => setNewConversationOpen(false)} /> : null}
    </section>
  );
}
