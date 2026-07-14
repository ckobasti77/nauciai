import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

import { requireAdmin } from "./helpers";

export const createLessonDraft = mutation({
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
      isPublished: false,
      updatedAt: Date.now(),
    });
  },
});

export const saveCourseVideo = mutation({
  args: {
    courseId: v.id("courses"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    byteSize: v.number(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!args.mimeType.startsWith("video/")) throw new Error("Dozvoljen je samo video fajl");
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Kurs nije pronadjen");
    }

    if (course.videoStorageId) {
      await ctx.storage.delete(course.videoStorageId);
    }

    await ctx.db.patch(args.courseId, {
      videoStorageId: args.storageId,
      videoFileName: args.fileName,
      videoByteSize: args.byteSize,
      videoMimeType: args.mimeType,
      videoUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return args.courseId;
  },
});

export const saveTrackVideo = mutation({
  args: {
    trackId: v.id("courseTracks"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    byteSize: v.number(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!args.mimeType.startsWith("video/")) throw new Error("Dozvoljen je samo video fajl");
    const track = await ctx.db.get(args.trackId);
    if (!track) throw new Error("Smer nije pronađen");
    if (track.videoStorageId) await ctx.storage.delete(track.videoStorageId);
    await ctx.db.patch(args.trackId, {
      videoStorageId: args.storageId,
      videoFileName: args.fileName,
      videoByteSize: args.byteSize,
      videoMimeType: args.mimeType,
      videoUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return args.trackId;
  },
});

export const deleteTrackVideo = mutation({
  args: { trackId: v.id("courseTracks") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const track = await ctx.db.get(args.trackId);
    if (!track) throw new Error("Smer nije pronađen");
    if (track.videoStorageId) await ctx.storage.delete(track.videoStorageId);
    await ctx.db.patch(args.trackId, {
      videoStorageId: undefined,
      videoFileName: undefined,
      videoByteSize: undefined,
      videoMimeType: undefined,
      videoUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return args.trackId;
  },
});

export const saveCourseCover = mutation({
  args: {
    courseId: v.id("courses"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    byteSize: v.number(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!args.mimeType.startsWith("image/")) throw new Error("Dozvoljena je samo slika");
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Kurs nije pronađen");
    if (course.coverStorageId) await ctx.storage.delete(course.coverStorageId);
    await ctx.db.patch(args.courseId, {
      coverStorageId: args.storageId,
      coverFileName: args.fileName,
      coverByteSize: args.byteSize,
      coverMimeType: args.mimeType,
      coverUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return args.courseId;
  },
});

export const deleteCourseCover = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Kurs nije pronađen");
    if (course.coverStorageId) await ctx.storage.delete(course.coverStorageId);
    await ctx.db.patch(args.courseId, {
      coverStorageId: undefined,
      coverFileName: undefined,
      coverByteSize: undefined,
      coverMimeType: undefined,
      coverUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return args.courseId;
  },
});

export const deleteCourseVideo = mutation({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Kurs nije pronadjen");
    }

    if (course.videoStorageId) {
      await ctx.storage.delete(course.videoStorageId);
    }

    await ctx.db.patch(args.courseId, {
      videoStorageId: undefined,
      videoFileName: undefined,
      videoByteSize: undefined,
      videoMimeType: undefined,
      videoUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return args.courseId;
  },
});

export const createDocumentUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const saveLessonAsset = mutation({
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
      createdBy: admin.userId as Id<"users">,
      createdAt: Date.now(),
    });
  },
});

export const deleteLessonAsset = mutation({
  args: { assetId: v.id("lessonAssets") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;
    if (asset.storageId) await ctx.storage.delete(asset.storageId);
    await ctx.db.delete(args.assetId);
    return null;
  },
});
