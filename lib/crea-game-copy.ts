import type { CreaStickerFamily } from "./crea-album";
import type { LocalizedText } from "./i18n";

/**
 * Tekstovi gejmifikacije Cree (K26): traka u radionici, sveska (album, mapa veština,
 * mini-lekcije, đačka knjižica), pečat „Odličan 5“ i niz dana. Isti obrazac kao
 * `lib/crea-copy.ts`; brojevi idu kroz `fillCopy`.
 */

export const CREA_GAME_COPY = {
  stripLabel: { sr: "Tvoj napredak u Crei", en: "Your progress in Crea" },
  streakChip: { sr: "{n} d. zaredom", en: "{n}-day streak" },
  streakChipLabel: { sr: "Niz: {n} dana zaredom", en: "Streak: {n} days in a row" },
  streakToday: { sr: "Danas još nisi ništa uradio - jedan rad ili lekcija čuva niz.", en: "Nothing yet today - one work or lesson keeps the streak." },
  xpChip: { sr: "{n} XP", en: "{n} XP" },
  albumChip: { sr: "{owned}/{total}", en: "{owned}/{total}" },
  albumChipLabel: { sr: "Album: {owned} od {total} sličica", en: "Album: {owned} of {total} stickers" },
  notebook: { sr: "Sveska", en: "Notebook" },
  notebookLabel: { sr: "Otvori svesku: album, mapa veština i knjižica", en: "Open the notebook: album, skill map and report card" },
} satisfies Record<string, LocalizedText>;

export const CREA_FREE_TRY_COPY = {
  label: { sr: "Besplatna proba", en: "Free try" },
  hint: {
    sr: "Mini-lekcija ti je dala besplatnu probu za ovaj model: rad ide za 0 kredita. Klikni da je isključiš.",
    en: "A mini-lesson gave you a free try for this model: the work costs 0 credits. Click to turn it off.",
  },
} satisfies Record<string, LocalizedText>;

export const CREA_NOTEBOOK_COPY = {
  title: { sr: "Sveska", en: "Notebook" },
  subtitle: {
    sr: "Album sličica, mapa veština i đačka knjižica - sve što si u Crei probao i naučio.",
    en: "Your sticker album, skill map and report card - everything you have tried and learned in Crea.",
  },
  back: { sr: "Nazad u Creu", en: "Back to Crea" },
  tabs: { sr: "Delovi sveske", en: "Notebook sections" },
  tabAlbum: { sr: "Album", en: "Album" },
  tabMap: { sr: "Mapa veština", en: "Skill map" },
  tabCard: { sr: "Knjižica", en: "Report card" },
  guestTitle: { sr: "Sveska čeka tvoje ime", en: "The notebook is waiting for your name" },
  guestBody: { sr: "Prijavi se i svaki rad, lekcija i nova tehnika ulaze u tvoj album.", en: "Sign in and every work, lesson and new technique goes into your album." },
  guestCta: { sr: "Prijavi se", en: "Sign in" },
  loading: { sr: "Otvaram svesku…", en: "Opening the notebook…" },
} satisfies Record<string, LocalizedText>;

export const CREA_STREAK_COPY = {
  title: { sr: "Niz dana", en: "Day streak" },
  days: { sr: "{n} dana zaredom", en: "{n} days in a row" },
  best: { sr: "Najduži niz: {n}", en: "Longest streak: {n}" },
  freezes: { sr: "Zamrzavanja: {n} od 2", en: "Freezes: {n} of 2" },
  next: { sr: "Sledeći cilj: {n} dana", en: "Next goal: {n} days" },
  done: { sr: "Danas je upisano.", en: "Today is done." },
  pending: { sr: "Danas još čeka - jedna lekcija ili jedan rad.", en: "Today is still open - one lesson or one work." },
  rules: {
    sr: "Računa se lekcija ILI rad u Crei. Svakih 7 dana zaredom dobiješ zamrzavanje (najviše 2): ako propustiš dan, ono sačuva niz. Zamrzavanje se ne kupuje.",
    en: "A lesson OR a work in Crea counts. Every 7 days in a row earns a freeze (2 at most): if you miss a day, it keeps the streak. Freezes can't be bought.",
  },
  stateActive: { sr: "urađeno", en: "done" },
  stateFrozen: { sr: "zamrznuto", en: "frozen" },
  stateMissed: { sr: "propušteno", en: "missed" },
  stateToday: { sr: "danas, još čeka", en: "today, still open" },
  burstTitle: { sr: "{n} dana zaredom!", en: "{n} days in a row!" },
  burst7: { sr: "Prva nedelja - Crea ti je postala navika.", en: "Your first week - Crea is becoming a habit." },
  burst30: { sr: "Ceo mesec bez prekida. Svaka čast!", en: "A whole month without a break. Well done!" },
  burst100: { sr: "Sto dana! Ovo je već majstorstvo.", en: "One hundred days! That is mastery." },
  close: { sr: "Zatvori", en: "Close" },
} satisfies Record<string, LocalizedText>;

export const CREA_ALBUM_COPY = {
  title: { sr: "Album sličica", en: "Sticker album" },
  intro: {
    sr: "Svaka nova tehnika koju probaš - pokret kamere, efekat, stil, glas, alat - lepi se kao sličica. Puna strana donosi {n} kredita, jednom.",
    en: "Every new technique you try - a camera move, an effect, a style, a voice, a tool - is stuck in as a sticker. A full page gives {n} credits, once.",
  },
  progress: { sr: "{owned} od {total}", en: "{owned} of {total}" },
  pages: { sr: "Strane albuma", en: "Album pages" },
  prev: { sr: "Prethodna strana", en: "Previous page" },
  next: { sr: "Sledeća strana", en: "Next page" },
  pageOf: { sr: "Strana {n} od {total}", en: "Page {n} of {total}" },
  empty: { sr: "Još nije zalepljena", en: "Not stuck in yet" },
  earned: { sr: "Zalepljena {date}", en: "Stuck in {date}" },
  reward: { sr: "Puna strana: +{n} kr", en: "Full page: +{n} cr" },
  claim: { sr: "Preuzmi {n} kredita", en: "Claim {n} credits" },
  claimed: { sr: "Nagrada preuzeta", en: "Reward claimed" },
  claimedNow: { sr: "{n} kredita je na tvom računu.", en: "{n} credits are in your account." },
  rewardProblem: {
    EMAIL_NIJE_POTVRDJEN: { sr: "Potvrdi email da bi preuzeo nagradu.", en: "Confirm your email to claim the reward." },
    DUPLIRAN_EMAIL: { sr: "Nagrada ide jednom po osobi - već postoji nalog sa ovim emailom.", en: "Rewards go once per person - an account with this email already exists." },
    NALOG_NEDOSTUPAN: { sr: "Nalog trenutno ne može da prima nagrade.", en: "This account can't receive rewards right now." },
    DNEVNI_LIMIT_NAGRADA: { sr: "Danas si preuzeo dve nagrade - ova te čeka sutra.", en: "You've claimed two rewards today - this one waits for tomorrow." },
    STRANA_NIJE_PUNA: { sr: "Strana još nije puna.", en: "The page isn't full yet." },
    VEC_PREUZETO: { sr: "Ova nagrada je već preuzeta.", en: "This reward was already claimed." },
  } satisfies Record<string, LocalizedText>,
  how: { sr: "Kako se skuplja", en: "How to collect" },
} satisfies Record<string, LocalizedText | Record<string, LocalizedText>>;

export const CREA_STICKER_FAMILY_LABEL: Record<CreaStickerFamily, LocalizedText> = {
  prvi: { sr: "Prvi koraci", en: "First steps" },
  alat: { sr: "Alati", en: "Tools" },
  kamera: { sr: "Pokreti kamere", en: "Camera moves" },
  efekat: { sr: "Efekti", en: "Effects" },
  stil: { sr: "Stilovi", en: "Styles" },
  glas: { sr: "Glasovi", en: "Voices" },
  recept: { sr: "Recepti", en: "Recipes" },
};

export const CREA_STAMP_COPY = {
  grade: { sr: "Odličan 5", en: "Excellent 5" },
  firstTime: { sr: "Prvi put: {what}", en: "First time: {what}" },
  newSticker: { sr: "Nova sličica u albumu", en: "A new sticker in your album" },
  more: { sr: "i još {n}", en: "and {n} more" },
  pageFull: { sr: "Puna strana: {what}", en: "Full page: {what}" },
  pageReward: { sr: "Preuzmi {n} kredita u albumu.", en: "Claim {n} credits in the album." },
  openAlbum: { sr: "Otvori album", en: "Open the album" },
  close: { sr: "Zatvori pečat", en: "Close the stamp" },
} satisfies Record<string, LocalizedText>;

export const CREA_MAP_COPY = {
  title: { sr: "Mapa veština", en: "Skill map" },
  intro: {
    sr: "Na početku vidiš šest alata. Ostale otključavaš mini-lekcijom od dva minuta ili testom - nikad plaćanjem.",
    en: "You start with six tools. The rest unlock with a two-minute mini-lesson or a test - never by paying.",
  },
  starter: { sr: "Osnove", en: "Basics" },
  starterBody: { sr: "Ovo imaš od prvog dana.", en: "You have these from day one." },
  tried: { sr: "Probano {n} od {total}", en: "Tried {n} of {total}" },
  unlocked: { sr: "Otključano", en: "Unlocked" },
  locked: { sr: "Zaključano", en: "Locked" },
  lesson: { sr: "Mini-lekcija · 2 min", en: "Mini-lesson · 2 min" },
  test: { sr: "Znam ovo - test", en: "I know this - test" },
  review: { sr: "Ponovi lekciju", en: "Review the lesson" },
  freeTry: { sr: "+ besplatna proba", en: "+ a free try" },
  unlockAll: { sr: "Otključaj sve", en: "Unlock everything" },
  unlockAllOn: { sr: "Svi alati su otključani", en: "All tools are unlocked" },
  unlockAllHint: {
    sr: "Za iskusne: svi alati odmah u spiskovima. Lekcije i dalje donose XP i besplatne probe.",
    en: "For experienced users: every tool in the lists right away. Lessons still give XP and free tries.",
  },
  unlockAllAuto: { sr: "Kao osoblje ili raniji korisnik Cree, vidiš sve alate.", en: "As staff or an earlier Crea user, you see every tool." },
  showGradual: { sr: "Vrati postepeno otkrivanje", en: "Back to gradual unlocking" },
  tools: { sr: "Alati", en: "Tools" },
} satisfies Record<string, LocalizedText>;

export const CREA_LESSON_COPY = {
  card: { sr: "Kartica {n} od {total}", en: "Card {n} of {total}" },
  next: { sr: "Dalje", en: "Next" },
  toQuiz: { sr: "Na pitanja", en: "To the questions" },
  skipToTest: { sr: "Preskoči na test", en: "Skip to the test" },
  quiz: { sr: "Pitanje {n} od {total}", en: "Question {n} of {total}" },
  quizHeader: { sr: "Provera · {n} pitanja", en: "Check · {n} questions" },
  check: { sr: "Proveri odgovore", en: "Check the answers" },
  correct: { sr: "Tačno!", en: "Correct!" },
  wrong: { sr: "Nije baš - probaj ponovo.", en: "Not quite - try again." },
  allRight: { sr: "Sve tačno!", en: "All correct!" },
  passedTitle: { sr: "Položeno!", en: "Passed!" },
  unlockedTools: { sr: "Otključani alati", en: "Unlocked tools" },
  freeTryGranted: { sr: "Dobio si besplatnu probu: {where}", en: "You got a free try: {where}" },
  freeTrySkipped: { sr: "Besplatna proba ide nalogu sa potvrđenim emailom, jednom po osobi.", en: "The free try goes to an account with a confirmed email, once per person." },
  alreadyPassed: { sr: "Ovu lekciju si već položio - alati su otključani.", en: "You already passed this lesson - the tools are unlocked." },
  course: { sr: "Nauči više: {title}", en: "Learn more: {title}" },
  backToMap: { sr: "Nazad na mapu", en: "Back to the map" },
  openTools: { sr: "Probaj alate", en: "Try the tools" },
  close: { sr: "Zatvori lekciju", en: "Close the lesson" },
  why: { sr: "Zašto", en: "Why" },
  failed: { sr: "Bar jedan odgovor nije tačan. Pogledaj označena pitanja.", en: "At least one answer is wrong. Look at the marked questions." },
  sendFailed: { sr: "Odgovori nisu poslati. Pokušaj ponovo za koji trenutak.", en: "The answers weren't sent. Try again in a moment." },
} satisfies Record<string, LocalizedText>;

export const CREA_LOCKED_COPY = {
  title: { sr: "Još {n} alata čeka", en: "{n} more tools are waiting" },
  body: { sr: "Otključaš ih mini-lekcijom od 2 minuta ili testom - besplatno.", en: "Unlock them with a 2-minute mini-lesson or a test - free." },
  lesson: { sr: "Otključaj: {title}", en: "Unlock: {title}" },
} satisfies Record<string, LocalizedText>;

export const CREA_CARD_COPY = {
  title: { sr: "Đačka knjižica", en: "Report card" },
  school: { sr: "Crea · škola stvaranja", en: "Crea · the school of making" },
  student: { sr: "Učenik", en: "Student" },
  subject: { sr: "Predmet", en: "Subject" },
  grade: { sr: "Ocena", en: "Grade" },
  tried: { sr: "Probano", en: "Tried" },
  ungraded: { sr: "neocenjen", en: "not graded" },
  conduct: { sr: "Vladanje", en: "Conduct" },
  overall: { sr: "Opšti uspeh", en: "Overall" },
  overallNone: { sr: "još bez ocena", en: "no grades yet" },
  streak: { sr: "Niz: {n} d.", en: "Streak: {n} d." },
  stickers: { sr: "Sličice: {n}", en: "Stickers: {n}" },
  signature: { sr: "Razredni starešina: Crea", en: "Form teacher: Crea" },
  how: {
    sr: "Ocena raste kako probaš više tehnika predmeta; vladanje prati najduži niz dana.",
    en: "A grade grows as you try more of the subject's techniques; conduct follows your longest streak.",
  },
  share: { sr: "Podeli knjižicu", en: "Share the report card" },
  publicOn: { sr: "Knjižica je javna", en: "The report card is public" },
  publicOff: { sr: "Knjižica je samo tvoja", en: "The report card is private" },
  publicHint: {
    sr: "Kad je javna, vide je članovi na tvom profilu i svako ko ima link (ime, korisničko ime i ocene - ništa drugo).",
    en: "When public, members see it on your profile and anyone with the link (name, username and grades - nothing else).",
  },
  makePublic: { sr: "Učini javnom", en: "Make public" },
  makePrivate: { sr: "Sakrij", en: "Hide" },
  copyLink: { sr: "Kopiraj link", en: "Copy link" },
  copied: { sr: "Link je kopiran.", en: "Link copied." },
  image: { sr: "Preuzmi sliku", en: "Download the image" },
  sharedTitle: { sr: "Đačka knjižica: {name}", en: "Report card: {name}" },
  sharedCta: { sr: "Napravi svoju u Crei", en: "Make yours in Crea" },
  notShared: { sr: "Ova knjižica nije javna.", en: "This report card is not public." },
  profileTitle: { sr: "Đačka knjižica u Crei", en: "Crea report card" },
  profileOpen: { sr: "Otvori u svesci", en: "Open in the notebook" },
} satisfies Record<string, LocalizedText>;
