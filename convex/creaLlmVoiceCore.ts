/**
 * Podkast iz lekcije (Crea K22, A6): jeftin LLM (isti model i obrazac kao
 * `creaLlmVideoCore.ts`) od teksta lekcije piše razgovor DVA voditelja na
 * jeziku korisnika. Šablon zahteva, čitanje i sređivanje odgovora i
 * deterministički DEMO bez ključa. Mrežu radi `creaLlm.ts`; glas i spajanje
 * idu kroz Dijalog (`lib/crea-dialogue.ts`).
 */

import type { CreaLlmLocale } from "./creaLlmCore";
import { parseJsonResponse } from "./creaLlmVideoCore";

export const PODCAST_LIMITS = { textChars: 6000, hostChars: 24, lineChars: 400, linesMin: 4, linesMax: 40, titleChars: 80 } as const;
export const PODCAST_MINUTES = [1, 2, 3] as const;
export type PodcastMinutes = (typeof PODCAST_MINUTES)[number];
export const PODCAST_OUTPUT_TOKENS = 4000;

export type PodcastLine = { host: 0 | 1; text: string };
export type PodcastScript = { title: string; lines: PodcastLine[] };
export type PodcastInput = { text: string; minutes: PodcastMinutes; hosts: readonly [string, string]; locale: CreaLlmLocale };

/** Koliko replika za dužinu (~9 replika po minuti, ≤ 40). */
export function podcastLineCount(minutes: number): number {
  return Math.min(PODCAST_LIMITS.linesMax, Math.max(PODCAST_LIMITS.linesMin, Math.round(minutes * 9)));
}

const SYSTEM = `You write a short, friendly podcast conversation between two hosts that explains a lesson to complete beginners.
Reply with JSON only, no markdown:
{"title":"...","lines":[{"host":1,"text":"..."},{"host":2,"text":"..."}]}
Rules:
- Write in the user's language. Natural spoken style, short sentences, no lists, no markdown, no stage directions, no sound effects.
- Host 1 opens with a one-sentence welcome and names the topic; host 2 asks the questions a beginner would ask; both explain with one everyday example.
- Hosts alternate, but a host may speak twice in a row when it helps.
- Every line is at most 300 characters. Use only facts from the lesson text; do not invent numbers, names or links.
- End with a one-line summary and a friendly goodbye.
- "title" is a short episode title in the user's language.`;

export function buildPodcastRequest(input: PodcastInput) {
  const language = input.locale === "sr" ? "Serbian (Latin script)" : "English";
  const user = [
    `User's language: ${language}.`,
    `Host 1 is called ${input.hosts[0].slice(0, PODCAST_LIMITS.hostChars)}, host 2 is called ${input.hosts[1].slice(0, PODCAST_LIMITS.hostChars)}.`,
    `Length: about ${input.minutes} minute(s), about ${podcastLineCount(input.minutes)} lines.`,
    `Lesson text:\n${input.text.trim().slice(0, PODCAST_LIMITS.textChars)}`,
  ].join("\n\n");
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: PODCAST_OUTPUT_TOKENS },
  };
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function parsePodcastResponse(raw: unknown): PodcastScript | null {
  const json = parseJsonResponse(raw);
  if (!json || !Array.isArray(json.lines)) return null;
  const lines: PodcastLine[] = [];
  for (const entry of json.lines) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const text = clip(record.text, PODCAST_LIMITS.lineChars);
    if (!text) continue;
    const host = Number(record.host) === 2 ? 1 : 0;
    lines.push({ host, text });
    if (lines.length === PODCAST_LIMITS.linesMax) break;
  }
  if (lines.length < PODCAST_LIMITS.linesMin) return null;
  return { title: clip(json.title, PODCAST_LIMITS.titleChars) || "Podkast", lines };
}

/** DEMO razgovor: rečenice lekcije naizmenično, uz uvod i odjavu. */
export function demoPodcast(input: PodcastInput): PodcastScript {
  const sr = input.locale === "sr";
  const sentences = input.text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, podcastLineCount(input.minutes) - 2);
  const lines: PodcastLine[] = [
    { host: 0, text: sr ? `DEMO: Zdravo, ja sam ${input.hosts[0]}, a danas pričamo o lekciji.` : `DEMO: Hi, I'm ${input.hosts[0]}, and today we talk about the lesson.` },
    ...sentences.map((sentence, index) => ({ host: ((index + 1) % 2) as 0 | 1, text: sentence.slice(0, PODCAST_LIMITS.lineChars) })),
    { host: 1, text: sr ? "To je to za danas. Vidimo se!" : "That's it for today. See you!" },
  ];
  while (lines.length < PODCAST_LIMITS.linesMin) {
    lines.splice(lines.length - 1, 0, { host: (lines.length % 2) as 0 | 1, text: sr ? "DEMO replika." : "DEMO line." });
  }
  return { title: sr ? "DEMO podkast" : "DEMO podcast", lines };
}
