import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getCurrentProfile } from "./helpers";
import { richTextHasContent } from "../lib/rich-text";

export type ReadinessItem = {
  key: string;
  labelSr: string;
  labelEn: string;
  ok: boolean;
  blocking: boolean;
};

export type ContentReadiness = {
  ready: boolean;
  items: ReadinessItem[];
};

type ReadCtx = QueryCtx | MutationCtx;

function item(key: string, labelSr: string, labelEn: string, ok: boolean, blocking = true): ReadinessItem {
  return { key, labelSr, labelEn, ok, blocking };
}

function englishWarning(key: string, labelSr: string, labelEn: string, value?: string): ReadinessItem {
  return item(key, labelSr, labelEn, Boolean(value?.trim()), false);
}

function finish(items: ReadinessItem[]): ContentReadiness {
  return { ready: items.every((entry) => !entry.blocking || entry.ok), items };
}

export async function trackReadiness(ctx: ReadCtx, track: Doc<"courseTracks">): Promise<ContentReadiness> {
  const publishedCourses = await ctx.db
    .query("courses")
    .withIndex("by_trackId_and_status_and_sortOrder", (q) => q.eq("trackId", track._id).eq("status", "published"))
    .take(1);
  return finish([
    item("titleSr", "Naziv smera na srpskom", "Serbian track title", Boolean(track.titleSr.trim())),
    item("slug", "URL naziv smera", "Track URL slug", Boolean(track.slug.trim())),
    item("subtitleSr", "Podnaslov smera na srpskom", "Serbian track subtitle", Boolean(track.subtitleSr?.trim())),
    item("descriptionSr", "Opis smera na srpskom", "Serbian track description", richTextHasContent(track.descriptionRichSr, track.descriptionSr)),
    item("video", "Uvodni video smera", "Track intro video", Boolean(track.videoStorageId)),
    item("course", "Najmanje jedan objavljen kurs", "At least one published course", publishedCourses.length > 0),
    englishWarning("titleEn", "Nedostaje EN naziv smera", "English track title is missing", track.titleEn),
    englishWarning("subtitleEn", "Nedostaje EN podnaslov smera", "English track subtitle is missing", track.subtitleEn),
    item("descriptionEn", "Nedostaje EN opis smera", "English track description is missing", richTextHasContent(track.descriptionRichEn, track.descriptionEn), false),
    ...((track.pageCopy?.introVideoTitle?.sr ?? "").trim()
      ? [englishWarning("introVideoTitleEn", "Nedostaje EN naslov videa", "English video title is missing", track.pageCopy?.introVideoTitle?.en)]
      : []),
  ]);
}

export async function courseReadiness(ctx: ReadCtx, course: Doc<"courses">): Promise<ContentReadiness> {
  const publishedLessons = await ctx.db
    .query("lessons")
    .withIndex("by_course_and_sortOrder", (q) => q.eq("courseId", course._id))
    .take(1000);
  return finish([
    item("titleSr", "Naziv kursa na srpskom", "Serbian course title", Boolean(course.titleSr.trim())),
    item("slug", "URL naziv kursa", "Course URL slug", Boolean(course.slug.trim())),
    item("subtitleSr", "Podnaslov kursa na srpskom", "Serbian course subtitle", Boolean(course.subtitleSr.trim())),
    item("descriptionSr", "Opis kursa na srpskom", "Serbian course description", richTextHasContent(course.descriptionRichSr, course.descriptionSr)),
    item("cover", "Naslovna slika kursa", "Course cover image", Boolean(course.coverStorageId)),
    item("video", "Uvodni video kursa", "Course intro video", Boolean(course.videoStorageId)),
    item("lesson", "Najmanje jedna objavljena lekcija", "At least one published lesson", publishedLessons.some((lesson) => lesson.isPublished)),
    englishWarning("titleEn", "Nedostaje EN naziv kursa", "English course title is missing", course.titleEn),
    englishWarning("subtitleEn", "Nedostaje EN podnaslov kursa", "English course subtitle is missing", course.subtitleEn),
    item("descriptionEn", "Nedostaje EN opis kursa", "English course description is missing", richTextHasContent(course.descriptionRichEn, course.descriptionEn), false),
  ]);
}

function validPublishedPart(part: Doc<"lessonParts">): boolean {
  if (!part.isPublished) return false;
  if (part.kind === "text") return richTextHasContent(part.bodyRichSr, part.bodySr);
  return Boolean(part.storageId);
}

export async function lessonReadiness(ctx: ReadCtx, lesson: Doc<"lessons">): Promise<ContentReadiness> {
  const [parts, steps] = await Promise.all([
    ctx.db.query("lessonParts").withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id)).take(500),
    ctx.db.query("lessonSteps").withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id)).take(500),
  ]);
  const proEnabled = lesson.proEnabled ?? true;
  const lightEnabled = lesson.lightEnabled ?? true;
  return finish([
    item("titleSr", "Naziv lekcije na srpskom", "Serbian lesson title", Boolean(lesson.titleSr.trim())),
    item("slug", "URL naziv lekcije", "Lesson URL slug", Boolean(lesson.slug.trim())),
    item("summarySr", "Sažetak lekcije na srpskom", "Serbian lesson summary", richTextHasContent(lesson.summaryRichSr, lesson.summarySr)),
    item("duration", "Trajanje lekcije", "Lesson duration", lesson.durationSeconds >= 60),
    item("view", "Uključen je Pro ili Light prikaz", "Pro or Light view is enabled", proEnabled || lightEnabled),
    ...(lightEnabled ? [item("light", "Light prikaz ima objavljen blok", "Light view has a published block", parts.some(validPublishedPart))] : []),
    ...(proEnabled ? [item("pro", "Pro prikaz ima objavljen korak", "Pro view has a published step", steps.some((step) => step.isPublished))] : []),
    englishWarning("titleEn", "Nedostaje EN naziv lekcije", "English lesson title is missing", lesson.titleEn),
    item("summaryEn", "Nedostaje EN sažetak lekcije", "English lesson summary is missing", richTextHasContent(lesson.summaryRichEn, lesson.summaryEn), false),
  ]);
}

export async function assertReadyToPublish(ctx: ReadCtx, kind: "track" | "course" | "lesson", id: Id<"courseTracks"> | Id<"courses"> | Id<"lessons">) {
  const entity = await ctx.db.get(id);
  if (!entity) throw new Error("Sadržaj nije pronađen.");
  const readiness = kind === "track"
    ? await trackReadiness(ctx, entity as Doc<"courseTracks">)
    : kind === "course"
      ? await courseReadiness(ctx, entity as Doc<"courses">)
      : await lessonReadiness(ctx, entity as Doc<"lessons">);
  const firstMissing = readiness.items.find((entry) => entry.blocking && !entry.ok);
  if (firstMissing) throw new Error(`Pre objave popuni: ${firstMissing.labelSr}.`);
  return readiness;
}

export const getReadiness = query({
  args: {
    kind: v.union(v.literal("track"), v.literal("course"), v.literal("lesson")),
    trackId: v.optional(v.id("courseTracks")),
    courseId: v.optional(v.id("courses")),
    lessonId: v.optional(v.id("lessons")),
  },
  handler: async (ctx, args) => {
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") throw new Error("Forbidden");
    if (args.kind === "track" && args.trackId) {
      const track = await ctx.db.get(args.trackId);
      if (!track) throw new Error("Smer nije pronađen.");
      return trackReadiness(ctx, track);
    }
    if (args.kind === "course" && args.courseId) {
      const course = await ctx.db.get(args.courseId);
      if (!course) throw new Error("Kurs nije pronađen.");
      return courseReadiness(ctx, course);
    }
    if (args.kind === "lesson" && args.lessonId) {
      const lesson = await ctx.db.get(args.lessonId);
      if (!lesson) throw new Error("Lekcija nije pronađena.");
      return lessonReadiness(ctx, lesson);
    }
    throw new Error("Izaberi sadržaj za proveru.");
  },
});
