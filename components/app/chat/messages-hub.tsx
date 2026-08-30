"use client";

import { BookOpenCheck, GraduationCap, MessageCircle, Sparkles, Users } from "lucide-react";
import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { ChatMotionScope } from "@/components/app/chat/chat-motion";
import {
  ConversationPanel,
  InboxPane,
  type InboxSection,
  label,
  sections,
} from "@/components/app/chat/messages-shell";
import { StudyHub } from "@/components/app/chat/study-hub";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { HandUnderline, LinkButton, cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

type MessagesView = "conversations" | "study";

export function MessagesHub({ locale, selectedConversationId }: { locale: Locale; selectedConversationId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = selectedConversationId as Id<"chatConversations"> | undefined;
  const requestedView = searchParams.get("view");
  const view: MessagesView = selected ? "conversations" : requestedView === "study" ? "study" : "conversations";
  const requestedSection = searchParams.get("section");
  const section: InboxSection = sections.some((item) => item.value === requestedSection) ? requestedSection as InboxSection : "all";
  const query = searchParams.get("q") ?? "";
  const courseSlug = searchParams.get("course") ?? "";
  const inboxSummary = useQuery(api.chat.getInboxSummary, {});
  const viewerProfile = useQuery(api.profiles.getViewerProfileStatus, {});
  const studySummary = useQuery(api.study.getStudyHubSummary, viewerProfile && !viewerProfile.isAdmin ? {} : "skip");
  const studyPendingCount = (studySummary?.pendingPartnerInviteCount ?? 0) + (studySummary?.pendingStudyGroupInviteCount ?? 0);

  const updateParams = useCallback((changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const serialized = next.toString();
    router.replace(`${pathname}${serialized ? `?${serialized}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams]);

  function changeView(nextView: MessagesView) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", nextView);
    if (nextView === "study") {
      next.delete("section");
      next.delete("q");
    }
    const serialized = next.toString();
    router.push(`${withLocale(locale, "/app/messages")}${serialized ? `?${serialized}` : ""}`);
  }

  const backToInbox = () => {
    if (requestedView === "study") {
      const next = new URLSearchParams();
      next.set("view", "study");
      if (courseSlug) next.set("course", courseSlug);
      router.push(`${withLocale(locale, "/app/messages")}?${next.toString()}`);
      return;
    }
    const next = new URLSearchParams();
    next.set("view", "conversations");
    if (section !== "all") next.set("section", section);
    if (query) next.set("q", query);
    router.push(`${withLocale(locale, "/app/messages")}?${next.toString()}`);
  };

  return (
    <ChatMotionScope sceneKey={selected ? String(selected) : view} className="mx-auto flex h-[calc(100dvh-7rem)] min-h-0 max-w-[1500px] min-w-0 flex-col lg:h-[calc(100dvh-4rem)]">
      <header className={cn("mb-4 items-center justify-between gap-4 rounded-[16px] border-2 border-line bg-paper-strong px-4 py-3 shadow-[4px_4px_0_0_var(--shadow-hard-08)] sm:px-5", selected ? "hidden lg:flex" : "flex")}>
        <div className="shrink-0">
          <p className="type-eyebrow-sm text-blue-mid dark:text-muted">Nauči AI</p>
          <h1 className="whitespace-nowrap type-h1 text-ink">{label(locale, "Poruke", "Messages")}</h1>
          {/* Isti žuti potpis kao ispod naslova svake druge zone. */}
          <HandUnderline size="sm" className="mt-1" />
        </div>
        <div role="tablist" aria-label={label(locale, "Pogled poruka", "Messages view")} className="flex min-w-0 overflow-x-auto rounded-full border-2 border-ink bg-paper p-1">
          <button type="button" role="tab" aria-selected={view === "conversations"} onClick={() => changeView("conversations")} className={cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 type-caption font-black sm:gap-2 sm:px-4", view === "conversations" ? "bg-ink text-paper-strong" : "text-ink hover:bg-paper-strong")}><MessageCircle className="size-4" />{label(locale, "Razgovori", "Conversations")}{inboxSummary && inboxSummary.totalUnread > 0 ? <span className="rounded-full bg-yellow px-1.5 font-mono type-caption text-ink">{inboxSummary.totalUnread > 99 ? "99+" : inboxSummary.totalUnread}</span> : null}</button>
          <button type="button" role="tab" aria-selected={view === "study"} onClick={() => changeView("study")} className={cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 type-caption font-black sm:gap-2 sm:px-4", view === "study" ? "bg-ink text-paper-strong" : "text-ink hover:bg-paper-strong")}><GraduationCap className="size-4" />{label(locale, "Uči zajedno", "Study together")}{studyPendingCount > 0 ? <span className="rounded-full bg-yellow px-1.5 font-mono type-caption text-ink">{studyPendingCount > 99 ? "99+" : studyPendingCount}</span> : null}</button>
        </div>
      </header>

      {view === "study" ? <StudyHub locale={locale} courseSlug={courseSlug || undefined} onCourseSlugChange={(slug) => updateParams({ course: slug || undefined })} onOpenConversation={(conversationId) => { const next = new URLSearchParams(); next.set("view", "study"); if (courseSlug) next.set("course", courseSlug); router.push(`${withLocale(locale, `/app/messages/${conversationId}`)}?${next.toString()}`); }} className="min-h-0 flex-1 overflow-y-auto" /> : <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        <div className={cn("flex min-w-0 flex-1 lg:w-[340px] lg:flex-none 2xl:w-[360px]", selected && "hidden lg:flex")}><InboxPane locale={locale} selectedConversationId={selectedConversationId} section={section} query={query} onSectionChange={(nextSection) => updateParams({ section: nextSection === "all" ? undefined : nextSection })} onQueryChange={(nextQuery) => updateParams({ q: nextQuery || undefined })} onOpenStudy={() => changeView("study")} /></div>
        <div className={cn("min-h-0 min-w-0 flex-1", selected ? "flex" : "hidden lg:flex")}>
          {selected ? <ConversationPanel key={selected} locale={locale} conversationId={selected} onBack={backToInbox} /> : <EmptyState
              className="h-full flex-1"
              icon={BookOpenCheck}
              title={label(locale, "Ovde se otvaraju tvoji razgovori", "Your conversations open here")}
              body={label(locale, "Klikni na razgovor sa liste sa leve strane. Ako lista još nema nikoga, prvo pronađi nekoga sa kim ćeš da učiš.", "Click a conversation in the list on the left. If the list is still empty, first find someone to study with.")}
              action={<div className="flex flex-wrap justify-center gap-2"><Button size="sm" icon={<Sparkles className="size-4" />} onClick={() => changeView("study")}>{label(locale, "Pronađi partnera", "Find a partner")}</Button><LinkButton href={withLocale(locale, "/app/community/members")} tone="paper"><Users className="size-4" />{label(locale, "Pregledaj članove", "Browse members")}</LinkButton></div>}
            />}
        </div>
      </div>}
    </ChatMotionScope>
  );
}

export const MessagesShell = MessagesHub;
