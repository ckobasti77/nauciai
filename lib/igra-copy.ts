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

/** Kontrolna tabla (K08): heroj po dobu dana, misija dana, Crea brzi start, kalendar. */
export const IGRA_DASHBOARD_COPY = {
  greetingJutro: { sr: "Dobro jutro", en: "Good morning" },
  greetingDan: { sr: "Dobar dan", en: "Good afternoon" },
  greetingVece: { sr: "Dobro veče", en: "Good evening" },
  greetingNoc: { sr: "Zdravo", en: "Hi" },
  robiJutro: { sr: "Kafa je skuvana, sveska otvorena. Šta danas učimo?", en: "Coffee is on, the notebook is open. What are we learning today?" },
  robiDan: { sr: "Dobar trenutak za jedan mali korak. Tu sam ako zapne.", en: "A good moment for one small step. I'm here if you get stuck." },
  robiVece: { sr: "Veče je za mirno učenje. Jedna lekcija, pa odmor.", en: "Evenings are for quiet learning. One lesson, then rest." },
  robiNoc: { sr: "Sova i ja još ne spavamo. Polako, bez žurbe.", en: "The Owl and I are still up. Take it slow, no rush." },
  openClassroom: { sr: "Otvori učionicu", en: "Open classroom" },
  lessonsDone: { sr: "završenih lekcija", en: "lessons completed" },
  missionCourseTitle: { sr: "Izaberi prvi kurs", en: "Pick your first course" },
  missionCourseBody: {
    sr: "Pogledaj šta te čeka i otključaj kurs koji ti najviše leži.",
    en: "See what is waiting and unlock the course that suits you best.",
  },
  missionCourseCta: { sr: "Pogledaj kurseve", en: "Browse courses" },
  missionLessonFirstTitle: { sr: "Započni prvu lekciju", en: "Start your first lesson" },
  missionLessonStartCta: { sr: "Započni lekciju", en: "Start the lesson" },
  missionLessonCta: { sr: "Nastavi lekciju", en: "Continue the lesson" },
  missionCreaTitle: { sr: "Napravi prvi rad u Crei", en: "Make your first creation in Crea" },
  missionCreaBody: { sr: "Jedna rečenica je dovoljna. Piksi je pretvara u sliku.", en: "One sentence is enough. Piksi turns it into an image." },
  missionCreaCta: { sr: "Otvori Creu", en: "Open Crea" },
  missionCommunityTitle: { sr: "Javi se zajednici", en: "Say hi to the community" },
  missionCommunityBody: {
    sr: "Postavi prvo pitanje ili se predstavi. Neko će ti odgovoriti.",
    en: "Ask your first question or introduce yourself. Someone will answer.",
  },
  missionCommunityCta: { sr: "Otvori zajednicu", en: "Open the community" },
  missionMoreTitle: { sr: "Još jedna lekcija?", en: "One more lesson?" },
  creaEyebrow: { sr: "Crea", en: "Crea" },
  creaTitle: { sr: "Šta praviš danas?", en: "What are you making today?" },
  creaImage: { sr: "Slika", en: "Image" },
  creaVideo: { sr: "Video", en: "Video" },
  creaSound: { sr: "Zvuk", en: "Sound" },
  calendarTitle: { sr: "Tvoj trag", en: "Your trail" },
  calendarEmpty: { sr: "Prvi trag mastila stiže uz prvu lekciju ili rad.", en: "The first ink mark comes with your first lesson or creation." },
  calendarToday: { sr: "danas", en: "today" },
  calendarLess: { sr: "manje", en: "less" },
  calendarMore: { sr: "više", en: "more" },
} satisfies Record<string, LocalizedText>;

/** Učionica (K09): kartice kurseva, traka koraka, kraj lekcije. */
export const IGRA_CLASSROOM_COPY = {
  stampDone: { sr: "Završeno", en: "Completed" },
  courseReview: { sr: "Ponovi", en: "Review" },
  courseDoneRing: { sr: "završen", en: "completed" },
  stepsLabel: { sr: "Koraci lekcije", en: "Lesson steps" },
  lessonFinished: { sr: "Lekcija je završena", en: "Lesson completed" },
  doneTitle: { sr: "Lekcija završena", en: "Lesson complete" },
  doneRepeat: { sr: "Lekcija je zapisana.", en: "The lesson is logged." },
  nextEyebrow: { sr: "Sledeće", en: "Up next" },
  nextCta: { sr: "Sledeća lekcija", en: "Next lesson" },
  backToCourse: { sr: "Nazad na kurs", en: "Back to the course" },
  courseDone: { sr: "Ovo je bila poslednja lekcija. Kurs je završen.", en: "That was the last lesson. The course is complete." },
} satisfies Record<string, LocalizedText>;

/** Mapa puta (K10): stanja stanica i nazivi mape za čitač ekrana. */
export const IGRA_JOURNEY_COPY = {
  here: { sr: "Ti si ovde", en: "You are here" },
  done: { sr: "Urađeno", en: "Done" },
  open: { sr: "Dostupno", en: "Available" },
  locked: { sr: "Zaključano", en: "Locked" },
  courseLabel: { sr: "Mapa puta kroz kurs", en: "Journey map of the course" },
  trackLabel: { sr: "Mapa puta kroz smer", en: "Journey map of the track" },
} satisfies Record<string, LocalizedText>;

export const IGRA_LESSON_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "lekcija", few: "lekcije", many: "lekcija" },
  en: { one: "lesson", few: "lessons", many: "lessons" },
};

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
