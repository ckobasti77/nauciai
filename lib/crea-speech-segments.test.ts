import { describe, expect, test } from "vitest";

import { compactPlan, fitRate, segmentsFromWords, slotEnd, speakersOf, type SegmentWord } from "./crea-speech-segments";

const say = (text: string, start: number, speaker?: string, step = 0.4): SegmentWord[] =>
  text.split(" ").map((w, index) => ({ w, s: start + index * step, e: start + index * step + 0.3, ...(speaker ? { speaker } : {}) }));

describe("rečenice iz reči", () => {
  test("nov deo na promeni govornika, posle duge pauze i posle tačke kad je deo dovoljno dug", () => {
    const segments = segmentsFromWords([
      ...say("Zdravo svima i dobro došli.", 0, "a", 0.6),
      ...say("Danas pečemo hleb.", 3, "a"),
      ...say("Super!", 4, "b"),
      ...say("Krećemo", 7, "b"),
    ]);
    expect(segments.map((segment) => [segment.id, segment.speaker, segment.text])).toEqual([
      ["s1", "a", "Zdravo svima i dobro došli."],
      ["s2", "a", "Danas pečemo hleb."],
      ["s3", "b", "Super!"],
      ["s4", "b", "Krećemo"],
    ]);
    expect(segments[0]).toMatchObject({ start: 0, end: expect.closeTo(2.7, 6) });
    // Kratka rečenica (< 2,5 s) se ne odvaja posle tačke - spaja se sa sledećom.
    expect(segmentsFromWords([...say("Zdravo svima.", 0, "a"), ...say("Danas pečemo.", 1, "a")]).map((segment) => segment.text)).toEqual(["Zdravo svima. Danas pečemo."]);
  });

  test("kratka rečenica se spaja sa sledećom; najduži deo je 12 s; bez govornika = speaker_0", () => {
    expect(segmentsFromWords([...say("Da.", 0), ...say("Naravno.", 0.5)]).map((segment) => segment.text)).toEqual(["Da. Naravno."]);
    const long = segmentsFromWords(say(Array.from({ length: 50 }, () => "reč").join(" "), 0, undefined, 0.5));
    expect(long.length).toBeGreaterThan(1);
    expect(long.every((segment) => segment.end - segment.start <= 12)).toBe(true);
    expect(long[0]!.speaker).toBe("speaker_0");
    expect(segmentsFromWords([{ w: " ", s: 0, e: 1 }])).toEqual([]);
  });
});

describe("govornici, mesta i ubrzanje", () => {
  const segments = segmentsFromWords([...say("Prva rečenica ovde.", 0, "a"), ...say("Druga.", 3, "b"), ...say("Treća rečenica za kraj.", 5, "a")]);

  test("govornici redom pojavljivanja sa vremenom govora", () => {
    expect(speakersOf(segments)).toEqual([
      { id: "a", number: 1, seconds: expect.closeTo(1.1 + 1.5, 5), segments: 2, sample: "Prva rečenica ovde." },
      { id: "b", number: 2, seconds: expect.closeTo(0.3, 5), segments: 1, sample: "Druga." },
    ]);
  });

  test("mesto dela traje do sledećeg dela ili do kraja snimka; ubrzanje najviše 1,25×", () => {
    expect(slotEnd(segments, 0, 10)).toBe(3);
    expect(slotEnd(segments, 2, 10)).toBe(10);
    expect(fitRate(2, 3)).toBe(1);
    expect(fitRate(3.3, 3)).toBe(1.1);
    expect(fitRate(9, 3)).toBe(1.25);
    expect(fitRate(0, 3)).toBe(1);
  });

  test("spojen fajl jednog govornika: samo njegovi delovi, uz rezervu i pauzu, i mesto svakog dela", () => {
    const plan = compactPlan(segments, "a", 7, { padS: 0.1, gapS: 0.5 });
    expect(plan.pieces).toEqual([
      { segmentId: "s1", srcStart: 0, srcEnd: expect.closeTo(1.2, 5), at: 0 },
      { segmentId: "s3", srcStart: expect.closeTo(4.9, 5), srcEnd: expect.closeTo(6.6, 5), at: expect.closeTo(1.7, 5) },
    ]);
    expect(plan.durationS).toBeCloseTo(1.2 + 0.5 + 1.7, 5);
    // Rezerva ne izlazi preko kraja snimka.
    expect(compactPlan(segments, "a", 6.55, { padS: 0.1 }).pieces[1]!.srcEnd).toBe(6.55);
    expect(compactPlan(segments, "nema", 7)).toEqual({ pieces: [], durationS: 0 });
  });
});
