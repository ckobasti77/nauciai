import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { coursePath, lessonPath } from "./app-routes";
import { IGRA_JOURNEY_COPY, IGRA_LESSON_FORMS } from "./igra-copy";
import { CLASSROOM_FIXTURES } from "./igra-fixtures";
import {
  JOURNEY_TALL,
  JOURNEY_WIDE,
  courseStations,
  journeyDrawSeconds,
  journeyLayout,
  journeyPaths,
  journeyStates,
  journeyTraveledTo,
  lessonStations,
  type JourneyLayout,
} from "./igra-journey";
import { IGRA_MOTION } from "./igra-motion";

/**
 * Mapa puta (K10): geometrija za 1, 5 i 20 stanica, stanja stanica, stanice kursa i smera
 * nad test korisnicima, i provere nad izvorom (prezentaciona komponenta, DrawSVG lenjo,
 * mapa ne ulazi u fajl koji se učitava na svakoj ruti).
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Sve koordinate putanje kao parovi `[x, y]`. */
function coordinates(path: string): Array<[number, number]> {
  const numbers = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  return numbers.flatMap((value, index) => (index % 2 === 0 ? [[value, numbers[index + 1]!] as [number, number]] : []));
}

const whole = (layout: JourneyLayout) => layout.lead + layout.segments.join("");

describe("journeyLayout", () => {
  it.each([1, 2, 5, 6, 7, 9, 20, 23])("%i stanica: tačke, delovi puta i kutija", (count) => {
    const { wide, tall, columns } = journeyLayout(count);
    for (const layout of [wide, tall]) {
      expect(layout.points).toHaveLength(count);
      expect(layout.segments).toHaveLength(count - 1);
      expect(layout.lead.startsWith("M ")).toBe(true);
      // Cela putanja (i kontrolne tačke) ostaje u kutiji, sa mestom za debljinu linije.
      for (const [x, y] of coordinates(whole(layout))) {
        expect(x).toBeGreaterThanOrEqual(3);
        expect(x).toBeLessThanOrEqual(layout.width - 3);
        expect(y).toBeGreaterThanOrEqual(3);
        expect(y).toBeLessThanOrEqual(layout.height - 3);
      }
      // Svaki deo se završava tačno u svojoj stanici: krug leži na liniji.
      const ends = [layout.lead, ...layout.segments].map((piece) => coordinates(piece).at(-1)!);
      expect(ends).toEqual(layout.points.map((point) => [point.x, point.y]));
    }
    expect(wide.width).toBe(JOURNEY_WIDE.width);
    expect(columns).toBeLessThanOrEqual(JOURNEY_WIDE.perRow);
    expect(tall.width).toBe(JOURNEY_TALL.width);
    expect(tall.height).toBe(count * JOURNEY_TALL.step);
  });

  it("jedna stanica je tačka sa kratkim potezom; pet staje u jedan red", () => {
    const one = journeyLayout(1);
    expect(one.columns).toBe(1);
    expect(one.wide.points[0]!.x).toBe(JOURNEY_WIDE.width / 2);
    const [start] = coordinates(one.wide.lead);
    expect(one.wide.points[0]!.x - start![0]).toBe(JOURNEY_WIDE.lead);

    const five = journeyLayout(5);
    expect(five.columns).toBe(5);
    expect(five.wide.height).toBe(JOURNEY_WIDE.top + JOURNEY_WIDE.bottom);
    const xs = five.wide.points.map((point) => point.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(5);
  });

  it("dvadeset stanica: četiri reda po pet, smer se smenjuje, put skreće u istoj koloni", () => {
    const { wide, columns } = journeyLayout(20);
    expect(columns).toBe(5);
    expect(wide.height).toBe(JOURNEY_WIDE.top + 3 * JOURNEY_WIDE.rowGap + JOURNEY_WIDE.bottom);
    const rows = [0, 1, 2, 3].map((row) => wide.points.slice(row * 5, row * 5 + 5));
    rows.forEach((row, index) => {
      const xs = row.map((point) => point.x);
      expect(xs, `red ${index}`).toEqual([...xs].sort((a, b) => (index % 2 === 0 ? a - b : b - a)));
      // Red je vodoravan: stanice odstupaju samo za „drhtaj ruke".
      for (const point of row) expect(Math.abs(point.y - (JOURNEY_WIDE.top + index * JOURNEY_WIDE.rowGap))).toBeLessThanOrEqual(8);
    });
    expect(wide.points[4]!.x).toBe(wide.points[5]!.x);
    expect(wide.points[9]!.x).toBe(wide.points[10]!.x);
  });

  it("redovi su ujednačeni: 6 = 3 + 3, 7 = 4 + 3, 11 = 4 + 4 + 3", () => {
    expect(journeyLayout(6).columns).toBe(3);
    expect(journeyLayout(7).columns).toBe(4);
    expect(journeyLayout(9).columns).toBe(5);
    expect(journeyLayout(11).columns).toBe(4);
  });

  it("uspravno: stanice jedna ispod druge na istoj liniji, na svakih 88 px", () => {
    const { tall } = journeyLayout(20);
    expect(tall.points.map((point) => point.x)).toEqual(Array(20).fill(JOURNEY_TALL.width / 2));
    expect(tall.points.map((point) => point.y)).toEqual(Array.from({ length: 20 }, (_, index) => 44 + index * 88));
  });

  it("susedne stanice su susedne i na putu: redosled fokusa prati put", () => {
    const { wide } = journeyLayout(20);
    const columnWidth = JOURNEY_WIDE.width / 5;
    wide.points.slice(1).forEach((point, index) => {
      const previous = wide.points[index]!;
      const sameRow = Math.abs(point.y - previous.y) < JOURNEY_WIDE.rowGap / 2;
      expect(Math.abs(point.x - previous.x), `stanica ${index + 2}`).toBe(sameRow ? columnWidth : 0);
    });
  });

  it("deterministična je: isti broj stanica daje istu mapu", () => {
    expect(JSON.stringify(journeyLayout(20))).toBe(JSON.stringify(journeyLayout(20)));
    expect(JSON.stringify(journeyLayout(7))).not.toBe(JSON.stringify(journeyLayout(8)));
    const source = read("lib/igra-journey.ts");
    expect(source).not.toMatch(/Math\.random\(|Math\.sin\(|Date\.now\(/);
  });

  it("bez stanica i uz loš ulaz nema mape", () => {
    for (const count of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { wide, tall, columns } = journeyLayout(count);
      expect([wide.points, tall.points, wide.segments, tall.segments]).toEqual([[], [], [], []]);
      expect(columns).toBe(0);
      expect(journeyPaths(wide, 0)).toEqual({ ink: null, rest: null });
    }
    expect(journeyLayout(5.9).wide.points).toHaveLength(5);
  });
});

describe("journeyPaths", () => {
  const { wide } = journeyLayout(5);

  it("pređeni deo ide od početka do stanice, ostatak od nje do kraja", () => {
    const { ink, rest } = journeyPaths(wide, 2);
    expect(ink).toBe(wide.lead + wide.segments.slice(0, 2).join(""));
    expect(rest).toBe(`M ${wide.points[2]!.x} ${wide.points[2]!.y}${wide.segments.slice(2).join("")}`);
    // Delovi se nastavljaju jedan na drugi u istoj tački.
    expect(coordinates(ink!).at(-1)).toEqual(coordinates(rest!)[0]);
  });

  it("prva stanica: pređen je samo početni potez", () => {
    expect(journeyPaths(wide, 0)).toEqual({ ink: wide.lead, rest: `M ${wide.points[0]!.x} ${wide.points[0]!.y}${wide.segments.join("")}` });
  });

  it("ništa pređeno: ceo put je ostatak; sve pređeno: nema ostatka", () => {
    expect(journeyPaths(wide, -1)).toEqual({ ink: null, rest: whole(wide) });
    expect(journeyPaths(wide, Number.NaN)).toEqual({ ink: null, rest: whole(wide) });
    expect(journeyPaths(wide, 4)).toEqual({ ink: whole(wide), rest: null });
    expect(journeyPaths(wide, 99)).toEqual({ ink: whole(wide), rest: null });
  });
});

describe("stanja stanica", () => {
  const item = (done: boolean, locked = false) => ({ done, locked });

  it("prva otključana neurađena je „sledeće”, ostale „dostupno”", () => {
    expect(journeyStates([item(true), item(true), item(false), item(false), item(false)])).toEqual(["done", "done", "next", "open", "open"]);
    expect(journeyStates([item(false), item(false)])).toEqual(["next", "open"]);
  });

  it("preskočena lekcija ostaje „sledeće”, a urađena posle nje je urađena", () => {
    expect(journeyStates([item(true), item(false), item(true), item(false)])).toEqual(["done", "next", "done", "open"]);
  });

  it("zaključano pobeđuje sve; sve urađeno nema „sledeće”", () => {
    expect(journeyStates([item(true, true), item(false, true)])).toEqual(["locked", "locked"]);
    expect(journeyStates([item(false, true), item(false)])).toEqual(["locked", "next"]);
    expect(journeyStates([item(true), item(true)])).toEqual(["done", "done"]);
    expect(journeyStates([])).toEqual([]);
  });

  it("put je pređen do „sledeće”, a bez nje do poslednje urađene", () => {
    expect(journeyTraveledTo(["done", "done", "next", "open"])).toBe(2);
    expect(journeyTraveledTo(["next", "open"])).toBe(0);
    expect(journeyTraveledTo(["done", "done"])).toBe(1);
    expect(journeyTraveledTo(["done", "locked", "locked"])).toBe(0);
    expect(journeyTraveledTo(["locked", "locked"])).toBe(-1);
    expect(journeyTraveledTo([])).toBe(-1);
  });

  it("crtanje traje duže za duži put, do granice ispod slavlja", () => {
    expect(journeyDrawSeconds(0)).toBeCloseTo(0.6);
    expect(journeyDrawSeconds(3)).toBeCloseTo(1.2);
    expect(journeyDrawSeconds(19)).toBeCloseTo(IGRA_MOTION.fill + 0.7);
    expect(journeyDrawSeconds(19)).toBeLessThan(IGRA_MOTION.celebrate);
    expect(journeyDrawSeconds(Number.NaN)).toBeCloseTo(0.6);
    expect(journeyDrawSeconds(-4)).toBeCloseTo(0.6);
  });
});

describe("stanice kursa (lekcije)", () => {
  const course = CLASSROOM_FIXTURES.aktivan.find((item) => item.slug === "promptovi-koji-rade")!;

  it("aktivan: tri urađene, četvrta je „sledeće”, sve vode na svoju lekciju", () => {
    const stations = lessonStations({ courseSlug: course.slug, lessons: course.lessons, canOpen: true, locale: "sr" });
    expect(stations.map((station) => station.state)).toEqual(["done", "done", "done", "next", "open", "open", "open", "open", "open"]);
    expect(stations[3]).toMatchObject({ title: "Uloge i kontekst", meta: "10 min", href: lessonPath("sr", course.slug, "uloge-i-kontekst") });
    expect(new Set(stations.map((station) => station.id)).size).toBe(stations.length);
    expect(lessonStations({ courseSlug: course.slug, lessons: course.lessons, canOpen: true, locale: "en" })[3]).toMatchObject({
      title: "Roles and context",
      href: lessonPath("en", course.slug, "uloge-i-kontekst"),
    });
  });

  it("bez pristupa: sve zaključano i nijedna stanica nije link", () => {
    const stations = lessonStations({ courseSlug: course.slug, lessons: course.lessons, canOpen: false, locale: "sr" });
    expect(stations.every((station) => station.state === "locked" && station.href === undefined)).toBe(true);
    expect(stations).toHaveLength(course.lessons.length);
  });

  it("nacrti nisu stanice; kurs bez lekcija nema mapu", () => {
    const lessons = [
      { slug: "a", title: { sr: "A", en: "A" }, isPublished: true, progress: { completed: true } },
      { slug: "b", title: { sr: "B", en: "B" }, isPublished: false },
      { slug: "c", title: { sr: "C", en: "C" } },
    ];
    expect(lessonStations({ courseSlug: "kurs", lessons, canOpen: true, locale: "sr" }).map((station) => [station.id, station.state])).toEqual([
      ["a", "done"],
      ["c", "next"],
    ]);
    expect(lessonStations({ courseSlug: "kurs", lessons: [], canOpen: true, locale: "sr" })).toEqual([]);
  });

  it("legenda: ceo kurs urađen", () => {
    const done = CLASSROOM_FIXTURES.legenda.find((item) => item.slug === course.slug)!;
    const stations = lessonStations({ courseSlug: done.slug, lessons: done.lessons, canOpen: true, locale: "sr" });
    expect(stations.every((station) => station.state === "done")).toBe(true);
    expect(journeyTraveledTo(stations.map((station) => station.state))).toBe(stations.length - 1);
  });
});

describe("stanice smera (kursevi)", () => {
  const input = (id: keyof typeof CLASSROOM_FIXTURES) =>
    CLASSROOM_FIXTURES[id].map((course) => ({
      id: course.id ?? course.slug,
      slug: course.slug,
      title: course.title,
      owned: Boolean(course.owned),
      completedLessons: course.lessons.filter((lesson) => lesson.progress?.completed).length,
      totalLessons: course.lessons.length,
    }));

  it("aktivan: kurs u toku je „sledeće”, završen je urađen, neotključani su zaključani", () => {
    const stations = courseStations({ courses: input("aktivan"), locale: "sr" });
    expect(stations.map((station) => station.state)).toEqual(["next", "open", "done", "open", "locked", "locked", "locked"]);
    expect(stations.map((station) => station.meta)).toEqual(["3/9 lekcija", "5/8 lekcija", "6/6 lekcija", "0/8 lekcija", "6 lekcija", "5 lekcija", "7 lekcija"]);
    // I zaključan kurs vodi na svoju stranicu: tamo je kupovina.
    expect(stations.map((station) => station.href)).toEqual(input("aktivan").map((course) => coursePath("sr", course.slug)));
  });

  it("novi: sve zaključano; legenda: sve urađeno", () => {
    expect(courseStations({ courses: input("novi"), locale: "sr" }).every((station) => station.state === "locked")).toBe(true);
    expect(courseStations({ courses: input("legenda"), locale: "en" }).every((station) => station.state === "done")).toBe(true);
  });

  it("otključan kurs bez lekcija nije urađen; broj lekcija se slaže sa brojem", () => {
    const base = { slug: "prazan", title: { sr: "Prazan", en: "Empty" }, owned: true, completedLessons: 0 };
    expect(courseStations({ courses: [{ ...base, id: "a", totalLessons: 0 }], locale: "sr" })[0]).toMatchObject({ state: "next", meta: "0/0 lekcija" });
    const meta = (totalLessons: number, locale: "sr" | "en") => courseStations({ courses: [{ ...base, id: "a", owned: false, totalLessons }], locale })[0]!.meta;
    expect([meta(1, "sr"), meta(3, "sr"), meta(5, "sr"), meta(21, "sr")]).toEqual(["1 lekcija", "3 lekcije", "5 lekcija", "21 lekcija"]);
    expect([meta(1, "en"), meta(4, "en")]).toEqual(["1 lesson", "4 lessons"]);
  });
});

describe("tekstovi mape", () => {
  it("svaki ima oba jezika i nijedan ne preti ni ne obećava nagradu", () => {
    for (const [key, text] of [...Object.entries(IGRA_JOURNEY_COPY), ...Object.entries(IGRA_LESSON_FORMS.sr).map(([form, sr]) => [form, { sr, en: IGRA_LESSON_FORMS.en[form as "one"] }] as const)]) {
      expect(text.sr.trim(), key).not.toBe("");
      expect(text.en.trim(), key).not.toBe("");
      expect(`${text.sr} ${text.en}`, key).not.toMatch(/izgubi|propust|požuri|poslednja šansa|kredit|popust|nagrad|hurry|lose|miss out|reward|discount|credit/i);
    }
  });
});

describe("mapa puta (izvor)", () => {
  const map = read("components/igra/journey-map.tsx");

  it("komponenta je prezentaciona: bez upita, mutacija i test podataka", () => {
    for (const file of ["components/igra/journey-map.tsx", "components/igra/course-journey.tsx", "lib/igra-journey.ts"]) {
      expect(read(file), file).not.toMatch(/from "convex\/react"|_generated\/api|useQuery|useMutation|igra-fixtures/);
    }
  });

  it("slike idu samo kroz IgraArt; nema forsiranog radijusa ni golog hex-a", () => {
    expect(map).not.toMatch(/<img\b|\/brand\/igra\//);
    expect(map).not.toMatch(/rounded-[\w[\]./-]+!|!rounded-|borderRadius/);
    expect(map).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(map).toContain('<IgraArt id="scena.mapa-puta"');
    expect(map).toContain('<IgraLik lik="robi" poza="mase"');
  });

  it("DrawSVG stiže lenjo, tek kad mapa uđe u kadar, i samo uz dozvoljen pokret", () => {
    expect(map).not.toMatch(/from "gsap\//);
    const hook = map.slice(map.indexOf("useGSAP("), map.indexOf("if (stations.length === 0) return null;"));
    const guard = hook.indexOf("!shouldAnimate({ reduced, hidden: document.hidden })");
    const observer = hook.indexOf("new IntersectionObserver(");
    const load = hook.indexOf('loadIgraPlugin("DrawSVG")');
    expect(guard).toBeGreaterThan(-1);
    expect(observer).toBeGreaterThan(guard);
    expect(load).toBeGreaterThan(observer);
    // Kad plugin ne stigne mapa ostaje cela.
    expect(hook).toMatch(/const show = contextSafe\(/);
  });

  it("pređeni deo i stanja se vide bez JavaScript-a: dve putanje, bez crtica po dužini", () => {
    expect(map).toContain("journeyPaths(layout, traveledTo)");
    expect(map).not.toMatch(/pathLength|strokeDashoffset/);
  });

  it("stanice su lista redom kojim ide put; „sledeća” je označena i kao tekući korak", () => {
    expect(map).toMatch(/<ol aria-label=\{label\}/);
    expect(map).toContain('aria-current={state === "next" ? "step" : undefined}');
    expect(map).toContain('<span className="sr-only">');
    expect(map.match(/aria-hidden="true"/g)!.length).toBeGreaterThanOrEqual(4); // SVG, scena, krug, „Ti si ovde"
  });

  it("raspored bira širina mape (container query), bez merenja u JavaScript-u", () => {
    expect(map).toContain("@container");
    expect(map).toContain("@min-[40rem]:hidden");
    expect(map).not.toMatch(/ResizeObserver|matchMedia|innerWidth|offsetWidth/);
  });

  it("puls „sledeće” stanice je CSS u no-preference bloku i staje posle tri otkucaja", () => {
    const css = read("app/globals.css").replace(/\r\n/g, "\n");
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\n  \[data-journey-drawn\] \.igra-journey-pulse \{\n    animation: igra-journey-pulse [^;]* 3;\n  \}\n\}/);
    expect(css).not.toMatch(/igra-journey-pulse[^;{}]*infinite/);
  });

  it("stranica kursa dobija mapu kao gotov element; zajednički fajl ne uvozi IGRA kod", () => {
    const shared = read("components/app/dashboard-content.tsx");
    expect(shared).toContain("journey?: ReactNode;");
    expect(shared).toContain("{journey}");
    expect(shared).not.toMatch(/from "@\/components\/igra\/|from "@\/lib\/igra-/);
    for (const file of ["components/app/dashboard-live.tsx", "components/app/dashboard.tsx"]) {
      const source = read(file);
      expect(source, file).toMatch(/journey=\{<LazyCourseJourney course=\{\w+\} locale=\{locale\} isAdmin=\{/);
      // Oba fajla uvoze i tabla i učionica: mapa sme do njih samo kao zaseban chunk.
      expect(source, file).not.toMatch(/from "@\/components\/igra\/|from "@\/lib\/igra-/);
    }
    expect(read("components/app/dashboard-live.tsx")).toMatch(
      /export const LazyCourseJourney = dynamic\(\(\) => import\("@\/components\/igra\/course-journey"\)/,
    );
  });

  it("smer crta mapu tek kad zna vlasništvo, po istom pravilu kao katalog", () => {
    const track = read("components/app/track-experience.tsx");
    expect(track).toContain("<JourneyMap stations={journey}");
    expect(track).toContain("const journey = admin || navigation");
    expect(track).toContain("isCourseOwned({ owned: navigation?.courses?.find(");
    expect(track).toContain('useQuery(api.courses.getAppNavigation, isAuthenticated ? {} : "skip")');
  });
});
