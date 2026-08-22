"use client";

import { Compass, Settings2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";

import type { CommunityCourse, CommunityCycle, CommunityFilters, CommunityLesson, CommunityScope, CommunityTrack } from "./community-types";

type QueryUpdate = Record<string, string | undefined>;

export function useCommunityQueryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (values: QueryUpdate, mode: "push" | "replace" = "push") => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(values).forEach(([key, value]) => {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      });
      const query = next.toString();
      const href = `${pathname}${query ? `?${query}` : ""}`;
      if (mode === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { searchParams, update };
}

function localizedTrack(track: CommunityTrack | undefined, locale: Locale) {
  return track ? (locale === "sr" ? track.titleSr : track.titleEn) : undefined;
}

function localizedCourse(course: CommunityCourse | undefined, locale: Locale) {
  return course ? (locale === "sr" ? course.titleSr : course.titleEn) : undefined;
}

function localizedCycle(cycle: CommunityCycle | undefined, locale: Locale) {
  return cycle ? (locale === "sr" ? cycle.titleSr : cycle.titleEn) : undefined;
}

function localizedLesson(lesson: CommunityLesson | undefined, locale: Locale) {
  return lesson ? (locale === "sr" ? lesson.titleSr : lesson.titleEn) : undefined;
}

export function useResolvedCommunityScope(filters: CommunityFilters, locale: Locale) {
  const { searchParams, update } = useCommunityQueryParams();
  const requestedScopeKind = searchParams.get("scope");
  const requestedTrackId = searchParams.get("track") ?? undefined;
  const requestedCourseId = searchParams.get("course") ?? undefined;
  const requestedCycleId = searchParams.get("cycle") ?? undefined;
  const requestedLessonId = searchParams.get("lesson") ?? undefined;
  const allCourses = filters.courses.length ? filters.courses : filters.tracks.flatMap((track) => track.courses);
  const requestedCourse = allCourses.find(
    (course) => course._id === requestedCourseId || course.slug === requestedCourseId,
  );
  const selectedTrack =
    filters.tracks.find((track) => track._id === requestedTrackId || track.slug === requestedTrackId) ??
    filters.tracks.find((track) => track._id === requestedCourse?.trackId) ??
    filters.tracks[0];
  const availableCourses = selectedTrack?.courses?.length
    ? selectedTrack.courses
    : filters.courses.filter((course) => !selectedTrack || course.trackId === selectedTrack._id);
  const selectedCourse =
    availableCourses.find((course) => course._id === requestedCourseId) ??
    requestedCourse ??
    availableCourses[0];
  const availableCycles = selectedCourse?.cycles ?? [];
  const requestedLesson = availableCycles
    .flatMap((cycle) => cycle.lessons)
    .find((lesson) => lesson._id === requestedLessonId || lesson.slug === requestedLessonId);
  const selectedCycle =
    availableCycles.find((cycle) => cycle._id === requestedCycleId) ??
    availableCycles.find((cycle) => cycle._id === requestedLesson?.moduleId);
  const availableLessons = selectedCycle?.lessons ?? [];
  const selectedLesson = availableLessons.find(
    (lesson) => lesson._id === requestedLessonId || lesson.slug === requestedLessonId,
  );
  const scopeKind =
    requestedScopeKind === "course" || requestedScopeKind === "track" || requestedScopeKind === "global"
      ? requestedScopeKind
      : requestedCourseId
        ? "course"
        : requestedTrackId
          ? "track"
          : "global";

  const scope = useMemo<CommunityScope>(() => {
    if (scopeKind === "course" && selectedCourse) return { kind: "course", courseId: selectedCourse._id };
    if (scopeKind === "track" && selectedTrack) return { kind: "track", trackId: selectedTrack._id };
    return { kind: "global" };
  }, [scopeKind, selectedCourse, selectedTrack]);

  const setScopeKind = useCallback(
    (kind: CommunityScope["kind"]) => {
      if (kind === "global") {
        update({ scope: "global", track: undefined, course: undefined, cycle: undefined, lesson: undefined });
        return;
      }
      if (kind === "track") {
        update({ scope: "track", track: selectedTrack?._id, course: undefined, cycle: undefined, lesson: undefined });
        return;
      }
      update({ scope: "course", track: selectedTrack?._id, course: selectedCourse?._id, cycle: undefined, lesson: undefined });
    },
    [selectedCourse?._id, selectedTrack?._id, update],
  );

  const setTrack = useCallback(
    (trackId: string) => {
      const track = filters.tracks.find((item) => item._id === trackId);
      update({
        scope: scope.kind === "course" ? "course" : "track",
        track: trackId,
        course: scope.kind === "course" ? track?.courses?.[0]?._id : undefined,
        cycle: undefined,
        lesson: undefined,
      });
    },
    [filters.tracks, scope.kind, update],
  );

  const setCourse = useCallback(
    (courseId: string) => {
      const course = filters.courses.find((item) => item._id === courseId) ?? availableCourses.find((item) => item._id === courseId);
      update({ scope: "course", track: course?.trackId ?? selectedTrack?._id, course: courseId, cycle: undefined, lesson: undefined });
    },
    [availableCourses, filters.courses, selectedTrack?._id, update],
  );

  function setCycle(cycleId: string) {
    update({
      scope: "course",
      track: selectedTrack?._id,
      course: selectedCourse?._id,
      cycle: cycleId || undefined,
      lesson: undefined,
    });
  }

  function setLesson(lessonId: string) {
    const lesson = availableCycles.flatMap((cycle) => cycle.lessons).find((item) => item._id === lessonId);
    update({
      scope: "course",
      track: selectedTrack?._id,
      course: selectedCourse?._id,
      cycle: lesson?.moduleId ?? selectedCycle?._id,
      lesson: lessonId || undefined,
    });
  }

  return {
    scope,
    selectedTrack,
    selectedCourse,
    selectedCycle,
    selectedLesson,
    availableCourses,
    availableCycles,
    availableLessons,
    trackLabel: localizedTrack(selectedTrack, locale),
    courseLabel: localizedCourse(selectedCourse, locale),
    cycleLabel: localizedCycle(selectedCycle, locale),
    lessonLabel: localizedLesson(selectedLesson, locale),
    setScopeKind,
    setTrack,
    setCourse,
    setCycle,
    setLesson,
  };
}

export function CommunityScopeControls({
  locale,
  filters,
  scopeState,
  compact = false,
  layout = "stacked",
  showLearningDepth = true,
  inlineMiddle,
  mode = "all",
  manualOpen,
  setManualOpen,
}: {
  locale: Locale;
  filters: CommunityFilters;
  scopeState: ReturnType<typeof useResolvedCommunityScope>;
  compact?: boolean;
  layout?: "stacked" | "inline";
  showLearningDepth?: boolean;
  inlineMiddle?: ReactNode;
  mode?: "all" | "toggle" | "selects";
  manualOpen?: boolean;
  setManualOpen?: (open: boolean) => void;
}) {
  const [localManualOpen, setLocalManualOpen] = useState(false);
  const isManualOpen = manualOpen !== undefined ? manualOpen : localManualOpen;
  const setIsManualOpen = setManualOpen !== undefined ? setManualOpen : setLocalManualOpen;

  const settingsOpen = isManualOpen || scopeState.scope.kind !== "global";
  const inline = layout === "inline";
  const selectedCourseValue = settingsOpen && scopeState.scope.kind === "course"
    ? scopeState.selectedCourse?._id ?? ""
    : "";

  const isToggle = mode === "all" || mode === "toggle";
  const isSelects = mode === "all" || mode === "selects";

  const selectsContent = settingsOpen ? (
    <div className={cn("grid gap-2 sm:grid-cols-2", inline && "flex items-center") }>
      <label className={cn("block", inline && "w-48 shrink-0")}>
        <span className="sr-only">{locale === "sr" ? "Izaberi smer" : "Choose track"}</span>
        <select
          value={scopeState.selectedTrack?._id ?? ""}
          onChange={(event) => scopeState.setTrack(event.target.value)}
          className="min-h-11 w-full rounded-[12px] border border-line bg-paper-strong px-3 text-sm font-black text-ink outline-none transition hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25"
        >
          {filters.tracks.map((track) => (
            <option key={track._id} value={track._id}>
              {locale === "sr" ? track.titleSr : track.titleEn}
            </option>
          ))}
        </select>
      </label>
      <label className={cn("block", inline && "w-52 shrink-0")}>
        <span className="sr-only">{locale === "sr" ? "Izaberi kurs" : "Choose course"}</span>
        <select
          value={selectedCourseValue}
          onChange={(event) => {
            if (event.target.value) scopeState.setCourse(event.target.value);
            else scopeState.setScopeKind("track");
          }}
          className="min-h-11 w-full rounded-[12px] border border-line bg-paper-strong px-3 text-sm font-black text-ink outline-none transition hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25"
        >
          <option value="">{locale === "sr" ? "Svi kursevi u smeru" : "All courses in track"}</option>
          {scopeState.availableCourses.map((course) => (
            <option key={course._id} value={course._id}>
              {locale === "sr" ? course.titleSr : course.titleEn}
            </option>
          ))}
        </select>
      </label>
      {showLearningDepth ? <label className={cn("block", inline && "w-48 shrink-0")}>
        <span className="sr-only">{locale === "sr" ? "Izaberi ciklus" : "Choose cycle"}</span>
        <select
          value={scopeState.selectedCycle?._id ?? ""}
          onChange={(event) => scopeState.setCycle(event.target.value)}
          disabled={!selectedCourseValue || scopeState.availableCycles.length === 0}
          className="min-h-11 w-full rounded-[12px] border border-line bg-paper-strong px-3 text-sm font-black text-ink outline-none transition hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25 disabled:cursor-not-allowed disabled:bg-[#eef3f7] dark:disabled:bg-ink/10 disabled:text-muted"
        >
          <option value="">{locale === "sr" ? "Svi ciklusi" : "All cycles"}</option>
          {scopeState.availableCycles.map((cycle) => (
            <option key={cycle._id} value={cycle._id}>
              {locale === "sr" ? cycle.titleSr : cycle.titleEn}
            </option>
          ))}
        </select>
      </label> : null}
      {showLearningDepth ? <label className={cn("block", inline && "w-56 shrink-0")}>
        <span className="sr-only">{locale === "sr" ? "Izaberi lekciju" : "Choose lesson"}</span>
        <select
          value={scopeState.selectedLesson?._id ?? ""}
          onChange={(event) => scopeState.setLesson(event.target.value)}
          disabled={!scopeState.selectedCycle || scopeState.availableLessons.length === 0}
          className="min-h-11 w-full rounded-[12px] border border-line bg-paper-strong px-3 text-sm font-black text-ink outline-none transition hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25 disabled:cursor-not-allowed disabled:bg-[#eef3f7] dark:disabled:bg-ink/10 disabled:text-muted"
        >
          <option value="">{locale === "sr" ? "Sve lekcije" : "All lessons"}</option>
          {scopeState.availableLessons.map((lesson) => (
            <option key={lesson._id} value={lesson._id}>
              {locale === "sr" ? lesson.titleSr : lesson.titleEn}
            </option>
          ))}
        </select>
      </label> : null}
    </div>
  ) : null;

  if (mode === "selects") {
    return selectsContent;
  }

  return (
    <div className={cn(inline ? "flex min-w-max items-center gap-2" : "space-y-3", compact && !inline && "space-y-2")}>
      {isToggle && (
        <div
          className={cn("relative grid shrink-0 grid-cols-2 gap-1 rounded-full border border-line bg-[#eef3f7] dark:bg-ink/10 p-1", compact && "w-[280px] max-w-full")}
          role="group"
          aria-label={locale === "sr" ? "Prikaz zajednice" : "Community view"}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded-full bg-ink shadow-[2px_2px_0_rgba(244,190,48,0.65)] transition-transform duration-300 ease-out motion-reduce:transition-none",
              settingsOpen && "translate-x-[calc(100%+0.5rem)]",
            )}
          />
          <button
            type="button"
            onClick={() => {
              setIsManualOpen(false);
              scopeState.setScopeKind("global");
            }}
            aria-pressed={!settingsOpen}
            className={cn(
              "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-3 text-xs font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
              compact ? "min-h-9" : "min-h-10",
              !settingsOpen ? "text-paper-strong" : "text-ink/65 hover:text-ink",
            )}
          >
            <Compass className="size-3.5" aria-hidden="true" />
            {locale === "sr" ? "Globalno" : "Global"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsManualOpen(true);
              if (!settingsOpen) scopeState.setScopeKind("track");
            }}
            aria-pressed={settingsOpen}
            className={cn(
              "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-3 text-xs font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
              compact ? "min-h-9" : "min-h-10",
              settingsOpen ? "text-paper-strong" : "text-ink/65 hover:text-ink",
            )}
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            {locale === "sr" ? "Podešavanja" : "Settings"}
          </button>
        </div>
      )}

      {inline && isToggle ? inlineMiddle : null}

      {isSelects ? selectsContent : null}
    </div>
  );
}
