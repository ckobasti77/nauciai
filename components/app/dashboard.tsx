import { DashboardContent, type DashboardCourse } from "@/components/app/dashboard-content";
import { LiveStudentDashboard } from "@/components/app/dashboard-live";
import { courses, findCourse, studentProfile } from "@/lib/content";
import type { ViewerProfile } from "@/lib/current-viewer";
import type { Locale } from "@/lib/i18n";

function staticDashboardCourseFromContent(course: (typeof courses)[number], sortOrder: number): DashboardCourse {
  const modules = course.modules.map((module, moduleIndex) => ({
    title: module.title,
    sortOrder: moduleIndex * 10,
    lessons: module.lessons.map((lesson, lessonIndex) => ({
      slug: lesson.slug,
      title: lesson.title,
      summary: lesson.summary,
      duration: lesson.duration,
      durationSeconds: lesson.durationSeconds,
      isPublished: true,
      sortOrder: lessonIndex * 10,
    })),
  }));

  return {
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    image: course.image,
    status: course.status === "published" ? "published" : "draft",
    hasAccess: course.status === "published",
    sortOrder,
    lessons: modules.flatMap((module) => module.lessons),
    modules,
  };
}

function staticDashboardCourse(courseSlug: string): DashboardCourse {
  const course = findCourse(courseSlug);
  const courseIndex = Math.max(0, courses.findIndex((item) => item.slug === course.slug));
  return staticDashboardCourseFromContent(course, courseIndex * 10);
}

export function staticDashboardCourses(): DashboardCourse[] {
  return courses.map((course, index) => staticDashboardCourseFromContent(course, index * 10));
}

// Stranica kursa. Komandnu tablu (`/app`) sklapa `app/[locale]/app/page.tsx` iz
// `components/app/dashboard-home.tsx`.
export function StudentDashboard({
  locale,
  profile,
  courseSlug,
  hasConvex = false,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  courseSlug: string;
  hasConvex?: boolean;
}) {
  const fallbackCourse = staticDashboardCourse(courseSlug);
  const resolvedProfile = profile ?? studentProfile;

  if (hasConvex) {
    return (
      <LiveStudentDashboard
        locale={locale}
        profile={resolvedProfile}
        courseSlug={courseSlug}
        fallbackCourse={fallbackCourse}
        fallbackCourses={staticDashboardCourses()}
      />
    );
  }

  return (
    <DashboardContent
      locale={locale}
      profile={resolvedProfile}
      course={fallbackCourse}
      isAdmin={resolvedProfile?.role === "admin"}
    />
  );
}
