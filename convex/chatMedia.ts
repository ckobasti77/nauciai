"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import sharp from "sharp";

import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { MAX_MESSAGE_IMAGE_BYTES } from "./chatCore";

const registerPreparedImageRef = makeFunctionReference<
  "mutation",
  {
    uploaderId: Id<"users">;
    storageId: Id<"_storage">;
    fileName: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
  },
  Id<"chatImages">
>("chatMediaData:registerPreparedImage");

const claimGroupAvatarUploadRef = makeFunctionReference<
  "mutation",
  {
    uploaderId: Id<"users">;
    conversationId: Id<"chatConversations">;
    uploadId: Id<"chatGroupAvatarUploads">;
    storageId: Id<"_storage">;
  },
  { byteSize: number; contentType?: string }
>("chatMediaData:claimGroupAvatarUpload");

const applyPreparedGroupAvatarRef = makeFunctionReference<
  "mutation",
  {
    uploaderId: Id<"users">;
    conversationId: Id<"chatConversations">;
    uploadId: Id<"chatGroupAvatarUploads">;
    storageId: Id<"_storage">;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
  },
  null
>("chatMediaData:applyPreparedGroupAvatar");

const failGroupAvatarUploadRef = makeFunctionReference<
  "mutation",
  { uploaderId: Id<"users">; uploadId: Id<"chatGroupAvatarUploads"> },
  null
>("chatMediaData:failGroupAvatarUpload");

const MAX_GROUP_AVATAR_BYTES = 5 * 1024 * 1024;

function safeImageName(fileName: string) {
  const base = fileName.trim().replace(/[\\/\0]/g, "-").slice(0, 174) || "slika";
  return `${base.replace(/\.[a-z0-9]{1,8}$/i, "")}.webp`;
}

export const prepareImage = action({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const uploaderId = (await getAuthUserId(ctx)) as Id<"users"> | null;
    if (!uploaderId) throw new Error("Unauthorized");

    let processedStorageId: Id<"_storage"> | undefined;
    let registered = false;
    try {
      const original = await ctx.storage.get(args.storageId);
      if (!original) throw new Error("IMAGE_NOT_FOUND");
      if (original.size < 1 || original.size > MAX_MESSAGE_IMAGE_BYTES) {
        throw new Error("IMAGE_TOO_LARGE");
      }

      const input = Buffer.from(await original.arrayBuffer());
      const { data, info } = await sharp(input, {
        failOn: "error",
        limitInputPixels: 80_000_000,
        sequentialRead: true,
      })
        .rotate()
        .resize({
          width: 4096,
          height: 4096,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 88, effort: 4 })
        .toBuffer({ resolveWithObject: true });

      if (!info.width || !info.height || data.byteLength > MAX_MESSAGE_IMAGE_BYTES) {
        throw new Error("INVALID_IMAGE");
      }
      processedStorageId = await ctx.storage.store(
        new Blob([data], { type: "image/webp" }),
      );
      const imageId = await ctx.runMutation(registerPreparedImageRef, {
        uploaderId,
        storageId: processedStorageId,
        fileName: safeImageName(args.fileName),
        mimeType: "image/webp",
        byteSize: data.byteLength,
        width: info.width,
        height: info.height,
      });
      registered = true;
      return {
        imageId,
        fileName: safeImageName(args.fileName),
        mimeType: "image/webp" as const,
        byteSize: data.byteLength,
        width: info.width,
        height: info.height,
      };
    } finally {
      await ctx.storage.delete(args.storageId).catch(() => undefined);
      if (processedStorageId && !registered) {
        await ctx.storage.delete(processedStorageId).catch(() => undefined);
      }
    }
  },
});

export const prepareGroupAvatar = action({
  args: {
    conversationId: v.id("chatConversations"),
    uploadId: v.id("chatGroupAvatarUploads"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const uploaderId = (await getAuthUserId(ctx)) as Id<"users"> | null;
    if (!uploaderId) throw new Error("Unauthorized");

    let processedStorageId: Id<"_storage"> | undefined;
    let claimed = false;
    let applied = false;
    try {
      const claimedUpload = await ctx.runMutation(claimGroupAvatarUploadRef, {
        uploaderId,
        conversationId: args.conversationId,
        uploadId: args.uploadId,
        storageId: args.storageId,
      });
      claimed = true;
      const original = await ctx.storage.get(args.storageId);
      if (!original) throw new Error("IMAGE_NOT_FOUND");
      if (
        original.size < 1 ||
        original.size > MAX_GROUP_AVATAR_BYTES ||
        original.size !== claimedUpload.byteSize ||
        !claimedUpload.contentType?.startsWith("image/")
      ) {
        throw new Error("IMAGE_TOO_LARGE");
      }

      const input = Buffer.from(await original.arrayBuffer());
      const { data, info } = await sharp(input, {
        failOn: "error",
        limitInputPixels: 40_000_000,
        sequentialRead: true,
      })
        .rotate()
        .resize({
          width: 1024,
          height: 1024,
          fit: "cover",
          position: "centre",
          withoutEnlargement: true,
        })
        .webp({ quality: 88, effort: 4 })
        .toBuffer({ resolveWithObject: true });

      if (
        !info.width ||
        !info.height ||
        info.width > 1024 ||
        info.height > 1024 ||
        data.byteLength > MAX_GROUP_AVATAR_BYTES
      ) {
        throw new Error("INVALID_GROUP_AVATAR");
      }
      processedStorageId = await ctx.storage.store(
        new Blob([data], { type: "image/webp" }),
      );
      await ctx.runMutation(applyPreparedGroupAvatarRef, {
        uploaderId,
        conversationId: args.conversationId,
        uploadId: args.uploadId,
        storageId: processedStorageId,
        mimeType: "image/webp",
        byteSize: data.byteLength,
        width: info.width,
        height: info.height,
      });
      applied = true;
      return {
        storageId: processedStorageId,
        mimeType: "image/webp" as const,
        byteSize: data.byteLength,
        width: info.width,
        height: info.height,
      };
    } finally {
      if (claimed) {
        await ctx.storage.delete(args.storageId).catch(() => undefined);
      }
      if (processedStorageId && !applied) {
        await ctx.storage.delete(processedStorageId).catch(() => undefined);
      }
      if (claimed && !applied) {
        await ctx.runMutation(failGroupAvatarUploadRef, {
          uploaderId,
          uploadId: args.uploadId,
        }).catch(() => undefined);
      }
    }
  },
});
