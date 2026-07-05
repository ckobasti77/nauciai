import { mutationGeneric } from "convex/server";
import { v } from "convex/values";

import { requireAdmin, requireSyncSecret } from "./helpers";

export const createLessonDraft = mutationGeneric({
  args: {
    courseId: v.id("courses"),
    moduleId: v.id("modules"),
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    summarySr: v.string(),
    summaryEn: v.string(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.insert("lessons", {
      ...args,
      durationSeconds: 0,
      muxStatus: "draft",
      isPublished: false,
      updatedAt: Date.now(),
    });
  },
});

export const attachMuxUpload = mutationGeneric({
  args: {
    lessonId: v.id("lessons"),
    muxUploadId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.lessonId, {
      muxUploadId: args.muxUploadId,
      muxStatus: "waiting",
      updatedAt: Date.now(),
    });
    return args.lessonId;
  },
});

export const syncMuxAsset = mutationGeneric({
  args: {
    syncSecret: v.string(),
    muxUploadId: v.optional(v.string()),
    muxAssetId: v.string(),
    muxPlaybackId: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    status: v.union(v.literal("preparing"), v.literal("ready"), v.literal("errored")),
  },
  handler: async (ctx, args) => {
    requireSyncSecret(args.syncSecret);
    const lesson = args.muxUploadId
      ? await ctx.db
          .query("lessons")
          .withIndex("by_mux_upload", (q) => q.eq("muxUploadId", args.muxUploadId))
          .unique()
      : await ctx.db
          .query("lessons")
          .withIndex("by_mux_asset", (q) => q.eq("muxAssetId", args.muxAssetId))
          .unique();

    if (!lesson) {
      return null;
    }

    await ctx.db.patch(lesson._id, {
      muxAssetId: args.muxAssetId,
      muxPlaybackId: args.muxPlaybackId,
      durationSeconds: args.durationSeconds ?? lesson.durationSeconds,
      muxStatus: args.status,
      updatedAt: Date.now(),
    });

    return lesson._id;
  },
});

export const createDocumentUploadUrl = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const saveLessonAsset = mutationGeneric({
  args: {
    courseId: v.id("courses"),
    lessonId: v.id("lessons"),
    titleSr: v.string(),
    titleEn: v.string(),
    kind: v.union(v.literal("pdf"), v.literal("prompt"), v.literal("worksheet"), v.literal("project")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    byteSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return ctx.db.insert("lessonAssets", {
      ...args,
      createdBy: admin.userId,
      createdAt: Date.now(),
    });
  },
});
