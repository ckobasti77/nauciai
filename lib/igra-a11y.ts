import { igraBadge, type IgraBadgeKey, type IgraBadgeProgress } from "./igra-badges";
import { IGRA_BADGE_FORMS, IGRA_CELEBRATION_COPY, IGRA_DAY_FORMS, IGRA_PRIMITIVE_COPY } from "./igra-copy";
import { IGRA_LEVELS, IGRA_MAX_LEVEL, levelFromXp } from "./igra-level";
import { formatOdometer } from "./igra-motion";
import { pluralize, t, type Locale } from "./i18n";

/**
 * Šta primitivi IGRA-e kažu i prikazuju (K05, plan K01 §6): formatiranje XP-a i nivoa,
 * tekst stanja i a11y atributi (uloga, naziv, vrednost trake). Čiste funkcije bez DOM-a,
 * da ih vitest proveri; komponente u `components/igra/*` ih samo crtaju.
 */

const COPY = IGRA_PRIMITIVE_COPY;

/** Ceo nenegativan broj; `NaN`, beskonačno i negativno → 0. */
function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

// ── XP i nivo ────────────────────────────────────────────────────────────────

/** „1.250 XP" (sr) / „1,250 XP" (en). */
export function formatXp(xp: number, locale: Locale): string {
  return `${formatOdometer(count(xp), locale)} XP`;
}

/** Nivo stegnut na 1..12 (isto kao amblem `nivo.NN`). */
export function clampLevel(level: number): number {
  return Number.isFinite(level) ? Math.min(IGRA_MAX_LEVEL, Math.max(1, Math.trunc(level))) : 1;
}

/** „Nivo 3" / „Level 3". */
export function formatLevel(level: number, locale: Locale): string {
  return `${IGRA_CELEBRATION_COPY.level[locale]} ${clampLevel(level)}`;
}

/** Ime nivoa: „Skicar" / „Sketcher". */
export function levelName(level: number, locale: Locale): string {
  return IGRA_LEVELS[clampLevel(level) - 1]!.name[locale];
}

/** Naziv pečata za čitač ekrana: „Nivo 3: Skicar". */
export function levelLabel(level: number, locale: Locale): string {
  return `${formatLevel(level, locale)}: ${levelName(level, locale)}`;
}

/** Natpis iznad XP trake: „još 510 XP do nivoa 6"; na poslednjem nivou „Najviši nivo". */
export function xpBarCaption(xp: number, locale: Locale): string {
  const info = levelFromXp(xp);
  if (info.xpForNext === null) return COPY.maxLevel[locale];
  const left = formatXp(info.xpForNext, locale);
  return t(locale, `još ${left} do nivoa ${info.level + 1}`, `${left} to level ${info.level + 1}`);
}

/** Desna strana natpisa: „490 / 1.000 XP" kroz tekući nivo; `null` na poslednjem. */
export function xpBarFraction(xp: number, locale: Locale): string | null {
  const info = levelFromXp(xp);
  if (info.nextMinXp === null) return null;
  return `${formatOdometer(info.xpIntoLevel, locale)} / ${formatXp(info.nextMinXp - info.minXp, locale)}`;
}

export type XpBarA11y = {
  role: "progressbar";
  "aria-label": string;
  "aria-valuemin": 0;
  "aria-valuemax": 100;
  /** Procenat kroz tekući nivo, zaokružen nadole (99,9 % nije „100"). */
  "aria-valuenow": number;
  /** „Nivo 5, 490 od 1.000 XP" - ovo čitač izgovara umesto procenta. */
  "aria-valuetext": string;
};

export function xpBarA11y(xp: number, locale: Locale): XpBarA11y {
  const info = levelFromXp(xp);
  const level = formatLevel(info.level, locale);
  const text =
    info.nextMinXp === null
      ? `${level}, ${COPY.maxLevel[locale].toLowerCase()}, ${formatXp(xp, locale)}`
      : `${level}, ${formatOdometer(info.xpIntoLevel, locale)} ${t(locale, "od", "of")} ${formatXp(info.nextMinXp - info.minXp, locale)}`;
  return {
    role: "progressbar",
    "aria-label": COPY.xpBarLabel[locale],
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": Math.floor(info.progress * 100),
    "aria-valuetext": text,
  };
}

// ── Bedž ─────────────────────────────────────────────────────────────────────

/** Stanja koja nalepnica crta; isti skup vraća `igra:getMyProgress`. */
export type IgraBadgeViewState = "unlocked" | "fresh" | "locked" | "soon";

export type BadgeStickerView = {
  name: string;
  /** Drugi red oblačića: uslov. `null` za „uskoro" (uslov se ne otkriva). */
  detail: string | null;
  /** Treći red: „Osvojeno", napredak „3 / 5" ili „Uskoro"; `null` kad nema šta da se kaže. */
  status: string | null;
  /** Etiketa na samoj nalepnici: „Novo" ili „Uskoro". */
  tag: string | null;
  /** `aria-label` dugmeta: „naziv — uslov", sa stanjem. */
  label: string;
  /** Silueta mastila umesto slike u boji. */
  locked: boolean;
  /** Sjaj i „odlepljivanje" pod mišem: samo osvojen bedž. */
  peel: boolean;
};

export function badgeStickerView(
  key: IgraBadgeKey,
  state: IgraBadgeViewState,
  progress: IgraBadgeProgress | null | undefined,
  locale: Locale,
): BadgeStickerView {
  const badge = igraBadge(key);
  const name = badge.name[locale];
  const condition = badge.condition[locale];

  if (state === "soon") {
    const soon = COPY.badgeSoon[locale];
    return { name, detail: null, status: soon, tag: soon, label: `${name} — ${soon.toLowerCase()}`, locked: true, peel: false };
  }
  if (state === "unlocked" || state === "fresh") {
    const earned = COPY.badgeEarned[locale];
    const tag = state === "fresh" ? COPY.badgeNew[locale] : null;
    const spoken = tag ? `${tag.toLowerCase()}, ${earned.toLowerCase()}` : earned.toLowerCase();
    return { name, detail: condition, status: earned, tag, label: `${name} — ${spoken}`, locked: false, peel: true };
  }
  const current = progress ? Math.min(count(progress.current), progress.target) : 0;
  const spoken = progress ? `, ${current} ${t(locale, "od", "of")} ${progress.target}` : "";
  return {
    name,
    detail: condition,
    status: progress ? `${current} / ${progress.target}` : null,
    tag: null,
    label: `${name} — ${condition}${spoken}`,
    locked: true,
    peel: false,
  };
}

type ShelfBadge = { key: IgraBadgeKey; state: IgraBadgeViewState; unlockedAt: number | null };

const SHELF_ORDER: Record<IgraBadgeViewState, number> = { fresh: 0, unlocked: 1, locked: 2, soon: 3 };

/**
 * Red bedževa za policu: novi, pa osvojeni od najskorijeg, pa zaključani redom iz
 * kataloga (sledeći ciljevi), „uskoro" na kraju. Polica zato nikad nije prazna - nov
 * korisnik vidi siluete prvih bedževa.
 */
export function shelfBadges<Badge extends ShelfBadge>(badges: readonly Badge[], max?: number): Badge[] {
  const sorted = badges
    .map((badge, index) => ({ badge, index }))
    .sort(
      (a, b) =>
        SHELF_ORDER[a.badge.state] - SHELF_ORDER[b.badge.state] ||
        (a.badge.state === "unlocked" ? (b.badge.unlockedAt ?? 0) - (a.badge.unlockedAt ?? 0) : 0) ||
        a.index - b.index,
    )
    .map((row) => row.badge);
  return max === undefined ? sorted : sorted.slice(0, Math.max(0, Math.trunc(max)));
}

/** Koliko je bedževa osvojeno: brojke i rečenica („5 od 24 bedža"). */
export function badgeTally(badges: ReadonlyArray<{ state: IgraBadgeViewState }>, locale: Locale): { earned: number; total: number; text: string; label: string } {
  const earned = badges.filter((badge) => badge.state === "unlocked" || badge.state === "fresh").length;
  const total = badges.length;
  return {
    earned,
    total,
    text: `${earned} / ${total}`,
    label: `${earned} ${t(locale, "od", "of")} ${total} ${pluralize(locale, total, IGRA_BADGE_FORMS[locale])}`,
  };
}

// ── Niz dana ─────────────────────────────────────────────────────────────────

export type StreakFlameView = {
  count: string;
  /** „dan" / „dana". */
  unit: string;
  /** Blag poziv ili potvrda, nikad pretnja (O9). */
  hint: string;
  /** Naziv za čitač ekrana: „Niz: 6 dana. Danas je upisano, plamen gori." */
  label: string;
  /** Danas završeno: plamen gori; inače tinja. */
  burning: boolean;
};

export function streakFlameView(current: number, todayDone: boolean, locale: Locale): StreakFlameView {
  const days = count(current);
  const unit = pluralize(locale, days, IGRA_DAY_FORMS[locale]);
  const hint = todayDone ? COPY.streakDone[locale] : days > 0 ? COPY.streakPending[locale] : COPY.streakStart[locale];
  return {
    count: formatOdometer(days, locale),
    unit,
    hint,
    label: `${COPY.streak[locale]}: ${formatOdometer(days, locale)} ${unit}. ${hint}`,
    burning: todayDone,
  };
}

// ── Mesto na listi ───────────────────────────────────────────────────────────

export type RankMedal = "zlato" | "srebro" | "bronza";

const MEDALS: readonly RankMedal[] = ["zlato", "srebro", "bronza"];

export type RankChipView = {
  /** „#7"; bez mesta „—". */
  text: string;
  /** Naziv za čitač ekrana: „7. mesto na listi". */
  label: string;
  /** Medalja za prva tri mesta. */
  medal: RankMedal | null;
  /** Ima li mesto na listi. */
  ranked: boolean;
};

export function rankChipView(rank: number | null | undefined, locale: Locale): RankChipView {
  if (rank === null || rank === undefined || !Number.isFinite(rank) || rank < 1) {
    return { text: "—", label: COPY.rankNone[locale], medal: null, ranked: false };
  }
  const place = Math.trunc(rank);
  const number = formatOdometer(place, locale);
  return {
    text: `#${number}`,
    label: t(locale, `${number}. mesto na listi`, `Rank ${number} on the leaderboard`),
    medal: MEDALS[place - 1] ?? null,
    ranked: true,
  };
}
