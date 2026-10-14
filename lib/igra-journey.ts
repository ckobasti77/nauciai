import { coursePath, lessonPath } from "./app-routes";
import { IGRA_LESSON_FORMS } from "./igra-copy";
import { IGRA_MOTION } from "./igra-motion";
import { localized, pluralize, type Locale, type LocalizedText } from "./i18n";

/**
 * Mapa puta (K10, plan K07 §3) - čista logika: stanja stanica, geometrija putanje za oba
 * rasporeda i stanice kursa (lekcije) i smera (kursevi). Crta je
 * `components/igra/journey-map.tsx`; ovde nema ni DOM-a ni pregledača.
 */

// ── Stanice ──────────────────────────────────────────────────────────────────

/** `open` = otključano, a nije na redu: aplikacija nema zaključavanje po redu (K07 ODLUKA 9). */
export type JourneyState = "done" | "next" | "open" | "locked";

export type JourneyStation = {
  id: string;
  title: string;
  /** Kratak podatak ispod naslova („8 min", „3/9 lekcija"). */
  meta?: string;
  state: JourneyState;
  /** Bez adrese stanica nije link (zaključana lekcija). */
  href?: string;
};

/** Stanja redom: zaključano, urađeno, prva otključana neurađena je „sledeće", ostale „dostupno". */
export function journeyStates(items: ReadonlyArray<{ done: boolean; locked: boolean }>): JourneyState[] {
  let nextTaken = false;
  return items.map((item) => {
    if (item.locked) return "locked";
    if (item.done) return "done";
    if (nextTaken) return "open";
    nextTaken = true;
    return "next";
  });
}

/**
 * Stanica do koje je put pređen (indeks): „sledeće", a kad nje nema poslednja urađena.
 * `-1` kad nema ni jedne ni druge - tada nema ni pređenog dela.
 */
export function journeyTraveledTo(states: readonly JourneyState[]): number {
  const next = states.indexOf("next");
  return next >= 0 ? next : states.lastIndexOf("done");
}

/** Koliko traje iscrtavanje pređenog dela: duži put se crta duže, do gornje granice. */
export function journeyDrawSeconds(traveledTo: number): number {
  const stations = Number.isFinite(traveledTo) ? Math.max(0, Math.trunc(traveledTo)) + 1 : 1;
  return Math.min(IGRA_MOTION.fill + 0.7, 0.4 + 0.2 * stations);
}

// ── Geometrija ───────────────────────────────────────────────────────────────

export type JourneyPoint = { x: number; y: number };

export type JourneyLayout = {
  width: number;
  height: number;
  /** Centri stanica, redom kojim ide put. */
  points: JourneyPoint[];
  /** Potez od početka puta do prve stanice (`M … C …`). */
  lead: string;
  /** `segments[i]` nastavlja put od stanice `i` do stanice `i + 1` (samo `C …`). */
  segments: string[];
};

/**
 * Širok raspored (jedinice viewBox-a; SVG se skalira srazmerno): redovi do `perRow`
 * stanica, smer se smenjuje, a na kraju reda put skreće u sledeći. Uspravan raspored je
 * u pikselima 1:1: jedna linija uz levu ivicu, stanica na svakih `step`.
 */
export const JOURNEY_WIDE = { width: 1000, perRow: 5, top: 112, rowGap: 264, bottom: 124, turn: 82, lead: 110, sway: 14 } as const;
export const JOURNEY_TALL = { width: 44, step: 88, sway: 7 } as const;

type Waypoint = JourneyPoint & { station: boolean };

const round = (value: number) => Math.round(value * 10) / 10;
const pair = (point: JourneyPoint) => `${round(point.x)} ${round(point.y)}`;

/**
 * „Drhtaj ruke" u [-1, 1) po indeksu. Celobrojni heš, ne `Math.random` ni `Math.sin`:
 * isti broj na serveru i u svakom pregledaču, pa nema neslaganja pri hidrataciji.
 */
function tremor(index: number): number {
  return (Math.imul(index + 1, 2654435761) >>> 0) / 2147483648 - 1;
}

/** Glatka kriva (Catmull-Rom → kubni Bezier) od tačke `index` do sledeće. */
function curve(points: readonly JourneyPoint[], index: number): string {
  const from = points[index]!;
  const to = points[index + 1]!;
  const before = points[index - 1] ?? from;
  const after = points[index + 2] ?? to;
  const c1 = { x: from.x + (to.x - before.x) / 6, y: from.y + (to.y - before.y) / 6 };
  const c2 = { x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6 };
  return ` C ${pair(c1)} ${pair(c2)} ${pair(to)}`;
}

/** Put kroz tačke, isečen na stanicama: potez do prve stanice, pa deo po deo između stanica. */
function trace(width: number, height: number, waypoints: readonly Waypoint[]): JourneyLayout {
  const points: JourneyPoint[] = [];
  const segments: string[] = [];
  let lead = waypoints[0] ? `M ${pair(waypoints[0])}` : "";
  let piece = "";

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    piece += curve(waypoints, index);
    const reached = waypoints[index + 1]!;
    if (!reached.station) continue;
    if (points.length === 0) lead += piece;
    else segments.push(piece);
    points.push({ x: round(reached.x), y: round(reached.y) });
    piece = "";
  }

  return { width, height, points, lead, segments };
}

/** Stanica u redu širokog rasporeda: redovi su ujednačeni (7 stanica = 4 + 3, ne 5 + 2). */
function wideColumns(count: number): number {
  return Math.ceil(count / Math.ceil(count / JOURNEY_WIDE.perRow));
}

function wideLayout(count: number): JourneyLayout {
  const { width, top, rowGap, bottom, turn, lead, sway } = JOURNEY_WIDE;
  const columns = wideColumns(count);
  const rows = Math.ceil(count / columns);
  const station = (index: number): Waypoint => {
    const row = Math.floor(index / columns);
    const inRow = index % columns;
    const column = row % 2 === 0 ? inRow : columns - 1 - inRow;
    return { x: ((column + 0.5) * width) / columns, y: top + row * rowGap + tremor(index) * 8, station: true };
  };

  const first = station(0);
  const waypoints: Waypoint[] = [{ x: first.x - Math.min(lead, first.x - 14), y: first.y + 12, station: false }];
  for (let index = 0; index < count; index += 1) {
    const here = station(index);
    waypoints.push(here);
    if (index === count - 1) break;
    const there = station(index + 1);
    const row = Math.floor(index / columns);
    const turning = Math.floor((index + 1) / columns) !== row;
    waypoints.push(
      turning
        ? { x: here.x + (row % 2 === 0 ? turn : -turn), y: (here.y + there.y) / 2, station: false }
        : { x: (here.x + there.x) / 2, y: (here.y + there.y) / 2 + (index % 2 === 0 ? -sway : sway) + tremor(index + 31) * 5, station: false },
    );
  }

  return trace(width, top + (rows - 1) * rowGap + bottom, waypoints);
}

function tallLayout(count: number): JourneyLayout {
  const { width, step, sway } = JOURNEY_TALL;
  const x = width / 2;
  const waypoints: Waypoint[] = [{ x: x + 5, y: 5, station: false }];
  for (let index = 0; index < count; index += 1) {
    waypoints.push({ x, y: step * (index + 0.5), station: true });
    if (index === count - 1) break;
    waypoints.push({ x: x + (index % 2 === 0 ? sway : -sway) + tremor(index + 31) * 2, y: step * (index + 1), station: false });
  }
  return trace(width, count * step, waypoints);
}

/** Oba rasporeda za `count` stanica. Zavisi samo od broja stanica, pa je ista na serveru i u pregledaču. */
export function journeyLayout(count: number): { wide: JourneyLayout; tall: JourneyLayout; columns: number } {
  const stations = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (stations === 0) {
    const empty = { height: 0, points: [], lead: "", segments: [] };
    return { wide: { width: JOURNEY_WIDE.width, ...empty }, tall: { width: JOURNEY_TALL.width, ...empty }, columns: 0 };
  }
  return { wide: wideLayout(stations), tall: tallLayout(stations), columns: wideColumns(stations) };
}

/**
 * Put podeljen na pređeni deo (od početka do stanice `traveledTo`) i ostatak. Dve odvojene
 * putanje umesto jedne sa crticama: pređeni deo se vidi i bez JavaScript-a, a iscrtavanje
 * ga samo otkriva od početka do kraja.
 */
export function journeyPaths(layout: JourneyLayout, traveledTo: number): { ink: string | null; rest: string | null } {
  const last = layout.points.length - 1;
  if (last < 0) return { ink: null, rest: null };
  const to = Math.min(last, Number.isFinite(traveledTo) ? Math.trunc(traveledTo) : -1);
  if (to < 0) return { ink: null, rest: layout.lead + layout.segments.join("") };
  const at = layout.points[to]!;
  return {
    ink: layout.lead + layout.segments.slice(0, to).join(""),
    rest: to < last ? `M ${at.x} ${at.y}${layout.segments.slice(to).join("")}` : null,
  };
}

// ── Stanice kursa i smera ────────────────────────────────────────────────────

type JourneyLesson = {
  id?: string;
  slug: string;
  title: LocalizedText;
  duration?: string;
  isPublished?: boolean;
  progress?: { completed?: boolean } | null;
};

/**
 * Kurs: stanice su objavljene lekcije, redom kojim ih student prelazi. Bez pristupa su
 * sve zaključane i nijedna nije link (kupovina je u zaglavlju stranice kursa).
 */
export function lessonStations(input: { courseSlug: string; lessons: readonly JourneyLesson[]; canOpen: boolean; locale: Locale }): JourneyStation[] {
  const lessons = input.lessons.filter((lesson) => lesson.isPublished !== false);
  const states = journeyStates(lessons.map((lesson) => ({ done: Boolean(lesson.progress?.completed), locked: !input.canOpen })));
  return lessons.map((lesson, index) => ({
    id: lesson.id ?? lesson.slug,
    title: localized(lesson.title, input.locale),
    meta: lesson.duration,
    state: states[index]!,
    href: input.canOpen ? lessonPath(input.locale, input.courseSlug, lesson.slug) : undefined,
  }));
}

type JourneyCourse = { id: string; slug: string; title: LocalizedText; owned: boolean; completedLessons: number; totalLessons: number };

/**
 * Smer: stanice su kursevi. Kurs koji student nema je zaključan, ali vodi na svoju
 * stranicu (tamo je kupovina); otključan kurs bez lekcija nije „urađen".
 */
export function courseStations(input: { courses: readonly JourneyCourse[]; locale: Locale }): JourneyStation[] {
  const states = journeyStates(
    input.courses.map((course) => ({ done: course.totalLessons > 0 && course.completedLessons >= course.totalLessons, locked: !course.owned })),
  );
  return input.courses.map((course, index) => {
    const lessons = pluralize(input.locale, course.totalLessons, IGRA_LESSON_FORMS[input.locale]);
    return {
      id: course.id,
      title: localized(course.title, input.locale),
      meta: course.owned ? `${course.completedLessons}/${course.totalLessons} ${lessons}` : `${course.totalLessons} ${lessons}`,
      state: states[index]!,
      href: coursePath(input.locale, course.slug),
    };
  });
}
