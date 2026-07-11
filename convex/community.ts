/* eslint-disable @typescript-eslint/no-explicit-any */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  communityScopeValidator,
  globalCommunityScope,
  resolveCommunityScope,
  resolveLegacyPostScope,
  scopeFields,
  type ResolvedCommunityScope,
} from "./communityScope";
import {
  currentUserId,
  effectiveRoleForProfile,
  getCurrentProfile,
  requireCompleteCommunityProfile,
  requireAdmin,
  requireCommunityModerator,
  requireCourseAccess,
  requireUserId,
} from "./helpers";
import { syncLeaderboardSourceEvent } from "./leaderboardCore";
import { getCommunityNotificationCountsHelper } from "./notifications";

export type CommunityVote = "upvote" | "downvote";

export function voteValue(reaction: string | undefined) {
  return reaction === "downvote" ? -1 : reaction === "upvote" || reaction === "like" || reaction === "celebrate" ? 1 : 0;
}

export function hotScoreFor(voteScore: number, createdAt: number) {
  const sign = voteScore === 0 ? 0 : voteScore > 0 ? 1 : -1;
  return sign * Math.log10(Math.max(Math.abs(voteScore), 1)) + createdAt / 45_000_000;
}

function voteCounts(rows: Array<{ reaction: string }>) {
  const upvoteCount = rows.filter((row) => voteValue(row.reaction) > 0).length;
  const downvoteCount = rows.filter((row) => voteValue(row.reaction) < 0).length;
  return { upvoteCount, downvoteCount, voteScore: upvoteCount - downvoteCount };
}

type AuthorRank = {
  level: number;
  label: string;
  completedLessons: number;
};

const rankForCompletedLessons = (completedLessons: number): AuthorRank => {
  const level =
    completedLessons >= 60 ? 5 : completedLessons >= 30 ? 4 : completedLessons >= 15 ? 3 : completedLessons >= 5 ? 2 : 1;

  return {
    level,
    label: `Nivo ${level}`,
    completedLessons,
  };
};

const studentRankFor = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  role: Doc<"profiles">["role"] | undefined,
) => {
  if (role !== "student" && role !== "pro_student") {
    return null;
  }

  const stats = await ctx.db
    .query("profileStats")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  if (stats) {
    return rankForCompletedLessons(stats.completedLessons);
  }

  const progressRows = await ctx.db
    .query("progress")
    .withIndex("by_user_course", (q) => q.eq("userId", userId))
    .take(1000);

  return rankForCompletedLessons(progressRows.filter((row) => row.completed).length);
};

const profileAvatarUrl = async (ctx: QueryCtx, profile: Doc<"profiles"> | null) => {
  if (!profile) return undefined;
  if (profile.avatarStorageId) {
    return (await ctx.storage.getUrl(profile.avatarStorageId)) ?? profile.avatarUrl;
  }
  return profile.avatarUrl;
};

async function publicCommunityIdentity(ctx: QueryCtx, userId: Id<"users">) {
  const [profileRows, user] = await Promise.all([
    ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).take(100),
    ctx.db.get(userId),
  ]);
  const profile = [...profileRows].sort((a, b) => a._creationTime - b._creationTime)[0] ?? null;
  const email = String(profile?.email ?? user?.email ?? "").trim().toLowerCase();
  const fallbackName = String(user?.name ?? email.split("@")[0] ?? "Član zajednice").trim() || "Član zajednice";
  return {
    profile,
    name: profile?.name?.trim() || fallbackName,
    username: profile?.username ?? user?.username,
    role: effectiveRoleForProfile(email, profile?.role),
    avatarUrl: (await profileAvatarUrl(ctx, profile)) ?? user?.image,
  };
}

async function notifyMentions(
  ctx: MutationCtx,
  text: string,
  postId: Id<"communityPosts">,
  commentId?: Id<"comments">,
) {
  const authorId = await requireUserId(ctx);

  const matches = text.match(/@([a-zA-Z0-9_-]+)/g);
  if (!matches) return;

  const usernames = Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
  const authorIdentity = await publicCommunityIdentity(ctx, authorId);
  const authorName = authorIdentity.username ? `@${authorIdentity.username}` : authorIdentity.name;
  const excerpt = text.trim().slice(0, 240);

  for (const username of usernames) {
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .take(100);
    const profile = profiles[0] ?? null;
    if (profile && profile.userId !== authorId) {
      const eventKey = `mention:${postId}:${commentId ?? "post"}:${authorId}`;
      const existing = await ctx.db
        .query("notifications")
        .withIndex("by_userId_and_eventKey", (q) =>
          q.eq("userId", profile.userId).eq("eventKey", eventKey),
        )
        .unique();

      if (!existing) {
        await ctx.db.insert("notifications", {
          userId: profile.userId,
          title: "Pominjanje u zajednici",
          body: `${authorName} te je pomenuo u diskusiji.`,
          kind: "mention",
          postId,
          commentId,
          senderId: authorId,
          excerpt,
          eventKey,
          createdAt: Date.now(),
        });
      }
    }
  }
}

const postsWithDetails = async (
  ctx: QueryCtx,
  posts: Doc<"communityPosts">[],
  userId: Id<"users"> | null,
) =>
  Promise.all(
    posts.map(async (post) => {
      const author = await publicCommunityIdentity(ctx, post.authorId);
      const course = post.courseId ? await ctx.db.get(post.courseId) : null;
      const authorRole = author.role;
      const authorAvatarUrl = author.avatarUrl;
      const authorRank = await studentRankFor(ctx, post.authorId, authorRole);
      const legacyComments =
        post.commentCount === undefined
          ? await ctx.db
              .query("comments")
              .withIndex("by_post", (q) => q.eq("postId", post._id))
              .take(501)
          : [];
      const reactionRows =
        post.upvoteCount === undefined || post.downvoteCount === undefined
          ? await ctx.db
              .query("reactions")
              .withIndex("by_target", (q) =>
                q.eq("targetType", "post").eq("targetId", String(post._id)),
              )
              .take(1000)
          : [];
      const derivedCounts = reactionRows.length ? voteCounts(reactionRows) : null;
      const userVote = userId
        ? (
            await ctx.db
              .query("reactions")
              .withIndex("by_user_target", (q) =>
                q.eq("userId", userId).eq("targetType", "post").eq("targetId", String(post._id)),
              )
              .unique()
          )?.reaction
        : undefined;

      const userFavorite = userId
        ? await ctx.db
            .query("postFavorites")
            .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", post._id))
            .unique()
        : null;

      const imageUrl = post.imageStorageId ? await ctx.storage.getUrl(post.imageStorageId) : null;

      return {
        ...post,
        authorName: author.name,
        authorUsername: author.username,
        authorRole,
        authorAvatarUrl,
        authorRank,
        courseSlug: course?.slug,
        courseTitleSr: course?.titleSr,
        courseTitleEn: course?.titleEn,
        commentsCount: post.commentCount ?? legacyComments.length,
        reactionsCount: post.reactionCount ?? ((post.upvoteCount ?? derivedCounts?.upvoteCount ?? 0) + (post.downvoteCount ?? derivedCounts?.downvoteCount ?? 0)),
        upvoteCount: post.upvoteCount ?? derivedCounts?.upvoteCount ?? 0,
        downvoteCount: post.downvoteCount ?? derivedCounts?.downvoteCount ?? 0,
        voteScore: post.voteScore ?? derivedCounts?.voteScore ?? 0,
        userVote: userVote === "upvote" || userVote === "downvote" ? userVote : undefined,
        userReaction: userVote,
        isFeaturedGlobal: Boolean(post.isFeaturedGlobal),
        isFavorited: Boolean(userFavorite),
        imageUrl,
      };
    }),
  );

function effectivePostStatus(post: Doc<"communityPosts">) {
  return post.status ?? "published";
}

function workflowGroupForStatus(status: ReturnType<typeof effectivePostStatus>) {
  if (status === "draft" || status === "changes_requested") return "drafts" as const;
  return status;
}

function postSearchText(title: string, body: string) {
  return `${title.trim()}\n${body.trim()}`.trim();
}

async function resolvedScopeForPost(
  ctx: QueryCtx | MutationCtx,
  post: Doc<"communityPosts">,
): Promise<ResolvedCommunityScope> {
  if (post.scopeKind === "track" && post.trackId) {
    return { kind: "track", scopeKey: post.scopeKey ?? `track:${post.trackId}`, trackId: post.trackId };
  }
  if (post.scopeKind === "course" && post.courseId) {
    return {
      kind: "course",
      scopeKey: post.scopeKey ?? `course:${post.courseId}`,
      courseId: post.courseId,
      ...(post.trackId ? { trackId: post.trackId } : {}),
    };
  }
  if (post.courseId) {
    return resolveLegacyPostScope(ctx, post.courseId);
  }
  return globalCommunityScope();
}

async function resolvePostWriteScope(
  ctx: MutationCtx,
  scope: Parameters<typeof resolveCommunityScope>[1] | undefined,
  legacyCourseId: Id<"courses"> | undefined,
  existing?: Doc<"communityPosts">,
) {
  if (scope) return resolveCommunityScope(ctx, scope);
  if (legacyCourseId) return resolveLegacyPostScope(ctx, legacyCourseId);
  if (existing) return resolvedScopeForPost(ctx, existing);
  return globalCommunityScope();
}

function isStaffRole(role: unknown) {
  return role === "admin" || role === "moderator";
}

export const listPosts = query({
  args: {
    courseId: v.optional(v.id("courses")),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentProfile(ctx);

    if (args.courseId) {
      await requireCourseAccess(ctx, args.courseId);
    }

    const posts = args.courseId
      ? await ctx.db
          .query("communityPosts")
          .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
          .order("desc")
          .take(50)
      : await ctx.db.query("communityPosts").order("desc").take(50);

    const published = posts.filter((p) => p.status === "published" || !p.status);
    return postsWithDetails(ctx, published, userId);
  },
});

export const getPostDetail = query({
  args: {
    postId: v.id("communityPosts"),
  },
  handler: async (ctx, args) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    if (post.courseId) {
      await requireCourseAccess(ctx, post.courseId);
    }

    const postStatus = post.status ?? "published";
    const isAdminOrMod = profile.role === "admin" || profile.role === "moderator";

    // Regular users can only view their own draft/pending posts
    if (postStatus !== "published" && post.authorId !== userId && !isAdminOrMod) {
      return null;
    }

    const [detail] = await postsWithDetails(ctx, [post], userId);

    return {
      ...detail,
      viewerRole: profile.role,
    };
  },
});

export const listFeaturedPosts = query({
  args: {
    courseId: v.optional(v.id("courses")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentProfile(ctx);
    const limit = args.limit ?? 4;

    if (args.courseId) {
      await requireCourseAccess(ctx, args.courseId);
    }

    const coursePosts = args.courseId
      ? await ctx.db
          .query("communityPosts")
          .withIndex("by_featured_course", (q) => q.eq("featuredCourseId", args.courseId))
          .order("desc")
          .take(limit)
      : [];
    const globalSlots = Math.max(limit - coursePosts.length, 0);
    const globalPosts =
      globalSlots > 0
        ? await ctx.db
            .query("communityPosts")
            .withIndex("by_featured_global", (q) => q.eq("isFeaturedGlobal", true))
            .order("desc")
            .take(globalSlots)
        : [];
    const deduped = [...coursePosts, ...globalPosts].filter(
      (post, index, all) => all.findIndex((item) => item._id === post._id) === index,
    );

    const published = deduped.filter((p) => p.status === "published" || !p.status);
    return postsWithDetails(ctx, published.slice(0, limit), userId);
  },
});

export const listPinnedPosts = query({
  args: {
    scope: communityScopeValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentProfile(ctx);
    const scope = await resolveCommunityScope(ctx, args.scope);
    if (scope.kind === "course") await requireCourseAccess(ctx, scope.courseId);
    const limit = Math.max(1, Math.min(10, Math.floor(args.limit ?? 4)));
    const posts =
      scope.kind === "global"
        ? await ctx.db
            .query("communityPosts")
            .withIndex("by_featured_global", (q) => q.eq("isFeaturedGlobal", true))
            .order("desc")
            .take(limit)
        : scope.kind === "track"
          ? await ctx.db
              .query("communityPosts")
              .withIndex("by_featured_track", (q) => q.eq("featuredTrackId", scope.trackId))
              .order("desc")
              .take(limit)
          : await ctx.db
              .query("communityPosts")
              .withIndex("by_featured_course", (q) => q.eq("featuredCourseId", scope.courseId))
              .order("desc")
              .take(limit);
    return postsWithDetails(
      ctx,
      posts.filter((post) => effectivePostStatus(post) === "published"),
      userId,
    );
  },
});

export const createPost = mutation({
  args: {
    courseId: v.optional(v.id("courses")),
    scope: v.optional(communityScopeValidator),
    language: v.union(v.literal("sr"), v.literal("en")),
    title: v.string(),
    body: v.string(),
    status: v.optional(v.union(v.literal("draft"), v.literal("pending"), v.literal("published"))),
    imageStorageId: v.optional(v.id("_storage")),
    imageMimeType: v.optional(v.string()),
    imageFileName: v.optional(v.string()),
    isFeaturedGlobal: v.optional(v.boolean()),
    isFeaturedForCourse: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const resolvedScope = await resolvePostWriteScope(ctx, args.scope, args.courseId);
    if (args.scope && args.courseId && (resolvedScope.kind !== "course" || resolvedScope.courseId !== args.courseId)) {
      throw new Error("Scope kurs se ne poklapa sa courseId vrednošću.");
    }
    if (resolvedScope.kind === "course") {
      await requireCourseAccess(ctx, resolvedScope.courseId);
    }
    const title = args.title.trim();
    const body = args.body.trim();
    if (args.status !== "draft" && (!title || !body)) {
      throw new Error("Naslov i sadržaj su obavezni.");
    }
    if (title.length > 160) throw new Error("Naslov može imati najviše 160 karaktera.");
    if (body.length > 20_000) throw new Error("Sadržaj je predugačak.");

    const isAdminOrMod = isStaffRole(profile.role);
    const now = Date.now();

    let initialStatus: "draft" | "pending" | "published" = "published";
    if (args.status === "draft" || !profile.username) {
      initialStatus = "draft";
    } else {
      initialStatus = isAdminOrMod ? "published" : "pending";
    }

    const postId = await ctx.db.insert("communityPosts", {
      ...scopeFields(resolvedScope),
      language: args.language,
      title,
      body,
      searchText: postSearchText(title, body),
      authorId: userId,
      visibility: "members",
      isFeaturedGlobal: isAdminOrMod ? Boolean(args.isFeaturedGlobal) : false,
      featuredCourseId:
        isAdminOrMod && args.isFeaturedForCourse && resolvedScope.kind === "course"
          ? resolvedScope.courseId
          : undefined,
      status: initialStatus,
      workflowGroup: workflowGroupForStatus(initialStatus),
      commentCount: 0,
      reactionCount: 0,
      upvoteCount: 0,
      downvoteCount: 0,
      voteScore: 0,
      hotScore: hotScoreFor(0, now),
      helpfulAnswerCount: 0,
      lastActivityAt: now,
      imageStorageId: args.imageStorageId,
      imageMimeType: args.imageMimeType,
      imageFileName: args.imageFileName,
      createdAt: now,
      updatedAt: now,
    });

    if (initialStatus === "published") {
      await notifyMentions(ctx, body, postId);
    }

    return postId;
  },
});

export const updatePost = mutation({
  args: {
    postId: v.id("communityPosts"),
    title: v.string(),
    body: v.string(),
    courseId: v.optional(v.id("courses")),
    scope: v.optional(communityScopeValidator),
    status: v.optional(v.union(v.literal("draft"), v.literal("pending"), v.literal("published"))),
    imageStorageId: v.optional(v.id("_storage")),
    imageMimeType: v.optional(v.string()),
    imageFileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Diskusija nije pronadjena");
    if (post.authorId !== userId) {
      throw new Error("Nemate dozvolu da menjate ovu diskusiju");
    }

    const resolvedScope = await resolvePostWriteScope(ctx, args.scope, args.courseId, post);
    if (args.scope && args.courseId && (resolvedScope.kind !== "course" || resolvedScope.courseId !== args.courseId)) {
      throw new Error("Scope kurs se ne poklapa sa courseId vrednošću.");
    }
    if (resolvedScope.kind === "course") {
      await requireCourseAccess(ctx, resolvedScope.courseId);
    }
    const title = args.title.trim();
    const body = args.body.trim();
    const currentStatus = effectivePostStatus(post);
    const canBeIncomplete =
      args.status === "draft" ||
      (args.status === undefined && (currentStatus === "draft" || currentStatus === "changes_requested"));
    if (!canBeIncomplete && (!title || !body)) {
      throw new Error("Naslov i sadržaj su obavezni.");
    }
    if (title.length > 160) throw new Error("Naslov može imati najviše 160 karaktera.");
    if (body.length > 20_000) throw new Error("Sadržaj je predugačak.");

    let nextStatus = currentStatus;

    const patch: any = {
      title,
      body,
      searchText: postSearchText(title, body),
      ...scopeFields(resolvedScope),
      updatedAt: Date.now(),
    };

    if (args.status !== undefined) {
      if (args.status === "draft" || !profile.username) {
        nextStatus = currentStatus === "changes_requested" ? "changes_requested" : "draft";
      } else {
        nextStatus = isStaffRole(profile.role) ? "published" : "pending";
        patch.moderationReason = undefined;
        patch.moderatedAt = undefined;
        patch.moderatedBy = undefined;
      }
      patch.status = nextStatus;
      patch.workflowGroup = workflowGroupForStatus(nextStatus);
    }

    if (args.imageStorageId !== undefined) {
      patch.imageStorageId = args.imageStorageId;
      patch.imageMimeType = args.imageMimeType;
      patch.imageFileName = args.imageFileName;
    }

    await ctx.db.patch(args.postId, patch);

    if (nextStatus === "published") {
      await notifyMentions(ctx, body, args.postId);
    }

    return args.postId;
  },
});

export const submitPost = mutation({
  args: { postId: v.id("communityPosts") },
  handler: async (ctx, args) => {
    const { userId, profile } = await requireCompleteCommunityProfile(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== userId) throw new Error("Diskusija nije pronađena.");
    const currentStatus = effectivePostStatus(post);
    if (currentStatus === "published" || currentStatus === "pending") {
      return { postId: post._id, status: currentStatus };
    }
    if (!post.title.trim() || !post.body.trim()) {
      throw new Error("Naslov i sadržaj su obavezni.");
    }
    const nextStatus = isStaffRole(profile.role) ? "published" : "pending";
    const now = Date.now();
    await ctx.db.patch(post._id, {
      status: nextStatus,
      workflowGroup: workflowGroupForStatus(nextStatus),
      moderationReason: undefined,
      moderatedAt: undefined,
      moderatedBy: undefined,
      lastActivityAt: now,
      updatedAt: now,
    });
    if (nextStatus === "published") await notifyMentions(ctx, post.body, post._id);
    return { postId: post._id, status: nextStatus };
  },
});

async function moderatePostImpl(
  ctx: MutationCtx,
  args: {
    postId: Id<"communityPosts">;
    decision: "approve" | "request_changes";
    reason?: string;
  },
) {
  await requireCommunityModerator(ctx);
  const moderatorId = await requireUserId(ctx);
  const post = await ctx.db.get(args.postId);
  if (!post) throw new Error("Diskusija nije pronađena.");

  const previousStatus = effectivePostStatus(post);
  const now = Date.now();
  const reason = args.reason?.trim();
  if (args.decision === "request_changes" && !reason) {
    throw new Error("Razlog za traženu izmenu je obavezan.");
  }
  if (args.decision === "approve" && previousStatus === "published") {
    return { postId: post._id, status: "published" as const, reason: undefined };
  }
  if (
    args.decision === "request_changes" &&
    previousStatus === "changes_requested" &&
    post.moderationReason === reason
  ) {
    return { postId: post._id, status: "changes_requested" as const, reason };
  }
  if (previousStatus !== "pending") {
    throw new Error("Samo diskusija na odobrenju može biti moderirana.");
  }

  const nextStatus = args.decision === "approve" ? "published" : "changes_requested";
  await ctx.db.patch(args.postId, {
    status: nextStatus,
    workflowGroup: workflowGroupForStatus(nextStatus),
    moderationReason: args.decision === "request_changes" ? reason : undefined,
    moderatedAt: now,
    moderatedBy: moderatorId,
    updatedAt: now,
  });
  await ctx.db.insert("communityModerationEvents", {
    postId: args.postId,
    moderatorId,
    decision: args.decision === "approve" ? "approved" : "changes_requested",
    previousStatus,
    nextStatus,
    reason: args.decision === "request_changes" ? reason : undefined,
    createdAt: now,
  });

  if (post.authorId !== moderatorId) {
    await ctx.db.insert("notifications", {
      userId: post.authorId,
      title: args.decision === "approve" ? "Diskusija je objavljena" : "Potrebna je izmena diskusije",
      body:
        args.decision === "approve"
          ? `Tvoja diskusija „${post.title}” je odobrena i objavljena.`
          : reason!,
      kind: args.decision === "approve" ? "post_approved" : "post_changes_requested",
      postId: post._id,
      senderId: moderatorId,
      excerpt: reason,
      createdAt: now,
    });
  }

  if (args.decision === "approve") {
    await notifyMentions(ctx, post.body, post._id);
  }

  return { postId: post._id, status: nextStatus, reason };
}

export const moderatePost = mutation({
  args: {
    postId: v.id("communityPosts"),
    decision: v.union(v.literal("approve"), v.literal("request_changes")),
    reason: v.optional(v.string()),
  },
  handler: (ctx, args) => moderatePostImpl(ctx, args),
});

export const approvePost = mutation({
  args: {
    postId: v.id("communityPosts"),
  },
  handler: async (ctx, args) => {
    await moderatePostImpl(ctx, { postId: args.postId, decision: "approve" });
    return args.postId;
  },
});

export const setFeaturedFlags = mutation({
  args: {
    postId: v.id("communityPosts"),
    isFeaturedGlobal: v.boolean(),
    featuredCourseId: v.optional(v.id("courses")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Diskusija nije pronadjena");
    if (args.featuredCourseId) {
      const course = await ctx.db.get(args.featuredCourseId);
      if (!course) throw new Error("Kurs nije pronadjen");
    }

    await ctx.db.patch(args.postId, {
      isFeaturedGlobal: args.isFeaturedGlobal,
      featuredCourseId: args.featuredCourseId,
      updatedAt: Date.now(),
    });

    return args.postId;
  },
});

export const setPinnedScope = mutation({
  args: {
    postId: v.id("communityPosts"),
    scope: communityScopeValidator,
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Diskusija nije pronađena.");
    if (effectivePostStatus(post) !== "published") {
      throw new Error("Samo objavljena diskusija može biti istaknuta.");
    }
    const scope = await resolveCommunityScope(ctx, args.scope);
    const patch: {
      isFeaturedGlobal?: boolean;
      featuredTrackId?: Id<"courseTracks">;
      featuredCourseId?: Id<"courses">;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (scope.kind === "global") {
      patch.isFeaturedGlobal = args.enabled;
    } else if (scope.kind === "track") {
      patch.featuredTrackId = args.enabled ? scope.trackId : undefined;
    } else {
      patch.featuredCourseId = args.enabled ? scope.courseId : undefined;
    }

    await ctx.db.patch(post._id, patch);
    return { postId: post._id, scope, enabled: args.enabled };
  },
});

async function commentsWithDetails(
  ctx: QueryCtx,
  comments: Doc<"comments">[],
  userId: Id<"users">,
) {
  return Promise.all(
    comments.map(async (comment) => {
      const author = await publicCommunityIdentity(ctx, comment.authorId);
      const authorProfile = author.profile ?? ({
        name: author.name,
        username: author.username,
        role: author.role,
        avatarUrl: author.avatarUrl,
      } as Doc<"profiles">);
      const authorRole = author.role;
      const reactionRows =
        comment.upvoteCount === undefined || comment.downvoteCount === undefined
          ? await ctx.db
              .query("reactions")
              .withIndex("by_target", (q) =>
                q.eq("targetType", "comment").eq("targetId", String(comment._id)),
              )
              .take(1000)
          : [];
      const derivedCounts = reactionRows.length ? voteCounts(reactionRows) : null;
      const userReaction = (
        await ctx.db
          .query("reactions")
          .withIndex("by_user_target", (q) =>
            q
              .eq("userId", userId)
              .eq("targetType", "comment")
              .eq("targetId", String(comment._id)),
          )
          .unique()
      )?.reaction;

      return {
        ...comment,
        isHelpful: Boolean(comment.isHelpful),
        authorName: authorProfile?.name ?? "Član zajednice",
        authorUsername: authorProfile?.username,
        authorRole,
        authorAvatarUrl: await profileAvatarUrl(ctx, authorProfile),
        authorRank: await studentRankFor(ctx, comment.authorId, authorRole),
        reactionsCount: comment.reactionCount ?? ((comment.upvoteCount ?? derivedCounts?.upvoteCount ?? 0) + (comment.downvoteCount ?? derivedCounts?.downvoteCount ?? 0)),
        upvoteCount: comment.upvoteCount ?? derivedCounts?.upvoteCount ?? 0,
        downvoteCount: comment.downvoteCount ?? derivedCounts?.downvoteCount ?? 0,
        voteScore: comment.voteScore ?? derivedCounts?.voteScore ?? 0,
        userVote: userReaction === "upvote" || userReaction === "downvote" ? userReaction : undefined,
        userReaction,
      };
    }),
  );
}

async function requirePostReader(ctx: QueryCtx, postId: Id<"communityPosts">) {
  const { userId, profile } = await getCurrentProfile(ctx);
  const post = await ctx.db.get(postId);
  if (!post) throw new Error("Diskusija nije pronađena.");
  if (post.courseId) await requireCourseAccess(ctx, post.courseId);
  if (effectivePostStatus(post) !== "published" && post.authorId !== userId && !isStaffRole(profile.role)) {
    throw new Error("Diskusija nije pronađena.");
  }
  return { post, userId };
}

export const getPostComments = query({
  args: {
    postId: v.id("communityPosts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePostReader(ctx, args.postId);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(200);
    return commentsWithDetails(ctx, comments, userId);
  },
});

export const listCommentsPage = query({
  args: {
    postId: v.id("communityPosts"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePostReader(ctx, args.postId);
    const result = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .paginate(args.paginationOpts);
    return { ...result, page: await commentsWithDetails(ctx, result.page, userId) };
  },
});

export const addComment = mutation({
  args: {
    postId: v.id("communityPosts"),
    parentId: v.optional(v.id("comments")),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireCompleteCommunityProfile(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Diskusija nije pronađena.");
    if (effectivePostStatus(post) !== "published") {
      throw new Error("Komentari su dostupni tek kada je diskusija objavljena.");
    }
    if (post.courseId) {
      await requireCourseAccess(ctx, post.courseId);
    }
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.postId !== args.postId) {
        throw new Error("Odgovor mora pripadati istoj diskusiji.");
      }
    }
    const body = args.body.trim();
    if (!body) throw new Error("Komentar ne može biti prazan.");
    if (body.length > 5_000) throw new Error("Komentar je predugačak.");
    const now = Date.now();

    const commentId = await ctx.db.insert("comments", {
      postId: args.postId,
      authorId: userId,
      parentId: args.parentId,
      body,
      reactionCount: 0,
      upvoteCount: 0,
      downvoteCount: 0,
      voteScore: 0,
      isHelpful: false,
      createdAt: now,
    });
    await ctx.db.patch(post._id, {
      ...(post.commentCount === undefined ? {} : { commentCount: post.commentCount + 1 }),
      lastActivityAt: now,
      updatedAt: now,
    });

    if (post.authorId !== userId) {
      const commenterIdentity = await publicCommunityIdentity(ctx, userId);
      const commenterName = commenterIdentity.username ? `@${commenterIdentity.username}` : commenterIdentity.name;
      await ctx.db.insert("notifications", {
        userId: post.authorId,
        title: "Novi komentar",
        body: `${commenterName} je komentarisao tvoju diskusiju "${post.title}".`,
        kind: "comment_post",
        postId: args.postId,
        commentId,
        senderId: userId,
        excerpt: body.slice(0, 240),
        eventKey: `comment_post:${args.postId}:${commentId}`,
        createdAt: now,
      });
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (parent && parent.authorId !== userId && parent.authorId !== post.authorId) {
        const replyIdentity = await publicCommunityIdentity(ctx, userId);
        const replyName = replyIdentity.username ? `@${replyIdentity.username}` : replyIdentity.name;
        await ctx.db.insert("notifications", {
          userId: parent.authorId,
          title: "Novi odgovor",
          body: `${replyName} je odgovorio/la na tvoj komentar.`,
          kind: "comment_reply",
          postId: args.postId,
          commentId,
          senderId: userId,
          excerpt: body.slice(0, 240),
          eventKey: `comment_reply:${args.parentId}:${commentId}`,
          createdAt: now,
        });
      }
    }

    await notifyMentions(ctx, body, args.postId, commentId);

    return commentId;
  },
});

type VoteArgs = {
  targetType: "post" | "comment";
  targetId: string;
  vote: CommunityVote;
};

async function handleVote(ctx: MutationCtx, args: VoteArgs) {
  const userId = await requireUserId(ctx);
  await requireCompleteCommunityProfile(ctx);
  let post: Doc<"communityPosts">;
  let comment: Doc<"comments"> | null = null;
  let targetId: string;

  if (args.targetType === "post") {
    const normalizedId = ctx.db.normalizeId("communityPosts", args.targetId);
    if (!normalizedId) throw new Error("Diskusija nije pronađena.");
    const targetPost = await ctx.db.get(normalizedId);
    if (!targetPost || effectivePostStatus(targetPost) !== "published") throw new Error("Diskusija nije pronađena.");
    post = targetPost;
    targetId = String(normalizedId);
  } else {
    const normalizedId = ctx.db.normalizeId("comments", args.targetId);
    if (!normalizedId) throw new Error("Komentar nije pronađen.");
    comment = await ctx.db.get(normalizedId);
    if (!comment) throw new Error("Komentar nije pronađen.");
    const targetPost = await ctx.db.get(comment.postId);
    if (!targetPost || effectivePostStatus(targetPost) !== "published") throw new Error("Diskusija nije pronađena.");
    post = targetPost;
    targetId = String(normalizedId);
  }
  if (post.courseId) await requireCourseAccess(ctx, post.courseId);

  const existing = await ctx.db.query("reactions").withIndex("by_user_target", (q) =>
    q.eq("userId", userId).eq("targetType", args.targetType).eq("targetId", targetId),
  ).unique();
  const currentVote = existing ? (voteValue(existing.reaction) > 0 ? "upvote" : voteValue(existing.reaction) < 0 ? "downvote" : undefined) : undefined;
  const nextVote = currentVote === args.vote ? undefined : args.vote;
  if (existing) {
    if (nextVote) await ctx.db.patch(existing._id, { reaction: nextVote, createdAt: Date.now() });
    else await ctx.db.delete(existing._id);
  } else if (nextVote) {
    await ctx.db.insert("reactions", { targetType: args.targetType, targetId, reaction: nextVote, userId, createdAt: Date.now() });
  }

  const rows = await ctx.db.query("reactions").withIndex("by_target", (q) =>
    q.eq("targetType", args.targetType).eq("targetId", targetId),
  ).take(1000);
  const counts = voteCounts(rows);
  const now = Date.now();
  if (args.targetType === "post") {
    await ctx.db.patch(post._id, {
      upvoteCount: counts.upvoteCount,
      downvoteCount: counts.downvoteCount,
      voteScore: counts.voteScore,
      hotScore: hotScoreFor(counts.voteScore, post.createdAt),
      reactionCount: counts.upvoteCount + counts.downvoteCount,
      updatedAt: now,
    });
  } else if (comment) {
    await ctx.db.patch(comment._id, {
      upvoteCount: counts.upvoteCount,
      downvoteCount: counts.downvoteCount,
      voteScore: counts.voteScore,
      reactionCount: counts.upvoteCount + counts.downvoteCount,
    });
  }

  const recipientId = args.targetType === "post" ? post.authorId : comment!.authorId;
  const eventKey = `vote:${args.targetType}:${targetId}:${userId}`;
  const existingNotification = await ctx.db.query("notifications").withIndex("by_userId_and_eventKey", (q) =>
    q.eq("userId", recipientId).eq("eventKey", eventKey),
  ).unique();
  if (recipientId !== userId) {
    if (!nextVote) {
      if (existingNotification) await ctx.db.delete(existingNotification._id);
    } else {
      const identity = await publicCommunityIdentity(ctx, userId);
      const senderName = identity.username ? `@${identity.username}` : identity.name;
      const isPost = args.targetType === "post";
      const noun = isPost ? "diskusiju" : "komentar";
      const voteLabel = nextVote === "upvote" ? "upvoteovao/la" : "downvoteovao/la";
      const notification = {
        userId: recipientId,
        title: nextVote === "upvote" ? "Novi upvote" : "Novi downvote",
        body: `${senderName} je ${voteLabel} tvoju ${noun}.`,
        kind: `${nextVote}_${args.targetType}`,
        postId: post._id,
        ...(comment ? { commentId: comment._id } : {}),
        senderId: userId,
        eventKey,
        createdAt: now,
        readAt: undefined,
      };
      if (existingNotification) await ctx.db.patch(existingNotification._id, notification);
      else await ctx.db.insert("notifications", notification);
    }
  }

  return {
    targetType: args.targetType,
    targetId,
    userVote: nextVote ?? null,
    ...counts,
  };
}

export const vote = mutation({
  args: {
    targetType: v.union(v.literal("post"), v.literal("comment")),
    targetId: v.string(),
    vote: v.union(v.literal("upvote"), v.literal("downvote")),
  },
  handler: handleVote,
});

/** Compatibility endpoint for older clients while the generated bindings roll forward. */
export const react = mutation({
  args: {
    targetType: v.union(v.literal("post"), v.literal("comment")),
    targetId: v.string(),
    reaction: v.union(v.literal("like"), v.literal("celebrate"), v.literal("upvote"), v.literal("downvote")),
  },
  handler: (ctx, args) => handleVote(ctx, {
    targetType: args.targetType,
    targetId: args.targetId,
    vote: args.reaction === "downvote" ? "downvote" : "upvote",
  }),
});

export const setCommentHelpful = mutation({
  args: {
    commentId: v.id("comments"),
    helpful: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Komentar nije pronađen.");
    const post = await ctx.db.get(comment.postId);
    if (!post || effectivePostStatus(post) !== "published") {
      throw new Error("Diskusija nije pronađena.");
    }
    if (post.authorId !== userId && !isStaffRole(profile.role)) {
      throw new Error("Samo autor diskusije ili moderator može označiti koristan odgovor.");
    }
    if (args.helpful && comment.authorId === userId) {
      throw new Error("Sopstveni komentar ne može doneti XP.");
    }

    const wasHelpful = Boolean(comment.isHelpful);
    if (wasHelpful === args.helpful) {
      const existingEvent = await ctx.db
        .query("leaderboardEvents")
        .withIndex("by_userId_and_sourceType_and_sourceId", (q) =>
          q
            .eq("userId", comment.authorId)
            .eq("sourceType", "helpful_comment")
            .eq("sourceId", String(comment._id)),
        )
        .unique();
      return {
        commentId: comment._id,
        helpful: wasHelpful,
        awardedXp: existingEvent?.active ? existingEvent.points : 0,
      };
    }

    const now = Date.now();
    const xp = await syncLeaderboardSourceEvent(ctx, {
      userId: comment.authorId,
      sourceType: "helpful_comment",
      sourceId: String(comment._id),
      active: args.helpful,
      occurredAt: now,
      courseId: post.courseId,
      trackId: post.trackId,
      postId: post._id,
      commentId: comment._id,
    });
    await ctx.db.patch(comment._id, {
      isHelpful: args.helpful,
      helpfulMarkedBy: args.helpful ? userId : undefined,
      helpfulMarkedAt: args.helpful ? now : undefined,
    });
    await ctx.db.patch(post._id, {
      ...(post.helpfulAnswerCount === undefined
        ? {}
        : { helpfulAnswerCount: Math.max(0, post.helpfulAnswerCount + (args.helpful ? 1 : -1)) }),
      lastActivityAt: now,
      updatedAt: now,
    });

    if (args.helpful) {
      const eventKey = `helpful_comment:${comment._id}`;
      const existingNotification = await ctx.db
        .query("notifications")
        .withIndex("by_userId_and_eventKey", (q) =>
          q.eq("userId", comment.authorId).eq("eventKey", eventKey),
        )
        .unique();
      if (!existingNotification) {
        await ctx.db.insert("notifications", {
          userId: comment.authorId,
          title: "Tvoj odgovor je označen kao koristan",
          body: xp.awardedXp > 0 ? `Osvojio/la si ${xp.awardedXp} XP.` : "Odgovor je istaknut kao koristan.",
          kind: "helpful_comment",
          postId: post._id,
          commentId: comment._id,
          senderId: userId,
          eventKey,
          createdAt: now,
        });
      }
    }

    return { commentId: comment._id, helpful: args.helpful, awardedXp: xp.awardedXp };
  },
});

export const deletePost = mutation({
  args: {
    postId: v.id("communityPosts"),
  },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Diskusija nije pronadjena");

    const profileRows = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(100);
    const profile = [...profileRows].sort((a, b) => a._creationTime - b._creationTime)[0] ?? null;
    const isAdminOrMod = profile?.role === "admin" || profile?.role === "moderator";

    if (post.authorId !== userId && !isAdminOrMod) {
      throw new Error("Nemate dozvolu da obrisete ovu diskusiju");
    }

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(501);
    if (comments.length > 500) {
      throw new Error("Diskusija ima previše komentara za direktno brisanje.");
    }

    const commentReactions = await Promise.all(
      comments.map(async (comment) =>
        ctx.db
          .query("reactions")
          .withIndex("by_target", (q) =>
            q.eq("targetType", "comment").eq("targetId", String(comment._id)),
          )
          .take(501),
      ),
    );
    if (commentReactions.some((rows) => rows.length > 500)) {
      throw new Error("Komentar ima previše reakcija za direktno brisanje.");
    }
    for (const reaction of commentReactions.flat()) {
      await ctx.db.delete(reaction._id);
    }

    const postReactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "post").eq("targetId", String(args.postId)),
      )
      .take(501);
    if (postReactions.length > 500) {
      throw new Error("Diskusija ima previše reakcija za direktno brisanje.");
    }
    for (const reaction of postReactions) {
      await ctx.db.delete(reaction._id);
    }

    const favorites = await ctx.db
      .query("postFavorites")
      .withIndex("by_postId_and_createdAt", (q) => q.eq("postId", args.postId))
      .take(501);
    if (favorites.length > 500) throw new Error("Diskusija ima previše sačuvanih stavki za direktno brisanje.");
    for (const fav of favorites) {
      await ctx.db.delete(fav._id);
    }

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_postId_and_createdAt", (q) => q.eq("postId", args.postId))
      .take(501);
    if (notifications.length > 500) throw new Error("Diskusija ima previše obaveštenja za direktno brisanje.");
    for (const notif of notifications) {
      await ctx.db.delete(notif._id);
    }

    for (const comment of comments) {
      if (comment.isHelpful) {
        await syncLeaderboardSourceEvent(ctx, {
          userId: comment.authorId,
          sourceType: "helpful_comment",
          sourceId: String(comment._id),
          active: false,
          courseId: post.courseId,
          trackId: post.trackId,
          postId: post._id,
          commentId: comment._id,
        });
      }
      await ctx.db.delete(comment._id);
    }

    await ctx.db.delete(args.postId);
  },
});

export const deleteComment = mutation({
  args: {
    commentId: v.id("comments"),
  },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Komentar nije pronadjen");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const isAdminOrMod = profile?.role === "admin" || profile?.role === "moderator";

    if (comment.authorId !== userId && !isAdminOrMod) {
      throw new Error("Forbidden");
    }

    const post = await ctx.db.get(comment.postId);
    if (!post) throw new Error("Diskusija nije pronađena.");
    const subtree: Doc<"comments">[] = [comment];
    for (let index = 0; index < subtree.length; index += 1) {
      const replies = await ctx.db
        .query("comments")
        .withIndex("by_parent", (q) => q.eq("parentId", subtree[index]._id))
        .take(201);
      subtree.push(...replies);
      if (subtree.length > 200) {
        throw new Error("Nit odgovora je prevelika za direktno brisanje.");
      }
    }

    for (const item of subtree) {
      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_target", (q) =>
          q.eq("targetType", "comment").eq("targetId", String(item._id)),
        )
        .take(501);
      if (reactions.length > 500) throw new Error("Komentar ima previše reakcija za direktno brisanje.");
      for (const reaction of reactions) await ctx.db.delete(reaction._id);

      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_commentId_and_createdAt", (q) => q.eq("commentId", item._id))
        .take(501);
      if (notifications.length > 500) throw new Error("Komentar ima previše obaveštenja za direktno brisanje.");
      for (const notification of notifications) await ctx.db.delete(notification._id);

      if (item.isHelpful) {
        await syncLeaderboardSourceEvent(ctx, {
          userId: item.authorId,
          sourceType: "helpful_comment",
          sourceId: String(item._id),
          active: false,
          courseId: post.courseId,
          trackId: post.trackId,
          postId: post._id,
          commentId: item._id,
        });
      }
    }
    for (const item of [...subtree].reverse()) await ctx.db.delete(item._id);
    await ctx.db.patch(post._id, {
      ...(post.commentCount === undefined
        ? {}
        : { commentCount: Math.max(0, post.commentCount - subtree.length) }),
      ...(post.helpfulAnswerCount === undefined
        ? {}
        : {
            helpfulAnswerCount: Math.max(
              0,
              post.helpfulAnswerCount - subtree.filter((item) => item.isHelpful).length,
            ),
          }),
      updatedAt: Date.now(),
    });
  },
});

export const createAttachmentUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentProfile(ctx);
    const profiles = await ctx.db.query("profiles").take(200);
    const roleOrder = { admin: 0, moderator: 1, pro_student: 2, student: 3 };
    const sorted = profiles.sort((a, b) => {
      const orderA = roleOrder[a.role as keyof typeof roleOrder] ?? 4;
      const orderB = roleOrder[b.role as keyof typeof roleOrder] ?? 4;
      return orderA - orderB || a.name.localeCompare(b.name);
    });

    return Promise.all(
      sorted.map(async (profile) => {
        const avatarUrl = await profileAvatarUrl(ctx, profile);
        return {
          _id: profile._id,
          name: profile.name,
          username: profile.username,
          role: profile.role,
          avatarUrl,
        };
      })
    );
  },
});

export const listFavorites = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await getCurrentProfile(ctx);

    const favorites = await ctx.db
      .query("postFavorites")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(200);

    const postIds = favorites.map((f) => f.postId);
    const posts = [];
    for (const id of postIds) {
      const post = await ctx.db.get(id);
      if (post && (post.status === "published" || !post.status)) {
        posts.push(post);
      }
    }

    posts.sort((a, b) => b.createdAt - a.createdAt);
    return postsWithDetails(ctx, posts, userId);
  },
});

export const toggleFavorite = mutation({
  args: {
    postId: v.id("communityPosts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || effectivePostStatus(post) !== "published") {
      throw new Error("Diskusija nije pronađena.");
    }
    if (post.courseId) await requireCourseAccess(ctx, post.courseId);
    const existing = await ctx.db
      .query("postFavorites")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", args.postId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    } else {
      await ctx.db.insert("postFavorites", {
        userId,
        postId: args.postId,
        createdAt: Date.now(),
      });
      return true;
    }
  },
});

export const listMyPosts = query({
  args: {
    status: v.union(v.literal("published"), v.literal("draft")),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentProfile(ctx);
    const posts = await ctx.db
      .query("communityPosts")
      .withIndex("by_author", (q) => q.eq("authorId", userId))
      .order("desc")
      .take(200);

    const filtered = posts.filter((post) => {
      const postStatus = post.status ?? "published";
      if (args.status === "published") {
        return postStatus === "published" || postStatus === "pending";
      } else {
        return postStatus === "draft" || postStatus === "changes_requested";
      }
    });

    return postsWithDetails(ctx, filtered, userId);
  },
});

export const listMentions = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await getCurrentProfile(ctx);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);

    const mentionNotifs = notifications.filter(
      (n) => n.kind === "mention" || n.kind === "like_comment"
    );

    const postIds = Array.from(new Set(mentionNotifs.map((n) => n.postId).filter(Boolean))) as Id<"communityPosts">[];

    const posts = [];
    for (const id of postIds) {
      const post = await ctx.db.get(id);
      if (post) posts.push(post);
    }

    posts.sort((a, b) => b.createdAt - a.createdAt);

    return postsWithDetails(ctx, posts, userId);
  },
});

export const listPendingPosts = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin" && profile.role !== "moderator") {
      throw new Error("Forbidden");
    }

    const pending = await ctx.db
      .query("communityPosts")
      .withIndex("by_status_and_updatedAt", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(200);

    return postsWithDetails(ctx, pending, userId);
  },
});

const communityPostSortValidator = v.union(
  v.literal("hot"),
  v.literal("top"),
  v.literal("latest"),
  v.literal("active"),
  v.literal("unanswered"),
);
const myPostsViewValidator = v.union(
  v.literal("drafts"),
  v.literal("pending"),
  v.literal("published"),
  v.literal("saved"),
);
const memberRoleValidator = v.union(
  v.literal("student"),
  v.literal("pro_student"),
  v.literal("moderator"),
  v.literal("admin"),
);

function boundedPaginationOpts(paginationOpts: { numItems: number; cursor: string | null }) {
  return {
    cursor: paginationOpts.cursor,
    numItems: Math.max(1, Math.min(50, Math.floor(paginationOpts.numItems))),
  };
}

export const getCommunityFilters = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const [tracks, courses, notificationCounts] = await Promise.all([
      ctx.db
        .query("courseTracks")
        .withIndex("by_status_and_sortOrder", (q) => q.eq("status", "published"))
        .take(100),
      ctx.db
        .query("courses")
        .withIndex("by_status", (q) => q.eq("status", "published"))
        .take(200),
      getCommunityNotificationCountsHelper(ctx, userId),
    ]);
    const courseRows = courses.map((course) => ({
      _id: course._id,
      trackId: course.trackId,
      slug: course.slug,
      titleSr: course.titleSr,
      titleEn: course.titleEn,
      sortOrder: course.sortOrder,
    }));

    return {
      viewer: {
        userId,
        role: profile.role,
        language: profile.language,
      },
      tracks: tracks.map((track) => ({
        _id: track._id,
        slug: track.slug,
        titleSr: track.titleSr,
        titleEn: track.titleEn,
        descriptionSr: track.descriptionSr,
        descriptionEn: track.descriptionEn,
        sortOrder: track.sortOrder,
        courses: courseRows.filter((course) => course.trackId === track._id),
      })),
      courses: courseRows,
      counts: {
        community: notificationCounts.community,
        mentions: notificationCounts.mentions,
        myThreads: notificationCounts.myThreads,
        pendingApprovals: notificationCounts.pendingApprovals,
        profileIncomplete: notificationCounts.profileIncomplete,
        total: notificationCounts.total,
      },
    };
  },
});

export const listPostsPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    scope: communityScopeValidator,
    search: v.optional(v.string()),
    sort: communityPostSortValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentProfile(ctx);
    const scope = await resolveCommunityScope(ctx, args.scope);
    if (scope.kind === "course") await requireCourseAccess(ctx, scope.courseId);
    const paginationOpts = boundedPaginationOpts(args.paginationOpts);
    const search = args.search?.trim();

    const result = search
      ? scope.kind === "global"
        ? await ctx.db
            .query("communityPosts")
            .withSearchIndex("search_searchText", (q) =>
              q.search("searchText", search).eq("status", "published"),
            )
            .paginate(paginationOpts)
        : scope.kind === "track"
          ? await ctx.db
              .query("communityPosts")
              .withSearchIndex("search_searchText", (q) =>
                q.search("searchText", search).eq("status", "published").eq("trackId", scope.trackId),
              )
              .paginate(paginationOpts)
          : await ctx.db
              .query("communityPosts")
              .withSearchIndex("search_searchText", (q) =>
                q.search("searchText", search).eq("status", "published").eq("scopeKey", scope.scopeKey),
              )
              .paginate(paginationOpts)
      : args.sort === "hot"
        ? scope.kind === "global"
          ? await ctx.db.query("communityPosts").withIndex("by_status_and_hotScore", (q) => q.eq("status", "published")).order("desc").paginate(paginationOpts)
          : scope.kind === "track"
            ? await ctx.db.query("communityPosts").withIndex("by_trackId_and_status_and_hotScore", (q) => q.eq("trackId", scope.trackId).eq("status", "published")).order("desc").paginate(paginationOpts)
            : await ctx.db.query("communityPosts").withIndex("by_scopeKey_and_status_and_hotScore", (q) => q.eq("scopeKey", scope.scopeKey).eq("status", "published")).order("desc").paginate(paginationOpts)
        : args.sort === "top"
          ? scope.kind === "global"
            ? await ctx.db.query("communityPosts").withIndex("by_status_and_voteScore", (q) => q.eq("status", "published")).order("desc").paginate(paginationOpts)
            : scope.kind === "track"
              ? await ctx.db.query("communityPosts").withIndex("by_trackId_and_status_and_voteScore", (q) => q.eq("trackId", scope.trackId).eq("status", "published")).order("desc").paginate(paginationOpts)
              : await ctx.db.query("communityPosts").withIndex("by_scopeKey_and_status_and_voteScore", (q) => q.eq("scopeKey", scope.scopeKey).eq("status", "published")).order("desc").paginate(paginationOpts)
        : args.sort === "latest"
        ? scope.kind === "global"
          ? await ctx.db
              .query("communityPosts")
              .withIndex("by_status_and_createdAt", (q) => q.eq("status", "published"))
              .order("desc")
              .paginate(paginationOpts)
          : scope.kind === "track"
            ? await ctx.db
                .query("communityPosts")
                .withIndex("by_trackId_and_status_and_createdAt", (q) =>
                  q.eq("trackId", scope.trackId).eq("status", "published"),
                )
                .order("desc")
                .paginate(paginationOpts)
            : await ctx.db
                .query("communityPosts")
                .withIndex("by_scopeKey_and_status_and_createdAt", (q) =>
                  q.eq("scopeKey", scope.scopeKey).eq("status", "published"),
                )
                .order("desc")
                .paginate(paginationOpts)
        : args.sort === "active"
          ? scope.kind === "global"
            ? await ctx.db
                .query("communityPosts")
                .withIndex("by_status_and_lastActivityAt", (q) => q.eq("status", "published"))
                .order("desc")
                .paginate(paginationOpts)
            : scope.kind === "track"
              ? await ctx.db
                  .query("communityPosts")
                  .withIndex("by_trackId_and_status_and_lastActivityAt", (q) =>
                    q.eq("trackId", scope.trackId).eq("status", "published"),
                  )
                  .order("desc")
                  .paginate(paginationOpts)
              : await ctx.db
                  .query("communityPosts")
                  .withIndex("by_scopeKey_and_status_and_lastActivityAt", (q) =>
                    q.eq("scopeKey", scope.scopeKey).eq("status", "published"),
                  )
                  .order("desc")
                  .paginate(paginationOpts)
          : scope.kind === "global"
            ? await ctx.db
                .query("communityPosts")
                .withIndex("by_status_and_commentCount_and_lastActivityAt", (q) =>
                  q.eq("status", "published").eq("commentCount", 0),
                )
                .order("desc")
                .paginate(paginationOpts)
            : scope.kind === "track"
              ? await ctx.db
                  .query("communityPosts")
                  .withIndex("by_trackId_and_status_and_commentCount_and_lastActivityAt", (q) =>
                    q.eq("trackId", scope.trackId).eq("status", "published").eq("commentCount", 0),
                  )
                  .order("desc")
                  .paginate(paginationOpts)
              : await ctx.db
                  .query("communityPosts")
                  .withIndex("by_scopeKey_and_status_and_commentCount_and_lastActivityAt", (q) =>
                    q.eq("scopeKey", scope.scopeKey).eq("status", "published").eq("commentCount", 0),
                  )
                  .order("desc")
                  .paginate(paginationOpts);

    let page = result.page;
    if (page.length === 0 && args.paginationOpts.cursor === null && !search) {
      const legacyCandidates = await ctx.db
        .query("communityPosts")
        .order("desc")
        .take(Math.min(100, paginationOpts.numItems * 5));
      const matchingLegacy: Doc<"communityPosts">[] = [];
      for (const post of legacyCandidates) {
        if (post.scopeKey !== undefined || effectivePostStatus(post) !== "published") continue;
        const postScope = await resolvedScopeForPost(ctx, post);
        const scopeMatches =
          scope.kind === "global" ||
          (scope.kind === "track" && "trackId" in postScope && postScope.trackId === scope.trackId) ||
          (scope.kind === "course" && postScope.scopeKey === scope.scopeKey);
        if (!scopeMatches) continue;
        if (args.sort === "unanswered" && (post.commentCount ?? 0) > 0) continue;
        matchingLegacy.push(post);
        if (matchingLegacy.length >= paginationOpts.numItems) break;
      }
      matchingLegacy.sort((a, b) =>
        args.sort === "top"
          ? (b.voteScore ?? 0) - (a.voteScore ?? 0) || b.createdAt - a.createdAt
          : (b.hotScore ?? hotScoreFor(b.voteScore ?? 0, b.createdAt)) - (a.hotScore ?? hotScoreFor(a.voteScore ?? 0, a.createdAt)),
      );
      page = matchingLegacy;
    }

    return {
      ...result,
      page: await postsWithDetails(ctx, page, userId),
      scope,
      sort: args.sort,
      search: search ?? null,
    };
  },
});

export const listMyPostsPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    view: myPostsViewValidator,
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentProfile(ctx);
    const paginationOpts = boundedPaginationOpts(args.paginationOpts);

    if (args.view === "saved") {
      const favorites = await ctx.db
        .query("postFavorites")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .paginate(paginationOpts);
      const posts = (
        await Promise.all(favorites.page.map((favorite) => ctx.db.get(favorite.postId)))
      ).filter(
        (post): post is Doc<"communityPosts"> => Boolean(post && effectivePostStatus(post) === "published"),
      );
      return { ...favorites, page: await postsWithDetails(ctx, posts, userId), view: args.view };
    }

    const workflowView: "drafts" | "pending" | "published" = args.view;
    const result = await ctx.db
      .query("communityPosts")
      .withIndex("by_authorId_and_workflowGroup_and_updatedAt", (q) =>
        q.eq("authorId", userId).eq("workflowGroup", workflowView),
      )
      .order("desc")
      .paginate(paginationOpts);
    let page = result.page;
    if (page.length === 0 && args.paginationOpts.cursor === null) {
      const legacy = await ctx.db
        .query("communityPosts")
        .withIndex("by_author", (q) => q.eq("authorId", userId))
        .order("desc")
        .take(Math.min(100, paginationOpts.numItems * 5));
      page = legacy
        .filter(
          (post) =>
            post.workflowGroup === undefined &&
            workflowGroupForStatus(effectivePostStatus(post)) === workflowView,
        )
        .slice(0, paginationOpts.numItems);
    }
    const details = await postsWithDetails(ctx, page, userId);
    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1000);
    const unreadByPost = new Map<string, number>();
    for (const notification of unreadNotifications) {
      if (
        !notification.postId ||
        notification.readAt ||
        !["comment_post", "like_post", "post_approved", "post_changes_requested"].includes(String(notification.kind))
      ) {
        continue;
      }
      const key = String(notification.postId);
      unreadByPost.set(key, (unreadByPost.get(key) ?? 0) + 1);
    }
    return {
      ...result,
      page: details.map((post) => ({ ...post, unreadActivityCount: unreadByPost.get(String(post._id)) ?? 0 })),
      view: args.view,
    };
  },
});

export const listMentionEvents = query({
  args: {
    paginationOpts: paginationOptsValidator,
    unreadOnly: v.optional(v.boolean()),
    category: v.optional(v.union(v.literal("all"), v.literal("votes"), v.literal("comments"), v.literal("tags"), v.literal("system"))),
  },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentProfile(ctx);
    const paginationOpts = boundedPaginationOpts(args.paginationOpts);
    const rawOffset = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) : 0;
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
    const communityKinds = new Set([
      "mention", "upvote_post", "downvote_post", "upvote_comment", "downvote_comment",
      "like_post", "like_comment", "comment_post", "comment_reply", "helpful_comment",
      "post_approved", "post_changes_requested",
    ]);
    const categoryMatches = (kind: string) => {
      if (!args.category || args.category === "all") return true;
      if (args.category === "votes") return kind.includes("vote") || kind.startsWith("like_");
      if (args.category === "comments") return kind === "comment_post" || kind === "comment_reply";
      if (args.category === "tags") return kind === "mention";
      return kind === "helpful_comment" || kind === "post_approved" || kind === "post_changes_requested";
    };
    const allNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1000);
    const matchingNotifications = allNotifications.filter(
      (notification) =>
        communityKinds.has(String(notification.kind)) && categoryMatches(String(notification.kind)) && (!args.unreadOnly || !notification.readAt),
    );
    const pageNotifications = matchingNotifications.slice(offset, offset + paginationOpts.numItems);
    const nextOffset = offset + pageNotifications.length;
    const isDone = nextOffset >= matchingNotifications.length && allNotifications.length < 1000;

    const events = await Promise.all(
      pageNotifications.map(async (notification) => {
        if (!notification.postId || !notification.senderId) return null;
        const [post, comment, sender] = await Promise.all([
          ctx.db.get(notification.postId),
          notification.commentId ? ctx.db.get(notification.commentId) : Promise.resolve(null),
          publicCommunityIdentity(ctx, notification.senderId),
        ]);
        if (!post || effectivePostStatus(post) !== "published") return null;
        const scope = await resolvedScopeForPost(ctx, post);
        const course = post.courseId ? await ctx.db.get(post.courseId) : null;
        const track = post.trackId ? await ctx.db.get(post.trackId) : null;
        return {
          notificationId: notification._id,
          createdAt: notification.createdAt,
          readAt: notification.readAt,
          kind: notification.kind,
          unread: !notification.readAt,
          excerpt: comment?.body ?? notification.excerpt ?? notification.body,
          sender: sender
            ? {
                userId: notification.senderId,
                name: sender.name,
                username: sender.username,
                role: sender.role,
                avatarUrl: sender.avatarUrl,
              }
            : null,
          thread: {
            postId: post._id,
            title: post.title,
            scope,
            courseTitleSr: course?.titleSr,
            courseTitleEn: course?.titleEn,
            trackTitleSr: track?.titleSr,
            trackTitleEn: track?.titleEn,
          },
          commentId: comment?._id,
        };
      }),
    );
    return {
      page: events.filter((event) => event !== null),
      isDone,
      continueCursor: isDone ? "" : String(nextOffset),
    };
  },
});

async function publicMemberRow(
  ctx: QueryCtx,
  profile: Doc<"profiles"> | null,
  stat: Doc<"leaderboardStats"> | null,
  viewerRole: unknown,
  user: Doc<"users"> | null = null,
) {
  const xp = stat?.xp ?? 0;
  const email = String(profile?.email ?? user?.email ?? "").trim().toLowerCase();
  const role = effectiveRoleForProfile(email, profile?.role);
  const name = profile?.name ?? user?.name ?? email.split("@")[0] ?? "Član zajednice";
  return {
    profileId: profile?._id,
    userId: profile?.userId ?? user?._id,
    name,
    username: profile?.username ?? user?.username,
    role,
    avatarUrl: (await profileAvatarUrl(ctx, profile)) ?? user?.image,
    xp,
    level: Math.max(1, Math.floor(xp / 500) + 1),
    completedLessons: stat?.completedLessons ?? 0,
    completedTasks: stat?.completedTasks ?? 0,
    helpfulAnswers: stat?.helpfulAnswers ?? 0,
    canManageRole: viewerRole === "admin" && role !== "admin" && Boolean(profile?._id),
  };
}

export const listMembersPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    scope: v.optional(communityScopeValidator),
    search: v.optional(v.string()),
    role: v.optional(memberRoleValidator),
  },
  handler: async (ctx, args) => {
    const { profile: viewerProfile } = await getCurrentProfile(ctx);
    const scope = args.scope
      ? await resolveCommunityScope(ctx, args.scope)
      : globalCommunityScope();
    if (scope.kind === "course") await requireCourseAccess(ctx, scope.courseId);
    const paginationOpts = boundedPaginationOpts(args.paginationOpts);
    const search = args.search?.trim().toLocaleLowerCase();

    if (scope.kind !== "global") {
      const stats = await ctx.db
        .query("leaderboardStats")
        .withIndex("by_scopeKey_and_period_and_periodKey_and_xp", (q) =>
          q.eq("scopeKey", scope.scopeKey).eq("period", "all_time").eq("periodKey", "all"),
        )
        .order("desc")
        .paginate(paginationOpts);
      const members = await Promise.all(
        stats.page.map(async (stat) => {
          const profileRows = await ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", stat.userId))
            .take(100);
          const profile = [...profileRows].sort((a, b) => a._creationTime - b._creationTime)[0] ?? null;
          if (!profile || (args.role && profile.role !== args.role)) return null;
          const searchable = `${profile.name} ${profile.username ?? ""}`.toLocaleLowerCase();
          if (search && !searchable.includes(search)) return null;
          return publicMemberRow(ctx, profile, stat, viewerProfile.role);
        }),
      );
      return { ...stats, page: members.filter((member) => member !== null), scope };
    }

    const roleOrder = ["admin", "moderator", "pro_student", "student"] as const;
    const roles = args.role ? [args.role] : [...roleOrder];
    type MemberSource = Doc<"profiles"> | Doc<"users">;
    const profileRows: MemberSource[] = (
      await Promise.all(
        roles.map((role) =>
          search
            ? ctx.db
                .query("profiles")
                .withSearchIndex("search_searchText", (q) => q.search("searchText", search).eq("role", role))
                .take(250)
            : ctx.db
                .query("profiles")
                .withIndex("by_role", (q) => q.eq("role", role))
                .order("asc")
                .take(250),
        ),
      )
    ).flat() as MemberSource[];
    const profilesByUserId = new Map(
      profileRows.map((row) => [String("userId" in row ? row.userId : row._id), row]),
    );
    if (!args.role && !search) {
      const users = await ctx.db.query("users").take(500);
      for (const user of users) {
        if (!profilesByUserId.has(String(user._id))) profileRows.push(user);
      }
    }
    const uniqueRows = Array.from(
      new Map(
        profileRows.map((row) => [String("userId" in row ? row.userId : row._id), row]),
      ).values(),
    );
    const members = await Promise.all(
      uniqueRows.map(async (row) => {
        const isProfile = "role" in row && "createdAt" in row;
        const profile = isProfile ? (row as Doc<"profiles">) : null;
        const user = profile ? await ctx.db.get(profile.userId) : (row as unknown as Doc<"users">);
        const role = effectiveRoleForProfile(String(profile?.email ?? user?.email ?? ""), profile?.role);
        if (args.role && role !== args.role) return null;
        if (search && !`${profile?.name ?? user?.name ?? ""} ${profile?.username ?? user?.username ?? ""}`.toLocaleLowerCase().includes(search)) return null;
        const memberUserId = profile?.userId ?? user?._id;
        if (!memberUserId) return null;
        const stat = await ctx.db
          .query("leaderboardStats")
          .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
            q.eq("userId", memberUserId).eq("scopeKey", "global").eq("period", "all_time").eq("periodKey", "all"),
          )
          .unique();
        return publicMemberRow(ctx, profile, stat, viewerProfile.role, user);
      }),
    );
    const filteredMembers = members.filter((member): member is NonNullable<typeof member> => Boolean(member));
    filteredMembers.sort((a, b) => {
      const orderA = roleOrder.indexOf(a.role as (typeof roleOrder)[number]);
      const orderB = roleOrder.indexOf(b.role as (typeof roleOrder)[number]);
      return (orderA < 0 ? 99 : orderA) - (orderB < 0 ? 99 : orderB) || a.name.localeCompare(b.name);
    });
    const offset = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) || 0 : 0;
    const page = filteredMembers.slice(offset, offset + paginationOpts.numItems);
    const isDone = offset + page.length >= filteredMembers.length;
    return { page, isDone, continueCursor: isDone ? "" : String(offset + page.length), scope };
  },
});

export const listModerationQueuePage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    if (!isStaffRole(profile.role)) throw new Error("Forbidden");
    const result = await ctx.db
      .query("communityPosts")
      .withIndex("by_status_and_updatedAt", (q) => q.eq("status", "pending"))
      .order("desc")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    return { ...result, page: await postsWithDetails(ctx, result.page, userId) };
  },
});
