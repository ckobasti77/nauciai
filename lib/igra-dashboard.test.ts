import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DASHBOARD_OVERVIEW_FIXTURES, IGRA_FIXTURE_IDS, IGRA_FIXTURE_TODAY, IGRA_FIXTURES } from "./igra-fixtures";
import { inkCalendarView } from "./igra-calendar";
import { pickDailyMission } from "./igra-mission";

/**
 * Kontrolna tabla (K08): test korisnici kroz ista pravila kao prava tabla, plus provere nad
 * izvorom - jedna prioritetna slika, 3D samo lenjo, prezentacioni delovi bez upita, a IGRA
 * kod table ne ulazi u fajl koji se učitava na svakoj ruti aplikacije.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = `${dir}/${entry}`;
    if (statSync(join(ROOT, path)).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** Misija dana onako kako je sklapa `DashboardHome` iz agregata i napretka. */
function missionFor(id: (typeof IGRA_FIXTURE_IDS)[number], todayDone = IGRA_FIXTURES[id].streak.todayDone) {
  const overview = DASHBOARD_OVERVIEW_FIXTURES[id];
  const firstWork = IGRA_FIXTURES[id].badges.find((badge) => badge.key === "prvi-rad");
  return pickDailyMission(
    {
      hasUnlockedCourse: overview.firstRun.hasUnlockedCourse,
      resume: overview.resume,
      completedLessons: overview.progress.completedLessons,
      hasCommunityPost: overview.firstRun.hasCommunityPost,
      hasCreaWork: overview.studio.items.length > 0 || firstWork?.state === "unlocked" || firstWork?.state === "fresh",
      todayDone,
    },
    "sr",
  );
}

describe("test korisnici na tabli", () => {
  it("agregat i napredak istog korisnika se slažu", () => {
    expect(Object.keys(DASHBOARD_OVERVIEW_FIXTURES)).toEqual([...IGRA_FIXTURE_IDS]);
    for (const id of IGRA_FIXTURE_IDS) {
      const overview = DASHBOARD_OVERVIEW_FIXTURES[id];
      const progress = IGRA_FIXTURES[id];
      expect(overview.leaderboard?.rank ?? null, id).toBe(progress.weekRank);
      expect(overview.leaderboard?.points ?? 0, id).toBe(progress.weekXp);
      expect(overview.progress.completedLessons, id).toBeLessThanOrEqual(overview.progress.totalLessons);
      expect(overview.activity.map((day) => day.day), id).toEqual([...overview.activity.map((day) => day.day)].sort());
      expect(new Set(overview.activity.map((day) => day.day)).size, id).toBe(overview.activity.length);
      expect(overview.activity.every((day) => day.day <= IGRA_FIXTURE_TODAY && day.completed > 0), id).toBe(true);
    }
  });

  it("novi korisnik: misija vodi na prvi kurs, kalendar je prazan", () => {
    expect(missionFor("novi")?.kind).toBe("course");
    expect(inkCalendarView({ activity: DASHBOARD_OVERVIEW_FIXTURES.novi.activity, todayKey: IGRA_FIXTURE_TODAY }, "sr").activeDays).toBe(0);
  });

  it("aktivan: lekcija koja čeka je misija; kad je dan upisan, nudi se još jedna", () => {
    expect(missionFor("aktivan", false)).toMatchObject({ kind: "lesson", ring: { position: 4, total: 9 } });
    expect(missionFor("aktivan")?.kind).toBe("lesson-more");
  });

  it("aktivan: dani niza i dani sa lekcijama su isti dani", () => {
    const { activity } = DASHBOARD_OVERVIEW_FIXTURES.aktivan;
    const lessonDays = new Set(activity.map((day) => day.day));
    const streakDays = IGRA_FIXTURES.aktivan.streak.recent.filter((day) => day.state === "active").map((day) => day.dayKey);
    expect(streakDays.length).toBeGreaterThan(0);
    for (const day of streakDays) expect(lessonDays.has(day), day).toBe(true);
    const view = inkCalendarView({ activity, recent: IGRA_FIXTURES.aktivan.streak.recent, todayKey: IGRA_FIXTURE_TODAY }, "sr");
    expect(view.activeDays).toBe(activity.length);
  });

  it("legenda: sve je urađeno, pa je misija mirno stanje", () => {
    expect(missionFor("legenda")).toBeNull();
    expect(DASHBOARD_OVERVIEW_FIXTURES.legenda.progress.percent).toBe(100);
  });
});

describe("tabla (izvor)", () => {
  const PRESENTATIONAL = [
    ...sources("components/igra/dashboard"),
    "components/igra/igra-hero.tsx",
    "components/igra/ink-calendar.tsx",
    "components/igra/progress-ring.tsx",
  ];

  it("delovi table su prezentacioni: bez upita, mutacija i test podataka", () => {
    expect(PRESENTATIONAL.length).toBeGreaterThanOrEqual(6);
    for (const file of PRESENTATIONAL) {
      const source = read(file);
      expect(source, file).not.toMatch(/from "convex\/react"|_generated\/api|useQuery|useMutation|igra-fixtures/);
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

  it("jedina prioritetna slika table je scena heroja", () => {
    const withPriority = ["components/app/dashboard-home.tsx", "components/app/dashboard-windows.tsx", ...PRESENTATIONAL].filter((file) =>
      /<IgraArt\b[^>]*\bpriority\b/.test(read(file)),
    );
    expect(withPriority).toEqual(["components/igra/igra-hero.tsx"]);
    expect(read("components/igra/igra-hero.tsx").match(/\bpriority\b/g)).toHaveLength(2); // komentar + prop
  });

  it("3D maskota stiže samo kroz next/dynamic bez SSR-a, i samo na heroju table", () => {
    const hero = read("components/igra/dashboard/dashboard-hero.tsx");
    expect(hero).toMatch(/dynamic\(\(\) => import\("@\/components\/igra\/dashboard\/dashboard-mascot"\)[^\n]*\{ ssr: false \}\)/);
    const importers = [...sources("app"), ...sources("components")].filter((file) => read(file).includes("igra/dashboard/dashboard-mascot"));
    expect(importers).toEqual(["components/igra/dashboard/dashboard-hero.tsx"]);
    // Uslovi: širok ekran sa mišem, dozvoljen pokret, bez štednje podataka, tek kad pregledač miruje.
    const mascot = read("components/igra/dashboard/dashboard-mascot.tsx");
    for (const needle of ["IGRA_THREE_MEDIA", "useReducedMotion", "saveData", "requestIdleCallback"]) expect(mascot, needle).toContain(needle);
  });

  it("tabla ne pravi svoj upit za napredak: čita ga iz ljuske", () => {
    const home = read("components/app/dashboard-home.tsx");
    expect(home).toContain("useIgraProgress()");
    expect(home).not.toContain("getMyProgress");
    expect(home.match(/useQuery\(/g)).toHaveLength(1);
    // Sama tabla je prezentaciona; jedini upit je u tankom sloju `LiveDashboardHome`.
    const presentational = home.slice(home.indexOf("export function DashboardHome("), home.indexOf("export function LiveDashboardHome("));
    expect(presentational).not.toMatch(/useQuery\(|useMutation\(/);
  });

  it("IGRA kod table ne ulazi u fajl koji se učitava na svakoj ruti aplikacije", () => {
    // `dashboard-content.tsx` uvoze kartice kurseva (učionica, kurs, admin). Kostur table iz
    // `app/[locale]/app/loading.tsx` (važi za svaku rutu) je od K28 u svom, serverskom fajlu.
    const loading = read("app/[locale]/app/loading.tsx");
    expect(loading).toContain("@/components/app/dashboard-home-skeleton");
    expect(loading).not.toContain("@/components/app/dashboard-content");
    const skeleton = read("components/app/dashboard-home-skeleton.tsx");
    expect(skeleton).not.toContain('"use client"');
    expect(skeleton).not.toMatch(/^import /m);
    const shared = read("components/app/dashboard-content.tsx");
    expect(shared).not.toMatch(/from "@\/components\/igra\/|from "@\/lib\/igra-|from "@\/components\/app\/dashboard-home"/);
    expect(shared).not.toMatch(/^import \{[^}]*\} from "@\/components\/app\/dashboard-windows"/m);
    // Stranica kursa i učionica ne smeju da povuku tablu.
    for (const file of ["components/app/dashboard.tsx", "components/app/dashboard-live.tsx", "components/app/classroom-hub.tsx"]) {
      expect(read(file), file).not.toMatch(/from "@\/components\/app\/dashboard-home"/);
    }
  });

  it("doba dana računa server i šalje ga kao prop", () => {
    const page = read("app/[locale]/app/page.tsx");
    expect(page).toContain("igraDaypartNow()");
    expect(page).not.toContain('"use client"');
    expect(page.match(/daypart=\{daypart\}/g)).toHaveLength(2);
  });
});
