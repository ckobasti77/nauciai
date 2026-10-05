/**
 * Uređivanje tekstom (K24, A16): obrisana reč → tačan deo snimka koji nestaje
 * (vremenski opsezi), vremena posle reza, pasusi po govorniku, tekst za preuzimanje
 * i latinica ↔ ćirilica nad transkriptom.
 */

import { describe, expect, test } from "vitest";

import { appendSource, cutRanges, emptyEdit, mainDuration, sourceAt } from "./crea-audio-edit";
import { cuesFromWords, toSrt, transliterateText } from "./crea-subtitles";
import {
  clock,
  deletedRuns,
  deletionCuts,
  keptRanges,
  paragraphs,
  remapTime,
  remapWords,
  speakerNumbers,
  toggleWords,
  transcriptText,
  WORD_GUARD_S,
  wordRange,
  type TranscriptWord,
} from "./crea-transcript-edit";

const WORDS: TranscriptWord[] = [
  { w: "Zdravo", s: 0.5, e: 0.9, speaker: "speaker_0" },
  { w: "svima,", s: 1.0, e: 1.4, speaker: "speaker_0" },
  { w: "ovo", s: 1.8, e: 2.0, speaker: "speaker_0" },
  { w: "je", s: 2.05, e: 2.15, speaker: "speaker_0" },
  { w: "ovaj", s: 2.2, e: 2.5, speaker: "speaker_0" },
  { w: "Crea.", s: 2.6, e: 3.0, speaker: "speaker_0" },
  { w: "Hvala!", s: 5.0, e: 5.5, speaker: "speaker_1" },
];
const DURATION = 6.5;

describe("rezovi po obrisanim rečima", () => {
  test("jedna reč usred rečenice: reč i pauza posle nje, do 20 ms pre sledeće reči", () => {
    // Briše se „ovaj" (2,2-2,5): ostaje „je" … „Crea.", razmak ispred „ovaj" ostaje.
    expect(deletionCuts(WORDS, new Set([4]), DURATION)).toEqual([[2.2, 2.6 - WORD_GUARD_S]]);
  });

  test("niz reči se briše jednim rezom", () => {
    expect(deletedRuns(WORDS.length, new Set([2, 3, 4]))).toEqual([[2, 4]]);
    expect(deletionCuts(WORDS, new Set([2, 3, 4]), DURATION)).toEqual([[1.8, 2.58]]);
  });

  test("dva odvojena niza = dva reza, rastuće", () => {
    expect(deletionCuts(WORDS, new Set([0, 4]), DURATION)).toEqual([
      [0.5, 0.98],
      [2.2, 2.58],
    ]);
  });

  test("poslednja reč: pauza ispred i reč, a ono posle nje ostaje", () => {
    // „Hvala!" (5,0-5,5): briše se od 20 ms posle „Crea." do kraja reči; 5,5-6,5 ostaje.
    expect(deletionCuts(WORDS, new Set([6]), DURATION)).toEqual([[3.02, 5.5]]);
  });

  test("sve reči: od prve do poslednje", () => {
    expect(deletionCuts(WORDS, new Set(WORDS.map((_, index) => index)), DURATION)).toEqual([[0.5, 5.5]]);
  });

  test("rez nikad ne ulazi u zadržanu reč (ni kad su reči slepljene)", () => {
    const tight: TranscriptWord[] = [
      { w: "a", s: 0, e: 1 },
      { w: "b", s: 1, e: 2 },
      { w: "c", s: 2, e: 3 },
    ];
    const cuts = deletionCuts(tight, new Set([1]), 3);
    expect(cuts).toEqual([[1, 2]]);
    for (const [a, b] of cuts) {
      for (const [index, word] of tight.entries()) {
        if (index === 1) continue;
        expect(b <= word.s || a >= word.e).toBe(true);
      }
    }
  });

  test("ništa obrisano = nema reza; zadržani delovi su komplement", () => {
    expect(deletionCuts(WORDS, new Set(), DURATION)).toEqual([]);
    expect(keptRanges([[2.2, 2.58]], DURATION)).toEqual([
      [0, 2.2],
      [2.58, DURATION],
    ]);
    expect(keptRanges([], DURATION)).toEqual([[0, DURATION]]);
  });

  test("isti rezovi u uređivaču daju snimak tačno te dužine i tog sadržaja", () => {
    const cuts = deletionCuts(WORDS, new Set([1, 4]), DURATION);
    const doc = cutRanges(appendSource(emptyEdit(), "snimak", DURATION), cuts);
    const removed = cuts.reduce((sum, [a, b]) => sum + (b - a), 0);
    expect(mainDuration(doc)).toBeCloseTo(DURATION - removed, 6);
    expect(doc.main.map((clip) => [clip.in, clip.out])).toEqual(keptRanges(cuts, DURATION));
    // „ovo" (1,8 u izvoru) je sada na 1,8 − (1,78 − 1,0) = 1,02.
    expect(sourceAt(doc, remapTime(1.8, cuts))).toEqual({ source: "snimak", time: 1.8 });
  });
});

describe("vremena posle reza", () => {
  test("reči posle reza se pomere za dužinu reza; obrisane nestanu", () => {
    const deleted = new Set([1]);
    const cuts = deletionCuts(WORDS, deleted, DURATION);
    expect(cuts).toEqual([[1, 1.78]]);
    const words = remapWords(WORDS, deleted, cuts);
    expect(words.map((word) => word.w)).toEqual(["Zdravo", "ovo", "je", "ovaj", "Crea.", "Hvala!"]);
    expect(words[0]).toMatchObject({ s: 0.5, e: 0.9 });
    expect(words[1]).toMatchObject({ s: 1.02, e: 1.22 });
    expect(words[5]).toMatchObject({ s: 4.22, e: 4.72, speaker: "speaker_1" });
    expect(remapTime(1.5, cuts)).toBe(1);
  });

  test("SRT posle uređivanja prati isečen snimak", () => {
    const deleted = new Set([0, 1]);
    const cuts = deletionCuts(WORDS, deleted, DURATION);
    expect(cuts).toEqual([[0.5, 1.78]]);
    const srt = toSrt(cuesFromWords(remapWords(WORDS, deleted, cuts)));
    // „ovo“ (1,8 s u izvoru) je posle reza od 1,28 s na 0,52 s.
    expect(srt.startsWith("1\n00:00:00,520 --> ")).toBe(true);
    expect(srt).not.toContain("Zdravo");
  });
});

describe("izbor i pasusi", () => {
  test("raspon u oba smera; brisanje pa vraćanje", () => {
    expect(wordRange(4, 2)).toEqual([2, 3, 4]);
    const deleted = toggleWords(new Set(), [2, 3]);
    expect([...deleted].sort()).toEqual([2, 3]);
    expect([...toggleWords(deleted, [2, 3])]).toEqual([]);
    // Delimično obrisan izbor se briše ceo.
    expect([...toggleWords(deleted, [3, 4])].sort()).toEqual([2, 3, 4]);
  });

  test("pasus po govorniku i dugoj pauzi; govornici redom pojavljivanja", () => {
    expect(paragraphs(WORDS).map((paragraph) => [paragraph.speaker, paragraph.from, paragraph.to])).toEqual([
      ["speaker_0", 0, 5],
      ["speaker_1", 6, 6],
    ]);
    expect([...speakerNumbers(WORDS)]).toEqual([
      ["speaker_0", 1],
      ["speaker_1", 2],
    ]);
    expect(clock(65.4)).toBe("1:05");
    expect(clock(3725)).toBe("1:02:05");
  });
});

describe("latinica ↔ ćirilica nad transkriptom", () => {
  test("tekst za preuzimanje u ćirilici, sa vremenom i govornikom", () => {
    expect(transcriptText(WORDS, "cyr", "sr")).toBe("[0:00] Govornik 1: Здраво свима, ово је овај Цреа.\n\n[0:05] Govornik 2: Хвала!");
    expect(transcriptText(WORDS, "lat", "en")).toBe("[0:00] Speaker 1: Zdravo svima, ovo je ovaj Crea.\n\n[0:05] Speaker 2: Hvala!");
  });

  test("dvoslovi, velika slova i kvačice idu tamo i nazad bez gubitka", () => {
    const text = "Ljubav, NJIVA i džep. Đorđe će doći u Čačak; Šabac i Žabalj.";
    const cyrillic = transliterateText(text, "cyr");
    expect(cyrillic).toBe("Љубав, ЊИВА и џеп. Ђорђе ће доћи у Чачак; Шабац и Жабаљ.");
    expect(transliterateText(cyrillic, "lat")).toBe(text);
  });

  test("strane reči i adrese ostaju latinicom; vremena reči se ne menjaju", () => {
    expect(transliterateText("Pogledaj www.nauciai.com i Wi-Fi", "cyr")).toBe("Погледај www.nauciai.com и Wi-Fi");
    const before = WORDS.map((word) => [word.s, word.e]);
    transcriptText(WORDS, "cyr", "sr");
    expect(WORDS.map((word) => [word.s, word.e])).toEqual(before);
  });
});
