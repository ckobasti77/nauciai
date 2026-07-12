"use client";

import { AtSign, Bell, Check, CheckCheck, ChevronRight, MessageCircle, MessageSquareText, Quote, Sparkles, Tag, ThumbsDown, ThumbsUp, BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CommunityAvatar, formatCommunityTime } from "@/components/app/community-identity";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import { fallbackCommunityFilters, useCommunityFilters, useCommunityMentions } from "./community-data";
import { useCommunityQueryParams } from "./community-filters";
import { CommunityPageHeading, CommunityRouteSkeleton, EmptyCommunityState, LoadMoreButton, ScopeTrail } from "./community-shared";
import type { CommunityMentionEvent } from "./community-types";

type NotificationCategory = "all" | "votes" | "comments" | "tags" | "system";

function useNotificationView() {
  const { searchParams, update } = useCommunityQueryParams();
  const unreadOnly = searchParams.get("unread") === "1";
  const rawCategory = searchParams.get("category") ?? "all";
  const category: NotificationCategory = ["all", "votes", "comments", "tags", "system"].includes(rawCategory)
    ? (rawCategory as NotificationCategory)
    : "all";
  return {
    unreadOnly,
    category,
    setUnreadOnly: (value: boolean) => update({ unread: value ? "1" : undefined }),
    setCategory: (value: NotificationCategory) => update({ category: value === "all" ? undefined : value }),
  };
}

export function CommunityMentionsPage({ locale }: { locale: Locale }) {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return <LiveNotificationsPage locale={locale} />;
  return <StaticNotificationsPage locale={locale} />;
}

function StaticNotificationsPage({ locale }: { locale: Locale }) {
  const viewState = useNotificationView();
  return <NotificationsView locale={locale} viewState={viewState} notifications={[]} loading={false} canLoadMore={false} loadingMore={false} unreadCount={fallbackCommunityFilters.counts?.community ?? 0} />;
}

function LiveNotificationsPage({ locale }: { locale: Locale }) {
  const viewState = useNotificationView();
  const { filters, isLoading: filtersLoading } = useCommunityFilters(true);
  const query = useCommunityMentions({ unreadOnly: viewState.unreadOnly, category: viewState.category });
  const [markingAll, setMarkingAll] = useState(false);

  async function markAll() {
    setMarkingAll(true);
    try { await query.markAll({}); } finally { setMarkingAll(false); }
  }

  return (
    <NotificationsView
      locale={locale}
      viewState={viewState}
      notifications={query.results}
      loading={filtersLoading || query.isInitialLoading}
      canLoadMore={query.status === "CanLoadMore"}
      loadingMore={query.status === "LoadingMore"}
      unreadCount={filters.counts?.community ?? 0}
      onLoadMore={() => query.loadMore(20)}
      onMarkOne={(id) => query.markOne({ notificationId: id })}
      onMarkAll={markAll}
      markingAll={markingAll}
    />
  );
}

function notificationCopy(kind: string | undefined, locale: Locale) {
  if (kind === "mention") return locale === "sr" ? "te je tagovao/la u razgovoru" : "tagged you in a conversation";
  if (kind === "comment_post") return locale === "sr" ? "je komentarisao/la tvoju objavu" : "commented on your thread";
  if (kind === "comment_reply") return locale === "sr" ? "je odgovorio/la na tvoj komentar" : "replied to your comment";
  if (kind === "helpful_comment") return locale === "sr" ? "je označio/la odgovor kao koristan" : "marked your reply as helpful";
  if (kind === "post_approved") return locale === "sr" ? "je odobrio/la tvoju objavu" : "approved your thread";
  if (kind === "post_changes_requested") return locale === "sr" ? "traži izmene na tvojoj objavi" : "requested changes to your thread";
  if (kind === "approval_pending") return locale === "sr" ? "\u010Deka tvoje odobrenje" : "is waiting for your approval";
  if (kind?.includes("downvote")) return locale === "sr" ? "je downvoteovao/la" : "downvoted";
  return locale === "sr" ? "je upvoteovao/la" : "upvoted";
}

function NotificationCard({ locale, notification, onMarkRead: onMarkReadProp }: { locale: Locale; notification: CommunityMentionEvent; onMarkRead?: (id: string) => Promise<unknown> }) {
  const unread = !notification.readAt;
  const authorName = notification.senderName ?? notification.authorName ?? (locale === "sr" ? "Član zajednice" : "Community member");
  const excerpt = notification.quote ?? notification.excerpt ?? notification.body;
  const kind = notification.kind ?? "";
  const isPendingApproval = kind === "approval_pending";
  const onMarkRead = isPendingApproval ? undefined : onMarkReadProp;
  const iconKind = kind === "mention" ? "tag" : kind === "comment_post" || kind === "comment_reply" ? "comment" : kind === "helpful_comment" ? "helpful" : kind.includes("downvote") ? "downvote" : kind.includes("vote") || kind.startsWith("like_") ? "upvote" : "bell";
  return (
    <article className={cn("relative overflow-hidden rounded-[16px] border bg-white p-4 transition hover:border-ink sm:p-5", unread ? "border-ink shadow-[4px_4px_0_rgba(244,190,48,0.65)]" : "border-line")}>
      <div className="flex gap-3 sm:gap-4">
        <CommunityAvatar name={authorName} avatarUrl={notification.authorAvatarUrl} role={notification.authorRole} locale={locale} size="sm" showRank={false} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-black text-ink">{notification.senderUsername ? `@${notification.senderUsername}` : authorName}</span>
            {notification.senderUsername ? <span className="text-xs font-semibold text-muted">{authorName}</span> : null}
            <span className={cn("inline-flex items-center gap-1.5 font-semibold", notification.kind?.includes("downvote") ? "text-red-700" : "text-muted")}>
              {iconKind === "tag" ? <Tag className="size-3.5" aria-hidden="true" /> : iconKind === "comment" ? <MessageSquareText className="size-3.5" aria-hidden="true" /> : iconKind === "helpful" ? <BadgeCheck className="size-3.5" aria-hidden="true" /> : iconKind === "downvote" ? <ThumbsDown className="size-3.5" aria-hidden="true" /> : iconKind === "upvote" ? <ThumbsUp className="size-3.5" aria-hidden="true" /> : <Bell className="size-3.5" aria-hidden="true" />}
              {notificationCopy(notification.kind, locale)}
            </span>
            <span className="text-xs font-bold text-muted/75">· {formatCommunityTime(notification.createdAt, locale)}</span>
          </div>
          {unread ? <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-yellow/30 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-ink"><span className="size-1.5 rounded-full bg-[#b42318]" aria-hidden="true" />{locale === "sr" ? "Nepročitano" : "Unread"}</span> : null}
          {excerpt ? <blockquote className="relative mt-3 rounded-[12px] border-l-4 border-yellow bg-[#eef3f7] py-3 pl-4 pr-3 text-sm font-bold leading-6 text-ink/80"><Quote className="absolute right-3 top-3 size-4 text-ink/20" aria-hidden="true" /><span className="line-clamp-3">{excerpt}</span></blockquote> : null}
          <div className="mt-3"><ScopeTrail locale={locale} track={locale === "sr" ? notification.trackTitleSr : notification.trackTitleEn} course={locale === "sr" ? notification.courseTitleSr : notification.courseTitleEn} compact /></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {notification.postId ? <Link href={withLocale(locale, `/app/community/${notification.postId}`)} onClick={() => { if (unread && onMarkRead) void onMarkRead(notification._id); }} className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-line bg-white px-3 text-sm font-black text-ink transition hover:border-ink hover:bg-yellow/15"><MessageCircle className="size-4 shrink-0" /><span className="max-w-[16rem] truncate">{notification.postTitle ?? (locale === "sr" ? "Otvori razgovor" : "Open conversation")}</span><ChevronRight className="size-3.5 shrink-0" /></Link> : <span />}
            {unread && onMarkRead ? <button type="button" onClick={() => void onMarkRead(notification._id)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink bg-white px-3 text-xs font-black text-ink transition hover:bg-[#eef3f7]"><Check className="size-3.5" />{locale === "sr" ? "Označi pročitano" : "Mark as read"}</button> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function NotificationsView({ locale, viewState, notifications, loading, canLoadMore, loadingMore, unreadCount, onLoadMore, onMarkOne, onMarkAll, markingAll = false }: { locale: Locale; viewState: ReturnType<typeof useNotificationView>; notifications: CommunityMentionEvent[]; loading: boolean; canLoadMore: boolean; loadingMore: boolean; unreadCount: number; onLoadMore?: () => void; onMarkOne?: (id: string) => Promise<unknown>; onMarkAll?: () => Promise<void>; markingAll?: boolean }) {
  const categoryLabels: Record<NotificationCategory, string> = { all: locale === "sr" ? "Sve" : "All", votes: locale === "sr" ? "Glasovi" : "Votes", comments: locale === "sr" ? "Komentari" : "Comments", tags: locale === "sr" ? "Tagovi" : "Tags", system: locale === "sr" ? "Sistemska" : "System" };
  return (
    <div className="space-y-5">
      <div className="hidden">
      <CommunityPageHeading eyebrow={locale === "sr" ? "Tvoj community inbox" : "Your community inbox"} title={locale === "sr" ? "Obaveštenja sa punim kontekstom" : "Notifications with full context"} body={locale === "sr" ? "Vidi glasove, komentare, tagove i sistemske promene na svojim objavama." : "See votes, comments, tags, and system changes around your community activity."} action={unreadCount > 0 && onMarkAll ? <button type="button" onClick={() => void onMarkAll()} disabled={markingAll} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink disabled:opacity-60"><CheckCheck className="size-4" />{locale === "sr" ? "Označi sve pročitano" : "Mark all as read"}</button> : undefined} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-line bg-white p-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label={locale === "sr" ? "Filter obaveštenja" : "Notification filter"}>{(Object.keys(categoryLabels) as NotificationCategory[]).map((category) => <button key={category} type="button" onClick={() => viewState.setCategory(category)} aria-pressed={viewState.category === category} className={cn("inline-flex min-h-10 items-center rounded-full px-3 text-xs font-black transition", viewState.category === category ? "bg-ink text-white" : "text-ink/65 hover:bg-[#eef3f7] hover:text-ink")}>{categoryLabels[category]}</button>)}<button type="button" onClick={() => viewState.setUnreadOnly(!viewState.unreadOnly)} aria-pressed={viewState.unreadOnly} className={cn("inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-black transition", viewState.unreadOnly ? "bg-ink text-white" : "text-ink/65 hover:bg-[#eef3f7] hover:text-ink")}><Bell className="size-3.5" />{locale === "sr" ? "Nepročitano" : "Unread"}{unreadCount > 0 ? <span className="rounded-full border border-ink bg-yellow px-1.5 font-mono text-[10px] text-ink">{unreadCount}</span> : null}</button></div>
        {unreadCount > 0 && onMarkAll ? (
          <button
            type="button"
            onClick={() => void onMarkAll()}
            disabled={markingAll}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-white px-3 text-xs font-black text-ink transition hover:border-ink disabled:opacity-60"
          >
            <CheckCheck className="size-3.5" />
            {locale === "sr" ? "Označi sve pročitano" : "Mark all as read"}
          </button>
        ) : null}
      </div>
      {loading ? <CommunityRouteSkeleton /> : <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]"><section className="min-w-0 space-y-3" aria-live="polite">{notifications.length ? notifications.map((notification) => <NotificationCard key={notification._id} locale={locale} notification={notification} onMarkRead={onMarkOne} />) : <EmptyCommunityState locale={locale} icon={AtSign} title={viewState.unreadOnly ? (locale === "sr" ? "Sve je pročitano" : "You are all caught up") : (locale === "sr" ? "Još nema obaveštenja" : "No notifications yet")} body={locale === "sr" ? "Kada neko glasa, komentariše ili te taguje, ceo kontekst će se pojaviti ovde." : "When someone votes, comments, or tags you, the full context will appear here."} />}{canLoadMore && onLoadMore ? <div className="flex justify-center pt-3"><LoadMoreButton locale={locale} loading={loadingMore} onClick={onLoadMore} /></div> : null}</section><aside className="space-y-4 xl:sticky xl:top-6"><section className="rounded-[16px] border border-ink bg-ink p-5 text-white shadow-[4px_4px_0_rgba(244,190,48,0.7)]"><Sparkles className="size-5 text-yellow" /><h2 className="mt-3 text-lg font-black">{locale === "sr" ? "Jedan inbox za sve" : "One inbox for everything"}</h2><p className="mt-2 text-sm font-semibold leading-6 text-white/70">{locale === "sr" ? "Glasovi, komentari, tagovi i važne sistemske promene ostaju uz svoj razgovor." : "Votes, comments, tags, and important system changes stay attached to their conversation."}</p></section><section className="rounded-[16px] border border-line bg-white p-4"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted">{locale === "sr" ? "Nepročitano" : "Unread"}</p><p className="mt-1 font-mono text-3xl font-black text-ink">{unreadCount}</p></section></aside></div>}
    </div>
  );
}
