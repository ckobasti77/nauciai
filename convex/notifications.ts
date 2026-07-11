/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { currentUserId, effectiveRoleForProfile } from "./helpers";
import type { Id } from "./_generated/dataModel";

const MY_THREAD_NOTIFICATION_KINDS = [
  "comment_post",
  "comment_reply",
  "upvote_post",
  "downvote_post",
  "like_post",
  "post_approved",
  "post_changes_requested",
] as const;
const PERSONAL_NOTIFICATION_KINDS = [
  "mention",
  "upvote_comment",
  "downvote_comment",
  "like_comment",
  "helpful_comment",
] as const;
const COMMUNITY_NOTIFICATION_KINDS = [...MY_THREAD_NOTIFICATION_KINDS, ...PERSONAL_NOTIFICATION_KINDS] as const;

async function unreadByKinds(ctx: any, userId: Id<"users">, kinds: readonly string[]) {
  const rows = await Promise.all(
    kinds.map((kind) =>
      ctx.db
        .query("notifications")
        .withIndex("by_userId_and_kind_and_readAt_and_createdAt", (q: any) =>
          q.eq("userId", userId).eq("kind", kind).eq("readAt", undefined),
        )
        .take(1000),
    ),
  );
  return rows.flat();
}

export async function getCommunityNotificationCountsHelper(ctx: any, userId: Id<"users">) {
  const [profileData, authUser, authAccounts] = await Promise.all([
    ctx.db
      .query("profiles")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .take(100),
    ctx.db.get(userId),
    ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q: any) => q.eq("userId", userId))
      .take(10),
  ]);
  const profile = [...profileData].sort((a: any, b: any) => Number(a._creationTime ?? 0) - Number(b._creationTime ?? 0))[0];
  const role = effectiveRoleForProfile(String(authUser?.email ?? profile?.email ?? ""), profile?.role);
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

  const [myThreadNotifications, personalNotifications, allNotifications] = await Promise.all([
    unreadByKinds(ctx, userId, MY_THREAD_NOTIFICATION_KINDS),
    unreadByKinds(ctx, userId, PERSONAL_NOTIFICATION_KINDS),
    unreadByKinds(ctx, userId, COMMUNITY_NOTIFICATION_KINDS),
  ]);
  const profileIncomplete = (profile?.username ?? authUser?.username) && authAccounts.some((account: any) => account.provider === "password") ? 0 : 1;
  const myThreadsCount = myThreadNotifications.length;
  const mentionsCount = personalNotifications.length;
  const communityCount = allNotifications.length + pendingApprovals;

  return {
    pendingApprovals,
    myThreads: myThreadsCount,
    mentions: mentionsCount,
    profileIncomplete,
    community: communityCount,
    total: profileIncomplete + communityCount,
  };
}

export const getCommunityNotificationCounts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) {
      return { pendingApprovals: 0, myThreads: 0, mentions: 0, profileIncomplete: 0, community: 0, total: 0 };
    }
    return getCommunityNotificationCountsHelper(ctx, userId);
  },
});

export const getUserNotificationSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) {
      return { community: 0, billing: 0, profileIncomplete: 0, myThreads: 0, mentions: 0, pendingApprovals: 0, total: 0 };
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
      profileIncomplete: communityCounts.profileIncomplete,
      myThreads: communityCounts.myThreads,
      mentions: communityCounts.mentions,
      pendingApprovals: communityCounts.pendingApprovals,
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
      (n) => n.postId === args.postId && !n.readAt && MY_THREAD_NOTIFICATION_KINDS.includes(String(n.kind) as never),
    );

    const now = Date.now();
    for (const notif of unreadPostNotifications) {
      await ctx.db.patch(notif._id, { readAt: now });
    }
  },
});

async function markAllCommunityNotificationsAsReadImpl(ctx: any) {
  const userId = await currentUserId(ctx);
  if (!userId) throw new Error("Unauthorized");
  const mentions = await unreadByKinds(ctx, userId, COMMUNITY_NOTIFICATION_KINDS);
  const now = Date.now();
  for (const notification of mentions) {
    await ctx.db.patch(notification._id, { readAt: now });
  }
  return { updated: mentions.length, hasMore: mentions.length === 1000 };
}

export const markMentionsAsRead = mutation({
  args: {},
  handler: (ctx) => markAllCommunityNotificationsAsReadImpl(ctx),
});

export const markAllMentionsAsRead = mutation({
  args: {},
  handler: (ctx) => markAllCommunityNotificationsAsReadImpl(ctx),
});

export const markAllCommunityNotificationsAsRead = mutation({
  args: {},
  handler: (ctx) => markAllCommunityNotificationsAsReadImpl(ctx),
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
