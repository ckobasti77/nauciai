/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { tallyLessonFlags, tallyStatuses, tallyStudents } from "./adminOverviewCore";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

type Role = "student" | "pro_student" | "moderator" | "admin";

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `overview|${userId}` });
}

async function seedUser(
  t: ReturnType<typeof convexTest>,
  email: string,
  role: Role | undefined,
) {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: email,
      ...(role ? { role } : {}),
      language: "sr" as const,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

/**
 * Jedan smer sa `trackStatus`, jedan kurs sa `courseStatus` i po jedna
 * objavljena i neobjavljena lekcija u tom kursu.
 */
async function seedContent(
  t: ReturnType<typeof convexTest>,
  key: string,
  trackStatus: "draft" | "published" | "archived",
  courseStatus: "draft" | "published" | "archived",
) {
  await t.run(async (ctx) => {
    const trackId = await ctx.db.insert("courseTracks", {
      slug: `track-${key}`,
      titleSr: "Smer",
      titleEn: "Track",
      status: trackStatus,
      sortOrder: 10,
      createdAt: 1,
      updatedAt: 1,
    });
    const courseId = await ctx.db.insert("courses", {
      trackId,
      slug: `course-${key}`,
      titleSr: "Kurs",
      titleEn: "Course",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      status: courseStatus,
      sortOrder: 10,
      updatedAt: 1,
    });
    for (const [index, isPublished] of [true, false].entries()) {
      await ctx.db.insert("lessons", {
        courseId,
        slug: `lesson-${key}-${index}`,
        titleSr: "Lekcija",
        titleEn: "Lesson",
        summarySr: "Sažetak",
        summaryEn: "Summary",
        durationSeconds: 600,
        isPublished,
        sortOrder: 10 * (index + 1),
        updatedAt: 1,
      });
    }
  });
}

describe("adminOverviewCore", () => {
  it("counts statuses and keeps the archived bucket for tracks and courses", () => {
    expect(tallyStatuses(["published", "draft", "draft", "archived"])).toEqual({
      total: 4,
      published: 1,
      draft: 2,
      archived: 1,
    });
  });

  it("returns an all-zero tally for no rows", () => {
    expect(tallyStatuses([])).toEqual({ total: 0, published: 0, draft: 0, archived: 0 });
  });

  it("maps lesson isPublished onto published/draft and never onto archived", () => {
    expect(tallyLessonFlags([true, false, false])).toEqual({
      total: 3,
      published: 1,
      draft: 2,
      archived: 0,
    });
  });

  it("sums student buckets and only flags capped when a bucket hits the limit", () => {
    expect(tallyStudents([3, 1, 0], 10)).toEqual({ count: 4, capped: false });
    expect(tallyStudents([10, 1, 0], 10)).toEqual({ count: 11, capped: true });
    expect(tallyStudents([9, 9, 9], 10)).toEqual({ count: 27, capped: false });
  });
});

describe.sequential("getAdminOverview", () => {
  beforeAll(() => {
    process.env.INITIAL_ADMIN_EMAILS = "overview-admin@example.com";
  });

  afterAll(() => {
    if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
    else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
  });

  it("aggregates tracks, courses and lessons by status", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "overview-admin@example.com", "admin");
    await seedContent(t, "a", "published", "published");
    await seedContent(t, "b", "draft", "archived");

    const overview = await asUser(t, adminId).query(api.adminOverview.getAdminOverview, {});

    expect(overview.tracks).toEqual({ total: 2, published: 1, draft: 1, archived: 0 });
    expect(overview.courses).toEqual({ total: 2, published: 1, draft: 0, archived: 1 });
    expect(overview.lessons).toEqual({ total: 4, published: 2, draft: 2, archived: 0 });
  });

  it("counts students and pro students, including accounts with no stored role", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "overview-admin@example.com", "admin");
    await seedUser(t, "s1@example.com", "student");
    await seedUser(t, "s2@example.com", "student");
    await seedUser(t, "p1@example.com", "pro_student");
    await seedUser(t, "m1@example.com", "moderator");
    await seedUser(t, "legacy@example.com", undefined);

    const overview = await asUser(t, adminId).query(api.adminOverview.getAdminOverview, {});

    // Admin i moderator nisu studenti; nalog bez upisane role jeste (helpers.effectiveRoleForProfile).
    expect(overview.students).toEqual({ count: 4, capped: false });
  });

  it("reports empty tallies on an empty deployment instead of failing", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, "overview-admin@example.com", "admin");

    const overview = await asUser(t, adminId).query(api.adminOverview.getAdminOverview, {});

    expect(overview.tracks.total).toBe(0);
    expect(overview.courses.total).toBe(0);
    expect(overview.lessons.total).toBe(0);
    expect(overview.students.count).toBe(0);
  });

  it.each([
    ["moderator", "overview-moderator@example.com"],
    ["pro_student", "overview-pro@example.com"],
    ["student", "overview-student@example.com"],
  ] as const)("rejects %s", async (role, email) => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t, email, role);
    await expect(
      asUser(t, userId).query(api.adminOverview.getAdminOverview, {}),
    ).rejects.toThrow("Forbidden");
  });

  it("rejects an anonymous viewer", async () => {
    const t = convexTest(schema, modules);
    await seedContent(t, "anon", "published", "published");
    await expect(t.query(api.adminOverview.getAdminOverview, {})).rejects.toThrow("Unauthorized");
  });
});
