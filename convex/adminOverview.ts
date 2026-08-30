import { query } from "./_generated/server";
import { getCurrentProfile } from "./helpers";
import {
  STUDENT_COUNT_LIMIT,
  tallyLessonFlags,
  tallyStatuses,
  tallyStudents,
} from "./adminOverviewCore";

// Jedan agregat za vrh /app/admin/content: koliko smerova, kurseva i lekcija
// postoji po statusu i koliko naloga uči na platformi. `getAdminHierarchy`
// (contentHierarchy.ts) ne može da ga zameni: on izbacuje arhivirane kurseve i
// uopšte ne čita korisnike.
//
// Gate je `getCurrentProfile` + provera role, isto kao `getAdminHierarchy`, a
// NE `requireAdmin`: taj helper ide kroz `ensureProfile`, koji traži
// write-capable ctx (`db.patch`) i u query kontekstu baca
// "Profile bootstrap requires a write-capable Convex context.".

const STUDENT_ROLES = ["student", "pro_student", undefined] as const;

export const getAdminOverview = query({
  args: {},
  handler: async (ctx) => {
    const { profile } = await getCurrentProfile(ctx);
    if (profile.role !== "admin") throw new Error("Forbidden");

    const tracks = await ctx.db.query("courseTracks").take(500);
    const courses = await ctx.db.query("courses").take(2000);
    const lessons = await ctx.db.query("lessons").take(5000);

    const studentBuckets = await Promise.all(
      STUDENT_ROLES.map(async (role) =>
        (
          await ctx.db
            .query("users")
            .withIndex("by_role", (q) => q.eq("role", role))
            .take(STUDENT_COUNT_LIMIT)
        ).length,
      ),
    );

    return {
      tracks: tallyStatuses(tracks.map((track) => track.status)),
      courses: tallyStatuses(courses.map((course) => course.status)),
      lessons: tallyLessonFlags(lessons.map((lesson) => lesson.isPublished)),
      students: tallyStudents(studentBuckets),
    };
  },
});
