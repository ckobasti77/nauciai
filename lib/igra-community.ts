import type { CommunityBadgeKey } from "./community-gamification";
import type { IgraBadgeKey } from "./igra-badges";
import { IGRA_COMMUNITY_COPY, IGRA_LESSON_FORMS } from "./igra-copy";
import { formatOdometer } from "./igra-motion";
import { pluralize, type Locale } from "./i18n";

/**
 * Zajednica (K11) - čista logika bez React-a i bez upita. Sve ulazi iz polja koja
 * zajednica VEĆ čita: `authorRank` na temi i komentaru, `xp` i `helpfulAnswers` na redu
 * člana, `createdAt` na obaveštenju.
 *
 * Katalog bedževa se ovde uvozi samo kao TIP: ovaj fajl čita ljuska zajednice na svakoj
 * njenoj ruti, pa ne sme da povuče katalog u početni JS.
 */

// ── Heroj ────────────────────────────────────────────────────────────────────

const HERO_CALL = {
  discussions: IGRA_COMMUNITY_COPY.callDiscussions,
  "my-threads": IGRA_COMMUNITY_COPY.callMyThreads,
  notifications: IGRA_COMMUNITY_COPY.callNotifications,
  members: IGRA_COMMUNITY_COPY.callMembers,
  leaderboard: IGRA_COMMUNITY_COPY.callLeaderboard,
  moderation: IGRA_COMMUNITY_COPY.callModeration,
} as const;

/** Iskrina rečenica u heroju; nepoznata sekcija dobija poziv diskusija. */
export function communityHeroCall(section: string, locale: Locale): string {
  const call = Object.hasOwn(HERO_CALL, section) ? HERO_CALL[section as keyof typeof HERO_CALL] : HERO_CALL.discussions;
  return call[locale];
}

// ── Autor teme i komentara ───────────────────────────────────────────────────

export type AuthorRankView = {
  /** „17 lekcija" / „17 lessons". */
  text: string;
  /** Naziv za čitač ekrana: „Završenih lekcija: 17". */
  label: string;
};

/**
 * Čip autora na temi i komentaru. Red nosi samo broj završenih lekcija (`authorRank`),
 * ne i XP, pa čip kaže baš to - nivo se ovde NE izvodi (bio bi druga skala od nivoa u
 * ljusci i na profilu). Bez ranga (nalog tima) i bez ijedne lekcije čipa nema.
 */
export function authorRankView(rank: { completedLessons: number } | null | undefined, locale: Locale): AuthorRankView | null {
  const lessons = rank && Number.isFinite(rank.completedLessons) ? Math.floor(rank.completedLessons) : 0;
  if (lessons < 1) return null;
  const count = formatOdometer(lessons, locale);
  return {
    text: `${count} ${pluralize(locale, lessons, IGRA_LESSON_FORMS[locale])}`,
    label: `${IGRA_COMMUNITY_COPY.lessonsDone[locale]}: ${count}`,
  };
}

// ── Značke člana ─────────────────────────────────────────────────────────────

/**
 * Značka zajednice → nalepnica bedža sa istim uslovom. „Deset komentara" nema svoj bedž,
 * pa ostaje ikonica.
 */
export const COMMUNITY_BADGE_STICKER: Record<CommunityBadgeKey, IgraBadgeKey | null> = {
  first_thread: "prva-objava",
  ten_comments: null,
  first_helpful: "koristan-odgovor",
  week_streak: "niz-7",
};

// ── Obaveštenje koje stigne dok je strana otvorena ───────────────────────────

/** Trenutak najnovijeg reda u listi; prazna lista je 0 (sve što stigne posle je novo). */
export function newestCreatedAt(items: readonly { createdAt: number }[]): number {
  return items.reduce((newest, item) => (item.createdAt > newest ? item.createdAt : newest), 0);
}

/**
 * „Pristiglo" je ono što je novije od najnovijeg reda zatečenog pri otvaranju liste.
 * Poredi se serversko vreme sa serverskim, pa sat uređaja ne utiče, a starije strane
 * („Prikaži još") nikad nisu pristigle.
 */
export function isArrival(item: { createdAt: number }, baseline: number): boolean {
  return item.createdAt > baseline;
}
