import { IGRA_DAY_FORMS, IGRA_HOUR_FORMS, IGRA_LEADERBOARD_COPY, IGRA_MINUTE_FORMS } from "./igra-copy";
import { belgradeHour } from "./igra-time";
import { pluralize, type Locale, type PluralForms } from "./i18n";

/**
 * Rang lista (K12, IGRA-PLAN §5): čiste odluke iza podijuma, „ti" reda, odbrojavanja i
 * promene mesta. Upiti se ne menjaju; ovde je samo ono što UI radi sa redovima koje
 * `leaderboard.listLeaderboard` i `leaderboard.getViewerLeaderboardRow` već vraćaju.
 */

const COPY = IGRA_LEADERBOARD_COPY;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type LeaderboardPeriod = "week" | "all_time";
export type LeaderboardScopeKind = "global" | "track" | "course";

type Ranked = { userId: string; rank: number };

// ── Kraj nedelje ─────────────────────────────────────────────────────────────

/**
 * Kraj nedelje `weekKey` (ponedeljak `YYYY-MM-DD`, kao `belgradeWeekKey`): sledeći
 * ponedeljak u 00:00 po Beogradu. Beograd je UTC+1 zimi i UTC+2 leti, a promena sata je
 * uvek u nedelju u 02:00 / 03:00, pa ponedeljak u ponoć ima tačno jedno rešenje. `null`
 * za ključ koji nije ponedeljak.
 */
export function weekEndsAt(weekKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekKey);
  if (!match) return null;
  const monday = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(monday) || new Date(monday).toISOString().slice(0, 10) !== weekKey) return null;
  if (new Date(monday).getUTCDay() !== 1) return null;
  const nextMidnightUtc = monday + 7 * DAY_MS;
  for (const offsetHours of [1, 2]) {
    const candidate = nextMidnightUtc - offsetHours * HOUR_MS;
    if (belgradeHour(candidate) === 0) return candidate;
  }
  return null;
}

function amount(count: number, forms: Record<Locale, PluralForms>, locale: Locale) {
  return `${count} ${pluralize(locale, count, forms[locale])}`;
}

/**
 * Preostalo vreme na minut, bez sekundi: „2 dana i 5 sati", „5 sati i 12 minuta",
 * „12 minuta". Zaokružuje NADOLE, da tekst nikad ne obeća više vremena nego što ga ima.
 */
export function remainingText(ms: number, locale: Locale): string {
  const minutes = Number.isFinite(ms) ? Math.floor(Math.max(0, ms) / MINUTE_MS) : 0;
  if (minutes < 1) return COPY.underMinute[locale];
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts =
    days > 0
      ? [amount(days, IGRA_DAY_FORMS, locale), hours > 0 ? amount(hours, IGRA_HOUR_FORMS, locale) : null]
      : hours > 0
        ? [amount(hours, IGRA_HOUR_FORMS, locale), rest > 0 ? amount(rest, IGRA_MINUTE_FORMS, locale) : null]
        : [amount(rest, IGRA_MINUTE_FORMS, locale)];
  return parts.filter(Boolean).join(` ${COPY.and[locale]} `);
}

export type WeekCountdown = { text: string; endsAtLabel: string; endsAt: number };

/**
 * Odbrojavanje do kraja nedelje koju lista prikazuje. Iskreno (O9): stvaran kraj iz
 * `weekKey`, tekst na minut, bez sekundi i bez boje hitnosti. Kad je kraj prošao (lista
 * se još nije osvežila) ili je ključ iz budućnosti (sat uređaja kasni), odbrojavanja nema.
 */
export function weekCountdown(weekKey: string, now: number, locale: Locale): WeekCountdown | null {
  const endsAt = weekEndsAt(weekKey);
  if (endsAt === null || !Number.isFinite(now)) return null;
  const remaining = endsAt - now;
  if (remaining <= 0 || remaining > 7 * DAY_MS + HOUR_MS) return null;
  return {
    text: `${COPY.weekEnds[locale]} ${remainingText(remaining, locale)}`,
    endsAtLabel: COPY.weekEndsAt[locale],
    endsAt,
  };
}

// ── Podijum i lista ──────────────────────────────────────────────────────────

/** Prva tri reda sa mestom ≤ 3 idu na podijum; ostali (i četvrti izjednačeni) u listu. */
export function splitPodium<Row extends Ranked>(rows: readonly Row[]): { podium: Row[]; rest: Row[] } {
  const podium = rows.filter((row) => row.rank <= 3).slice(0, 3);
  const onPodium = new Set(podium.map((row) => row.userId));
  return { podium, rest: rows.filter((row) => !onPodium.has(row.userId)) };
}

/** Visina stepenika: prvo mesto najviše. Izjednačeni dele visinu jer dele mesto. */
export function podiumStep(rank: number): 1 | 2 | 3 {
  return rank <= 1 ? 1 : rank === 2 ? 2 : 3;
}

/**
 * Nivo (12 nivoa iz `lib/igra-level`) se računa iz UKUPNOG XP-a. Red liste nosi XP svog
 * perioda i opsega, pa je to ukupan XP samo na listi „Ukupno" za celu platformu. Na
 * nedeljnoj listi i u smeru ili kursu nivo bi bio izmišljen, pa se ne prikazuje.
 */
export function rowXpIsTotal(scopeKind: LeaderboardScopeKind, period: LeaderboardPeriod): boolean {
  return scopeKind === "global" && period === "all_time";
}

/**
 * Da li je promenjen redosled redova koji postoje i pre i posle (Flip treba samo tada).
 * Dodati redovi na kraju („Učitaj još") i nestali redovi sami po sebi nisu promena mesta.
 */
export function rankOrderChanged(previous: readonly string[], next: readonly string[]): boolean {
  const before = new Set(previous);
  const after = new Set(next);
  const kept = previous.filter((id) => after.has(id));
  const now = next.filter((id) => before.has(id));
  return kept.some((id, index) => now[index] !== id);
}

// ── „Ti" red ─────────────────────────────────────────────────────────────────

export type ViewerBar = { kind: "row"; onBoard: boolean } | { kind: "unranked" } | null;

/**
 * Šta stoji u lepljivom „ti" redu. Nalozi tima se ne rangiraju (bez reda); prazna lista
 * ima svoje prazno stanje (bez reda); bez XP-a u ovom periodu je blag poziv; inače je to
 * moj red, a `onBoard` kaže da li je već na podijumu ili u učitanom delu liste (tada se
 * red sakrije dok je moj pravi red u kadru).
 */
export function viewerBar<Row extends Ranked>(
  viewer: { eligible: boolean; row: Row | null } | undefined,
  rows: readonly Row[],
): ViewerBar {
  if (!viewer?.eligible || rows.length === 0) return null;
  const mine = viewer.row;
  if (!mine) return { kind: "unranked" };
  return { kind: "row", onBoard: rows.some((row) => row.userId === mine.userId) };
}

/** Blag poziv kad me nema na listi, po periodu i opsegu (smer i kurs broje samo lekcije). */
export function unrankedHint(scopeKind: LeaderboardScopeKind, period: LeaderboardPeriod, locale: Locale): string {
  if (scopeKind === "track") return COPY.notRankedTrack[locale];
  if (scopeKind === "course") return COPY.notRankedCourse[locale];
  return period === "week" ? COPY.notRankedWeek[locale] : COPY.notRankedAll[locale];
}
