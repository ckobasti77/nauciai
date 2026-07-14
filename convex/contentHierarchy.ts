import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getCurrentProfile, requireAdmin } from "./helpers";
import { assertReadyToPublish } from "./contentReadiness";
import { parseRichText, richTextHasContent, richTextToPlainText } from "../lib/rich-text";

const publishStatus = v.union(v.literal("draft"), v.literal("published"), v.literal("archived"));

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function availableSlug(
  ctx: MutationCtx,
  kind: "track" | "course" | "lesson",
  preferred: string,
  parentId?: Id<"courses">,
  excludeId?: Id<"courseTracks"> | Id<"courses"> | Id<"lessons">,
) {
  const base = normalizeSlug(preferred) || `novi-${kind}`;
  for (let suffix = 1; suffix <= 50; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const existing =
      kind === "track"
        ? await ctx.db.query("courseTracks").withIndex("by_slug", (q) => q.eq("slug", candidate)).unique()
        : kind === "course"
          ? await ctx.db.query("courses").withIndex("by_slug", (q) => q.eq("slug", candidate)).unique()
          : parentId
            ? await ctx.db
                .query("lessons")
                .withIndex("by_course_slug", (q) => q.eq("courseId", parentId).eq("slug", candidate))
                .unique()
            : null;
    if (!existing || existing._id === excludeId) return candidate;
  }
  throw new Error("Nije moguće napraviti jedinstven URL naziv.");
}

async function assertUniqueTrackSlug(ctx: MutationCtx, slug: string, exclude?: Id<"courseTracks">) {
  const existing = await ctx.db.query("courseTracks").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
  if (existing && existing._id !== exclude) throw new Error("Smer sa ovim URL nazivom već postoji.");
}

export const getAdminHierarchy = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") throw new Error("Forbidden");
    const tracks = (await ctx.db.query("courseTracks").take(200)).sort((a, b) => a.sortOrder - b.sortOrder);
    return Promise.all(
      tracks.map(async (track) => {
        const courses = await ctx.db
          .query("courses")
          .withIndex("by_trackId_and_status_and_sortOrder", (q) => q.eq("trackId", track._id))
          .take(500);
        const hydratedCourses = await Promise.all(
          courses
            .filter((course) => course.status !== "archived")
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(async (course) => {
              const lessons = await ctx.db
                .query("lessons")
                .withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", course._id))
                .take(1000);
              const hydratedLessons = await Promise.all(
                lessons.sort((a, b) => a.sortOrder - b.sortOrder).map(async (lesson) => {
                  const parts = await ctx.db
                    .query("lessonParts")
                    .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
                    .take(500);
                  const steps = await ctx.db
                    .query("lessonSteps")
                    .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
                    .take(500);
                  return {
                    ...lesson,
                    parts: await Promise.all(
                      parts
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map(async (part) => ({
                          ...part,
                          downloadUrl: part.storageId ? await ctx.storage.getUrl(part.storageId) : null,
                        })),
                    ),
                    steps: await Promise.all(
                      steps.sort((a, b) => a.sortOrder - b.sortOrder).map(async (step) => ({
                        ...step,
                        tasks: (await ctx.db.query("lessonTasks").withIndex("by_step", (q) => q.eq("stepId", step._id)).take(500)).sort((a, b) => a.sortOrder - b.sortOrder),
                      })),
                    ),
                  };
                }),
              );
              return {
                ...course,
                coverUrl: course.coverStorageId ? await ctx.storage.getUrl(course.coverStorageId) : null,
                lessons: hydratedLessons,
              };
            }),
        );
        return {
          ...track,
          videoUrl: track.videoStorageId ? await ctx.storage.getUrl(track.videoStorageId) : null,
          courses: hydratedCourses,
        };
      }),
    );
  },
});

export const getAdminDetail = query({
  args: {
    trackId: v.id("courseTracks"),
    courseId: v.optional(v.id("courses")),
    lessonId: v.optional(v.id("lessons")),
  },
  handler: async (ctx, args) => {
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") throw new Error("Forbidden");

    const track = await ctx.db.get(args.trackId);
    if (!track) throw new Error("Smer nije pronađen.");
    const course = args.courseId ? await ctx.db.get(args.courseId) : null;
    if (course && course.trackId !== track._id) throw new Error("Kurs ne pripada izabranom smeru.");
    if (args.lessonId && !course) throw new Error("Kurs je obavezan za detalj lekcije.");
    const lesson = args.lessonId ? await ctx.db.get(args.lessonId) : null;
    if (lesson && lesson.courseId !== course?._id) throw new Error("Lekcija ne pripada izabranom kursu.");

    const courses = course
      ? [course]
      : (await ctx.db
          .query("courses")
          .withIndex("by_trackId_and_status_and_sortOrder", (q) => q.eq("trackId", track._id))
          .take(500))
          .filter((item) => item.status !== "archived")
          .sort((a, b) => a.sortOrder - b.sortOrder);

    const lessons = course
      ? (await ctx.db
          .query("lessons")
          .withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", course._id))
          .take(1000)).sort((a, b) => a.sortOrder - b.sortOrder)
      : [];

    const [parts, assets, steps] = lesson
      ? await Promise.all([
          ctx.db.query("lessonParts").withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id)).take(500),
          ctx.db.query("lessonAssets").withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id)).take(500),
          ctx.db.query("lessonSteps").withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id)).take(500),
        ])
      : [[], [], []];

    const hydratedLesson = lesson
      ? {
          ...lesson,
          parts: await Promise.all(
            parts.sort((a, b) => a.sortOrder - b.sortOrder).map(async (part) => ({
              ...part,
              downloadUrl: part.storageId ? await ctx.storage.getUrl(part.storageId) : null,
            })),
          ),
          assets: await Promise.all(
            assets.map(async (asset) => ({
              ...asset,
              downloadUrl: asset.storageId ? await ctx.storage.getUrl(asset.storageId) : null,
            })),
          ),
          steps: await Promise.all(
            steps.sort((a, b) => a.sortOrder - b.sortOrder).map(async (step) => ({
              ...step,
              tasks: (await ctx.db
                .query("lessonTasks")
                .withIndex("by_step", (q) => q.eq("stepId", step._id))
                .take(500)).sort((a, b) => a.sortOrder - b.sortOrder),
            })),
          ),
        }
      : null;

    return {
      track: {
        ...track,
        videoUrl: track.videoStorageId ? await ctx.storage.getUrl(track.videoStorageId) : null,
      },
      courses: await Promise.all(courses.map(async (item) => ({
        ...item,
        coverUrl: item.coverStorageId ? await ctx.storage.getUrl(item.coverStorageId) : null,
      }))),
      course: course
        ? {
            ...course,
            videoUrl: course.videoStorageId ? await ctx.storage.getUrl(course.videoStorageId) : null,
          }
        : null,
      lessons,
      lesson: hydratedLesson,
    };
  },
});

export const getTrackPage = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const { profile, userId } = await getCurrentProfile(ctx);
    const isAdmin = profile.role === "admin";
    const track = await ctx.db.query("courseTracks").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (!track || (!isAdmin && track.status !== "published")) return null;
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_trackId_and_status_and_sortOrder", (q) => q.eq("trackId", track._id))
      .take(500);
    const visibleCourses = courses
      .filter((course) => isAdmin || course.status === "published")
      .filter((course) => course.status !== "archived")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const progressRows = await ctx.db.query("progress").withIndex("by_user_course", (q) => q.eq("userId", userId)).take(1000);
    const progressByLessonId = new Map(progressRows.map((row) => [row.lessonId, row]));
    const hydratedCourses = await Promise.all(visibleCourses.map(async (course) => {
      const lessons = await ctx.db.query("lessons").withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", course._id)).take(1000);
      const visibleLessons = (isAdmin ? lessons : lessons.filter((lesson) => lesson.isPublished)).sort((a, b) => a.sortOrder - b.sortOrder);
      const lessonRows = visibleLessons.map((lesson) => {
        const progress = progressByLessonId.get(lesson._id);
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
          progress: progress ? { completed: progress.completed, positionSeconds: progress.positionSeconds, updatedAt: progress.updatedAt } : null,
        };
      });
      const completedLessons = lessonRows.filter((lesson) => lesson.progress?.completed).length;
      const nextLesson = lessonRows.find((lesson) => !lesson.progress?.completed);
      const timestamps = lessonRows.map((lesson) => lesson.progress?.updatedAt).filter((value): value is number => Boolean(value));
      return {
        ...course,
        coverUrl: course.coverStorageId ? await ctx.storage.getUrl(course.coverStorageId) : null,
        hasAccess: isAdmin || course.status === "published",
        lessons: lessonRows,
        progress: {
          totalLessons: lessonRows.length,
          completedLessons,
          percent: lessonRows.length ? Math.round((completedLessons / lessonRows.length) * 100) : 0,
          startedAt: timestamps.length ? Math.min(...timestamps) : undefined,
          lastActivityAt: timestamps.length ? Math.max(...timestamps) : undefined,
          nextLessonSlug: nextLesson?.slug,
          nextLessonTitleSr: nextLesson?.titleSr,
          nextLessonTitleEn: nextLesson?.titleEn,
          activity: [],
        },
      };
    }));
    const featuredThreads = await ctx.db
      .query("communityPosts")
      .withIndex("by_featured_track", (q) => q.eq("featuredTrackId", track._id))
      .order("desc")
      .take(4);
    return {
      track: {
        ...track,
        videoUrl: track.videoStorageId ? await ctx.storage.getUrl(track.videoStorageId) : null,
      },
      courses: hydratedCourses,
      featuredThreads: featuredThreads.filter((thread) => thread.status === "published"),
      isAdmin,
    };
  },
});

export const upsertTrack = mutation({
  args: {
    trackId: v.optional(v.id("courseTracks")),
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    subtitleSr: v.optional(v.string()),
    subtitleEn: v.optional(v.string()),
    descriptionSr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    descriptionRichSr: v.optional(v.string()),
    descriptionRichEn: v.optional(v.string()),
    status: publishStatus,
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const slug = normalizeSlug(args.slug || args.titleSr || args.titleEn);
    if (!slug || !args.titleSr.trim()) throw new Error("Naziv i URL smera su obavezni.");
    if (args.status === "published" && !richTextHasContent(args.descriptionRichSr, args.descriptionSr)) {
      throw new Error("Dodaj opis pre objavljivanja smera.");
    }
    await assertUniqueTrackSlug(ctx, slug, args.trackId);
    const now = Date.now();
    if (args.descriptionRichSr) parseRichText(args.descriptionRichSr);
    if (args.descriptionRichEn) parseRichText(args.descriptionRichEn);
    const payload = {
      slug,
      titleSr: args.titleSr.trim(),
      titleEn: args.titleEn.trim(),
      subtitleSr: args.subtitleSr?.trim() || undefined,
      subtitleEn: args.subtitleEn?.trim() || undefined,
      descriptionSr: args.descriptionRichSr ? richTextToPlainText(args.descriptionRichSr) : args.descriptionSr?.trim() || undefined,
      descriptionEn: args.descriptionRichEn ? richTextToPlainText(args.descriptionRichEn) : args.descriptionEn?.trim() || undefined,
      ...(args.descriptionRichSr !== undefined ? { descriptionRichSr: args.descriptionRichSr } : {}),
      ...(args.descriptionRichEn !== undefined ? { descriptionRichEn: args.descriptionRichEn } : {}),
      status: args.status,
      sortOrder: args.sortOrder,
      updatedAt: now,
    };
    if (args.trackId) {
      const existing = await ctx.db.get(args.trackId);
      if (!existing) throw new Error("Smer nije pronađen.");
      await ctx.db.patch(args.trackId, payload);
      if (args.status === "published") await assertReadyToPublish(ctx, "track", args.trackId);
      return args.trackId;
    }
    const trackId = await ctx.db.insert("courseTracks", { ...payload, createdAt: now });
    if (args.status === "published") await assertReadyToPublish(ctx, "track", trackId);
    return trackId;
  },
});

export const createDraftEntity = mutation({
  args: {
    kind: v.union(v.literal("track"), v.literal("course"), v.literal("lesson")),
    trackId: v.optional(v.id("courseTracks")),
    courseId: v.optional(v.id("courses")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();

    if (args.kind === "track") {
      const rows = await ctx.db.query("courseTracks").take(200);
      const id = await ctx.db.insert("courseTracks", {
        slug: await availableSlug(ctx, "track", `novi-smer-${now}`),
        titleSr: "",
        titleEn: "",
        subtitleSr: "",
        subtitleEn: "",
        descriptionSr: "",
        descriptionEn: "",
        status: "draft",
        sortOrder: rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 10,
        createdAt: now,
        updatedAt: now,
      });
      return { kind: args.kind, id };
    }

    if (args.kind === "course") {
      if (!args.trackId) throw new Error("Izaberi smer za novi kurs.");
      const track = await ctx.db.get(args.trackId);
      if (!track || track.status === "archived") throw new Error("Smer nije pronađen.");
      const rows = await ctx.db
        .query("courses")
        .withIndex("by_trackId_and_status_and_sortOrder", (q) => q.eq("trackId", args.trackId))
        .take(500);
      const id = await ctx.db.insert("courses", {
        trackId: args.trackId,
        slug: await availableSlug(ctx, "course", `novi-kurs-${now}`),
        titleSr: "",
        titleEn: "",
        subtitleSr: "",
        subtitleEn: "",
        descriptionSr: "",
        descriptionEn: "",
        status: "draft",
        sortOrder: rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 10,
        updatedAt: now,
      });
      return { kind: args.kind, id, trackId: args.trackId };
    }

    if (!args.courseId) throw new Error("Izaberi kurs za novu lekciju.");
    const courseId = args.courseId;
    const course = await ctx.db.get(courseId);
    if (!course || course.status === "archived") throw new Error("Kurs nije pronađen.");
    if (args.trackId && course.trackId !== args.trackId) throw new Error("Kurs ne pripada izabranom smeru.");
    const rows = await ctx.db
      .query("lessons")
      .withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", courseId))
      .take(1000);
    const id = await ctx.db.insert("lessons", {
      courseId,
      slug: await availableSlug(ctx, "lesson", `nova-lekcija-${now}`, courseId),
      titleSr: "",
      titleEn: "",
      summarySr: "",
      summaryEn: "",
      durationSeconds: 600,
      isPublished: false,
      proEnabled: true,
      lightEnabled: true,
      sortOrder: rows.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 10,
      updatedAt: now,
    });
    return { kind: args.kind, id, trackId: course.trackId, courseId };
  },
});

export const upsertDirectLesson = mutation({
  args: {
    lessonId: v.optional(v.id("lessons")),
    courseId: v.id("courses"),
    slug: v.string(),
    titleSr: v.string(),
    titleEn: v.string(),
    summarySr: v.string(),
    summaryEn: v.string(),
    summaryRichSr: v.optional(v.string()),
    summaryRichEn: v.optional(v.string()),
    durationSeconds: v.number(),
    isPublished: v.boolean(),
    proEnabled: v.boolean(),
    lightEnabled: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Kurs nije pronađen.");
    const slug = normalizeSlug(args.slug || args.titleSr || args.titleEn);
    if (!slug || !args.titleSr.trim()) throw new Error("Naziv i URL lekcije su obavezni.");
    if (!args.proEnabled && !args.lightEnabled) throw new Error("Lekcija mora imati Pro ili Light prikaz.");
    const duplicate = await ctx.db
      .query("lessons")
      .withIndex("by_course_slug", (q) => q.eq("courseId", args.courseId).eq("slug", slug))
      .unique();
    if (duplicate && duplicate._id !== args.lessonId) throw new Error("Lekcija sa ovim URL nazivom već postoji.");
    if (args.summaryRichSr) parseRichText(args.summaryRichSr);
    if (args.summaryRichEn) parseRichText(args.summaryRichEn);
    const payload = {
      courseId: args.courseId,
      slug,
      titleSr: args.titleSr.trim(),
      titleEn: args.titleEn.trim(),
      summarySr: args.summaryRichSr ? richTextToPlainText(args.summaryRichSr) : args.summarySr.trim(),
      summaryEn: args.summaryRichEn ? richTextToPlainText(args.summaryRichEn) : args.summaryEn.trim(),
      ...(args.summaryRichSr !== undefined ? { summaryRichSr: args.summaryRichSr } : {}),
      ...(args.summaryRichEn !== undefined ? { summaryRichEn: args.summaryRichEn } : {}),
      durationSeconds: Math.max(60, args.durationSeconds),
      isPublished: args.isPublished,
      proEnabled: args.proEnabled,
      lightEnabled: args.lightEnabled,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
    };
    if (args.lessonId) {
      const existing = await ctx.db.get(args.lessonId);
      if (!existing || existing.courseId !== args.courseId) throw new Error("Lekcija nije pronađena u ovom kursu.");
      await ctx.db.patch(args.lessonId, payload);
      if (args.isPublished) await assertReadyToPublish(ctx, "lesson", args.lessonId);
      return args.lessonId;
    }
    const lessonId = await ctx.db.insert("lessons", payload);
    if (args.isPublished) await assertReadyToPublish(ctx, "lesson", lessonId);
    return lessonId;
  },
});

export const reorderLessons = mutation({
  args: { courseId: v.id("courses"), lessonIds: v.array(v.id("lessons")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (new Set(args.lessonIds).size !== args.lessonIds.length) throw new Error("Redosled sadrži duplikate.");
    const lessons = await Promise.all(args.lessonIds.map((id) => ctx.db.get(id)));
    if (lessons.some((lesson) => !lesson || lesson.courseId !== args.courseId)) throw new Error("Nevažeći redosled lekcija.");
    await Promise.all(args.lessonIds.map((id, index) => ctx.db.patch(id, { sortOrder: (index + 1) * 10, updatedAt: Date.now() })));
    return null;
  },
});

export const reorderLightBlocks = mutation({
  args: { lessonId: v.id("lessons"), blockIds: v.array(v.id("lessonParts")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (new Set(args.blockIds).size !== args.blockIds.length) throw new Error("Redosled sadrži duplikate.");
    const blocks = await Promise.all(args.blockIds.map((id) => ctx.db.get(id)));
    if (blocks.some((block) => !block || block.lessonId !== args.lessonId)) throw new Error("Nevažeći redosled blokova.");
    await Promise.all(args.blockIds.map((id, index) => ctx.db.patch(id, { parentPartId: undefined, sortOrder: (index + 1) * 10, updatedAt: Date.now() })));
    return null;
  },
});

export const deleteLightBlock = mutation({
  args: { blockId: v.id("lessonParts") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const block = await ctx.db.get(args.blockId);
    if (!block) return null;
    if (block.storageId) await ctx.storage.delete(block.storageId);
    await ctx.db.delete(args.blockId);
    return null;
  },
});

export const archiveEntity = mutation({
  args: {
    kind: v.union(v.literal("track"), v.literal("course"), v.literal("lesson")),
    trackId: v.optional(v.id("courseTracks")),
    courseId: v.optional(v.id("courses")),
    lessonId: v.optional(v.id("lessons")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.kind === "track" && args.trackId) await ctx.db.patch(args.trackId, { status: "archived", updatedAt: Date.now() });
    else if (args.kind === "course" && args.courseId) await ctx.db.patch(args.courseId, { status: "archived", updatedAt: Date.now() });
    else if (args.kind === "lesson" && args.lessonId) await ctx.db.patch(args.lessonId, { isPublished: false, updatedAt: Date.now() });
    else throw new Error("Entitet nije izabran.");
    return null;
  },
});

const inlineKind = v.union(
  v.literal("track"),
  v.literal("course"),
  v.literal("lesson"),
  v.literal("part"),
  v.literal("step"),
  v.literal("task"),
);
const inlineField = v.union(
  v.literal("title"),
  v.literal("subtitle"),
  v.literal("description"),
  v.literal("summary"),
  v.literal("body"),
  v.literal("prompt"),
  v.literal("hint"),
  v.literal("promptLabel"),
  v.literal("pageCopy_primaryCta"),
  v.literal("pageCopy_communityCta"),
  v.literal("pageCopy_continueCta"),
  v.literal("pageCopy_sectionEyebrow"),
  v.literal("pageCopy_sectionTitle"),
  v.literal("pageCopy_sectionDescription"),
  v.literal("pageCopy_introVideoEmpty"),
  v.literal("pageCopy_introVideoTitle"),
);

export const updateInlineField = mutation({
  args: {
    kind: inlineKind,
    entityId: v.union(
      v.id("courseTracks"),
      v.id("courses"),
      v.id("lessons"),
      v.id("lessonParts"),
      v.id("lessonSteps"),
      v.id("lessonTasks"),
    ),
    parentId: v.optional(
      v.union(
        v.id("courseTracks"),
        v.id("courses"),
        v.id("lessons"),
        v.id("lessonSteps"),
      ),
    ),
    field: inlineField,
    sr: v.string(),
    en: v.string(),
    promptIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const entity = await ctx.db.get(args.entityId);
    if (!entity) throw new Error("Sadržaj nije pronađen.");

    if (args.kind === "track") {
      if (args.parentId !== undefined) throw new Error("Smer ne može imati roditelja.");
    } else {
      if (!args.parentId) throw new Error("Izabrani roditelj je obavezan.");
      const actualParentId =
        args.kind === "course"
          ? ("trackId" in entity ? entity.trackId : undefined)
          : args.kind === "lesson"
            ? ("courseId" in entity ? entity.courseId : undefined)
            : args.kind === "part" || args.kind === "step"
              ? ("lessonId" in entity ? entity.lessonId : undefined)
              : "stepId" in entity
                ? entity.stepId
                : undefined;
      if (!actualParentId || actualParentId !== args.parentId) {
        throw new Error("Sadržaj ne pripada izabranom roditelju.");
      }
    }

    if (args.kind === "track" || args.kind === "course" || args.kind === "lesson") {
      if (args.kind === "track" && (!("status" in entity) || "courseId" in entity)) throw new Error("Smer nije pronađen.");
      if (args.kind === "course" && (!("trackId" in entity) || !("descriptionSr" in entity))) throw new Error("Kurs nije pronađen.");
      if (args.kind === "lesson" && (!("courseId" in entity) || !("summarySr" in entity) || !("durationSeconds" in entity))) throw new Error("Lekcija nije pronađena.");
      const copyKey = args.field.startsWith("pageCopy_") ? args.field.slice("pageCopy_".length) : null;
      if (copyKey) {
        const allowedCopyKeys: Record<"track" | "course" | "lesson", ReadonlySet<string>> = {
          track: new Set(["primaryCta", "communityCta", "sectionEyebrow", "sectionTitle", "introVideoEmpty", "introVideoTitle"]),
          course: new Set(["continueCta", "communityCta", "sectionEyebrow", "sectionTitle", "sectionDescription"]),
          lesson: new Set(["continueCta", "sectionEyebrow", "sectionTitle", "sectionDescription"]),
        };
        if (!allowedCopyKeys[args.kind].has(copyKey)) {
          throw new Error("Page copy polje nije dozvoljeno za ovaj sadržaj.");
        }
        const previous = ("pageCopy" in entity && entity.pageCopy ? entity.pageCopy : {}) as Record<string, { sr: string; en: string }>;
        await ctx.db.patch(args.entityId as never, {
          pageCopy: { ...previous, [copyKey]: { sr: args.sr, en: args.en } },
          updatedAt: now,
        } as never);
        return args.entityId;
      }
      const allowedFields: Record<"track" | "course" | "lesson", Record<string, string>> = {
        track: { title: "title", subtitle: "subtitle", description: "description" },
        course: { title: "title", subtitle: "subtitle", description: "description" },
        lesson: { title: "title", summary: "summary" },
      };
      const base = allowedFields[args.kind][args.field];
      if (!base) throw new Error("Polje nije dozvoljeno za ovaj sadržaj.");
      const fieldSr = `${base}Sr`;
      const fieldEn = `${base}En`;
      const shouldReplaceDraftSlug =
        base === "title" &&
        "slug" in entity &&
        typeof entity.slug === "string" &&
        /^(novi|nova)-/.test(entity.slug) &&
        Boolean(args.sr.trim() || args.en.trim());
      const slugPatch = shouldReplaceDraftSlug
        ? {
            slug: await availableSlug(
              ctx,
              args.kind,
              args.sr || args.en,
              args.kind === "lesson" && "courseId" in entity ? entity.courseId : undefined,
              entity._id as Id<"courseTracks"> | Id<"courses"> | Id<"lessons">,
            ),
          }
        : {};
      await ctx.db.patch(args.entityId as never, { [fieldSr]: args.sr, [fieldEn]: args.en, ...slugPatch, updatedAt: now } as never);
      return args.entityId;
    }

    if (args.kind === "part") {
      if (entity._id !== args.entityId || !("lessonId" in entity)) throw new Error("Blok nije pronađen.");
      if (args.field !== "title" && args.field !== "body") throw new Error("Polje nije dozvoljeno za blok.");
      const key = args.field === "title" ? "title" : "body";
      await ctx.db.patch(args.entityId as never, { [`${key}Sr`]: args.sr, [`${key}En`]: args.en, updatedAt: now } as never);
      return args.entityId;
    }

    if (args.kind === "step") {
      if (entity._id !== args.entityId || !("lessonId" in entity)) throw new Error("Korak nije pronađen.");
      if (args.field === "promptLabel") {
        if (args.promptIndex === undefined || !("prompts" in entity) || !entity.prompts) throw new Error("Prompt nije pronađen.");
        const prompts = entity.prompts.map((prompt, index) => index === args.promptIndex ? { ...prompt, labelSr: args.sr, labelEn: args.en } : prompt);
        await ctx.db.patch(args.entityId as never, { prompts, updatedAt: now } as never);
        return args.entityId;
      }
      const key = args.field === "title" ? "title" : args.field === "body" ? "body" : null;
      if (!key) throw new Error("Polje nije dozvoljeno za korak.");
      await ctx.db.patch(args.entityId as never, { [`${key}Sr`]: args.sr, [`${key}En`]: args.en, updatedAt: now } as never);
      return args.entityId;
    }

    if (entity._id !== args.entityId || !("stepId" in entity)) throw new Error("Zadatak nije pronađen.");
    const key = args.field === "prompt" ? "prompt" : args.field === "hint" ? "hint" : null;
    if (!key) throw new Error("Polje nije dozvoljeno za zadatak.");
    await ctx.db.patch(args.entityId as never, { [`${key}Sr`]: args.sr, [`${key}En`]: args.en, updatedAt: now } as never);
    return args.entityId;
  },
});

export const updateRichTextField = mutation({
  args: {
    kind: v.union(v.literal("track"), v.literal("course"), v.literal("lesson"), v.literal("part")),
    entityId: v.union(v.id("courseTracks"), v.id("courses"), v.id("lessons"), v.id("lessonParts")),
    parentId: v.optional(v.union(v.id("courseTracks"), v.id("courses"), v.id("lessons"))),
    field: v.union(v.literal("description"), v.literal("summary"), v.literal("body")),
    richSr: v.string(),
    richEn: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    parseRichText(args.richSr);
    if (args.richEn.trim()) parseRichText(args.richEn);
    const entity = await ctx.db.get(args.entityId);
    if (!entity) throw new Error("Sadržaj nije pronađen.");
    const allowed = (args.kind === "track" || args.kind === "course") && args.field === "description"
      || args.kind === "lesson" && args.field === "summary"
      || args.kind === "part" && args.field === "body";
    if (!allowed) throw new Error("Rich text polje nije dozvoljeno.");
    if (args.kind === "course" && (!("trackId" in entity) || entity.trackId !== args.parentId)) throw new Error("Kurs ne pripada smeru.");
    if (args.kind === "lesson" && (!("courseId" in entity) || entity.courseId !== args.parentId)) throw new Error("Lekcija ne pripada kursu.");
    if (args.kind === "part" && (!("lessonId" in entity) || entity.lessonId !== args.parentId)) throw new Error("Blok ne pripada lekciji.");
    const base = args.field;
    await ctx.db.patch(args.entityId as never, {
      [`${base}RichSr`]: args.richSr,
      [`${base}RichEn`]: args.richEn || undefined,
      [`${base}Sr`]: richTextToPlainText(args.richSr),
      [`${base}En`]: args.richEn ? richTextToPlainText(args.richEn) : "",
      updatedAt: Date.now(),
    } as never);
    return args.entityId;
  },
});
