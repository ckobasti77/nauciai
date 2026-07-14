/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

type Role = "student" | "pro_student" | "moderator" | "admin";

async function seedFixture(t: ReturnType<typeof convexTest>, role: Role, email: string) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { email, name: role });
    await ctx.db.insert("profiles", {
      userId,
      email,
      name: role,
      role,
      language: "sr",
      createdAt: now,
      updatedAt: now,
    });
    const trackId = await ctx.db.insert("courseTracks", {
      slug: `track-${role}`,
      titleSr: "Smer",
      titleEn: "Track",
      status: "published",
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
    });
    const otherTrackId = await ctx.db.insert("courseTracks", {
      slug: `other-track-${role}`,
      titleSr: "Drugi smer",
      titleEn: "Other track",
      status: "published",
      sortOrder: 20,
      createdAt: now,
      updatedAt: now,
    });
    const courseId = await ctx.db.insert("courses", {
      trackId,
      slug: `course-${role}`,
      titleSr: "Kurs",
      titleEn: "Course",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "published",
      sortOrder: 10,
      updatedAt: now,
    });
    const lessonId = await ctx.db.insert("lessons", {
      courseId,
      slug: `lesson-${role}`,
      titleSr: "Lekcija",
      titleEn: "Lesson",
      summarySr: "Sažetak",
      summaryEn: "Summary",
      durationSeconds: 600,
      isPublished: true,
      proEnabled: true,
      lightEnabled: true,
      sortOrder: 10,
      updatedAt: now,
    });
    const stepId = await ctx.db.insert("lessonSteps", {
      courseId,
      lessonId,
      slug: `step-${role}`,
      titleSr: "Korak",
      titleEn: "Step",
      bodySr: "Objašnjenje",
      bodyEn: "Explanation",
      outputKind: "text",
      isPublished: true,
      sortOrder: 10,
      updatedAt: now,
    });
    const taskId = await ctx.db.insert("lessonTasks", {
      courseId,
      lessonId,
      stepId,
      promptSr: "Zadatak",
      promptEn: "Task",
      required: true,
      completionMode: "manual",
      isPublished: true,
      sortOrder: 10,
      updatedAt: now,
    });
    return { userId, trackId, otherTrackId, courseId, lessonId, stepId, taskId };
  });
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

describe.sequential("admin inline content mutation", () => {
  beforeAll(() => {
    process.env.INITIAL_ADMIN_EMAILS = "admin-inline@example.com";
  });

  afterAll(() => {
    if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
    else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
  });

  it("lets an admin save an SR/EN pair atomically", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t, "admin", "admin-inline@example.com");
    const admin = asUser(t, fixture.userId);

    await admin.mutation(api.contentHierarchy.updateInlineField, {
      kind: "course",
      entityId: fixture.courseId,
      parentId: fixture.trackId,
      field: "title",
      sr: "Novi kurs",
      en: "New course",
    });

    const course = await t.run((ctx) => ctx.db.get(fixture.courseId));
    expect(course).toMatchObject({ titleSr: "Novi kurs", titleEn: "New course" });
  });

  it.each([
    ["moderator", "moderator-inline@example.com"],
    ["pro_student", "pro-inline@example.com"],
    ["student", "student-inline@example.com"],
  ] as const)("rejects %s writes", async (role, email) => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t, role, email);
    await expect(
      asUser(t, fixture.userId).mutation(api.contentHierarchy.updateInlineField, {
        kind: "course",
        entityId: fixture.courseId,
        parentId: fixture.trackId,
        field: "title",
        sr: "Novi kurs",
        en: "New course",
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("allows missing EN content and exposes it as a non-blocking warning", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t, "admin", "admin-inline@example.com");
    const admin = asUser(t, fixture.userId);
    await admin.mutation(api.contentHierarchy.updateInlineField, {
        kind: "course",
        entityId: fixture.courseId,
        parentId: fixture.trackId,
        field: "title",
        sr: "Samo srpski",
        en: "",
      });
    const course = await t.run((ctx) => ctx.db.get(fixture.courseId));
    expect(course).toMatchObject({ titleSr: "Samo srpski", titleEn: "" });
    const readiness = await admin.query(api.contentReadiness.getReadiness, { kind: "course", courseId: fixture.courseId });
    expect(readiness.items.find((item) => item.key === "titleEn")).toMatchObject({ ok: false, blocking: false });
  });

  it("strictly blocks publishing an incomplete course", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t, "admin", "admin-inline@example.com");
    await expect(asUser(t, fixture.userId).mutation(api.courses.upsertCourse, {
      courseId: fixture.courseId,
      trackId: fixture.trackId,
      slug: "course-admin",
      titleSr: "Kurs",
      titleEn: "",
      subtitleSr: "Podnaslov",
      subtitleEn: "",
      descriptionSr: "Opis",
      descriptionEn: "",
      status: "published",
      sortOrder: 10,
    })).rejects.toThrow("Pre objave popuni");
  });

  it("reports strict missing requirements for track and lesson", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t, "admin", "admin-inline@example.com");
    const admin = asUser(t, fixture.userId);
    const [track, lesson] = await Promise.all([
      admin.query(api.contentReadiness.getReadiness, { kind: "track", trackId: fixture.trackId }),
      admin.query(api.contentReadiness.getReadiness, { kind: "lesson", lessonId: fixture.lessonId }),
    ]);
    expect(track.ready).toBe(false);
    expect(track.items.find((item) => item.key === "video")).toMatchObject({ ok: false, blocking: true });
    expect(lesson.ready).toBe(false);
    expect(lesson.items.find((item) => item.key === "light")).toMatchObject({ ok: false, blocking: true });
  });

  it("rejects publishing empty text and missing media blocks", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t, "admin", "admin-inline@example.com");
    const admin = asUser(t, fixture.userId);
    await expect(admin.mutation(api.courses.upsertLessonPart, {
      courseId: fixture.courseId,
      lessonId: fixture.lessonId,
      slug: "prazan-tekst",
      titleSr: "Tekst",
      titleEn: "",
      kind: "text",
      bodySr: "",
      isPublished: true,
      sortOrder: 10,
    })).rejects.toThrow("Dodaj tekst");
    await expect(admin.mutation(api.courses.upsertLessonPart, {
      courseId: fixture.courseId,
      lessonId: fixture.lessonId,
      slug: "video-bez-fajla",
      titleSr: "Video",
      titleEn: "",
      kind: "video",
      isPublished: true,
      sortOrder: 20,
    })).rejects.toThrow("Upload a file");
  });

  it("rejects an entity that does not belong to the selected parent", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t, "admin", "admin-inline@example.com");
    await expect(
      asUser(t, fixture.userId).mutation(api.contentHierarchy.updateInlineField, {
        kind: "course",
        entityId: fixture.courseId,
        parentId: fixture.otherTrackId,
        field: "title",
        sr: "Pogrešan smer",
        en: "Wrong track",
      }),
    ).rejects.toThrow("ne pripada izabranom roditelju");
  });

  it("creates empty templates under the selected parent and appends lessons at the bottom", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t, "admin", "admin-inline@example.com");
    const admin = asUser(t, fixture.userId);

    const courseDraft = await admin.mutation(api.contentHierarchy.createDraftEntity, {
      kind: "course",
      trackId: fixture.trackId,
    });
    const lessonDraft = await admin.mutation(api.contentHierarchy.createDraftEntity, {
      kind: "lesson",
      trackId: fixture.trackId,
      courseId: fixture.courseId,
    });

    const [course, lesson] = await t.run(async (ctx) => Promise.all([
      ctx.db.get(courseDraft.id as Id<"courses">),
      ctx.db.get(lessonDraft.id as Id<"lessons">),
    ]));
    expect(course).toMatchObject({ trackId: fixture.trackId, titleSr: "", titleEn: "", status: "draft" });
    expect(lesson).toMatchObject({ courseId: fixture.courseId, titleSr: "", titleEn: "", sortOrder: 20, isPublished: false });

    await admin.mutation(api.contentHierarchy.updateInlineField, {
      kind: "lesson",
      entityId: lessonDraft.id as Id<"lessons">,
      parentId: fixture.courseId,
      field: "title",
      sr: "Nova završna lekcija",
      en: "New final lesson",
    });
    const titledLesson = await t.run((ctx) => ctx.db.get(lessonDraft.id as Id<"lessons">));
    expect(titledLesson?.slug).toBe("nova-zavrsna-lekcija");
  });
});
