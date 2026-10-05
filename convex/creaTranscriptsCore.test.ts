import { describe, expect, test } from "vitest";

import {
  demoTranscript,
  isTranscriptModel,
  parseStoredWords,
  sentencesFromWords,
  transcriptDigest,
  transcriptForStorage,
  TRANSCRIPT_LIMITS,
} from "./creaTranscriptsCore";
import { extractOutputUrls, extractTranscript } from "./falWebhookCore";
import { STT } from "./providers/falAudioModels";

/** Odgovor Scribe V2 u obliku sa fal strane (fal-ai/elevenlabs/speech-to-text/scribe-v2, 2026-10-05). */
const SCRIBE_PAYLOAD = {
  text: "Zdravo, Beograde! Danas učimo montažu.",
  language_code: "srp",
  language_probability: 0.98,
  words: [
    { text: "Zdravo,", start: 0.079, end: 0.539, type: "word", speaker_id: "speaker_0" },
    { text: " ", start: 0.539, end: 0.6, type: "spacing", speaker_id: "speaker_0" },
    { text: "Beograde!", start: 0.6, end: 1.2, type: "word", speaker_id: "speaker_0" },
    { text: "(smeh)", start: 1.2, end: 1.6, type: "audio_event", speaker_id: "speaker_0" },
    { text: "Danas", start: 2.1, end: 2.4, type: "word", speaker_id: "speaker_1" },
    { text: "učimo", start: 2.45, end: 2.8, type: "word", speaker_id: "speaker_1" },
    { text: "montažu.", start: 2.85, end: 3.5, type: "word", speaker_id: "speaker_1" },
  ],
};

describe("transkript iz Scribe odgovora", () => {
  test("reči sa vremenima i govornikom; razmaci i zvučni događaji ispadaju; nema URL-a", () => {
    const transcript = extractTranscript(SCRIBE_PAYLOAD)!;
    expect(transcript.text).toBe("Zdravo, Beograde! Danas učimo montažu.");
    expect(transcript.language).toBe("srp");
    expect(transcript.words.map((word) => word.w)).toEqual(["Zdravo,", "Beograde!", "Danas", "učimo", "montažu."]);
    expect(transcript.words[0]).toEqual({ w: "Zdravo,", s: 0.079, e: 0.539, speaker: "speaker_0" });
    expect(extractOutputUrls(SCRIBE_PAYLOAD)).toEqual([]);
  });

  test("primer sa fal strane (`words` kao jedan objekat) i odgovor koji nije transkript", () => {
    const single = extractTranscript({ text: "Hey,", language_code: "eng", words: { speaker_id: "speaker_0", type: "word", start: 0.079, text: "Hey,", end: 0.539 } });
    expect(single?.words).toHaveLength(1);
    expect(extractTranscript({ audio: { url: "https://fal.media/a.mp3" } })).toBeNull();
    expect(extractTranscript(null)).toBeNull();
    expect(extractTranscript({ text: "", words: [] })).toBeNull();
  });

  test("samo red kataloga sa `output: transcript` čuva transkript (Scribe ima i `audio_url` za video)", () => {
    expect(isTranscriptModel(STT.capabilities)).toBe(true);
    expect(isTranscriptModel({ mode: "async_webhook" })).toBe(false);
    expect(isTranscriptModel(null)).toBe(false);
    expect((STT.capabilities.fal as { fields: Record<string, string> }).fields.video).toBe("audio_url");
  });
});

describe("čuvanje", () => {
  test("reči kao JSON, tamo-nazad", () => {
    const stored = transcriptForStorage(extractTranscript(SCRIBE_PAYLOAD)!);
    expect(stored.language).toBe("srp");
    expect(parseStoredWords(stored.words)).toHaveLength(5);
    expect(parseStoredWords("nije json")).toEqual([]);
    expect(parseStoredWords(undefined)).toEqual([]);
  });

  test("preko 800 KB reči ostaje samo tekst; tekst je najviše 100 000 znakova", () => {
    const words = Array.from({ length: 40_000 }, (_, index) => ({ w: `rec${index}`, s: index, e: index + 0.5, speaker: "speaker_0" }));
    const stored = transcriptForStorage({ text: "x".repeat(150_000), language: null, words });
    expect(stored.words).toBeUndefined();
    expect(stored.text).toHaveLength(TRANSCRIPT_LIMITS.textChars);
  });
});

describe("DEMO i rečenice", () => {
  test("DEMO transkript pokriva snimak, deterministički je i ne ide preko kraja", () => {
    const demo = demoTranscript(95);
    expect(demo).toEqual(demoTranscript(95));
    expect(demo.words.length).toBeGreaterThan(100);
    expect(demo.words[demo.words.length - 1]!.e).toBeLessThanOrEqual(95);
    expect(demo.words[demo.words.length - 1]!.e).toBeGreaterThan(90);
    expect(demo.text.startsWith("Ovo je DEMO transkript")).toBe(true);
  });

  test("rečenice po tački, pauzi i dužini; sažetak za LLM sa vremenima, odsečen", () => {
    const sentences = sentencesFromWords(extractTranscript(SCRIBE_PAYLOAD)!.words);
    expect(sentences).toEqual([
      { start: 0.079, end: 1.2, text: "Zdravo, Beograde!" },
      { start: 2.1, end: 3.5, text: "Danas učimo montažu." },
    ]);
    expect(transcriptDigest(sentences)).toBe("[0.1-1.2] Zdravo, Beograde!\n[2.1-3.5] Danas učimo montažu.");
    expect(transcriptDigest(sentences, 30)).toBe("[0.1-1.2] Zdravo, Beograde!");
    const pause = sentencesFromWords([
      { w: "a", s: 0, e: 0.5 },
      { w: "b", s: 2, e: 2.5 },
    ]);
    expect(pause).toHaveLength(2);
  });
});
