import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getChatMembership, requireChatActor } from "./chatCore";

async function requirePreviewAccess(
  ctx: QueryCtx | MutationCtx,
  args: { userId: Id<"users">; messageId: Id<"chatMessages">; url: string },
) {
  const actor = await requireChatActor(ctx);
  if (actor.userId !== args.userId) throw new Error("Forbidden");
  const message = await ctx.db.get(args.messageId);
  if (!message || message.deletedAt || message.kind !== "user" || !message.body) {
    throw new Error("Message not found");
  }
  if (!message.body.includes(args.url)) throw new Error("URL_NOT_IN_MESSAGE");
  const membership = await getChatMembership(ctx, message.conversationId, actor.userId);
  if (
    membership?.status !== "active" ||
    message.sequence <= membership.historyCutoffSequence
  ) {
    throw new Error("Forbidden");
  }
  return message;
}

export const authorizePreview = internalQuery({
  args: {
    userId: v.id("users"),
    messageId: v.id("chatMessages"),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await requirePreviewAccess(ctx, args);
    const existing = await ctx.db
      .query("chatLinkPreviews")
      .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
      .unique();
    return {
      conversationId: message.conversationId,
      existing: existing
        ? {
            status: existing.status,
            normalizedUrl: existing.normalizedUrl,
            title: existing.title,
            description: existing.description,
            imageUrl: existing.imageUrl,
          }
        : null,
    };
  },
});

export const savePreviewResult = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.id("chatMessages"),
    url: v.string(),
    normalizedUrl: v.string(),
    status: v.union(v.literal("ready"), v.literal("failed")),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const message = await requirePreviewAccess(ctx, args);
    const existing = await ctx.db
      .query("chatLinkPreviews")
      .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
      .unique();
    const now = Date.now();
    const values = {
      conversationId: message.conversationId,
      url: args.url,
      normalizedUrl: args.normalizedUrl,
      status: args.status,
      title: args.title,
      description: args.description,
      imageUrl: args.imageUrl,
      failureReason: args.failureReason,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      return existing._id;
    }
    return ctx.db.insert("chatLinkPreviews", {
      messageId: message._id,
      ...values,
      createdAt: now,
    });
  },
});
