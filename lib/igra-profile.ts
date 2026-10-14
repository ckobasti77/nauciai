import type { IgraBadgeViewState } from "./igra-badge-view";
import { IGRA_BADGE_GROUP_LABEL, IGRA_BADGE_GROUPS, igraBadge, type IgraBadgeGroup, type IgraBadgeKey, type IgraBadgeProgress } from "./igra-badges";
import { IGRA_BANNERS, IGRA_DEFAULT_BANNER, igraBannerArt, isBannerUnlocked, type IgraBannerKey } from "./igra-banners";
import { IGRA_LESSON_FORMS, IGRA_POST_FORMS, IGRA_PROFILE_COPY, IGRA_TASK_FORMS, IGRA_WORK_FORMS } from "./igra-copy";
import { pluralize, t, type Locale, type PluralForms } from "./i18n";

/**
 * Profil kao „karta igrača" (K13, plan K01 §6.5) - čista logika: koji bedževi stoje na
 * polici (moj ili tuđi profil), filter po grupi, brojači za poslednjih 12 meseci i izbor
 * banera. Crta je u `components/igra/profile/*` i `components/igra/trophy-shelf.tsx`.
 *
 * Privatnost: tuđi profil prikazuje samo ono što je i danas javno. Brojači lekcija,
 * zadataka i objava su zbir javnog kalendara aktivnosti (`publicProfiles.getPublicProfile`);
 * radove u Crei (`igra:getMemberProgress.works`) vidi samo vlasnik, a tuđi bedž koji nije u
 * dnevniku ili nije javan (`isBadgePublic`) je neutralna silueta.
 */

/** Dan javne aktivnosti, oblik `getPublicProfile.activity.days`. */
export type ProfileActivityDay = { dayKey: string; lessons: number; tasks: number; threads: number; comments: number; total: number };

/** Ceo nenegativan broj; `NaN`, beskonačno i negativno → 0. */
function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

// ── Polica ───────────────────────────────────────────────────────────────

export type ProfileShelfBadge = {
  key: IgraBadgeKey;
  state: IgraBadgeViewState;
  unlockedAt: number | null;
  progress: IgraBadgeProgress | null;
};

type MyBadge = { key: IgraBadgeKey; state: "unlocked" | "fresh" | "locked" | "soon"; unlockedAt: number | null; progress: IgraBadgeProgress | null };
type MemberBadge = { key: IgraBadgeKey; state: "unlocked" | "locked" | "hidden" };

/**
 * Bedževi police na profilu. `undefined` = učitava se, `null` = nema police (napredak nije
 * dostupan). Vlasnik vidi svoj pun napredak iz ljuske (`igra:getMyProgress`: zaključani sa
 * uslovom, „uskoro" bez njega); kad ljuska nema napredak, pada na `getMemberProgress`.
 * Drugi vide samo osvojene bedževe iz dnevnika, a sve ostalo kao neutralnu siluetu
 * (`hidden`) - bez uslova i bez tvrdnje da ga član nema.
 */
export function profileShelfBadges(input: {
  isOwner: boolean;
  mine: { badges: readonly MyBadge[] } | null | undefined;
  member: { badges: readonly MemberBadge[] } | null | undefined;
}): ProfileShelfBadge[] | null | undefined {
  if (input.isOwner && input.mine) return input.mine.badges.map((badge) => ({ ...badge }));
  if (input.isOwner && input.mine === undefined) return undefined;
  if (!input.member) return input.member;
  return input.member.badges.map((badge) => ({
    key: badge.key,
    state: badge.state === "unlocked" ? "unlocked" : input.isOwner && badge.state === "locked" ? "locked" : "hidden",
    unlockedAt: null,
    progress: null,
  }));
}

export type BadgeFilter = "all" | IgraBadgeGroup;

/** Dugmad filtera police: „Sve" pa grupe, svako sa brojem osvojenih („5/8"). */
export function badgeFilterOptions(
  badges: ReadonlyArray<{ key: IgraBadgeKey; state: IgraBadgeViewState }>,
  locale: Locale,
): { label: string; items: Array<{ id: BadgeFilter; label: string; count: string; ariaLabel: string }> } {
  const earned = (state: IgraBadgeViewState) => state === "unlocked" || state === "fresh";
  const item = (id: BadgeFilter, label: string, list: ReadonlyArray<{ state: IgraBadgeViewState }>) => {
    const won = list.filter((badge) => earned(badge.state)).length;
    return { id, label, count: `${won}/${list.length}`, ariaLabel: `${label}: ${won} ${t(locale, "od", "of")} ${list.length}` };
  };
  return {
    label: IGRA_PROFILE_COPY.filterLabel[locale],
    items: [
      item("all", IGRA_PROFILE_COPY.filterAll[locale], badges),
      ...IGRA_BADGE_GROUPS.map((group) =>
        item(group, IGRA_BADGE_GROUP_LABEL[group][locale], badges.filter((badge) => igraBadge(badge.key).group === group)),
      ),
    ],
  };
}

// ── Brojači i kalendar ───────────────────────────────────────────────────

export type ProfileCounterKey = "lessons" | "tasks" | "works" | "threads";
/** `value: null` = još se učitava (skelet iste veličine, da se pločice ne pomeraju). */
export type ProfileCounter = { key: ProfileCounterKey; value: number | null; unit: string };

const COUNTER_FORMS: Record<ProfileCounterKey, Record<Locale, PluralForms>> = {
  lessons: IGRA_LESSON_FORMS,
  tasks: IGRA_TASK_FORMS,
  works: IGRA_WORK_FORMS,
  threads: IGRA_POST_FORMS,
};

/**
 * Brojači za poslednjih 12 meseci: lekcije, zadaci, radovi u Crei i objave. Lekcije,
 * zadaci i objave su zbir javnog kalendara (isti dani koje kalendar crta). Radovi:
 * broj = pločica, `undefined` = pločica se učitava, `null` = pločice nema (tuđi profil ili
 * napredak nije dostupan).
 */
export function profileCounters(days: readonly ProfileActivityDay[], works: number | null | undefined, locale: Locale): ProfileCounter[] {
  const sum = (field: "lessons" | "tasks" | "threads") => days.reduce((total, day) => total + count(day[field]), 0);
  const counter = (key: ProfileCounterKey, value: number | null): ProfileCounter => ({
    key,
    value,
    unit: pluralize(locale, value ?? 0, COUNTER_FORMS[key][locale]),
  });
  return [
    counter("lessons", sum("lessons")),
    counter("tasks", sum("tasks")),
    ...(works === null ? [] : [counter("works", works === undefined ? null : count(works))]),
    counter("threads", sum("threads")),
  ];
}

/**
 * Radovi za brojač: vlasniku se pločica drži dok upit stiže (njegov broj uvek dolazi),
 * drugima se ne crta unapred, jer im upit radove ne šalje (pločica se ne pojavljuje pa
 * nestaje).
 */
export function profileWorks(isOwner: boolean, member: { works: number | null } | null | undefined): number | null | undefined {
  if (member === undefined) return isOwner ? undefined : null;
  return member?.works ?? null;
}

/** Kalendar profila: svaki javni dan sa ukupnom aktivnošću (lekcije, zadaci, teme, komentari). */
export function profileCalendarActivity(days: readonly ProfileActivityDay[]): Array<{ day: string; completed: number }> {
  return days.map((day) => ({ day: day.dayKey, completed: count(day.total) }));
}

// ── Baner ────────────────────────────────────────────────────────────────

/**
 * Baner koji profil crta. `undefined` = još se ne zna (crta se prazan papir iste
 * veličine, da ne blesne podrazumevani pa pravi). Vlasniku je izbor u napretku ljuske
 * (stiže pre), drugima u `getMemberProgress`; `null` znači podrazumevani.
 */
export function profileBannerKey(input: {
  isOwner: boolean;
  mine: { banner: IgraBannerKey | null } | null | undefined;
  member: { banner: IgraBannerKey | null } | null | undefined;
}): IgraBannerKey | undefined {
  if (input.isOwner && input.mine) return input.mine.banner ?? IGRA_DEFAULT_BANNER;
  if (input.member === undefined) return undefined;
  return input.member?.banner ?? IGRA_DEFAULT_BANNER;
}

export type BannerOption = {
  key: IgraBannerKey;
  art: `baner.${IgraBannerKey}`;
  name: string;
  level: number;
  unlocked: boolean;
  selected: boolean;
  /** „Izabran" ili „Od nivoa 5"; `null` za otključan, neizabran baner. */
  note: string | null;
  /** Naziv dugmeta za čitač ekrana. */
  label: string;
};

/** Šest banera za izbor: otključani na tekućem nivou, izabran je `selected` (ili podrazumevani). */
export function bannerOptions(level: number, selected: IgraBannerKey | null | undefined, locale: Locale): BannerOption[] {
  const current = selected ?? IGRA_DEFAULT_BANNER;
  const copy = IGRA_PROFILE_COPY;
  return IGRA_BANNERS.map((banner) => {
    const unlocked = isBannerUnlocked(banner.key, level);
    const isSelected = unlocked && banner.key === current;
    const levelNote = `${copy.bannerFromLevel[locale]} ${banner.level}`;
    const note = isSelected ? copy.bannerSelected[locale] : unlocked ? null : levelNote;
    const name = banner.name[locale];
    const state = isSelected ? copy.bannerSelected[locale].toLowerCase() : unlocked ? null : `${copy.bannerLocked[locale]}, ${levelNote.toLowerCase()}`;
    return {
      key: banner.key,
      art: igraBannerArt(banner.key),
      name,
      level: banner.level,
      unlocked,
      selected: isSelected,
      note,
      label: state ? `${name} — ${state}` : name,
    };
  });
}
