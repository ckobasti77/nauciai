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
