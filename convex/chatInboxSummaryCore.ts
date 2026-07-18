import { DirectAggregate } from "@convex-dev/aggregate";

import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type SummaryCtx = QueryCtx | MutationCtx;

export type ChatInboxMemberState = Pick<
  Doc<"chatMembers">,
  "userId" | "conversationKind" | "status" | "requestStatus" | "unreadCount" | "hasUnread"
>;

type InboxContribution = {
  totalUnread: number;
  unreadConversations: number;
  pendingRequests: number;
  pendingGroupInvites: number;
};

type ChatInboxAggregateKey = [requestBucket: number, unreadFlag: number];

const chatInboxAggregate = new DirectAggregate<{
  Namespace: Id<"users">;
  Key: ChatInboxAggregateKey;
  Id: string;
}>(components.chatInbox);

const ZERO_CONTRIBUTION: InboxContribution = {
  totalUnread: 0,
  unreadConversations: 0,
  pendingRequests: 0,
  pendingGroupInvites: 0,
};

function contributionFor(member: ChatInboxMemberState): InboxContribution {
  const isActive = member.status === "active";
  return {
    totalUnread: isActive && member.hasUnread ? Math.max(0, member.unreadCount) : 0,
    unreadConversations: isActive && member.hasUnread ? 1 : 0,
    pendingRequests:
      isActive && member.requestStatus === "pending" && member.conversationKind !== "group" ? 1 : 0,
    pendingGroupInvites:
      member.requestStatus === "pending" && member.conversationKind === "group" && member.status === "invited"
        ? 1
        : 0,
  };
}

function aggregateKey(contribution: InboxContribution): ChatInboxAggregateKey {
  const requestBucket = contribution.pendingRequests > 0
    ? 1
    : contribution.pendingGroupInvites > 0
      ? 2
      : 0;
  return [requestBucket, contribution.unreadConversations > 0 ? 1 : 0];
}

function aggregateItem(
  chatMemberId: Id<"chatMembers">,
  userId: Id<"users">,
  contribution: InboxContribution,
) {
  return {
    namespace: userId,
    key: aggregateKey(contribution),
    id: String(chatMemberId),
    sumValue: contribution.totalUnread,
  };
}

function subtract(after: InboxContribution, before: InboxContribution): InboxContribution {
  return {
    totalUnread: after.totalUnread - before.totalUnread,
    unreadConversations: after.unreadConversations - before.unreadConversations,
    pendingRequests: after.pendingRequests - before.pendingRequests,
    pendingGroupInvites: after.pendingGroupInvites - before.pendingGroupInvites,
  };
}

function isZero(contribution: InboxContribution) {
  return Object.values(contribution).every((value) => value === 0);
}

async function adjustSummary(
  ctx: MutationCtx,
  userId: Id<"users">,
  delta: InboxContribution,
) {
  const existing = await ctx.db
    .query("chatInboxSummaries")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const now = Date.now();
  if (existing) {
    if (isZero(delta)) return;
    await ctx.db.patch(existing._id, {
      totalUnread: Math.max(0, existing.totalUnread + delta.totalUnread),
      unreadConversations: Math.max(0, existing.unreadConversations + delta.unreadConversations),
      pendingRequests: Math.max(0, existing.pendingRequests + delta.pendingRequests),
      pendingGroupInvites: Math.max(0, existing.pendingGroupInvites + delta.pendingGroupInvites),
      updatedAt: now,
    });
    return;
  }

  const memberships = await ctx.db
    .query("chatMembers")
    .withIndex("by_userId_and_invitedAt", (q) => q.eq("userId", userId))
    .take(2);
  await ctx.db.insert("chatInboxSummaries", {
    userId,
    totalUnread: Math.max(0, delta.totalUnread),
    unreadConversations: Math.max(0, delta.unreadConversations),
    pendingRequests: Math.max(0, delta.pendingRequests),
    pendingGroupInvites: Math.max(0, delta.pendingGroupInvites),
    ready: memberships.length <= 1,
    aggregateReady: memberships.length <= 1,
    aggregateUpdatedAt: memberships.length <= 1 ? now : undefined,
    updatedAt: now,
  });
}

/**
 * Maintains one idempotent contribution projection per membership. The
 * projection makes the additive backfill safe to rerun while live dual writes
 * continue updating the same counters.
 */
export async function syncChatInboxSummaryMember(
  ctx: MutationCtx,
  chatMemberId: Id<"chatMembers">,
  member: ChatInboxMemberState,
) {
  const existing = await ctx.db
    .query("chatInboxSummaryMembers")
    .withIndex("by_chatMemberId", (q) => q.eq("chatMemberId", chatMemberId))
    .unique();
  const next = contributionFor(member);
  const previous = existing
    ? {
        totalUnread: existing.totalUnread,
        unreadConversations: existing.unreadConversations,
        pendingRequests: existing.pendingRequests,
        pendingGroupInvites: existing.pendingGroupInvites,
      }
    : ZERO_CONTRIBUTION;
  const now = Date.now();

  if (existing) {
    if (existing.userId !== member.userId) {
      await adjustSummary(ctx, existing.userId, subtract(ZERO_CONTRIBUTION, previous));
      await adjustSummary(ctx, member.userId, next);
    } else {
      await adjustSummary(ctx, member.userId, subtract(next, previous));
    }
    await chatInboxAggregate.replaceOrInsert(
      ctx,
      aggregateItem(chatMemberId, existing.userId, previous),
      aggregateItem(chatMemberId, member.userId, next),
    );
    await ctx.db.patch(existing._id, { userId: member.userId, ...next, updatedAt: now });
    return;
  }

  await ctx.db.insert("chatInboxSummaryMembers", {
    chatMemberId,
    userId: member.userId,
    ...next,
    updatedAt: now,
  });
  await chatInboxAggregate.insertIfDoesNotExist(
    ctx,
    aggregateItem(chatMemberId, member.userId, next),
  );
  await adjustSummary(ctx, member.userId, next);
}

export async function removeChatInboxSummaryMember(
  ctx: MutationCtx,
  chatMemberId: Id<"chatMembers">,
) {
  const member = await ctx.db.get(chatMemberId);
  const existing = await ctx.db
    .query("chatInboxSummaryMembers")
    .withIndex("by_chatMemberId", (q) => q.eq("chatMemberId", chatMemberId))
    .unique();
  const contribution = existing
    ? {
        totalUnread: existing.totalUnread,
        unreadConversations: existing.unreadConversations,
        pendingRequests: existing.pendingRequests,
        pendingGroupInvites: existing.pendingGroupInvites,
      }
    : member
      ? contributionFor(member)
      : null;
  const userId = existing?.userId ?? member?.userId;
  if (contribution && userId) {
    await chatInboxAggregate.deleteIfExists(
      ctx,
      aggregateItem(chatMemberId, userId, contribution),
    );
  }
  if (!existing) return;
  await adjustSummary(ctx, existing.userId, {
    totalUnread: -existing.totalUnread,
    unreadConversations: -existing.unreadConversations,
    pendingRequests: -existing.pendingRequests,
    pendingGroupInvites: -existing.pendingGroupInvites,
  });
  await ctx.db.delete(existing._id);
}

export async function markChatInboxSummaryReady(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("chatInboxSummaries")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing) {
    if (!existing.ready) await ctx.db.patch(existing._id, { ready: true, updatedAt: Date.now() });
    return;
  }
  await ctx.db.insert("chatInboxSummaries", {
    userId,
    ...ZERO_CONTRIBUTION,
    ready: true,
    updatedAt: Date.now(),
  });
}

export async function markChatInboxAggregateReady(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("chatInboxSummaries")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  const now = Date.now();
  if (existing) {
    if (!existing.aggregateReady) {
      await ctx.db.patch(existing._id, { aggregateReady: true, aggregateUpdatedAt: now });
    }
    return;
  }
  await ctx.db.insert("chatInboxSummaries", {
    userId,
    ...ZERO_CONTRIBUTION,
    ready: true,
    aggregateReady: true,
    aggregateUpdatedAt: now,
    updatedAt: now,
  });
}

export async function getChatInboxAggregateSummary(ctx: SummaryCtx, userId: Id<"users">) {
  const [totalUnread, counts] = await Promise.all([
    chatInboxAggregate.sum(ctx, { namespace: userId }),
    chatInboxAggregate.countBatch(ctx, [
      { namespace: userId, bounds: { prefix: [0, 1] } },
      { namespace: userId, bounds: { prefix: [1, 1] } },
      { namespace: userId, bounds: { prefix: [2, 1] } },
      { namespace: userId, bounds: { prefix: [1] } },
      { namespace: userId, bounds: { prefix: [2] } },
    ]),
  ]);
  return {
    totalUnread,
    unreadConversations: counts[0] + counts[1] + counts[2],
    pendingRequests: counts[3],
    pendingGroupInvites: counts[4],
  };
}

export async function computeChatInboxSummary(ctx: SummaryCtx, userId: Id<"users">) {
  const summary = { ...ZERO_CONTRIBUTION };
  for await (const member of ctx.db
    .query("chatMembers")
    .withIndex("by_userId_and_invitedAt", (q) => q.eq("userId", userId))) {
    const contribution = contributionFor(member);
    summary.totalUnread += contribution.totalUnread;
    summary.unreadConversations += contribution.unreadConversations;
    summary.pendingRequests += contribution.pendingRequests;
    summary.pendingGroupInvites += contribution.pendingGroupInvites;
  }
  return summary;
}
