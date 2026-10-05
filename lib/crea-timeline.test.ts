/**
 * Vremenska linija montaže (K19, V24): čitanje i granice dokumenta, magnetna
 * traka i prelazi, brzina (i rampa), unazad i bumerang, sečenje, skraćivanje,
 * premeštanje, brisanje, plan kadra (`frameAt`), sigurna zona i istorija.
 */
import { describe, expect, test } from "vitest";

import { createHistory, pushHistory, redo, undo } from "./crea-editor-history";
import { EXPORT_PRESETS } from "./crea-export-presets";
import {
  addAudio,
  addMainClips,
  addOverlay,
  addSticker,
  addTitle,
  assignLanes,
  clipOutputLength,
  clipPassLength,
  defaultTitleRect,
  deleteItem,
  duplicateItem,
  emptyTimeline,
  exportParentJobId,
  fitItemsToSafeZone,
  fitRectToZone,
  frameAt,
  mainLayout,
  moveClip,
  nextId,
  parseTimeline,
  passTimeAt,
  progressAt,
  rectInside,
  reversedKey,
  serializeTimeline,
  setTransition,
  sourceTimeAt,
  SPEED_RAMP_IDS,
  SPEED_RAMP_PRESETS,
  splitAt,
  timelineDuration,
  timelineJobIds,
  timelineLocalFileIds,
  TIMELINE_LIMITS,
  TITLE_STYLES,
  titleVisual,
  trimClip,
  trimTimelineTo,
  updateMainClip,
  type CreaTimelineV1,
  type MainClip,
  type NewMainClip,
} from "./crea-timeline";

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

const image = (localFileId: string, length: number, extra: Partial<NewMainClip> = {}): NewMainClip => ({
  src: { localFileId },
  media: "image",
  in: 0,
  out: length,
  speed: 1,
  volumeDb: 0,
  muted: false,
  fit: "cover",
  ...extra,
});

function threeClips(): CreaTimelineV1 {
  return addMainClips(emptyTimeline("9:16"), [video("jobA", 3), video("jobB", 3), image("file-0000-aaaa", 3)]);
}

const close = (value: number, expected: number, digits = 6) => expect(value).toBeCloseTo(expected, digits);

describe("čitanje dokumenta i granice", () => {
  test("JSON tamo-nazad daje isti dokument", () => {
    let timeline = setTransition(threeClips(), "k-1", "pretapanje", 0.5);
    timeline = addTitle(timeline, { text: "Ćao, Beograde!", start: 0, end: 2, style: "naslov" }).timeline;
    timeline = addSticker(timeline, { sticker: "srce", start: 1, end: 3 }).timeline;
    timeline = addAudio(timeline, { src: { jobId: "jobM" }, in: 0, out: 30, start: 0, volumeDb: -3, role: "music", fadeIn: 0, fadeOut: 1 }).timeline;
    timeline = addOverlay(timeline, {
      src: { jobId: "jobP" },
      media: "video",
      in: 1,
      out: 4,
      start: 2,
      rect: { x: 0.6, y: 0.05, w: 0.35, h: 0.2 },
      volumeDb: 0,
      muted: true,
    }).timeline;
    const parsed = parseTimeline(serializeTimeline(timeline));
    expect(parsed).toEqual({ ok: true, timeline });
  });

  test("odbija lošu verziju, JSON, previše i predugo", () => {
    expect(parseTimeline("{nije json")).toEqual({ ok: false, reason: "NEISPRAVAN_JSON" });
    expect(parseTimeline({ ...emptyTimeline(), v: 2 })).toEqual({ ok: false, reason: "VERZIJA" });
    expect(parseTimeline("x".repeat(TIMELINE_LIMITS.jsonChars + 1))).toEqual({ ok: false, reason: "PREVELIK" });
    const many = { ...emptyTimeline(), main: Array.from({ length: 61 }, (_, index) => ({ ...video("j", 1), id: `k-${index + 1}` })) };
    expect(parseTimeline(many)).toEqual({ ok: false, reason: "PREVISE" });
    const long = { ...emptyTimeline(), main: Array.from({ length: 9 }, (_, index) => ({ ...video("j", 60), id: `k-${index + 1}` })) };
    expect(parseTimeline(long)).toEqual({ ok: false, reason: "PREDUGO" });
  });

  test("odbija nepoznate vrednosti, NaN, duple id-jeve i loše izvore", () => {
    const base = threeClips();
    const bad = (patch: (doc: Record<string, unknown>) => void) => {
      const doc = JSON.parse(serializeTimeline(base)) as Record<string, unknown>;
      patch(doc);
      return parseTimeline(doc);
    };
    const main = (doc: Record<string, unknown>) => doc.main as Array<Record<string, unknown>>;
    expect(bad((doc) => (doc.aspect = "21:9"))).toMatchObject({ ok: false });
    expect(bad((doc) => (main(doc)[0].speed = Number.NaN))).toMatchObject({ ok: false });
    expect(bad((doc) => (main(doc)[1].id = "k-1"))).toMatchObject({ ok: false });
    expect(bad((doc) => (main(doc)[0].src = { jobId: "a", localFileId: "b-1234567" }))).toMatchObject({ ok: false });
    expect(bad((doc) => (main(doc)[0].src = { jobId: "../../etc/passwd" }))).toMatchObject({ ok: false });
    expect(bad((doc) => (main(doc)[0].media = "audio"))).toMatchObject({ ok: false });
    expect(bad((doc) => (doc.transitions = [{ after: "k-1", kind: "eksplozija", duration: 1 }]))).toMatchObject({ ok: false });
    expect(bad((doc) => (doc.titles = [{ id: "n-1", text: "x", start: 0, end: 1, style: "naslov", rect: { x: 0, y: 0, w: 0.5, h: 0.1 }, font: "comic", color: "#ffffff" }]))).toMatchObject({ ok: false });
    expect(bad((doc) => (doc.stickers = [{ id: "s-1", sticker: "nepostojeca", start: 0, end: 1, rect: { x: 0, y: 0, w: 0.2, h: 0.2 } }]))).toMatchObject({ ok: false });
    expect(bad((doc) => (doc.background = "red"))).toMatchObject({ ok: false });
  });

  test("brojevi van opsega se svode u granice", () => {
    const doc = JSON.parse(serializeTimeline(threeClips())) as { main: Array<Record<string, unknown>> };
    doc.main[0].speed = 10;
    doc.main[0].volumeDb = 99;
    doc.main[1].speed = 0.01;
    const parsed = parseTimeline(doc);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.timeline.main[0]).toMatchObject({ speed: 4, volumeDb: 6 });
    expect(parsed.timeline.main[1].speed).toBe(0.25);
    // Slika nikad nema brzinu, unazad ni rampu.
    const imageDoc = JSON.parse(serializeTimeline(threeClips())) as { main: Array<Record<string, unknown>> };
    imageDoc.main[2].speed = 3;
    imageDoc.main[2].reverse = true;
    const parsedImage = parseTimeline(imageDoc);
    if (!parsedImage.ok) throw new Error(parsedImage.reason);
    expect(parsedImage.timeline.main[2]).toMatchObject({ speed: 1 });
    expect(parsedImage.timeline.main[2].reverse).toBeUndefined();
  });

  test("naslov se seče na 120 znakova (i ćirilica)", () => {
    const { timeline } = addTitle(emptyTimeline(), { text: "Ђ".repeat(200), start: 0, end: 2, style: "titl" });
    expect(Array.from(timeline.titles[0].text)).toHaveLength(TIMELINE_LIMITS.titleChars);
  });
});

describe("magnetna traka i prelazi", () => {
  test("prelaz skraćuje traku za svoje trajanje i preklapa susede", () => {
    const timeline = setTransition(threeClips(), "k-1", "pretapanje", 0.5);
    const layout = mainLayout(timeline);
    expect(layout.map((entry) => [entry.start, entry.end])).toEqual([
      [0, 3],
      [2.5, 5.5],
      [5.5, 8.5],
    ]);
    expect(timelineDuration(timeline)).toBe(8.5);
    expect(layout[1].transitionIn?.kind).toBe("pretapanje");
  });

  test("prelaz je najviše pola kraćeg suseda i nikad posle poslednjeg klipa", () => {
    let timeline = addMainClips(emptyTimeline(), [video("a", 0.6), video("b", 5)]);
    timeline = setTransition(timeline, "k-1", "zum", 2);
    expect(timeline.transitions).toEqual([{ after: "k-1", kind: "zum", duration: 0.3 }]);
    expect(setTransition(timeline, "k-2", "zum", 1).transitions.some((entry) => entry.after === "k-2")).toBe(false);
    expect(setTransition(timeline, "k-1", null).transitions).toEqual([]);
  });

  test("premeštanje: prelaz ide uz svoj klip, a onaj koji postane poslednji gubi svoj", () => {
    let timeline = setTransition(threeClips(), "k-1", "kroz-crno", 0.4);
    timeline = moveClip(timeline, "k-1", 2);
    expect(timeline.main.map((clip) => clip.id)).toEqual(["k-2", "k-3", "k-1"]);
    expect(timeline.transitions).toEqual([]);
    timeline = setTransition(timeline, "k-2", "brisanje", 0.4);
    timeline = moveClip(timeline, "k-2", 1);
    expect(timeline.main.map((clip) => clip.id)).toEqual(["k-3", "k-2", "k-1"]);
    expect(timeline.transitions).toEqual([{ after: "k-2", kind: "brisanje", duration: 0.4 }]);
  });

  test("brisanje klipa zatvara rupu (ripple) i briše njegov prelaz", () => {
    let timeline = setTransition(threeClips(), "k-2", "pretapanje", 1);
    expect(timelineDuration(timeline)).toBe(8);
    timeline = deleteItem(timeline, "k-2");
    expect(timeline.main.map((clip) => clip.id)).toEqual(["k-1", "k-3"]);
    expect(timeline.transitions).toEqual([]);
    expect(timelineDuration(timeline)).toBe(6);
  });

  test("udvostručavanje: kopija ide odmah iza originala", () => {
    const { timeline, id } = duplicateItem(threeClips(), "k-2");
    expect(id).toBe("k-4");
    expect(timeline.main.map((clip) => clip.id)).toEqual(["k-1", "k-2", "k-4", "k-3"]);
    const titled = addTitle(timeline, { text: "A", start: 0, end: 1, style: "naslov" }).timeline;
    expect(duplicateItem(titled, "n-1").timeline.titles).toHaveLength(2);
    expect(nextId(titled, "n")).toBe("n-2");
  });
});

describe("brzina, rampa, unazad i bumerang", () => {
  test("stalna brzina: 2× traje upola, 0,5× duplo", () => {
    const fast = addMainClips(emptyTimeline(), [video("a", 10, { speed: 2 })]).main[0];
    const slow = addMainClips(emptyTimeline(), [video("a", 10, { speed: 0.5 })]).main[0];
    expect(clipOutputLength(fast)).toBe(5);
    expect(clipOutputLength(slow)).toBe(20);
    expect(sourceTimeAt(fast, 2)).toEqual({ time: 4, reversed: false });
  });

  test("rampa: integral krive brzine i tačan inverz", () => {
    const flat = addMainClips(emptyTimeline(), [video("a", 10, { speedKeys: [{ u: 0, v: 1 }, { u: 1, v: 1 }] })]).main[0];
    close(clipPassLength(flat), 10);
    const ramp = addMainClips(emptyTimeline(), [video("a", 10, { speedKeys: [{ u: 0, v: 1 }, { u: 1, v: 2 }] })]).main[0];
    close(clipPassLength(ramp), 10 * Math.log(2));
    const hero = addMainClips(emptyTimeline(), [
      video("a", 8, { speedKeys: [{ u: 0, v: 2 }, { u: 0.5, v: 0.5 }, { u: 1, v: 2 }] }),
    ]).main[0];
    for (const u of [0, 0.1, 0.33, 0.5, 0.71, 0.99]) close(progressAt(hero, passTimeAt(hero, u)), u);
    // Izvor ide samo napred dok traje klip.
    let previous = -1;
    for (let t = 0; t < clipOutputLength(hero); t += 0.05) {
      const { time } = sourceTimeAt(hero, t);
      expect(time).toBeGreaterThanOrEqual(previous);
      previous = time;
    }
  });

  test("gotove rampe su ispravne i menjaju trajanje", () => {
    for (const id of SPEED_RAMP_IDS) {
      const ramped = addMainClips(emptyTimeline(), [video("a", 6, { speedKeys: SPEED_RAMP_PRESETS[id] })]).main[0];
      expect(ramped.speedKeys, id).toEqual(SPEED_RAMP_PRESETS[id]);
      expect(clipOutputLength(ramped), id).toBeGreaterThan(0);
      expect(clipOutputLength(ramped), id).not.toBeCloseTo(6, 3);
    }
    expect(reversedKey({ jobId: "a" }, { in: 1, out: 2.5 })).toBe("job:a@1.000-2.500");
  });

  test("unazad: vreme je u obrnutom snimku; bumerang traje duplo i drugi deo ide unazad", () => {
    const back = addMainClips(emptyTimeline(), [video("a", 4, { in: 2, out: 6, reverse: true })]).main[0];
    expect(sourceTimeAt(back, 0)).toEqual({ time: 0, reversed: true });
    expect(sourceTimeAt(back, 1)).toEqual({ time: 1, reversed: true });
    const boom = addMainClips(emptyTimeline(), [video("a", 3, { boomerang: true, reverse: true })]).main[0];
    expect(boom.reverse).toBeUndefined();
    expect(clipOutputLength(boom)).toBe(6);
    expect(sourceTimeAt(boom, 1)).toEqual({ time: 1, reversed: false });
    expect(sourceTimeAt(boom, 4)).toEqual({ time: 1, reversed: true });
  });
});

describe("sečenje i skraćivanje", () => {
  test("podela čuva ukupno trajanje, a prelaz posle klipa prelazi na desni deo", () => {
    let timeline = addMainClips(emptyTimeline(), [video("a", 10, { speed: 2 }), video("b", 3)]);
    timeline = setTransition(timeline, "k-1", "pretapanje", 0.5);
    const before = timelineDuration(timeline);
    const split = splitAt(timeline, 4);
    if (!split) throw new Error("nije podeljeno");
    expect(split.timeline.main.map((clip) => [clip.id, clip.in, clip.out])).toEqual([
      ["k-1", 0, 8],
      ["k-3", 8, 10],
      ["k-2", 0, 3],
    ]);
    expect(split.timeline.transitions).toEqual([{ after: "k-3", kind: "pretapanje", duration: 0.5 }]);
    close(timelineDuration(split.timeline), before);
  });

  test("ne deli se na ivici ni bumerang; slika i rampa se dele tačno", () => {
    const timeline = threeClips();
    expect(splitAt(timeline, 0.05)).toBeNull();
    expect(splitAt(timeline, 2.95)).toBeNull();
    expect(splitAt(addMainClips(emptyTimeline(), [video("a", 3, { boomerang: true })]), 2)).toBeNull();

    const pictures = addMainClips(emptyTimeline(), [
      image("file-1111-aaaa", 4, { kenBurns: { from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1.4, x: 0, y: 0 } } }),
    ]);
    const splitImage = splitAt(pictures, 1)!;
    expect(splitImage.timeline.main.map((clip) => clip.out)).toEqual([1, 3]);
    close(splitImage.timeline.main[0].kenBurns!.to.zoom, 1.1);
    close(splitImage.timeline.main[1].kenBurns!.from.zoom, 1.1);

    const ramped = addMainClips(emptyTimeline(), [video("a", 10, { speedKeys: [{ u: 0, v: 1 }, { u: 1, v: 3 }] })]);
    const total = timelineDuration(ramped);
    const splitRamp = splitAt(ramped, total / 2)!;
    close(timelineDuration(splitRamp.timeline), total, 4);
    const [left, right] = splitRamp.timeline.main;
    expect(left.speedKeys?.[0]).toEqual({ u: 0, v: 1 });
    expect(right.speedKeys?.[right.speedKeys.length - 1]).toEqual({ u: 1, v: 3 });
    close(left.out, right.in);
  });

  test("podela klipa unazad: prvi deo je kraj izvora", () => {
    const timeline = addMainClips(emptyTimeline(), [video("a", 10, { reverse: true })]);
    const split = splitAt(timeline, 4)!;
    expect(split.timeline.main.map((clip) => [clip.in, clip.out])).toEqual([
      [6, 10],
      [0, 6],
    ]);
  });

  test("skraćivanje ivica poštuje izvor, najmanju dužinu i smer", () => {
    const clip = addMainClips(emptyTimeline(), [video("a", 10, { in: 2, out: 8, speed: 2 })]).main[0];
    expect(trimClip(clip, "start", 1, 12)).toMatchObject({ in: 4, out: 8 });
    expect(trimClip(clip, "end", 1, 12)).toMatchObject({ in: 2, out: 10 });
    expect(trimClip(clip, "end", 50, 12)).toMatchObject({ out: 12 });
    expect(trimClip(clip, "start", -50, 12)).toMatchObject({ in: 0 });
    expect(trimClip(clip, "start", 50, 12).out - trimClip(clip, "start", 50, 12).in).toBeCloseTo(TIMELINE_LIMITS.clipMinS * 2);
    const back = { ...clip, reverse: true } as MainClip;
    // Kraj reprodukcije unazad je početak izvora.
    expect(trimClip(back, "end", 1, 12)).toMatchObject({ in: 0, out: 8 });
    expect(trimClip(back, "start", 1, 12)).toMatchObject({ in: 2, out: 6 });
    const picture = addMainClips(emptyTimeline(), [image("file-2222-aaaa", 3)]).main[0];
    expect(trimClip(picture, "end", 2, null).out).toBe(5);
    expect(trimClip(picture, "start", 1, null).out).toBe(2);
    const ramp = addMainClips(emptyTimeline(), [video("a", 6, { speedKeys: [{ u: 0, v: 1 }, { u: 1, v: 1 }] })]).main[0];
    expect(trimClip(ramp, "end", 2, 60)).toEqual(ramp);
    close(clipOutputLength(trimClip(ramp, "end", -2, 60)), 4);
  });

  test("„Skrati na N s\": montaža staje u granicu", () => {
    const timeline = setTransition(threeClips(), "k-1", "pretapanje", 0.5);
    const trimmed = trimTimelineTo(timeline, 4);
    close(timelineDuration(trimmed), 4);
    expect(trimmed.main).toHaveLength(2);
  });
});

describe("plan kadra (frameAt)", () => {
  test("običan kadar: izvor po brzini", () => {
    const timeline = addMainClips(emptyTimeline(), [video("a", 10, { in: 1, speed: 2 })]);
    const plan = frameAt(timeline, 1.5);
    expect(plan.layers).toHaveLength(1);
    expect(plan.layers[0]).toMatchObject({ clipId: "k-1", time: 4, reversed: false, overlay: false });
  });

  test("pretapanje na pola: oba klipa, ulazni na 50 %", () => {
    const timeline = setTransition(threeClips(), "k-1", "pretapanje", 1);
    const plan = frameAt(timeline, 2.5);
    expect(plan.layers.map((layer) => [layer.clipId, layer.visual.opacity])).toEqual([
      ["k-1", 1],
      ["k-2", 0.5],
    ]);
  });

  test("kroz crno, brisanje i list sveske", () => {
    const dip = setTransition(threeClips(), "k-1", "kroz-crno", 1);
    expect(frameAt(dip, 2.25)).toMatchObject({ dip: { color: "#000000", alpha: 0.5 } });
    expect(frameAt(dip, 2.25).layers.map((layer) => layer.clipId)).toEqual(["k-1"]);
    expect(frameAt(dip, 2.75).layers.map((layer) => layer.clipId)).toEqual(["k-2"]);
    const wipe = setTransition(threeClips(), "k-1", "brisanje", 1);
    expect(frameAt(wipe, 2.5).wipeEdge).toBeCloseTo(0.5);
    const page = setTransition(threeClips(), "k-1", "list-sveske", 1);
    // List koji se okreće je IZNAD sledećeg kadra.
    expect(frameAt(page, 2.5).layers.map((layer) => layer.clipId)).toEqual(["k-2", "k-1"]);
  });

  test("slika u slici, naslov, nalepnica i vreme posle kraja", () => {
    let timeline = threeClips();
    timeline = addOverlay(timeline, {
      src: { jobId: "pip" },
      media: "video",
      in: 5,
      out: 7,
      start: 1,
      rect: { x: 0.6, y: 0.1, w: 0.3, h: 0.2 },
      volumeDb: 0,
      muted: false,
    }).timeline;
    timeline = addTitle(timeline, { text: "Zdravo", start: 0.5, end: 2, style: "pisaca-masina" }).timeline;
    timeline = addSticker(timeline, { sticker: "vatra", start: 2, end: 4 }).timeline;
    const plan = frameAt(timeline, 1.5);
    expect(plan.layers.find((layer) => layer.overlay)).toMatchObject({ clipId: "p-1", time: 5.5, rect: { x: 0.6, y: 0.1, w: 0.3, h: 0.2 } });
    expect(plan.titles).toHaveLength(1);
    expect(plan.stickers).toHaveLength(0);
    expect(frameAt(timeline, 2.5).stickers).toHaveLength(1);
    expect(frameAt(timeline, 3.5).layers.some((layer) => layer.overlay)).toBe(false);
    // Posle kraja ostaje poslednji kadar.
    expect(frameAt(timeline, 99).layers[0].clipId).toBe("k-3");
  });

  test("kucanje otkriva slova, pretapanje i klizanje rade na ulazu", () => {
    const title = addTitle(emptyTimeline(), { text: "Zdravo", start: 0, end: 4, style: "pisaca-masina" }).timeline.titles[0];
    expect(titleVisual(title, 0).chars).toBe(0);
    expect(titleVisual(title, 3).chars).toBe(6);
    const slide = { ...title, anim: "klizanje" as const };
    expect(titleVisual(slide, 0).opacity).toBe(0);
    expect(titleVisual(slide, 1).opacity).toBe(1);
    expect(titleVisual(slide, 0.1).dy).toBeGreaterThan(0);
  });
});

describe("naslovi i sigurna zona", () => {
  test("podrazumevan položaj svakog stila je u sigurnoj zoni TikToka, Reels-a i Shorts-a", () => {
    for (const style of TITLE_STYLES) {
      for (const preset of [EXPORT_PRESETS.tiktok, EXPORT_PRESETS.reels, EXPORT_PRESETS.shorts]) {
        expect(rectInside(defaultTitleRect(style, "9:16"), preset.safeZone), `${style} ${preset.id}`).toBe(true);
      }
      expect(rectInside(defaultTitleRect(style, "16:9"), EXPORT_PRESETS.youtube.safeZone), style).toBe(true);
    }
  });

  test("„Popravi\" unosi naslov i nalepnicu u zonu", () => {
    let timeline = addTitle(emptyTimeline(), { text: "Dole", start: 0, end: 2, style: "titl", rect: { x: 0.1, y: 0.86, w: 0.8, h: 0.1 } }).timeline;
    timeline = addSticker(timeline, { sticker: "srce", start: 0, end: 2, rect: { x: 0.85, y: 0.02, w: 0.15, h: 0.1 } }).timeline;
    const zone = EXPORT_PRESETS.reels.safeZone;
    const fixed = fitItemsToSafeZone(timeline, zone);
    for (const item of [...fixed.titles, ...fixed.stickers]) expect(rectInside(item.rect, zone)).toBe(true);
    const tooWide = fitRectToZone({ x: 0, y: 0, w: 1, h: 0.1 }, zone);
    expect(tooWide.w).toBeCloseTo(zone.w);
  });
});

describe("redovi na traci", () => {
  test("stavke koje se preklapaju idu u različite redove, a uzastopne dele red", () => {
    expect(assignLanes([{ start: 0, end: 10 }, { start: 0, end: 4 }, { start: 4, end: 6 }, { start: 10, end: 12 }, { start: 5, end: 11 }])).toEqual([0, 1, 1, 0, 2]);
    expect(assignLanes([])).toEqual([]);
  });
});

describe("izvori i istorija", () => {
  test("radovi iz galerije bez ponavljanja, roditelj izvoza je prvi glavni klip iz galerije", () => {
    let timeline = addMainClips(emptyTimeline(), [image("file-3333-aaaa", 2), video("jobA", 3), video("jobB", 3), video("jobA", 2)]);
    timeline = addAudio(timeline, { src: { jobId: "jobM" }, in: 0, out: 5, start: 0, volumeDb: 0, role: "music", fadeIn: 0, fadeOut: 0 }).timeline;
    expect(timelineJobIds(timeline)).toEqual(["jobA", "jobB", "jobM"]);
    expect(timelineLocalFileIds(timeline)).toEqual(["file-3333-aaaa"]);
    expect(exportParentJobId(timeline)).toBe("jobA");
    expect(exportParentJobId(addMainClips(emptyTimeline(), [image("file-3333-aaaa", 2)]))).toBeNull();
  });

  test("poništi vraća stanje pre podele, ponovi ga vraća", () => {
    const start = threeClips();
    let history = createHistory(start);
    history = pushHistory(history, splitAt(start, 1)!.timeline, { now: 1 });
    history = pushHistory(history, updateMainClip(history.present, "k-1", { muted: true }), { now: 5000 });
    expect(history.present.main).toHaveLength(4);
    history = undo(undo(history));
    expect(history.present).toBe(start);
    history = redo(history);
    expect(history.present.main).toHaveLength(4);
  });
});
