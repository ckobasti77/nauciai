import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { MAX_MESSAGE_IMAGE_BYTES, requireChatActor } from "./chatCore";

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
