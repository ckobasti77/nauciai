/**
 * Match-cut po licu (K21, V27): na sintetičkim nizovima uzoraka nalazi tačan
 * par (po licu, pa po otisku slike), poravnanje lica nikad ne pokazuje ivicu
 * slike, a primena ostavlja ispravnu vremensku liniju.
 */
import { describe, expect, test } from "vitest";

import { coverWindow, kenBurnsWindow, type CropWindow, type KenBurns } from "./crea-ken-burns";
import {
  applyMatchCut,
  clipScreenWindow,
  faceAlignment,
  faceOnScreen,
  findMatchCut,
  MATCH_CUT,
  matchCutAlignment,
  matchCutBlocker,
  matchCutTimes,
  matchCutView,
  type MatchCutView,
  type MatchFace,
  type MatchSample,
} from "./crea-match-cut";
import {
  addMainClips,
  emptyTimeline,
  parseTimeline,
  serializeTimeline,
  type CreaTimelineV1,
  type NewMainClip,
} from "./crea-timeline";

/** Deterministički „nasumičan" otisak od 64 heks znaka (256 bitova). */
function fakeHash(seed: number): string {
  let x = (seed * 2654435761 + 12345) >>> 0;
  let hex = "";
  for (let i = 0; i < 64; i += 1) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    hex += (x >>> 28).toString(16);
  }
  return hex;
}

/** Otisak sa `bits` izmenjenih bitova (prvih nekoliko heks znakova). */
function flipBits(hash: string, bits: number): string {
  const chars = hash.split("");
  for (let i = 0; i < bits; i += 1) chars[i] = (parseInt(chars[i], 16) ^ 1).toString(16);
  return chars.join("");
}

const times = (start: number, count: number) => Array.from({ length: count }, (_, k) => Math.round((start + k / 8) * 1e4) / 1e4);

function view(frameAspect = 16 / 9, aAspect = 16 / 9, bAspect = 16 / 9): MatchCutView {
  return { frameAspect, aWindow: coverWindow(aAspect, frameAspect), bWindow: coverWindow(bAspect, frameAspect), bSourceAspect: bAspect, bFit: "cover" };
}

function inside(window: CropWindow): boolean {
  const eps = 1e-9;
  return window.x >= -eps && window.y >= -eps && window.x + window.w <= 1 + eps && window.y + window.h <= 1 + eps;
}

/** Gde se lice B vidi na ekranu posle poravnanja. */
function alignedFace(kb: KenBurns, face: MatchFace, sourceAspect: number, frameAspect: number): MatchFace {
  return faceOnScreen(face, kenBurnsWindow(kb, 0, sourceAspect, frameAspect));
}

describe("uzorci", () => {
  test("poslednje 2 s klipa A, 8 u sekundi, rastuće", () => {
    const list = matchCutTimes({ in: 0, out: 10 }, "end");
    expect(list).toHaveLength(16);
    expect(list[list.length - 1]).toBeCloseTo(9.999, 6);
    expect(list[0]).toBeGreaterThanOrEqual(8);
    list.slice(1).forEach((t, i) => expect(t - list[i]).toBeCloseTo(1 / MATCH_CUT.fps, 6));
  });

  test("prve 2 s klipa B, uključujući početak", () => {
    const list = matchCutTimes({ in: 1, out: 10 }, "start");
    expect(list).toHaveLength(17);
    expect(list[0]).toBe(1);
    expect(list[16]).toBe(3);
  });

  test("kratak klip: ostaje najmanje 0,2 s klipa", () => {
    const end = matchCutTimes({ in: 0, out: 1 }, "end");
    expect(end).toHaveLength(7);
    expect(Math.min(...end)).toBeGreaterThanOrEqual(0.2);
    const start = matchCutTimes({ in: 0, out: 0.5 }, "start");
    expect(Math.max(...start)).toBeLessThanOrEqual(0.3);
  });
});

describe("najbolji par", () => {
  const aTimes = times(8, 16);
  const bTimes = times(0, 17);

  test("po licu: nalazi tačan par", () => {
    const a: MatchSample[] = aTimes.map((t, k) => ({ t, face: { cx: 0.2 + 0.03 * k, cy: 0.3, size: 0.25 }, hash: fakeHash(k) }));
    const b: MatchSample[] = bTimes.map((t, j) => ({ t, face: { cx: 0.8 - 0.03 * j, cy: 0.6, size: 0.3 }, hash: fakeHash(100 + j) }));
    b[5] = { ...b[5], face: { ...a[9].face! } };
    const cut = findMatchCut(a, b, view());
    expect(cut).toMatchObject({ aTime: aTimes[9], bTime: bTimes[5], by: "lice" });
  });

  test("lice odlučuje i kad je slika nekog para bez lica ista", () => {
    const a: MatchSample[] = aTimes.map((t, k) => ({ t, face: k % 2 === 0 ? { cx: 0.3, cy: 0.4, size: 0.2 } : null, hash: fakeHash(1) }));
    const b: MatchSample[] = bTimes.map((t, j) => ({ t, face: j === 7 ? { cx: 0.3, cy: 0.4, size: 0.2 } : null, hash: fakeHash(200 + j) }));
    // Par bez lica sa istom slikom (razdaljina 0) ne pobeđuje.
    b[0] = { ...b[0], hash: a[1].hash };
    const cut = findMatchCut(a, b, view());
    expect(cut?.by).toBe("lice");
    expect(cut?.bTime).toBe(bTimes[7]);
    // Isto lice u više kadrova A: najkasniji (najmanje se odseca).
    expect(cut?.aTime).toBe(aTimes[14]);
  });

  test("bez lica: najmanja Hamingova razdaljina otisaka", () => {
    const a: MatchSample[] = aTimes.map((t, k) => ({ t, face: null, hash: fakeHash(k) }));
    const b: MatchSample[] = bTimes.map((t, j) => ({ t, face: null, hash: fakeHash(300 + j) }));
    b[3] = { ...b[3], hash: flipBits(a[12].hash, 2) };
    const cut = findMatchCut(a, b, view());
    expect(cut).toMatchObject({ aTime: aTimes[12], bTime: bTimes[3], by: "slika" });
    expect(cut?.score).toBeCloseTo(2 / 256, 9);
  });

  test("izjednačeno: najkasniji kraj A i najraniji početak B", () => {
    const same = { face: { cx: 0.5, cy: 0.5, size: 0.2 }, hash: fakeHash(1) };
    const cut = findMatchCut(
      aTimes.map((t) => ({ t, ...same })),
      bTimes.map((t) => ({ t, ...same })),
      view(),
    );
    expect(cut).toMatchObject({ aTime: aTimes[aTimes.length - 1], bTime: bTimes[0] });
    const flat = findMatchCut(
      aTimes.map((t) => ({ t, face: null, hash: fakeHash(1) })),
      bTimes.map((t) => ({ t, face: null, hash: fakeHash(1) })),
      view(),
    );
    expect(flat).toMatchObject({ aTime: aTimes[aTimes.length - 1], bTime: bTimes[0], by: "slika", score: 0 });
  });

  test("lice se poredi na ekranu, ne u izvoru (uspravna montaža)", () => {
    // Položen izvor u uspravnom kadru: vidi se samo sredina širine.
    const frame = 9 / 16;
    const v = view(frame, 16 / 9, 16 / 9);
    const target = faceOnScreen({ cx: 0.5, cy: 0.5, size: 0.3 }, v.aWindow);
    expect(target.cx).toBeCloseTo(0.5, 9);
    const a: MatchSample[] = [{ t: 9, face: { cx: 0.5, cy: 0.5, size: 0.3 }, hash: fakeHash(1) }];
    // U delovima izvora je prvo lice bliže (0,08 prema 0,10), ali na uskom ekranu je daleko od sredine.
    const b: MatchSample[] = [
      { t: 0, face: { cx: 0.58, cy: 0.5, size: 0.3 }, hash: fakeHash(1) },
      { t: 0.125, face: { cx: 0.52, cy: 0.6, size: 0.3 }, hash: fakeHash(1) },
    ];
    expect(findMatchCut(a, b, v)?.bTime).toBe(0.125);
  });

  test("prazni ili neuporedivi uzorci: nema predloga", () => {
    expect(findMatchCut([], [], view())).toBeNull();
    expect(findMatchCut([{ t: 1, face: null, hash: "" }], [{ t: 0, face: null, hash: "" }], view())).toBeNull();
    expect(findMatchCut([{ t: 1, face: null, hash: "ab" }], [{ t: 0, face: null, hash: "abc" }], view())).toBeNull();
  });
});

describe("poravnanje lica", () => {
  test("lice B staje na mesto lica A (isti oblik izvora i kadra)", () => {
    const target = { cx: 0.3, cy: 0.4, size: 0.3 };
    const face = { cx: 0.5, cy: 0.5, size: 0.2 };
    const kb = faceAlignment(target, face, 16 / 9, 16 / 9);
    expect(kb).not.toBeNull();
    expect(kb!.from).toEqual(kb!.to);
    expect(kb!.from.zoom).toBeCloseTo(1.5, 6);
    const moved = alignedFace(kb!, face, 16 / 9, 16 / 9);
    expect(moved.cx).toBeCloseTo(target.cx, 2);
    expect(moved.cy).toBeCloseTo(target.cy, 2);
    expect(moved.size).toBeCloseTo(target.size, 2);
    expect(inside(kenBurnsWindow(kb!, 0, 16 / 9, 16 / 9))).toBe(true);
  });

  test("položen izvor u uspravnom kadru", () => {
    const target = { cx: 0.5, cy: 0.35, size: 0.2 };
    const face = { cx: 0.4, cy: 0.5, size: 0.15 };
    const kb = faceAlignment(target, face, 16 / 9, 9 / 16);
    expect(kb).not.toBeNull();
    const moved = alignedFace(kb!, face, 16 / 9, 9 / 16);
    expect(Math.abs(moved.cx - target.cx)).toBeLessThan(0.01);
    expect(Math.abs(moved.cy - target.cy)).toBeLessThan(0.01);
    expect(Math.abs(moved.size - target.size)).toBeLessThan(0.01);
  });

  test("nemoguće (trebalo bi udaljiti) i zanemarljivo: null", () => {
    expect(faceAlignment({ cx: 0.5, cy: 0.5, size: 0.1 }, { cx: 0.5, cy: 0.5, size: 0.3 }, 16 / 9, 16 / 9)).toBeNull();
    expect(faceAlignment({ cx: 0.5, cy: 0.5, size: 0.2 }, { cx: 0.5, cy: 0.5, size: 0.2 }, 16 / 9, 16 / 9)).toBeNull();
    expect(faceAlignment({ cx: 0.502, cy: 0.5, size: 0.2 }, { cx: 0.5, cy: 0.5, size: 0.2 }, 1, 1)).toBeNull();
    expect(faceAlignment({ cx: 0.5, cy: 0.5, size: 0 }, { cx: 0.5, cy: 0.5, size: 0.2 }, 1, 1)).toBeNull();
  });

  test("nedostižno mesto: što bliže, a ivica slike se ne vidi", () => {
    const kb = faceAlignment({ cx: 0.9, cy: 0.5, size: 0.3 }, { cx: 0.1, cy: 0.5, size: 0.2 }, 16 / 9, 16 / 9);
    expect(kb).not.toBeNull();
    expect(kb!.from.x).toBe(-1);
    expect(inside(kenBurnsWindow(kb!, 0, 16 / 9, 16 / 9))).toBe(true);
    const far = faceAlignment({ cx: 0.5, cy: 0.5, size: 0.6 }, { cx: 0.5, cy: 0.5, size: 0.1 }, 16 / 9, 16 / 9);
    expect(far?.from.zoom).toBe(2);
  });

  test("bilo koji ulaz: zum 1..2 i prozor uvek ceo u slici", () => {
    let seed = 7;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (const sourceAspect of [9 / 16, 1, 16 / 9, 3]) {
      for (const frameAspect of [9 / 16, 1, 4 / 5, 16 / 9]) {
        for (let i = 0; i < 60; i += 1) {
          const kb = faceAlignment(
            { cx: next(), cy: next(), size: 0.05 + next() * 0.5 },
            { cx: next(), cy: next(), size: 0.05 + next() * 0.5 },
            sourceAspect,
            frameAspect,
          );
          if (!kb) continue;
          expect(kb.from.zoom).toBeGreaterThanOrEqual(1);
          expect(kb.from.zoom).toBeLessThanOrEqual(2);
          expect(inside(kenBurnsWindow(kb, 0, sourceAspect, frameAspect))).toBe(true);
        }
      }
    }
  });

  test("„contain“ prozor je veći od slike u pravcu trake", () => {
    const wide = clipScreenWindow({ fit: "contain" }, 9 / 16, 16 / 9);
    expect(wide.h).toBe(1);
    expect(wide.w).toBeCloseTo(3.1605, 3);
    expect(wide.x + wide.w / 2).toBeCloseTo(0.5, 9);
    const tall = clipScreenWindow({ fit: "contain" }, 16 / 9, 9 / 16);
    expect(tall.w).toBe(1);
    expect(tall.h).toBeCloseTo(3.1605, 3);
    expect(clipScreenWindow({ fit: "cover" }, 16 / 9, 16 / 9)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

const video = (jobId: string, length: number, extra: Partial<NewMainClip> = {}): NewMainClip => ({
  src: { jobId },
  media: "video",
  in: 0,
  out: length,
  speed: 1,
  volumeDb: 0,
  muted: false,
  fit: "cover",
  ...extra,
});

function twoClips(a: Partial<NewMainClip> = {}, b: Partial<NewMainClip> = {}): CreaTimelineV1 {
  return addMainClips(emptyTimeline("16:9"), [video("jobA", 10, a), video("jobB", 10, b)]);
}

const ALIGN: KenBurns = { from: { zoom: 1.4, x: 0.3, y: -0.2 }, to: { zoom: 1.4, x: 0.3, y: -0.2 } };

describe("primena", () => {
  test("razlozi odbijanja", () => {
    const cut = { aTime: 9, bTime: 0.5 };
    expect(applyMatchCut(twoClips({ media: "image" }), "k-1", cut, null)).toEqual({ ok: false, reason: "SLIKA" });
    expect(applyMatchCut(twoClips({}, { speed: 2 }), "k-1", cut, null)).toEqual({ ok: false, reason: "BRZINA" });
    expect(applyMatchCut(twoClips({ speedKeys: [{ u: 0, v: 1 }, { u: 1, v: 2 }] }), "k-1", cut, null)).toEqual({ ok: false, reason: "BRZINA" });
    expect(applyMatchCut(twoClips({ reverse: true }), "k-1", cut, null)).toEqual({ ok: false, reason: "UNAZAD" });
    expect(applyMatchCut(twoClips({}, { boomerang: true }), "k-1", cut, null)).toEqual({ ok: false, reason: "UNAZAD" });
    expect(applyMatchCut(twoClips(), "k-2", cut, null)).toEqual({ ok: false, reason: "NEMA_KLIPA" });
    expect(applyMatchCut(twoClips(), "nema", cut, null)).toEqual({ ok: false, reason: "NEMA_KLIPA" });
    expect(applyMatchCut(twoClips(), "k-1", { aTime: 10.5, bTime: 0.5 }, null)).toEqual({ ok: false, reason: "VAN_OPSEGA" });
    expect(applyMatchCut(twoClips(), "k-1", { aTime: 9, bTime: 9.9 }, null)).toEqual({ ok: false, reason: "VAN_OPSEGA" });
    expect(matchCutBlocker(twoClips(), "k-1")).toBeNull();
  });

  test("rez, poravnanje i kratko pretapanje; dokument ostaje ispravan", () => {
    const result = applyMatchCut(twoClips(), "k-1", { aTime: 8.5, bTime: 0.75 }, ALIGN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b] = result.timeline.main;
    expect(a.out).toBe(8.5);
    expect(b.in).toBe(0.75);
    expect(b.kenBurns).toEqual(ALIGN);
    expect(result.timeline.transitions).toEqual([{ after: "k-1", kind: "pretapanje", duration: 0.2 }]);
    const parsed = parseTimeline(serializeTimeline(result.timeline));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.timeline).toEqual(result.timeline);
  });

  test("bez poravnanja stari Ken Burns klipa B se uklanja; „contain“ ostaje netaknut", () => {
    const withOld = applyMatchCut(twoClips(), "k-1", { aTime: 9, bTime: 0.5 }, ALIGN);
    if (!withOld.ok) throw new Error("očekivan uspeh");
    const again = applyMatchCut(withOld.timeline, "k-1", { aTime: 8.75, bTime: 0.625 }, null);
    expect(again.ok && again.timeline.main[1].kenBurns).toBeUndefined();

    const contain = applyMatchCut(twoClips({}, { fit: "contain" }), "k-1", { aTime: 9, bTime: 0.5 }, ALIGN);
    expect(contain.ok).toBe(true);
    if (contain.ok) {
      expect(contain.timeline.main[1].kenBurns).toBeUndefined();
      expect(contain.timeline.main[1].fit).toBe("contain");
      expect(parseTimeline(serializeTimeline(contain.timeline)).ok).toBe(true);
    }
  });

  test("ceo tok: predlog po licu → poravnat B u uspravnoj montaži", () => {
    let timeline = twoClips();
    timeline = { ...timeline, aspect: "9:16" };
    const [clipA, clipB] = timeline.main;
    const frame = 9 / 16;
    const v = matchCutView(clipA, clipB, 16 / 9, 16 / 9, frame);
    const aTimes = matchCutTimes(clipA, "end");
    const bTimes = matchCutTimes(clipB, "start");
    const a = aTimes.map((t) => ({ t, face: { cx: 0.47, cy: 0.38, size: 0.3 }, hash: fakeHash(Math.round(t * 8)) }));
    const b = bTimes.map((t, j) => ({ t, face: { cx: 0.55, cy: 0.5, size: 0.22 + j * 0.001 }, hash: fakeHash(500 + j) }));
    const cut = findMatchCut(a, b, v);
    expect(cut?.by).toBe("lice");
    const alignment = matchCutAlignment(cut!, v);
    expect(alignment).not.toBeNull();
    const result = applyMatchCut(timeline, clipA.id, cut!, alignment);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = faceOnScreen(cut!.aFace!, v.aWindow);
    const shown = alignedFace(result.timeline.main[1].kenBurns!, cut!.bFace!, 16 / 9, frame);
    expect(Math.abs(shown.cx - target.cx)).toBeLessThan(0.02);
    expect(Math.abs(shown.cy - target.cy)).toBeLessThan(0.02);
    expect(Math.abs(shown.size - target.size)).toBeLessThan(0.02);
    expect(parseTimeline(serializeTimeline(result.timeline)).ok).toBe(true);
  });

  test("po slici nema poravnanja", () => {
    const cut = { aTime: 9, bTime: 0, score: 0, by: "slika" as const, aFace: null, bFace: null };
    expect(matchCutAlignment(cut, view())).toBeNull();
  });
});
