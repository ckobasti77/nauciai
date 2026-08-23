/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api } from "./_generated/api";
import { recomputePublishedLessonCount } from "./courses";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

const ADMIN_EMAIL = "count-admin@example.com";

beforeAll(() => {
  process.env.INITIAL_ADMIN_EMAILS = ADMIN_EMAIL;
});
afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

async function seedCourse(t: ReturnType<typeof convexTest>, slug: string) {
  return t.run((ctx) =>
    ctx.db.insert("courses", {
      slug,
      titleSr: "Kurs",
      titleEn: "Course",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: "published",
      sortOrder: 10,
      updatedAt: 1,
    }),
  );
}

async function insertLesson(
  t: ReturnType<typeof convexTest>,
  courseId: Id<"courses">,
  slug: string,
  isPublished: boolean,
  sortOrder: number,
) {
  return t.run((ctx) =>
    ctx.db.insert("lessons", {
      courseId,
      slug,
      titleSr: "Lekcija",
      titleEn: "Lesson",
      summarySr: "Sažetak",
      summaryEn: "Summary",
      durationSeconds: 600,
      isPublished,
      proEnabled: true,
      lightEnabled: false,
      sortOrder,
      updatedAt: 1,
    }),
  );
}

test("recomputePublishedLessonCount broji samo objavljene i prati promene", async () => {
  const t = convexTest(schema, modules);
  const courseId = await seedCourse(t, "recompute");
  const l1 = await insertLesson(t, courseId, "l1", true, 10);
  await insertLesson(t, courseId, "l2", true, 20);
  const l3 = await insertLesson(t, courseId, "l3", false, 30);

  await t.run((ctx) => recomputePublishedLessonCount(ctx, courseId));
  expect((await t.run((ctx) => ctx.db.get(courseId)))?.publishedLessonCount).toBe(2);

  // Sakrij jednu objavljenu → brojač pada.
  await t.run((ctx) => ctx.db.patch(l1, { isPublished: false, updatedAt: 2 }));
  await t.run((ctx) => recomputePublishedLessonCount(ctx, courseId));
  expect((await t.run((ctx) => ctx.db.get(courseId)))?.publishedLessonCount).toBe(1);

  // Objavi draft → brojač raste.
  await t.run((ctx) => ctx.db.patch(l3, { isPublished: true, updatedAt: 3 }));
  await t.run((ctx) => recomputePublishedLessonCount(ctx, courseId));
  expect((await t.run((ctx) => ctx.db.get(courseId)))?.publishedLessonCount).toBe(2);
});

test("upsertDirectLesson (objava) i archiveEntity (sakrivanje) održavaju brojač", async () => {
  const t = convexTest(schema, modules);
  const adminId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      name: "Admin",
      role: "admin",
      language: "sr",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const admin = t.withIdentity({ subject: adminId, tokenIdentifier: `count|${adminId}` });
  const courseId = await seedCourse(t, "wiring");

  // Draft lekcija + objavljen Pro korak da prođe assertReadyToPublish za Pro prikaz.
  const lessonId = await insertLesson(t, courseId, "prva", false, 10);
  await t.run((ctx) =>
    ctx.db.insert("lessonSteps", {
      courseId,
      lessonId,
      slug: "korak",
      titleSr: "Korak",
      titleEn: "Step",
      bodySr: "Objašnjenje",
      bodyEn: "Explanation",
      outputKind: "text",
      isPublished: true,
      sortOrder: 10,
      updatedAt: 1,
    }),
  );

  // Objava kroz javnu mutaciju → brojač 1.
  await admin.mutation(api.contentHierarchy.upsertDirectLesson, {
    lessonId,
    courseId,
    slug: "prva",
    titleSr: "Prva",
    titleEn: "First",
    summarySr: "Sažetak",
    summaryEn: "Summary",
    durationSeconds: 600,
    isPublished: true,
    proEnabled: true,
    lightEnabled: false,
    sortOrder: 10,
  });
  expect((await t.run((ctx) => ctx.db.get(courseId)))?.publishedLessonCount).toBe(1);

  // Sakrivanje kroz archiveEntity → brojač 0.
  await admin.mutation(api.contentHierarchy.archiveEntity, { kind: "lesson", lessonId });
  const course = await t.run((ctx) => ctx.db.get(courseId));
  const lesson = await t.run((ctx) => ctx.db.get(lessonId));
  expect(course?.publishedLessonCount).toBe(0);
  expect(lesson?.isPublished).toBe(false);
});
