import type { DashboardCourse } from "@/components/app/dashboard-content";
import { JourneyMap } from "@/components/igra/journey-map";
import { isCourseOwned } from "@/lib/course-catalog";
import { IGRA_JOURNEY_COPY } from "@/lib/igra-copy";
import { lessonStations } from "@/lib/igra-journey";
import type { Locale } from "@/lib/i18n";

/**
 * Mapa puta na stranici kursa (K10): lekcije kursa kao stanice. Stoji u panelu „Nastavni
 * tok", pa nema svoj okvir - samo radijus ugnežđene površine i tanku ivicu lista.
 *
 * Stanice se otvaraju po vlasništvu (`isCourseOwned`, isto pravilo kao katalog učionice):
 * kurs koji student nema je ceo zaključan i nijedna stanica nije link.
 */
export function CourseJourney({ course, locale, isAdmin }: { course: DashboardCourse; locale: Locale; isAdmin: boolean }) {
  const canOpen = isAdmin || (course.hasAccess && isCourseOwned(course, false));
  return (
    <JourneyMap
      stations={lessonStations({ courseSlug: course.slug, lessons: course.lessons, canOpen, locale })}
      locale={locale}
      label={IGRA_JOURNEY_COPY.courseLabel[locale]}
      className="surface-inset shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
    />
  );
}
