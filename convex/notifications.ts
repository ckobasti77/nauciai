/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { currentUserId } from "./helpers";
import type { Id } from "./_generated/dataModel";

async function getCommunityNotificationCountsHelper(ctx: any, userId: Id<"users">) {
  const profileData = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .unique();
  const role = profileData?.role ?? "student";
  const isAdminOrMod = role === "admin" || role === "moderator";

  // 1. Pending approvals count (only for admin/moderator)
  let pendingApprovals = 0;
  if (isAdminOrMod) {
    const posts = await ctx.db
      .query("communityPosts")
      .withIndex("by_status_and_updatedAt", (q: any) => q.eq("status", "pending"))
      .take(100);
    pendingApprovals = posts.length;
  }

  const unreadForKind = (kind: string) =>
    ctx.db
      .query("notifications")
      .withIndex("by_userId_and_kind_and_readAt_and_createdAt", (q: any) =>
        q.eq("userId", userId).eq("kind", kind).eq("readAt", undefined),
      )
      .take(100);
  const [commentPost, likePost, mentions, helpfulComments] = await Promise.all([
    unreadForKind("comment_post"),
    unreadForKind("like_post"),
    unreadForKind("mention"),
    unreadForKind("helpful_comment"),
  ]);
  const myThreadsCount = Math.min(100, commentPost.length + likePost.length);
  const mentionsCount = Math.min(100, mentions.length + helpfulComments.length);

  return {
    pendingApprovals,
    myThreads: myThreadsCount,
    mentions: mentionsCount,
    total: pendingApprovals + myThreadsCount + mentionsCount,
  };
}

export const getCommunityNotificationCounts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) {
      return { pendingApprovals: 0, myThreads: 0, mentions: 0, total: 0 };
    }
    return getCommunityNotificationCountsHelper(ctx, userId);
  },
});

export const getUserNotificationSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) {
      return { community: 0, billing: 0, total: 0 };
    }

    // 1. Get community notifications count
    const communityCounts = await getCommunityNotificationCountsHelper(ctx, userId);
    const communityTotal = communityCounts.total;

    // 2. Get billing notifications (expires in <= 5 days)
    let billingCount = 0;
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .take(100);

    const activeSub = subscriptions.find(
      (s) => s.status === "active" || s.status === "trialing"
    );
    if (activeSub && activeSub.currentPeriodEnd) {
      const msLeft = activeSub.currentPeriodEnd - Date.now();
      const daysLeft = msLeft / (1000 * 60 * 60 * 24);
      if (daysLeft > 0 && daysLeft <= 5) {
        billingCount = 1;
      }
    }

    return {
      community: communityTotal,
      billing: billingCount,
      total: communityTotal + billingCount,
    };
  },
});

export const markPostNotificationsAsRead = mutation({
  args: {
    postId: v.id("communityPosts"),
  },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!userId) return;

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_postId_and_createdAt", (q) =>
        q.eq("userId", userId).eq("postId", args.postId),
      )
      .take(200);

    const unreadPostNotifications = notifications.filter(
      (n) => n.postId === args.postId && !n.readAt
    );

    const now = Date.now();
    for (const notif of unreadPostNotifications) {
      await ctx.db.patch(notif._id, { readAt: now });
    }
  },
});

async function markAllMentionsAsReadImpl(ctx: any) {
  const userId = await currentUserId(ctx);
  if (!userId) throw new Error("Unauthorized");
  const mentions = await ctx.db
    .query("notifications")
    .withIndex("by_userId_and_kind_and_readAt_and_createdAt", (q: any) =>
      q.eq("userId", userId).eq("kind", "mention").eq("readAt", undefined),
    )
    .take(200);
  const now = Date.now();
  for (const notification of mentions) {
    await ctx.db.patch(notification._id, { readAt: now });
  }
  return { updated: mentions.length, hasMore: mentions.length === 200 };
}

export const markMentionsAsRead = mutation({
  args: {},
  handler: (ctx) => markAllMentionsAsReadImpl(ctx),
});

export const markAllMentionsAsRead = mutation({
  args: {},
  handler: (ctx) => markAllMentionsAsReadImpl(ctx),
});

export const markNotificationAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== userId) {
      throw new Error("Obaveštenje nije pronađeno.");
    }
    if (!notification.readAt) {
      await ctx.db.patch(notification._id, { readAt: Date.now() });
    }
    return notification._id;
  },
});

export const getNotificationList = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return [];

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);

    return notifications;
  },
});
