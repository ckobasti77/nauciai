"use client";

import { MessageCircle, X } from "lucide-react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useChatMotionScope } from "@/components/app/chat/chat-motion";
import { openChatDock } from "@/components/app/chat/chat-dock";
import { type InboxItem, label } from "@/components/app/chat/chat-shared";
import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

const SOUND_KEY = "nauciai-chat-sound";

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

/**
 * Owns the in-app toast and audio ping for every route and every breakpoint.
 * This used to live inside ChatDock, which returns null on /app/messages and is
 * `hidden lg:block` — so a message in another conversation was silent both while
 * you were on the messages page and on any screen under 1024px.
 */
export function ChatNotifications({ locale }: { locale: Locale }) {
  const motionRootRef = useChatMotionScope<HTMLDivElement>("chat-notifications");
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<InboxItem | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const unreadRef = useRef<number | null>(null);
  const summary = useQuery(api.chat.getInboxSummary, {});
  const notificationPreferences = useQuery(api.chat.getNotificationPreferences, {});
  const unreadInbox = usePaginatedQuery(api.chat.listInboxPage, { section: "unread" }, { initialNumItems: 5 });
  const chatPreference = notificationPreferences?.find((preference) => preference.category === "chat");

  // Deferred a frame like the dock does, so the localStorage read never runs
  // during SSR or as a synchronous cascade out of the effect body.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSoundEnabled(window.localStorage.getItem(SOUND_KEY) !== "off"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (summary === undefined) return;
    if (unreadRef.current === null) {
      unreadRef.current = summary.totalUnread;
      return;
    }
    if (summary.totalUnread > unreadRef.current && document.visibilityState === "visible") {
      const latest = unreadInbox.results[0];
      // Never toast for the thread already on screen: the arrival and the
      // markRead that follows it race, and the loser is a phantom toast.
      const alreadyOpen = latest ? pathname.includes(String(latest.conversationId)) : false;
      if (latest && !alreadyOpen) {
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
  }, [chatPreference?.inApp, chatPreference?.sound, pathname, soundEnabled, summary, unreadInbox.results]);

  function openToastConversation(conversationId: InboxItem["conversationId"]) {
    setToast(null);
    // The dock is desktop-only and absent on the messages route, so anywhere it
    // cannot take over we navigate instead of trying to pop a panel.
    if (window.innerWidth < 1024 || /\/app\/messages(?:\/|$)/.test(pathname)) {
      router.push(withLocale(locale, `/app/messages/${conversationId}`));
      return;
    }
    openChatDock(conversationId);
  }

  return (
    <div ref={motionRootRef} className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite" data-chat-motion-scope="notifications">
      {toast ? <div data-chat-motion="dock-toast" data-chat-motion-new="true" className={cn(
        "pointer-events-auto absolute rounded-[16px] border-2 border-ink bg-white p-3 shadow-[7px_7px_0_0_rgba(14,49,88,0.16)] transition-[opacity,transform] duration-200 motion-reduce:translate-y-0 motion-reduce:transition-opacity motion-reduce:duration-100",
        "inset-x-4 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] lg:inset-x-auto lg:bottom-auto lg:right-5 lg:top-5 lg:w-[min(360px,calc(100vw-2.5rem))]",
      )}>
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-1 size-5 shrink-0" />
          <button type="button" onClick={() => openToastConversation(toast.conversationId)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-black">{toast.title || toast.counterpart?.name || label(locale, "Nova poruka", "New message")}</p>
            <p className="mt-1 line-clamp-2 text-xs font-bold text-muted">{toast.lastMessage?.body}</p>
          </button>
          <button type="button" onClick={() => setToast(null)} className="grid size-8 place-items-center rounded-full border border-line" aria-label={label(locale, "Zatvori", "Close")}><X className="size-4" /></button>
        </div>
      </div> : null}
    </div>
  );
}
