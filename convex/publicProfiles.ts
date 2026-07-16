import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { effectiveRoleForProfile, getCurrentProfile, requireUserId } from "./helpers";
import { belgradeDayKey } from "./leaderboardCore";
import { promoteDirectRequestsAfterFollow } from "./chatCore";
import { normalizeUsername } from "../lib/username-policy";

const contributionFilter = v.union(v.literal("all"), v.literal("threads"), v.literal("comments"));
const connectionKind = v.union(v.literal("followers"), v.literal("following"));
const ACTIVE_NOW_MS = 5 * 60 * 1000;
const PROFILE_ACTIVITY_DAYS = 365;
const COMMON_PEOPLE_LIMIT = 6;
const PUBLIC_HELP_TOPIC_LIMIT = 5;

type ConnectionKind = "followers" | "following";
type CommonConnectionKind = "followed_by_both" | "follows_both";

function levelForXp(xp: number) {
  return Math.max(1, Math.floor(Math.max(0, xp) / 500) + 1);
}

function roleFor(user: Doc<"users"> | null) {
  if (!user) return "student" as const;
  return effectiveRoleForProfile(String(user.email ?? ""), user.role);
}

function isStaffRole(role: unknown) {
  return role === "admin" || role === "moderator";
}

async function avatarUrl(ctx: QueryCtx, user: Doc<"users">) {
  if (user.avatarStorageId) return (await ctx.storage.getUrl(user.avatarStorageId)) ?? user.avatarUrl;
  return user.avatarUrl;
}

async function publicMiniProfile(ctx: QueryCtx, user: Doc<"users">) {
  return {
    userId: user._id,
    name: user.name ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || "Član"),
    username: user.username,
    avatarUrl: await avatarUrl(ctx, user),
    role: roleFor(user),
  };
}

async function publishedCoursesFor(ctx: QueryCtx, userId: Id<"users">) {
  const activeCourseIds = new Set<Id<"courses">>();
  const completedByCourse = new Map<Id<"courses">, Set<Id<"lessons">>>();

  for await (const enrollment of ctx.db
    .query("enrollments")
    .withIndex("by_user", (q) => q.eq("userId", userId))) {
    if (enrollment.status === "active") activeCourseIds.add(enrollment.courseId);
  }

  for await (const progress of ctx.db
    .query("progress")
    .withIndex("by_user_course", (q) => q.eq("userId", userId))) {
    activeCourseIds.add(progress.courseId);
    if (!progress.completed) continue;
    const completed = completedByCourse.get(progress.courseId) ?? new Set<Id<"lessons">>();
    completed.add(progress.lessonId);
    completedByCourse.set(progress.courseId, completed);
  }

  const result = [];
  for (const courseId of activeCourseIds) {
    const course = await ctx.db.get(courseId);
    if (!course || course.status !== "published") continue;

    let totalLessons = 0;
    for await (const lesson of ctx.db
      .query("lessons")
      .withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", course._id))) {
      if (lesson.isPublished) totalLessons += 1;
    }

    const track = course.trackId ? await ctx.db.get(course.trackId) : null;
    const completedLessons = completedByCourse.get(course._id)?.size ?? 0;
    result.push({
      courseId: course._id,
      slug: course.slug,
      titleSr: course.titleSr,
      titleEn: course.titleEn,
      trackTitleSr: track?.titleSr,
      trackTitleEn: track?.titleEn,
      coverUrl: course.coverStorageId ? await ctx.storage.getUrl(course.coverStorageId) : null,
      completedLessons,
      totalLessons,
      percent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
      sortOrder: course.sortOrder,
    });
  }

  return result
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((course) => ({
      courseId: course.courseId,
      slug: course.slug,
      titleSr: course.titleSr,
      titleEn: course.titleEn,
      trackTitleSr: course.trackTitleSr,
      trackTitleEn: course.trackTitleEn,
      coverUrl: course.coverUrl,
      completedLessons: course.completedLessons,
      totalLessons: course.totalLessons,
      percent: course.percent,
    }));
}

async function activityFor(ctx: QueryCtx, userId: Id<"users">) {
  const cutoffDayKey = belgradeDayKey(Date.now() - (PROFILE_ACTIVITY_DAYS - 1) * 24 * 60 * 60 * 1000);
  const days = [];
  for await (const row of ctx.db
    .query("profileActivityDays")
    .withIndex("by_userId_and_dayKey", (q) => q.eq("userId", userId).gte("dayKey", cutoffDayKey))) {
    const total = row.lessons + row.tasks + row.threads + row.comments;
    days.push({
      dayKey: row.dayKey,
      lessons: row.lessons,
      tasks: row.tasks,
      threads: row.threads,
      comments: row.comments,
      total,
    });
  }
  return { days, max: Math.max(1, ...days.map((day) => day.total)) };
}

async function publicHelpFor(ctx: QueryCtx, user: Doc<"users">) {
  const rows = await ctx.db
    .query("userHelpTopics")
    .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", user._id))
    .order("desc")
    .take(PUBLIC_HELP_TOPIC_LIMIT + 1);
  const topics = [];
  for (const row of rows) {
    const topic = await ctx.db.get(row.topicId);
    if (!topic?.active) continue;
    topics.push({ topicId: topic._id, name: topic.name, courseId: topic.courseId, mode: row.mode });
    if (topics.length >= PUBLIC_HELP_TOPIC_LIMIT) break;
  }
  return { status: user.helpStatus ?? null, topics };
}

async function followRow(
  ctx: QueryCtx,
  followerId: Id<"users">,
  followingId: Id<"users">,
) {
  return ctx.db
    .query("userFollows")
    .withIndex("by_followerId_and_followingId", (q) =>
      q.eq("followerId", followerId).eq("followingId", followingId),
    )
    .unique();
}

async function commonPeopleFor(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  profileId: Id<"users">,
) {
  if (viewerId === profileId) return [];

  const candidates = new Map<Id<"users">, Doc<"users">>();
  const addCandidate = async (candidateId: Id<"users">) => {
    if (candidateId === viewerId || candidateId === profileId || candidates.has(candidateId)) return;
    const candidate = await ctx.db.get(candidateId);
    if (!candidate || candidate.mergedInto || !candidate.username || roleFor(candidate) === "admin") return;
    candidates.set(candidateId, candidate);
  };

  for await (const row of ctx.db
    .query("userFollows")
    .withIndex("by_followerId_and_createdAt", (q) => q.eq("followerId", profileId))
    .order("desc")) {
    if (await followRow(ctx, viewerId, row.followingId)) await addCandidate(row.followingId);
    if (candidates.size >= COMMON_PEOPLE_LIMIT) break;
  }

  if (candidates.size < COMMON_PEOPLE_LIMIT) {
    for await (const row of ctx.db
      .query("userFollows")
      .withIndex("by_followingId_and_createdAt", (q) => q.eq("followingId", profileId))
      .order("desc")) {
      if (await followRow(ctx, row.followerId, viewerId)) await addCandidate(row.followerId);
      if (candidates.size >= COMMON_PEOPLE_LIMIT) break;
    }
  }

  return Promise.all(
    [...candidates.values()].map(async (candidate) => {
      const [profileFollowsCandidate, viewerFollowsCandidate, candidateFollowsProfile, candidateFollowsViewer] =
        await Promise.all([
          followRow(ctx, profileId, candidate._id),
          followRow(ctx, viewerId, candidate._id),
          followRow(ctx, candidate._id, profileId),
          followRow(ctx, candidate._id, viewerId),
        ]);
      const connectionKinds: CommonConnectionKind[] = [];
      if (profileFollowsCandidate && viewerFollowsCandidate) connectionKinds.push("followed_by_both");
      if (candidateFollowsProfile && candidateFollowsViewer) connectionKinds.push("follows_both");
      return { ...(await publicMiniProfile(ctx, candidate)), connectionKinds };
    }),
  );
}

async function connectionPreviewFor(
  ctx: QueryCtx,
  userId: Id<"users">,
  kind: ConnectionKind,
) {
  const rows = kind === "followers"
    ? await ctx.db
        .query("userFollows")
        .withIndex("by_followingId_and_createdAt", (q) => q.eq("followingId", userId))
        .order("desc")
        .take(COMMON_PEOPLE_LIMIT)
    : await ctx.db
        .query("userFollows")
        .withIndex("by_followerId_and_createdAt", (q) => q.eq("followerId", userId))
        .order("desc")
        .take(COMMON_PEOPLE_LIMIT);
  return listFollowProfiles(ctx, rows, kind);
}

export const getPublicProfile = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const { userId: viewerId, profile: viewer } = await getCurrentProfile(ctx);
    const username = normalizeUsername(args.username);
    const user = await ctx.db.query("users").withIndex("username", (q) => q.eq("username", username)).unique();
    if (!user || user.mergedInto || !user.username) return null;

    const [
      presence,
      leaderboard,
      stats,
      activity,
      courses,
      help,
      viewerFollow,
      reverseFollow,
      commonPeople,
      followersPreview,
      followingPreview,
    ] =
      await Promise.all([
        ctx.db.query("userPresence").withIndex("by_userId", (q) => q.eq("userId", user._id)).unique(),
        ctx.db
          .query("leaderboardStats")
          .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
            q.eq("userId", user._id).eq("scopeKey", "global").eq("period", "all_time").eq("periodKey", "all"),
          )
          .unique(),
        ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", user._id)).unique(),
        activityFor(ctx, user._id),
        publishedCoursesFor(ctx, user._id),
        publicHelpFor(ctx, user),
        viewerId === user._id ? Promise.resolve(null) : followRow(ctx, viewerId, user._id),
        viewerId === user._id ? Promise.resolve(null) : followRow(ctx, user._id, viewerId),
        commonPeopleFor(ctx, viewerId, user._id),
        viewerId === user._id ? connectionPreviewFor(ctx, user._id, "followers") : Promise.resolve([]),
        viewerId === user._id ? connectionPreviewFor(ctx, user._id, "following") : Promise.resolve([]),
      ]);

    const xp = leaderboard?.xp ?? 0;
    const role = roleFor(user);
    const viewerRole = viewer.role;
    const canViewFullConnections = viewerId === user._id || isStaffRole(viewerRole);
    const dmPrivacy = user.dmPrivacy ?? "requests";
    const canMessage = viewerId !== user._id
      && viewerRole !== "admin"
      && role !== "admin"
      && dmPrivacy !== "nobody"
      && (dmPrivacy !== "following" || Boolean(reverseFollow));
    return {
      identity: {
        userId: user._id,
        name: user.name ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || "Član"),
        username: user.username,
        avatarUrl: await avatarUrl(ctx, user),
        role,
        joinedAt: user.createdAt ?? user._creationTime,
        bio: user.bio,
        links: {
          website: user.websiteUrl,
          instagram: user.instagramUrl,
          linkedin: user.linkedinUrl,
          youtube: user.youtubeUrl,
        },
      },
      progress: isStaffRole(role) ? null : { xp, level: levelForXp(xp), nextLevelXp: levelForXp(xp) * 500 },
      stats: {
        contributions: stats?.contributionCount ?? 0,
        followers: stats?.followerCount ?? 0,
        following: stats?.followingCount ?? 0,
      },
      presence: presence
        ? { lastSeenAt: presence.lastSeenAt, activeNow: Date.now() - presence.lastSeenAt <= ACTIVE_NOW_MS }
        : null,
      courses,
      activity,
      help,
      connections: { commonPeople, followersPreview, followingPreview },
      viewer: {
        isOwner: viewerId === user._id,
        isFollowing: Boolean(viewerFollow),
        isFollowedBy: Boolean(reverseFollow),
        isMutual: Boolean(viewerFollow && reverseFollow),
        canFollow: viewerId !== user._id && viewerRole !== "admin" && role !== "admin",
        canMessage,
        canViewFullConnections,
        canManageRole: viewerRole === "admin" && viewerId !== user._id,
      },
    };
  },
});

export const listProfileContributionsPage = query({
  args: {
    username: v.string(),
    filter: contributionFilter,
    courseId: v.optional(v.id("courses")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await getCurrentProfile(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("username", (q) => q.eq("username", normalizeUsername(args.username)))
      .unique();
    if (!user || user.mergedInto) {
      return { page: [], continueCursor: "", isDone: true };
    }

    const aggregatePage = args.filter === "threads"
      ? args.courseId
        ? await ctx.db
            .query("profileContributions")
            .withIndex("by_userId_and_courseId_and_hasThread_and_lastActivityAt", (q) =>
              q.eq("userId", user._id).eq("courseId", args.courseId).eq("hasThread", true),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("profileContributions")
            .withIndex("by_userId_and_hasThread_and_lastActivityAt", (q) =>
              q.eq("userId", user._id).eq("hasThread", true),
            )
            .order("desc")
            .paginate(args.paginationOpts)
      : args.filter === "comments"
        ? args.courseId
          ? await ctx.db
              .query("profileContributions")
              .withIndex("by_userId_and_courseId_and_hasComments_and_lastActivityAt", (q) =>
                q.eq("userId", user._id).eq("courseId", args.courseId).eq("hasComments", true),
              )
              .order("desc")
              .paginate(args.paginationOpts)
          : await ctx.db
              .query("profileContributions")
              .withIndex("by_userId_and_hasComments_and_lastActivityAt", (q) =>
                q.eq("userId", user._id).eq("hasComments", true),
              )
              .order("desc")
              .paginate(args.paginationOpts)
        : args.courseId
          ? await ctx.db
              .query("profileContributions")
              .withIndex("by_userId_and_courseId_and_lastActivityAt", (q) =>
                q.eq("userId", user._id).eq("courseId", args.courseId),
              )
              .order("desc")
              .paginate(args.paginationOpts)
          : await ctx.db
              .query("profileContributions")
              .withIndex("by_userId_and_lastActivityAt", (q) => q.eq("userId", user._id))
              .order("desc")
              .paginate(args.paginationOpts);

    const mappedPage = await Promise.all(
      aggregatePage.page.map(async (aggregate) => {
        const post = await ctx.db.get(aggregate.postId);
        if (!post || post.status !== "published") return null;
        const [author, course, track, comments] = await Promise.all([
          ctx.db.get(post.authorId),
          post.courseId ? ctx.db.get(post.courseId) : Promise.resolve(null),
          post.trackId ? ctx.db.get(post.trackId) : Promise.resolve(null),
          aggregate.commentCount > 0
            ? ctx.db
                .query("comments")
                .withIndex("by_post", (q) => q.eq("postId", post._id))
                .filter((q) => q.eq(q.field("authorId"), user._id))
                .order("desc")
                .take(2)
            : Promise.resolve([]),
        ]);
        return {
          post: {
            id: post._id,
            title: post.title,
            body: post.body,
            createdAt: post.createdAt,
            commentCount: post.commentCount ?? 0,
            upvoteCount: post.upvoteCount ?? 0,
            author: author ? await publicMiniProfile(ctx, author) : null,
            course: course ? { id: course._id, titleSr: course.titleSr, titleEn: course.titleEn } : null,
            track: track ? { titleSr: track.titleSr, titleEn: track.titleEn } : null,
          },
          hasThread: aggregate.hasThread ?? aggregate.threadCount > 0,
          comments: comments.map((comment) => ({ id: comment._id, body: comment.body, createdAt: comment.createdAt })),
          moreComments: Math.max(0, aggregate.commentCount - comments.length),
          lastActivityAt: aggregate.lastActivityAt,
        };
      }),
    );

    return { ...aggregatePage, page: mappedPage.filter((row) => row !== null) };
  },
});

async function updateStatsCounter(
  ctx: MutationCtx,
  userId: Id<"users">,
  field: "followerCount" | "followingCount",
  requestedDelta: 1 | -1,
) {
  const stats = await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  const current = stats?.[field] ?? 0;
  const next = Math.max(0, current + requestedDelta);
  const actualDelta = next - current;
  if (!actualDelta) return 0;
  if (stats) {
    await ctx.db.patch(stats._id, { [field]: next, updatedAt: Date.now() });
  } else {
    const user = await ctx.db.get(userId);
    await ctx.db.insert("profileStats", {
      userId,
      completedLessons: 0,
      role: user ? roleFor(user) : undefined,
      [field]: next,
      updatedAt: Date.now(),
    });
  }
  return actualDelta;
}

export const toggleFollow = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { userId: followerId, profile: follower } = await getCurrentProfile(ctx);
    if (followerId === args.userId) throw new Error("Ne možeš pratiti sebe.");
    const target = await ctx.db.get(args.userId);
    if (!target || target.mergedInto || !target.username) throw new Error("Profil nije pronađen.");
    if (follower.role === "admin" || roleFor(target) === "admin") {
      throw new Error("Admin profili ne učestvuju u praćenju.");
    }

    const existing = await ctx.db
      .query("userFollows")
      .withIndex("by_followerId_and_followingId", (q) =>
        q.eq("followerId", followerId).eq("followingId", args.userId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await Promise.all([
        updateStatsCounter(ctx, followerId, "followingCount", -1),
        updateStatsCounter(ctx, args.userId, "followerCount", -1),
      ]);
      return { following: false, isMutual: false };
    }

    const now = Date.now();
    await ctx.db.insert("userFollows", { followerId, followingId: args.userId, createdAt: now });
    await Promise.all([
      updateStatsCounter(ctx, followerId, "followingCount", 1),
      updateStatsCounter(ctx, args.userId, "followerCount", 1),
    ]);
    await promoteDirectRequestsAfterFollow(ctx, { followerId, followingId: args.userId });
    const eventKey = `new_follower:${followerId}`;
    const notification = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_eventKey", (q) => q.eq("userId", args.userId).eq("eventKey", eventKey))
      .unique();
    const payload = {
      title: "Novi pratilac",
      body: "Novi član prati tvoj profil.",
      kind: "new_follower",
      senderId: followerId,
      eventKey,
      createdAt: now,
      readAt: undefined,
    };
    if (notification) await ctx.db.patch(notification._id, payload);
    else await ctx.db.insert("notifications", { userId: args.userId, ...payload });
    return { following: true, isMutual: Boolean(await followRow(ctx, args.userId, followerId)) };
  },
});

export const touchViewerPresence = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const presence = await ctx.db.query("userPresence").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
    if (presence && now - presence.lastSeenAt < ACTIVE_NOW_MS) return presence.lastSeenAt;
    if (presence) await ctx.db.patch(presence._id, { lastSeenAt: now });
    else await ctx.db.insert("userPresence", { userId, lastSeenAt: now });
    return now;
  },
});

async function listFollowProfiles(
  ctx: QueryCtx,
  rows: Array<Doc<"userFollows">>,
  kind: ConnectionKind,
) {
  const result = [];
  for (const row of rows) {
    const user = await ctx.db.get(kind === "followers" ? row.followerId : row.followingId);
    if (user && !user.mergedInto && user.username && roleFor(user) !== "admin") {
      result.push(await publicMiniProfile(ctx, user));
    }
  }
  return result;
}

async function connectionsPage(
  ctx: QueryCtx,
  userId: Id<"users">,
  kind: ConnectionKind,
  paginationOpts: { numItems: number; cursor: string | null; endCursor?: string | null; maximumRowsRead?: number; maximumBytesRead?: number },
) {
  const page = kind === "followers"
    ? await ctx.db
        .query("userFollows")
        .withIndex("by_followingId_and_createdAt", (q) => q.eq("followingId", userId))
        .order("desc")
        .paginate(paginationOpts)
    : await ctx.db
        .query("userFollows")
        .withIndex("by_followerId_and_createdAt", (q) => q.eq("followerId", userId))
        .order("desc")
        .paginate(paginationOpts);
  return { ...page, page: await listFollowProfiles(ctx, page.page, kind) };
}

export const listViewerConnectionsPage = query({
  args: { kind: connectionKind, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { userId } = await getCurrentProfile(ctx);
    return connectionsPage(ctx, userId, args.kind, args.paginationOpts);
  },
});

export const listProfileConnectionsForStaff = query({
  args: { userId: v.id("users"), kind: connectionKind, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { profile } = await getCurrentProfile(ctx);
    if (!isStaffRole(profile.role)) throw new Error("Forbidden");
    return connectionsPage(ctx, args.userId, args.kind, args.paginationOpts);
  },
});
