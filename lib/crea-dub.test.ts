import { describe, expect, test } from "vitest";

import { isDubLanguage } from "@/convex/creaLlmSoundCore";
import { studioModelBySlug } from "@/convex/providers/catalogModels";

import { lineFingerprint, type LineTake } from "./crea-dialogue";
import {
  applyTranslations,
  dubCost,
  dubFromWords,
  dubPlacements,
  dubReady,
  dubSrt,
  dubStatus,
  editSource,
  editTranslation,
  keepTranslation,
  sanitizeDubDoc,
  segmentJob,
  segmentsToSynth,
  segmentsToTranslate,
  setSpeakerVoice,
  type DubDoc,
} from "./crea-dub";
import { jobCredits } from "./crea-job-price";
import { speechChars } from "./crea-voice-tags";

const catalog = [studioModelBySlug("gemini-tts")!];

/** Dva govornika, tri rečenice (reči sa vremenima kao iz Scribe-a). */
function words() {
  const sentence = (text: string, start: number, speaker: string) =>
    text.split(" ").map((w, index) => ({ w, s: start + index * 0.4, e: start + index * 0.4 + 0.3, speaker }));
  return [
    ...sentence("Dobar dan, dobro došli u našu pekaru.", 0.5, "speaker_0"),
    ...sentence("Šta danas ima toplo?", 5, "speaker_1"),
    ...sentence("Kifle i pogačice, tek izašle iz rerne.", 9, "speaker_0"),
  ];
}

function translated(): DubDoc {
  const doc = dubFromWords(words(), { to: "en", from: "srp", durationS: 14 });
  return applyTranslations(doc, {
    s1: "Good afternoon, welcome to our bakery.",
    s2: "What's warm today?",
    s3: "Rolls and buns, fresh out of the oven.",
  });
}

/** Simulira „Izgovori": svaka rečenica koja se pravi dobija gotov posao sa svojim otiskom. */
function synthesize(doc: DubDoc, takes: Record<string, LineTake>): Record<string, LineTake> {
  const next = { ...takes };
  for (const entry of segmentsToSynth(doc, takes)) next[entry.segment.id] = { jobId: `job-${entry.segment.id}-${Object.keys(next).length}`, fingerprint: entry.fingerprint };
  return next;
}

function priceOf(doc: DubDoc, id: string): number {
  const job = segmentJob(doc, doc.segments.find((segment) => segment.id === id)!)!;
  return jobCredits({ modelSlug: job.modelSlug, inputMode: job.inputMode, params: job.params, measured: { char_count: speechChars(job) } }, catalog)!;
}

describe("transkript → rečenice za prevod", () => {
  test("rečenice po govorniku i pauzi, glas po govorniku (žena/muškarac naizmenično)", () => {
    const doc = dubFromWords(words(), { to: "en", from: "srp", durationS: 14 });
    expect(doc.segments.map((segment) => [segment.id, segment.speaker, segment.source])).toEqual([
      ["s1", "speaker_0", "Dobar dan, dobro došli u našu pekaru."],
      ["s2", "speaker_1", "Šta danas ima toplo?"],
      ["s3", "speaker_0", "Kifle i pogačice, tek izašle iz rerne."],
    ]);
    expect(doc.voices).toEqual({ speaker_0: "Sulafat", speaker_1: "Achird" });
    expect(doc.segments.every((segment) => dubStatus(doc, segment, {}) === "za-prevod")).toBe(true);
    expect(segmentsToTranslate(doc).map((entry) => entry.id)).toEqual(["s1", "s2", "s3"]);
    // Bez prevoda nema šta da se izgovori - i nema cene.
    expect(dubCost(doc, {}, catalog)).toEqual({ credits: 0, segments: 0, chars: 0 });
  });
});

describe("pregled prevoda pre sinteze (A10): plaća se samo izmenjeno", () => {
  test("prvi put se izgovara sve; posle izmene JEDNOG prevoda - samo ta rečenica i samo njena cena", () => {
    let doc = translated();
    const first = dubCost(doc, {}, catalog);
    expect(first.segments).toBe(3);
    expect(first.credits).toBe(priceOf(doc, "s1") + priceOf(doc, "s2") + priceOf(doc, "s3"));
    let takes = synthesize(doc, {});
    expect(dubReady(doc, takes)).toBe(true);
    expect(dubCost(doc, takes, catalog)).toEqual({ credits: 0, segments: 0, chars: 0 });

    doc = editTranslation(doc, "s2", "What is warm today?");
    expect(doc.segments.map((segment) => dubStatus(doc, segment, takes))).toEqual(["gotova", "izmenjena", "gotova"]);
    expect(segmentsToSynth(doc, takes).map((entry) => entry.segment.id)).toEqual(["s2"]);
    expect(dubCost(doc, takes, catalog)).toMatchObject({ credits: priceOf(doc, "s2"), segments: 1 });
    expect(dubReady(doc, takes)).toBe(false);

    takes = synthesize(doc, takes);
    expect(dubReady(doc, takes)).toBe(true);
    expect(segmentsToSynth(doc, takes)).toEqual([]);
  });

  test("ispravka ORIGINALA ne pravi ništa sama: prevod postaje zastareo (0 kr) dok se ne prevede ponovo ili potvrdi", () => {
    let doc = translated();
    const takes = synthesize(doc, {});
    doc = editSource(doc, "s3", "Kifle i pogačice, tek izašle iz peći.");
    expect(dubStatus(doc, doc.segments[2]!, takes)).toBe("zastareo");
    expect(segmentsToSynth(doc, takes)).toEqual([]);
    expect(dubCost(doc, takes, catalog).credits).toBe(0);
    expect(segmentsToTranslate(doc, takes)).toEqual([{ id: "s3", text: "Kifle i pogačice, tek izašle iz peći." }]);

    // Isti prevod posle novog prevođenja = isti posao, nema nove naplate.
    const same = applyTranslations(doc, { s3: "Rolls and buns, fresh out of the oven." });
    expect(dubStatus(same, same.segments[2]!, takes)).toBe("gotova");
    expect(segmentsToSynth(same, takes)).toEqual([]);

    // Drugačiji prevod = samo ta rečenica.
    const changed = applyTranslations(doc, { s3: "Rolls and buns, fresh from the stove." });
    expect(segmentsToSynth(changed, takes).map((entry) => entry.segment.id)).toEqual(["s3"]);

    // „Prevod je dobar": bez novog prevoda, bez naplate.
    const kept = keepTranslation(doc, "s3");
    expect(dubStatus(kept, kept.segments[2]!, takes)).toBe("gotova");
  });

  test("promena glasa jednog govornika pravi ponovo samo njegove rečenice", () => {
    let doc = translated();
    const takes = synthesize(doc, {});
    doc = setSpeakerVoice(doc, "speaker_1", "Kore");
    expect(segmentsToSynth(doc, takes).map((entry) => entry.segment.id)).toEqual(["s2"]);
    expect(setSpeakerVoice(doc, "speaker_1", "NePostoji")).toBe(doc);
  });

  test("otisak rečenice = tačan posao govora (Gemini, glas govornika, tekst prevoda)", () => {
    const doc = translated();
    const job = segmentJob(doc, doc.segments[1]!)!;
    expect(job).toEqual({ modelSlug: "gemini-tts", inputMode: "text", params: { text: "What's warm today?", voice: "Achird" } });
    const takes = { s2: { jobId: "j", fingerprint: lineFingerprint(job) } };
    expect(dubStatus(doc, doc.segments[1]!, takes)).toBe("gotova");
  });
});

describe("titlovi i spajanje", () => {
  test("SRT prevoda i originala u vremenu originalnih rečenica", () => {
    const doc = translated();
    const srt = dubSrt(doc, "prevod");
    expect(srt.startsWith("1\n00:00:00,500 --> ")).toBe(true);
    expect(srt).toContain("Good afternoon, welcome to our bakery.");
    expect(srt).toContain("00:00:09,000 --> ");
    expect(dubSrt(doc, "original")).toContain("Šta danas ima toplo?");
  });

  test("prevod ide na početak rečenice; duži od mesta se ubrza najviše 1,25×", () => {
    const doc = translated();
    const takes = synthesize(doc, {});
    const placements = dubPlacements(doc, takes, { s1: 3, s2: 6, s3: 2 });
    expect(placements.map((entry) => [entry.segmentId, entry.at, entry.rate])).toEqual([
      ["s1", 0.5, 1],
      // s2 ima 4 s do s3, a snimak traje 6 s → ubrzanje se seče na 1,25.
      ["s2", 5, 1.25],
      ["s3", 9, 1],
    ]);
    // Rečenica bez snimka (ili koja nije gotova) se preskače.
    expect(dubPlacements(editTranslation(doc, "s1", "Hi!"), takes, { s1: 1, s2: 2, s3: 2 }).map((entry) => entry.segmentId)).toEqual(["s2", "s3"]);
  });

  test("nacrt sa uređaja: loš oblik se odbacuje, nepoznat glas postaje podrazumevan", () => {
    const doc = translated();
    expect(sanitizeDubDoc(JSON.parse(JSON.stringify(doc)), isDubLanguage)).toEqual(doc);
    expect(sanitizeDubDoc({ ...doc, to: "xx" }, isDubLanguage)).toBeNull();
    expect(sanitizeDubDoc({ v: 2 }, isDubLanguage)).toBeNull();
    const broken = sanitizeDubDoc({ ...doc, voices: { speaker_0: "Nema" } }, isDubLanguage)!;
    expect(broken.voices.speaker_0).toBe("Sulafat");
  });
});
