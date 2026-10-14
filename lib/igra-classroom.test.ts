import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { IGRA_CLASSROOM_COPY } from "./igra-copy";
import { courseCardState, courseLik } from "./igra-course-art";
import { CLASSROOM_FIXTURES, CLASSROOM_TRACK_FIXTURES, DASHBOARD_OVERVIEW_FIXTURES, IGRA_FIXTURE_IDS } from "./igra-fixtures";
import { nextLessonAfter } from "./igra-lesson";

/**
 * Učionica (K09): test korisnici kroz ista pravila kao kartice i plejer, plus provere nad
 * izvorom - delovi su prezentacioni, „+N XP" se meri, a kraj kursa slavi samo ljuska.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const counts = (course: (typeof CLASSROOM_FIXTURES)["aktivan"][number]) => ({
  completedLessons: course.lessons.filter((lesson) => lesson.progress?.completed).length,
  totalLessons: course.lessons.length,
});

describe("test korisnici u učionici", () => {
  it("isti katalog za sva tri korisnika, svaki kurs u svom smeru", () => {
    expect(Object.keys(CLASSROOM_FIXTURES)).toEqual([...IGRA_FIXTURE_IDS]);
    const slugs = CLASSROOM_FIXTURES.aktivan.map((course) => course.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const id of IGRA_FIXTURE_IDS) {
      expect(CLASSROOM_FIXTURES[id].map((course) => course.slug), id).toEqual(slugs);
      for (const course of CLASSROOM_FIXTURES[id]) {
        expect(CLASSROOM_TRACK_FIXTURES[course.trackId ?? ""], course.slug).toBeDefined();
        expect(course.lessons.length, course.slug).toBeGreaterThan(0);
      }
    }
  });

  it("katalog pokazuje svih pet likova po temi, i uz slug smera", () => {
    const liks = CLASSROOM_FIXTURES.aktivan.map((course) => [
      course.slug,
      courseLik({ slug: course.slug, trackSlug: CLASSROOM_TRACK_FIXTURES[course.trackId ?? ""]?.slug, title: course.title }),
    ]);
    expect(liks).toEqual([
      ["promptovi-koji-rade", "sova"],
      ["ai-za-svaki-dan", "sova"],
      ["prvi-koraci-sa-ai", "sova"],
      ["vibe-coding", "bajt"],
      ["video-audio-ai", "kadar"],
      ["glas-i-muzika-uz-ai", "eho"],
      ["ai-slike-za-pocetnike", "piksi"],
    ]);
  });

  it("novi: ništa otključano; legenda: sve otključano i završeno", () => {
    expect(CLASSROOM_FIXTURES.novi.every((course) => course.owned === false)).toBe(true);
    expect(CLASSROOM_FIXTURES.legenda.every((course) => course.owned === true && courseCardState(counts(course)) === "done")).toBe(true);
  });

  it("aktivan: sva tri stanja kartice i isti brojevi kao na tabli", () => {
    const owned = CLASSROOM_FIXTURES.aktivan.filter((course) => course.owned);
    expect(owned.map((course) => [course.slug, courseCardState(counts(course))])).toEqual([
      ["promptovi-koji-rade", "progress"],
      ["ai-za-svaki-dan", "progress"],
      ["prvi-koraci-sa-ai", "done"],
      ["vibe-coding", "new"],
    ]);
    expect(CLASSROOM_FIXTURES.aktivan.filter((course) => !course.owned)).toHaveLength(3);

    const { progress, resume } = DASHBOARD_OVERVIEW_FIXTURES.aktivan;
    expect(owned.reduce((sum, course) => sum + counts(course).completedLessons, 0)).toBe(progress.completedLessons);
    expect(owned.reduce((sum, course) => sum + counts(course).totalLessons, 0)).toBe(progress.totalLessons);

    // Lekcija koju tabla nudi za nastavak je prva nezavršena u istom kursu.
    const course = owned.find((item) => item.slug === resume?.courseSlug);
    const next = course?.lessons.find((lesson) => !lesson.progress?.completed);
    expect(next?.slug).toBe(resume?.lessonSlug);
    expect(course?.lessons.indexOf(next!)).toBe((resume?.position ?? 0) - 1);
  });

  it("aktivan: posle lekcije koja čeka sledi naredna, a kurs još nije gotov", () => {
    const course = CLASSROOM_FIXTURES.aktivan.find((item) => item.slug === "promptovi-koji-rade")!;
    const lessons = course.lessons.map((lesson) => ({ slug: lesson.slug, title: lesson.title, completed: Boolean(lesson.progress?.completed) }));
    expect(nextLessonAfter(lessons, "uloge-i-kontekst")).toMatchObject({ lesson: { slug: "primeri-u-promptu" }, courseDone: false });
  });
});

describe("tekstovi učionice", () => {
  it("svaki ima oba jezika i nijedan ne preti ni ne obećava nagradu", () => {
    for (const [key, text] of Object.entries(IGRA_CLASSROOM_COPY)) {
      expect(text.sr.trim(), key).not.toBe("");
      expect(text.en.trim(), key).not.toBe("");
      expect(`${text.sr} ${text.en}`, key).not.toMatch(/izgubi|propust|požuri|poslednja šansa|kredit|popust|nagrad|hurry|lose|miss out|reward|discount|credit/i);
    }
  });
});

describe("učionica (izvor)", () => {
  const PRESENTATIONAL = ["components/igra/lesson-steps-bar.tsx", "components/igra/lesson-done.tsx", "components/app/dashboard-course-card.tsx"];

  it("novi delovi su prezentacioni: bez upita, mutacija i test podataka", () => {
    for (const file of [...PRESENTATIONAL, "components/igra/motion/use-xp-gain.ts"]) {
      expect(read(file), file).not.toMatch(/from "convex\/react"|_generated\/api|useQuery|useMutation|igra-fixtures/);
    }
  });

  it("slike idu samo kroz IgraArt; nema forsiranog radijusa ni golog hex-a", () => {
    for (const file of PRESENTATIONAL) {
      const source = read(file);
      expect(source, file).not.toMatch(/<img\b|\/brand\/igra\//);
      expect(source, file).not.toMatch(/rounded-[\w[\]./-]+!|!rounded-|borderRadius/);
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("obe kartice kursa nose lik po temi; učionica ima jednu veliku ilustraciju", () => {
    for (const file of ["components/app/dashboard-course-card.tsx", "components/app/course-catalog-card.tsx"]) {
      expect(read(file), file).toMatch(/<IgraLik lik=\{courseLik\(/);
    }
    const hub = read("components/app/classroom-hub.tsx");
    expect(hub.match(/data-igra-hero/g)).toHaveLength(2); // komentar + atribut
    expect(hub).not.toMatch(/<IgraArt\b[^>]*\bpriority\b/);
  });

  it("kostur učionice ne vuče hub: `loading.tsx` važi i za kurs, lekciju i smer", () => {
    const loading = read("app/[locale]/app/classroom/loading.tsx");
    expect(loading).toContain('from "@/components/app/classroom-hub-skeleton"');
    expect(loading).not.toMatch(/from "@\/components\/app\/classroom-hub"/);
    const skeleton = read("components/app/classroom-hub-skeleton.tsx");
    expect(skeleton).not.toContain('"use client"');
    expect(skeleton.match(/^import .*$/gm)).toEqual([
      'import { cn } from "@/components/ui/primitives";',
      'import { nextLevel, surfaceClass, type SurfaceLevel } from "@/lib/surface";',
    ]);
  });

  it("„+N XP” se meri iz napretka ljuske, ne upisuje u kod", () => {
    const hook = read("components/igra/motion/use-xp-gain.ts");
    expect(hook).toContain("useIgraProgress()");
    expect(hook).toContain("xpGain(");
    for (const file of ["components/igra/lesson-done.tsx", "components/igra/motion/use-xp-gain.ts", "components/app/course-player.tsx", "components/app/course-lab.tsx"]) {
      expect(read(file), file).not.toMatch(/LEADERBOARD_XP|leaderboardCore/);
    }
  });

  it("plejer i Pro prikaz mere XP pre mutacije i crtaju isti mali kraj", () => {
    for (const file of ["components/app/course-player.tsx", "components/app/course-lab.tsx"]) {
      const source = read(file);
      expect(source, file).toContain("<LessonDone");
      expect(source, file).toContain("<LessonStepsBar");
      const start = source.indexOf("xpGain.start();");
      expect(start, file).toBeGreaterThan(-1);
      expect(source.indexOf("completed: true, positionSeconds: 0", start), file).toBeGreaterThan(start);
    }
    expect(read("app/[locale]/app/classroom/courses/[courseSlug]/lessons/[lessonSlug]/page.tsx")).toContain(
      "initialCompleted={Boolean(liveLesson?.progress?.completed)}",
    );
  });

  it("kraj kursa slavi samo ljuska: učionica ne montira svoje slavlje ni konfete", () => {
    for (const file of [
      "components/app/course-player.tsx",
      "components/app/course-lab.tsx",
      "components/app/classroom-hub.tsx",
      "components/app/dashboard-course-card.tsx",
      "components/app/dashboard-content.tsx",
      "components/igra/lesson-done.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/CelebrationHost|celebration-card|fire-confetti|playIgraSfx|markSeen/);
    }
    expect(read("lib/igra-celebrations.ts")).toMatch(/case "course":[\s\S]*?hero: "scena\.kurs-zavrsen"[\s\S]*?big: true/);
  });

  it("logika napretka nije dirana: plejer i dalje zove samo `courses.markProgress`", () => {
    expect(read("components/app/course-player.tsx").match(/useMutation\(api\.courses\.markProgress\)/g)).toHaveLength(1);
    expect(read("components/app/course-lab.tsx").match(/useMutation\(api\.courses\.markProgress\)/g)).toHaveLength(1);
  });
});
