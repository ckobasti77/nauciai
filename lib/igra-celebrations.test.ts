import { describe, expect, test } from "vitest";

import manifest from "../public/brand/igra/manifest.json";
import { igraArtOrNull, igraArtRenderable } from "./igra-art";
import {
  BADGE_GROUP_MIN,
  CELEBRATION_STAMPS_MAX,
  MAX_CELEBRATIONS_PER_SESSION,
  celebrationAnnouncement,
  celebrationSeenKeys,
  celebrationView,
  createCelebrationQueue,
  planCelebrations,
  type IgraCelebration,
  type IgraFresh,
} from "./igra-celebrations";
import { IGRA_SFX } from "./igra-sound";

const NOTHING: IgraFresh = { level: null, badges: [], courses: [] };
const COURSE = { key: "course:abc", title: { sr: "AI za početnike", en: "AI for beginners" } };

const level = (n: number): IgraCelebration => ({ kind: "level", key: `level:${n}`, level: n });
const badge = (key: "prva-lekcija" | "niz-3" | "niz-7"): IgraCelebration => ({ kind: "badge", key: `badge:${key}`, badge: key });
const course = (id: string): IgraCelebration => ({ kind: "course", key: `course:${id}`, title: COURSE.title });

describe("planCelebrations", () => {
  test("bez svežih stavki nema slavlja", () => {
    expect(planCelebrations(NOTHING, false)).toEqual({ show: [], markKeys: [] });
    expect(planCelebrations(NOTHING, true)).toEqual({ show: [], markKeys: [] });
  });

  test("redosled je kurs, pa nivo, pa bedževi", () => {
    const plan = planCelebrations({ level: 3, badges: ["prva-lekcija"], courses: [COURSE] }, false);
    expect(plan.show.map((item) => item.kind)).toEqual(["course", "level", "badge"]);
    expect(plan.markKeys).toEqual(["course:abc", "level:3", "badge:prva-lekcija"]);
  });

  test("više nivoa odjednom je jedno slavlje, za tekući (najviši) nivo", () => {
    const plan = planCelebrations({ ...NOTHING, level: 5 }, false);
    expect(plan.show).toEqual([{ kind: "level", key: "level:5", level: 5 }]);
  });

  test("nivo 1 i besmislen nivo se ne slave", () => {
    for (const bad of [1, 0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(planCelebrations({ ...NOTHING, level: bad }, false).show).toEqual([]);
    }
    expect(planCelebrations({ ...NOTHING, level: 3.9 }, false).show[0]).toMatchObject({ key: "level:3", level: 3 });
  });

  test("do dva bedža idu pojedinačno, tri i više kao jedno slavlje", () => {
    const two = planCelebrations({ ...NOTHING, badges: ["prva-lekcija", "niz-3"] }, false);
    expect(two.show.map((item) => item.key)).toEqual(["badge:prva-lekcija", "badge:niz-3"]);

    expect(BADGE_GROUP_MIN).toBe(3);
    const three = planCelebrations({ ...NOTHING, badges: ["prva-lekcija", "niz-3", "prvi-rad"] }, false);
    expect(three.show).toHaveLength(1);
    expect(three.show[0]).toMatchObject({ kind: "badges", badges: ["prva-lekcija", "niz-3", "prvi-rad"] });
    expect(three.markKeys).toEqual(["badge:prva-lekcija", "badge:niz-3", "badge:prvi-rad"]);
  });

  test("ključ grupe ne zavisi od redosleda bedževa", () => {
    const a = planCelebrations({ ...NOTHING, badges: ["prva-lekcija", "niz-3", "prvi-rad"] }, false).show[0]!;
    const b = planCelebrations({ ...NOTHING, badges: ["prvi-rad", "prva-lekcija", "niz-3"] }, false).show[0]!;
    expect(a.key).toBe(b.key);
  });

  test("ponovljeni bedž i ponovljen kurs se broje jednom", () => {
    const plan = planCelebrations({ level: null, badges: ["niz-3", "niz-3"], courses: [COURSE, COURSE] }, false);
    expect(plan.show.map((item) => item.key)).toEqual(["course:abc", "badge:niz-3"]);
  });

  test("ključ kursa bez prefiksa dobija prefiks dnevnika", () => {
    const plan = planCelebrations({ ...NOTHING, courses: [{ key: "abc", title: COURSE.title }] }, false);
    expect(plan.show[0]!.key).toBe("course:abc");
  });

  test("prvi kontakt (prazan dnevnik, 3+ stavki) je JEDAN zbir i sve se upisuje kao viđeno", () => {
    const plan = planCelebrations({ level: 4, badges: ["prva-lekcija", "niz-3"], courses: [COURSE] }, true);
    expect(plan.show).toHaveLength(1);
    expect(plan.show[0]).toMatchObject({ kind: "summary", key: "summary", level: 4, badges: 2 });
    expect(plan.markKeys).toEqual(["course:abc", "level:4", "badge:prva-lekcija", "badge:niz-3", "summary"]);
    expect(celebrationSeenKeys(plan.show[0]!)).toEqual(plan.markKeys);
  });

  test("zbir bez novog nivoa prikazuje nivo 1", () => {
    const plan = planCelebrations({ ...NOTHING, badges: ["prva-lekcija", "niz-3", "prvi-rad"] }, true);
    expect(plan.show[0]).toMatchObject({ kind: "summary", level: 1, badges: 3 });
  });

  test("prazan dnevnik sa manje od 3 stavke slavi normalno", () => {
    const plan = planCelebrations({ ...NOTHING, level: 2, badges: ["prva-lekcija"] }, true);
    expect(plan.show.map((item) => item.kind)).toEqual(["level", "badge"]);
  });

  test("dnevnik koji nije prazan nikad ne daje zbir", () => {
    const plan = planCelebrations({ level: 4, badges: ["prva-lekcija", "niz-3"], courses: [COURSE] }, false);
    expect(plan.show.some((item) => item.kind === "summary")).toBe(false);
  });
});

describe("celebrationSeenKeys", () => {
  test("pojedinačno slavlje upisuje svoj ključ, grupa ključ svakog bedža", () => {
    expect(celebrationSeenKeys(level(3))).toEqual(["level:3"]);
    expect(celebrationSeenKeys(badge("niz-3"))).toEqual(["badge:niz-3"]);
    expect(celebrationSeenKeys(course("abc"))).toEqual(["course:abc"]);
    expect(celebrationSeenKeys({ kind: "badges", key: "badges:x", badges: ["niz-3", "niz-7", "prva-lekcija"] })).toEqual([
      "badge:niz-3",
      "badge:niz-7",
      "badge:prva-lekcija",
    ]);
  });
});

describe("createCelebrationQueue", () => {
  test("prazan red nema tekuće slavlje i zatvaranje ne radi ništa", () => {
    const queue = createCelebrationQueue();
    expect(queue.current()).toBeNull();
    queue.dismiss();
    expect(queue.current()).toBeNull();
    expect(queue.shownCount()).toBe(0);
  });

  test("jedno po jedno: sledeće dolazi tek kad se tekuće zatvori", () => {
    const queue = createCelebrationQueue();
    queue.enqueue(level(3));
    queue.enqueue(badge("niz-3"));
    expect(queue.current()?.key).toBe("level:3");
    expect(queue.shownCount()).toBe(1);
    queue.dismiss();
    expect(queue.current()?.key).toBe("badge:niz-3");
    queue.dismiss();
    expect(queue.current()).toBeNull();
    expect(queue.shownCount()).toBe(2);
  });

  test("isti ključ se ne ponavlja: ni dok čeka, ni dok traje, ni posle", () => {
    const queue = createCelebrationQueue();
    queue.enqueue(level(3));
    queue.enqueue(level(3));
    queue.enqueue(badge("niz-3"));
    queue.enqueue(badge("niz-3"));
    queue.dismiss();
    expect(queue.current()?.key).toBe("badge:niz-3");
    queue.dismiss();
    queue.enqueue(level(3));
    queue.enqueue(badge("niz-3"));
    expect(queue.current()).toBeNull();
    expect(queue.shownCount()).toBe(2);
  });

  test("ono što čeka ide po prioritetu: kurs pre nivoa, nivo pre bedža", () => {
    const queue = createCelebrationQueue();
    queue.enqueue(badge("prva-lekcija"));
    queue.enqueue(badge("niz-3"));
    queue.enqueue(level(3));
    queue.enqueue(course("abc"));
    const order: string[] = [];
    for (let step = 0; step < 4; step += 1) {
      const current = queue.current();
      if (current) order.push(current.key);
      queue.dismiss();
    }
    // Prvi bedž je već bio na ekranu kad su ostali stigli; plafon od 3 zaustavlja četvrto.
    expect(order).toEqual(["badge:prva-lekcija", "course:abc", "level:3"]);
  });

  test("noviji nivo zamenjuje nivo koji još čeka", () => {
    const queue = createCelebrationQueue();
    queue.enqueue(course("abc"));
    queue.enqueue(level(3));
    queue.enqueue(level(4));
    queue.dismiss();
    expect(queue.current()?.key).toBe("level:4");
    queue.dismiss();
    expect(queue.current()).toBeNull();
  });

  test("najviše tri po sesiji; ostatak ostaje neviđen", () => {
    expect(MAX_CELEBRATIONS_PER_SESSION).toBe(3);
    const queue = createCelebrationQueue();
    for (const id of ["a", "b", "c", "d", "e"]) queue.enqueue(course(id));
    const seen: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      const current = queue.current();
      if (current) seen.push(...celebrationSeenKeys(current));
      queue.dismiss();
    }
    expect(seen).toEqual(["course:a", "course:b", "course:c"]);
    expect(queue.shownCount()).toBe(3);
    queue.enqueue(level(9));
    expect(queue.current()).toBeNull();
  });

  test("pretplatnik čuje svaku promenu tekućeg, a posle odjave ništa", () => {
    const queue = createCelebrationQueue();
    let calls = 0;
    const unsubscribe = queue.subscribe(() => {
      calls += 1;
    });
    queue.enqueue(level(3));
    expect(calls).toBe(1);
    queue.enqueue(badge("niz-3"));
    expect(calls).toBe(1);
    queue.dismiss();
    expect(calls).toBe(2);
    unsubscribe();
    queue.dismiss();
    expect(calls).toBe(2);
  });

  test("`current()` vraća isti objekat dok se ništa ne promeni (useSyncExternalStore)", () => {
    const queue = createCelebrationQueue();
    queue.enqueue(level(3));
    expect(queue.current()).toBe(queue.current());
  });
});

describe("prikaz i poruka za čitač ekrana", () => {
  const samples: IgraCelebration[] = [
    level(3),
    badge("prva-lekcija"),
    { kind: "badges", key: "badges:x", badges: ["prva-lekcija", "niz-3", "niz-7", "prvi-rad", "top-10"] },
    course("abc"),
    { kind: "summary", key: "summary", level: 4, badges: 5, seenKeys: ["summary"] },
  ];

  test("novi nivo: ime nivoa iz manifesta", () => {
    expect(celebrationAnnouncement(level(3), "sr")).toBe("Novi nivo: Skicar. Nivo 3.");
    expect(celebrationAnnouncement(level(3), "en")).toBe("New level: Sketcher. Level 3.");
    expect(celebrationView(level(12), "sr")).toMatchObject({ title: "Legenda", hero: "scena.nivo-gore", stamps: ["nivo.12"], big: true, sfx: "level" });
  });

  test("novi bedž: ime bedža iz manifesta", () => {
    expect(celebrationAnnouncement(badge("prva-lekcija"), "sr")).toBe("Novi bedž: Prva lekcija.");
    expect(celebrationAnnouncement(badge("niz-3"), "en")).toBe("New badge: 3-day streak.");
    expect(celebrationView(badge("niz-3"), "sr")).toMatchObject({ hero: "lik.robi.slavi", stamps: ["bedz.niz-3"], big: false, sfx: "badge" });
  });

  test("više bedževa: broj sa ispravnim oblikom reči i svi nazivi", () => {
    const three: IgraCelebration = { kind: "badges", key: "badges:x", badges: ["prva-lekcija", "niz-3", "niz-7"] };
    expect(celebrationView(three, "sr").title).toBe("3 nova bedža");
    expect(celebrationView(three, "en").title).toBe("3 new badges");
    expect(celebrationAnnouncement(three, "sr")).toBe("Novi bedževi: 3 nova bedža. Prva lekcija, Niz od 3 dana, Niz od 7 dana.");

    const five = celebrationView(samples[2]!, "sr");
    expect(five.title).toBe("5 novih bedževa");
    expect(five.stamps).toHaveLength(CELEBRATION_STAMPS_MAX);
    expect(five.body).toContain("Top 10");
  });

  test("kraj kursa: naslov kursa po jeziku, veliko slavlje", () => {
    expect(celebrationAnnouncement(course("abc"), "sr")).toBe("Kurs završen: AI za početnike.");
    expect(celebrationAnnouncement(course("abc"), "en")).toBe("Course completed: AI for beginners.");
    expect(celebrationView(course("abc"), "sr")).toMatchObject({ hero: "scena.kurs-zavrsen", stamps: [], big: true, sfx: "course" });
  });

  test("zbir: nivo i broj bedževa; bez bedževa samo nivo", () => {
    expect(celebrationAnnouncement(samples[4]!, "sr")).toBe("Tvoj napredak do sada: Nivo 4: Istraživač. 5 bedževa.");
    expect(celebrationAnnouncement({ kind: "summary", key: "summary", level: 1, badges: 1, seenKeys: [] }, "sr")).toBe(
      "Tvoj napredak do sada: Nivo 1: Početnik. 1 bedž.",
    );
    expect(celebrationView({ kind: "summary", key: "summary", level: 2, badges: 0, seenKeys: [] }, "en").body).toBeNull();
  });

  test("svaka slika iz prikaza postoji u manifestu i spremna je", () => {
    for (const sample of samples) {
      const view = celebrationView(sample, "sr");
      for (const id of [view.hero, ...view.stamps]) {
        const info = igraArtOrNull(id);
        expect(info, id).not.toBeNull();
        expect(igraArtRenderable(info!), id).toBe(true);
      }
    }
  });

  test("zvuk svakog slavlja je iz mape IGRA zvukova", () => {
    for (const sample of samples) expect(Object.keys(IGRA_SFX)).toContain(celebrationView(sample, "sr").sfx);
  });

  test("manifest drži oblik „vrsta: ime\" za nivoe i bedževe (odatle je ime u poruci)", () => {
    const named = Object.entries(manifest.assets).filter(([id]) => id.startsWith("nivo.") || id.startsWith("bedz."));
    expect(named).toHaveLength(36);
    for (const [id, entry] of named) {
      for (const alt of [entry.alt.sr, entry.alt.en]) {
        expect(alt.split(": "), id).toHaveLength(2);
        expect(alt.split(": ")[1]!.length, id).toBeGreaterThan(1);
      }
    }
  });
});
