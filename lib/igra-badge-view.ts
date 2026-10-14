import { igraBadge, type IgraBadgeKey, type IgraBadgeProgress } from "./igra-badges";
import { IGRA_BADGE_FORMS, IGRA_PRIMITIVE_COPY } from "./igra-copy";
import { pluralize, t, type Locale } from "./i18n";

/**
 * Šta nalepnica bedža i trofejna polica kažu i prikazuju (K05; izdvojeno iz
 * `lib/igra-a11y.ts` u K06, bez izmene ponašanja). Zaseban fajl zato što uvozi katalog
 * bedževa, a `igra-a11y` čita ljuska aplikacije na svakoj strani.
 */

const COPY = IGRA_PRIMITIVE_COPY;

/** Ceo nenegativan broj; `NaN`, beskonačno i negativno → 0. */
function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Stanja koja nalepnica crta. Prva četiri vraća `igra:getMyProgress`; `hidden` je tuđi
 * bedž koji nije na polici (K13): neutralna silueta bez uslova, koja ne tvrdi ni da ga
 * član nema ni da ga krije.
 */
export type IgraBadgeViewState = "unlocked" | "fresh" | "locked" | "soon" | "hidden";

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

  if (state === "hidden") {
    return { name, detail: null, status: null, tag: null, label: `${name} — ${COPY.badgeNotShown[locale]}`, locked: true, peel: false };
  }
  if (state === "soon") {
    const soon = COPY.badgeSoon[locale];
    return { name, detail: null, status: soon, tag: COPY.badgeSoonTag[locale], label: `${name} — ${soon.toLowerCase()}`, locked: true, peel: false };
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

const SHELF_ORDER: Record<IgraBadgeViewState, number> = { fresh: 0, unlocked: 1, locked: 2, soon: 3, hidden: 4 };

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
