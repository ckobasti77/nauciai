/**
 * Pomoćnik Cree (K28, U12): rečenica („reklama za kafić sa videom i muzikom") →
 * koraci (slika → video → muzika). Čista logika: šablon zahteva za jeftin LLM
 * (isti model i obrazac kao `creaLlmCore.ts`), čitanje i sređivanje odgovora,
 * deterministički DEMO bez ključa i provera potvrde. Model i cenu svakog koraka
 * bira klijent istim Auto pravilima kao composer (`lib/crea-auto.ts`); server
 * pri potvrdi ne pušta korak skuplji od viđenog (`maxCreditCost`).
 */

import { responseText, type CreaLlmLocale } from "./creaLlmCore";

export const ASSISTANT_LIMITS = { textChars: 400, steps: 4, titleChars: 80, promptChars: 600, speechChars: 300 } as const;

export const ASSISTANT_STEP_KINDS = ["slika", "video", "muzika", "govor"] as const;
export type AssistantStepKind = (typeof ASSISTANT_STEP_KINDS)[number];

/** `from` = indeks ranijeg koraka-slike koju video oživljava. */
export type AssistantStep = { kind: AssistantStepKind; title: string; prompt: string; from: number | null };
export type AssistantPlan = { reply: string; steps: AssistantStep[] };

/** Vrsta posla po koraku (tabela `creaAssistantPlans`). */
export const STEP_JOB_KIND: Record<AssistantStepKind, "image" | "video" | "audio"> = {
  slika: "image",
  video: "video",
  muzika: "audio",
  govor: "audio",
};

const SYSTEM = `You plan a small creative project for a beginner in a media studio that makes images, videos, music and Serbian voice-overs.
Split the user's request into 1 to 4 steps. Reply with JSON only, no markdown:
{"reply":"...","steps":[{"kind":"slika|video|muzika|govor","title":"...","prompt":"...","from":null}]}
Rules:
- kind "slika" = one image, "video" = a short clip (5-8 s), "muzika" = a short music track, "govor" = a voice reading a text.
- A "video" that should show something from an earlier image sets "from" to that image step's index (0-based); otherwise "from" is null. Prefer image first, then animate it.
- "title" is 2-6 words in the user's language, what the step makes.
- "prompt" for slika, video and muzika is a vivid English prompt for the model (max 60 words, no text in the image unless asked).
- "prompt" for govor is the exact short text to be spoken, in the user's language (max 2 sentences).
- Only steps the user asked for or clearly needs. Never more than 4.
- "reply" is one friendly sentence in the user's language that says what you will make.
- No violence, nudity, real politicians or celebrities.`;

function language(locale: CreaLlmLocale): string {
  return locale === "sr" ? "Serbian (Latin script)" : "English";
}

/** Telo `generateContent` zahteva (Gemini REST). */
export function buildAssistantRequest(text: string, locale: CreaLlmLocale) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `User's language: ${language(locale)}.\nRequest: ${text.trim().slice(0, ASSISTANT_LIMITS.textChars)}` }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 1200 },
  };
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Sređuje korake: poznate vrste, najviše 4, `from` samo za video i samo na raniju sliku. */
export function sanitizeAssistantSteps(raw: unknown): AssistantStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: AssistantStep[] = [];
  for (const entry of raw) {
    if (steps.length === ASSISTANT_LIMITS.steps) break;
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const kind = record.kind;
    if (!(ASSISTANT_STEP_KINDS as readonly unknown[]).includes(kind)) continue;
    const typed = kind as AssistantStepKind;
    const prompt = clip(record.prompt, typed === "govor" ? ASSISTANT_LIMITS.speechChars : ASSISTANT_LIMITS.promptChars);
    if (!prompt) continue;
    const from = record.from;
    const validFrom =
      typed === "video" && typeof from === "number" && Number.isInteger(from) && from >= 0 && from < steps.length && steps[from]?.kind === "slika"
        ? from
        : null;
    steps.push({ kind: typed, title: clip(record.title, ASSISTANT_LIMITS.titleChars) || prompt.slice(0, 40), prompt, from: validFrom });
  }
  return steps;
}

/** JSON iz odgovora (i kad je u ```json ogradi); `null` kad nema bar jednog koraka. */
export function parseAssistantResponse(raw: unknown): AssistantPlan | null {
  const text = responseText(raw);
  if (!text) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const record = json as { reply?: unknown; steps?: unknown };
  const steps = sanitizeAssistantSteps(record.steps);
  if (steps.length === 0) return null;
  return { reply: clip(record.reply, 300), steps };
}

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");
}

/**
 * DEMO bez ključa (isto pravilo kao mock provajder): koraci po ključnim rečima, da
 * se ceo tok (cena, potvrda, koraci jedan za drugim) vidi i bez Google-a.
 */
export function demoAssistant(text: string, locale: CreaLlmLocale): AssistantPlan {
  const plain = normalize(text);
  const idea = text.trim().slice(0, 200);
  const wantsVideo = /\b(video|klip|snim|animac|reel|clip|animat)/.test(plain);
  const wantsMusic = /\b(muzik|pesm|melodij|music|song|soundtrack)/.test(plain);
  const wantsVoice = /\b(glas|govor|spiker|narac|naracij|voice|narrat|speech)/.test(plain);
  const steps: AssistantStep[] = [
    { kind: "slika", title: locale === "sr" ? "Glavna slika" : "Main image", prompt: `${idea}, bright, inviting, professional photo`, from: null },
  ];
  if (wantsVideo) {
    steps.push({ kind: "video", title: locale === "sr" ? "Slika oživi u video" : "The image comes alive", prompt: "slow cinematic camera push-in, gentle natural motion", from: 0 });
  }
  if (wantsMusic) {
    steps.push({ kind: "muzika", title: locale === "sr" ? "Muzika u pozadini" : "Background music", prompt: "warm upbeat acoustic background music, friendly and light", from: null });
  }
  if (wantsVoice) {
    steps.push({ kind: "govor", title: locale === "sr" ? "Glas koji poziva" : "A voice that invites", prompt: locale === "sr" ? "Svrati kod nas, čekamo te!" : "Come visit us, we are waiting for you!", from: null });
  }
  return {
    reply: locale === "sr" ? `Napraviću ${steps.length === 1 ? "jedan korak" : `${steps.length} koraka`}, jedan za drugim.` : `I will make ${steps.length} step${steps.length === 1 ? "" : "s"}, one after another.`,
    steps,
  };
}

/** „da" je jedina potvrda (i „yes" na engleskom); bilo šta drugo NE pokreće plaćen posao. */
export function isConfirmation(answer: string): boolean {
  const plain = normalize(answer).replace(/[^a-z]/g, "");
  return plain === "da" || plain === "yes";
}

export type PlanStepCheck = { kind: "image" | "video" | "audio"; maxCredits: number; fromStep?: number };

/** Plan koji klijent šalje na potvrdu: 1-4 koraka, celi krediti, `fromStep` na raniju sliku. */
export function planProblem(steps: readonly PlanStepCheck[]): string | null {
  if (steps.length === 0 || steps.length > ASSISTANT_LIMITS.steps) return "NEISPRAVAN_PLAN";
  for (const [index, step] of steps.entries()) {
    if (!Number.isInteger(step.maxCredits) || step.maxCredits < 0) return "NEISPRAVAN_PLAN";
    if (step.fromStep !== undefined) {
      if (step.kind !== "video" || step.fromStep < 0 || step.fromStep >= index || steps[step.fromStep]?.kind !== "image") return "NEISPRAVAN_PLAN";
    }
  }
  return null;
}
