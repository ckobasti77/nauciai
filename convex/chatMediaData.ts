import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { MAX_MESSAGE_IMAGE_BYTES, requireChatActor } from "./chatCore";

const MAX_GROUP_AVATAR_BYTES = 5 * 1024 * 1024;

function storageSha256Hex(value: string) {
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    if (bytes.byteLength !== 32) return null;
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

async function requireGroupAvatarOwner(
  ctx: QueryCtx | MutationCtx,
  uploaderId: Id<"users">,
  conversationId: Id<"chatConversations">,
) {
  const actor = await requireChatActor(ctx);
  if (actor.userId !== uploaderId) throw new Error("Forbidden");
  const [conversation, membership] = await Promise.all([
    ctx.db.get(conversationId),
    ctx.db
      .query("chatMembers")
      .withIndex("by_conversationId_and_userId", (q) =>
        q.eq("conversationId", conversationId).eq("userId", actor.userId),
      )
      .unique(),
  ]);
  if (
    !conversation ||
    conversation.kind !== "group" ||
    conversation.ownerId !== actor.userId ||
    membership?.role !== "owner" ||
    membership.status !== "active"
  ) {
    throw new Error("Forbidden");
  }
  return conversation;
}

export const claimGroupAvatarUpload = internalMutation({
  args: {
    uploaderId: v.id("users"),
    conversationId: v.id("chatConversations"),
    uploadId: v.id("chatGroupAvatarUploads"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireGroupAvatarOwner(ctx, args.uploaderId, args.conversationId);
    const [upload, metadata, existingClaim, preparedImage, managedAvatar] = await Promise.all([
      ctx.db.get(args.uploadId),
      ctx.db.system.get("_storage", args.storageId),
      ctx.db
        .query("chatGroupAvatarUploads")
        .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
        .unique(),
      ctx.db
        .query("chatImages")
        .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
        .unique(),
      ctx.db
        .query("chatGroupAvatarFiles")
        .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
        .unique(),
    ]);
    const now = Date.now();
    if (
      !upload ||
      upload.uploaderId !== args.uploaderId ||
      upload.conversationId !== args.conversationId ||
      upload.status !== "pending" ||
      upload.expiresAt < now ||
      !metadata ||
      metadata._creationTime < upload.createdAt ||
      metadata._creationTime > now + 5_000 ||
      storageSha256Hex(metadata.sha256) !== upload.expectedSha256 ||
      metadata.size !== upload.expectedByteSize ||
      (metadata.contentType !== undefined && metadata.contentType !== upload.expectedContentType) ||
      existingClaim ||
      preparedImage ||
      managedAvatar
    ) {
      throw new Error("INVALID_GROUP_AVATAR_UPLOAD");
    }
    await ctx.db.patch(upload._id, {
      storageId: args.storageId,
      status: "processing",
      updatedAt: now,
    });
    return { byteSize: metadata.size, contentType: metadata.contentType ?? upload.expectedContentType };
  },
});

export const applyPreparedGroupAvatar = internalMutation({
  args: {
    uploaderId: v.id("users"),
    conversationId: v.id("chatConversations"),
    uploadId: v.id("chatGroupAvatarUploads"),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const conversation = await requireGroupAvatarOwner(ctx, args.uploaderId, args.conversationId);
    const upload = await ctx.db.get(args.uploadId);
    if (
      !upload ||
      upload.uploaderId !== args.uploaderId ||
      upload.conversationId !== args.conversationId ||
      upload.status !== "processing" ||
      args.mimeType !== "image/webp" ||
      args.byteSize < 1 ||
      args.byteSize > MAX_GROUP_AVATAR_BYTES ||
      !Number.isSafeInteger(args.width) ||
      !Number.isSafeInteger(args.height) ||
      args.width < 1 ||
      args.height < 1 ||
      args.width > 1024 ||
      args.height > 1024
    ) {
      throw new Error("INVALID_GROUP_AVATAR");
    }
    const previousImageStorageId = conversation.imageStorageId;
    const previousFile = previousImageStorageId
      ? await ctx.db
          .query("chatGroupAvatarFiles")
          .withIndex("by_storageId", (q) => q.eq("storageId", previousImageStorageId))
          .unique()
      : null;
    const now = Date.now();
    await ctx.db.patch(conversation._id, {
      imageStorageId: args.storageId,
      updatedAt: now,
    });
    await ctx.db.insert("chatGroupAvatarFiles", {
      conversationId: conversation._id,
      uploaderId: args.uploaderId,
      storageId: args.storageId,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      width: args.width,
      height: args.height,
      createdAt: now,
    });
    await ctx.db.patch(upload._id, { status: "consumed", updatedAt: now });
    if (previousFile?.conversationId === conversation._id) {
      await ctx.storage.delete(previousFile.storageId);
      await ctx.db.delete(previousFile._id);
    }
    return null;
  },
});

export const failGroupAvatarUpload = internalMutation({
  args: {
    uploaderId: v.id("users"),
    uploadId: v.id("chatGroupAvatarUploads"),
  },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    const upload = await ctx.db.get(args.uploadId);
    if (
      actor.userId === args.uploaderId &&
      upload?.uploaderId === actor.userId &&
      upload.status === "processing"
    ) {
      await ctx.db.patch(upload._id, { status: "failed", updatedAt: Date.now() });
    }
    return null;
  },
});

export const registerPreparedImage = internalMutation({
  args: {
    uploaderId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireChatActor(ctx);
    if (actor.userId !== args.uploaderId) throw new Error("Forbidden");
    if (args.mimeType !== "image/webp") throw new Error("INVALID_IMAGE_TYPE");
    if (
      args.byteSize < 1 ||
      args.byteSize > MAX_MESSAGE_IMAGE_BYTES ||
      !Number.isSafeInteger(args.width) ||
      !Number.isSafeInteger(args.height) ||
      args.width < 1 ||
      args.height < 1 ||
      args.width > 4096 ||
      args.height > 4096
    ) {
      throw new Error("INVALID_IMAGE");
    }
    const existing = await ctx.db
      .query("chatImages")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existing) throw new Error("IMAGE_ALREADY_REGISTERED");
    const now = Date.now();
    return ctx.db.insert("chatImages", {
      uploaderId: actor.userId,
      storageId: args.storageId,
      fileName: args.fileName.slice(0, 180),
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      width: args.width,
      height: args.height,
      status: "prepared",
      createdAt: now,
      updatedAt: now,
    });
  },
});
