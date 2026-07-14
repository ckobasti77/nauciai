import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { resolvedProfileAvatarUrl } from "./avatar";
import { mutation, query } from "./_generated/server";
import {
  ensureProfile,
  getCurrentProfile,
  requireAdmin,
  requireCourseAccess,
  requireUserId,
} from "./helpers";
import { syncLeaderboardSourceEvent } from "./leaderboardCore";
import { assertReadyToPublish } from "./contentReadiness";
import { parseRichText, richTextHasContent, richTextToPlainText } from "../lib/rich-text";

const courseInput = {
  courseId: v.optional(v.id("courses")),
  trackId: v.optional(v.id("courseTracks")),
  slug: v.string(),
  titleSr: v.string(),
  titleEn: v.string(),
  subtitleSr: v.string(),
  subtitleEn: v.string(),
  descriptionSr: v.string(),
  descriptionEn: v.string(),
  descriptionRichSr: v.optional(v.string()),
  descriptionRichEn: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  stripePriceId: v.optional(v.string()),
  sortOrder: v.number(),
};

const moduleInput = {
  moduleId: v.optional(v.id("modules")),
  courseId: v.id("courses"),
  titleSr: v.string(),
  titleEn: v.string(),
  descriptionSr: v.optional(v.string()),
  descriptionEn: v.optional(v.string()),
  imageStorageId: v.optional(v.id("_storage")),
  imageFileName: v.optional(v.string()),
  imageMimeType: v.optional(v.string()),
  imageByteSize: v.optional(v.number()),
  imageAltSr: v.optional(v.string()),
  imageAltEn: v.optional(v.string()),
  sortOrder: v.number(),
};

const lessonPartInput = {
  lessonPartId: v.optional(v.id("lessonParts")),
  courseId: v.id("courses"),
  lessonId: v.id("lessons"),
  parentPartId: v.optional(v.id("lessonParts")),
  slug: v.string(),
  titleSr: v.string(),
  titleEn: v.string(),
  kind: v.union(v.literal("text"), v.literal("image"), v.literal("video"), v.literal("file")),
  bodySr: v.optional(v.string()),
  bodyEn: v.optional(v.string()),
  bodyRichSr: v.optional(v.string()),
  bodyRichEn: v.optional(v.string()),
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
    const avatarUrl = await resolvedProfileAvatarUrl(ctx, profile, user?.image);

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
        imageUrl: module.imageStorageId ? await ctx.storage.getUrl(module.imageStorageId) : null,
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
    const progressRows = await ctx.db
      .query("progress")
      .withIndex("by_user_course", (q) => q.eq("userId", userId))
      .take(1000);
    const progressByLessonId = new Map(progressRows.map((row) => [row.lessonId, row]));
    const courses = (await ctx.db.query("courses").collect())
      .filter((course) => course.status !== "archived")
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const coursesWithNavigation = await Promise.all(
      courses.map(async (course) => {
        const track = course.trackId ? await ctx.db.get(course.trackId) : null;
        const courseLessons = await ctx.db
          .query("lessons")
          .withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", course._id))
          .take(1000);
        const visibleLessons = isAdmin ? courseLessons : courseLessons.filter((lesson) => lesson.isPublished);
        const lessonsWithParts = await Promise.all(
          visibleLessons.map(async (lesson) => {
            const progress = progressByLessonId.get(lesson._id);
            const parts = await ctx.db
              .query("lessonParts")
              .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
              .take(1000);
            const visibleParts = isAdmin ? parts : parts.filter((part) => part.isPublished);
            return {
              _id: lesson._id,
              moduleId: lesson.moduleId,
              slug: lesson.slug,
              titleSr: lesson.titleSr,
              titleEn: lesson.titleEn,
              summarySr: lesson.summarySr,
              summaryEn: lesson.summaryEn,
              summaryRichSr: lesson.summaryRichSr,
              summaryRichEn: lesson.summaryRichEn,
              durationSeconds: lesson.durationSeconds,
              isPublished: lesson.isPublished,
              proEnabled: lesson.proEnabled,
              lightEnabled: lesson.lightEnabled,
              sortOrder: lesson.sortOrder,
              progress: progress ? { completed: progress.completed, positionSeconds: progress.positionSeconds, updatedAt: progress.updatedAt } : null,
              parts: visibleParts.sort((a, b) => a.sortOrder - b.sortOrder).map((part) => ({
                _id: part._id,
                slug: part.slug,
                titleSr: part.titleSr,
                titleEn: part.titleEn,
                kind: part.kind,
                bodySr: part.bodySr,
                bodyEn: part.bodyEn,
                bodyRichSr: part.bodyRichSr,
                bodyRichEn: part.bodyRichEn,
                fileName: part.fileName,
                isPublished: part.isPublished,
                sortOrder: part.sortOrder,
              })),
            };
          }),
        );
        const modulesWithLessons = [{
          titleSr: "Lekcije",
          titleEn: "Lessons",
          sortOrder: 0,
          lessons: lessonsWithParts.sort((a, b) => a.sortOrder - b.sortOrder),
        }];
        const navigationLessons = modulesWithLessons.flatMap((module) => module.lessons);
        const completedLessons = navigationLessons.filter((lesson) => lesson.progress?.completed).length;
        const totalLessons = navigationLessons.length;
        const nextLesson = navigationLessons.find((lesson) => !lesson.progress?.completed) ?? null;
        const lastActivityAt = navigationLessons.reduce<number | undefined>((latest, lesson) => {
          const updatedAt = lesson.progress?.updatedAt;
          if (!updatedAt) return latest;
          return latest === undefined ? updatedAt : Math.max(latest, updatedAt);
        }, undefined);
        const startedAt = navigationLessons.reduce<number | undefined>((earliest, lesson) => {
          const updatedAt = lesson.progress?.updatedAt;
          if (!updatedAt) return earliest;
          return earliest === undefined ? updatedAt : Math.min(earliest, updatedAt);
        }, undefined);
        const activityCounts: Record<string, number> = {};
        for (const lesson of navigationLessons) {
          if (!lesson.progress?.completed || !lesson.progress.updatedAt) continue;
          const day = new Date(lesson.progress.updatedAt).toISOString().slice(0, 10);
          activityCounts[day] = (activityCounts[day] ?? 0) + 1;
        }

        const videoUrl = course.videoStorageId ? await ctx.storage.getUrl(course.videoStorageId) : null;
        const coverUrl = course.coverStorageId ? await ctx.storage.getUrl(course.coverStorageId) : null;

        return {
          _id: course._id,
          trackId: track?._id,
          trackSlug: track?.slug,
          trackTitleSr: track?.titleSr,
          trackTitleEn: track?.titleEn,
          slug: course.slug,
          titleSr: course.titleSr,
          titleEn: course.titleEn,
          subtitleSr: course.subtitleSr,
          subtitleEn: course.subtitleEn,
          descriptionSr: course.descriptionSr,
          descriptionEn: course.descriptionEn,
          descriptionRichSr: course.descriptionRichSr,
          descriptionRichEn: course.descriptionRichEn,
          status: course.status,
          stripePriceId: course.stripePriceId,
          videoUrl,
          coverUrl,
          coverFileName: course.coverFileName,
          videoFileName: course.videoFileName,
          videoByteSize: course.videoByteSize,
          videoMimeType: course.videoMimeType,
          videoUpdatedAt: course.videoUpdatedAt,
          sortOrder: course.sortOrder,
          hasAccess: isAdmin || course.status === "published",
          progress: {
            totalLessons,
            completedLessons,
            percent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
            startedAt,
            lastActivityAt,
            nextLessonSlug: nextLesson?.slug,
            nextLessonTitleSr: nextLesson?.titleSr,
            nextLessonTitleEn: nextLesson?.titleEn,
            activity: Object.entries(activityCounts)
              .map(([day, completed]) => ({ day, completed }))
              .sort((a, b) => a.day.localeCompare(b.day)),
          },
          modules: modulesWithLessons,
        };
      }),
    );

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const hasActiveEnrollment = enrollments.some((e) => e.status === "active");

    let plan = "free";
    if (profile.role === "admin") {
      plan = "admin";
    } else if (profile.role === "moderator") {
      plan = "moderator";
    } else if (profile.role === "pro_student") {
      plan = "pro";
    } else {
      plan = hasActiveEnrollment ? "lite" : "free";
    }

    const profileWithPlan = {
      ...profile,
      plan,
    };

    return { profile: profileWithPlan, courses: coursesWithNavigation };
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

export const getPublishedCourseOutline = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!course || course.status !== "published") return null;

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_course", (q) => q.eq("courseId", course._id))
      .take(200);

    const modulesWithPublishedLessons = await Promise.all(
      modules.map(async (module) => {
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_module", (q) => q.eq("moduleId", module._id))
          .take(500);
        const publishedLessons = lessons
          .filter((lesson) => lesson.isPublished)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((lesson) => ({
            _id: lesson._id,
            slug: lesson.slug,
            titleSr: lesson.titleSr,
            titleEn: lesson.titleEn,
            summarySr: lesson.summarySr,
            summaryEn: lesson.summaryEn,
            durationSeconds: lesson.durationSeconds,
            sortOrder: lesson.sortOrder,
          }));

        return {
          _id: module._id,
          titleSr: module.titleSr,
          titleEn: module.titleEn,
          descriptionSr: module.descriptionSr,
          descriptionEn: module.descriptionEn,
          sortOrder: module.sortOrder,
          lessons: publishedLessons,
        };
      }),
    );

    const videoUrl = course.videoStorageId ? await ctx.storage.getUrl(course.videoStorageId) : null;

    return {
      course: {
        _id: course._id,
        slug: course.slug,
        titleSr: course.titleSr,
        titleEn: course.titleEn,
        subtitleSr: course.subtitleSr,
        subtitleEn: course.subtitleEn,
        descriptionSr: course.descriptionSr,
        descriptionEn: course.descriptionEn,
        videoUrl,
        videoFileName: course.videoFileName,
        videoByteSize: course.videoByteSize,
        videoMimeType: course.videoMimeType,
        videoUpdatedAt: course.videoUpdatedAt,
      },
      modules: modulesWithPublishedLessons
        .filter((module) => module.lessons.length > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
  },
});



export const getCourseFavoriteStates = query({
  args: {
    courseSlugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const states: Record<string, boolean> = {};

    for (const courseSlug of args.courseSlugs) {
      const course = await ctx.db
        .query("courses")
        .withIndex("by_slug", (q) => q.eq("slug", courseSlug))
        .unique();

      if (!course) {
        states[courseSlug] = false;
        continue;
      }

      const favorite = await ctx.db
        .query("courseFavorites")
        .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", course._id))
        .unique();

      states[courseSlug] = Boolean(favorite);
    }

    return states;
  },
});

export const toggleCourseFavorite = mutation({
  args: {
    courseSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfile(ctx);
    if (!profile?.userId) {
      throw new Error("Unauthorized");
    }

    const userId = profile.userId as Id<"users">;
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.courseSlug))
      .unique();

    if (!course) {
      throw new Error("Kurs nije pronadjen");
    }

    const existing = await ctx.db
      .query("courseFavorites")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", course._id))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false };
    }

    await ctx.db.insert("courseFavorites", {
      userId,
      courseId: course._id,
      createdAt: Date.now(),
    });

    return { favorited: true };
  },
});

export const getModuleEditorData = query({
  args: {
    moduleId: v.id("modules"),
  },
  handler: async (ctx, args) => {
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") {
      throw new Error("Forbidden");
    }

    const cycle = await ctx.db.get(args.moduleId);
    if (!cycle) return null;
    const course = await ctx.db.get(cycle.courseId);
    if (!course) return null;

    const imageUrl = cycle.imageStorageId ? await ctx.storage.getUrl(cycle.imageStorageId) : null;
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_module", (q) => q.eq("moduleId", cycle._id))
      .collect();

    const lessonsWithDetails = await Promise.all(
      lessons.map(async (lesson) => {
        const parts = await Promise.all(
          (await ctx.db
            .query("lessonParts")
            .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
            .collect()).map(async (part) => ({
              ...part,
              downloadUrl: part.storageId ? await ctx.storage.getUrl(part.storageId) : null,
            })),
        );
        const steps = await ctx.db
          .query("lessonSteps")
          .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
          .collect();
        const tasks = await ctx.db
          .query("lessonTasks")
          .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
          .collect();

        return {
          ...lesson,
          parts,
          steps,
          tasks,
        };
      }),
    );

    return {
      course: {
        _id: course._id,
        slug: course.slug,
        titleSr: course.titleSr,
        titleEn: course.titleEn,
      },
      module: {
        ...cycle,
        imageUrl,
      },
      lessons: lessonsWithDetails,
    };
  },
});

export const getCourseEditorData = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") {
      throw new Error("Forbidden");
    }

    const course = await ctx.db.get(args.courseId);
    if (!course) return null;

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_course", (q) => q.eq("courseId", course._id))
      .take(200);

    const modulesWithLessons = await Promise.all(
      modules.map(async (module) => {
        const imageUrl = module.imageStorageId ? await ctx.storage.getUrl(module.imageStorageId) : null;
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_module", (q) => q.eq("moduleId", module._id))
          .take(500);

        return {
          ...module,
          imageUrl,
          lessons: lessons
            .map((lesson) => ({
              _id: lesson._id,
              slug: lesson.slug,
              titleSr: lesson.titleSr,
              titleEn: lesson.titleEn,
              summarySr: lesson.summarySr,
              summaryEn: lesson.summaryEn,
              durationSeconds: lesson.durationSeconds,
              isPublished: lesson.isPublished,
              sortOrder: lesson.sortOrder,
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        };
      }),
    );

    return {
      course,
      modules: modulesWithLessons.sort((a, b) => a.sortOrder - b.sortOrder),
    };
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

    const profile = await requireCourseAccess(ctx, course._id);
    const isAdmin = profile.role === "admin";
    const access = isAdmin || course.status === "published";

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

    const existing = await ctx.db
      .query("progress")
      .withIndex("by_user_lesson", (q) => q.eq("userId", userId).eq("lessonId", args.lessonId))
      .unique();
    const wasCompleted = Boolean(existing?.completed);
    const completedDelta = args.completed === wasCompleted ? 0 : args.completed ? 1 : -1;
    const updatedAt = Date.now();
    const patch = {
      userId,
      courseId: lesson.courseId,
      lessonId: args.lessonId,
      completed: args.completed,
      positionSeconds: args.positionSeconds,
      updatedAt,
    };

    if (completedDelta !== 0) {
      const stats = await ctx.db
        .query("profileStats")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (stats) {
        await ctx.db.patch(stats._id, {
          completedLessons: Math.max(0, stats.completedLessons + completedDelta),
          updatedAt,
        });
      } else {
        const progressRows = await ctx.db
          .query("progress")
          .withIndex("by_user_lesson", (q) => q.eq("userId", userId))
          .take(1000);
        const currentCompletedLessons = progressRows.filter((row) => row.completed).length;
        await ctx.db.insert("profileStats", {
          userId,
          completedLessons: Math.max(0, currentCompletedLessons + completedDelta),
          updatedAt,
        });
      }

      await syncLeaderboardSourceEvent(ctx, {
        userId,
        sourceType: "lesson",
        sourceId: String(args.lessonId),
        active: args.completed,
        occurredAt: updatedAt,
        courseId: lesson.courseId,
      });
    }

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
    if (args.trackId) {
      const track = await ctx.db.get(args.trackId);
      if (!track || track.status === "archived") {
        throw new Error("Smer nije pronađen");
      }
    }
    const existingWithSlug = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existingWithSlug && existingWithSlug._id !== args.courseId) {
      throw new Error("Kurs sa ovim slugom vec postoji");
    }

    if (args.descriptionRichSr) parseRichText(args.descriptionRichSr);
    if (args.descriptionRichEn) parseRichText(args.descriptionRichEn);
    const patch = {
      ...(args.trackId !== undefined ? { trackId: args.trackId } : {}),
      slug: args.slug,
      titleSr: args.titleSr,
      titleEn: args.titleEn,
      subtitleSr: args.subtitleSr,
      subtitleEn: args.subtitleEn,
      descriptionSr: args.descriptionRichSr ? richTextToPlainText(args.descriptionRichSr) : args.descriptionSr,
      descriptionEn: args.descriptionRichEn ? richTextToPlainText(args.descriptionRichEn) : args.descriptionEn,
      ...(args.descriptionRichSr !== undefined ? { descriptionRichSr: args.descriptionRichSr } : {}),
      ...(args.descriptionRichEn !== undefined ? { descriptionRichEn: args.descriptionRichEn } : {}),
      status: args.status,
      stripePriceId: args.stripePriceId?.trim() || undefined,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };

    if (args.courseId) {
      const existing = await ctx.db.get(args.courseId);
      if (!existing) {
        throw new Error("Kurs nije pronadjen");
      }
      await ctx.db.patch(args.courseId, patch);
      if (args.status === "published") await assertReadyToPublish(ctx, "course", args.courseId);
      return args.courseId;
    }

    const courseId = await ctx.db.insert("courses", { ...patch, createdBy: admin.userId as Id<"users"> });
    if (args.status === "published") await assertReadyToPublish(ctx, "course", courseId);
    return courseId;
  },
});

export const upsertModule = mutation({
  args: moduleInput,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Kurs nije pronadjen");
    }
    const patch: {
      courseId: Id<"courses">;
      titleSr: string;
      titleEn: string;
      descriptionSr?: string;
      descriptionEn?: string;
      imageStorageId?: Id<"_storage">;
      imageFileName?: string;
      imageMimeType?: string;
      imageByteSize?: number;
      imageAltSr?: string;
      imageAltEn?: string;
      sortOrder: number;
      updatedAt: number;
    } = {
      courseId: args.courseId,
      titleSr: args.titleSr,
      titleEn: args.titleEn,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };
    if (args.descriptionSr !== undefined) {
      patch.descriptionSr = args.descriptionSr;
    }
    if (args.descriptionEn !== undefined) {
      patch.descriptionEn = args.descriptionEn;
    }
    if (args.imageStorageId) {
      patch.imageStorageId = args.imageStorageId;
      patch.imageFileName = args.imageFileName;
      patch.imageMimeType = args.imageMimeType;
      patch.imageByteSize = args.imageByteSize;
      patch.imageAltSr = args.imageAltSr;
      patch.imageAltEn = args.imageAltEn;
    }
    if (args.moduleId) {
      const existing = await ctx.db.get(args.moduleId);
      if (!existing || existing.courseId !== args.courseId) {
        throw new Error("Ciklus nije pronadjen za ovaj kurs");
      }
      await ctx.db.patch(args.moduleId, patch);
      return args.moduleId;
    }
    return ctx.db.insert("modules", patch);
  },
});

export const reorderModules = mutation({
  args: {
    courseId: v.id("courses"),
    moduleIds: v.array(v.id("modules")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Kurs nije pronadjen");
    }

    const uniqueModuleIds = new Set(args.moduleIds);
    if (uniqueModuleIds.size !== args.moduleIds.length) {
      throw new Error("Ciklusi ne smeju da se ponavljaju u redosledu");
    }

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .take(200);
    const moduleIdsInCourse = new Set(modules.map((module) => module._id));

    if (moduleIdsInCourse.size !== args.moduleIds.length) {
      throw new Error("Redosled mora da sadrzi sve cikluse kursa");
    }

    for (const moduleId of args.moduleIds) {
      if (!moduleIdsInCourse.has(moduleId)) {
        throw new Error("Ciklus nije pronadjen za ovaj kurs");
      }
    }

    const updatedAt = Date.now();
    await Promise.all(
      args.moduleIds.map((moduleId, index) =>
        ctx.db.patch(moduleId, {
          sortOrder: (index + 1) * 10,
          updatedAt,
        }),
      ),
    );

    return args.moduleIds;
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
    summaryRichSr: v.optional(v.string()),
    summaryRichEn: v.optional(v.string()),
    durationSeconds: v.number(),
    isPublished: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Kurs nije pronadjen");
    }
    const courseModule = await ctx.db.get(args.moduleId);
    if (!courseModule || courseModule.courseId !== args.courseId) {
      throw new Error("Ciklus nije pronadjen za ovaj kurs");
    }
    const slugMatches = await ctx.db
      .query("lessons")
      .withIndex("by_course_slug", (q) => q.eq("courseId", args.courseId).eq("slug", args.slug))
      .take(2);
    const slugConflict = slugMatches.find((lesson) => lesson._id !== args.lessonId);
    if (slugConflict) {
      throw new Error("Lekcija sa ovim slugom vec postoji u kursu");
    }
    if (args.summaryRichSr) parseRichText(args.summaryRichSr);
    if (args.summaryRichEn) parseRichText(args.summaryRichEn);
    const patch = {
      courseId: args.courseId,
      moduleId: args.moduleId,
      slug: args.slug,
      titleSr: args.titleSr,
      titleEn: args.titleEn,
      summarySr: args.summaryRichSr ? richTextToPlainText(args.summaryRichSr) : args.summarySr,
      summaryEn: args.summaryRichEn ? richTextToPlainText(args.summaryRichEn) : args.summaryEn,
      ...(args.summaryRichSr !== undefined ? { summaryRichSr: args.summaryRichSr } : {}),
      ...(args.summaryRichEn !== undefined ? { summaryRichEn: args.summaryRichEn } : {}),
      durationSeconds: args.durationSeconds,
      isPublished: args.isPublished,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };
    if (args.lessonId) {
      const existing = await ctx.db.get(args.lessonId);
      if (!existing || existing.courseId !== args.courseId) {
        throw new Error("Lekcija nije pronadjena za ovaj kurs");
      }
      await ctx.db.patch(args.lessonId, patch);
      if (args.isPublished) await assertReadyToPublish(ctx, "lesson", args.lessonId);
      return args.lessonId;
    }
    const lessonId = await ctx.db.insert("lessons", patch);
    if (args.isPublished) await assertReadyToPublish(ctx, "lesson", lessonId);
    return lessonId;
  },
});

export const upsertLessonPart = mutation({
  args: lessonPartInput,
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson || lesson.courseId !== args.courseId) {
      throw new Error("Lesson not found for course");
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

    let resolvedSlug = args.slug;
    for (let suffix = 1; suffix <= 50; suffix += 1) {
      const candidate = suffix === 1 ? args.slug : `${args.slug}-${suffix}`;
      const slugMatches = await ctx.db
        .query("lessonParts")
        .withIndex("by_lesson_slug", (q) => q.eq("lessonId", args.lessonId).eq("slug", candidate))
        .take(2);
      if (!slugMatches.some((part) => part._id !== args.lessonPartId)) {
        resolvedSlug = candidate;
        break;
      }
      if (suffix === 50) throw new Error("Nije moguće napraviti interni identifikator bloka");
    }

    if (args.bodyRichSr) parseRichText(args.bodyRichSr);
    if (args.bodyRichEn) parseRichText(args.bodyRichEn);
    if (args.isPublished && args.kind === "text" && !richTextHasContent(args.bodyRichSr, args.bodySr)) {
      throw new Error("Dodaj tekst pre objavljivanja bloka");
    }
    if ((args.kind === "image" || args.kind === "video" || args.kind === "file") && !args.storageId && !existingPart?.storageId) {
      throw new Error("Upload a file before saving this lesson part");
    }

    const patch: {
      courseId: Id<"courses">;
      lessonId: Id<"lessons">;
      parentPartId?: Id<"lessonParts">;
      slug: string;
      titleSr: string;
      titleEn: string;
      kind: "text" | "image" | "video" | "file";
      bodySr?: string;
      bodyEn?: string;
      bodyRichSr?: string;
      bodyRichEn?: string;
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
      slug: resolvedSlug,
      titleSr: args.titleSr,
      titleEn: args.titleEn,
      kind: args.kind,
      bodySr: args.bodyRichSr ? richTextToPlainText(args.bodyRichSr) : args.bodySr,
      bodyEn: args.bodyRichEn ? richTextToPlainText(args.bodyRichEn) : args.bodyEn,
      bodyRichSr: args.bodyRichSr,
      bodyRichEn: args.bodyRichEn,
      isPublished: args.isPublished,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };

    if (args.kind === "text") {
      if (existingPart?.storageId) await ctx.storage.delete(existingPart.storageId);
      patch.storageId = undefined;
      patch.fileName = undefined;
      patch.byteSize = undefined;
      patch.mimeType = undefined;
    } else if (args.storageId) {
      if (existingPart?.storageId && existingPart.storageId !== args.storageId) await ctx.storage.delete(existingPart.storageId);
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

export const removeLessonPartFile = mutation({
  args: { lessonPartId: v.id("lessonParts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const part = await ctx.db.get(args.lessonPartId);
    if (!part) throw new Error("Blok nije pronađen");
    if (part.storageId) await ctx.storage.delete(part.storageId);
    await ctx.db.patch(args.lessonPartId, {
      storageId: undefined,
      fileName: undefined,
      byteSize: undefined,
      mimeType: undefined,
      isPublished: false,
      updatedAt: Date.now(),
    });
    return null;
  },
});
