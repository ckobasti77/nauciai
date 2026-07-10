"use client";

import { BookOpen, Compass, GraduationCap } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";

import type { CommunityCourse, CommunityFilters, CommunityScope, CommunityTrack } from "./community-types";

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

export function useResolvedCommunityScope(filters: CommunityFilters, locale: Locale) {
  const { searchParams, update } = useCommunityQueryParams();
  const requestedScopeKind = searchParams.get("scope");
  const requestedTrackId = searchParams.get("track") ?? undefined;
  const requestedCourseId = searchParams.get("course") ?? undefined;
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
        update({ scope: "global", track: undefined, course: undefined });
        return;
      }
      if (kind === "track") {
        update({ scope: "track", track: selectedTrack?._id, course: undefined });
        return;
      }
      update({ scope: "course", track: selectedTrack?._id, course: selectedCourse?._id });
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
      });
    },
    [filters.tracks, scope.kind, update],
  );

  const setCourse = useCallback(
    (courseId: string) => {
      const course = filters.courses.find((item) => item._id === courseId) ?? availableCourses.find((item) => item._id === courseId);
      update({ scope: "course", track: course?.trackId ?? selectedTrack?._id, course: courseId });
    },
    [availableCourses, filters.courses, selectedTrack?._id, update],
  );

  return {
    scope,
    selectedTrack,
    selectedCourse,
    availableCourses,
    trackLabel: localizedTrack(selectedTrack, locale),
    courseLabel: localizedCourse(selectedCourse, locale),
    setScopeKind,
    setTrack,
    setCourse,
  };
}

export function CommunityScopeControls({
  locale,
  filters,
  scopeState,
  compact = false,
}: {
  locale: Locale;
  filters: CommunityFilters;
  scopeState: ReturnType<typeof useResolvedCommunityScope>;
  compact?: boolean;
}) {
  const options = [
    { kind: "global" as const, labelSr: "Globalno", labelEn: "Global", icon: Compass },
    { kind: "track" as const, labelSr: "Smer", labelEn: "Track", icon: GraduationCap },
    { kind: "course" as const, labelSr: "Kurs", labelEn: "Course", icon: BookOpen },
  ];

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <div className="flex gap-1 rounded-full border border-line bg-[#eef3f7] p-1" role="group" aria-label={locale === "sr" ? "Opseg zajednice" : "Community scope"}>
        {options.map(({ kind, labelSr, labelEn, icon: Icon }) => {
          const active = scopeState.scope.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => scopeState.setScopeKind(kind)}
              aria-pressed={active}
              className={cn(
                "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-black transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
                active ? "bg-ink text-white shadow-sm" : "text-ink/65 hover:bg-white hover:text-ink",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {locale === "sr" ? labelSr : labelEn}
            </button>
          );
        })}
      </div>

      {scopeState.scope.kind !== "global" ? (
        <div className={cn("grid gap-2", scopeState.scope.kind === "course" && "sm:grid-cols-2")}>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-muted">
              {locale === "sr" ? "Smer" : "Track"}
            </span>
            <select
              value={scopeState.selectedTrack?._id ?? ""}
              onChange={(event) => scopeState.setTrack(event.target.value)}
              className="min-h-11 w-full rounded-[12px] border border-line bg-white px-3 text-sm font-black text-ink outline-none transition hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25"
            >
              {filters.tracks.map((track) => (
                <option key={track._id} value={track._id}>
                  {locale === "sr" ? track.titleSr : track.titleEn}
                </option>
              ))}
            </select>
          </label>
          {scopeState.scope.kind === "course" ? (
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                {locale === "sr" ? "Kurs" : "Course"}
              </span>
              <select
                value={scopeState.selectedCourse?._id ?? ""}
                onChange={(event) => scopeState.setCourse(event.target.value)}
                className="min-h-11 w-full rounded-[12px] border border-line bg-white px-3 text-sm font-black text-ink outline-none transition hover:border-ink/55 focus:border-ink focus:ring-4 focus:ring-yellow/25"
              >
                {scopeState.availableCourses.map((course) => (
                  <option key={course._id} value={course._id}>
                    {locale === "sr" ? course.titleSr : course.titleEn}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
