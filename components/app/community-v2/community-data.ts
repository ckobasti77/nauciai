"use client";

import type { FunctionReference, PaginationOptions, PaginationResult } from "convex/server";
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

import type {
  CommunityFilters,
  CommunityMemberRow,
  CommunityMentionEvent,
  CommunityPostRow,
  CommunityScope,
  LeaderboardRow,
} from "./community-types";

type PublicQuery<Args extends Record<string, unknown>, Result> = FunctionReference<"query", "public", Args, Result>;
type PublicMutation<Args extends Record<string, unknown>, Result> = FunctionReference<"mutation", "public", Args, Result>;

type PostsArgs = {
  paginationOpts: PaginationOptions;
  scope: CommunityScope;
  search?: string;
  sort: "latest" | "active" | "unanswered";
};

type MyPostsArgs = {
  paginationOpts: PaginationOptions;
  view: "drafts" | "pending" | "published" | "saved";
};

type MentionArgs = {
  paginationOpts: PaginationOptions;
  unreadOnly?: boolean;
};

type MentionEventRaw = {
  notificationId: string;
  createdAt: number;
  readAt?: number;
  kind?: string;
  unread: boolean;
  excerpt?: string;
  sender: {
    userId: string;
    name: string;
    username?: string;
    role: string;
    avatarUrl?: string | null;
  } | null;
  thread: {
    postId: string;
    title: string;
    courseTitleSr?: string;
    courseTitleEn?: string;
    trackTitleSr?: string;
    trackTitleEn?: string;
  };
  commentId?: string;
};

type MembersArgs = {
  paginationOpts: PaginationOptions;
  scope?: CommunityScope;
  search?: string;
  role?: "student" | "pro_student" | "moderator" | "admin";
};

type MemberRowRaw = {
  profileId?: string;
  userId: string;
  name: string;
  username?: string;
  role: string;
  avatarUrl?: string | null;
  xp: number;
  level: number;
  completedLessons: number;
  completedTasks: number;
  helpfulAnswers: number;
  canManageRole: boolean;
};

type LeaderboardArgs = {
  paginationOpts: PaginationOptions;
  scope: CommunityScope;
  period: "week" | "all_time";
};

type ViewerLeaderboardResult = {
  eligible: boolean;
  row: LeaderboardRow | null;
  periodKey?: string;
};

type CommunityApiV2 = {
  community: {
    getCommunityFilters: PublicQuery<Record<string, never>, CommunityFilters>;
    listPostsPage: PublicQuery<PostsArgs, PaginationResult<CommunityPostRow>>;
    listMyPostsPage: PublicQuery<MyPostsArgs, PaginationResult<CommunityPostRow>>;
    listMentionEvents: PublicQuery<MentionArgs, PaginationResult<MentionEventRaw>>;
    listMembersPage: PublicQuery<MembersArgs, PaginationResult<MemberRowRaw>>;
    toggleFavorite: PublicMutation<{ postId: string }, boolean>;
  };
  leaderboard: {
    listLeaderboard: PublicQuery<LeaderboardArgs, PaginationResult<LeaderboardRow>>;
    getViewerLeaderboardRow: PublicQuery<
      Omit<LeaderboardArgs, "paginationOpts">,
      ViewerLeaderboardResult
    >;
  };
  notifications: {
    markNotificationAsRead: PublicMutation<{ notificationId: string }, null>;
    markAllMentionsAsRead: PublicMutation<Record<string, never>, null>;
  };
  profiles: {
    setProfileRole: PublicMutation<
      { profileId: string; role: "student" | "pro_student" | "moderator" },
      unknown
    >;
  };
};

// Keep the API compatibility boundary in one place while Convex V2 types are generated.
const apiV2 = api as unknown as CommunityApiV2;

export const fallbackCommunityFilters: CommunityFilters = {
  viewer: { userId: "preview", role: "student", language: "sr" },
  tracks: [
    {
      _id: "video-audio",
      slug: "video-audio",
      titleSr: "Video i audio",
      titleEn: "Video and audio",
      courses: [
        {
          _id: "video-audio-ai",
          slug: "video-audio-ai",
          titleSr: "Kurs za video i audio",
          titleEn: "Video and Audio Course",
          trackId: "video-audio",
        },
      ],
    },
    {
      _id: "websites",
      slug: "websites",
      titleSr: "Web sajtovi",
      titleEn: "Websites",
      courses: [
        {
          _id: "vibe-coding",
          slug: "vibe-coding",
          titleSr: "Kurs za web sajtove",
          titleEn: "Websites Course",
          trackId: "websites",
        },
      ],
    },
  ],
  courses: [],
  counts: { myThreads: 0, mentions: 0, pendingApprovals: 0, members: 0, profileIncomplete: 0, total: 0 },
};

export const fallbackCommunityPosts: CommunityPostRow[] = [
  {
    _id: "preview-voiceover",
    title: "Moj prvi AI voiceover workflow",
    body: "Kombinovala sam kratak scenario, dva tona glasa i tri iteracije montaže. Radni list za tempo mi je najviše pomogao.",
    createdAt: Date.now() - 1000 * 60 * 42,
    lastActivityAt: Date.now() - 1000 * 60 * 8,
    authorName: "Mina Petrović",
    authorUsername: "mina.ai",
    authorRole: "student",
    commentsCount: 6,
    reactionsCount: 18,
    trackTitleSr: "Video i audio",
    trackTitleEn: "Video and audio",
    courseTitleSr: "Kurs za video i audio",
    courseTitleEn: "Video and Audio Course",
    isFeaturedGlobal: true,
    status: "published",
  },
  {
    _id: "preview-editor",
    title: "Kako organizujete AI video projekat za klijenta?",
    body: "Tražim praktičan način da brief, kadrove, voiceover i revizije držim na jednom mestu bez gubitka verzija.",
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
    authorName: "Luka Nikolić",
    authorUsername: "luka.builds",
    authorRole: "pro_student",
    commentsCount: 3,
    reactionsCount: 11,
    trackTitleSr: "Video i audio",
    trackTitleEn: "Video and audio",
    status: "published",
  },
];

function queryEnabled(hasConvex: boolean, isAuthenticated: boolean, isLoading: boolean) {
  return hasConvex && isAuthenticated && !isLoading;
}

export function useCommunityFilters(hasConvex = true) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const enabled = queryEnabled(hasConvex, isAuthenticated, isLoading);
  const filters = useQuery(apiV2.community.getCommunityFilters, enabled ? {} : "skip");

  return {
    filters: filters ?? fallbackCommunityFilters,
    isLoading: hasConvex && (isLoading || (isAuthenticated && filters === undefined)),
    isAuthenticated,
    hasLiveData: Boolean(filters),
  };
}

export function useCommunityPosts({
  hasConvex = true,
  scope,
  search,
  sort,
}: {
  hasConvex?: boolean;
  scope: CommunityScope;
  search?: string;
  sort: PostsArgs["sort"];
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const enabled = queryEnabled(hasConvex, isAuthenticated, isLoading);
  const query = usePaginatedQuery(
    apiV2.community.listPostsPage,
    enabled ? { scope, sort, ...(search ? { search } : {}) } : "skip",
    { initialNumItems: 20 },
  );

  return {
    ...query,
    results: hasConvex ? query.results : fallbackCommunityPosts,
    isInitialLoading: hasConvex ? query.status === "LoadingFirstPage" : false,
  };
}

export function useCommunityMyPosts({
  hasConvex = true,
  view,
}: {
  hasConvex?: boolean;
  view: MyPostsArgs["view"];
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const enabled = queryEnabled(hasConvex, isAuthenticated, isLoading);
  const query = usePaginatedQuery(
    apiV2.community.listMyPostsPage,
    enabled ? { view } : "skip",
    { initialNumItems: 20 },
  );

  return {
    ...query,
    results: hasConvex ? query.results : view === "published" ? fallbackCommunityPosts : [],
    isInitialLoading: hasConvex ? query.status === "LoadingFirstPage" : false,
  };
}

export function useCommunityMentions({
  hasConvex = true,
  unreadOnly,
}: {
  hasConvex?: boolean;
  unreadOnly: boolean;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const enabled = queryEnabled(hasConvex, isAuthenticated, isLoading);
  const query = usePaginatedQuery(
    apiV2.community.listMentionEvents,
    enabled ? { ...(unreadOnly ? { unreadOnly: true } : {}) } : "skip",
    { initialNumItems: 20 },
  );
  const markOne = useMutation(apiV2.notifications.markNotificationAsRead);
  const markAll = useMutation(apiV2.notifications.markAllMentionsAsRead);

  const results: CommunityMentionEvent[] = query.results.map((event) => ({
    _id: event.notificationId,
    createdAt: event.createdAt,
    readAt: event.readAt,
    kind: event.kind,
    senderName: event.sender?.name,
    senderUsername: event.sender?.username,
    authorName: event.sender?.name,
    authorAvatarUrl: event.sender?.avatarUrl,
    authorRole: event.sender?.role,
    excerpt: event.excerpt,
    postId: event.thread.postId,
    postTitle: event.thread.title,
    trackTitleSr: event.thread.trackTitleSr,
    trackTitleEn: event.thread.trackTitleEn,
    courseTitleSr: event.thread.courseTitleSr,
    courseTitleEn: event.thread.courseTitleEn,
  }));

  return {
    ...query,
    results: hasConvex ? results : [],
    isInitialLoading: hasConvex ? query.status === "LoadingFirstPage" : false,
    markOne,
    markAll,
  };
}

export function useCommunityMembers({
  hasConvex = true,
  scope,
  search,
  role,
}: {
  hasConvex?: boolean;
  scope?: CommunityScope;
  search?: string;
  role?: MembersArgs["role"];
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const enabled = queryEnabled(hasConvex, isAuthenticated, isLoading);
  const query = usePaginatedQuery(
    apiV2.community.listMembersPage,
    enabled
      ? {
          ...(scope ? { scope } : {}),
          ...(search ? { search } : {}),
          ...(role ? { role } : {}),
        }
      : "skip",
    { initialNumItems: 20 },
  );
  const setRole = useMutation(apiV2.profiles.setProfileRole);
  const results: CommunityMemberRow[] = query.results.map((member) => ({
    _id: member.profileId ?? member.userId,
    profileId: member.profileId,
    userId: member.userId,
    name: member.name,
    username: member.username,
    role: member.role,
    avatarUrl: member.avatarUrl,
    level: member.level,
    xp: member.xp,
    completedLessons: member.completedLessons,
    helpfulAnswers: member.helpfulAnswers,
  }));

  return {
    ...query,
    results: hasConvex ? results : [],
    isInitialLoading: hasConvex ? query.status === "LoadingFirstPage" : false,
    setRole,
  };
}

export function useLeaderboard({
  hasConvex = true,
  scope,
  period,
}: {
  hasConvex?: boolean;
  scope: CommunityScope;
  period: LeaderboardArgs["period"];
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const enabled = queryEnabled(hasConvex, isAuthenticated, isLoading);
  const query = usePaginatedQuery(
    apiV2.leaderboard.listLeaderboard,
    enabled ? { scope, period } : "skip",
    { initialNumItems: 20 },
  );
  const viewer = useQuery(
    apiV2.leaderboard.getViewerLeaderboardRow,
    enabled ? { scope, period } : "skip",
  );

  return {
    ...query,
    results: hasConvex ? query.results : [],
    viewer,
    isInitialLoading: hasConvex ? query.status === "LoadingFirstPage" : false,
  };
}

export function useToggleCommunityFavorite() {
  return useMutation(apiV2.community.toggleFavorite);
}
