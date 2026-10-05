/**
 * Transkripti `stt` poslova (Crea K21, plan K17-13): čista pravila čuvanja,
 * DEMO transkript bez ključa i rečenice sa vremenima za „Kratke klipove" (V26).
 * Bazu i mrežu radi `creaTranscripts.ts` / `falWebhook.ts`.
 */

import type { ExtractedTranscript, TranscriptWord } from "./falWebhookCore";

export const TRANSCRIPT_LIMITS = {
  /** Najduži tekst koji se čuva (znakova). */
  textChars: 100_000,
  /** Najveći JSON reči (bajtova); duži transkript ostaje samo kao tekst. */
  wordsBytes: 800_000,
} as const;

/** Red kataloga vraća transkript umesto fajla (`capabilities.output`). */
export function isTranscriptModel(capabilities: Record<string, unknown> | null | undefined): boolean {
  return capabilities?.output === "transcript";
}

export type StoredTranscript = { text: string; words?: string; language?: string };

/** Šta ide u `creaTranscripts`: tekst do granice, reči kao JSON samo dok staju u 800 KB. */
export function transcriptForStorage(transcript: ExtractedTranscript): StoredTranscript {
  const text = transcript.text.slice(0, TRANSCRIPT_LIMITS.textChars);
  const words = JSON.stringify(transcript.words.map((word) => ({ w: word.w, s: round3(word.s), e: round3(word.e), ...(word.speaker ? { speaker: word.speaker } : {}) })));
  const bytes = new TextEncoder().encode(words).length;
  return {
    text,
    ...(transcript.words.length > 0 && bytes <= TRANSCRIPT_LIMITS.wordsBytes ? { words } : {}),
    ...(transcript.language ? { language: transcript.language.slice(0, 12) } : {}),
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Reči iz sačuvanog JSON-a (oštećen ili prazan = prazan niz). */
export function parseStoredWords(json: string | undefined): TranscriptWord[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (word): word is TranscriptWord =>
        !!word && typeof word === "object" && typeof word.w === "string" && typeof word.s === "number" && typeof word.e === "number",
    );
  } catch {
    return [];
  }
}

const DEMO_SENTENCES = [
  "Ovo je DEMO transkript, jer ključ za prepoznavanje govora još nije postavljen.",
  "Pravi transkript stiže čim Crea dobije ključ, sa tačnim rečima i vremenima.",
  "Do tada možeš da probaš titlove, karaoke stil i ćirilicu na ovom tekstu.",
  "Svaka reč ima svoje vreme, pa se titl menja dok video teče.",
  "Najbolji momenti se biraju po rečenicama, kao u pravom snimku.",
];

/**
 * DEMO transkript (bez `FAL_KEY`, O3): deterministički srpski tekst preko celog
 * trajanja snimka, ~2,5 reči u sekundi uz pauze između rečenica, da titlovi i
 * „Kratki klipovi" rade do kraja i bez provajdera. Jasno označen kao DEMO.
 */
export function demoTranscript(seconds: number): ExtractedTranscript {
  const total = Math.max(2, Math.min(seconds, 30 * 60));
  const words: TranscriptWord[] = [];
  const text: string[] = [];
  let t = 0.3;
  let sentence = 0;
  while (t < total - 0.5 && words.length < 4000) {
    const tokens = DEMO_SENTENCES[sentence % DEMO_SENTENCES.length]!.split(" ");
    const speaker = sentence % 4 < 2 ? "speaker_0" : "speaker_1";
    for (const token of tokens) {
      if (t >= total - 0.3) break;
      const length = 0.18 + token.length * 0.035;
      words.push({ w: token, s: round3(t), e: round3(Math.min(total, t + length)), speaker });
      text.push(token);
      t += length + 0.06;
    }
    t += 0.7;
    sentence += 1;
  }
  return { text: text.join(" "), language: "srp", words };
}

export type TranscriptSentence = { start: number; end: number; text: string };

/** Reči → rečenice sa vremenima (kraj rečenice, pauza > 1 s ili 30 reči). */
export function sentencesFromWords(words: readonly TranscriptWord[]): TranscriptSentence[] {
  const sentences: TranscriptSentence[] = [];
  let current: TranscriptWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    sentences.push({ start: current[0]!.s, end: current[current.length - 1]!.e, text: current.map((word) => word.w).join(" ") });
    current = [];
  };
  for (const word of words) {
    const previous = current[current.length - 1];
    if (previous && (word.s - previous.e > 1 || current.length >= 30)) flush();
    current.push(word);
    if (/[.!?…]["“”»)]*$/.test(word.w)) flush();
  }
  flush();
  return sentences;
}

/**
 * Transkript za LLM: rečenice sa vremenom početka i kraja („[12.3-15.8] tekst"),
 * odsečen na `maxChars` - ulaz ostaje jeftin i za snimak od 30 min.
 */
export function transcriptDigest(sentences: readonly TranscriptSentence[], maxChars = 24_000): string {
  const lines: string[] = [];
  let size = 0;
  for (const sentence of sentences) {
    const line = `[${sentence.start.toFixed(1)}-${sentence.end.toFixed(1)}] ${sentence.text}`;
    if (size + line.length + 1 > maxChars) break;
    lines.push(line);
    size += line.length + 1;
  }
  return lines.join("\n");
}
