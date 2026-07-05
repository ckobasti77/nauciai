import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { currentUserId, requireAdmin, requireCourseAccess, requireUserId } from "./helpers";

export const listPosts = query({
  args: {
    courseId: v.optional(v.id("courses")),
  },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);

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

    const postsWithDetails = await Promise.all(
      posts.map(async (post) => {
        // Fetch author profile
        const authorProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", post.authorId))
          .unique();

        // Fetch comments count
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect();
        const commentsCount = comments.length;

        // Fetch reactions (likes)
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_target", (q) => q.eq("targetType", "post").eq("targetId", post._id))
          .collect();

        const userReaction = userId
          ? reactions.find((r) => r.userId === userId)?.reaction
          : undefined;

        return {
          ...post,
          authorName: authorProfile?.name ?? "Član zajednice",
          authorRole: authorProfile?.role ?? "student",
          authorAvatarUrl: authorProfile?.avatarUrl,
          commentsCount,
          reactionsCount: reactions.length,
          userReaction,
        };
      })
    );

    return postsWithDetails;
  },
});

export const createPost = mutation({
  args: {
    courseId: v.optional(v.id("courses")),
    language: v.union(v.literal("sr"), v.literal("en")),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.courseId) {
      await requireCourseAccess(ctx, args.courseId);
    }

    return ctx.db.insert("communityPosts", {
      ...args,
      authorId: userId,
      visibility: "members",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const getPostComments = query({
  args: {
    postId: v.id("communityPosts"),
  },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.courseId) {
      await requireCourseAccess(ctx, post.courseId);
    }

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const commentsWithDetails = await Promise.all(
      comments.map(async (comment) => {
        // Fetch author profile
        const authorProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", comment.authorId))
          .unique();

        // Fetch reactions
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_target", (q) => q.eq("targetType", "comment").eq("targetId", comment._id))
          .collect();

        const userReaction = userId
          ? reactions.find((r) => r.userId === userId)?.reaction
          : undefined;

        return {
          ...comment,
          authorName: authorProfile?.name ?? "Član zajednice",
          authorRole: authorProfile?.role ?? "student",
          authorAvatarUrl: authorProfile?.avatarUrl,
          reactionsCount: reactions.length,
          userReaction,
        };
      })
    );

    return commentsWithDetails;
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
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (post.courseId) {
      await requireCourseAccess(ctx, post.courseId);
    }

    return ctx.db.insert("comments", {
      postId: args.postId,
      authorId: userId,
      parentId: args.parentId,
      body: args.body,
      createdAt: Date.now(),
    });
  },
});

export const react = mutation({
  args: {
    targetType: v.union(v.literal("post"), v.literal("comment")),
    targetId: v.string(),
    reaction: v.union(v.literal("like"), v.literal("celebrate")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existingRows = await ctx.db
      .query("reactions")
      .withIndex("by_user_target", (q) => q.eq("userId", userId))
      .collect();
    const existing = existingRows.find(
      (item) => item.targetType === args.targetType && item.targetId === args.targetId,
    );

    if (existing) {
      if (existing.reaction === args.reaction) {
        // Toggle off if clicking the same reaction
        await ctx.db.delete(existing._id);
        return null;
      }
      await ctx.db.patch(existing._id, { reaction: args.reaction, createdAt: Date.now() });
      return existing._id;
    }

    return ctx.db.insert("reactions", {
      ...args,
      userId,
      createdAt: Date.now(),
    });
  },
});

export const deletePost = mutation({
  args: {
    postId: v.id("communityPosts"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Delete comments
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    // Delete reactions for comments and post
    const commentReactions = await Promise.all(
      comments.map(async (c) =>
        ctx.db
          .query("reactions")
          .withIndex("by_target", (q) => q.eq("targetType", "comment").eq("targetId", c._id))
          .collect()
      )
    );
    const flatCommentReactions = commentReactions.flat();
    for (const r of flatCommentReactions) {
      await ctx.db.delete(r._id);
    }

    const postReactions = await ctx.db
      .query("reactions")
      .withIndex("by_target", (q) => q.eq("targetType", "post").eq("targetId", args.postId))
      .collect();
    for (const r of postReactions) {
      await ctx.db.delete(r._id);
    }

    await ctx.db.delete(args.postId);
  },
});

export const deleteComment = mutation({
  args: {
    commentId: v.id("comments"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const deleteRecursive = async (id: Id<"comments">) => {
      const replies = await ctx.db
        .query("comments")
        .withIndex("by_parent", (q) => q.eq("parentId", id))
        .collect();

      for (const reply of replies) {
        await deleteRecursive(reply._id);
      }

      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_target", (q) => q.eq("targetType", "comment").eq("targetId", id))
        .collect();

      for (const r of reactions) {
        await ctx.db.delete(r._id);
      }

      await ctx.db.delete(id);
    };

    await deleteRecursive(args.commentId);
  },
});
