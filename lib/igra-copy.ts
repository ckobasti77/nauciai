import type { Locale, LocalizedText, PluralForms } from "./i18n";

/**
 * Tekstovi IGRA-e (plan K01, ODLUKA 12): isti oblik kao `lib/crea-*-copy.ts`, van
 * `lib/i18n.ts`. Svaki korak ovde dopisuje svoj blok; sr je primaran, en sekundaran.
 */

export const IGRA_CELEBRATION_COPY = {
  dialogLabel: { sr: "Slavlje", en: "Celebration" },
  levelEyebrow: { sr: "Novi nivo", en: "New level" },
  badgeEyebrow: { sr: "Novi bedž", en: "New badge" },
  badgesEyebrow: { sr: "Novi bedževi", en: "New badges" },
  courseEyebrow: { sr: "Kurs završen", en: "Course completed" },
  summaryEyebrow: { sr: "Tvoj napredak do sada", en: "Your progress so far" },
  level: { sr: "Nivo", en: "Level" },
  continue: { sr: "Nastavi", en: "Continue" },
  close: { sr: "Zatvori", en: "Close" },
} satisfies Record<string, LocalizedText>;

/** Primitivi (K05): XP traka, pečat, bedž, plamen, rang, misija, polica, kartica napretka. */
export const IGRA_PRIMITIVE_COPY = {
  loading: { sr: "Učitava se", en: "Loading" },
  xpBarLabel: { sr: "Napredak nivoa", en: "Level progress" },
  maxLevel: { sr: "Najviši nivo", en: "Top level" },
  badgeEarned: { sr: "Osvojeno", en: "Earned" },
  badgeNew: { sr: "Novo", en: "New" },
  badgeSoon: { sr: "Uskoro", en: "Coming soon" },
  streak: { sr: "Niz", en: "Streak" },
  streakDone: { sr: "Danas je upisano, plamen gori.", en: "Today is logged, the flame is lit." },
  streakPending: { sr: "Jedna lekcija ili rad i plamen gori.", en: "One lesson or creation and the flame is lit." },
  streakStart: { sr: "Jedna lekcija ili rad i niz počinje.", en: "One lesson or creation starts your streak." },
  rankNone: { sr: "Još bez mesta na listi", en: "Not on the leaderboard yet" },
  missionEyebrow: { sr: "Sledeći korak", en: "Next step" },
  missionEmptyTitle: { sr: "Za danas je sve na mestu", en: "You are all set for today" },
  missionEmptyBody: {
    sr: "Nema novog koraka. Istraži kurseve ili napravi nešto u Crei, kad ti bude zgodno.",
    en: "No new step right now. Explore the courses or make something in Crea whenever you like.",
  },
  shelfTitle: { sr: "Bedževi", en: "Badges" },
  shelfAll: { sr: "Svi bedževi", en: "All badges" },
  shelfEmpty: { sr: "Prvi bedž stiže uz prvu lekciju.", en: "Your first badge comes with your first lesson." },
  progressTitle: { sr: "Tvoj napredak", en: "Your progress" },
  progressInvite: { sr: "Završi prvu lekciju i kreni ka nivou 2.", en: "Finish your first lesson and head for level 2." },
} satisfies Record<string, LocalizedText>;

/** Ljuska aplikacije i panel „Moj napredak" (K06). */
export const IGRA_SHELL_COPY = {
  panelTitle: { sr: "Moj napredak", en: "My progress" },
  totalXp: { sr: "Ukupno", en: "Total" },
  streakBest: { sr: "Najduži niz", en: "Longest streak" },
  streakRecent: { sr: "Poslednjih 14 dana", en: "Last 14 days" },
  weekTitle: { sr: "Ova nedelja", en: "This week" },
  weekRank: { sr: "Mesto na nedeljnoj listi", en: "Weekly leaderboard rank" },
  weekEmpty: { sr: "Prva lekcija ili rad ove nedelje i na listi si.", en: "One lesson or creation this week puts you on the board." },
  weekBeyond: { sr: "Van prvih 100 ove nedelje. Tačno mesto je na rang listi.", en: "Outside the top 100 this week. Your exact rank is on the leaderboard." },
  weekStaff: { sr: "Nalozi tima nisu na rang listi.", en: "Team accounts are not ranked." },
  profileLink: { sr: "Moj profil", en: "My profile" },
  leaderboardLink: { sr: "Rang lista", en: "Leaderboard" },
} satisfies Record<string, LocalizedText>;

export const IGRA_DAY_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "dan", few: "dana", many: "dana" },
  en: { one: "day", few: "days", many: "days" },
};

export const IGRA_BADGE_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "bedž", few: "bedža", many: "bedževa" },
  en: { one: "badge", few: "badges", many: "badges" },
};

export const IGRA_NEW_BADGE_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "novi bedž", few: "nova bedža", many: "novih bedževa" },
  en: { one: "new badge", few: "new badges", many: "new badges" },
};
