"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Globe2,
  GraduationCap,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Send,
  Star,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppComposerSheet } from "@/components/app/app-composer-sheet";
import { CommentsSection } from "@/components/app/community-comments";
import {
  CommunityAvatar,
  formatCommunityTime,
  type CommunityRank,
  type CommunityRole,
} from "@/components/app/community-identity";
import { Panel, SectionHeader, cn } from "@/components/ui/primitives";
import { communityPosts } from "@/lib/content";
import { localized, type Locale, withLocale } from "@/lib/i18n";

type CommunityCourseOption = {
  _id?: string;
  slug: string;
  titleSr: string;
  titleEn: string;
};

type LiveCommunityPost = {
  _id: string;
  courseId?: string;
  featuredCourseId?: string;
  isFeaturedGlobal?: boolean;
  title: string;
  body: string;
  createdAt: number;
  authorName: string;
  authorRole: CommunityRole;
  authorAvatarUrl?: string | null;
  authorRank?: CommunityRank;
  courseSlug?: string;
  courseTitleSr?: string;
  courseTitleEn?: string;
  userReaction?: string;
  commentsCount: number;
  reactionsCount: number;
};

type ThreadRowPost = LiveCommunityPost & {
  href?: string;
};

type SortMode = "newest" | "comments" | "reactions";

export function CommunityBoard({ locale, initialCourseSlug }: { locale: Locale; initialCourseSlug?: string }) {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <LiveCommunityBoard locale={locale} initialCourseSlug={initialCourseSlug} />;
  }

  return <StaticCommunityBoard locale={locale} />;
}

function StaticCommunityBoard({ locale }: { locale: Locale }) {
  const [posts, setPosts] = useState<ThreadRowPost[]>(
    communityPosts.map((post, index) => ({
      _id: post.id,
      title: localized(post.title, locale),
      body: localized(post.body, locale),
      createdAt: post.createdAt,
      authorName: post.author,
      authorRole: post.role,
      commentsCount: post.comments,
      reactionsCount: post.reactions,
      isFeaturedGlobal: index < 2,
      href: "#",
    })),
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  function addPost(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;

    setPosts((current) => [
      {
        _id: `local-${Date.now()}`,
        authorName: "Clan zajednice",
        authorRole: "student",
        authorRank: { level: 1, label: "Nivo 1", completedLessons: 0 },
        title: draftTitle.trim() || (locale === "sr" ? "Pitanje iz zajednice" : "Community question"),
        body: draft.trim(),
        createdAt: Date.now(),
        reactionsCount: 0,
        commentsCount: 0,
        href: "#",
      },
      ...current,
    ]);
    setDraftTitle("");
    setDraft("");
    setComposerOpen(false);
  }

  const sortedPosts = sortPosts(posts, sortMode);
  const pinnedPosts = sortedPosts.filter((post) => post.isFeaturedGlobal);
  const regularPosts = sortedPosts.filter((post) => !post.isFeaturedGlobal);

  return (
    <div className="space-y-6">
      <CommunityHeader locale={locale} onCompose={() => setComposerOpen(true)} />
      <DiscussionTable
        locale={locale}
        pinnedPosts={pinnedPosts}
        regularPosts={regularPosts}
        isAuthenticated
        canPin={false}
        canModerate={false}
        sortMode={sortMode}
        onSortChange={setSortMode}
      />
      <AppComposerSheet
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        eyebrow={locale === "sr" ? "Zajednica" : "Community"}
        title={locale === "sr" ? "Nova diskusija" : "New discussion"}
      >
        <CommunityComposerForm
          locale={locale}
          draftTitle={draftTitle}
          draft={draft}
          selectedCourseId=""
          courses={[]}
          isAdmin={false}
          featureGlobal={false}
          featureCourse={false}
          isAuthenticated
          status={null}
          onDraftTitleChange={setDraftTitle}
          onDraftChange={setDraft}
          onCourseChange={() => undefined}
          onFeatureGlobalChange={() => undefined}
          onFeatureCourseChange={() => undefined}
          onSubmit={addPost}
        />
      </AppComposerSheet>
    </div>
  );
}

function LiveCommunityBoard({ locale, initialCourseSlug }: { locale: Locale; initialCourseSlug?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "discussions";

  const { isAuthenticated } = useConvexAuth();
  const viewerData = useQuery(api.courses.viewer, isAuthenticated ? {} : "skip") as
    | { profile?: { role?: CommunityRole } }
    | undefined;
  const navigation = useQuery(api.courses.getAppNavigation, isAuthenticated ? {} : "skip") as
    | { courses?: CommunityCourseOption[] }
    | undefined;
  const setFeaturedFlags = useMutation(api.community.setFeaturedFlags);
  const reactPost = useMutation(api.community.react);
  const deletePost = useMutation(api.community.deletePost);

  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [myPostsFilter, setMyPostsFilter] = useState<"published" | "draft">("published");

  const viewerRole = viewerData?.profile?.role;
  const canPin = viewerRole === "admin";
  const canModerate = viewerRole === "admin" || viewerRole === "moderator";
  const courses = useMemo(() => navigation?.courses ?? [], [navigation?.courses]);
  const initialCourseId = useMemo(
    () => courses.find((item) => item.slug === initialCourseSlug)?._id ?? "",
    [courses, initialCourseSlug],
  );
  
  // Dynamic badge counts
  const notificationCounts = useQuery(
    api.notifications.getCommunityNotificationCounts,
    isAuthenticated ? {} : "skip"
  );

  const myThreadsBadge = notificationCounts?.myThreads ?? 0;
  const mentionsBadge = notificationCounts?.mentions ?? 0;
  const pendingApprovalsBadge = notificationCounts?.pendingApprovals ?? 0;

  // Mark mentions as read when viewing mentions tab
  const markMentionsAsRead = useMutation(api.notifications.markMentionsAsRead);
  useEffect(() => {
    if (activeTab === "mentions" && isAuthenticated) {
      markMentionsAsRead({});
    }
  }, [activeTab, isAuthenticated, markMentionsAsRead]);

  // Tab definitions
  const tabs = [
    { id: "discussions", label: locale === "sr" ? "Diskusije" : "Discussions", badge: 0 },
    { id: "my-threads", label: locale === "sr" ? "Moji tredovi" : "My Threads", badge: myThreadsBadge },
    { id: "mentions", label: locale === "sr" ? "Pominjanja" : "Mentions", badge: mentionsBadge },
    { id: "members", label: locale === "sr" ? "Clanovi" : "Members", badge: 0 },
    ...(canModerate ? [{ id: "approvals", label: locale === "sr" ? "Odobrenja" : "Approvals", badge: pendingApprovalsBadge }] : []),
  ];

  // Fetching data per tab
  const livePosts = useQuery(
    api.community.listPosts,
    initialCourseId ? { courseId: initialCourseId as Id<"courses"> } : {},
  ) as LiveCommunityPost[] | undefined;

  const myPosts = useQuery(
    api.community.listMyPosts,
    isAuthenticated ? { status: myPostsFilter } : "skip"
  ) as LiveCommunityPost[] | undefined;

  const mentionedPosts = useQuery(
    api.community.listMentions,
    isAuthenticated ? {} : "skip"
  ) as LiveCommunityPost[] | undefined;

  const pendingPosts = useQuery(
    api.community.listPendingPosts,
    canModerate ? {} : "skip"
  ) as LiveCommunityPost[] | undefined;

  const membersList = useQuery(api.community.listMembers, {});

  // Determine current posts to show based on activeTab
  let currentPosts: LiveCommunityPost[] | undefined;
  if (activeTab === "discussions") {
    currentPosts = livePosts;
  } else if (activeTab === "my-threads") {
    currentPosts = myPosts;
  } else if (activeTab === "mentions") {
    currentPosts = mentionedPosts;
  } else if (activeTab === "approvals") {
    currentPosts = pendingPosts;
  }

  const sortedPosts = useMemo(() => sortPosts(currentPosts ?? [], sortMode), [currentPosts, sortMode]);
  const pinnedPosts = useMemo(() => {
    if (activeTab !== "discussions") return [];
    return sortedPosts.filter((post) => isPinnedPost(post, initialCourseId));
  }, [sortedPosts, activeTab, initialCourseId]);
  const regularPosts = useMemo(() => {
    if (activeTab !== "discussions") return sortedPosts;
    return sortedPosts.filter((post) => !isPinnedPost(post, initialCourseId));
  }, [sortedPosts, activeTab, initialCourseId]);

  async function toggleFeatured(post: LiveCommunityPost, kind: "global" | "course") {
    const nextGlobal = kind === "global" ? !post.isFeaturedGlobal : Boolean(post.isFeaturedGlobal);
    const currentCourseTarget = post.featuredCourseId ?? post.courseId ?? initialCourseId;
    const nextCourseTarget =
      kind === "course" ? (post.featuredCourseId ? undefined : currentCourseTarget) : post.featuredCourseId;

    await setFeaturedFlags({
      postId: post._id as Id<"communityPosts">,
      isFeaturedGlobal: nextGlobal,
      ...(nextCourseTarget ? { featuredCourseId: nextCourseTarget as Id<"courses"> } : {}),
    });
  }

  async function handleLike(postId: string) {
    if (!isAuthenticated) return;
    await reactPost({
      targetType: "post",
      targetId: postId,
      reaction: "like",
    });
  }

  async function handleDeletePost(postId: string) {
    const confirmMsg =
      locale === "sr"
        ? "Da li si siguran da zelis da obrises ovu diskusiju?"
        : "Are you sure you want to delete this discussion?";
    if (window.confirm(confirmMsg)) {
      await deletePost({ postId: postId as Id<"communityPosts"> });
    }
  }

  function toggleComments(postId: string) {
    setExpandedComments((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  }

  return (
    <div className="space-y-6">
      <CommunityHeader
        locale={locale}
        onCompose={() => router.push(withLocale(locale, "/app/community/new"))}
      />

      {/* Horizontal Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => router.push(withLocale(locale, `/app/community?tab=${tab.id}`))}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-black transition cursor-pointer",
              activeTab === tab.id
                ? "border-ink bg-yellow text-ink shadow-[2px_2px_0_rgba(14,49,88,0.15)]"
                : "border-line bg-white text-ink/70 hover:border-ink hover:bg-paper"
            )}
          >
            <span>{tab.label}</span>
            {tab.badge > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white border border-ink shrink-0">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {activeTab === "my-threads" ? (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMyPostsFilter("published")}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border-2 px-4 text-xs font-black transition cursor-pointer",
              myPostsFilter === "published"
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-ink/75 hover:border-ink"
            )}
          >
            {locale === "sr" ? "Objavljeni" : "Published"}
          </button>
          <button
            onClick={() => setMyPostsFilter("draft")}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border-2 px-4 text-xs font-black transition cursor-pointer",
              myPostsFilter === "draft"
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-ink/75 hover:border-ink"
            )}
          >
            {locale === "sr" ? "Skice" : "Drafts"}
          </button>
        </div>
      ) : null}

      {activeTab === "members" ? (
        <div className="space-y-6">
          {!membersList ? (
            <Panel className="grid min-h-72 place-items-center rounded-[16px] p-10 bg-white border-2 border-ink">
              <Loader2 className="size-10 animate-spin text-yellow" />
            </Panel>
          ) : (
            <div className="space-y-8">
              {["admin", "moderator", "pro_student", "student"].map((roleGroup) => {
                const groupMembers = membersList.filter((m) => m.role === roleGroup);
                if (groupMembers.length === 0) return null;

                const roleTitle =
                  roleGroup === "admin"
                    ? (locale === "sr" ? "Administratori" : "Administrators")
                    : roleGroup === "moderator"
                      ? (locale === "sr" ? "Moderatori" : "Moderators")
                      : roleGroup === "pro_student"
                        ? (locale === "sr" ? "Pro Clanovi" : "Pro Members")
                        : (locale === "sr" ? "Studenti" : "Students");

                return (
                  <div key={roleGroup} className="space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-[0.08em] text-ink/65 pl-2">{roleTitle}</h3>
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {groupMembers.map((member) => (
                        <Panel
                          key={member._id}
                          className="flex items-center gap-3 rounded-[16px] border-2 border-ink bg-white p-3 shadow-[4px_4px_0_rgba(14,49,88,0.1)]"
                        >
                          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink bg-yellow text-xs font-black">
                            {member.avatarUrl ? (
                              <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span>{member.name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-ink">{member.name}</p>
                            {member.username ? (
                              <p className="truncate text-xs font-bold text-muted/70">@{member.username}</p>
                            ) : (
                              <p className="text-xs text-muted/50 italic">{locale === "sr" ? "Nema username" : "No username"}</p>
                            )}
                          </div>
                        </Panel>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : !currentPosts ? (
        <Panel className="grid min-h-72 place-items-center rounded-[16px] p-10 bg-white border-2 border-ink shadow-[6px_6px_0_rgba(14,49,88,0.12)]">
          <Loader2 className="size-10 animate-spin text-yellow" />
        </Panel>
      ) : (
        <DiscussionTable
          locale={locale}
          pinnedPosts={pinnedPosts}
          regularPosts={regularPosts}
          isAuthenticated={isAuthenticated}
          canPin={canPin}
          canModerate={canModerate}
          sortMode={sortMode}
          expandedComments={expandedComments}
          onSortChange={setSortMode}
          onLike={handleLike}
          onToggleComments={toggleComments}
          onToggleFeatured={toggleFeatured}
          onDeletePost={handleDeletePost}
          courseLabel={(post) => courseLabel(post, courses, locale)}
        />
      )}
    </div>
  );
}

function CommunityHeader({ locale, onCompose }: { locale: Locale; onCompose: () => void }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <SectionHeader
        title={locale === "sr" ? "Diskusije" : "Discussions"}
        body={
          locale === "sr"
            ? "Zajednica za pitanja, odgovore i rezultate iz kurseva."
            : "A community space for course questions, answers, and results."
        }
      />
      <button
        type="button"
        onClick={onCompose}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-4 text-sm font-black text-ink shadow-[4px_4px_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_rgba(14,49,88,0.18)] active:translate-y-0.5 active:shadow-[2px_2px_0_rgba(14,49,88,0.18)]"
      >
        <Plus className="size-4" />
        {locale === "sr" ? "Nova diskusija" : "New discussion"}
      </button>
    </div>
  );
}

function DiscussionTable({
  locale,
  pinnedPosts,
  regularPosts,
  isAuthenticated,
  canPin,
  canModerate,
  sortMode,
  expandedComments = {},
  onSortChange,
  onLike,
  onToggleComments,
  onToggleFeatured,
  onDeletePost,
  courseLabel,
}: {
  locale: Locale;
  pinnedPosts: ThreadRowPost[];
  regularPosts: ThreadRowPost[];
  isAuthenticated: boolean;
  canPin: boolean;
  canModerate: boolean;
  sortMode: SortMode;
  expandedComments?: Record<string, boolean>;
  onSortChange: (mode: SortMode) => void;
  onLike?: (postId: string) => Promise<void>;
  onToggleComments?: (postId: string) => void;
  onToggleFeatured?: (post: LiveCommunityPost, kind: "global" | "course") => Promise<void>;
  onDeletePost?: (postId: string) => Promise<void>;
  courseLabel?: (post: ThreadRowPost) => string;
}) {
  return (
    <Panel className="overflow-visible rounded-[16px] border-2 border-ink bg-white shadow-[6px_6px_0_rgba(14,49,88,0.12)]">
      <div className="flex flex-col gap-3 border-b-2 border-ink p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-black text-ink">{locale === "sr" ? "Diskusije" : "Discussions"}</h2>
        <label className="flex items-center gap-2 text-xs font-black uppercase text-muted">
          <span>{locale === "sr" ? "Sortiranje" : "Sort"}</span>
          <select
            value={sortMode}
            onChange={(event) => onSortChange(event.target.value as SortMode)}
            className="min-h-10 rounded-full border-2 border-ink bg-white px-3 text-sm font-black normal-case text-ink outline-none focus:border-yellow focus:ring-4 focus:ring-yellow/10"
          >
            <option value="newest">{locale === "sr" ? "Najnovije" : "Newest"}</option>
            <option value="comments">{locale === "sr" ? "Komentari" : "Comments"}</option>
            <option value="reactions">{locale === "sr" ? "Reakcije" : "Reactions"}</option>
          </select>
        </label>
      </div>

      <ThreadGroup
        title={locale === "sr" ? "Zakaceno" : "Pinned"}
        posts={pinnedPosts}
        locale={locale}
        emptyLabel={locale === "sr" ? "Nema zakacenih diskusija." : "No pinned discussions."}
        isAuthenticated={isAuthenticated}
        canPin={canPin}
        canModerate={canModerate}
        expandedComments={expandedComments}
        onLike={onLike}
        onToggleComments={onToggleComments}
        onToggleFeatured={onToggleFeatured}
        onDeletePost={onDeletePost}
        courseLabel={courseLabel}
      />

      <div className="border-y-2 border-ink bg-paper px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-ink/60">
        {locale === "sr" ? "Ostale diskusije" : "Other discussions"}
      </div>

      <ThreadGroup
        title={locale === "sr" ? "Ostale diskusije" : "Other discussions"}
        posts={regularPosts}
        locale={locale}
        emptyLabel={locale === "sr" ? "Nema ostalih diskusija." : "No other discussions."}
        isAuthenticated={isAuthenticated}
        canPin={canPin}
        canModerate={canModerate}
        expandedComments={expandedComments}
        onLike={onLike}
        onToggleComments={onToggleComments}
        onToggleFeatured={onToggleFeatured}
        onDeletePost={onDeletePost}
        courseLabel={courseLabel}
        hideTitle
      />
    </Panel>
  );
}

function ThreadGroup({
  title,
  posts,
  locale,
  emptyLabel,
  isAuthenticated,
  canPin,
  canModerate,
  expandedComments,
  onLike,
  onToggleComments,
  onToggleFeatured,
  onDeletePost,
  courseLabel,
  hideTitle = false,
}: {
  title: string;
  posts: ThreadRowPost[];
  locale: Locale;
  emptyLabel: string;
  isAuthenticated: boolean;
  canPin: boolean;
  canModerate: boolean;
  expandedComments: Record<string, boolean>;
  onLike?: (postId: string) => Promise<void>;
  onToggleComments?: (postId: string) => void;
  onToggleFeatured?: (post: LiveCommunityPost, kind: "global" | "course") => Promise<void>;
  onDeletePost?: (postId: string) => Promise<void>;
  courseLabel?: (post: ThreadRowPost) => string;
  hideTitle?: boolean;
}) {
  return (
    <section aria-label={title}>
      {!hideTitle ? (
        <div className="px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-ink/60">{title}</div>
      ) : null}
      {posts.length === 0 ? (
        <div className="border-t border-line px-4 py-7 text-center text-sm font-black text-ink/45">{emptyLabel}</div>
      ) : (
        <div className="divide-y divide-line">
          {posts.map((post) => (
            <ThreadRow
              key={post._id}
              post={post}
              locale={locale}
              isAuthenticated={isAuthenticated}
              canPin={canPin}
              canModerate={canModerate}
              showComments={Boolean(expandedComments[post._id])}
              scopeLabel={courseLabel?.(post) ?? (locale === "sr" ? "Opsta diskusija" : "General discussion")}
              onLike={onLike}
              onToggleComments={onToggleComments}
              onToggleFeatured={onToggleFeatured}
              onDeletePost={onDeletePost}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ThreadRow({
  post,
  locale,
  isAuthenticated,
  canPin,
  canModerate,
  showComments,
  scopeLabel,
  onLike,
  onToggleComments,
  onToggleFeatured,
  onDeletePost,
}: {
  post: ThreadRowPost;
  locale: Locale;
  isAuthenticated: boolean;
  canPin: boolean;
  canModerate: boolean;
  showComments: boolean;
  scopeLabel: string;
  onLike?: (postId: string) => Promise<void>;
  onToggleComments?: (postId: string) => void;
  onToggleFeatured?: (post: LiveCommunityPost, kind: "global" | "course") => Promise<void>;
  onDeletePost?: (postId: string) => Promise<void>;
}) {
  const href = post.href ?? withLocale(locale, `/app/community/${post._id}`);
  const rowContent = (
    <>
      <div className="flex min-w-0 items-center gap-3 md:flex-col md:items-center md:justify-center">
        <CommunityAvatar
          name={post.authorName}
          avatarUrl={post.authorAvatarUrl}
          role={post.authorRole}
          rank={post.authorRank}
          locale={locale}
          size="md"
        />
        <div className="min-w-0 md:w-full md:text-center">
          <p className="truncate text-xs font-black text-ink" title={post.authorName}>
            {post.authorName}
          </p>
          <p className="mt-0.5 truncate text-[10px] font-bold text-ink/45">{formatCommunityTime(post.createdAt, locale)}</p>
        </div>
      </div>
      <div className="min-w-0 md:grid md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:items-center md:gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            {post.isFeaturedGlobal || post.featuredCourseId ? (
              <Star className="size-3.5 shrink-0 fill-yellow text-ink" aria-hidden="true" />
            ) : null}
            <h3 className="min-w-0 truncate text-sm font-black leading-6 text-ink sm:text-base" title={post.title}>
              {post.title}
            </h3>
          </div>
          <div className="hidden min-w-0 items-center gap-1 text-[10px] font-black uppercase text-ink/45 md:flex">
            {post.courseId ? <GraduationCap className="size-3 shrink-0" /> : <Globe2 className="size-3 shrink-0" />}
            <span className="truncate">{scopeLabel}</span>
          </div>
        </div>
        <span className="hidden h-10 w-px bg-line md:block" aria-hidden="true" />
        <p className="min-w-0 truncate text-sm font-semibold leading-6 text-ink/65" title={post.body}>
          {post.body}
        </p>
      </div>
    </>
  );

  return (
    <article className={cn("relative bg-white transition hover:bg-paper/40", showComments && "bg-paper/30")}>
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(104px,150px)_minmax(0,1fr)_auto] md:items-center md:px-4">
        <Link
          href={href}
          className="grid min-w-0 gap-3 rounded-[16px] outline-none transition focus-visible:ring-4 focus-visible:ring-yellow/25 md:contents"
        >
          {rowContent}
        </Link>
        <ThreadActionsMenu
          post={post}
          locale={locale}
          isAuthenticated={isAuthenticated}
          canPin={canPin}
          canModerate={canModerate}
          showComments={showComments}
          onLike={onLike}
          onToggleComments={onToggleComments}
          onToggleFeatured={onToggleFeatured}
          onDeletePost={onDeletePost}
        />
      </div>
      {showComments ? (
        <div className="border-t border-line bg-white p-4">
          <CommentsSection
            postId={post._id}
            locale={locale}
            isAuthenticated={isAuthenticated}
            canModerate={canModerate}
            compact
          />
        </div>
      ) : null}
    </article>
  );
}

function ThreadActionsMenu({
  post,
  locale,
  isAuthenticated,
  canPin,
  canModerate,
  showComments,
  onLike,
  onToggleComments,
  onToggleFeatured,
  onDeletePost,
}: {
  post: ThreadRowPost;
  locale: Locale;
  isAuthenticated: boolean;
  canPin: boolean;
  canModerate: boolean;
  showComments: boolean;
  onLike?: (postId: string) => Promise<void>;
  onToggleComments?: (postId: string) => void;
  onToggleFeatured?: (post: LiveCommunityPost, kind: "global" | "course") => Promise<void>;
  onDeletePost?: (postId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isLiked = post.userReaction === "like";

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-white text-ink transition hover:border-ink hover:bg-yellow/15"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={locale === "sr" ? "Akcije za diskusiju" : "Discussion actions"}
      >
        <MoreHorizontal className="size-5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-30 w-64 rounded-[16px] border-2 border-ink bg-white p-2 shadow-[6px_6px_0_rgba(14,49,88,0.18)]">
          <MenuButton
            icon={<ThumbsUp className={cn("size-4", isLiked && "fill-ink")} />}
            label={`${locale === "sr" ? "Svidja mi se" : "Like"} (${post.reactionsCount})`}
            disabled={!isAuthenticated || !onLike}
            active={isLiked}
            onClick={async () => {
              await onLike?.(post._id);
              setOpen(false);
            }}
          />
          <MenuButton
            icon={<MessageCircle className="size-4" />}
            label={`${locale === "sr" ? "Komentari" : "Comments"} (${post.commentsCount})`}
            active={showComments}
            disabled={!onToggleComments}
            onClick={() => {
              onToggleComments?.(post._id);
              setOpen(false);
            }}
          />
          {canPin ? (
            <>
              <div className="my-1 h-px bg-line" />
              <MenuButton
                icon={<Star className={cn("size-4", post.isFeaturedGlobal && "fill-ink")} />}
                label={locale === "sr" ? "Zakaci globalno" : "Pin globally"}
                active={Boolean(post.isFeaturedGlobal)}
                disabled={!onToggleFeatured}
                onClick={async () => {
                  await onToggleFeatured?.(post as LiveCommunityPost, "global");
                  setOpen(false);
                }}
              />
              <MenuButton
                icon={<GraduationCap className="size-4" />}
                label={locale === "sr" ? "Zakaci za kurs" : "Pin for course"}
                active={Boolean(post.featuredCourseId)}
                disabled={!onToggleFeatured}
                onClick={async () => {
                  await onToggleFeatured?.(post as LiveCommunityPost, "course");
                  setOpen(false);
                }}
              />
            </>
          ) : null}
          {canModerate ? (
            <>
              <div className="my-1 h-px bg-line" />
              <MenuButton
                icon={<Trash2 className="size-4" />}
                label={locale === "sr" ? "Obrisi" : "Delete"}
                destructive
                disabled={!onDeletePost}
                onClick={async () => {
                  await onDeletePost?.(post._id);
                  setOpen(false);
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({
  icon,
  label,
  active,
  destructive,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-black text-ink transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-45",
        active && "bg-yellow/20",
        destructive && "text-red-600 hover:bg-red-50",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function CommunityComposerForm({
  locale,
  draftTitle,
  draft,
  selectedCourseId,
  courses,
  isAdmin,
  featureGlobal,
  featureCourse,
  isAuthenticated,
  status,
  onDraftTitleChange,
  onDraftChange,
  onCourseChange,
  onFeatureGlobalChange,
  onFeatureCourseChange,
  onSubmit,
}: {
  locale: Locale;
  draftTitle: string;
  draft: string;
  selectedCourseId: string;
  courses: CommunityCourseOption[];
  isAdmin: boolean;
  featureGlobal: boolean;
  featureCourse: boolean;
  isAuthenticated: boolean;
  status: string | null;
  onDraftTitleChange: (value: string) => void;
  onDraftChange: (value: string) => void;
  onCourseChange: (value: string) => void;
  onFeatureGlobalChange: (value: boolean) => void;
  onFeatureCourseChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const selectedCourse = courses.find((course) => course._id === selectedCourseId);

  return (
    <form onSubmit={onSubmit} className="composer-stagger space-y-5">
      <div className="grid gap-3 md:grid-cols-[1fr_260px]">
        <input
          value={draftTitle}
          onChange={(event) => onDraftTitleChange(event.target.value)}
          className="min-h-11 rounded-[16px] border-2 border-ink bg-white px-4 text-sm font-black text-ink outline-none transition placeholder:text-muted/70 focus:border-yellow focus:ring-4 focus:ring-yellow/10"
          placeholder={locale === "sr" ? "Naslov diskusije" : "Discussion title"}
          disabled={!isAuthenticated}
        />
        <label className="block">
          <span className="sr-only">{locale === "sr" ? "Opseg diskusije" : "Discussion scope"}</span>
          <select
            value={selectedCourseId}
            onChange={(event) => onCourseChange(event.target.value)}
            className="min-h-11 w-full rounded-[16px] border-2 border-ink bg-white px-3 text-sm font-black text-ink outline-none transition focus:border-yellow focus:ring-4 focus:ring-yellow/10"
            disabled={!isAuthenticated || courses.length === 0}
          >
            <option value="">{locale === "sr" ? "Opsta diskusija" : "General discussion"}</option>
            {courses.map((course) =>
              course._id ? (
                <option key={course._id} value={course._id}>
                  {locale === "sr" ? course.titleSr : course.titleEn}
                </option>
              ) : null,
            )}
          </select>
        </label>
      </div>

      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        rows={8}
        className="w-full resize-none rounded-[16px] border-2 border-ink bg-white p-4 text-base font-bold text-ink outline-none transition focus:border-yellow focus:ring-4 focus:ring-yellow/10"
        placeholder={locale === "sr" ? "Podeli pitanje, workflow ili rezultat..." : "Share a question, workflow, or result..."}
        disabled={!isAuthenticated}
      />

      <div className="rounded-[16px] border border-line bg-paper/55 p-4">
        <div className="flex flex-wrap gap-2 text-xs font-black text-ink">
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-white px-3">
            {selectedCourseId ? <GraduationCap className="size-4" /> : <Globe2 className="size-4" />}
            {selectedCourse ? (locale === "sr" ? selectedCourse.titleSr : selectedCourse.titleEn) : locale === "sr" ? "Opsta diskusija" : "General discussion"}
          </span>
          {isAdmin ? (
            <>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-ink bg-white px-3">
                <input
                  type="checkbox"
                  checked={featureGlobal}
                  onChange={(event) => onFeatureGlobalChange(event.target.checked)}
                  className="size-4 accent-[#f4be30]"
                />
                {locale === "sr" ? "Zakaci globalno" : "Pin globally"}
              </label>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-ink bg-white px-3">
                <input
                  type="checkbox"
                  checked={featureCourse}
                  onChange={(event) => onFeatureCourseChange(event.target.checked)}
                  disabled={!selectedCourseId}
                  className="size-4 accent-[#f4be30] disabled:opacity-40"
                />
                {locale === "sr" ? "Zakaci za kurs" : "Pin for course"}
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {status ? <p className="text-sm font-black text-muted">{status}</p> : <span />}
        <button
          type="submit"
          disabled={!isAuthenticated || !draft.trim()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-ink bg-yellow px-6 text-sm font-black text-ink shadow-[4px_4px_0_rgba(14,49,88,0.18)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
        >
          <Send className="size-4" />
          {locale === "sr" ? "Objavi" : "Post"}
        </button>
      </div>
    </form>
  );
}

function sortPosts(posts: LiveCommunityPost[], sortMode: SortMode) {
  const next = [...posts];
  if (sortMode === "comments") {
    return next.sort((a, b) => b.commentsCount - a.commentsCount || b.createdAt - a.createdAt);
  }
  if (sortMode === "reactions") {
    return next.sort((a, b) => b.reactionsCount - a.reactionsCount || b.createdAt - a.createdAt);
  }
  return next.sort((a, b) => b.createdAt - a.createdAt);
}

function isPinnedPost(post: LiveCommunityPost, selectedCourseId: string) {
  return Boolean(post.isFeaturedGlobal || (post.featuredCourseId && (!selectedCourseId || post.featuredCourseId === selectedCourseId)));
}

function courseLabel(post: ThreadRowPost, courses: CommunityCourseOption[], locale: Locale) {
  if (post.courseTitleSr || post.courseTitleEn) {
    return locale === "sr" ? post.courseTitleSr ?? post.courseTitleEn ?? "" : post.courseTitleEn ?? post.courseTitleSr ?? "";
  }
  const course = courses.find((item) => item._id === post.courseId);
  if (course) return locale === "sr" ? course.titleSr : course.titleEn;
  return locale === "sr" ? "Opsta diskusija" : "General discussion";
}
