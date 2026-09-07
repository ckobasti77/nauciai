"use client";

import { Bell, BellOff, Inbox, MessageCircle, Pin, Search, Settings2, Users, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationSnapshot,
  notificationMasterState,
  preferenceSnapshot,
  restoredPreferences,
  silencedPreferences,
  toggledChannel,
} from "@/lib/notification-preferences";

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
          <span className={cn("min-w-0 flex-1 truncate type-body-sm", item.unreadCount ? "font-black" : "font-bold")}>{name}</span>
          <span className="shrink-0 type-caption font-bold text-muted">{relativeTime(locale, item.lastMessageAt)}</span>
        </span>
        <span className="mt-1 flex min-h-4 items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate type-caption", item.unreadCount ? "font-black text-ink" : "font-semibold text-muted")}>{preview}</span>
          {item.isPinned ? <Pin className="size-3.5 shrink-0 fill-current" /> : null}
          {item.mutedUntil && (item.mutedUntil === -1 || item.mutedUntil > renderedAt) ? <BellOff className="size-3.5 shrink-0 text-muted" /> : null}
          {item.unreadCount ? <span className="grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 font-mono text-[10px] font-black text-white">{item.unreadCount > 99 ? "99+" : item.unreadCount}</span> : null}
        </span>
        <span className="mt-1 flex min-h-4 items-center gap-2 type-eyebrow-sm text-muted">
          <span>{item.kind === "group" ? label(locale, "Grupni razgovor", "Group chat") : item.kind === "support" ? label(locale, "Podrška", "Support") : label(locale, "Jedan na jedan", "One to one")}</span>
          {item.requestStatus === "pending" || item.memberStatus === "invited" ? <span className="inline-flex rounded-full border border-ink bg-paper px-2 py-0.5 type-caption text-ink">{item.memberStatus === "invited" ? label(locale, "Poziv u grupu", "Group invite") : label(locale, "Zahtev za poruku", "Message request")}</span> : null}
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

/**
 * Snimak stanja pre gasenja zvona. Shema nema polje za njega, a i ne treba joj:
 * ovo je udobnost jednog uredjaja (isti obrazac kao `SoundToggle`). Kad snimka nema
 * — drugi browser, ocisceno skladiste — paljenje pali sve, sto je bezbedan ishod.
 */
const NOTIFICATION_SNAPSHOT_KEY = "nauciai-notifications-snapshot";

function readNotificationSnapshot(): NotificationSnapshot | null {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as NotificationSnapshot) : null;
  } catch {
    return null;
  }
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

  const master = notificationMasterState(preferences ?? []);

  async function togglePreference(preference: NotificationPreference, key: NotificationChannel) {
    const next = toggledChannel(preference, key);
    await updatePreference({ category: next.category, inApp: next.inApp, push: next.push, sound: next.sound });
  }

  // Zvono NIJE zaseban prekidac nego pogled na iste redove: gasenje ih sve gasi (uz
  // snimak), paljenje vraca zapamceno stanje. Zato se ne mogu razici.
  async function toggleMaster() {
    if (!preferences) return;
    const next =
      notificationMasterState(preferences) === "none"
        ? restoredPreferences(preferences, readNotificationSnapshot())
        : silencedPreferences(preferences);
    if (notificationMasterState(preferences) !== "none") {
      try {
        window.localStorage.setItem(NOTIFICATION_SNAPSHOT_KEY, JSON.stringify(preferenceSnapshot(preferences)));
      } catch {
        // Privatni rezim bez skladista — gasenje i dalje radi, samo se ne pamti.
      }
    }
    await Promise.all(
      next.map((row) =>
        updatePreference({ category: row.category, inApp: row.inApp, push: row.push, sound: row.sound }),
      ),
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" className="grid size-11 place-items-center rounded-full border-2 border-ink bg-paper-strong" aria-label={label(locale, "Podešavanja obaveštenja", "Notification settings")}><Settings2 className="size-4" /></button>
      {open ? (
        // Sirina je IZMERENA iz sadrzaja, ne birana: tri kanala stoje u mrezi od tri
        // jednake kolone i popunjavaju red do kraja. Najduzi kanal je „U aplikaciji"
        // (63,9px u Nunito 900/12px) + 13,6 padding/okvir = 78px po koloni; 3 x 78
        // + 8 razmaka + 17,6 (kartica) + 23,2 (panel) = 283px -> 18rem sa predahom.
        // Staro 22rem je ostavljalo ~70px praznine desno.
        <div role="dialog" aria-label={label(locale, "Podešavanja obaveštenja", "Notification settings")} className="absolute right-0 top-13 z-40 w-[min(18rem,calc(100vw-2rem))] rounded-[16px] border-2 border-ink bg-paper-strong p-2.5 shadow-[8px_8px_0_0_var(--shadow-hard-14)]">
          <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-black">{label(locale, "Obaveštenja", "Notifications")}</p><button type="button" onClick={() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }} className="grid size-8 shrink-0 place-items-center rounded-full border border-line" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button></div>
          {preferences === undefined ? <div className="grid min-h-24 place-items-center"><Spinner size="md" /></div> : (
            <div className="space-y-1.5">
              {/* Glavno zvono: izvedeno iz redova ispod, nikad zaseban prekidac.
                  `aria-pressed="mixed"` nosi „delimicno" i za citace ekrana. */}
              <button
                type="button"
                aria-pressed={master === "none" ? false : master === "all" ? true : "mixed"}
                onClick={() => void toggleMaster()}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-[12px] border-2 border-ink px-2 text-left transition",
                  master === "all" ? "bg-ink text-paper-strong" : master === "partial" ? "bg-yellow text-ink" : "bg-paper text-ink",
                )}
              >
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border border-ink", master === "all" ? "bg-paper-strong text-ink" : "bg-paper-strong text-ink")}>
                  {master === "none" ? <BellOff className="size-3.5" /> : <Bell className={cn("size-3.5", master === "all" && "fill-current")} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black">{label(locale, "Sva obaveštenja", "All notifications")}</span>
                  <span className={cn("block truncate type-caption font-bold", master === "all" ? "text-paper-strong/80" : "text-muted")}>
                    {master === "all" ? label(locale, "Sve uključeno", "All on") : master === "partial" ? label(locale, "Delimično uključeno", "Partly on") : label(locale, "Sve isključeno", "All off")}
                  </span>
                </span>
              </button>
              {preferences.map((preference) => (
                <div key={preference.category} className="rounded-[12px] border border-line bg-paper p-2">
                  <p className="text-xs font-black">{notificationCategoryLabel(locale, preference.category)}</p>
                  <div className="mt-1.5 grid grid-cols-3 gap-1">{NOTIFICATION_CHANNELS.map((key) => {
                    const active = preference[key];
                    const text = key === "inApp" ? label(locale, "U aplikaciji", "In app") : key === "push" ? "Push" : label(locale, "Zvuk", "Sound");
                    return <button key={key} type="button" aria-pressed={active} onClick={() => void togglePreference(preference, key)} className={cn("min-w-0 truncate rounded-full border border-ink px-1.5 py-1 text-center type-caption font-black", active ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink")}>{text}</button>;
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
      {memberRows.length || memberSearch.status === "CanLoadMore" || memberSearch.status === "LoadingMore" ? <div className="space-y-3 border-b-2 border-line pb-3">
        <p className="px-1 type-eyebrow-sm text-muted">{label(locale, "Ljudi", "People")}</p>
        {memberRows.map((member) => <button key={member.userId} type="button" disabled={Boolean(creatingUserId)} onClick={() => void startDirect(member.userId)} className="flex w-full items-center gap-3 rounded-[16px] border-2 border-line bg-paper-strong p-3 text-left transition hover:border-ink disabled:opacity-60"><Avatar src={member.avatarUrl} name={member.name} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{member.name}</span>{member.username ? <span className="block truncate type-caption font-bold text-muted">@{member.username}</span> : null}</span>{creatingUserId === member.userId ? <Spinner /> : <MessageCircle className="size-4" />}</button>)}
        {memberSearch.status === "CanLoadMore" ? <Button variant="secondary" size="sm" onClick={() => memberSearch.loadMore(8)} className="w-full">{label(locale, "Učitaj još ljudi", "Load more people")}</Button> : null}
      </div> : null}
      {conversationRows.length || conversationSearch.status === "CanLoadMore" || conversationSearch.status === "LoadingMore" ? <div className="space-y-2">
        <p className="px-1 type-eyebrow-sm text-muted">{label(locale, "Razgovori", "Conversations")}</p>
        {conversationRows.map((item) => <InboxRow key={String(item.conversationId)} locale={locale} item={item} selected={selectedConversationId === String(item.conversationId)} />)}
        {conversationSearch.status === "CanLoadMore" ? <Button variant="secondary" size="sm" onClick={() => conversationSearch.loadMore(20)} className="w-full">{label(locale, "Učitaj još razgovora", "Load more conversations")}</Button> : null}
      </div> : null}
      {loading ? <div className="grid min-h-36 place-items-center"><Spinner size="lg" /></div> : null}
      {exhausted && !conversationRows.length && !memberRows.length ? <EmptyState
        className="min-h-52"
        icon={Inbox}
        title={label(locale, "Nema nikoga za ovu pretragu", "Nothing matches this search")}
        body={label(locale, "Nijedan razgovor ni član ne odgovara onome što si upisao/la. Obriši reč iz pretrage ili kreni od nekog novog.", "No conversation or member matches what you typed. Clear the search word, or start with someone new.")}
        action={<div className="flex flex-wrap justify-center gap-2"><Button size="sm" onClick={onStartConversation}>{label(locale, "Započni razgovor", "Start a conversation")}</Button><Button variant="secondary" size="sm" onClick={onOpenStudy}>{label(locale, "Pronađi partnera", "Find a study partner")}</Button></div>}
      /> : null}
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
    <section data-chat-motion-surface="inbox" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] border-2 border-ink bg-paper shadow-[5px_5px_0_0_var(--shadow-hard-12)]">
      <div className="border-b-2 border-ink bg-paper-strong p-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="type-eyebrow-sm text-blue-mid dark:text-muted">{label(locale, "Poruke", "Messages")}</p><h2 className="type-h3 text-ink">{label(locale, "Razgovori", "Conversations")}</h2></div>
          <div className="flex gap-2"><PushNotificationButton locale={locale} /><NotificationPreferencesPopover locale={locale} /><button type="button" onClick={() => setNewConversationOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black" aria-label={label(locale, "Novi razgovor", "New conversation")}><MessageCircle className="size-4" /><span className="hidden 2xl:inline">{label(locale, "Novi", "New")}</span></button></div>
        </div>
        <label className="mt-4 flex h-11 items-center gap-2 rounded-full border-2 border-line bg-paper px-4 focus-within:border-ink"><Search className="size-4 text-muted" /><span className="sr-only">{label(locale, "Pretraži ljude i razgovore", "Search people and conversations")}</span><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder={label(locale, "Ljudi i razgovori", "People and conversations")} className="min-w-0 flex-1 bg-transparent text-sm font-bold placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" />{draftQuery ? <button type="button" onClick={() => { setDraftQuery(""); onQueryChange(""); }} aria-label={label(locale, "Obriši pretragu", "Clear search")}><X className="size-4" /></button> : null}</label>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-3" role="tablist" aria-label={label(locale, "Filter razgovora", "Conversation filter")}>{sections.map((item) => <button key={item.value} type="button" role="tab" aria-selected={section === item.value} onClick={() => onSectionChange(item.value)} className={cn("min-w-0 rounded-full border-2 border-ink px-2 py-1.5 type-caption font-black", section === item.value ? "bg-ink text-paper-strong" : "bg-paper-strong text-ink")}>{locale === "sr" ? item.sr : item.en}{badgeFor(item) ? <span className={cn("ml-1 rounded-full px-1.5 font-mono type-caption", section === item.value ? "bg-yellow text-ink" : "bg-ink text-paper-strong")}>{badgeFor(item) > 99 ? "99+" : badgeFor(item)}</span> : null}</button>)}</div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {/* Stable key: keying the boundary on the query text remounted the whole
            result tree on every keystroke. */}
        {normalizedQuery.length >= 2 ? <GlobalSearchErrorBoundary key="global-search" locale={locale}><GlobalSearchResults locale={locale} query={draftQuery.trim()} section={section} selectedConversationId={selectedConversationId} onStartConversation={() => setNewConversationOpen(true)} onOpenStudy={onOpenStudy} /></GlobalSearchErrorBoundary> : <>
          {pinnedRows.length || pinnedInbox.status === "CanLoadMore" ? <div className="space-y-3 border-b-2 border-line pb-3"><p className="px-1 type-eyebrow-sm text-muted">{label(locale, "Zakačeni", "Pinned")}</p>{pinnedRows.map((item) => <InboxRow key={`pinned:${item.conversationId}`} locale={locale} item={item} selected={selectedConversationId === String(item.conversationId)} />)}{pinnedInbox.status === "CanLoadMore" ? <Button variant="secondary" size="sm" onClick={() => pinnedInbox.loadMore(12)} className="w-full">{label(locale, "Učitaj još zakačenih", "Load more pinned")}</Button> : null}</div> : null}
          {/* Keyed by conversation alone: folding the sequence into the key
              remounted the row on every new message and stole keyboard focus. */}
          {rows.map((item: InboxItem | InboxRowItem) => <InboxRow key={String(item.conversationId)} locale={locale} item={item} selected={selectedConversationId === String(item.conversationId)} />)}
          {!hasConversationRows && inbox.status !== "LoadingFirstPage" && pinnedInbox.status !== "LoadingFirstPage" ? <EmptyState className="min-h-52" icon={Inbox} title={label(locale, "Ovde je za sada mirno.", "It is quiet here for now.")} body={label(locale, "Nemaš nijedan razgovor. Započni prvi ili pronađi nekoga s kim ćeš učiti.", "You have no conversations yet. Start the first one, or find someone to study with.")} action={<div className="flex flex-wrap justify-center gap-2"><Button size="sm" onClick={() => setNewConversationOpen(true)}>{label(locale, "Započni razgovor", "Start a conversation")}</Button><Button variant="secondary" size="sm" onClick={onOpenStudy}>{label(locale, "Pronađi partnera", "Find a study partner")}</Button></div>} /> : null}
          {inbox.status === "LoadingFirstPage" ? <div className="grid min-h-52 place-items-center"><Spinner size="xl" /></div> : null}
          {inbox.status === "CanLoadMore" ? <Button variant="secondary" size="sm" onClick={() => inbox.loadMore(20)} className="w-full">{label(locale, "Učitaj još", "Load more")}</Button> : null}
        </>}
      </div>
      {newConversationOpen ? <NewConversationDialog locale={locale} onClose={() => setNewConversationOpen(false)} /> : null}
    </section>
  );
}
