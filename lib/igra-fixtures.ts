import type { FunctionReturnType } from "convex/server";

import type { api } from "../convex/_generated/api";
import { computeStreak, shiftDayKey, type StreakDay } from "./crea-streak";
import type { IgraLik, IgraPoza } from "./igra-art";
import { EMPTY_BADGE_COUNTERS, evaluateBadges, type IgraBadgeCounters, type IgraBadgeKey } from "./igra-badges";
import { levelFromXp } from "./igra-level";
import type { LocalizedText } from "./i18n";

/**
 * Test podaci za izlog (`/igra-izlog`, K05): tri korisnika u obliku koji vraća
 * `igra:getMyProgress`, pa promena oblika upita lomi typecheck ovde. Nivo, niz i stanja
 * bedževa računaju ISTE čiste funkcije kao server (`levelFromXp`, `computeStreak`,
 * `evaluateBadges`), da izlog ne može da pokaže stanje koje pravi korisnik ne može da ima.
 *
 * Samo za izlog i testove - nijedna površina aplikacije ovo ne uvozi.
 */

export type IgraProgressFixture = NonNullable<FunctionReturnType<typeof api.igra.getMyProgress>>;

export const IGRA_FIXTURE_IDS = ["novi", "aktivan", "legenda"] as const;
export type IgraFixtureId = (typeof IGRA_FIXTURE_IDS)[number];

export const IGRA_FIXTURE_LABEL: Record<IgraFixtureId, LocalizedText> = {
  novi: { sr: "Novi korisnik", en: "New user" },
  aktivan: { sr: "Aktivan", en: "Active" },
  legenda: { sr: "Legenda", en: "Legend" },
};

/** „Danas" svih test podataka (beogradski dan) i trenutak u tom danu. */
export const IGRA_FIXTURE_TODAY = "2026-10-14";
const NOW = Date.UTC(2026, 9, 14, 7, 30);
const DAY_MS = 86_400_000;

/** Aktivni dani: `from`..`to` dana unazad od „danas" (0 = danas), sa lekcijom svakog dana. */
function activeDays(from: number, to: number): StreakDay[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ dayKey: shiftDayKey(IGRA_FIXTURE_TODAY, -(from + i)), lessons: 1 }));
}

function buildProgress(input: {
  username: string;
  xp: number;
  weekXp: number;
  weekRank: number | null;
  days: StreakDay[];
  counters: Partial<IgraBadgeCounters>;
  /** Pre koliko dana je bedž viđen (u dnevniku). Zarađen bedž kog ovde nema je „nov". */
  seenDaysAgo: Partial<Record<IgraBadgeKey, number>>;
  freshLevel?: boolean;
  freshCourses?: IgraProgressFixture["fresh"]["courses"];
}): IgraProgressFixture {
  const streak = computeStreak(input.days, IGRA_FIXTURE_TODAY);
  const level = levelFromXp(input.xp);
  const badges: IgraProgressFixture["badges"] = evaluateBadges({ ...EMPTY_BADGE_COUNTERS, ...input.counters, bestStreak: streak.best }).map((result) => {
    const seen = input.seenDaysAgo[result.key];
    if (result.earned && seen !== undefined) return { key: result.key, state: "unlocked", unlockedAt: NOW - seen * DAY_MS, progress: null };
    if (result.earned) return { key: result.key, state: "fresh", unlockedAt: null, progress: null };
    if (result.soon) return { key: result.key, state: "soon", unlockedAt: null, progress: null };
    return { key: result.key, state: "locked", unlockedAt: null, progress: result.progress };
  });

  return {
    xp: input.xp,
    weekXp: input.weekXp,
    weekRank: input.weekRank,
    level,
    streak,
    badges,
    fresh: {
      level: input.freshLevel && level.level >= 2 ? level.level : null,
      badges: badges.filter((badge) => badge.state === "fresh").map((badge) => badge.key),
      courses: input.freshCourses ?? [],
      ledgerEmpty: Object.keys(input.seenDaysAgo).length === 0,
    },
    banner: null,
    eligible: true,
    username: input.username,
  };
}

export const IGRA_FIXTURES: Record<IgraFixtureId, IgraProgressFixture> = {
  // Tek registrovan: nema XP-a, niza ni bedževa; sve je poziv na prvi korak.
  novi: buildProgress({ username: "tamara.ilic", xp: 0, weekXp: 0, weekRank: null, days: [], counters: {}, seenDaysAgo: {} }),

  // Treća nedelja redovnog rada: nivo 5, niz od 6 dana, dva bedža tek zarađena.
  aktivan: buildProgress({
    username: "nikola.stanic",
    xp: 1890,
    weekXp: 435,
    weekRank: 7,
    // Šest dana zaredom do danas; pre toga dva propuštena (jedno zamrzavanje ne spasava niz)
    // i devet dana zaredom, pa je najduži niz 9.
    days: [...activeDays(0, 5), ...activeDays(8, 16)],
    counters: {
      completedLessons: 14,
      completedTasks: 5,
      helpfulAnswers: 2,
      completedCourses: 1,
      nightLessons: 2,
      creaWorks: 12,
      creaAreas: ["slika", "video"],
      recipeWorks: 1,
      techniques: 4,
      threads: 3,
      bestThreadUpvotes: 6,
      weeklyTop10: true,
    },
    seenDaysAgo: {
      "prva-lekcija": 19,
      "prvi-zadatak": 18,
      "pet-lekcija": 15,
      "prvi-kurs": 4,
      "nocna-sova": 11,
      "prvi-rad": 17,
      "deset-radova": 3,
      "prvi-video": 9,
      recept: 6,
      tehnika: 16,
      "prva-objava": 12,
      "koristan-odgovor": 5,
      "niz-3": 14,
    },
  }),

  // Višemesečni rad: nivo 12, sve osvojeno i viđeno, prvo mesto ove nedelje.
  legenda: buildProgress({
    username: "vesna.radovic",
    xp: 23480,
    weekXp: 1310,
    weekRank: 1,
    days: activeDays(0, 63),
    counters: {
      completedLessons: 148,
      completedTasks: 61,
      helpfulAnswers: 37,
      completedCourses: 9,
      completedTracks: 2,
      nightLessons: 12,
      earlyLessons: 5,
      creaWorks: 240,
      creaAreas: ["slika", "video", "zvuk"],
      recipeWorks: 1,
      techniques: 10,
      challenges: 4,
      challengesOpen: true,
      threads: 18,
      bestThreadUpvotes: 31,
      studyPartners: 1,
      weeklyTop10: true,
    },
    seenDaysAgo: {
      "prva-lekcija": 212,
      "prvi-zadatak": 211,
      "pet-lekcija": 205,
      "prvi-kurs": 190,
      "tri-kursa": 141,
      staza: 96,
      "nocna-sova": 187,
      "rani-pevac": 122,
      "prvi-rad": 209,
      "deset-radova": 198,
      "sto-radova": 77,
      "prvi-video": 201,
      "prvi-zvuk": 179,
      recept: 166,
      tehnika: 208,
      izazov: 58,
      "prva-objava": 203,
      "koristan-odgovor": 195,
      omiljen: 133,
      mentor: 150,
      "niz-3": 207,
      "niz-7": 200,
      "niz-30": 34,
      "top-10": 172,
    },
  }),
};

/** „Misija dana" po korisniku: `path` je kanonska putanja (izlog je provlači kroz `withLocale`). */
export type IgraMissionFixture = { title: LocalizedText; body: LocalizedText; cta: LocalizedText; path: string; lik: IgraLik; poza: IgraPoza };

export const IGRA_MISSION_FIXTURES: Record<IgraFixtureId, IgraMissionFixture> = {
  novi: {
    title: { sr: "Započni prvu lekciju", en: "Start your first lesson" },
    body: { sr: "Deset minuta je dovoljno. Robi te vodi korak po korak.", en: "Ten minutes is enough. Robi walks you through it step by step." },
    cta: { sr: "Otvori učionicu", en: "Open the classroom" },
    path: "/app/classroom",
    lik: "robi",
    poza: "mase",
  },
  aktivan: {
    title: { sr: "Nastavi: Promptovi koji rade", en: "Continue: Prompts that work" },
    body: { sr: "Čeka te lekcija 4 od 9. Traje oko osam minuta.", en: "Lesson 4 of 9 is waiting. It takes about eight minutes." },
    cta: { sr: "Nastavi lekciju", en: "Continue the lesson" },
    path: "/app/classroom",
    lik: "sova",
    poza: "misli",
  },
  legenda: {
    title: { sr: "Pomozi nekome u zajednici", en: "Help someone in the community" },
    body: { sr: "Dva nova pitanja čekaju odgovor. Tvoje iskustvo nekome štedi sate.", en: "Two new questions are waiting. Your experience saves someone hours." },
    cta: { sr: "Otvori zajednicu", en: "Open the community" },
    path: "/app/community",
    lik: "iskra",
    poza: "mase",
  },
};
