import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

type SearchableMembershipStatus = "invited" | "active" | "left" | "removed";

function searchableTitle(
  conversation: {
    kind: "direct" | "group" | "support";
    title?: string;
    deletedAt?: number;
  } | null,
) {
  if (
    !conversation ||
    conversation.deletedAt ||
    (conversation.kind !== "group" && conversation.kind !== "support")
  ) {
    return null;
  }
  const title = conversation.title?.trim();
  return title ? title.slice(0, 200) : null;
}

export async function syncConversationSearchEntry(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"chatConversations">;
    viewerId: Id<"users">;
    membershipStatus: SearchableMembershipStatus;
  },
) {
  const [conversation, existing] = await Promise.all([
    ctx.db.get(args.conversationId),
    ctx.db
      .query("chatConversationSearchEntries")
      .withIndex("by_viewerId_and_conversationId", (q) =>
        q.eq("viewerId", args.viewerId).eq("conversationId", args.conversationId),
      )
      .unique(),
  ]);
  const title = searchableTitle(conversation);
  const visible =
    args.membershipStatus === "active" || args.membershipStatus === "invited";

  if (!title || !visible || !conversation) {
    if (existing) await ctx.db.delete(existing._id);
    return null;
  }

  const kind = conversation.kind as "group" | "support";
  if (
    existing?.searchText === title &&
    existing.kind === kind &&
    existing.status === "visible"
  ) {
    return existing._id;
  }

  const updatedAt = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      kind,
      status: "visible",
      searchText: title,
      updatedAt,
    });
    return existing._id;
  }

  return ctx.db.insert("chatConversationSearchEntries", {
    viewerId: args.viewerId,
    conversationId: args.conversationId,
    kind,
    status: "visible",
    searchText: title,
    updatedAt,
  });
}

const refreshConversationSearchEntriesBatchRef =
  internal.chatSearchProjection.refreshConversationSearchEntriesBatch;

export async function scheduleConversationSearchRefresh(
  ctx: MutationCtx,
  conversationId: Id<"chatConversations">,
) {
  await Promise.all(
    (["active", "invited"] as const).map((membershipStatus) =>
      ctx.scheduler.runAfter(0, refreshConversationSearchEntriesBatchRef, {
        conversationId,
        membershipStatus,
        cursor: null,
      }),
    ),
  );
}

export const refreshConversationSearchEntriesBatch = internalMutation({
  args: {
    conversationId: v.id("chatConversations"),
    membershipStatus: v.union(v.literal("active"), v.literal("invited")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_status_and_joinedAt", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("status", args.membershipStatus),
      )
      .paginate({ numItems: 40, cursor: args.cursor });

    for (const membership of result.page) {
      await syncConversationSearchEntry(ctx, {
        conversationId: args.conversationId,
        viewerId: membership.userId,
        membershipStatus: membership.status,
      });
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, refreshConversationSearchEntriesBatchRef, {
        conversationId: args.conversationId,
        membershipStatus: args.membershipStatus,
        cursor: result.continueCursor,
      });
    }
    return null;
  },
});
