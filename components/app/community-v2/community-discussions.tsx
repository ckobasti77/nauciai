"use client";

import { Bookmark, ChevronDown, Lightbulb, MessageSquareText, PenLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";
import { withLocale } from "@/lib/i18n";

import {
  fallbackCommunityFilters,
  fallbackCommunityPosts,
  useCommunityFilters,
  useCommunityPosts,
  useToggleCommunityFavorite,
} from "./community-data";
import { CommunityScopeControls, useCommunityQueryParams, useResolvedCommunityScope } from "./community-filters";
import {
  CommunityPageHeading,
  CommunityRouteSkeleton,
  CommunitySearch,
  EmptyCommunityState,
  LearningSpine,
  LoadMoreButton,
  ScopeTrail,
  ThreadCard,
} from "./community-shared";
import type { CommunityFilters, CommunityPostRow } from "./community-types";

type DiscussionSort = "latest" | "active" | "unanswered";

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
    requestedSort === "active" || requestedSort === "unanswered" ? requestedSort : "latest";

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
    setSort: (next: DiscussionSort) => update({ sort: next === "latest" ? undefined : next }),
  };
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
    return fallbackCommunityPosts.filter(
      (post) => !needle || `${post.title} ${post.body}`.toLocaleLowerCase().includes(needle),
    );
  }, [controls.query]);

  return (
    <DiscussionsView
      locale={locale}
      filters={fallbackCommunityFilters}
      scopeState={scopeState}
      controls={controls}
      posts={posts}
      loading={false}
      canLoadMore={false}
      loadingMore={false}
    />
  );
}

function LiveDiscussionsPage({ locale }: { locale: Locale }) {
  const { filters, isLoading: filtersLoading } = useCommunityFilters(true);
  const scopeState = useResolvedCommunityScope(filters, locale);
  const controls = useDiscussionControls();
  const postsQuery = useCommunityPosts({
    scope: filtersLoading ? { kind: "global" } : scopeState.scope,
    search: controls.query || undefined,
    sort: controls.sort,
  });
  const toggleFavorite = useToggleCommunityFavorite();

  return (
    <DiscussionsView
      locale={locale}
      filters={filters}
      scopeState={scopeState}
      controls={controls}
      posts={postsQuery.results}
      loading={filtersLoading || postsQuery.isInitialLoading}
      canLoadMore={postsQuery.status === "CanLoadMore"}
      loadingMore={postsQuery.status === "LoadingMore"}
      onLoadMore={() => postsQuery.loadMore(20)}
      onToggleFavorite={(postId) => toggleFavorite({ postId })}
    />
  );
}

function DiscussionsView({
  locale,
  filters,
  scopeState,
  controls,
  posts,
  loading,
  canLoadMore,
  loadingMore,
  onLoadMore,
  onToggleFavorite,
}: {
  locale: Locale;
  filters: CommunityFilters;
  scopeState: ReturnType<typeof useResolvedCommunityScope>;
  controls: ReturnType<typeof useDiscussionControls>;
  posts: CommunityPostRow[];
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
  onToggleFavorite?: (postId: string) => Promise<unknown>;
}) {
  const mentorPicks = posts.filter((post) => post.isFeaturedGlobal || post.isPinned).slice(0, 3);
  const feedPosts = posts.filter((post) => !mentorPicks.some((pick) => pick._id === post._id));

  return (
    <div className="space-y-6">
      <CommunityPageHeading
        eyebrow={locale === "sr" ? "Otvoreni studio" : "Open studio"}
        title={locale === "sr" ? "Diskusije koje pomeraju rad napred" : "Discussions that move the work forward"}
        body={
          locale === "sr"
            ? "Pronađi odgovor po smeru ili kursu, vidi šta je aktivno i otvori pitanje sa dovoljno konteksta."
            : "Find answers by track or course, see what is active, and open a question with enough context."
        }
        action={
          <Link
            href={withLocale(locale, "/app/community/new")}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[3px_3px_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <PenLine className="size-4" aria-hidden="true" />
            {locale === "sr" ? "Nova diskusija" : "New discussion"}
          </Link>
        }
      />

      <section className="rounded-[16px]! border border-line bg-white p-3 sm:p-4" aria-label={locale === "sr" ? "Filteri diskusija" : "Discussion filters"}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <CommunitySearch
              value={controls.search}
              onChange={controls.setSearch}
              placeholder={locale === "sr" ? "Pretraži naslov, pitanje ili autora" : "Search title, question, or author"}
              label={locale === "sr" ? "Pretraži diskusije" : "Search discussions"}
            />
            <label className="relative block shrink-0">
              <span className="sr-only">{locale === "sr" ? "Sortiraj diskusije" : "Sort discussions"}</span>
              <select
                value={controls.sort}
                onChange={(event) => controls.setSort(event.target.value as DiscussionSort)}
                className="min-h-11 w-full appearance-none rounded-full border border-line bg-white py-2 pl-4 pr-10 text-sm font-black text-ink outline-none transition hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25 sm:w-auto"
              >
                <option value="latest">{locale === "sr" ? "Najnovije" : "Latest"}</option>
                <option value="active">{locale === "sr" ? "Aktivno" : "Active"}</option>
                <option value="unanswered">{locale === "sr" ? "Bez odgovora" : "Unanswered"}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            </label>
          </div>
          <CommunityScopeControls locale={locale} filters={filters} scopeState={scopeState} compact />
        </div>
      </section>

      {loading ? (
        <CommunityRouteSkeleton />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 space-y-3" aria-live="polite" aria-label={locale === "sr" ? "Lista diskusija" : "Discussion list"}>
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <MessageSquareText className="size-4 text-ink/60" aria-hidden="true" />
                <h2 className="text-sm font-black uppercase tracking-[0.1em] text-ink/65">
                  {locale === "sr" ? "Razgovori" : "Conversations"}
                </h2>
              </div>
              <span className="font-mono text-xs font-black text-muted">
                {posts.length} {locale === "sr" ? "učitano" : "loaded"}
              </span>
            </div>
            {feedPosts.length ? (
              feedPosts.map((post) => (
                <ThreadCard
                  key={post._id}
                  locale={locale}
                  post={post}
                  track={postTrackTitle(post, filters, locale)}
                  course={postCourseTitle(post, filters, locale)}
                  action={
                    onToggleFavorite ? (
                      <button
                        type="button"
                        onClick={() => void onToggleFavorite(post._id)}
                        aria-label={
                          post.isFavorited
                            ? locale === "sr"
                              ? "Ukloni iz sačuvanih"
                              : "Remove from saved"
                            : locale === "sr"
                              ? "Sačuvaj diskusiju"
                              : "Save discussion"
                        }
                        aria-pressed={Boolean(post.isFavorited)}
                        className={cn(
                          "grid size-11 place-items-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                          post.isFavorited ? "border-ink bg-yellow text-ink" : "border-line bg-white text-muted hover:border-ink hover:text-ink",
                        )}
                      >
                        <Bookmark className={cn("size-4", post.isFavorited && "fill-ink")} aria-hidden="true" />
                      </button>
                    ) : undefined
                  }
                />
              ))
            ) : (
              <EmptyCommunityState
                locale={locale}
                icon={MessageSquareText}
                title={locale === "sr" ? "Nema diskusija za ovaj izbor" : "No discussions match this view"}
                body={
                  locale === "sr"
                    ? "Promeni opseg ili pretragu, ili pokreni prvu diskusiju za ovaj kurs."
                    : "Change the scope or search, or start the first discussion for this course."
                }
                action={
                  <Link
                    href={withLocale(locale, "/app/community/new")}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink bg-yellow px-4 text-sm font-black text-ink"
                  >
                    {locale === "sr" ? "Pokreni diskusiju" : "Start a discussion"}
                  </Link>
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
            <LearningSpine
              locale={locale}
              scope={scopeState.scope}
              track={scopeState.trackLabel}
              course={scopeState.courseLabel}
            />
            <section className="rounded-[16px]! border border-ink bg-white p-4 shadow-[4px_4px_0_rgba(244,190,48,0.7)]">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-yellow text-ink">
                  <Sparkles className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                    {locale === "sr" ? "Kurirano" : "Curated"}
                  </p>
                  <h2 className="text-base font-black text-ink">
                    {locale === "sr" ? "Mentorski izbor" : "Mentor picks"}
                  </h2>
                </div>
              </div>
              {mentorPicks.length ? (
                <ol className="mt-4 divide-y divide-line">
                  {mentorPicks.map((post, index) => (
                    <li key={post._id} className="py-3 first:pt-0 last:pb-0">
                      <Link
                        href={
                          post._id.startsWith("preview-")
                            ? withLocale(locale, "/app/community/discussions")
                            : withLocale(locale, `/app/community/${post._id}`)
                        }
                        className="group block rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        <span className="font-mono text-[10px] font-black text-yellow">0{index + 1}</span>
                        <span className="mt-1 block text-sm font-black leading-5 text-ink group-hover:underline">{post.title}</span>
                        <span className="mt-1 block">
                          <ScopeTrail
                            locale={locale}
                            track={postTrackTitle(post, filters, locale)}
                            course={postCourseTitle(post, filters, locale)}
                            compact
                          />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="mt-4 flex items-start gap-2 rounded-[12px] bg-[#eef3f7] p-3 text-sm font-semibold leading-5 text-muted">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden="true" />
                  {locale === "sr"
                    ? "Mentorski odgovori će se pojaviti ovde kada budu označeni."
                    : "Mentor answers will appear here when they are selected."}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
