import type { CommunityRank, CommunityRole } from "@/components/app/community-identity";

export type CommunityScope =
  | { kind: "global" }
  | { kind: "track"; trackId: string }
  | { kind: "course"; courseId: string };

export type CommunityTrack = {
  _id: string;
  slug: string;
  titleSr: string;
  titleEn: string;
  courses: CommunityCourse[];
};

export type CommunityCourse = {
  _id: string;
  slug: string;
  titleSr: string;
  titleEn: string;
  trackId?: string;
};

export type CommunityCounts = {
  myThreads?: number;
  mentions?: number;
  pendingApprovals?: number;
  members?: number;
  profileIncomplete?: number;
  total?: number;
};

export type CommunityFilters = {
  viewer: {
    userId: string;
    role: CommunityRole;
    language?: string;
  };
  tracks: CommunityTrack[];
  courses: CommunityCourse[];
  counts?: CommunityCounts;
};

export type CommunityPostRow = {
  _id: string;
  title: string;
  body: string;
  authorId?: string;
  createdAt: number;
  lastActivityAt?: number;
  status?: "draft" | "pending" | "published" | "changes_requested";
  authorName: string;
  authorUsername?: string;
  authorRole?: CommunityRole;
  authorAvatarUrl?: string | null;
  authorRank?: CommunityRank;
  trackId?: string;
  trackSlug?: string;
  trackTitleSr?: string;
  trackTitleEn?: string;
  courseId?: string;
  courseSlug?: string;
  courseTitleSr?: string;
  courseTitleEn?: string;
  commentsCount?: number;
  reactionsCount?: number;
  userReaction?: "like" | "celebrate";
  isFeaturedGlobal?: boolean;
  isPinned?: boolean;
  isFavorited?: boolean;
  moderationReason?: string;
  latestModerationReason?: string;
  unreadActivityCount?: number;
};

export type CommunityMentionEvent = {
  _id: string;
  createdAt: number;
  readAt?: number;
  kind?: string;
  authorName?: string;
  senderName?: string;
  senderUsername?: string;
  authorAvatarUrl?: string | null;
  authorRole?: CommunityRole;
  excerpt?: string;
  quote?: string;
  body?: string;
  postId?: string;
  postTitle?: string;
  trackTitleSr?: string;
  trackTitleEn?: string;
  courseTitleSr?: string;
  courseTitleEn?: string;
};

export type CommunityMemberRow = {
  _id: string;
  profileId?: string;
  userId?: string;
  name: string;
  username?: string;
  role: CommunityRole;
  avatarUrl?: string | null;
  level?: number;
  levelLabel?: string;
  xp?: number;
  completedLessons?: number;
  helpfulAnswers?: number;
  progressPercent?: number;
  trackTitleSr?: string;
  trackTitleEn?: string;
  courseTitleSr?: string;
  courseTitleEn?: string;
};

export type LeaderboardRow = {
  _id?: string;
  userId: string;
  rank: number;
  name: string;
  username?: string;
  avatarUrl?: string | null;
  role?: CommunityRole;
  xp: number;
  level?: number;
  levelLabel?: string;
  completedLessons?: number;
  helpfulAnswers?: number;
  isViewer?: boolean;
};

export type PaginatedResult<T> = {
  page: T[];
  isDone: boolean;
  continueCursor: string;
};
