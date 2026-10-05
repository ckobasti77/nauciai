/**
 * Uređivač zvuka (K24, A14): nedestruktivne izmene glavne trake, dodatne trake,
 * plan za iscrtavanje, poništi/ponovi - i snimač (format, merač).
 */

import { describe, expect, test } from "vitest";

import {
  addExtra,
  appendSource,
  cutRanges,
  EDIT_LIMITS,
  EDITOR_MAX_SECONDS,
  emptyEdit,
  exportFileName,
  extraPieces,
  fxActive,
  historyPush,
  historyRedo,
  historyStart,
  historyUndo,
  JOIN_FADE_S,
  keepRange,
  mainDuration,
  mainPieces,
  normalizeRanges,
  placeMain,
  removedSeconds,
  removeExtra,
  setFades,
  setFx,
  sourceAt,
  updateExtra,
} from "./crea-audio-edit";
import { baseMime, meterZone, pickRecorderMime, recordingExtension } from "./crea-recorder";

const doc10 = () => appendSource(emptyEdit(), "a", 10);

describe("glavna traka", () => {
  test("spoji: snimci idu jedan za drugim", () => {
    const doc = appendSource(doc10(), "b", 4);
    expect(mainDuration(doc)).toBe(14);
    expect(placeMain(doc).map(({ clip, start, end }) => [clip.source, start, end])).toEqual([
      ["a", 0, 10],
      ["b", 10, 14],
    ]);
    expect(appendSource(doc, "c", 0)).toBe(doc);
  });

  test("brisanje sredine deli isečak i pomera ostatak ulevo", () => {
    const doc = cutRanges(doc10(), [[3, 5]]);
    expect(mainDuration(doc)).toBe(8);
    expect(doc.main.map((clip) => [clip.source, clip.in, clip.out])).toEqual([
      ["a", 0, 3],
      ["a", 5, 10],
    ]);
    // Vreme trake 3 je sada izvorno vreme 5.
    expect(sourceAt(doc, 3)).toEqual({ source: "a", time: 5 });
    expect(sourceAt(doc, 2.5)).toEqual({ source: "a", time: 2.5 });
    expect(sourceAt(doc, 8)).toBeNull();
    expect(new Set(doc.main.map((clip) => clip.id)).size).toBe(2);
  });

  test("više opsega se briše tačno (od poslednjeg ka prvom), preko granice dva snimka", () => {
    const doc = appendSource(doc10(), "b", 10);
    const cut = cutRanges(doc, [
      [1, 2],
      [9, 12],
      [18, 25],
    ]);
    expect(cut.main.map((clip) => [clip.source, clip.in, clip.out])).toEqual([
      ["a", 0, 1],
      ["a", 2, 9],
      ["b", 2, 8],
    ]);
    expect(mainDuration(cut)).toBe(14);
    expect(removedSeconds(doc, cut)).toBe(6);
  });

  test("opsezi se sređuju: obrnuti, preklopljeni, van snimka", () => {
    expect(
      normalizeRanges(
        [
          [5, 3],
          [4, 6],
          [-2, 1],
          [9, 99],
          [7, 7],
        ],
        10,
      ),
    ).toEqual([
      [0, 1],
      [3, 6],
      [9, 10],
    ]);
  });

  test("mrvice kraće od 20 ms se ne čuvaju", () => {
    const doc = cutRanges(doc10(), [[0.01, 10]]);
    expect(doc.main).toEqual([]);
    expect(mainDuration(doc)).toBe(0);
  });

  test("zadrži samo izabrano", () => {
    const doc = keepRange(appendSource(doc10(), "b", 5), 8, 12);
    expect(doc.main.map((clip) => [clip.source, clip.in, clip.out])).toEqual([
      ["a", 8, 10],
      ["b", 0, 2],
    ]);
  });

  test("pretapanje na početku i kraju ima granicu (najviše pola snimka, 10 s)", () => {
    expect(setFades(doc10(), 2, 30)).toMatchObject({ fadeIn: 2, fadeOut: 5 });
    expect(setFades(doc10(), -1, 0)).toMatchObject({ fadeIn: 0, fadeOut: 0 });
  });

  test("efekti se drže u granicama; „aktivni“ samo kad nešto menjaju", () => {
    const doc = setFx(doc10(), { speed: 5, pitch: -20.4, gainDb: 40, eq: { low: 50, mid: -50, high: 3 }, echo: { preset: "sala", mix: 2 } });
    expect(doc.fx).toMatchObject({ speed: 2, pitch: -12, gainDb: EDIT_LIMITS.gainDb.max, eq: { low: 12, mid: -12, high: 3 }, echo: { preset: "sala", mix: 1 } });
    expect(fxActive(emptyEdit().fx)).toEqual({ stretch: false, filters: false });
    expect(fxActive(doc.fx)).toEqual({ stretch: true, filters: true });
    expect(fxActive(setFx(doc10(), { echo: { preset: "soba", mix: 0 } }).fx).filters).toBe(false);
  });
});

describe("plan za iscrtavanje", () => {
  test("svaki rez dobija kratko pretapanje; krajevi traže pretapanje trake", () => {
    const doc = setFades(cutRanges(doc10(), [[3, 5]]), 1, 2);
    const pieces = mainPieces(doc);
    expect(pieces).toEqual([
      { source: "a", offset: 0, duration: 3, at: 0, gainDb: 0, fadeIn: 1, fadeOut: JOIN_FADE_S },
      { source: "a", offset: 5, duration: 5, at: 3, gainDb: 0, fadeIn: JOIN_FADE_S, fadeOut: 2 },
    ]);
  });

  test("dodatna traka u petlji pokriva ceo izlaz; bez petlje ide jednom", () => {
    let doc = addExtra(doc10(), "muzika", 4, { at: 1, loop: true, fadeIn: 0, fadeOut: 0 });
    const looped = extraPieces(doc, 10);
    expect(looped.map((piece) => [piece.at, piece.duration])).toEqual([
      [1, 4],
      [5, 4],
      [9, 1],
    ]);
    expect(looped.every((piece) => piece.duck && piece.gainDb === -12)).toBe(true);
    const id = doc.extras[0]!.id;
    doc = updateExtra(doc, id, { loop: false, gainDb: -99, at: -3 });
    expect(doc.extras[0]).toMatchObject({ loop: false, gainDb: EDIT_LIMITS.gainDb.min, at: 0 });
    expect(extraPieces(doc, 10).map((piece) => [piece.at, piece.duration])).toEqual([[0, 4]]);
    expect(extraPieces(updateExtra(doc, id, { muted: true }), 10)).toEqual([]);
    expect(removeExtra(doc, id).extras).toEqual([]);
  });

  test("najviše 3 dodatne trake", () => {
    let doc = doc10();
    for (let index = 0; index < 5; index++) doc = addExtra(doc, `s${index}`, 3);
    expect(doc.extras).toHaveLength(EDIT_LIMITS.extras);
  });
});

describe("poništi / ponovi", () => {
  test("koraci idu nazad i napred; nova izmena briše „ponovi“", () => {
    const a = doc10();
    const b = cutRanges(a, [[0, 1]]);
    const c = cutRanges(b, [[0, 1]]);
    let history = historyPush(historyPush(historyStart(a), b), c);
    history = historyUndo(history);
    expect(history.present).toBe(b);
    history = historyUndo(history);
    expect(history.present).toBe(a);
    expect(historyUndo(history)).toBe(history);
    history = historyRedo(history);
    expect(history.present).toBe(b);
    history = historyPush(history, a);
    expect(history.future).toEqual([]);
    expect(historyRedo(history)).toBe(history);
  });
});

describe("granice i imena", () => {
  test("telefon uređuje kraće snimke od računara", () => {
    expect(EDITOR_MAX_SECONDS.phone).toBeLessThan(EDITOR_MAX_SECONDS.desktop);
    expect(EDITOR_MAX_SECONDS.weak).toBeLessThanOrEqual(EDITOR_MAX_SECONDS.phone);
  });

  test("ime fajla bez kvačica", () => {
    expect(exportFileName("Moj podkast: Đurđevdan!", "mp3", new Date("2026-10-05T12:00:00Z"))).toBe("crea-moj-podkast-djurdjevdan-2026-10-05.mp3");
    expect(exportFileName("", "wav", new Date("2026-10-05T12:00:00Z"))).toBe("crea-zvuk-2026-10-05.wav");
  });
});

describe("snimač", () => {
  test("prvi format koji pregledač ume; Safari dobija MP4", () => {
    expect(pickRecorderMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecorderMime((mime) => mime === "audio/mp4")).toBe("audio/mp4");
    expect(
      pickRecorderMime(() => {
        throw new Error("stari Safari");
      }),
    ).toBe("");
  });

  test("galerija čuva tip bez kodeka; ekstenzija po tipu", () => {
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMime("")).toBe("audio/webm");
    expect(recordingExtension("audio/mp4")).toBe("m4a");
    expect(recordingExtension("audio/ogg;codecs=opus")).toBe("ogg");
    expect(recordingExtension("audio/webm")).toBe("webm");
  });

  test("merač: tiho, dobro, preglasno", () => {
    expect(meterZone(0.2)).toBe("tiho");
    expect(meterZone(0.6)).toBe("dobro");
    expect(meterZone(0.95)).toBe("preglasno");
  });
});
