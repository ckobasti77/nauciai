import { igraArt, igraBedzArt, igraNivoArt, type IgraArtId, type IgraBedzKey } from "./igra-art";
import { IGRA_BADGE_FORMS, IGRA_CELEBRATION_COPY, IGRA_NEW_BADGE_FORMS } from "./igra-copy";
import { pluralize, type Locale, type LocalizedText } from "./i18n";
import type { IgraSfx } from "./igra-sound";

/**
 * Slavlja IGRA-e (K03, plan K01 §3.3) - čista logika: šta se slavi, kojim redom i koliko
 * puta. Crta je `components/igra/celebration-host.tsx`.
 *
 * Pravila: jedno po jedno; isti ključ najviše jednom; redosled kurs → nivo → bedževi; više
 * nivoa odjednom = samo najviši; 3+ bedža odjednom = jedno slavlje; prvi kontakt (prazan
 * dnevnik i 3+ svežih stavki) = jedan zbir; najviše `MAX_CELEBRATIONS_PER_SESSION` po
 * sesiji, ostatak ostaje neviđen za sledeću.
 */

/** Sveže stavke iz `igra:getMyProgress` (`fresh`): zarađeno, a još nije u dnevniku `igraSeen`. */
export type IgraFresh = {
  /** Tekući nivo ako je ≥ 2 i još nije proslavljen. */
  level: number | null;
  badges: readonly IgraBedzKey[];
  /** `key` je ključ dnevnika (`course:<courseId>`). */
  courses: ReadonlyArray<{ key: string; title: LocalizedText }>;
};

/** Oblik `fresh` iz `igra:getMyProgress`: sveže stavke + da li je dnevnik još prazan. */
export type IgraProgressFresh = IgraFresh & { ledgerEmpty: boolean };

export type IgraCelebration =
  | { kind: "level"; key: `level:${number}`; level: number }
  | { kind: "badge"; key: `badge:${IgraBedzKey}`; badge: IgraBedzKey }
  | { kind: "badges"; key: string; badges: IgraBedzKey[] }
  | { kind: "course"; key: `course:${string}`; title: LocalizedText }
  /** `seenKeys`: sve što zbir pokriva i upisuje kao viđeno. */
  | { kind: "summary"; key: "summary"; level: number; badges: number; seenKeys: string[] };

export const MAX_CELEBRATIONS_PER_SESSION = 3;
/** Od ovoliko bedževa odjednom ide jedno zajedničko slavlje. */
export const BADGE_GROUP_MIN = 3;
/** Prazan dnevnik i bar ovoliko svežih stavki = zbir umesto niza slavlja. */
export const SUMMARY_MIN_ITEMS = 3;

const ORDER: Record<IgraCelebration["kind"], number> = { summary: 0, course: 1, level: 2, badges: 3, badge: 3 };
/** Vrste kojih u redu čekanja sme da bude najviše jedna (novija zamenjuje stariju). */
const SINGLE: ReadonlySet<IgraCelebration["kind"]> = new Set(["summary", "level", "badges"]);

function courseKey(key: string): `course:${string}` {
  return key.startsWith("course:") ? (key as `course:${string}`) : `course:${key}`;
}

/** Ključevi dnevnika koje slavlje upisuje kao viđene u trenutku prikaza. */
export function celebrationSeenKeys(celebration: IgraCelebration): string[] {
  if (celebration.kind === "summary") return celebration.seenKeys;
  if (celebration.kind === "badges") return celebration.badges.map((badge) => `badge:${badge}`);
  return [celebration.key];
}

/**
 * Šta se slavi za date sveže stavke. `markKeys` su svi ključevi koje prikazana slavlja
 * pokrivaju; domaćin ih upisuje slavlje po slavlje (`celebrationSeenKeys`), tek kad se
 * svako stvarno prikaže.
 */
export function planCelebrations(fresh: IgraFresh, ledgerEmpty: boolean): { show: IgraCelebration[]; markKeys: string[] } {
  const level = fresh.level !== null && Number.isFinite(fresh.level) && fresh.level >= 2 ? Math.trunc(fresh.level) : null;
  const badges = [...new Set(fresh.badges)];
  const courses = new Map(fresh.courses.map((course) => [courseKey(course.key), course.title]));

  const show: IgraCelebration[] = [];
  for (const [key, title] of courses) show.push({ kind: "course", key, title });
  if (level !== null) show.push({ kind: "level", key: `level:${level}`, level });
  if (badges.length >= BADGE_GROUP_MIN) {
    show.push({ kind: "badges", key: `badges:${[...badges].sort().join("+")}`, badges });
  } else {
    for (const badge of badges) show.push({ kind: "badge", key: `badge:${badge}`, badge });
  }

  const markKeys = show.flatMap(celebrationSeenKeys);
  if (ledgerEmpty && markKeys.length >= SUMMARY_MIN_ITEMS) {
    const seenKeys = [...markKeys, "summary"];
    return { show: [{ kind: "summary", key: "summary", level: level ?? 1, badges: badges.length, seenKeys }], markKeys: seenKeys };
  }
  return { show, markKeys };
}

export type IgraCelebrationQueue = {
  enqueue(celebration: IgraCelebration): void;
  /** Slavlje koje je na redu (ili se upravo prikazuje); `null` kad nema ničega. */
  current(): IgraCelebration | null;
  /** Zatvori tekuće i pređi na sledeće. */
  dismiss(): void;
  subscribe(listener: () => void): () => void;
  /** Koliko ih je u ovoj sesiji došlo na red. */
  shownCount(): number;
};

/** Red slavlja jedne sesije: jedno po jedno, bez ponavljanja ključa, najviše `max`. */
export function createCelebrationQueue(max: number = MAX_CELEBRATIONS_PER_SESSION): IgraCelebrationQueue {
  let pending: IgraCelebration[] = [];
  let active: IgraCelebration | null = null;
  let shown = 0;
  const taken = new Set<string>();
  const listeners = new Set<() => void>();

  function advance(): boolean {
    if (active || shown >= max) return false;
    const next = pending.shift();
    if (!next) return false;
    active = next;
    shown += 1;
    taken.add(next.key);
    return true;
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  return {
    enqueue(celebration) {
      if (taken.has(celebration.key) || pending.some((item) => item.key === celebration.key)) return;
      if (SINGLE.has(celebration.kind)) pending = pending.filter((item) => item.kind !== celebration.kind);
      pending.push(celebration);
      pending.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
      if (advance()) emit();
    },
    current: () => active,
    dismiss() {
      if (!active) return;
      active = null;
      advance();
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    shownCount: () => shown,
  };
}

// ── Prikaz ───────────────────────────────────────────────────────────────────

/**
 * Ime iz alt teksta manifesta: „Nivo 3: Skicar" → „Skicar", „Bedž: Prva lekcija" →
 * „Prva lekcija". Manifest je jedini izvor imena dok K04 ne donese katalog nivoa i
 * bedževa; oblik „vrsta: ime" čuva `lib/igra-celebrations.test.ts`.
 */
function artName(id: IgraArtId, locale: Locale): string {
  const alt = igraArt(id).alt[locale];
  const cut = alt.indexOf(": ");
  return cut === -1 ? alt : alt.slice(cut + 2);
}

/** Najviše ovoliko nalepnica bedževa u jednom slavlju (ostali su u tekstu). */
export const CELEBRATION_STAMPS_MAX = 4;

export type IgraCelebrationView = {
  eyebrow: string;
  title: string;
  body: string | null;
  /** Glavna ilustracija (jedna). */
  hero: IgraArtId;
  /** Amblem nivoa ili nalepnice bedževa koje „udare" kao pečat. */
  stamps: IgraArtId[];
  /** Veliko slavlje (nivo, kraj kursa): jače konfete i 3D pehar na računaru. */
  big: boolean;
  sfx: IgraSfx;
};

/** Sve što kartica slavlja crta, bez upita i bez DOM-a. */
export function celebrationView(celebration: IgraCelebration, locale: Locale): IgraCelebrationView {
  const copy = IGRA_CELEBRATION_COPY;
  switch (celebration.kind) {
    case "level": {
      const emblem = igraNivoArt(celebration.level);
      return {
        eyebrow: copy.levelEyebrow[locale],
        title: artName(emblem, locale),
        body: `${copy.level[locale]} ${celebration.level}`,
        hero: "scena.nivo-gore",
        stamps: [emblem],
        big: true,
        sfx: "level",
      };
    }
    case "badge": {
      const sticker = igraBedzArt(celebration.badge);
      return { eyebrow: copy.badgeEyebrow[locale], title: artName(sticker, locale), body: null, hero: "lik.robi.slavi", stamps: [sticker], big: false, sfx: "badge" };
    }
    case "badges": {
      const stickers = celebration.badges.map(igraBedzArt);
      const count = stickers.length;
      return {
        eyebrow: copy.badgesEyebrow[locale],
        title: `${count} ${pluralize(locale, count, IGRA_NEW_BADGE_FORMS[locale])}`,
        body: stickers.map((sticker) => artName(sticker, locale)).join(", "),
        hero: "lik.robi.slavi",
        stamps: stickers.slice(0, CELEBRATION_STAMPS_MAX),
        big: false,
        sfx: "badge",
      };
    }
    case "course":
      return { eyebrow: copy.courseEyebrow[locale], title: celebration.title[locale], body: null, hero: "scena.kurs-zavrsen", stamps: [], big: true, sfx: "course" };
    case "summary": {
      const emblem = igraNivoArt(celebration.level);
      const count = celebration.badges;
      return {
        eyebrow: copy.summaryEyebrow[locale],
        title: `${copy.level[locale]} ${celebration.level}: ${artName(emblem, locale)}`,
        body: count > 0 ? `${count} ${pluralize(locale, count, IGRA_BADGE_FORMS[locale])}` : null,
        hero: "lik.robi.slavi",
        stamps: [emblem],
        big: false,
        sfx: "badge",
      };
    }
  }
}

/** Rečenica za čitač ekrana (`aria-live`): „Novi nivo: Skicar. Nivo 3." */
export function celebrationAnnouncement(celebration: IgraCelebration, locale: Locale): string {
  const { eyebrow, title, body } = celebrationView(celebration, locale);
  return body ? `${eyebrow}: ${title}. ${body}.` : `${eyebrow}: ${title}.`;
}
