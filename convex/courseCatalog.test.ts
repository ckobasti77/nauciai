/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

type Role = "student" | "pro_student" | "moderator" | "admin";

/**
 * `owned` u `courses.getAppNavigation` je jedini izvor iz kog in-app katalog zna
 * da li kurs treba da prikaže sa napretkom ili sa cenom i dugmetom „Otključaj".
 * Ovi testovi drže dve stvari: da se `owned` računa iz aktivnog upisa (ili staff
 * role) i da NIJE promenio `hasAccess`, koji je i dalje jedino pravilo pristupa.
 */
async function seedCourses(t: ReturnType<typeof convexTest>, role: Role, email: string) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email,
      name: "Katalog",
      role,
      language: "sr",
      createdAt: now,
      updatedAt: now,
    });
    const makeCourse = (slug: string, sortOrder: number) =>
      ctx.db.insert("courses", {
        slug,
        titleSr: `Kurs ${slug}`,
        titleEn: `Course ${slug}`,
        subtitleSr: "Podnaslov",
        subtitleEn: "Subtitle",
        descriptionSr: "Opis",
        descriptionEn: "Description",
        status: "published" as const,
        sortOrder,
        updatedAt: now,
      });
    const boughtCourseId = await makeCourse("kupljen", 10);
    const lockedCourseId = await makeCourse("zakljucan", 20);
    for (const courseId of [boughtCourseId, lockedCourseId]) {
      await ctx.db.insert("lessons", {
        courseId,
        slug: `lekcija-${courseId}`,
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
    }
    return { userId, boughtCourseId, lockedCourseId };
  });
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `catalog-test|${userId}` });
}

async function enroll(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  courseId: Id<"courses">,
  status: "active" | "blocked",
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("enrollments", {
      userId,
      courseId,
      status,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

function courseBySlug(payload: { courses: Array<{ slug: string }> }, slug: string) {
  const course = payload.courses.find((item) => item.slug === slug);
  if (!course) throw new Error(`Kurs ${slug} nije u payload-u`);
  return course as { slug: string; owned: boolean; hasAccess: boolean };
}

describe.sequential("getAppNavigation owned flag", () => {
  beforeAll(() => {
    process.env.INITIAL_ADMIN_EMAILS = "katalog-admin@example.com";
  });

  afterAll(() => {
    if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
    else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
  });

  it("marks only the enrolled course as owned", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCourses(t, "student", "katalog-student@example.com");
    await enroll(t, fixture.userId, fixture.boughtCourseId, "active");

    const payload = await asUser(t, fixture.userId).query(api.courses.getAppNavigation, {});

    expect(courseBySlug(payload, "kupljen").owned).toBe(true);
    expect(courseBySlug(payload, "zakljucan").owned).toBe(false);
  });

  it("leaves hasAccess untouched — owning a course is not the same as being allowed in", async () => {
    // Ako ovaj test padne, znači da je katalog počeo da menja pravilo pristupa.
    // `hasAccess` je i dalje „objavljen kurs", tačno kao pre koraka U3.
    const t = convexTest(schema, modules);
    const fixture = await seedCourses(t, "student", "katalog-access@example.com");

    const payload = await asUser(t, fixture.userId).query(api.courses.getAppNavigation, {});

    expect(courseBySlug(payload, "zakljucan").hasAccess).toBe(true);
    expect(courseBySlug(payload, "zakljucan").owned).toBe(false);
  });

  it("does not count a blocked enrollment as owned", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCourses(t, "student", "katalog-blocked@example.com");
    await enroll(t, fixture.userId, fixture.boughtCourseId, "blocked");

    const payload = await asUser(t, fixture.userId).query(api.courses.getAppNavigation, {});

    expect(courseBySlug(payload, "kupljen").owned).toBe(false);
  });

  it.each([
    ["admin", "katalog-admin@example.com"],
    ["moderator", "katalog-moderator@example.com"],
    ["pro_student", "katalog-pro@example.com"],
  ] as const)("gives %s every course without an enrollment", async (role, email) => {
    const t = convexTest(schema, modules);
    const fixture = await seedCourses(t, role, email);

    const payload = await asUser(t, fixture.userId).query(api.courses.getAppNavigation, {});

    expect(courseBySlug(payload, "kupljen").owned).toBe(true);
    expect(courseBySlug(payload, "zakljucan").owned).toBe(true);
  });

  it("still derives plan from enrollments after the read moved up", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedCourses(t, "student", "katalog-plan@example.com");

    const free = await asUser(t, fixture.userId).query(api.courses.getAppNavigation, {});
    expect(free.profile.plan).toBe("free");

    await enroll(t, fixture.userId, fixture.boughtCourseId, "active");
    const lite = await asUser(t, fixture.userId).query(api.courses.getAppNavigation, {});
    expect(lite.profile.plan).toBe("lite");
  });
});
