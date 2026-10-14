import type { FunctionReturnType } from "convex/server";

import type { api } from "../convex/_generated/api";
import type { CommunityMemberRow, CommunityMentionEvent, CommunityPostRow, LeaderboardRow } from "../components/app/community-v2/community-types";
import type { DashboardCourse } from "../components/app/dashboard-content";
import type { StudioTileJob } from "../components/app/studio-media-tile";
import type { Id } from "../convex/_generated/dataModel";
import { courses as staticCourses } from "./content";
import type { CatalogTrackMeta } from "./course-catalog";
import { CREA_ALBUM_PAGES, CREA_ALBUM_STICKER_COUNT } from "./crea-album";
import { challengeForDay } from "./crea-challenges";
import { buildReportCard, type ReportCard } from "./crea-report-card";
import { computeStreak, shiftDayKey, type StreakDay } from "./crea-streak";
import { EMPTY_BADGE_COUNTERS, evaluateBadges, isBadgePublic, type IgraBadgeCounters, type IgraBadgeKey } from "./igra-badges";
import type { IgraBannerKey } from "./igra-banners";
import { levelFromXp } from "./igra-level";
import type { ProfileActivityDay } from "./igra-profile";
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
  /** Izabrani baner profila (K13); bez njega podrazumevani. */
  banner?: IgraBannerKey;
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
    banner: input.banner ?? null,
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
    banner: "studio",
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
    banner: "okean",
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

/**
 * Kontrolna tabla (K08): odgovor `dashboard:getDashboardOverview` za ista tri korisnika.
 * Promena oblika agregata lomi typecheck ovde. `activity` je po danu, unazad od „danas".
 */
export type DashboardOverviewFixture = NonNullable<FunctionReturnType<typeof api.dashboard.getDashboardOverview>>;

const AT = (daysAgo: number) => NOW - daysAgo * DAY_MS;

/** Završene lekcije po danu: `[pre koliko dana, koliko lekcija]`. */
function lessonDays(entries: ReadonlyArray<readonly [number, number]>): DashboardOverviewFixture["activity"] {
  return entries
    .map(([daysAgo, completed]) => ({ day: shiftDayKey(IGRA_FIXTURE_TODAY, -daysAgo), completed }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

const EMPTY_OVERVIEW: DashboardOverviewFixture = {
  resume: null,
  progress: { completedLessons: 0, totalLessons: 0, percent: 0 },
  nextLessons: [],
  activity: [],
  messages: { unreadTotal: 0, items: [] },
  community: { unreadNotifications: 0, items: [] },
  notifications: { total: 0, items: [] },
  studio: { creditsBalance: 0, items: [] },
  study: { pendingInvites: 0, partners: 0 },
  leaderboard: null,
  firstRun: { hasUnlockedCourse: false, hasCommunityPost: false },
  admin: null,
};

const COMMUNITY_ITEMS: DashboardOverviewFixture["community"]["items"] = [
  { postId: "fixture-post-1" as Id<"communityPosts">, title: "Kako da napišem prvi prompt za mejl klijentu?", author: "Milica Petrović", replies: 6, at: AT(0) },
  { postId: "fixture-post-2" as Id<"communityPosts">, title: "Pokažite svoj prvi rad iz Cree", author: "Stefan Kovač", replies: 14, at: AT(1) },
  { postId: "fixture-post-3" as Id<"communityPosts">, title: "Koji kurs posle „Promptova koji rade”?", author: "Jelena Marić", replies: 3, at: AT(2) },
];

export const DASHBOARD_OVERVIEW_FIXTURES: Record<IgraFixtureId, DashboardOverviewFixture> = {
  // Tek registrovan: nema kurs, nema aktivnosti; zajednica je živa, krediti dobrodošlice.
  novi: {
    ...EMPTY_OVERVIEW,
    community: { unreadNotifications: 0, items: COMMUNITY_ITEMS },
    studio: { creditsBalance: 40, items: [] },
  },

  // Treća nedelja: kurs u toku (lekcija 4 od 9), isti dani kao niz u `IGRA_FIXTURES.aktivan`.
  aktivan: {
    ...EMPTY_OVERVIEW,
    resume: {
      courseSlug: "promptovi-koji-rade",
      lessonSlug: "uloge-i-kontekst",
      courseTitle: { sr: "Promptovi koji rade", en: "Prompts that work" },
      lessonTitle: { sr: "Uloge i kontekst", en: "Roles and context" },
      position: 4,
      total: 9,
      coverUrl: null,
    },
    progress: { completedLessons: 14, totalLessons: 31, percent: 45 },
    nextLessons: [
      { courseSlug: "promptovi-koji-rade", lessonSlug: "uloge-i-kontekst", title: { sr: "Uloge i kontekst", en: "Roles and context" }, durationSeconds: 480 },
      { courseSlug: "promptovi-koji-rade", lessonSlug: "primeri-u-promptu", title: { sr: "Primeri u promptu", en: "Examples in a prompt" }, durationSeconds: 540 },
      { courseSlug: "ai-za-svaki-dan", lessonSlug: "plan-nedelje", title: { sr: "Plan nedelje uz AI", en: "A weekly plan with AI" }, durationSeconds: 660 },
    ],
    activity: lessonDays([
      [0, 1], [1, 2], [2, 1], [3, 1], [4, 3], [5, 1],
      [8, 1], [9, 1], [10, 2], [11, 1], [12, 1], [13, 2], [14, 1], [15, 1], [16, 1],
      [22, 1], [23, 2], [27, 1], [30, 1], [31, 3], [36, 1], [40, 1], [44, 2], [45, 1], [51, 1],
      [58, 1], [62, 2], [70, 1], [77, 1], [85, 1], [99, 2], [120, 1],
    ]),
    messages: {
      unreadTotal: 2,
      items: [
        { conversationId: "fixture-chat-1" as Id<"chatConversations">, title: "Milica Petrović", snippet: "Hvala za savet oko uloga, proradilo je!", at: AT(0), avatarUrl: null },
        { conversationId: "fixture-chat-2" as Id<"chatConversations">, title: "Uči zajedno: Promptovi", snippet: "Večeras u 20 h prelazimo lekciju 4?", at: AT(1), avatarUrl: null },
      ],
    },
    community: { unreadNotifications: 1, items: COMMUNITY_ITEMS },
    notifications: {
      total: 3,
      items: [
        { kind: "reply", title: "Stefan Kovač je odgovorio na tvoju temu", at: AT(0), href: "/app/community/notifications" },
        { kind: "helpful", title: "Tvoj odgovor je označen kao koristan", at: AT(2), href: "/app/community/notifications" },
        { kind: "mention", title: "Jelena Marić te je pomenula", at: AT(3), href: "/app/community/notifications" },
      ],
    },
    studio: {
      creditsBalance: 1250,
      items: [
        { jobId: "fixture-job-1" as Id<"generationJobs">, kind: "image", thumbUrl: null, at: AT(0) },
        { jobId: "fixture-job-2" as Id<"generationJobs">, kind: "video", thumbUrl: null, at: AT(2) },
        { jobId: "fixture-job-3" as Id<"generationJobs">, kind: "image", thumbUrl: null, at: AT(3) },
      ],
    },
    study: { pendingInvites: 1, partners: 1 },
    leaderboard: { rank: 7, points: 435 },
    firstRun: { hasUnlockedCourse: true, hasCommunityPost: true },
  },

  // Višemesečni rad: sve lekcije završene, prvo mesto ove nedelje.
  legenda: {
    ...EMPTY_OVERVIEW,
    progress: { completedLessons: 148, totalLessons: 148, percent: 100 },
    activity: lessonDays([
      ...Array.from({ length: 64 }, (_, daysAgo) => [daysAgo, (daysAgo % 4) + 1] as const),
      ...Array.from({ length: 58 }, (_, index) => [66 + index * 2, (index % 3) + 1] as const),
    ]),
    messages: {
      unreadTotal: 1,
      items: [{ conversationId: "fixture-chat-3" as Id<"chatConversations">, title: "Nikola Stanić", snippet: "Možeš li da pogledaš moj prompt za prezentaciju?", at: AT(0), avatarUrl: null }],
    },
    community: { unreadNotifications: 4, items: COMMUNITY_ITEMS },
    notifications: { total: 4, items: [{ kind: "helpful", title: "Tvoj odgovor je označen kao koristan", at: AT(0), href: "/app/community/notifications" }] },
    studio: {
      creditsBalance: 18400,
      items: [
        { jobId: "fixture-job-4" as Id<"generationJobs">, kind: "audio", thumbUrl: null, at: AT(0) },
        { jobId: "fixture-job-5" as Id<"generationJobs">, kind: "video", thumbUrl: null, at: AT(1) },
        { jobId: "fixture-job-6" as Id<"generationJobs">, kind: "image", thumbUrl: null, at: AT(1) },
      ],
    },
    study: { pendingInvites: 0, partners: 2 },
    leaderboard: { rank: 1, points: 1310 },
    firstRun: { hasUnlockedCourse: true, hasCommunityPost: true },
  },
};

/**
 * Učionica (K09): kursevi istih korisnika u obliku `DashboardCourse` (ono što učionica
 * dobija od `courses:getAppNavigation` preko `coursesFromLive`). Stanje lekcija je jedini
 * izvor napretka - procenat, sledeću lekciju i poslednju aktivnost računa pravi
 * `getProgressSummary`. Dva kursa nose slug iz `lib/content.ts`, pa imaju pravu naslovnu
 * petlju i cenu; ostali su bez slike i crtaju zatečeni fallback.
 */
type LessonSeed = readonly [slug: string, sr: string, en: string];
type CourseSeed = { slug: string; track: string; title: LocalizedText; subtitle: LocalizedText; lessons: readonly LessonSeed[] };

export const CLASSROOM_TRACK_FIXTURES: CatalogTrackMeta = {
  "fixture-track-osnove": { slug: "ai-osnove", title: { sr: "AI osnove", en: "AI basics" } },
  "fixture-track-web": { slug: "websites", title: { sr: "Smer za web sajtove", en: "Websites track" } },
  "fixture-track-kreativa": { slug: "video-audio", title: { sr: "Smer za video i audio", en: "Video and audio track" } },
};

const COURSE_SEEDS: readonly CourseSeed[] = [
  {
    slug: "promptovi-koji-rade",
    track: "fixture-track-osnove",
    title: { sr: "Promptovi koji rade", en: "Prompts that work" },
    subtitle: { sr: "Od prve rečenice do odgovora koji možeš da upotrebiš", en: "From the first sentence to an answer you can use" },
    lessons: [
      ["sta-je-prompt", "Šta je prompt", "What a prompt is"],
      ["jasan-zadatak", "Jasan zadatak", "A clear task"],
      ["ton-i-publika", "Ton i publika", "Tone and audience"],
      ["uloge-i-kontekst", "Uloge i kontekst", "Roles and context"],
      ["primeri-u-promptu", "Primeri u promptu", "Examples in a prompt"],
      ["korak-po-korak", "Korak po korak", "Step by step"],
      ["popravi-odgovor", "Popravi odgovor", "Fix the answer"],
      ["sabloni", "Šabloni koje čuvaš", "Templates worth keeping"],
      ["zavrsni-zadatak", "Završni zadatak", "Final task"],
    ],
  },
  {
    slug: "ai-za-svaki-dan",
    track: "fixture-track-osnove",
    title: { sr: "AI za svaki dan", en: "AI for every day" },
    subtitle: { sr: "Mejlovi, planovi i beleške uz pomoć asistenta", en: "Emails, plans and notes with an assistant" },
    lessons: [
      ["prvi-razgovor", "Prvi razgovor sa asistentom", "Your first chat with an assistant"],
      ["mejl-za-pet-minuta", "Mejl za pet minuta", "An email in five minutes"],
      ["sazmi-dug-tekst", "Sažmi dug tekst", "Summarise a long text"],
      ["beleske-sa-sastanka", "Beleške sa sastanka", "Meeting notes"],
      ["lista-za-kupovinu", "Lista za kupovinu i recepti", "Shopping lists and recipes"],
      ["plan-nedelje", "Plan nedelje uz AI", "A weekly plan with AI"],
      ["ucenje-novog", "Učenje nečeg novog", "Learning something new"],
      ["provera-cinjenica", "Provera činjenica", "Checking the facts"],
    ],
  },
  {
    slug: "prvi-koraci-sa-ai",
    track: "fixture-track-osnove",
    title: { sr: "Prvi koraci sa AI", en: "First steps with AI" },
    subtitle: { sr: "Šta AI jeste, šta nije i kako da kreneš bez straha", en: "What AI is, what it is not, and how to start without fear" },
    lessons: [
      ["sta-je-ai", "Šta je AI", "What AI is"],
      ["nalog-i-podesavanja", "Nalog i podešavanja", "Account and settings"],
      ["prvo-pitanje", "Prvo pitanje", "Your first question"],
      ["kad-ai-gresi", "Kad AI greši", "When AI gets it wrong"],
      ["privatnost", "Privatnost i podaci", "Privacy and data"],
      ["sta-dalje", "Šta dalje", "What next"],
    ],
  },
  {
    slug: "vibe-coding",
    track: "fixture-track-web",
    title: { sr: "Kurs za web sajtove", en: "Websites course" },
    subtitle: { sr: "Tvoj prvi sajt uz AI, bez prethodnog znanja", en: "Your first website with AI, no experience needed" },
    lessons: [
      ["ideja-za-sajt", "Ideja za sajt", "An idea for a site"],
      ["prva-strana", "Prva strana", "The first page"],
      ["tekst-i-slike", "Tekst i slike", "Text and images"],
      ["boje-i-fontovi", "Boje i fontovi", "Colours and fonts"],
      ["kontakt-forma", "Kontakt forma", "A contact form"],
      ["telefon", "Sajt na telefonu", "The site on a phone"],
      ["objava", "Objava sajta", "Publishing the site"],
      ["odrzavanje", "Održavanje", "Keeping it up"],
    ],
  },
  {
    slug: "video-audio-ai",
    track: "fixture-track-kreativa",
    title: { sr: "Kurs za video i audio", en: "Video and audio course" },
    subtitle: { sr: "Scenario, glas, kadar i montaža uz AI", en: "Script, voice, shots and editing with AI" },
    lessons: [
      ["uvod-u-ai-video", "Uvod u AI video produkciju", "Intro to AI video production"],
      ["scenario-voice-workflow", "Scenario, naracija i glas", "Script, narration and voice"],
      ["ai-video-editor", "AI video editor i montaža", "AI video editor and editing"],
      ["client-ready-project", "Finalni projekat za klijenta", "A client-ready final project"],
      ["titlovi", "Titlovi i natpisi", "Subtitles and captions"],
      ["objava-videa", "Objava videa", "Publishing the video"],
    ],
  },
  {
    slug: "glas-i-muzika-uz-ai",
    track: "fixture-track-kreativa",
    title: { sr: "Glas i muzika uz AI", en: "Voice and music with AI" },
    subtitle: { sr: "Naracija, podkast i muzička podloga bez studija", en: "Narration, podcasts and backing music without a studio" },
    lessons: [
      ["tvoj-glas", "Tvoj glas u tekstu", "Your voice in text"],
      ["naracija", "Naracija koja zvuči prirodno", "Narration that sounds natural"],
      ["muzicka-podloga", "Muzička podloga", "Backing music"],
      ["ciscenje-zvuka", "Čišćenje zvuka", "Cleaning up audio"],
      ["prva-epizoda", "Prva epizoda podkasta", "Your first podcast episode"],
    ],
  },
  {
    slug: "ai-slike-za-pocetnike",
    track: "fixture-track-kreativa",
    title: { sr: "AI slike za početnike", en: "AI images for beginners" },
    subtitle: { sr: "Od opisa do slike koju vredi pokazati", en: "From a description to an image worth showing" },
    lessons: [
      ["opis-slike", "Kako se opisuje slika", "How to describe an image"],
      ["stil-i-svetlo", "Stil i svetlo", "Style and light"],
      ["likovi", "Likovi koji ostaju isti", "Characters that stay the same"],
      ["popravke", "Popravke i dorade", "Fixes and touch-ups"],
      ["plakat", "Plakat za događaj", "A poster for an event"],
      ["slike-za-mreze", "Slike za društvene mreže", "Images for social media"],
      ["mala-izlozba", "Mala izložba radova", "A small exhibition"],
    ],
  },
];

/** `done` = koliko je lekcija završeno od početka kursa; kurs kog nema u `done` nije otključan. */
function classroomCourses(done: Record<string, number>): DashboardCourse[] {
  return COURSE_SEEDS.map((seed, courseIndex) => {
    const completed = done[seed.slug];
    return {
      id: `fixture-course-${seed.slug}`,
      trackId: seed.track,
      slug: seed.slug,
      title: seed.title,
      subtitle: seed.subtitle,
      description: seed.subtitle,
      image: staticCourses.find((course) => course.slug === seed.slug)?.image,
      coverUrl: null,
      status: "published",
      hasAccess: true,
      owned: completed !== undefined,
      sortOrder: courseIndex * 10,
      lessons: seed.lessons.map(([slug, sr, en], index) => ({
        id: `fixture-lesson-${seed.slug}-${slug}`,
        slug,
        title: { sr, en },
        duration: `${7 + (index % 4)} min`,
        durationSeconds: (7 + (index % 4)) * 60,
        isPublished: true,
        sortOrder: index * 10,
        // Poslednja završena lekcija nosi poslednju aktivnost kursa: prvi kurs u spisku je
        // onaj na kome je korisnik stao najskorije.
        progress: completed !== undefined && index < completed ? { completed: true, updatedAt: AT(courseIndex + (completed - index - 1)) } : null,
      })),
    };
  });
}

export const CLASSROOM_FIXTURES: Record<IgraFixtureId, DashboardCourse[]> = {
  // Tek registrovan: ništa nije otključano, cela učionica je katalog.
  novi: classroomCourses({}),
  // Isti brojevi kao tabla (14 od 31 lekcije): kurs u toku (lekcija 4 od 9), jedan pri
  // kraju, jedan završen, jedan otključan a nepočet; tri zaključana.
  aktivan: classroomCourses({ "promptovi-koji-rade": 3, "ai-za-svaki-dan": 5, "prvi-koraci-sa-ai": 6, "vibe-coding": 0 }),
  // Sve otključano i sve završeno.
  legenda: classroomCourses(Object.fromEntries(COURSE_SEEDS.map((seed) => [seed.slug, seed.lessons.length]))),
};

// ── Zajednica (K11) ─────────────────────────────────────────────────────────

export type CommunityFixture = {
  posts: CommunityPostRow[];
  members: CommunityMemberRow[];
  notifications: CommunityMentionEvent[];
};

const HOUR_MS = 3_600_000;

/** Rang autora kako ga vraća `community:listPostsPage` (stepen iz broja lekcija). */
function lessonsRank(completedLessons: number) {
  const level = completedLessons >= 60 ? 5 : completedLessons >= 30 ? 4 : completedLessons >= 15 ? 3 : completedLessons >= 5 ? 2 : 1;
  return { level, label: `Nivo ${level}`, completedLessons };
}

// ID počinje sa `preview-`: kartica teme tada vodi na listu diskusija, ne na detalj.
const COMMUNITY_POSTS: CommunityPostRow[] = [
  {
    _id: "preview-prompt-uloga",
    title: "Kako da prompt uvek dobije isti ton?",
    body: "Dajem ulogu na početku, ali posle trećeg odgovora ton sklizne. Šta vi radite?",
    createdAt: NOW - 2 * HOUR_MS,
    authorName: "Jelena Marković",
    authorUsername: "jelena.markovic",
    authorRole: "pro_student",
    authorRank: lessonsRank(64),
    trackTitleSr: "AI osnove",
    trackTitleEn: "AI basics",
    courseTitleSr: "Promptovi koji rade",
    courseTitleEn: "Prompts that work",
    commentsCount: 7,
    voteScore: 12,
    isPinned: true,
  },
  {
    _id: "preview-prva-slika",
    title: "Moja prva slika u Crei, šta da popravim?",
    body: "Tražila sam akvarel mačke na prozoru. Boje su dobre, ali šape izgledaju čudno.",
    createdAt: NOW - 5 * HOUR_MS,
    authorName: "Tamara Ilić",
    authorUsername: "tamara.ilic",
    authorRole: "student",
    authorRank: lessonsRank(1),
    commentsCount: 3,
    voteScore: 4,
  },
  {
    _id: "preview-sajt-za-salon",
    title: "Vibe coding: sajt za frizerski salon za jedno popodne",
    body: "Delim korake i greške koje sam napravio, da ih vi ne ponovite.",
    createdAt: NOW - 26 * HOUR_MS,
    authorName: "Nikola Stanić",
    authorUsername: "nikola.stanic",
    authorRole: "student",
    authorRank: lessonsRank(17),
    trackTitleSr: "Sajtovi i kod",
    trackTitleEn: "Sites and code",
    courseTitleSr: "Vibe coding",
    courseTitleEn: "Vibe coding",
    commentsCount: 11,
    voteScore: 23,
  },
  {
    _id: "preview-pravila",
    title: "Kako da postaviš pitanje na koje ćeš brzo dobiti odgovor",
    body: "Naslov u jednoj rečenici, šta si probao/la i gde je stalo. Slika ekrana mnogo pomaže.",
    createdAt: NOW - 3 * DAY_MS,
    authorName: "Milica Jovanović",
    authorUsername: "milica",
    authorRole: "admin",
    authorRank: null,
    commentsCount: 2,
    voteScore: 31,
  },
  {
    _id: "preview-prvi-dan",
    title: "Zdravo svima, tek sam počeo",
    body: "Imam 54 godine i prvi put koristim AI. Odakle je najbolje da krenem?",
    createdAt: NOW - 4 * DAY_MS,
    authorName: "Dragan Pešić",
    authorRole: "student",
    authorRank: lessonsRank(0),
    commentsCount: 9,
    voteScore: 18,
  },
];

const COMMUNITY_MEMBERS: CommunityMemberRow[] = [
  { _id: "fixture-member-milica", userId: "fixture-user-milica", name: "Milica Jovanović", username: "milica", role: "admin", xp: 0, contributionCount: 212, helpfulAnswers: 40, canFollow: false },
  { _id: "fixture-member-ognjen", userId: "fixture-user-ognjen", name: "Ognjen Vuković", username: "ognjen.v", role: "moderator", xp: 0, contributionCount: 96, helpfulAnswers: 22, canFollow: true },
  { _id: "fixture-member-vesna", userId: "fixture-user-vesna", name: "Vesna Radović", username: "vesna.radovic", role: "pro_student", xp: 23480, contributionCount: 148, helpfulAnswers: 31, canFollow: true, isFollowing: true, isMutual: true, trackTitleSr: "Slika, video i zvuk", trackTitleEn: "Image, video and sound" },
  { _id: "fixture-member-jelena", userId: "fixture-user-jelena", name: "Jelena Marković", username: "jelena.markovic", role: "pro_student", xp: 6120, contributionCount: 57, helpfulAnswers: 9, canFollow: true, isFollowing: true, trackTitleSr: "AI osnove", trackTitleEn: "AI basics", courseTitleSr: "Promptovi koji rade", courseTitleEn: "Prompts that work" },
  { _id: "fixture-member-nikola", userId: "fixture-user-nikola", name: "Nikola Stanić", username: "nikola.stanic", role: "student", xp: 1890, contributionCount: 14, helpfulAnswers: 2, canFollow: true, trackTitleSr: "Sajtovi i kod", trackTitleEn: "Sites and code" },
  { _id: "fixture-member-aleksandra", userId: "fixture-user-aleksandra", name: "Aleksandra Stojanović-Milenković", username: "aleksandra.stojanovic", role: "student", xp: 760, contributionCount: 6, helpfulAnswers: 0, canFollow: true },
  { _id: "fixture-member-tamara", userId: "fixture-user-tamara", name: "Tamara Ilić", username: "tamara.ilic", role: "student", xp: 100, contributionCount: 1, helpfulAnswers: 0, canFollow: true },
  { _id: "fixture-member-dragan", userId: "fixture-user-dragan", name: "Dragan Pešić", role: "student", xp: 0, contributionCount: 1, helpfulAnswers: 0, canFollow: true },
];

const COMMUNITY_NOTIFICATIONS: CommunityMentionEvent[] = [
  {
    _id: "fixture-notification-reply",
    createdAt: NOW - 40 * 60_000,
    kind: "comment_post",
    senderName: "Jelena Marković",
    senderUsername: "jelena.markovic",
    authorRole: "pro_student",
    excerpt: "Probaj da ulogu ponoviš u svakoj poruci, ne samo u prvoj. Kod mene je to rešilo stvar.",
    postId: "preview-sajt-za-salon",
    postTitle: "Vibe coding: sajt za frizerski salon za jedno popodne",
    trackTitleSr: "Sajtovi i kod",
    trackTitleEn: "Sites and code",
  },
  {
    _id: "fixture-notification-helpful",
    createdAt: NOW - 3 * HOUR_MS,
    kind: "helpful_comment",
    senderName: "Milica Jovanović",
    senderUsername: "milica",
    authorRole: "admin",
    excerpt: "Slika ekrana sa greškom i jedan red o tome šta si očekivao.",
    postId: "preview-pravila",
    postTitle: "Kako da postaviš pitanje na koje ćeš brzo dobiti odgovor",
  },
  {
    _id: "fixture-notification-mention",
    createdAt: NOW - 20 * HOUR_MS,
    readAt: NOW - 19 * HOUR_MS,
    kind: "mention",
    senderName: "Tamara Ilić",
    senderUsername: "tamara.ilic",
    authorRole: "student",
    excerpt: "@nikola.stanic je ovo već radio, možda on zna.",
    postId: "preview-prva-slika",
    postTitle: "Moja prva slika u Crei, šta da popravim?",
  },
  {
    _id: "fixture-notification-follow",
    createdAt: NOW - 2 * DAY_MS,
    readAt: NOW - 2 * DAY_MS + HOUR_MS,
    kind: "new_follower",
    senderName: "Vesna Radović",
    senderUsername: "vesna.radovic",
    authorRole: "pro_student",
  },
];

export const COMMUNITY_FIXTURES: Record<IgraFixtureId, CommunityFixture> = {
  // Tek registrovan: zajednica još nema šta da pokaže (prazna stanja).
  novi: { posts: [], members: [], notifications: [] },
  aktivan: { posts: COMMUNITY_POSTS, members: COMMUNITY_MEMBERS, notifications: COMMUNITY_NOTIFICATIONS },
  // Sve je pročitano.
  legenda: {
    posts: COMMUNITY_POSTS,
    members: COMMUNITY_MEMBERS,
    notifications: COMMUNITY_NOTIFICATIONS.map((notification) => ({ ...notification, readAt: notification.readAt ?? NOW - HOUR_MS })),
  },
};

// ── Rang lista (K12) ────────────────────────────────────────────────────────

export const LEADERBOARD_FIXTURE_SIZES = [0, 3, 50, 500] as const;
export type LeaderboardFixtureSize = (typeof LEADERBOARD_FIXTURE_SIZES)[number];

export type LeaderboardFixture = {
  rows: LeaderboardRow[];
  viewer: { eligible: boolean; row: LeaderboardRow | null };
};

const LB_FIRST = [
  "Milan", "Jovana", "Stefan", "Ana", "Luka", "Teodora", "Nemanja", "Milica", "Marko", "Sara", "Uroš", "Katarina", "Filip",
  "Ivana", "Vuk", "Dunja", "Lazar", "Mina", "Andrej", "Tijana", "Pavle", "Nevena", "Dušan", "Lena", "Ognjen",
] as const;
const LB_LAST = [
  "Petrović", "Nikolić", "Đorđević", "Popović", "Pavlović", "Ilić", "Stojanović", "Kostić", "Lazić", "Živković",
  "Todorović", "Ristić", "Mitrović", "Savić", "Obradović", "Kovačević", "Simić", "Antić", "Bogdanović", "Radosavljević",
] as const;

/** Korisničko ime bez kvačica: „Đorđević" → „djordjevic". */
function asciiHandle(text: string) {
  return text
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Ime i prezime za i-tog člana: 25 × 20 = 500 jedinstvenih parova. */
function lbPerson(index: number) {
  const first = LB_FIRST[index % LB_FIRST.length]!;
  const last = LB_LAST[(7 * (index % LB_FIRST.length) + Math.floor(index / LB_FIRST.length)) % LB_LAST.length]!;
  return { name: `${first} ${last}`, username: `${asciiHandle(first)}.${asciiHandle(last)}` };
}

/**
 * Rang kao na serveru (`leaderboardReadCore`): više XP-a je bolje, isti XP deli mesto, a
 * sledeći različit XP dobija sledeće mesto (1, 1, 2). Redosled istog XP-a ostaje ulazni.
 */
export function rankFixtureRows<Row extends { xp: number; rank: number }>(rows: readonly Row[]): Row[] {
  const sorted = [...rows].sort((a, b) => b.xp - a.xp);
  let rank = 0;
  let previous = Number.NaN;
  return sorted.map((row) => {
    if (row.xp !== previous) {
      rank += 1;
      previous = row.xp;
    }
    return { ...row, rank };
  });
}

/** Gde test korisnik stoji na listi od `size` članova (indeks od 0); `null` = nije na listi. */
function viewerIndex(stanje: IgraFixtureId, size: number): number | null {
  if (size === 0 || stanje === "novi") return null;
  if (stanje === "legenda") return 0;
  // Aktivan: na podijumu, u prvih 20 (ispod prevoja) ili daleko iza učitanog dela liste.
  return size <= 3 ? 1 : size <= 50 ? 11 : 326;
}

/**
 * Rang lista za izlog (K12): 0, 3, 50 ili 500 članova u obliku reda `listLeaderboard`,
 * sa izjednačenim XP-om (deljena mesta) i test korisnikom kao „ti". Nedelja i „Ukupno"
 * imaju isti raspored i drugu skalu XP-a; nalog tima nije na listi.
 */
export function fixtureLeaderboard({
  size,
  period,
  stanje,
  staff = false,
}: {
  size: LeaderboardFixtureSize;
  period: "week" | "all_time";
  stanje: IgraFixtureId;
  staff?: boolean;
}): LeaderboardFixture {
  const top = period === "week" ? (stanje === "legenda" ? IGRA_FIXTURES.legenda.weekXp : 1240) : stanje === "legenda" ? IGRA_FIXTURES.legenda.xp : 21950;
  const xps = Array.from({ length: size }, (_, index) => Math.max(10, Math.round((top * Math.pow(1 - index / Math.max(size, 1), 2.2)) / 5) * 5));
  // Peto i šesto mesto dele XP (i mesto), da se vidi kako lista broji izjednačene.
  if (size > 6) xps[5] = xps[4]!;
  const me = staff ? null : viewerIndex(stanje, size);
  // Isti ljudi kao u zajednici (K11): legenda je Vesna, aktivan Nikola.
  const self =
    stanje === "legenda"
      ? { userId: "fixture-user-vesna", name: "Vesna Radović", username: "vesna.radovic" }
      : { userId: "fixture-user-nikola", name: "Nikola Stanić", username: "nikola.stanic" };

  const rows = rankFixtureRows(
    xps.map((xp, index): LeaderboardRow => {
      const person = index === me ? { name: self.name, username: self.username } : lbPerson(index);
      return {
        userId: index === me ? self.userId : `fixture-rank-${index}`,
        rank: 0,
        name: person.name,
        username: person.username,
        role: index % 3 === 0 ? "pro_student" : "student",
        xp,
        completedLessons: Math.floor(xp / (period === "week" ? 120 : 100)),
        helpfulAnswers: Math.floor(xp / 400),
        isViewer: index === me,
      };
    }),
  );
  return { rows, viewer: { eligible: !staff, row: rows.find((row) => row.isViewer) ?? null } };
}

// ── Profil (K13) ─────────────────────────────────────────────────────────

export type MemberProgressFixture = NonNullable<FunctionReturnType<typeof api.igra.getMemberProgress>>;

export type ProfileFixture = {
  name: string;
  username: string;
  avatarUrl: string;
  role: "student" | "pro_student";
  /** Javni kalendar (oblik `getPublicProfile.activity.days`), poslednjih 365 dana. */
  days: ProfileActivityDay[];
  /** Radovi u Crei za godinu (vidi ih samo vlasnik). */
  works: number;
  /** Javan broj korisnih odgovora (`getPublicProfile.stats.helpfulAnswers`), isti kao u `IGRA_FIXTURES`. */
  helpfulAnswers: number;
};

/** Dan javnog kalendara `daysAgo` dana pre „danas" izloga. */
function profileDay(daysAgo: number, lessons: number, tasks = 0, threads = 0, comments = 0): ProfileActivityDay {
  return { dayKey: shiftDayKey(IGRA_FIXTURE_TODAY, -daysAgo), lessons, tasks, threads, comments, total: lessons + tasks + threads + comments };
}

/** Legenda: 64 dana zaredom, pa svaki treći dan do pre 300 dana (deterministički, bez slučajnosti). */
function legendDays(): ProfileActivityDay[] {
  const days: ProfileActivityDay[] = [];
  for (let daysAgo = 0; daysAgo < 300; daysAgo += 1) {
    if (daysAgo > 63 && daysAgo % 3 !== 0) continue;
    days.push(profileDay(daysAgo, daysAgo % 10 === 0 ? 2 : daysAgo % 7 === 0 ? 0 : 1, daysAgo % 6 === 0 ? 1 : 0, daysAgo % 23 === 0 ? 1 : 0, daysAgo % 4 === 0 ? 1 : 0));
  }
  return days;
}

export const PROFILE_FIXTURES: Record<IgraFixtureId, ProfileFixture> = {
  novi: { name: "Tamara Ilić", username: "tamara.ilic", avatarUrl: "/images/avatars/cosmic-scholar.png", role: "student", days: [], works: 0, helpfulAnswers: 0 },
  aktivan: {
    name: "Nikola Stanić",
    username: "nikola.stanic",
    avatarUrl: "/images/avatars/hybrid-guardian.png",
    role: "pro_student",
    // Isti dani kao niz test korisnika (0-5 i 8-16 dana unazad) i nekoliko ranijih.
    days: [
      ...[0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((daysAgo, index) => profileDay(daysAgo, index < 11 ? 1 : 0, index % 4 === 0 ? 1 : 0, index % 6 === 0 ? 1 : 0, index % 3 === 0 ? 1 : 0)),
      profileDay(19, 1, 0, 0, 2),
      profileDay(23, 1, 1),
      profileDay(30, 1),
    ],
    works: 12,
    helpfulAnswers: 2,
  },
  legenda: { name: "Vesna Radović", username: "vesna.radovic", avatarUrl: "/images/avatars/mythic-mentor.png", role: "pro_student", days: legendDays(), works: 186, helpfulAnswers: 37 },
};

/**
 * `igra:getMemberProgress` za test korisnika: samo bedževi iz dnevnika (nov, još neviđen
 * bedž je zaključan). DRUGI član vidi samo ono što pušta `isBadgePublic` (isto pravilo kao
 * server) i ne vidi radove; `owner` vidi sve svoje. `staff`: nalog tima nema nivo ni XP.
 */
export function memberProgressFixture(stanje: IgraFixtureId, opts: { owner?: boolean; creaPublic: boolean; staff?: boolean }): MemberProgressFixture {
  const progress = IGRA_FIXTURES[stanje];
  const publicProfile = { creaPublic: opts.creaPublic, helpfulAnswers: PROFILE_FIXTURES[stanje].helpfulAnswers };
  return {
    xp: opts.staff ? null : progress.xp,
    level: opts.staff ? null : progress.level,
    banner: progress.banner,
    works: opts.owner ? PROFILE_FIXTURES[stanje].works : null,
    badges: progress.badges.map((badge) => {
      const hidden = !opts.owner && !isBadgePublic(badge.key, publicProfile);
      return { key: badge.key, state: hidden ? "hidden" : badge.state === "unlocked" ? "unlocked" : "locked" };
    }),
  };
}

// ── Crea (K15) ───────────────────────────────────────────────────────────────

export type CreaGameFixture = NonNullable<FunctionReturnType<typeof api.creaGame.myGame>>;

function creaGame(stanje: IgraFixtureId, owned: number): CreaGameFixture {
  const progress = IGRA_FIXTURES[stanje];
  return {
    xp: progress.xp,
    // Stari obračun sa servera (500 XP po nivou): traka ga NE prikazuje, nivo računa iz XP-a.
    level: Math.floor(progress.xp / 500) + 1,
    streak: progress.streak,
    album: { owned, total: CREA_ALBUM_STICKER_COUNT },
    unlock: { auto: false, chosen: false, lessons: [] },
    freeTries: [],
    reportCardPublic: false,
    username: progress.username,
  };
}

/** `creaGame:myGame` za tri test korisnika: isti XP i niz kao `IGRA_FIXTURES`. */
export const CREA_GAME_FIXTURES: Record<IgraFixtureId, CreaGameFixture> = {
  novi: creaGame("novi", 0),
  aktivan: creaGame("aktivan", 23),
  legenda: creaGame("legenda", CREA_ALBUM_STICKER_COUNT - 4),
};

/**
 * Lažan rad Cree za izlog (K16): samo polja koja čekanje, pločica rada i pozornica čitaju.
 * `now` daje izlog (vreme se ne pamti u modulu, sat čekanja inače ne bi tekao).
 */
export function creaJobFixture(
  kind: StudioTileJob["kind"],
  status: "running" | "queued" | "done" | "failed" | "refunded",
  now: number,
  extra: Partial<StudioTileJob> = {},
): StudioTileJob {
  const prompt = { image: "Mačka astronaut na Mesecu, akvarel", video: "Talasi udaraju o stenu u sumrak", audio: "Topla klavirska melodija za jutro" }[kind];
  return {
    _id: `izlog-${kind}-${status}`,
    modelSlug: `izlog-${kind}`,
    kind,
    params: JSON.stringify({ prompt }),
    status,
    creditCost: 4,
    outputUrl: status === "done" ? "/images/landing/course-video-audio.png" : null,
    isMock: true,
    createdAt: now - 12_000,
    ...(status === "done" ? { completedAt: now } : {}),
    ...extra,
  };
}

// ── Crea biblioteka, galerija, izazov, sveska (K17) ─────────────────────────

export type CreaPublicWorkFixture = FunctionReturnType<typeof api.creaGallery.listPublicWorks>["page"][number];
export type CreaChallengeBoardFixture = Extract<FunctionReturnType<typeof api.creaChallenges.challengeBoard>, { enabled: true }>;
export type CreaLeagueFixture = Extract<NonNullable<FunctionReturnType<typeof api.creaLeagues.myLeague>>, { eligible: true }>;
export type CreaPairFixture = NonNullable<FunctionReturnType<typeof api.creaPairs.myPair>>;

const PUBLIC_WORK_ART = ["/images/landing/course-video-audio.png", "/images/landing/course-vibe-coding.png", "/images/landing/hero-poster.webp"] as const;
const PUBLIC_WORK_AUTHORS = ["Mila Petrović", "Luka Jovanović", "Ana Marković", "Nikola Ilić", "Sara Đorđević", "Vuk Stanković"] as const;
const PUBLIC_WORK_TITLES = ["Mačka astronaut", "Jesen na Kalemegdanu", "Robot u bašti", "Noćni tramvaj", "Plava sova", "Grad od papira"] as const;

/** Javni rad galerije (K17): samo polja koja `WorkCard` i tabla izazova čitaju. */
export function creaPublicWorkFixture(index: number, extra: Partial<CreaPublicWorkFixture> = {}): CreaPublicWorkFixture {
  const i = Math.abs(Math.trunc(index));
  return {
    _id: `izlogjavnirad${String(i).padStart(4, "0")}` as Id<"creaPublicWorks">,
    kind: "image",
    title: PUBLIC_WORK_TITLES[i % PUBLIC_WORK_TITLES.length]!,
    prompt: null,
    modelSlug: "izlog-image",
    modelLabel: { sr: "Izlog", en: "Showcase" },
    outputUrl: PUBLIC_WORK_ART[i % PUBLIC_WORK_ART.length]!,
    posterUrl: null,
    author: { name: PUBLIC_WORK_AUTHORS[i % PUBLIC_WORK_AUTHORS.length]!, username: null, avatarUrl: null },
    isMine: false,
    likes: (i * 7) % 23,
    likedByMe: false,
    remixes: i % 3,
    remixOfWorkId: null,
    publishedAt: Date.parse(`${IGRA_FIXTURE_TODAY}T09:00:00Z`) - i * 3_600_000,
    challenge: null,
    remix: null,
    ...extra,
  };
}

/**
 * Tabla dnevnog izazova (K17): `empty` = niko nije prijavio rad za glasanje, a rezultati
 * prekjuče još nisu zatvoreni; inače glasanje u obe grupe i pobednik u grupi „Svi".
 */
export function creaChallengeBoardFixture(empty: boolean): CreaChallengeBoardFixture {
  const votingDay = shiftDayKey(IGRA_FIXTURE_TODAY, -1);
  const resultsDay = shiftDayKey(IGRA_FIXTURE_TODAY, -2);
  const entries = (from: number) => [0, 1, 2].map((n) => ({ ...creaPublicWorkFixture(from + n), votes: 0 }));
  return {
    enabled: true,
    signedIn: false,
    today: { dayKey: IGRA_FIXTURE_TODAY, theme: challengeForDay(IGRA_FIXTURE_TODAY).theme, seasonId: challengeForDay(IGRA_FIXTURE_TODAY).seasonId, myGroup: null, myEntry: null },
    voting: {
      dayKey: votingDay,
      theme: challengeForDay(votingDay).theme,
      groups: [
        { group: "pocetnici", entries: empty ? [] : entries(0), myVote: null },
        { group: "svi", entries: empty ? [] : entries(3), myVote: null },
      ],
    },
    results: {
      dayKey: resultsDay,
      theme: challengeForDay(resultsDay).theme,
      groups: empty
        ? [
            { group: "pocetnici", closed: false },
            { group: "svi", closed: false },
          ]
        : [
            { group: "pocetnici", closed: true, entries: 2, votesTotal: 3, winner: null, noWinnerReason: "MALO_PRIJAVA" },
            { group: "svi", closed: true, entries: 9, votesTotal: 31, winner: { ...creaPublicWorkFixture(4), votes: 12 }, noWinnerReason: null },
          ],
    },
    badges: [],
  };
}

/** Nedeljna liga u svesci (K17): grupa od osam, „ti" na četvrtom mestu. */
export const CREA_LEAGUE_FIXTURE: CreaLeagueFixture = {
  eligible: true,
  weekKey: "2026-W42",
  myXp: 410,
  joinTier: 1,
  nextTier: 2,
  member: { tier: 1, cohort: 3 },
  table: [
    { rank: 1, xp: 920, name: "Mila Petrović", isMe: false },
    { rank: 2, xp: 760, name: "Luka Jovanović", isMe: false },
    { rank: 3, xp: 515, name: "Ana Marković", isMe: false },
    { rank: 4, xp: 410, name: "Jovana Test", isMe: true },
    { rank: 5, xp: 380, name: "Nikola Ilić", isMe: false },
    { rank: 6, xp: 120, name: "Sara Đorđević", isMe: false },
  ],
  lastWeek: { tier: 1, rank: 6 },
};

/** Kreativni par bez para (K17): link postoji, para i poziva još nema. */
export const CREA_PAIR_EMPTY_FIXTURE: CreaPairFixture = { inviteCode: "IZLOG7", pair: null, invites: [], rewardProblem: null };

const FIXTURE_LESSONS: Record<IgraFixtureId, number> = { novi: 0, aktivan: 3, legenda: 12 };

/** Đačka knjižica (K17) za tri test korisnika: sličice iz albuma po redu i mini-lekcije. */
export function creaReportCardFixture(stanje: IgraFixtureId): ReportCard & { streak: number; bestStreak: number } {
  const game = CREA_GAME_FIXTURES[stanje];
  const stickerIds = CREA_ALBUM_PAGES.flatMap((page) => page.stickers.map((sticker) => sticker.id)).slice(0, game.album.owned);
  return { ...buildReportCard({ stickerIds, lessonsDone: FIXTURE_LESSONS[stanje], bestStreak: game.streak.best }), streak: game.streak.current, bestStreak: game.streak.best };
}

/** Strana kredita (K19): ISTI oblik koji `CreditsView` prima od Convex upita. Cene su iz `convex/seed.ts`. */
export type CreditsFixture = {
  balance: FunctionReturnType<typeof api.credits.getBalance>;
  lots: FunctionReturnType<typeof api.credits.getLots>;
  packs: FunctionReturnType<typeof api.creditPacks.listPacks>;
  models: FunctionReturnType<typeof api.modelCatalog.listModels>;
  transactions: FunctionReturnType<typeof api.credits.getTransactions>["page"];
};

const CREDIT_PACK = (slug: string, title: string, priceEurCents: number, credits: number, bonusPercent: number, sortOrder: number) => ({
  _id: `fixture-pack-${slug}` as Id<"creditPacks">,
  slug,
  titleSr: title,
  titleEn: title,
  priceEurCents,
  credits,
  bonusPercent,
  stripePriceId: `fixture_price_${slug}`,
  kind: "pack" as const,
  planTier: undefined,
  sortOrder,
});

export const CREDITS_FIXTURE_PACKS: CreditsFixture["packs"] = [
  { ...CREDIT_PACK("premium", "Premium", 2499, 2000, 0, 20), kind: "plan", planTier: "premium" },
  CREDIT_PACK("starter", "Starter", 500, 500, 0, 30),
  CREDIT_PACK("creator", "Creator", 1500, 1650, 10, 40),
  CREDIT_PACK("pro", "Pro", 4000, 4800, 20, 50),
];

const CREDITS_FIXTURE_MODELS: CreditsFixture["models"] = [
  { slug: "fixture-image", kind: "image", labelSr: "Slika", labelEn: "Image", descriptionSr: "", descriptionEn: "", creditCost: 12, badge: "preporuceno", paramSchema: "{}", sortOrder: 1 },
];

const CREDITS_TX = (n: number, type: CreditsFixture["transactions"][number]["type"], amount: number, balanceAfter: number, daysAgo: number, spent: boolean) => ({
  _id: `fixture-tx-${n}` as Id<"creditTransactions">,
  amount,
  type,
  balanceAfter,
  jobId: spent ? (`fixture-job-${n}` as Id<"generationJobs">) : undefined,
  note: undefined,
  createdAt: NOW - daysAgo * DAY_MS,
});

const creditBalance = (balance: number): CreditsFixture["balance"] => ({ balance, lifetimePurchased: balance, lifetimeSpent: 0, updatedAt: null });

/** Tri test korisnika: bez kredita i bez istorije, sa 1.250 kredita (jedan lot ističe), sa 4.310. */
export const CREDITS_FIXTURES: Record<IgraFixtureId, CreditsFixture> = {
  novi: { balance: creditBalance(0), lots: [], packs: CREDITS_FIXTURE_PACKS, models: CREDITS_FIXTURE_MODELS, transactions: [] },
  aktivan: {
    balance: creditBalance(1250),
    lots: [
      { _id: "fixture-lot-1" as Id<"creditLots">, source: "purchase", granted: 1650, remaining: 250, grantedAt: NOW - 340 * DAY_MS, expiresAt: NOW + 12 * DAY_MS },
      { _id: "fixture-lot-2" as Id<"creditLots">, source: "purchase", granted: 1000, remaining: 1000, grantedAt: NOW - 20 * DAY_MS, expiresAt: NOW + 345 * DAY_MS },
    ] as CreditsFixture["lots"],
    packs: CREDITS_FIXTURE_PACKS,
    models: CREDITS_FIXTURE_MODELS,
    transactions: [CREDITS_TX(1, "spend", -12, 1250, 0, true), CREDITS_TX(2, "spend", -12, 1262, 1, true), CREDITS_TX(3, "purchase", 1000, 1274, 20, false)],
  },
  legenda: {
    balance: creditBalance(4310),
    lots: [{ _id: "fixture-lot-3" as Id<"creditLots">, source: "purchase", granted: 4800, remaining: 4310, grantedAt: NOW - 30 * DAY_MS, expiresAt: NOW + 335 * DAY_MS }] as CreditsFixture["lots"],
    packs: CREDITS_FIXTURE_PACKS,
    models: CREDITS_FIXTURE_MODELS,
    transactions: [CREDITS_TX(4, "spend", -12, 4310, 0, true), CREDITS_TX(5, "purchase", 4800, 4322, 30, false)],
  },
};

/* ── Admin „Kontrolna soba" (K21) ─────────────────────────────────────────────────── */

export type AdminFixture = {
  overview: FunctionReturnType<typeof api.adminOverview.getAdminOverview>;
  usage: FunctionReturnType<typeof api.studioAdmin.getUsageSummary>;
  creaEnabled: boolean;
  pendingApprovals: number;
  now: number;
  /** `createdAt` iz `studioAdmin.listPromptLog` (propušteni upiti, najnoviji prvi). */
  passed: number[];
  /** `createdAt` iz `studioAdmin.listModerationEvents` (odbijeni upiti). */
  refused: number[];
};

const ADMIN_TALLY = (published: number, draft: number, archived = 0) => ({ total: published + draft + archived, published, draft, archived });

/** Vremena zapisa po danu, od najstarijeg ka danas; današnji su pre `NOW` (09:30 u Beogradu). */
function adminLogTimes(countsOldestFirst: readonly number[]): number[] {
  const times: number[] = [];
  countsOldestFirst.forEach((count, index) => {
    const daysAgo = countsOldestFirst.length - 1 - index;
    for (let i = 0; i < count; i += 1) {
      times.push(daysAgo === 0 ? NOW - (i + 1) * 4 * 60_000 : NOW - daysAgo * DAY_MS + 4 * 3_600_000 - i * 3 * 60_000);
    }
  });
  return times.sort((a, b) => b - a);
}

const ADMIN_USAGE = (
  totalCostUsd: number,
  jobCounts: [number, number, number, number, number, number],
  heartbeatMinutesAgo: number | null,
  extra: Partial<FunctionReturnType<typeof api.studioAdmin.getUsageSummary>> = {},
): FunctionReturnType<typeof api.studioAdmin.getUsageSummary> => ({
  day: IGRA_FIXTURE_TODAY,
  totalCostUsd,
  topUsers: [],
  jobCounts: { reserved: jobCounts[0], running: jobCounts[1], done: jobCounts[2], failed: jobCounts[3], refunded: jobCounts[4], queued: jobCounts[5] },
  reapedToday: 0,
  alarmUsd: 50,
  killUsd: 100,
  usageRowsCapped: false,
  jobCountsCapped: false,
  costCapHeartbeatAt: heartbeatMinutesAgo === null ? null : NOW - heartbeatMinutesAgo * 60_000,
  costCapCronFailure: null,
  ...extra,
});

/** Prazna platforma; obična nedelja (3 objave čekaju); sve na granici (plafoni, alarm, čuvar kasni, Crea ugašena). */
export const ADMIN_FIXTURES: Record<IgraFixtureId, AdminFixture> = {
  novi: {
    overview: { tracks: ADMIN_TALLY(0, 0), courses: ADMIN_TALLY(0, 0), lessons: ADMIN_TALLY(0, 0), students: { count: 0, capped: false } },
    usage: ADMIN_USAGE(0, [0, 0, 0, 0, 0, 0], 12),
    creaEnabled: true,
    pendingApprovals: 0,
    now: NOW,
    passed: [],
    refused: [],
  },
  aktivan: {
    overview: { tracks: ADMIN_TALLY(3, 1), courses: ADMIN_TALLY(9, 2, 1), lessons: ADMIN_TALLY(80, 6), students: { count: 240, capped: false } },
    usage: ADMIN_USAGE(12.4, [1, 2, 38, 3, 1, 4], 18),
    creaEnabled: true,
    pendingApprovals: 3,
    now: NOW,
    passed: adminLogTimes([3, 5, 2, 0, 6, 8, 4, 7, 9, 5, 3, 6, 10, 4]),
    refused: adminLogTimes([0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0, 1, 0, 0]),
  },
  legenda: {
    overview: { tracks: ADMIN_TALLY(6, 2, 1), courses: ADMIN_TALLY(31, 5, 4), lessons: ADMIN_TALLY(412, 37), students: { count: 2000, capped: true } },
    usage: ADMIN_USAGE(62.35, [4, 9, 140, 12, 6, 30], 95, { jobCountsCapped: true }),
    creaEnabled: false,
    pendingApprovals: 100,
    now: NOW,
    passed: adminLogTimes([20, 50, 50, 50, 30]),
    refused: adminLogTimes([1, 0, 2, 0, 3, 1, 0, 0, 2, 1, 0, 1, 0, 1]),
  },
};
