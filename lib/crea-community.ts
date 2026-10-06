import { CREA_PROMPT_PARAM, CREA_PROMPT_PARAM_MAX, creaShellQuery, type CreaArea, type CreaModeId } from "./crea-shell";
import { shiftDayKey, type StreakDay } from "./crea-streak";

/**
 * Zajednica Cree (K27): javna galerija i remiks (G8), nagrade autorima (G11) i
 * kreativni par sa pozivima (G10). Čista pravila - Convex ih primenjuje u transakciji.
 */

// ── G8 javna galerija ────────────────────────────────────────────────────────

export const PUBLIC_TITLE_MAX = 60;
/** Koliko radova sme da se objavi (ili prijavi na izazov) u jednom beogradskom danu. */
export const PUBLISH_PER_DAY = 10;
/** Koliko radova jedne osobe sme istovremeno da čeka moderaciju. */
export const PENDING_MAX = 20;
export const REJECT_REASON_MAX = 200;

/** `?remiks=<rad>` i `?stil=<stil>` u radionici: zasluga autoru (remiks / deljen stil). */
export const CREA_REMIX_PARAM = "remiks";
export const CREA_STYLE_PARAM = "stil";

export type RemixTarget = { area: string; mode: string; modelSlug: string | null; toolId: string | null };

/**
 * Query radionice za „Napravi svoju verziju": režim i model rada, opis (ako ga je autor
 * podelio) i id rada za zaslugu. Rad lokalnog alata otvara isti alat - bez zasluge, jer
 * besplatan alat ne ide kroz posao (ništa se ne plaća ni ne nagrađuje).
 */
export function remixQuery(workId: string, target: RemixTarget, prompt: string | null): string {
  const query = new URLSearchParams(
    creaShellQuery(
      { area: target.area as CreaArea, mode: target.mode as CreaModeId, tool: target.toolId, goal: null, recipe: null, model: target.modelSlug },
      new URLSearchParams(),
    ),
  );
  if (!target.toolId) {
    if (prompt) query.set(CREA_PROMPT_PARAM, prompt.slice(0, CREA_PROMPT_PARAM_MAX));
    query.set(CREA_REMIX_PARAM, workId);
  }
  return query.toString();
}

/** Query radionice za „Koristi stil": Slika · Napravi sa deljenim stilom. */
export function styleQuery(styleId: string): string {
  const query = new URLSearchParams(creaShellQuery({ area: "slika", mode: "napravi", tool: null, goal: null, recipe: null }, new URLSearchParams()));
  query.set(CREA_STYLE_PARAM, styleId);
  return query.toString();
}

/** Naslov rada: razmaci sabijeni; prazno = bez naslova. Predug baca. */
export function cleanPublicTitle(raw: string | undefined): string | null {
  const title = (raw ?? "").trim().replace(/\s+/g, " ");
  if (title.length > PUBLIC_TITLE_MAX) throw new Error("PREDUG_NASLOV");
  return title || null;
}

// ── G11 nagrade autorima ─────────────────────────────────────────────────────

/** „Recept" = javni rad sa podeljenim opisom koji neko remiksuje; „stil" = podeljen stil. */
export type AuthorRewardKind = "recept" | "stil";

export const AUTHOR_REWARD_CREDITS = 2;
/** Nagrađenih upotreba po autoru: dnevno i mesečno (beogradski dan / mesec). */
export const AUTHOR_REWARDS_PER_DAY = 5;
export const AUTHOR_REWARDS_PER_MONTH = 30;

export type AuthorRewardFacts = {
  sameUser: boolean;
  /** Kredita koje je posao korisnika stvarno platio (besplatna proba = 0). */
  paidCredits: number;
  /** Ovaj korisnik je ovom autoru za ovaj recept/stil već doneo nagradu. */
  alreadyForUser: boolean;
  todayCount: number;
  monthCount: number;
};

export type AuthorRewardBlock = "ISTI_AUTOR" | "BESPLATAN_RAD" | "VEC_NAGRADJENO" | "DNEVNI_LIMIT" | "MESECNI_LIMIT";

/**
 * Zašto upotreba NE donosi nagradu (ili `null` = donosi). Farmovanje drugim nalogom
 * ne isplati se: nagrada je manja od najjeftinijeg plaćenog posla, isti korisnik je
 * donosi jednom po receptu, a autor ima dnevni i mesečni plafon.
 */
export function authorRewardBlock(facts: AuthorRewardFacts): AuthorRewardBlock | null {
  if (facts.sameUser) return "ISTI_AUTOR";
  if (facts.paidCredits < AUTHOR_REWARD_CREDITS) return "BESPLATAN_RAD";
  if (facts.alreadyForUser) return "VEC_NAGRADJENO";
  if (facts.todayCount >= AUTHOR_REWARDS_PER_DAY) return "DNEVNI_LIMIT";
  if (facts.monthCount >= AUTHOR_REWARDS_PER_MONTH) return "MESECNI_LIMIT";
  return null;
}

export function monthKeyOfDay(dayKey: string): string {
  return dayKey.slice(0, 7);
}

// ── G10 kreativni par i pozivi ───────────────────────────────────────────────

export const INVITE_REWARD_CREDITS = 10;
export const INVITE_REWARDS_PER_MONTH = 3;
/** Nagrada važi samo za nalog star najviše ovoliko dana u trenutku prihvatanja. */
export const INVITE_NEW_ACCOUNT_DAYS = 7;
export const INVITE_CODE_LENGTH = 8;
/** Koliko dana unazad se čita aktivnost para (zajednički niz). */
export const PAIR_WINDOW_DAYS = 120;

const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function isInviteCode(value: string): boolean {
  return new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`).test(value);
}

/** Nov kod poziva iz datog izvora slučajnosti (Convex mutacija ima svoj `Math.random`). */
export function makeInviteCode(random: () => number): string {
  let code = "";
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += INVITE_ALPHABET[Math.floor(random() * INVITE_ALPHABET.length)]!;
  }
  return code;
}

/**
 * Dani para za `computeStreak`: dan važi samo kad su OBOJE tog dana uradili lekciju
 * ili rad, i to od dana kad je par nastao.
 */
export function pairStreakDays(a: readonly StreakDay[], b: readonly StreakDay[], sinceDayKey: string): StreakDay[] {
  const active = (day: StreakDay) => day.lessons > 0 || (day.creaWorks ?? 0) > 0;
  const partner = new Set(b.filter(active).map((day) => day.dayKey));
  return a
    .filter((day) => day.dayKey >= sinceDayKey && active(day) && partner.has(day.dayKey))
    .map((day) => ({ dayKey: day.dayKey, lessons: 1 }));
}

/** Prvi dan prozora koji se čita za par (ne pre nastanka para). */
export function pairWindowStart(todayKey: string, pairDayKey: string): string {
  const windowStart = shiftDayKey(todayKey, -PAIR_WINDOW_DAYS);
  return pairDayKey > windowStart ? pairDayKey : windowStart;
}

export type InviteRewardFacts = {
  rewardEligible: boolean;
  rewarded: boolean;
  friendLessonDone: boolean;
  friendWorkDone: boolean;
  rewardsThisMonth: number;
};

export type InviteRewardBlock = "NIJE_NOV_NALOG" | "VEC_PREUZETO" | "PRIJATELJ_NIJE_ZAVRSIO" | "MESECNI_LIMIT";

/** Nagrada za poziv: nov nalog prijatelja, prva lekcija I prvi rad, mesečni plafon. */
export function inviteRewardBlock(facts: InviteRewardFacts): InviteRewardBlock | null {
  if (!facts.rewardEligible) return "NIJE_NOV_NALOG";
  if (facts.rewarded) return "VEC_PREUZETO";
  if (!facts.friendLessonDone || !facts.friendWorkDone) return "PRIJATELJ_NIJE_ZAVRSIO";
  if (facts.rewardsThisMonth >= INVITE_REWARDS_PER_MONTH) return "MESECNI_LIMIT";
  return null;
}
