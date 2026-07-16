import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { effectiveRoleForProfile } from "./helpers";
import { belgradeDayKey } from "./leaderboardCore";

type ActivityKind = "lessons" | "tasks" | "threads" | "comments";

export const MAX_SYNCHRONOUS_POST_CONTRIBUTIONS = 500;

export async function adjustProfileActivity(
  ctx: MutationCtx,
  args: { userId: Id<"users">; timestamp: number; kind: ActivityKind; delta: number },
) {
  if (!args.delta) return 0;
  const dayKey = belgradeDayKey(args.timestamp);
  const row = await ctx.db
    .query("profileActivityDays")
    .withIndex("by_userId_and_dayKey", (q) => q.eq("userId", args.userId).eq("dayKey", dayKey))
    .unique();
  const base = row ?? { lessons: 0, tasks: 0, threads: 0, comments: 0 };
  const current = base[args.kind];
  const nextValue = Math.max(0, current + args.delta);
  const actualDelta = nextValue - current;
  if (!actualDelta) return 0;

  const next = {
    lessons: base.lessons,
    tasks: base.tasks,
    threads: base.threads,
    comments: base.comments,
    [args.kind]: nextValue,
    updatedAt: Date.now(),
  };
  if (row) await ctx.db.patch(row._id, next);
  else await ctx.db.insert("profileActivityDays", { userId: args.userId, dayKey, ...next });
  return actualDelta;
}

async function adjustContributionStat(ctx: MutationCtx, userId: Id<"users">, requestedDelta: number) {
  if (!requestedDelta) return 0;
  const stats = await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  const current = stats?.contributionCount ?? 0;
  const next = Math.max(0, current + requestedDelta);
  const actualDelta = next - current;
  if (!actualDelta) return 0;
  if (stats) {
    await ctx.db.patch(stats._id, { contributionCount: next, updatedAt: Date.now() });
  } else {
    const user = await ctx.db.get(userId);
    await ctx.db.insert("profileStats", {
      userId,
      completedLessons: 0,
      contributionCount: next,
      role: user ? effectiveRoleForProfile(String(user.email ?? ""), user.role) : undefined,
      updatedAt: Date.now(),
    });
  }
  return actualDelta;
}

async function replaceProfileContribution(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    post: Doc<"communityPosts">;
    threadCount: number;
    commentCount: number;
    lastActivityAt: number;
  },
) {
  const row = await ctx.db
    .query("profileContributions")
    .withIndex("by_userId_and_postId", (q) => q.eq("userId", args.userId).eq("postId", args.post._id))
    .unique();
  const threadCount = Math.max(0, args.threadCount);
  const commentCount = Math.max(0, args.commentCount);
  const previousTotal = (row?.threadCount ?? 0) + (row?.commentCount ?? 0);
  const nextTotal = threadCount + commentCount;

  if (!nextTotal) {
    if (row) await ctx.db.delete(row._id);
  } else {
    const payload = {
      courseId: args.post.courseId,
      hasThread: threadCount > 0,
      hasComments: commentCount > 0,
      threadCount,
      commentCount,
      lastActivityAt: args.lastActivityAt,
      updatedAt: Date.now(),
    };
    if (row) await ctx.db.patch(row._id, payload);
    else {
      await ctx.db.insert("profileContributions", {
        userId: args.userId,
        postId: args.post._id,
        ...payload,
      });
    }
  }

  await adjustContributionStat(ctx, args.userId, nextTotal - previousTotal);
  return nextTotal - previousTotal;
}

async function latestContributionActivity(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    post: Doc<"communityPosts">;
    threadCount: number;
    commentCount: number;
  },
) {
  const latestComment = args.commentCount > 0
    ? await ctx.db
        .query("comments")
        .withIndex("by_post", (q) => q.eq("postId", args.post._id))
        .filter((q) => q.eq(q.field("authorId"), args.userId))
        .order("desc")
        .first()
    : null;
  return Math.max(args.threadCount > 0 ? args.post.createdAt : 0, latestComment?.createdAt ?? 0);
}

export async function adjustProfileContribution(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    postId: Id<"communityPosts">;
    threadDelta?: number;
    commentDelta?: number;
    lastActivityAt: number;
    recomputeLastActivity?: boolean;
  },
) {
  const post = await ctx.db.get(args.postId);
  if (!post) return 0;
  const row = await ctx.db
    .query("profileContributions")
    .withIndex("by_userId_and_postId", (q) => q.eq("userId", args.userId).eq("postId", args.postId))
    .unique();
  const threadCount = Math.max(0, (row?.threadCount ?? 0) + (args.threadDelta ?? 0));
  const commentCount = Math.max(0, (row?.commentCount ?? 0) + (args.commentDelta ?? 0));
  const lastActivityAt = args.recomputeLastActivity
    ? await latestContributionActivity(ctx, { userId: args.userId, post, threadCount, commentCount })
    : Math.max(row?.lastActivityAt ?? 0, args.lastActivityAt);
  return replaceProfileContribution(ctx, { userId: args.userId, post, threadCount, commentCount, lastActivityAt });
}

export async function transitionPublishedPostContributions(
  ctx: MutationCtx,
  args: { postId: Id<"communityPosts">; published: boolean },
) {
  const post = await ctx.db.get(args.postId);
  if (!post) throw new Error("Diskusija nije pronađena.");
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .take(MAX_SYNCHRONOUS_POST_CONTRIBUTIONS + 1);
  if (comments.length > MAX_SYNCHRONOUS_POST_CONTRIBUTIONS) {
    throw new Error(
      `Diskusija ima više od ${MAX_SYNCHRONOUS_POST_CONTRIBUTIONS} komentara; promena statusa mora kroz batch posao.`,
    );
  }

  const participants = new Map<Id<"users">, { threadCount: number; commentCount: number; lastActivityAt: number }>();
  participants.set(post.authorId, {
    threadCount: args.published ? 1 : 0,
    commentCount: 0,
    lastActivityAt: post.createdAt,
  });
  for (const comment of comments) {
    const current = participants.get(comment.authorId) ?? {
      threadCount: args.published && comment.authorId === post.authorId ? 1 : 0,
      commentCount: 0,
      lastActivityAt: 0,
    };
    if (args.published) current.commentCount += 1;
    current.lastActivityAt = Math.max(current.lastActivityAt, comment.createdAt);
    participants.set(comment.authorId, current);
  }

  const direction = args.published ? 1 : -1;
  await adjustProfileActivity(ctx, {
    userId: post.authorId,
    timestamp: post.createdAt,
    kind: "threads",
    delta: direction,
  });
  for (const comment of comments) {
    await adjustProfileActivity(ctx, {
      userId: comment.authorId,
      timestamp: comment.createdAt,
      kind: "comments",
      delta: direction,
    });
  }
  for (const [userId, counts] of participants) {
    await replaceProfileContribution(ctx, {
      userId,
      post,
      threadCount: args.published ? counts.threadCount : 0,
      commentCount: args.published ? counts.commentCount : 0,
      lastActivityAt: counts.lastActivityAt || post.createdAt,
    });
  }
  return { comments: comments.length, participants: participants.size };
}
