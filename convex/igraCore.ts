import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { previousWeekKey, weekKeyOfDay } from "../lib/crea-leagues";
import { computeStreak, shiftDayKey, STREAK_WINDOW_DAYS } from "../lib/crea-streak";
import {
  EMPTY_BADGE_COUNTERS,
  evaluateBadges,
  IGRA_BADGES,
  isBadgePublic,
  MENTOR_HELPFUL_ANSWERS,
  TOP10_MIN_WEEK_XP,
  type IgraBadgeCounters,
  type IgraBadgeKey,
  type IgraBadgeProgress,
} from "../lib/igra-badges";
import type { LocalizedText } from "../lib/i18n";
import { resolveBanner } from "../lib/igra-banners";
import { levelFromXp } from "../lib/igra-level";
import { belgradeHour, isEarlyBirdHour, isNightOwlHour } from "../lib/igra-time";
import { normalizeUsername } from "../lib/username-policy";
import { CREA_FLAG_KEYS, readCreaFlag } from "./creaFlags";
import { creaProfileOf } from "./creaGameCore";
import { effectiveRoleForProfile } from "./helpers";
import { isLeaderboardEligibleRole, type LeaderboardSourceType } from "./leaderboardCore";
import { isStudioStaff } from "./studioCore";

/**
 * Napredak IGRA-e (K04, plan K01 §5): nivo, niz dana, 24 bedža i šta je novo. SAMO za
 * prikaz (O6) - ovde se ništa ne dodeljuje: ni XP, ni krediti, ni nagrade.
 *
 * Svako čitanje je indeksirano i ograničeno. Bedž koji je već u dnevniku (`igraSeen`)
 * se ne računa ponovo, pa upit u ljusci vremenom čita sve manje.
 */

/** Dnevnik ima najviše ~80 redova po korisniku (11 nivoa, 24 bedža, kursevi, zbir). */
const LEDGER_LIMIT = 150;
/** Objavljeni kursevi platforme koji se gledaju za „završen kurs". */
const COURSE_LIMIT = 60;
const LESSON_EVENT_LIMIT = 250;
const CHALLENGE_EVENT_LIMIT = 20;
/** „Omiljen" gleda poslednjih ovoliko objavljenih tema autora. */
const FAVORITE_THREAD_LIMIT = 20;
const TOP10 = 10;
/** Mesto na nedeljnoj listi je tačno do ovoliko redova ispred; dalje je `null`. */
const RANK_LIMIT = 100;
/** Brojači na profilu (K13) pokrivaju isti prozor kao javni kalendar aktivnosti. */
export const PROFILE_YEAR_DAYS = 365;

export function badgeSeenKey(key: IgraBadgeKey): string {
  return `badge:${key}`;
}

/** Dnevnik korisnika: ključ → kada je viđen. */
async function ledgerOf(ctx: QueryCtx, userId: Id<"users">): Promise<Map<string, number>> {
  const rows = await ctx.db
    .query("igraSeen")
    .withIndex("by_user_key", (q) => q.eq("userId", userId))
    .take(LEDGER_LIMIT);
  return new Map(rows.map((row) => [row.key, row.seenAt]));
}

/** Najviši nivo koji je već proslavljen (1 ako nijedan). */
function seenLevel(ledger: ReadonlyMap<string, number>): number {
  let level = 1;
  for (const key of ledger.keys()) {
    if (key.startsWith("level:")) level = Math.max(level, Number(key.slice("level:".length)) || 1);
  }
  return level;
}

function statsRow(ctx: QueryCtx, userId: Id<"users">, scopeKey: string, period: "all_time" | "week", periodKey: string) {
  return ctx.db
    .query("leaderboardStats")
    .withIndex("by_userId_and_scopeKey_and_period_and_periodKey", (q) =>
      q.eq("userId", userId).eq("scopeKey", scopeKey).eq("period", period).eq("periodKey", periodKey),
    )
    .unique();
}

function eventsOf(ctx: QueryCtx, userId: Id<"users">, sourceType: LeaderboardSourceType, limit: number) {
  return ctx.db
    .query("leaderboardEvents")
    .withIndex("by_userId_and_sourceType_and_sourceId", (q) => q.eq("userId", userId).eq("sourceType", sourceType))
    .take(limit);
}

type CompletedCourses = { courses: Array<{ id: Id<"courses">; title: LocalizedText }>; tracks: number };

/**
 * Završeni kursevi i staze. Kurs je završen kad su sve njegove objavljene lekcije
 * završene (`publishedLessonCount` prema brojaču lekcija u opsegu tog kursa); staza kad
 * su svi njeni objavljeni kursevi završeni. Kurs bez objavljenih lekcija nije završen.
 */
async function completedCoursesOf(ctx: QueryCtx, userId: Id<"users">): Promise<CompletedCourses> {
  const published = await ctx.db
    .query("courses")
    .withIndex("by_status", (q) => q.eq("status", "published"))
    .take(COURSE_LIMIT);
  const done = await Promise.all(
    published.map(async (course) => {
      const total = course.publishedLessonCount ?? 0;
      if (total <= 0) return false;
      const row = await statsRow(ctx, userId, `course:${course._id}`, "all_time", "all");
      return (row?.completedLessons ?? 0) >= total;
    }),
  );

  const trackDone = new Map<Id<"courseTracks">, boolean>();
  published.forEach((course, index) => {
    if (course.trackId) trackDone.set(course.trackId, (trackDone.get(course.trackId) ?? true) && done[index]!);
  });
  return {
    courses: published
      .filter((_, index) => done[index])
      .map((course) => ({ id: course._id, title: { sr: course.titleSr, en: course.titleEn } })),
    tracks: [...trackDone.values()].filter(Boolean).length,
  };
}

/** Redovi nedeljne liste sa više XP-a od datog (najbliži prvo), najviše `limit`. */
function aheadInWeek(ctx: QueryCtx, weekKey: string, weekXp: number, limit: number) {
  return ctx.db
    .query("leaderboardStats")
    .withIndex("by_scopeKey_and_period_and_periodKey_and_eligible_and_xp", (q) =>
      q.eq("scopeKey", "global").eq("period", "week").eq("periodKey", weekKey).eq("eligible", true).gt("xp", weekXp),
    )
    .take(limit);
}

/** Top 10: bar `TOP10_MIN_WEEK_XP` te nedelje i manje od 10 redova ispred. */
function isWeeklyTop10(weekXp: number, aheadRows: number): boolean {
  return weekXp >= TOP10_MIN_WEEK_XP && aheadRows < TOP10;
}

/** Dnevni izazov radi samo uz fleg javne galerije; učešće = aktivan (odobren) događaj. */
async function challengeOf(ctx: QueryCtx, userId: Id<"users">) {
  if (!(await readCreaFlag(ctx, CREA_FLAG_KEYS.publicGallery))) return { open: false, count: 0 };
  const events = await eventsOf(ctx, userId, "crea_challenge", CHALLENGE_EVENT_LIMIT);
  return { open: true, count: events.filter((event) => event.active).length };
}

/** Top 10 prošle nedelje (čita se samo ako ova nedelja ne prolazi). */
async function wasWeeklyTop10(ctx: QueryCtx, userId: Id<"users">, weekKey: string): Promise<boolean> {
  const lastWeekKey = previousWeekKey(weekKey);
  const lastWeekXp = (await statsRow(ctx, userId, "global", "week", lastWeekKey))?.xp ?? 0;
  if (lastWeekXp < TOP10_MIN_WEEK_XP) return false;
  return isWeeklyTop10(lastWeekXp, (await aheadInWeek(ctx, lastWeekKey, lastWeekXp, TOP10)).length);
}

export type IgraBadgeState = "unlocked" | "fresh" | "locked" | "soon";

export type IgraBadgeView = {
  key: IgraBadgeKey;
  /** `unlocked`: u dnevniku · `fresh`: zarađen, još nije viđen · `soon`: izvor još ne radi. */
  state: IgraBadgeState;
  /** Kada je bedž prvi put viđen; `null` dok nije u dnevniku. */
  unlockedAt: number | null;
  /** Samo za zaključan bedž koji se broji. */
  progress: IgraBadgeProgress | null;
};

/** Sve što ljuska i primitivi crtaju za prijavljenog korisnika. */
export async function progressFor(ctx: QueryCtx, user: Doc<"users">, todayKey: string) {
  const userId = user._id;
  const eligible = isLeaderboardEligibleRole(effectiveRoleForProfile(String(user.email ?? "").toLowerCase(), user.role));
  const weekKey = weekKeyOfDay(todayKey);

  const [ledger, statsAll, statsWeek, days] = await Promise.all([
    ledgerOf(ctx, userId),
    statsRow(ctx, userId, "global", "all_time", "all"),
    statsRow(ctx, userId, "global", "week", weekKey),
    // Isto čitanje kao `creaGameCore.streakFor`; redovi ovde trebaju i za zbir radova.
    ctx.db
      .query("profileActivityDays")
      .withIndex("by_userId_and_dayKey", (q) =>
        q.eq("userId", userId).gte("dayKey", shiftDayKey(todayKey, -STREAK_WINDOW_DAYS)).lte("dayKey", todayKey),
      )
      .take(STREAK_WINDOW_DAYS + 1),
  ]);

  const xp = statsAll?.xp ?? 0;
  const weekXp = statsWeek?.xp ?? 0;
  const completedLessons = statsAll?.completedLessons ?? 0;
  const helpfulAnswers = statsAll?.helpfulAnswers ?? 0;
  const streak = computeStreak(days, todayKey);
  /** Kapija: pravilo se čita samo dok bar jedan od njegovih bedževa nije u dnevniku. */
  const open = (...keys: IgraBadgeKey[]) => keys.some((key) => !ledger.has(badgeSeenKey(key)));

  const [completed, lessonEvents, firstWorks, recipeSticker, techniques, challenge, threads, posts, partners, ahead] = await Promise.all([
    // Kursevi se čitaju i kad su bedževi već tu: novi završen kurs se slavi (`fresh.courses`).
    completedLessons > 0 ? completedCoursesOf(ctx, userId) : { courses: [], tracks: 0 },
    completedLessons > 0 && open("nocna-sova", "rani-pevac") ? eventsOf(ctx, userId, "lesson", LESSON_EVENT_LIMIT) : [],
    // `sourceId` je oblast: najviše tri reda (slika, video, zvuk).
    open("prvi-rad", "prvi-video", "prvi-zvuk") ? eventsOf(ctx, userId, "crea_first_work", 3) : [],
    open("recept")
      ? ctx.db
          .query("creaStickers")
          .withIndex("by_userId_and_stickerId", (q) => q.eq("userId", userId).eq("stickerId", "prvi:recept"))
          .unique()
      : null,
    open("tehnika") ? eventsOf(ctx, userId, "crea_technique", 1) : [],
    open("izazov") ? challengeOf(ctx, userId) : { open: false, count: 0 },
    open("prva-objava")
      ? ctx.db
          .query("profileContributions")
          .withIndex("by_userId_and_hasThread_and_lastActivityAt", (q) => q.eq("userId", userId).eq("hasThread", true))
          .take(1)
      : [],
    open("omiljen")
      ? ctx.db
          .query("communityPosts")
          .withIndex("by_authorId_and_status_and_updatedAt", (q) => q.eq("authorId", userId).eq("status", "published"))
          .order("desc")
          .take(FAVORITE_THREAD_LIMIT)
      : [],
    open("mentor") && helpfulAnswers < MENTOR_HELPFUL_ANSWERS
      ? ctx.db
          .query("studyPartnershipMembers")
          .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
          .take(1)
      : [],
    // Ko je ove nedelje ispred mene: isto čitanje daje i mesto na listi i „Top 10".
    eligible && weekXp > 0 ? aheadInWeek(ctx, weekKey, weekXp, RANK_LIMIT) : [],
  ]);
  const top10 = eligible && open("top-10") && (isWeeklyTop10(weekXp, ahead.length) || (await wasWeeklyTop10(ctx, userId, weekKey)));

  const activeLessonHours = lessonEvents.filter((event) => event.active).map((event) => belgradeHour(event.occurredAt));
  const counters: IgraBadgeCounters = {
    ...EMPTY_BADGE_COUNTERS,
    completedLessons,
    completedTasks: statsAll?.completedTasks ?? 0,
    helpfulAnswers,
    completedCourses: completed.courses.length,
    completedTracks: completed.tracks,
    nightLessons: activeLessonHours.filter(isNightOwlHour).length,
    earlyLessons: activeLessonHours.filter(isEarlyBirdHour).length,
    creaWorks: days.reduce((sum, day) => sum + (day.creaWorks ?? 0), 0),
    creaAreas: firstWorks.filter((event) => event.active).map((event) => event.sourceId),
    recipeWorks: recipeSticker ? 1 : 0,
    techniques: techniques.length,
    challenges: challenge.count,
    challengesOpen: challenge.open,
    threads: threads.length,
    bestThreadUpvotes: Math.max(0, ...posts.map((post) => post.upvoteCount ?? 0)),
    studyPartners: partners.length,
    bestStreak: streak.best,
    weeklyTop10: top10,
  };

  const badges: IgraBadgeView[] = evaluateBadges(counters).map((result) => {
    const seenAt = ledger.get(badgeSeenKey(result.key));
    if (seenAt !== undefined) return { key: result.key, state: "unlocked", unlockedAt: seenAt, progress: null };
    if (result.earned) return { key: result.key, state: "fresh", unlockedAt: null, progress: null };
    if (result.soon) return { key: result.key, state: "soon", unlockedAt: null, progress: null };
    return { key: result.key, state: "locked", unlockedAt: null, progress: result.progress };
  });

  const level = levelFromXp(xp);
  return {
    xp,
    weekXp,
    /**
     * Mesto na nedeljnoj listi, brojano kao na rang-listi (isti XP deli mesto). `null`:
     * korisnik nije na listi, nema XP-a ove nedelje ili je ispred više od `RANK_LIMIT`
     * redova (tačno mesto tada daje `leaderboard.getViewerLeaderboardRow`).
     */
    weekRank: eligible && weekXp > 0 && ahead.length < RANK_LIMIT ? 1 + new Set(ahead.map((row) => row.xp)).size : null,
    level,
    streak,
    /** Uvek 24, redom iz kataloga. */
    badges,
    /** Zarađeno, a još nije u dnevniku: ovo se slavi (`lib/igra-celebrations.ts`). */
    fresh: {
      level: level.level >= 2 && level.level > seenLevel(ledger) ? level.level : null,
      badges: badges.filter((badge) => badge.state === "fresh").map((badge) => badge.key),
      courses: completed.courses
        .filter((course) => !ledger.has(`course:${course.id}`))
        .map((course) => ({ key: `course:${course.id}`, title: course.title })),
      ledgerEmpty: ledger.size === 0,
    },
    /** Izabrani baner profila (K13); `null` = podrazumevani (`IGRA_DEFAULT_BANNER`). */
    banner: resolveBanner(user.igraBanner, level.level),
    /** Da li korisnik ulazi u rang-liste (osoblje ne ulazi). */
    eligible,
    username: user.username ?? null,
  };
}

export type IgraProgress = Awaited<ReturnType<typeof progressFor>>;

/** Ključevi dnevnika koje korisnik trenutno sme da upiše (`igra.markSeen`). */
export function freshSeenKeys(fresh: IgraProgress["fresh"]): string[] {
  return [
    ...(fresh.level !== null ? [`level:${fresh.level}`] : []),
    ...fresh.badges.map(badgeSeenKey),
    ...fresh.courses.map((course) => course.key),
  ];
}

export type IgraMemberBadgeState = "unlocked" | "locked" | "hidden";

/** Nivo korisnika iz ukupnog XP-a (provera nivoa za baner, `igra.setBanner`). */
export async function levelOf(ctx: QueryCtx, userId: Id<"users">): Promise<number> {
  return levelFromXp((await statsRow(ctx, userId, "global", "all_time", "all"))?.xp ?? 0).level;
}

/** Radovi u Crei u poslednjih `PROFILE_YEAR_DAYS` beogradskih dana zaključno sa `todayKey`. */
async function yearWorksOf(ctx: QueryCtx, userId: Id<"users">, todayKey: string): Promise<number> {
  const days = await ctx.db
    .query("profileActivityDays")
    .withIndex("by_userId_and_dayKey", (q) =>
      q.eq("userId", userId).gte("dayKey", shiftDayKey(todayKey, -(PROFILE_YEAR_DAYS - 1))).lte("dayKey", todayKey),
    )
    .take(PROFILE_YEAR_DAYS);
  return days.reduce((sum, day) => sum + (day.creaWorks ?? 0), 0);
}

/**
 * Napredak drugog člana: samo ono što je i danas javno na profilu. Bedževi se čitaju iz
 * dnevnika (pravila se za drugoga ne računaju), a koje drugi vidi odlučuje `isBadgePublic`.
 * Broj radova u Crei vidi samo vlasnik. Osoblje nema nivo ni XP, kao na profilu danas.
 * Vlasnik na svom profilu vidi sve svoje.
 */
export async function memberProgressFor(ctx: QueryCtx, username: string, viewerId: Id<"users">, todayKey: string) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("username", (q) => q.eq("username", normalized))
    .unique();
  if (!user || user.mergedInto || !user.username) return null;

  const isOwner = user._id === viewerId;
  const [statsAll, ledger, creaProfile] = await Promise.all([
    statsRow(ctx, user._id, "global", "all_time", "all"),
    ledgerOf(ctx, user._id),
    isOwner ? null : creaProfileOf(ctx, user._id),
  ]);
  const isStaff = isStudioStaff(effectiveRoleForProfile(String(user.email ?? "").toLowerCase(), user.role));
  const xp = statsAll?.xp ?? 0;
  // Isto što profil drugima već pokazuje: javna knjižica i broj korisnih odgovora.
  const publicProfile = { creaPublic: creaProfile?.reportCardPublic === true, helpfulAnswers: statsAll?.helpfulAnswers ?? 0 };
  const level = levelFromXp(xp);

  return {
    xp: isStaff ? null : xp,
    level: isStaff ? null : level,
    /** Izabrani baner; `null` = podrazumevani. Baner je izgled, javan kao i avatar. */
    banner: resolveBanner(user.igraBanner, level.level),
    /**
     * Radovi u Crei za godinu dana, samo vlasniku: broja radova nema ni javna knjižica, a
     * `todayKey` šalje klijent, pa bi pomeranjem prozora drugi mogao da rekonstruiše dane.
     */
    works: isOwner ? await yearWorksOf(ctx, user._id, todayKey) : null,
    /** Uvek 24, redom iz kataloga. */
    badges: IGRA_BADGES.map((badge): { key: IgraBadgeKey; state: IgraMemberBadgeState } => {
      if (!isOwner && !isBadgePublic(badge.key, publicProfile)) return { key: badge.key, state: "hidden" };
      return { key: badge.key, state: ledger.has(badgeSeenKey(badge.key)) ? "unlocked" : "locked" };
    }),
  };
}
