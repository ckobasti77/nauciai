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
  badgeSoonTag: { sr: "Uskoro", en: "Soon" },
  badgeNotShown: { sr: "nije na polici", en: "not on the shelf" },
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

/** Zajednica (K11): Iskrin poziv u heroju po sekciji, čip autora, obaveštenje koje stigne. */
export const IGRA_COMMUNITY_COPY = {
  callDiscussions: { sr: "Zapelo je? Pitaj. Neko je to već rešio.", en: "Stuck? Ask. Someone has solved it already." },
  callMyThreads: { sr: "Tvoje teme su ovde. Vidi ko ti je odgovorio.", en: "Your topics live here. See who replied." },
  callNotifications: { sr: "Javljam ti čim neko odgovori ili te pomene.", en: "I'll tell you the moment someone replies or mentions you." },
  callMembers: { sr: "Zaprati nekoga ko uči isto što i ti.", en: "Follow someone who is learning what you are." },
  callLeaderboard: { sr: "Svaka lekcija i svaki koristan odgovor se računaju.", en: "Every lesson and every helpful answer counts." },
  callModeration: { sr: "Hvala što čuvaš razgovor korisnim.", en: "Thanks for keeping the conversation useful." },
  lessonsDone: { sr: "Završenih lekcija", en: "Lessons completed" },
  arrivedTag: { sr: "Upravo stiglo", en: "Just in" },
  arrivedIskra: { sr: "Stiglo je nešto novo za tebe.", en: "Something new just came in for you." },
} satisfies Record<string, LocalizedText>;

/** Poruke (K18): Ehova rečenica u razgovoru bez poruka. Ostala prazna stanja zadržavaju svoje tekstove. */
export const IGRA_MESSAGES_COPY = {
  threadEmptyHint: { sr: "Dovoljno je i „Zdravo“.", en: "Even a simple “Hi” is enough." },
} satisfies Record<string, LocalizedText>;

/** Rang liste (K12): podijum, „ti" red i iskreno odbrojavanje do kraja nedelje. */
export const IGRA_LEADERBOARD_COPY = {
  podium: { sr: "Prva tri mesta", en: "Top three" },
  openSpot: { sr: "Slobodno mesto", en: "Open spot" },
  you: { sr: "Ti", en: "You" },
  yourPlace: { sr: "Tvoje mesto", en: "Your place" },
  level: { sr: "Nivo", en: "Level" },
  notRanked: { sr: "Još nisi na ovoj listi", en: "You are not on this list yet" },
  notRankedWeek: { sr: "Prva lekcija ili rad ove nedelje i na listi si.", en: "One lesson or creation this week puts you on the board." },
  notRankedAll: { sr: "Prva lekcija ili rad i na listi si.", en: "One lesson or creation puts you on the board." },
  notRankedTrack: { sr: "Završi lekciju iz ovog smera i na listi si.", en: "Finish a lesson from this track and you are on the board." },
  notRankedCourse: { sr: "Završi lekciju iz ovog kursa i na listi si.", en: "Finish a lesson from this course and you are on the board." },
  weekEnds: { sr: "Nedelja se završava za", en: "This week ends in" },
  weekEndsAt: { sr: "u ponedeljak u 00:00", en: "Monday at 00:00" },
  and: { sr: "i", en: "and" },
  underMinute: { sr: "manje od minuta", en: "less than a minute" },
} satisfies Record<string, LocalizedText>;

/** Profil (K13): baner, karta igrača, trofejna polica, brojači i kalendar godine. */
export const IGRA_PROFILE_COPY = {
  shelfTitle: { sr: "Trofejna polica", en: "Trophy shelf" },
  filterLabel: { sr: "Prikaži bedževe", en: "Show badges" },
  filterAll: { sr: "Sve", en: "All" },
  yearTitle: { sr: "Aktivnost", en: "Activity" },
  yearSpan: { sr: "Poslednjih 12 meseci", en: "Last 12 months" },
  yearEmptyOwn: { sr: "Prvi trag mastila stiže uz prvu lekciju, zadatak ili objavu.", en: "The first ink mark comes with your first lesson, task, or post." },
  yearEmptyMember: { sr: "U poslednjih godinu dana još nema aktivnosti.", en: "No activity in the last year yet." },
  countersLabel: { sr: "Brojači za poslednjih 12 meseci", en: "Counts for the last 12 months" },
  streakBest: { sr: "Najduži niz", en: "Longest streak" },
  bannerEdit: { sr: "Promeni baner", en: "Change banner" },
  bannerTitle: { sr: "Baner profila", en: "Profile banner" },
  bannerBody: {
    sr: "Novi baneri se otključavaju sa nivoom. Menjaju samo izgled profila.",
    en: "New banners unlock as you level up. They only change how your profile looks.",
  },
  bannerSelected: { sr: "Izabran", en: "Selected" },
  bannerFromLevel: { sr: "Od nivoa", en: "From level" },
  bannerLocked: { sr: "zaključan", en: "locked" },
  bannerError: { sr: "Baner nije sačuvan. Pokušaj ponovo.", en: "The banner was not saved. Try again." },
  bannerDone: { sr: "Gotovo", en: "Done" },
  close: { sr: "Zatvori", en: "Close" },
} satisfies Record<string, LocalizedText>;

/** Crea (K15): ulaz „Šta praviš danas?" i zaglavlja radionica sa likovima. */
export const IGRA_CREA_COPY = {
  tilesLabel: { sr: "Izaberi radionicu", en: "Pick a workshop" },
  tileSubSlika: { sr: "sa Piksijem", en: "with Piksi" },
  tileSubVideo: { sr: "sa Kadrom", en: "with Kadar" },
  tileSubZvuk: { sr: "sa Ehom", en: "with Eho" },
  helpSlika: {
    sr: "Opiši šta vidiš: ko, gde i kakvo je svetlo. Ja crtam.",
    en: "Describe what you see: who, where and what the light is like. I'll draw it.",
  },
  helpVideo: {
    sr: "Reci šta se pomera i kuda ide kamera. Kratko je najbolje.",
    en: "Say what moves and where the camera goes. Short works best.",
  },
  helpZvuk: {
    sr: "Napiši tekst ili opiši zvuk, a ja ga pretvaram u glas ili muziku.",
    en: "Write the text or describe the sound and I'll turn it into a voice or music.",
  },
  failHint: { sr: "Desi se, nije strašno. Probaj ponovo.", en: "It happens, no big deal. Try again." },
  stickerNew: { sr: "Novo", en: "New" },
} satisfies Record<string, LocalizedText>;

export const IGRA_LESSON_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "lekcija", few: "lekcije", many: "lekcija" },
  en: { one: "lesson", few: "lessons", many: "lessons" },
};

export const IGRA_DAY_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "dan", few: "dana", many: "dana" },
  en: { one: "day", few: "days", many: "days" },
};

export const IGRA_HOUR_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "sat", few: "sata", many: "sati" },
  en: { one: "hour", few: "hours", many: "hours" },
};

export const IGRA_MINUTE_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "minut", few: "minuta", many: "minuta" },
  en: { one: "minute", few: "minutes", many: "minutes" },
};

export const IGRA_BADGE_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "bedž", few: "bedža", many: "bedževa" },
  en: { one: "badge", few: "badges", many: "badges" },
};

export const IGRA_NEW_BADGE_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "novi bedž", few: "nova bedža", many: "novih bedževa" },
  en: { one: "new badge", few: "new badges", many: "new badges" },
};

export const IGRA_TASK_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "zadatak", few: "zadatka", many: "zadataka" },
  en: { one: "task", few: "tasks", many: "tasks" },
};

export const IGRA_WORK_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "rad", few: "rada", many: "radova" },
  en: { one: "creation", few: "creations", many: "creations" },
};

export const IGRA_POST_FORMS: Record<Locale, PluralForms> = {
  sr: { one: "objava", few: "objave", many: "objava" },
  en: { one: "post", few: "posts", many: "posts" },
};

/**
 * Stanja unutar aplikacije (K23, plan §6.10): zajednički podrazumevani tekstovi. Kratki,
 * topli, bez krivice korisnika; svako stanje kaže šta se desilo i šta sad.
 */
export const IGRA_STATE_COPY = {
  prazno: {
    title: { sr: "Ovde je za sada prazno", en: "Nothing here yet" },
    body: { sr: "Čim se nešto pojavi, videćeš ga ovde.", en: "As soon as something shows up, you will see it here." },
  },
  greska: {
    title: { sr: "Nešto je zastalo", en: "Something stalled" },
    body: { sr: "To nije do tebe. Tvoj napredak je sačuvan, pokušaj ponovo.", en: "That is not on you. Your progress is saved, please try again." },
    cta: { sr: "Pokušaj ponovo", en: "Try again" },
  },
  "404": {
    title: { sr: "Ove strane nema", en: "This page is not here" },
    body: { sr: "Možda je premeštena ili je veza stara. Vrati se na tablu pa kreni odatle.", en: "It may have moved, or the link is old. Head back to your dashboard and start from there." },
    cta: { sr: "Nazad na tablu", en: "Back to the dashboard" },
  },
  ucitavanje: {
    title: { sr: "Učitava se", en: "Loading" },
    body: { sr: "Samo trenutak.", en: "Just a moment." },
  },
  offline: {
    title: { sr: "Nema interneta", en: "You are offline" },
    body: { sr: "Čim se veza vrati, nastavljamo. Ništa nije izgubljeno.", en: "As soon as the connection is back, we carry on. Nothing is lost." },
    cta: { sr: "Pokušaj ponovo", en: "Try again" },
  },
  zakljucano: {
    title: { sr: "Ovo je još zaključano", en: "This is still locked" },
    body: { sr: "Otvoriće se kad bude spremno.", en: "It opens up when it is ready." },
  },
  uskoro: {
    title: { sr: "Stiže uskoro", en: "Coming soon" },
    body: { sr: "Još radimo na ovome. Svrati ponovo malo kasnije.", en: "We are still working on this. Come back a little later." },
  },
} satisfies Record<string, { title: LocalizedText; body: LocalizedText; cta?: LocalizedText }>;
