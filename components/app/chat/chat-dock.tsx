/* eslint-disable @next/next/no-img-element -- Convex storage URLs are signed and dynamic. */
"use client";

import { ChevronUp, MessageCircle, Volume2, VolumeX, X } from "lucide-react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ConversationPanel } from "@/components/app/chat/messages-shell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

const DEVICE_KEY = "nauciai-chat-device";
const LOCAL_DOCK_KEY = "nauciai-chat-dock";
const SOUND_KEY = "nauciai-chat-sound";

type DockSnapshot = {
  openConversationIds: Array<Id<"chatConversations">>;
  minimizedConversationIds: Array<Id<"chatConversations">>;
};

type InboxItem = NonNullable<FunctionReturnType<typeof api.chat.listInboxPage>["page"][number]>;

function copy(locale: Locale, sr: string, en: string) {
  return locale === "sr" ? sr : en;
}

function uniqueIds(ids: Array<Id<"chatConversations">>) {
  return [...new Map(ids.map((id) => [String(id), id])).values()];
}

function DockAvatar({ conversationId, locale, onRestore }: { conversationId: Id<"chatConversations">; locale: Locale; onRestore: () => void }) {
  const conversation = useQuery(api.chat.getConversation, { conversationId });
  const title = conversation?.conversation.title || conversation?.members.find((member) => String(member.userId) !== String(conversation.viewer.userId))?.name || copy(locale, "Razgovor", "Conversation");
  const imageUrl = conversation?.conversation.imageUrl || conversation?.members.find((member) => String(member.userId) !== String(conversation.viewer.userId))?.avatarUrl;
  const initials = title.split(/\s+/).map((part: string) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "AI";
  return (
    <button type="button" onClick={onRestore} aria-label={`${copy(locale, "Otvori", "Open")} ${title}`} className="grid size-12 place-items-center overflow-hidden rounded-full border-2 border-ink bg-yellow text-xs font-black shadow-[3px_3px_0_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
      {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : initials}
    </button>
  );
}

function playQuietPing() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.setValueAtTime(660, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.13);
  oscillator.addEventListener("ended", () => void context.close());
}

export function openChatDock(conversationId: Id<"chatConversations">) {
  window.dispatchEvent(new CustomEvent("nauciai:open-chat", { detail: { conversationId } }));
}

export function ChatDock({ locale }: { locale: Locale }) {
  const [deviceId, setDeviceId] = useState<string>();
  const [openIds, setOpenIds] = useState<Array<Id<"chatConversations">>>([]);
  const [minimizedIds, setMinimizedIds] = useState<Array<Id<"chatConversations">>>([]);
  const [capacity, setCapacity] = useState(2);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toast, setToast] = useState<InboxItem | null>(null);
  const hydratedRef = useRef(false);
  const unreadRef = useRef<number | null>(null);
  const serverState = useQuery(api.chat.getDockState, deviceId ? { deviceId } : "skip");
  const saveDockState = useMutation(api.chat.saveDockState);
  const summary = useQuery(api.chat.getInboxSummary, {});
  const notificationPreferences = useQuery(api.chat.getNotificationPreferences, {});
  const unreadInbox = usePaginatedQuery(api.chat.listInboxPage, { section: "unread" }, { initialNumItems: 5 });
  const chatPreference = notificationPreferences?.find((preference) => preference.category === "chat");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let value = window.localStorage.getItem(DEVICE_KEY);
      if (!value) {
        value = crypto.randomUUID();
        window.localStorage.setItem(DEVICE_KEY, value);
      }
      setDeviceId(value);
      setSoundEnabled(window.localStorage.getItem(SOUND_KEY) !== "off");
      try {
        const local = JSON.parse(window.localStorage.getItem(LOCAL_DOCK_KEY) || "null") as DockSnapshot | null;
        if (local) {
          setOpenIds(uniqueIds(local.openConversationIds).slice(-20));
          setMinimizedIds(uniqueIds(local.minimizedConversationIds).slice(-20));
        }
      } catch {
        window.localStorage.removeItem(LOCAL_DOCK_KEY);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (serverState === undefined || hydratedRef.current) return;
    hydratedRef.current = true;
    if (!serverState) return;
    const frame = window.requestAnimationFrame(() => {
      setOpenIds(uniqueIds(serverState.openConversationIds).slice(-20));
      setMinimizedIds(uniqueIds(serverState.minimizedConversationIds).slice(-20));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [serverState]);

  useEffect(() => {
    const resize = () => setCapacity(Math.max(1, Math.min(4, Math.floor((window.innerWidth - 120) / 350))));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const persist = useCallback((nextOpen: Array<Id<"chatConversations">>, nextMinimized: Array<Id<"chatConversations">>) => {
    const snapshot = { openConversationIds: uniqueIds(nextOpen).slice(-20), minimizedConversationIds: uniqueIds(nextMinimized).slice(-20) };
    window.localStorage.setItem(LOCAL_DOCK_KEY, JSON.stringify(snapshot));
    if (deviceId) void saveDockState({ deviceId, ...snapshot }).catch(() => undefined);
  }, [deviceId, saveDockState]);

  useEffect(() => {
    function handleOpen(event: Event) {
      const conversationId = (event as CustomEvent<{ conversationId?: Id<"chatConversations"> }>).detail?.conversationId;
      if (!conversationId) return;
      setOpenIds((current) => {
        const next = [...current.filter((id) => id !== conversationId), conversationId].slice(-20);
        setMinimizedIds((minimized) => {
          const nextMinimized = minimized.filter((id) => id !== conversationId);
          persist(next, nextMinimized);
          return nextMinimized;
        });
        return next;
      });
    }
    window.addEventListener("nauciai:open-chat", handleOpen);
    return () => window.removeEventListener("nauciai:open-chat", handleOpen);
  }, [persist]);

  useEffect(() => {
    if (summary === undefined) return;
    if (unreadRef.current === null) {
      unreadRef.current = summary.totalUnread;
      return;
    }
    if (summary.totalUnread > unreadRef.current && document.visibilityState === "visible") {
      const latest = unreadInbox.results[0];
      if (latest) {
        if (soundEnabled && chatPreference?.sound !== false && (!latest.mutedUntil || latest.mutedUntil < Date.now())) playQuietPing();
        const showTimer = chatPreference?.inApp === false ? undefined : window.setTimeout(() => setToast(latest), 0);
        const hideTimer = window.setTimeout(() => setToast((current) => current?.conversationId === latest.conversationId ? null : current), 4500);
        unreadRef.current = summary.totalUnread;
        return () => {
          if (showTimer !== undefined) window.clearTimeout(showTimer);
          window.clearTimeout(hideTimer);
        };
      }
    }
    unreadRef.current = summary.totalUnread;
  }, [chatPreference?.inApp, chatPreference?.sound, soundEnabled, summary, unreadInbox.results]);

  function minimize(conversationId: Id<"chatConversations">) {
    const nextMinimized = uniqueIds([...minimizedIds, conversationId]);
    setMinimizedIds(nextMinimized);
    persist(openIds, nextMinimized);
  }

  function restore(conversationId: Id<"chatConversations">) {
    const nextOpen = uniqueIds([...openIds.filter((id) => id !== conversationId), conversationId]);
    const nextMinimized = minimizedIds.filter((id) => id !== conversationId);
    setOpenIds(nextOpen);
    setMinimizedIds(nextMinimized);
    persist(nextOpen, nextMinimized);
  }

  function close(conversationId: Id<"chatConversations">) {
    const nextOpen = openIds.filter((id) => id !== conversationId);
    const nextMinimized = minimizedIds.filter((id) => id !== conversationId);
    setOpenIds(nextOpen);
    setMinimizedIds(nextMinimized);
    persist(nextOpen, nextMinimized);
  }

  function minimizeAll() {
    const nextMinimized = uniqueIds([...minimizedIds, ...openIds]);
    setMinimizedIds(nextMinimized);
    persist(openIds, nextMinimized);
  }

  const activeIds = openIds.filter((id) => !minimizedIds.includes(id));
  const visibleIds = activeIds.slice(-capacity);
  const automaticOverflow = activeIds.slice(0, Math.max(0, activeIds.length - capacity));
  const circleIds = uniqueIds([...minimizedIds, ...automaticOverflow]);
  const visibleCircles = circleIds.slice(-5);
  const hiddenCircles = circleIds.slice(0, Math.max(0, circleIds.length - 5));

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] hidden lg:block" aria-live="polite">
      {toast ? <div className="pointer-events-auto absolute right-5 top-5 w-[min(360px,calc(100vw-2.5rem))] rounded-[16px] border-2 border-ink bg-white p-3 shadow-[7px_7px_0_0_rgba(14,49,88,0.16)] transition-[opacity,transform] duration-200 motion-reduce:translate-y-0 motion-reduce:transition-opacity motion-reduce:duration-100">
        <div className="flex items-start gap-3"><MessageCircle className="mt-1 size-5 shrink-0" /><button type="button" onClick={() => { restore(toast.conversationId); setToast(null); }} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-black">{toast.title || toast.counterpart?.name || copy(locale, "Nova poruka", "New message")}</p><p className="mt-1 line-clamp-2 text-xs font-bold text-muted">{toast.lastMessage?.body}</p></button><button type="button" onClick={() => setToast(null)} className="grid size-8 place-items-center rounded-full border border-line" aria-label={copy(locale, "Zatvori", "Close")}><X className="size-4" /></button></div>
      </div> : null}

      {visibleIds.map((conversationId, index) => (
        <div key={conversationId} className="pointer-events-auto absolute bottom-5 h-[min(520px,calc(100vh-40px))] w-[330px] overflow-hidden rounded-[16px] border-2 border-ink bg-white shadow-[8px_8px_0_0_rgba(14,49,88,0.18)]" style={{ right: 84 + index * 342 }}>
          <ConversationPanel locale={locale} conversationId={conversationId} compact onMinimize={() => minimize(conversationId)} onClose={() => close(conversationId)} />
        </div>
      ))}

      <div className="pointer-events-auto absolute bottom-5 right-5 flex flex-col items-end gap-2">
        {overflowOpen && hiddenCircles.length ? <div className="mb-1 max-h-72 space-y-2 overflow-y-auto rounded-[16px] border-2 border-ink bg-white p-2 shadow-xl">{hiddenCircles.map((conversationId) => <DockAvatar key={conversationId} conversationId={conversationId} locale={locale} onRestore={() => { restore(conversationId); setOverflowOpen(false); }} />)}</div> : null}
        {visibleCircles.map((conversationId) => <DockAvatar key={conversationId} conversationId={conversationId} locale={locale} onRestore={() => restore(conversationId)} />)}
        {hiddenCircles.length ? <button type="button" onClick={() => setOverflowOpen((value) => !value)} className="grid size-12 place-items-center rounded-full border-2 border-ink bg-white text-xs font-black shadow-[3px_3px_0_0_rgba(14,49,88,0.18)]" aria-label={copy(locale, "Još razgovora", "More conversations")}>+{hiddenCircles.length}</button> : null}
        <button type="button" onClick={minimizeAll} className="relative grid size-14 place-items-center rounded-full border-2 border-ink bg-yellow shadow-[4px_4px_0_0_rgba(14,49,88,0.2)]" aria-label={copy(locale, "Minimizuj sve razgovore", "Minimize all conversations")}><MessageCircle className="size-6" />{summary?.totalUnread ? <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full border-2 border-ink bg-red-600 px-1 text-[10px] font-black text-white">{summary.totalUnread > 99 ? "99+" : summary.totalUnread}</span> : null}</button>
        <div className="flex gap-1 rounded-full border-2 border-ink bg-white p-1 shadow-md">
          <Link href={withLocale(locale, "/app/messages")} className="grid size-8 place-items-center rounded-full hover:bg-paper" aria-label={copy(locale, "Otvori Inbox", "Open inbox")}><ChevronUp className="size-4" /></Link>
          <button type="button" onClick={() => { const next = !soundEnabled; setSoundEnabled(next); window.localStorage.setItem(SOUND_KEY, next ? "on" : "off"); }} className="grid size-8 place-items-center rounded-full hover:bg-paper" aria-label={soundEnabled ? copy(locale, "Isključi zvuk", "Disable sound") : copy(locale, "Uključi zvuk", "Enable sound")}>{soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</button>
        </div>
      </div>
    </div>
  );
}
