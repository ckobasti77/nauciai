"use client";

import { useMutation } from "convex/react";
import { ArrowBigDown, ArrowBigUp, Bookmark, ChevronDown, MessageCircle, MessageSquareText, PenLine, Pin, Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/components/ui/primitives";
import { CommentsSection } from "@/components/app/community-comments";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/ui/toast-provider";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import {
  fallbackCommunityFilters,
  fallbackCommunityPosts,
  useCommunityFilters,
  useCommunityPinnedPosts,
  useCommunityPosts,
  useToggleCommunityFavorite,
} from "./community-data";
import { CommunityScopeControls, useCommunityQueryParams, useResolvedCommunityScope } from "./community-filters";
import { CommunityStickyToolbar } from "./community-sticky-toolbar";
import {
  CommunityRouteSkeleton,
  CommunitySearch,
  EmptyCommunityState,
  LoadMoreButton,
  ThreadCard,
} from "./community-shared";
import type { CommunityFilters, CommunityPostRow } from "./community-types";

type DiscussionSort = "hot" | "top" | "latest" | "active" | "unanswered";

function postTrackTitle(post: CommunityPostRow, filters: CommunityFilters, locale: Locale) {
  const track = filters.tracks.find((item) => item._id === post.trackId);
  return locale === "sr" ? post.trackTitleSr ?? track?.titleSr : post.trackTitleEn ?? track?.titleEn;
}

function postCourseTitle(post: CommunityPostRow, filters: CommunityFilters, locale: Locale) {
  const course = filters.courses.find((item) => item._id === post.courseId);
  return locale === "sr" ? post.courseTitleSr ?? course?.titleSr : post.courseTitleEn ?? course?.titleEn;
}

function useDiscussionControls() {
  const { searchParams, update } = useCommunityQueryParams();
  const currentQuery = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(currentQuery);
  const requestedSort = searchParams.get("sort");
  const sort: DiscussionSort =
    requestedSort === "top" || requestedSort === "latest" || requestedSort === "active" || requestedSort === "unanswered" ? requestedSort : "hot";

  useEffect(() => {
    if (currentQuery === search.trim()) return;
    const timeout = window.setTimeout(() => {
      update({ q: search.trim() || undefined }, "replace");
    }, 320);
    return () => window.clearTimeout(timeout);
  }, [currentQuery, search, update]);

  return {
    search,
    setSearch,
    query: currentQuery.trim(),
    sort,
    setSort: (next: DiscussionSort) => update({ sort: next === "hot" ? undefined : next }),
  };
}

function ShareThreadButton({ locale, post }: { locale: Locale; post: CommunityPostRow }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const threadHref = post._id.startsWith("preview-")
    ? withLocale(locale, "/app/community/discussions")
    : withLocale(locale, "/app/community/" + post._id);

  async function shareThread() {
    if (busy) return;
    setBusy(true);
    const url = window.location.origin + threadHref;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: post.title, text: post.body, url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success(locale === "sr" ? "Link je kopiran." : "Link copied.");
      } else {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "true");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
        toast.success(locale === "sr" ? "Link je kopiran." : "Link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(locale === "sr" ? "Deljenje nije uspelo." : "Sharing failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void shareThread()}
      disabled={busy}
      aria-label={locale === "sr" ? "Podeli diskusiju" : "Share discussion"}
      className="grid size-11 place-items-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50 sm:size-8"
    >
      <Share2 className="size-4" aria-hidden="true" />
    </button>
  );
}

export function CommunityDiscussionsPage({ locale }: { locale: Locale }) {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <LiveDiscussionsPage locale={locale} />;
  }

  return <StaticDiscussionsPage locale={locale} />;
}

function StaticDiscussionsPage({ locale }: { locale: Locale }) {
  const scopeState = useResolvedCommunityScope(fallbackCommunityFilters, locale);
  const controls = useDiscussionControls();
  const posts = useMemo(() => {
    const needle = controls.query.toLocaleLowerCase();
    return fallbackCommunityPosts
      .filter((post) =>
        scopeState.scope.kind === "global"
          ? true
          : scopeState.scope.kind === "track"
            ? post.trackId === scopeState.scope.trackId
            : post.courseId === scopeState.scope.courseId,
      )
      .filter((post) => !scopeState.selectedCycle || post.moduleId === scopeState.selectedCycle._id)
      .filter((post) => !scopeState.selectedLesson || post.lessonId === scopeState.selectedLesson._id)
      .filter((post) => !needle || `${post.title} ${post.body}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => (controls.sort === "top" ? (b.voteScore ?? 0) - (a.voteScore ?? 0) : controls.sort === "hot" ? (b.voteScore ?? 0) - (a.voteScore ?? 0) || b.createdAt - a.createdAt : b.createdAt - a.createdAt));
  }, [controls.query, controls.sort, scopeState.scope, scopeState.selectedCycle, scopeState.selectedLesson]);

  return (
    <DiscussionsView
      locale={locale}
      filters={fallbackCommunityFilters}
      scopeState={scopeState}
      controls={controls}
      posts={posts}
      pinnedPosts={fallbackCommunityPosts
        .filter((post) => post.isFeaturedGlobal || post.isPinned)
        .filter((post) => !scopeState.selectedCycle || post.moduleId === scopeState.selectedCycle._id)
        .filter((post) => !scopeState.selectedLesson || post.lessonId === scopeState.selectedLesson._id)
        .slice(0, 3)}
      loading={false}
      canLoadMore={false}
      loadingMore={false}
    />
  );
}

function LiveDiscussionsPage({ locale }: { locale: Locale }) {
  const { filters, isLoading: filtersLoading, isAuthenticated } = useCommunityFilters(true);
  const scopeState = useResolvedCommunityScope(filters, locale);
  const controls = useDiscussionControls();
  const postsQuery = useCommunityPosts({
    scope: filtersLoading ? { kind: "global" } : scopeState.scope,
    moduleId: scopeState.selectedCycle?._id,
    lessonId: scopeState.selectedLesson?._id,
    search: controls.query || undefined,
    sort: controls.sort,
  });
  const pinnedQuery = useCommunityPinnedPosts({ scope: scopeState.scope, limit: 3 });
  const toggleFavorite = useToggleCommunityFavorite();
  const votePost = useMutation(api.community.vote);
  const canInteract = Boolean(filters.viewer.username);

  return (
    <DiscussionsView
      locale={locale}
      filters={filters}
      scopeState={scopeState}
      controls={controls}
      posts={postsQuery.results}
      pinnedPosts={pinnedQuery.results.filter(
        (post) =>
          (!scopeState.selectedCycle || post.moduleId === scopeState.selectedCycle._id) &&
          (!scopeState.selectedLesson || post.lessonId === scopeState.selectedLesson._id),
      )}
      loading={filtersLoading || postsQuery.isInitialLoading}
      canLoadMore={postsQuery.status === "CanLoadMore"}
      loadingMore={postsQuery.status === "LoadingMore"}
      onLoadMore={() => postsQuery.loadMore(20)}
      onToggleFavorite={(postId) => toggleFavorite({ postId })}
      onReactPost={(postId, vote) => votePost({ targetType: "post", targetId: postId, vote })}
      isAuthenticated={isAuthenticated}
      viewerUserId={filters.viewer.userId}
      canModerate={filters.viewer.role === "admin" || filters.viewer.role === "moderator"}
      canInteract={canInteract}
    />
  );
}

function DiscussionsView({
  locale,
  filters,
  scopeState,
  controls,
  posts,
  pinnedPosts,
  loading,
  canLoadMore,
  loadingMore,
  onLoadMore,
  onToggleFavorite,
  onReactPost,
  isAuthenticated = false,
  viewerUserId,
  canModerate = false,
  canInteract = true,
}: {
  locale: Locale;
  filters: CommunityFilters;
  scopeState: ReturnType<typeof useResolvedCommunityScope>;
  controls: ReturnType<typeof useDiscussionControls>;
  posts: CommunityPostRow[];
  pinnedPosts: CommunityPostRow[];
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
  onToggleFavorite?: (postId: string) => Promise<unknown>;
  onReactPost?: (postId: string, vote: "upvote" | "downvote") => Promise<unknown>;
  isAuthenticated?: boolean;
  viewerUserId?: string;
  canModerate?: boolean;
  canInteract?: boolean;
}) {
  const toast = useToast();
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  async function handlePostReaction(postId: string, vote: "upvote" | "downvote") {
    if (!onReactPost) return;
    try {
      await onReactPost(postId, vote);
    } catch (error) {
      const message = String(error);
      if (message.includes("PROFILE_INCOMPLETE")) {
        toast.warning(
          locale === "sr" ? "Podesi username da bi reagovao/la." : "Set a username to react.",
          undefined,
          { label: locale === "sr" ? "Otvori Profil" : "Open Profile", onClick: () => (window.location.href = withLocale(locale, "/app/profile")) },
        );
      } else {
        toast.error(locale === "sr" ? "Reakcija nije sačuvana." : "Reaction could not be saved.");
      }
    }
  }

  async function handleFavorite(postId: string) {
    if (!onToggleFavorite) return;
    try {
      await onToggleFavorite(postId);
    } catch {
      toast.error(locale === "sr" ? "Čuvanje diskusije nije uspelo." : "Saving the discussion failed.");
    }
  }
  const pinnedIds = new Set(pinnedPosts.map((post) => post._id));
  const feedPosts = posts.filter((post) => !pinnedIds.has(post._id));

  function renderThread(post: CommunityPostRow, highlighted = false) {
    return (
      <ThreadCard
        key={post._id}
        locale={locale}
        post={post}
        track={postTrackTitle(post, filters, locale)}
        course={postCourseTitle(post, filters, locale)}
        highlighted={highlighted}
        leadingAction={
          <>
            <div className="flex items-center gap-0.5 text-ink">
              <button
                type="button"
                disabled={!canInteract || !onReactPost}
                onClick={(event) => {
                  event.stopPropagation();
                  void handlePostReaction(post._id, "upvote");
                }}
                aria-label={locale === "sr" ? "Upvote diskusije" : "Upvote discussion"}
                aria-pressed={post.userVote === "upvote"}
                className="grid size-11 place-items-center rounded-full text-muted transition hover:bg-emerald-50 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-35 sm:size-8"
              >
                <ArrowBigUp className={cn("size-[18px] fill-transparent", post.userVote === "upvote" && "fill-emerald-500 text-emerald-600")} />
              </button>
              <span className={cn("min-w-8 text-center text-xs font-black", (post.voteScore ?? 0) < 0 && "text-red-700")}>
                {post.voteScore ?? 0}
                <span className="sr-only"> {locale === "sr" ? "neto glasova" : "net votes"}</span>
              </span>
              <button
                type="button"
                disabled={!canInteract || !onReactPost}
                onClick={(event) => {
                  event.stopPropagation();
                  void handlePostReaction(post._id, "downvote");
                }}
                aria-label={locale === "sr" ? "Downvote diskusije" : "Downvote discussion"}
                aria-pressed={post.userVote === "downvote"}
                className="grid size-11 place-items-center rounded-full text-muted transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-35 sm:size-8"
              >
                <ArrowBigDown className={cn("size-[18px] fill-transparent", post.userVote === "downvote" && "fill-red-500 text-red-600")} />
              </button>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                const willOpen = expandedPostId !== post._id;
                setExpandedPostId((current) => (current === post._id ? null : post._id));
                if (willOpen) {
                  window.requestAnimationFrame(() => {
                    document.querySelector<HTMLElement>(`[data-community-comments="${post._id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  });
                }
              }}
              aria-expanded={expandedPostId === post._id}
              aria-label={`${expandedPostId === post._id ? (locale === "sr" ? "Sakrij komentare treda" : "Hide thread comments") : locale === "sr" ? "Prikaži komentare treda" : "Show thread comments"} (${post.commentsCount ?? 0})`}
              className={cn(
                "inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-xs font-black text-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink sm:min-h-8",
                expandedPostId === post._id && "bg-ink/5 text-ink",
              )}
            >
              <MessageCircle className="size-[18px]" aria-hidden="true" />
              {post.commentsCount ?? 0}
            </button>
          </>
        }
        action={
          <div className="flex items-center gap-0.5">
            <ShareThreadButton locale={locale} post={post} />
            <button
              type="button"
              disabled={!canInteract || !onToggleFavorite}
              onClick={(event) => {
                event.stopPropagation();
                void handleFavorite(post._id);
              }}
              aria-label={post.isFavorited ? locale === "sr" ? "Ukloni iz sačuvanih" : "Remove from saved" : locale === "sr" ? "Sačuvaj diskusiju" : "Save discussion"}
              aria-pressed={Boolean(post.isFavorited)}
              className={cn(
                "grid size-11 place-items-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-35 sm:size-8",
                post.isFavorited && "bg-yellow/25 text-ink",
              )}
            >
              <Bookmark className={cn("size-[18px]", post.isFavorited && "fill-ink")} aria-hidden="true" />
            </button>
          </div>
        }
        below={
          expandedPostId === post._id ? (
            <CommentsSection
              postId={post._id}
              locale={locale}
              isAuthenticated={isAuthenticated}
              canModerate={canModerate}
              canMarkHelpful={canModerate || post.authorId === viewerUserId}
              canInteract={canInteract}
              viewerUserId={viewerUserId}
              compact
              showCommandDock
            />
          ) : null
        }
      />
    );
  }

  return (
    <div className="space-y-5">

      <CommunityStickyToolbar>
      <section className="rounded-[16px] border border-line bg-white p-3 sm:p-4" aria-label={locale === "sr" ? "Filteri diskusija" : "Discussion filters"}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CommunityScopeControls
              locale={locale}
              filters={filters}
              scopeState={scopeState}
              compact
              mode="toggle"
              manualOpen={manualOpen}
              setManualOpen={setManualOpen}
            />
            <div className="w-full sm:w-[360px] sm:shrink-0">
              <CommunitySearch
                value={controls.search}
                onChange={controls.setSearch}
                placeholder={locale === "sr" ? "Pretraži naslov, pitanje ili autora" : "Search title, question, or author"}
                label={locale === "sr" ? "Pretraži diskusije" : "Search discussions"}
              />
            </div>
            <label className="relative block shrink-0 w-full sm:w-auto">
              <span className="sr-only">{locale === "sr" ? "Sortiraj diskusije" : "Sort discussions"}</span>
              <select
                value={controls.sort}
                onChange={(event) => controls.setSort(event.target.value as DiscussionSort)}
                className="min-h-10 w-full appearance-none rounded-full border border-line bg-white py-2 pl-4 pr-10 text-sm font-black text-ink outline-none transition hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25 sm:w-auto"
              >
                <option value="hot">{locale === "sr" ? "U trendu" : "Hot"}</option>
                <option value="top">{locale === "sr" ? "Popularno" : "Top voted"}</option>
                <option value="latest">{locale === "sr" ? "Najnovije" : "Latest"}</option>
                <option value="active">{locale === "sr" ? "Aktivno" : "Active"}</option>
                <option value="unanswered">{locale === "sr" ? "Bez odgovora" : "Unanswered"}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            </label>
            {canInteract ? (
              <Link
                href={withLocale(locale, "/app/community/new")}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[2px_2px_0_rgba(14,49,88,0.16)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink w-full sm:w-auto"
              >
                <PenLine className="size-4" aria-hidden="true" />
                {locale === "sr" ? "Nova diskusija" : "New discussion"}
              </Link>
            ) : (
              <span className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-black text-muted w-full sm:w-auto">
                {locale === "sr" ? "Podesi username" : "Set username"}
              </span>
            )}
          </div>
          <CommunityScopeControls
            locale={locale}
            filters={filters}
            scopeState={scopeState}
            compact
            mode="selects"
            manualOpen={manualOpen}
            setManualOpen={setManualOpen}
          />
        </div>
      </section>
      </CommunityStickyToolbar>

      {loading ? (
        <CommunityRouteSkeleton />
      ) : (
        <div className="space-y-6">
          {pinnedPosts.length ? (
            <section className="space-y-3" aria-label={locale === "sr" ? "Zakačeni threadovi" : "Pinned threads"}>
              <div className="flex items-center gap-2 px-1">
                <Pin className="size-4 text-yellow-600" aria-hidden="true" />
                <h2 className="text-sm font-black uppercase tracking-[0.1em] text-ink/70">
                  {locale === "sr" ? "Zakačeni threadovi" : "Pinned threads"}
                </h2>
                <span className="rounded-full bg-yellow/20 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-ink/65">
                  {locale === "sr" ? "Admin izbor" : "Admin picks"}
                </span>
              </div>
              <div className="space-y-3">{pinnedPosts.map((post) => renderThread(post, true))}</div>
            </section>
          ) : null}
          <section className="min-w-0 space-y-3" aria-live="polite" aria-label={locale === "sr" ? "Lista diskusija" : "Discussion list"}>
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <MessageSquareText className="size-4 text-ink/60" aria-hidden="true" />
                <h2 className="text-sm font-black uppercase tracking-[0.1em] text-ink/65">
                  {locale === "sr" ? "Razgovori" : "Conversations"}
                </h2>
              </div>
              <span className="font-mono text-xs font-black text-muted">
                {feedPosts.length} {locale === "sr" ? "učitano" : "loaded"}
              </span>
            </div>
            {feedPosts.length ? feedPosts.map((post) => renderThread(post)) : (
              <EmptyCommunityState
                locale={locale}
                icon={MessageSquareText}
                title={locale === "sr" ? "Nema drugih diskusija za ovaj izbor" : "No other discussions match this view"}
                body={locale === "sr" ? "Promeni opseg ili pretragu, ili pokreni prvu diskusiju za ovaj kurs." : "Change the scope or search, or start the first discussion for this course."}
              />
            )}
            {canLoadMore && onLoadMore ? (
              <div className="flex justify-center pt-3">
                <LoadMoreButton locale={locale} loading={loadingMore} onClick={onLoadMore} />
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
