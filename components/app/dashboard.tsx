import { DashboardContent, type DashboardCourse } from "@/components/app/dashboard-content";
import { LiveStudentDashboard } from "@/components/app/dashboard-live";
import { findCourse, primaryCourseSlug, studentProfile } from "@/lib/content";
import type { ViewerProfile } from "@/lib/current-viewer";
import type { Locale } from "@/lib/i18n";

function staticDashboardCourse(courseSlug?: string): DashboardCourse {
  const course = findCourse(courseSlug ?? primaryCourseSlug);
  const modules = course.modules.map((module, moduleIndex) => ({
    title: module.title,
    sortOrder: moduleIndex * 10,
    lessons: module.lessons.map((lesson, lessonIndex) => ({
      slug: lesson.slug,
      title: lesson.title,
      duration: lesson.duration,
      isPublished: true,
      sortOrder: lessonIndex * 10,
    })),
  }));

  return {
    slug: course.slug,
    title: course.title,
    description: course.description,
    status: course.status === "published" ? "published" : "draft",
    hasAccess: course.status === "published",
    lessons: modules.flatMap((module) => module.lessons),
    modules,
  };
}

export function StudentDashboard({
  locale,
  profile,
  courseSlug,
  hasConvex = false,
}: {
  locale: Locale;
  profile?: ViewerProfile;
  courseSlug?: string;
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
