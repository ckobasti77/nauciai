"use client";

import { AtSign, Bell, Check, CheckCheck, ChevronRight, Inbox, MessageCircle, Quote, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CommunityAvatar, formatCommunityTime } from "@/components/app/community-identity";
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import { fallbackCommunityFilters, useCommunityFilters, useCommunityMentions } from "./community-data";
import { useCommunityQueryParams } from "./community-filters";
import {
  CommunityPageHeading,
  CommunityRouteSkeleton,
  EmptyCommunityState,
  LoadMoreButton,
  ScopeTrail,
} from "./community-shared";
import type { CommunityMentionEvent } from "./community-types";

function useMentionView() {
  const { searchParams, update } = useCommunityQueryParams();
  const unreadOnly = searchParams.get("unread") === "1";
  return { unreadOnly, setUnreadOnly: (value: boolean) => update({ unread: value ? "1" : undefined }) };
}

export function CommunityMentionsPage({ locale }: { locale: Locale }) {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return <LiveMentionsPage locale={locale} />;
  return <StaticMentionsPage locale={locale} />;
}

function StaticMentionsPage({ locale }: { locale: Locale }) {
  const viewState = useMentionView();
  return (
    <MentionsView
      locale={locale}
      viewState={viewState}
      mentions={[]}
      loading={false}
      canLoadMore={false}
      loadingMore={false}
      unreadCount={fallbackCommunityFilters.counts?.mentions ?? 0}
    />
  );
}

function LiveMentionsPage({ locale }: { locale: Locale }) {
  const viewState = useMentionView();
  const { filters, isLoading: filtersLoading } = useCommunityFilters(true);
  const mentionsQuery = useCommunityMentions({ unreadOnly: viewState.unreadOnly });
  const [markingAll, setMarkingAll] = useState(false);

  async function markAll() {
    setMarkingAll(true);
    try {
      await mentionsQuery.markAll({});
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <MentionsView
      locale={locale}
      viewState={viewState}
      mentions={mentionsQuery.results}
      loading={filtersLoading || mentionsQuery.isInitialLoading}
      canLoadMore={mentionsQuery.status === "CanLoadMore"}
      loadingMore={mentionsQuery.status === "LoadingMore"}
      unreadCount={filters.counts?.mentions ?? 0}
      onLoadMore={() => mentionsQuery.loadMore(20)}
      onMarkOne={(notificationId) => mentionsQuery.markOne({ notificationId })}
      onMarkAll={markAll}
      markingAll={markingAll}
    />
  );
}

function mentionCopy(event: CommunityMentionEvent, locale: Locale) {
  if (event.kind === "like_comment") {
    return locale === "sr" ? "je reagovao/la na tvoj odgovor" : "reacted to your reply";
  }
  return locale === "sr" ? "te je pomenuo/la u razgovoru" : "mentioned you in a conversation";
}

function MentionCard({
  locale,
  mention,
  onMarkRead,
}: {
  locale: Locale;
  mention: CommunityMentionEvent;
  onMarkRead?: (id: string) => Promise<unknown>;
}) {
  const unread = !mention.readAt;
  const authorName = mention.senderName ?? mention.authorName ?? (locale === "sr" ? "Član zajednice" : "Community member");
  const excerpt = mention.quote ?? mention.excerpt ?? mention.body;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[16px]! border bg-white p-4 transition hover:border-ink sm:p-5",
        unread ? "border-ink shadow-[4px_4px_0_rgba(244,190,48,0.65)]" : "border-line",
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        <CommunityAvatar
          name={authorName}
          avatarUrl={mention.authorAvatarUrl}
          role={mention.authorRole}
          locale={locale}
          size="sm"
          showRank={false}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-black text-ink">{authorName}</span>
            <span className="font-semibold text-muted">{mentionCopy(mention, locale)}</span>
            <span className="text-xs font-bold text-muted/75">· {formatCommunityTime(mention.createdAt, locale)}</span>
          </div>
          {unread ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-yellow/30 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-ink">
              <span className="size-1.5 rounded-full bg-[#b42318]" aria-hidden="true" />
              {locale === "sr" ? "Nepročitano" : "Unread"}
            </span>
          ) : null}

          {excerpt ? (
            <blockquote className="relative mt-3 rounded-[12px] border-l-4 border-yellow bg-[#eef3f7] py-3 pl-4 pr-3 text-sm font-bold leading-6 text-ink/80">
              <Quote className="absolute right-3 top-3 size-4 text-ink/20" aria-hidden="true" />
              <span className="line-clamp-3">{excerpt}</span>
            </blockquote>
          ) : null}

          <div className="mt-3">
            <ScopeTrail
              locale={locale}
              track={locale === "sr" ? mention.trackTitleSr : mention.trackTitleEn}
              course={locale === "sr" ? mention.courseTitleSr : mention.courseTitleEn}
              compact
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {mention.postId ? (
              <Link
                href={withLocale(locale, `/app/community/${mention.postId}`)}
                className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-line bg-white px-3 text-sm font-black text-ink transition hover:border-ink hover:bg-yellow/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                <span className="max-w-[16rem] truncate">
                  {mention.postTitle ?? (locale === "sr" ? "Otvori razgovor" : "Open conversation")}
                </span>
                <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
              </Link>
            ) : (
              <span />
            )}
            {unread && onMarkRead ? (
              <button
                type="button"
                onClick={() => void onMarkRead(mention._id)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink bg-white px-3 text-xs font-black text-ink transition hover:bg-[#eef3f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <Check className="size-3.5" aria-hidden="true" />
                {locale === "sr" ? "Označi pročitano" : "Mark as read"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function MentionsView({
  locale,
  viewState,
  mentions,
  loading,
  canLoadMore,
  loadingMore,
  unreadCount,
  onLoadMore,
  onMarkOne,
  onMarkAll,
  markingAll = false,
}: {
  locale: Locale;
  viewState: ReturnType<typeof useMentionView>;
  mentions: CommunityMentionEvent[];
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  unreadCount: number;
  onLoadMore?: () => void;
  onMarkOne?: (id: string) => Promise<unknown>;
  onMarkAll?: () => Promise<void>;
  markingAll?: boolean;
}) {
  return (
    <div className="space-y-6">
      <CommunityPageHeading
        eyebrow={locale === "sr" ? "Tvoj community inbox" : "Your community inbox"}
        title={locale === "sr" ? "Pominjanja bez izgubljenog konteksta" : "Mentions with the context intact"}
        body={
          locale === "sr"
            ? "Vidi ko te je pomenuo, tačan deo razgovora i gde treba da odgovoriš. Ništa se ne označava automatski."
            : "See who mentioned you, the exact part of the conversation, and where to reply. Nothing is marked automatically."
        }
        action={
          unreadCount > 0 && onMarkAll ? (
            <button
              type="button"
              onClick={() => void onMarkAll()}
              disabled={markingAll}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink transition hover:bg-yellow/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              {locale === "sr" ? "Označi sve pročitano" : "Mark all as read"}
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px]! border border-line bg-white p-2">
        <div className="flex gap-1" role="group" aria-label={locale === "sr" ? "Filter pominjanja" : "Mention filter"}>
          <button
            type="button"
            onClick={() => viewState.setUnreadOnly(false)}
            aria-pressed={!viewState.unreadOnly}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-black transition",
              !viewState.unreadOnly ? "bg-ink text-white" : "text-ink/65 hover:bg-[#eef3f7] hover:text-ink",
            )}
          >
            <Inbox className="size-4" aria-hidden="true" />
            {locale === "sr" ? "Sve" : "All"}
          </button>
          <button
            type="button"
            onClick={() => viewState.setUnreadOnly(true)}
            aria-pressed={viewState.unreadOnly}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-black transition",
              viewState.unreadOnly ? "bg-ink text-white" : "text-ink/65 hover:bg-[#eef3f7] hover:text-ink",
            )}
          >
            <Bell className="size-4" aria-hidden="true" />
            {locale === "sr" ? "Nepročitano" : "Unread"}
            {unreadCount > 0 ? (
              <span className="rounded-full border border-ink bg-yellow px-1.5 font-mono text-[10px] text-ink">{unreadCount}</span>
            ) : null}
          </button>
        </div>
        <p className="px-2 text-xs font-bold text-muted">
          {locale === "sr" ? "Ti biraš kada je pročitano." : "You decide when something is read."}
        </p>
      </div>

      {loading ? (
        <CommunityRouteSkeleton />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0 space-y-3" aria-live="polite">
            {mentions.length ? (
              mentions.map((mention) => (
                <MentionCard key={mention._id} locale={locale} mention={mention} onMarkRead={onMarkOne} />
              ))
            ) : (
              <EmptyCommunityState
                locale={locale}
                icon={AtSign}
                title={
                  viewState.unreadOnly
                    ? locale === "sr"
                      ? "Sve je pročitano"
                      : "You are all caught up"
                    : locale === "sr"
                      ? "Još nema pominjanja"
                      : "No mentions yet"
                }
                body={
                  locale === "sr"
                    ? "Kada te neko označi u objavljenom tredu ili odgovoru, ceo kontekst će se pojaviti ovde."
                    : "When someone tags you in a published thread or reply, the full context will appear here."
                }
              />
            )}
            {canLoadMore && onLoadMore ? (
              <div className="flex justify-center pt-3">
                <LoadMoreButton locale={locale} loading={loadingMore} onClick={onLoadMore} />
              </div>
            ) : null}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <section className="rounded-[16px]! border border-ink bg-ink p-5 text-white shadow-[4px_4px_0_rgba(244,190,48,0.7)]">
              <Sparkles className="size-5 text-yellow" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-black">{locale === "sr" ? "Inbox sa namerom" : "An intentional inbox"}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-white/70">
                {locale === "sr"
                  ? "Otvori samo ono što traži reakciju. Jednim klikom zatvori obrađeno pominjanje."
                  : "Open only what needs a response. Close a handled mention with one click."}
              </p>
            </section>
            <section className="rounded-[16px]! border border-line bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                {locale === "sr" ? "Nepročitano" : "Unread"}
              </p>
              <p className="mt-1 font-mono text-3xl font-black text-ink">{unreadCount}</p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
