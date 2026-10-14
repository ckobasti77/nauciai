import type { LocalizedText } from "./i18n";

/**
 * Bedževi IGRA-e (K04, plan K01 §5.3): 24 bedža, SAMO za prikaz (O6) - bedž ne nosi ni
 * kredite ni popust. Svaki je pravilo nad brojačima koje server skuplja indeksiranim i
 * ograničenim čitanjima (`convex/igraCore.ts`); ovde je samo katalog i čista računica.
 *
 * Ključ bedža = ID slike bez prefiksa (`bedz.<kljuc>` u `docs/igra/SLIKE.md`); vezu sa
 * manifestom čuva `lib/igra-badges.test.ts`.
 */

export const IGRA_BADGE_GROUPS = ["ucenje", "crea", "zajednica"] as const;
export type IgraBadgeGroup = (typeof IGRA_BADGE_GROUPS)[number];

export const IGRA_BADGE_GROUP_LABEL: Record<IgraBadgeGroup, LocalizedText> = {
  ucenje: { sr: "Učenje", en: "Learning" },
  crea: { sr: "Crea", en: "Crea" },
  zajednica: { sr: "Zajednica i nizovi", en: "Community and streaks" },
};

/** Brojači nad kojima se bedževi računaju. Sve su postojeći podaci; ništa se ne broji iznova. */
export type IgraBadgeCounters = {
  /** `leaderboardStats` (global, ukupno). */
  completedLessons: number;
  completedTasks: number;
  helpfulAnswers: number;
  /** Objavljeni kursevi kojima su sve objavljene lekcije završene. */
  completedCourses: number;
  /** Staze kojima su svi objavljeni kursevi završeni. */
  completedTracks: number;
  /** Lekcije završene između 22 h i 4 h, odnosno između 5 h i 8 h (Beograd). */
  nightLessons: number;
  earlyLessons: number;
  /** Radovi u Crei u prozoru niza dana (`STREAK_WINDOW_DAYS`). */
  creaWorks: number;
  /** Oblasti Cree u kojima postoji prvi rad (`slika`, `video`, `zvuk`). */
  creaAreas: readonly string[];
  recipeWorks: number;
  techniques: number;
  challenges: number;
  /** Da li dnevni izazov uopšte radi (fleg javne galerije Cree). */
  challengesOpen: boolean;
  threads: number;
  /** Najviše glasova „za" na jednoj objavljenoj temi. */
  bestThreadUpvotes: number;
  studyPartners: number;
  /** Najduži niz dana (`computeStreak(...).best`). */
  bestStreak: number;
  /** Među prvih 10 nedeljne liste (ova ili prošla nedelja). */
  weeklyTop10: boolean;
};

export const EMPTY_BADGE_COUNTERS: IgraBadgeCounters = {
  completedLessons: 0,
  completedTasks: 0,
  helpfulAnswers: 0,
  completedCourses: 0,
  completedTracks: 0,
  nightLessons: 0,
  earlyLessons: 0,
  creaWorks: 0,
  creaAreas: [],
  recipeWorks: 0,
  techniques: 0,
  challenges: 0,
  challengesOpen: false,
  threads: 0,
  bestThreadUpvotes: 0,
  studyPartners: 0,
  bestStreak: 0,
  weeklyTop10: false,
};

/** „Mentor": ovoliko korisnih odgovora (ili bar jedan partner za učenje). */
export const MENTOR_HELPFUL_ANSWERS = 5;
/** „Omiljen": ovoliko glasova „za" na jednoj temi. */
export const FAVORITE_UPVOTES = 10;
/** „Top 10": najmanje ovoliko XP-a te nedelje (da ponedeljak u 00:05 ne deli bedž). */
export const TOP10_MIN_WEEK_XP = 100;

type BadgeDef = {
  key: string;
  group: IgraBadgeGroup;
  name: LocalizedText;
  /** Uslov kako ga vidi korisnik („Završi 5 lekcija"). Bedž „uskoro" ga ne prikazuje. */
  condition: LocalizedText;
  /** Bedž je zarađen kad `value(brojači) >= target`. */
  target: number;
  value: (counters: IgraBadgeCounters) => number;
  /** Izvor još ne radi: bedž je zaključan i bez uslova („uskoro"). */
  soon?: (counters: IgraBadgeCounters) => boolean;
};

function streakBadge<Days extends number>(days: Days) {
  return {
    key: `niz-${days}` as `niz-${Days}`,
    group: "zajednica",
    name: { sr: `Niz od ${days} dana`, en: `${days}-day streak` },
    condition: { sr: `Uči ili stvaraj ${days} dana zaredom`, en: `Learn or create ${days} days in a row` },
    target: days,
    value: (c: IgraBadgeCounters) => c.bestStreak,
  } satisfies BadgeDef;
}

export const IGRA_BADGES = [
  // ── Učenje ──
  {
    key: "prva-lekcija",
    group: "ucenje",
    name: { sr: "Prva lekcija", en: "First lesson" },
    condition: { sr: "Završi prvu lekciju", en: "Complete your first lesson" },
    target: 1,
    value: (c) => c.completedLessons,
  },
  {
    key: "prvi-zadatak",
    group: "ucenje",
    name: { sr: "Prvi zadatak", en: "First task" },
    condition: { sr: "Uradi prvi obavezan zadatak", en: "Complete your first required task" },
    target: 1,
    value: (c) => c.completedTasks,
  },
  {
    key: "pet-lekcija",
    group: "ucenje",
    name: { sr: "Pet lekcija", en: "Five lessons" },
    condition: { sr: "Završi 5 lekcija", en: "Complete 5 lessons" },
    target: 5,
    value: (c) => c.completedLessons,
  },
  {
    key: "prvi-kurs",
    group: "ucenje",
    name: { sr: "Prvi kurs", en: "First course" },
    condition: { sr: "Završi ceo kurs", en: "Complete a whole course" },
    target: 1,
    value: (c) => c.completedCourses,
  },
  {
    key: "tri-kursa",
    group: "ucenje",
    name: { sr: "Tri kursa", en: "Three courses" },
    condition: { sr: "Završi 3 kursa", en: "Complete 3 courses" },
    target: 3,
    value: (c) => c.completedCourses,
  },
  {
    key: "staza",
    group: "ucenje",
    name: { sr: "Cela staza", en: "Full track" },
    condition: { sr: "Završi sve kurseve jedne staze", en: "Complete every course in one track" },
    target: 1,
    value: (c) => c.completedTracks,
  },
  {
    key: "nocna-sova",
    group: "ucenje",
    name: { sr: "Noćna sova", en: "Night owl" },
    condition: { sr: "Završi lekciju posle 22 h", en: "Complete a lesson after 10 PM" },
    target: 1,
    value: (c) => c.nightLessons,
  },
  {
    key: "rani-pevac",
    group: "ucenje",
    name: { sr: "Rani pevac", en: "Early bird" },
    condition: { sr: "Završi lekciju pre 8 h", en: "Complete a lesson before 8 AM" },
    target: 1,
    value: (c) => c.earlyLessons,
  },
  // ── Crea ──
  {
    key: "prvi-rad",
    group: "crea",
    name: { sr: "Prvi rad", en: "First creation" },
    condition: { sr: "Napravi prvi rad u Crei", en: "Make your first creation in Crea" },
    target: 1,
    value: (c) => c.creaAreas.length,
  },
  {
    key: "deset-radova",
    group: "crea",
    name: { sr: "Deset radova", en: "Ten creations" },
    condition: { sr: "Napravi 10 radova u Crei", en: "Make 10 creations in Crea" },
    target: 10,
    value: (c) => c.creaWorks,
  },
  {
    key: "sto-radova",
    group: "crea",
    name: { sr: "Sto radova", en: "Hundred creations" },
    condition: { sr: "Napravi 100 radova u Crei", en: "Make 100 creations in Crea" },
    target: 100,
    value: (c) => c.creaWorks,
  },
  {
    key: "prvi-video",
    group: "crea",
    name: { sr: "Prvi video", en: "First video" },
    condition: { sr: "Napravi prvi video", en: "Make your first video" },
    target: 1,
    value: (c) => (c.creaAreas.includes("video") ? 1 : 0),
  },
  {
    key: "prvi-zvuk",
    group: "crea",
    name: { sr: "Prvi zvuk", en: "First audio" },
    condition: { sr: "Napravi prvi zvuk", en: "Make your first audio" },
    target: 1,
    value: (c) => (c.creaAreas.includes("zvuk") ? 1 : 0),
  },
  {
    key: "recept",
    group: "crea",
    name: { sr: "Recept", en: "Recipe" },
    condition: { sr: "Napravi rad po receptu", en: "Make a creation from a recipe" },
    target: 1,
    value: (c) => c.recipeWorks,
  },
  {
    key: "tehnika",
    group: "crea",
    name: { sr: "Tehnika", en: "Technique" },
    condition: { sr: "Isprobaj novu tehniku u Crei", en: "Try a new technique in Crea" },
    target: 1,
    value: (c) => c.techniques,
  },
  {
    key: "izazov",
    group: "crea",
    name: { sr: "Izazov", en: "Challenge" },
    condition: { sr: "Učestvuj u dnevnom izazovu", en: "Take part in a daily challenge" },
    target: 1,
    value: (c) => c.challenges,
    soon: (c) => !c.challengesOpen,
  },
  // ── Zajednica i nizovi ──
  {
    key: "prva-objava",
    group: "zajednica",
    name: { sr: "Prva objava", en: "First post" },
    condition: { sr: "Objavi prvu temu u zajednici", en: "Publish your first topic in the community" },
    target: 1,
    value: (c) => c.threads,
  },
  {
    key: "koristan-odgovor",
    group: "zajednica",
    name: { sr: "Koristan odgovor", en: "Helpful answer" },
    condition: { sr: "Napiši odgovor koji je označen kao koristan", en: "Write an answer that gets marked as helpful" },
    target: 1,
    value: (c) => c.helpfulAnswers,
  },
  {
    key: "omiljen",
    group: "zajednica",
    name: { sr: "Omiljen", en: "Crowd favorite" },
    condition: { sr: `Skupi ${FAVORITE_UPVOTES} glasova na jednoj temi`, en: `Get ${FAVORITE_UPVOTES} votes on one topic` },
    target: FAVORITE_UPVOTES,
    value: (c) => c.bestThreadUpvotes,
  },
  {
    key: "mentor",
    group: "zajednica",
    name: { sr: "Mentor", en: "Mentor" },
    condition: {
      sr: `Daj ${MENTOR_HELPFUL_ANSWERS} korisnih odgovora ili uči sa partnerom za učenje`,
      en: `Give ${MENTOR_HELPFUL_ANSWERS} helpful answers or team up with a study partner`,
    },
    target: MENTOR_HELPFUL_ANSWERS,
    value: (c) => (c.studyPartners > 0 ? MENTOR_HELPFUL_ANSWERS : c.helpfulAnswers),
  },
  streakBadge(3),
  streakBadge(7),
  streakBadge(30),
  {
    key: "top-10",
    group: "zajednica",
    name: { sr: "Top 10", en: "Top 10" },
    condition: { sr: "Uđi u prvih 10 na nedeljnoj listi", en: "Reach the top 10 of the weekly leaderboard" },
    target: 1,
    value: (c) => (c.weeklyTop10 ? 1 : 0),
  },
] as const satisfies readonly BadgeDef[];

export type IgraBadgeKey = (typeof IGRA_BADGES)[number]["key"];
export type IgraBadge = BadgeDef & { key: IgraBadgeKey };

export const IGRA_BADGE_KEYS: readonly IgraBadgeKey[] = IGRA_BADGES.map((badge) => badge.key);

const BY_KEY = new Map<string, IgraBadge>(IGRA_BADGES.map((badge) => [badge.key, badge]));

export function igraBadge(key: IgraBadgeKey): IgraBadge {
  return BY_KEY.get(key)!;
}

export type IgraBadgeProgress = { current: number; target: number };

export type IgraBadgeResult = {
  key: IgraBadgeKey;
  earned: boolean;
  /** Izvor još ne radi: zaključan, bez uslova i bez napretka. */
  soon: boolean;
  /** Samo za bedževe koji se broje (cilj veći od 1); inače `null`. */
  progress: IgraBadgeProgress | null;
};

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Stanje svih 24 bedža za date brojače, redom iz kataloga. */
export function evaluateBadges(counters: IgraBadgeCounters): IgraBadgeResult[] {
  return IGRA_BADGES.map((badge: IgraBadge) => {
    const current = count(badge.value(counters));
    const earned = current >= badge.target;
    const soon = !earned && (badge.soon?.(counters) ?? false);
    return {
      key: badge.key,
      earned,
      soon,
      progress: badge.target > 1 && !soon ? { current: Math.min(current, badge.target), target: badge.target } : null,
    };
  });
}

/**
 * Bedževi koje drugi nikad ne vide: vreme učenja nije javno na profilu, a broj radova u Crei
 * nema ni javna knjižica (ona obećava „ime, korisničko ime i ocene - ništa drugo").
 */
const NEVER_PUBLIC_BADGES: ReadonlySet<IgraBadgeKey> = new Set(["nocna-sova", "rani-pevac", "deset-radova", "sto-radova"]);

/**
 * Da li drugi član sme da vidi bedž iz tuđeg dnevnika (`igra:getMemberProgress`): samo ono
 * što je i danas javno (K29). Ostatak Cree i nizovi (niz broji i rad u Crei) idu samo uz
 * javnu đačku knjižicu, koja već pokazuje ocene i niz. „Mentor" ide samo uz javan broj
 * korisnih odgovora, jer partnerstvo za učenje vide samo njegovi članovi.
 */
export function isBadgePublic(key: IgraBadgeKey, profile: { creaPublic: boolean; helpfulAnswers: number }): boolean {
  if (NEVER_PUBLIC_BADGES.has(key)) return false;
  if (igraBadge(key).group === "crea" || key.startsWith("niz-")) return profile.creaPublic;
  if (key === "mentor") return profile.helpfulAnswers >= MENTOR_HELPFUL_ANSWERS;
  return true;
}
