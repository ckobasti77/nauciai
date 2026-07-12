"use client";

import { Bookmark, CheckCircle2, Clock3, FilePenLine, Inbox, PencilLine, Send, Sparkles } from "lucide-react";
import { useMutation } from "convex/react";
import Link from "next/link";

import { cn } from "@/components/ui/primitives";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import {
  fallbackCommunityFilters,
  fallbackCommunityPosts,
  useCommunityFilters,
  useCommunityMyPosts,
  useToggleCommunityFavorite,
} from "./community-data";
import { useCommunityQueryParams } from "./community-filters";
import {
  CommunityPageHeading,
  CommunityRouteSkeleton,
  EmptyCommunityState,
  LoadMoreButton,
  ThreadCard,
} from "./community-shared";
import type { CommunityPostRow } from "./community-types";

type ThreadView = "drafts" | "pending" | "published" | "saved";

const VIEW_ITEMS = [
  { id: "published" as const, labelSr: "Objavljeno", labelEn: "Published", icon: CheckCircle2, step: "01" },
  { id: "pending" as const, labelSr: "Na odobrenju", labelEn: "In review", icon: Clock3, step: "02" },
  { id: "drafts" as const, labelSr: "Skice", labelEn: "Drafts", icon: FilePenLine, step: "03" },
  { id: "saved" as const, labelSr: "Sačuvano", labelEn: "Saved", icon: Bookmark, step: "★" },
];

function useThreadView() {
  const { searchParams, update } = useCommunityQueryParams();
  const requested = searchParams.get("view");
  const view: ThreadView = VIEW_ITEMS.some((item) => item.id === requested) ? (requested as ThreadView) : "published";
  return { view, setView: (next: ThreadView) => update({ view: next === "published" ? undefined : next }) };
}

export function CommunityMyThreadsPage({ locale }: { locale: Locale }) {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return <LiveMyThreadsPage locale={locale} />;
  return <StaticMyThreadsPage locale={locale} />;
}

function StaticMyThreadsPage({ locale }: { locale: Locale }) {
  const viewState = useThreadView();
  const posts = viewState.view === "published" ? fallbackCommunityPosts : [];
  return (
    <MyThreadsView
      locale={locale}
      viewState={viewState}
      posts={posts}
      loading={false}
      canLoadMore={false}
      loadingMore={false}
      totalNotice={fallbackCommunityFilters.counts?.myThreads ?? 0}
    />
  );
}

function LiveMyThreadsPage({ locale }: { locale: Locale }) {
  const viewState = useThreadView();
  const { filters, isLoading: filtersLoading } = useCommunityFilters(true);
  const postsQuery = useCommunityMyPosts({ view: viewState.view });
  const toggleFavorite = useToggleCommunityFavorite();
  const markPostNotificationsAsRead = useMutation(api.notifications.markPostNotificationsAsRead);

  return (
    <MyThreadsView
      locale={locale}
      viewState={viewState}
      posts={postsQuery.results}
      loading={filtersLoading || postsQuery.isInitialLoading}
      canLoadMore={postsQuery.status === "CanLoadMore"}
      loadingMore={postsQuery.status === "LoadingMore"}
      onLoadMore={() => postsQuery.loadMore(20)}
      onToggleFavorite={(postId) => toggleFavorite({ postId })}
      onOpenPost={(postId) => markPostNotificationsAsRead({ postId: postId as Id<"communityPosts"> })}
      totalNotice={filters.counts?.myThreads ?? 0}
    />
  );
}

function statusBadge(post: CommunityPostRow, locale: Locale) {
  const status = post.status ?? "published";
  const label =
    status === "changes_requested"
      ? locale === "sr"
        ? "Potrebna izmena"
        : "Changes requested"
      : status === "draft"
        ? locale === "sr"
          ? "Skica"
          : "Draft"
        : status === "pending"
          ? locale === "sr"
            ? "Na odobrenju"
            : "In review"
          : locale === "sr"
            ? "Objavljeno"
            : "Published";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em]",
        status === "changes_requested"
          ? "border-[#b42318]/30 bg-[#fff1f0] text-[#8f1f17]"
          : status === "pending"
            ? "border-yellow bg-yellow/25 text-ink"
            : status === "published"
              ? "border-[#3d7d5a]/25 bg-[#edf8f1] text-[#285d40]"
              : "border-line bg-[#eef3f7] text-ink/70",
      )}
    >
      {label}
    </span>
  );
}

function nextAction(
  post: CommunityPostRow,
  locale: Locale,
  onToggleFavorite?: (postId: string) => Promise<unknown>,
  onOpenPost?: (postId: string) => Promise<unknown>,
) {
  if (post.isFavorited && onToggleFavorite) {
    return (
      <button
        type="button"
        onClick={() => void onToggleFavorite(post._id)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-3 text-xs font-black text-ink transition hover:border-ink"
      >
        <Bookmark className="size-3.5 fill-ink" aria-hidden="true" />
        {locale === "sr" ? "Ukloni" : "Remove"}
      </button>
    );
  }

  const editable = post.status === "draft" || post.status === "changes_requested";
  const href = post._id.startsWith("preview-")
    ? withLocale(locale, "/app/community/discussions")
    : withLocale(locale, `/app/community/${post._id}${editable ? "/edit" : ""}`);
  return (
    <Link
      href={href}
      onClick={() => {
        if (onOpenPost && post.status === "published") void onOpenPost(post._id);
      }}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        editable ? "border-ink bg-yellow text-ink" : "border-line bg-white text-ink hover:border-ink",
      )}
    >
      {editable ? <PencilLine className="size-3.5" aria-hidden="true" /> : <Inbox className="size-3.5" aria-hidden="true" />}
      {editable
        ? post.status === "changes_requested"
          ? locale === "sr"
            ? "Izmeni i pošalji"
            : "Edit and resubmit"
          : locale === "sr"
            ? "Nastavi skicu"
            : "Continue draft"
        : locale === "sr"
          ? "Otvori"
          : "Open"}
    </Link>
  );
}

function MyThreadsView({
  locale,
  viewState,
  posts,
  loading,
  canLoadMore,
  loadingMore,
  totalNotice,
  onLoadMore,
  onToggleFavorite,
  onOpenPost,
}: {
  locale: Locale;
  viewState: ReturnType<typeof useThreadView>;
  posts: CommunityPostRow[];
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  totalNotice: number;
  onLoadMore?: () => void;
  onToggleFavorite?: (postId: string) => Promise<unknown>;
  onOpenPost?: (postId: string) => Promise<unknown>;
}) {
  const activeItem = VIEW_ITEMS.find((item) => item.id === viewState.view) ?? VIEW_ITEMS[0];
  const activeIndex = Math.max(0, VIEW_ITEMS.findIndex((item) => item.id === viewState.view));

  return (
    <div className="space-y-5">
      <div className="hidden">
      <CommunityPageHeading
        eyebrow={locale === "sr" ? "Tvoj radni sto" : "Your workbench"}
        title={locale === "sr" ? "Od skice do korisne diskusije" : "From rough draft to useful discussion"}
        body={
          locale === "sr"
            ? "Svaki tred ima jasno stanje i sledeći korak. Skice ostaju tvoje dok ih ne pošalješ na odobrenje."
            : "Every thread has a clear state and next step. Drafts remain yours until you send them for review."
        }
        action={
          <Link
            href={withLocale(locale, "/app/community/new")}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5"
          >
            <FilePenLine className="size-4" aria-hidden="true" />
            {locale === "sr" ? "Nova skica" : "New draft"}
          </Link>
        }
      />
      </div>
      <nav className="overflow-x-auto rounded-[16px]! border border-line bg-white p-1.5" aria-label={locale === "sr" ? "Status mojih tredova" : "My thread status"}>
        <div className="relative grid min-w-[760px] grid-cols-5">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/5 rounded-[12px] border border-ink bg-ink shadow-[2px_2px_0_rgba(244,190,48,0.42)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
          {VIEW_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === viewState.view;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => viewState.setView(item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative z-10 flex min-h-10 items-center justify-between gap-3 rounded-[12px] border border-transparent px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  active ? "text-white" : "text-ink hover:bg-[#eef3f7]",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className={cn("size-4 shrink-0", active && "text-yellow")} aria-hidden="true" />
                  <span className="truncate text-sm font-black">{locale === "sr" ? item.labelSr : item.labelEn}</span>
                </span>
                <span className={cn("font-mono text-[10px] font-black", active ? "text-yellow" : "text-muted")}>{item.step}</span>
              </button>
            );
          })}
          <Link
            href={withLocale(locale, "/app/community/new")}
            className="relative z-10 ml-1 inline-flex min-h-10 items-center justify-between gap-2 rounded-[12px] border-2 border-ink bg-yellow px-3 text-sm font-black text-ink shadow-[2px_2px_0_rgba(14,49,88,0.16)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span className="flex min-w-0 items-center gap-2">
              <FilePenLine className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{locale === "sr" ? "Nova skica" : "New draft"}</span>
            </span>
            <span className="font-mono text-[10px] font-black">+</span>
          </Link>
        </div>
      </nav>

      {loading ? (
        <CommunityRouteSkeleton />
      ) : (
        <div className="block">
          <section className="min-w-0 space-y-3" aria-live="polite">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-sm font-black uppercase tracking-[0.1em] text-ink/65">
                {locale === "sr" ? activeItem.labelSr : activeItem.labelEn}
              </h2>
              <span className="font-mono text-xs font-black text-muted">{posts.length}</span>
            </div>
            {posts.length ? (
              posts.map((post) => (
                <ThreadCard
                  key={post._id}
                  locale={locale}
                  post={post}
                  track={locale === "sr" ? post.trackTitleSr : post.trackTitleEn}
                  course={locale === "sr" ? post.courseTitleSr : post.courseTitleEn}
                  statusLabel={statusBadge(post, locale)}
                  notice={
                    <>
                      {post.unreadActivityCount ? (
                        <div className="rounded-[12px] border border-ink bg-yellow/25 p-3 text-sm font-black text-ink">
                          {post.unreadActivityCount} {locale === "sr" ? "novih obaveštenja" : "new notifications"}
                        </div>
                      ) : null}
                      {post.status === "changes_requested" ? (
                        <div className="mt-2 rounded-[12px] border border-[#b42318]/25 bg-[#fff7f6] p-3 text-sm font-bold leading-5 text-[#712018]">
                          <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-[#9a2a20]">
                            {locale === "sr" ? "Napomena moderatora" : "Moderator note"}
                          </span>
                          <span className="mt-1 block">
                            {post.latestModerationReason ??
                              post.moderationReason ??
                              (locale === "sr" ? "Dopuni kontekst pre ponovnog slanja." : "Add more context before resubmitting.")}
                          </span>
                        </div>
                      ) : null}
                    </>
                  }
                  action={nextAction(post, locale, viewState.view === "saved" ? onToggleFavorite : undefined, onOpenPost)}
                />
              ))
            ) : (
              <EmptyCommunityState
                locale={locale}
                icon={activeItem.icon}
                title={
                  viewState.view === "drafts"
                    ? locale === "sr"
                      ? "Nema započetih skica"
                      : "No drafts yet"
                    : locale === "sr"
                      ? "Ovde trenutno nema tredova"
                      : "There are no threads here yet"
                }
                body={
                  viewState.view === "drafts"
                    ? locale === "sr"
                      ? "Započni pitanje, sačuvaj ga i vrati mu se kada prikupiš dovoljno konteksta."
                      : "Start a question, save it, and return when you have enough context."
                    : locale === "sr"
                      ? "Kada tred pređe u ovo stanje, pojaviće se ovde sa jasnom sledećom akcijom."
                      : "When a thread reaches this state, it will appear here with a clear next action."
                }
              />
            )}
            {canLoadMore && onLoadMore ? (
              <div className="flex justify-center pt-3">
                <LoadMoreButton locale={locale} loading={loadingMore} onClick={onLoadMore} />
              </div>
            ) : null}
          </section>

          <aside className="hidden space-y-4 xl:sticky xl:top-6">
            <section className="rounded-[16px]! border border-ink bg-[#eef3f7] p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-ink" aria-hidden="true" />
                <h2 className="text-sm font-black text-ink">{locale === "sr" ? "Tok objavljivanja" : "Publishing flow"}</h2>
              </div>
              <ol className="relative mt-4 space-y-4 before:absolute before:bottom-5 before:left-3 before:top-5 before:w-px before:bg-ink/20">
                {VIEW_ITEMS.slice(0, 3).map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id} className="relative flex items-start gap-3">
                      <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border border-ink bg-white">
                        <Icon className="size-3" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block font-mono text-[9px] font-black text-muted">{item.step}</span>
                        <span className="block text-sm font-black text-ink">{locale === "sr" ? item.labelSr : item.labelEn}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
            {totalNotice > 0 ? (
              <section className="rounded-[16px]! border border-yellow bg-yellow/20 p-4">
                <div className="flex items-start gap-3">
                  <Send className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden="true" />
                  <p className="text-sm font-bold leading-5 text-ink">
                    {locale === "sr"
                      ? `Imaš ${totalNotice} novih aktivnosti na svojim tredovima.`
                      : `You have ${totalNotice} new activities on your threads.`}
                  </p>
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
