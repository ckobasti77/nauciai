import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  ensureProfile,
  getCurrentProfile,
  hasActiveSubscription,
  requireAdmin,
  requireCourseAccess,
  requireUserId,
} from "./helpers";

const courseInput = {
  courseId: v.optional(v.id("courses")),
  slug: v.string(),
  titleSr: v.string(),
  titleEn: v.string(),
  subtitleSr: v.string(),
  subtitleEn: v.string(),
  descriptionSr: v.string(),
  descriptionEn: v.string(),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  stripePriceId: v.optional(v.string()),
  sortOrder: v.number(),
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["trialing", "active"]);

const lessonPartInput = {
  lessonPartId: v.optional(v.id("lessonParts")),
  courseId: v.id("courses"),
  lessonId: v.id("lessons"),
  parentPartId: v.optional(v.id("lessonParts")),
  slug: v.string(),
  titleSr: v.string(),
  titleEn: v.string(),
  kind: v.union(v.literal("text"), v.literal("video"), v.literal("file")),
  bodySr: v.optional(v.string()),
  bodyEn: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  fileName: v.optional(v.string()),
  byteSize: v.optional(v.number()),
  mimeType: v.optional(v.string()),
  isPublished: v.boolean(),
  sortOrder: v.number(),
};

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const user = await ctx.db.get(userId);
    const avatarUrl =
      profile.avatarStorageId && typeof profile.avatarStorageId === "string"
        ? await ctx.storage.getUrl(profile.avatarStorageId as Id<"_storage">)
        : profile.avatarUrl;

    return {
      user,
      profile: {
        ...profile,
        avatarUrl: avatarUrl ?? profile.avatarUrl,
      },
    };
  },
});

export const ensureViewerProfile = mutation({
  args: {},
  handler: async (ctx) => ensureProfile(ctx),
});

export const listPublishedCourses = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("courses")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect(),
});

export const getCourseBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!course) return null;

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_course", (q) => q.eq("courseId", course._id))
      .collect();
    const lessons = await Promise.all(
      modules.map(async (module) => ({
        ...module,
        lessons: await Promise.all((await ctx.db
          .query("lessons")
          .withIndex("by_module", (q) => q.eq("moduleId", module._id))
          .collect()).map(async (lesson) => ({
            ...lesson,
            parts: await ctx.db
              .query("lessonParts")
              .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
              .collect(),
          }))),
      })),
    );

    return { course, modules: lessons };
  },
});

export const getAppNavigation = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const isAdmin = profile.role === "admin";
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
    const courses = (await ctx.db.query("courses").collect())
      .filter((course) => course.status !== "archived")
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const coursesWithNavigation = await Promise.all(
      courses.map(async (course) => {
        const subscription = subscriptions.find((item) => item.courseId === course._id);
        const hasActiveSubscription = Boolean(
          subscription &&
            typeof subscription.status === "string" &&
            ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status),
        );
        const modules = await ctx.db
          .query("modules")
          .withIndex("by_course", (q) => q.eq("courseId", course._id))
          .collect();
        const modulesWithLessons = await Promise.all(
          modules.map(async (module) => {
            const lessons = await ctx.db
              .query("lessons")
              .withIndex("by_module", (q) => q.eq("moduleId", module._id))
              .collect();
            const visibleLessons = isAdmin ? lessons : lessons.filter((lesson) => lesson.isPublished);
            const lessonsWithParts = await Promise.all(
              visibleLessons.map(async (lesson) => {
                const parts = await ctx.db
                  .query("lessonParts")
                  .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
                  .collect();
                const visibleParts = isAdmin ? parts : parts.filter((part) => part.isPublished);
                return {
                  _id: lesson._id,
                  slug: lesson.slug,
                  titleSr: lesson.titleSr,
                  titleEn: lesson.titleEn,
                  summarySr: lesson.summarySr,
                  summaryEn: lesson.summaryEn,
                  durationSeconds: lesson.durationSeconds,
                  isPublished: lesson.isPublished,
                  sortOrder: lesson.sortOrder,
                  parts: visibleParts.map((part) => ({
                    _id: part._id,
                    parentPartId: part.parentPartId,
                    slug: part.slug,
                    titleSr: part.titleSr,
                    titleEn: part.titleEn,
                    kind: part.kind,
                    bodySr: part.bodySr,
                    bodyEn: part.bodyEn,
                    fileName: part.fileName,
                    isPublished: part.isPublished,
                    sortOrder: part.sortOrder,
                  })),
                };
              }),
            );

            return {
              _id: module._id,
              titleSr: module.titleSr,
              titleEn: module.titleEn,
              sortOrder: module.sortOrder,
              lessons: lessonsWithParts,
            };
          }),
        );

        return {
          _id: course._id,
          slug: course.slug,
          titleSr: course.titleSr,
          titleEn: course.titleEn,
          subtitleSr: course.subtitleSr,
          subtitleEn: course.subtitleEn,
          descriptionSr: course.descriptionSr,
          descriptionEn: course.descriptionEn,
          status: course.status,
          stripePriceId: course.stripePriceId,
          sortOrder: course.sortOrder,
          hasAccess: isAdmin || hasActiveSubscription,
          modules: modulesWithLessons,
        };
      }),
    );

    return { profile, courses: coursesWithNavigation };
  },
});

export const getStudentDashboard = query({
  args: {},
  handler: async (ctx) => {
    const { userId, profile } = await getCurrentProfile(ctx);
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
    const progress = await ctx.db
      .query("progress")
      .withIndex("by_user_course", (q) => q.eq("userId", userId))
      .collect();

    return { profile, subscriptions, progress };
  },
});

export const getLessonForStudent = query({
  args: {
    courseSlug: v.string(),
    lessonSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.courseSlug))
      .unique();
    if (!course) return null;

    const access = await hasActiveSubscription(ctx, userId, course._id);
    const profile = await requireCourseAccess(ctx, course._id);
    const isAdmin = profile.role === "admin";

    const courseLessons = await ctx.db
      .query("lessons")
      .withIndex("by_course_slug", (q) => q.eq("courseId", course._id))
      .collect();
    const lesson = courseLessons.find((item) => item.slug === args.lessonSlug);
    if (!lesson) return null;
    if (!isAdmin && !lesson.isPublished) return null;

    const assets = await Promise.all((await ctx.db
      .query("lessonAssets")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
      .collect()).map(async (asset) => ({
        ...asset,
        downloadUrl: asset.storageId ? await ctx.storage.getUrl(asset.storageId) : null,
      })));
    const parts = await Promise.all((await ctx.db
      .query("lessonParts")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
      .collect())
      .filter((part) => isAdmin || part.isPublished)
      .map(async (part) => ({
        ...part,
        downloadUrl: part.storageId ? await ctx.storage.getUrl(part.storageId) : null,
      })));
    const progressRows = await ctx.db
      .query("progress")
      .withIndex("by_user_lesson", (q) => q.eq("userId", userId))
      .collect();
    const progress = progressRows.find((item) => item.lessonId === lesson._id);

    return { course, lesson, assets, parts, progress, access, isAdmin };
  },
});

export const markProgress = mutation({
  args: {
    lessonId: v.id("lessons"),
    completed: v.boolean(),
    positionSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    await requireCourseAccess(ctx, lesson.courseId);

    const progressRows = await ctx.db
      .query("progress")
      .withIndex("by_user_lesson", (q) => q.eq("userId", userId))
      .collect();
    const existing = progressRows.find((item) => item.lessonId === args.lessonId);
    const patch = {
      userId,
      courseId: lesson.courseId,
      lessonId: args.lessonId,
      completed: args.completed,
      positionSeconds: args.positionSeconds,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return ctx.db.insert("progress", patch);
  },
});

export const upsertCourse = mutation({
  args: courseInput,
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const existingWithSlug = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existingWithSlug && existingWithSlug._id !== args.courseId) {
      throw new Error("Smer sa ovim slugom vec postoji");
    }

    const patch = {
      slug: args.slug,
      titleSr: args.titleSr,
      titleEn: args.titleEn,
      subtitleSr: args.subtitleSr,
      subtitleEn: args.subtitleEn,
      descriptionSr: args.descriptionSr,
      descriptionEn: args.descriptionEn,
      status: args.status,
      ...(args.stripePriceId ? { stripePriceId: args.stripePriceId } : {}),
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };

    if (args.courseId) {
      const existing = await ctx.db.get(args.courseId);
      if (!existing) {
        throw new Error("Smer nije pronadjen");
      }
      await ctx.db.patch(args.courseId, patch);
      return args.courseId;
    }

    return ctx.db.insert("courses", { ...patch, createdBy: admin.userId as Id<"users"> });
  },
});

export const upsertModule = mutation({
  args: {
    moduleId: v.optional(v.id("modules")),
    courseId: v.id("courses"),
    titleSr: v.string(),
    titleEn: v.string(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Smer nije pronadjen");
    }
    const patch = {
      courseId: args.courseId,
      titleSr: args.titleSr,
      titleEn: args.titleEn,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };
    if (args.moduleId) {
      const existing = await ctx.db.get(args.moduleId);
      if (!existing || existing.courseId !== args.courseId) {
        throw new Error("Modul nije pronadjen za ovaj smer");
      }
      await ctx.db.patch(args.moduleId, patch);
      return args.moduleId;
    }
    return ctx.db.insert("modules", patch);
  },
});

export const upsertLesson = mutation({
  args: {
    lessonId: v.optional(v.id("lessons")),
    courseId: v.id("courses"),
    moduleId: v.id("modules"),
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    summarySr: v.string(),
    summaryEn: v.string(),
    durationSeconds: v.number(),
    isPublished: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Smer nije pronadjen");
    }
    const courseModule = await ctx.db.get(args.moduleId);
    if (!courseModule || courseModule.courseId !== args.courseId) {
      throw new Error("Modul nije pronadjen za ovaj smer");
    }
    const slugMatches = await ctx.db
      .query("lessons")
      .withIndex("by_course_slug", (q) => q.eq("courseId", args.courseId).eq("slug", args.slug))
      .take(2);
    const slugConflict = slugMatches.find((lesson) => lesson._id !== args.lessonId);
    if (slugConflict) {
      throw new Error("Lekcija sa ovim slugom vec postoji u smeru");
    }
    const patch = {
      courseId: args.courseId,
      moduleId: args.moduleId,
      slug: args.slug,
      titleSr: args.titleSr,
      titleEn: args.titleEn,
      summarySr: args.summarySr,
      summaryEn: args.summaryEn,
      durationSeconds: args.durationSeconds,
      isPublished: args.isPublished,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };
    if (args.lessonId) {
      const existing = await ctx.db.get(args.lessonId);
      if (!existing || existing.courseId !== args.courseId) {
        throw new Error("Lekcija nije pronadjena za ovaj smer");
      }
      await ctx.db.patch(args.lessonId, patch);
      return args.lessonId;
    }
    return ctx.db.insert("lessons", {
      ...patch,
      muxStatus: "draft",
    });
  },
});

export const upsertLessonPart = mutation({
  args: lessonPartInput,
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson || lesson.courseId !== args.courseId) {
      throw new Error("Lesson not found for track");
    }

    const existingPart = args.lessonPartId ? await ctx.db.get(args.lessonPartId) : null;
    if (args.lessonPartId && !existingPart) {
      throw new Error("Lesson part not found");
    }
    if (existingPart && (existingPart.lessonId !== args.lessonId || existingPart.courseId !== args.courseId)) {
      throw new Error("Lesson part not found for lesson");
    }

    if (args.parentPartId) {
      if (args.lessonPartId && args.parentPartId === args.lessonPartId) {
        throw new Error("Lesson part cannot be its own parent");
      }
      const parentPart = await ctx.db.get(args.parentPartId);
      if (!parentPart || parentPart.lessonId !== args.lessonId || parentPart.courseId !== args.courseId) {
        throw new Error("Parent lesson part not found for lesson");
      }
      if (parentPart.parentPartId) {
        throw new Error("Podpodlekcija ne moze da ima dodatni podnivo");
      }
      if (args.lessonPartId) {
        const childParts = await ctx.db
          .query("lessonParts")
          .withIndex("by_lesson_parent", (q) =>
            q.eq("lessonId", args.lessonId).eq("parentPartId", args.lessonPartId),
          )
          .take(1);
        if (childParts.length) {
          throw new Error("Deo koji ima poddelove ne moze da postane podpodlekcija");
        }
      }
    }

    const slugMatches = await ctx.db
      .query("lessonParts")
      .withIndex("by_lesson_slug", (q) => q.eq("lessonId", args.lessonId).eq("slug", args.slug))
      .take(2);
    const slugConflict = slugMatches.find((part) => part._id !== args.lessonPartId);
    if (slugConflict) {
      throw new Error("Deo lekcije sa ovim slugom vec postoji");
    }

    if ((args.kind === "video" || args.kind === "file") && !args.storageId && !existingPart?.storageId) {
      throw new Error("Upload a file before saving this lesson part");
    }

    const patch: {
      courseId: Id<"courses">;
      lessonId: Id<"lessons">;
      parentPartId?: Id<"lessonParts">;
      slug: string;
      titleSr: string;
      titleEn: string;
      kind: "text" | "video" | "file";
      bodySr?: string;
      bodyEn?: string;
      storageId?: Id<"_storage">;
      fileName?: string;
      byteSize?: number;
      mimeType?: string;
      isPublished: boolean;
      sortOrder: number;
      updatedAt: number;
    } = {
      courseId: args.courseId,
      lessonId: args.lessonId,
      parentPartId: args.parentPartId,
      slug: args.slug,
      titleSr: args.titleSr,
      titleEn: args.titleEn,
      kind: args.kind,
      bodySr: args.bodySr,
      bodyEn: args.bodyEn,
      isPublished: args.isPublished,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };

    if (args.kind === "text") {
      patch.storageId = undefined;
      patch.fileName = undefined;
      patch.byteSize = undefined;
      patch.mimeType = undefined;
    } else if (args.storageId) {
      patch.storageId = args.storageId;
      patch.fileName = args.fileName;
      patch.byteSize = args.byteSize;
      patch.mimeType = args.mimeType;
    }

    if (args.lessonPartId) {
      await ctx.db.patch(args.lessonPartId, patch);
      return args.lessonPartId;
    }

    return ctx.db.insert("lessonParts", {
      ...patch,
      createdBy: admin.userId as Id<"users">,
    });
  },
});
