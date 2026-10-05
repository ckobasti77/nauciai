/**
 * Jeftin LLM Cree (K13, K01-19; prvi korisnik je S6 „Pomoćnik za opis"). Čista
 * logika: šablon zahteva, čitanje odgovora, trošak po tokenima i DEMO odgovor
 * kad nema ključa. Mrežu i bazu radi `convex/creaLlm.ts`.
 *
 * Model: Gemini 3.5 Flash-Lite preko postojećeg `GOOGLE_AI_API_KEY` - Google ga
 * preporučuje kao najjeftiniji tekst model (https://ai.google.dev/gemini-api/docs/models,
 * pročitano 2026-10-05). Tarifa: $0,30 ulaz / $2,50 izlaz po 1M tokena
 * (https://ai.google.dev/gemini-api/docs/pricing). Jedan poziv pomoćnika je
 * ~500 ulaznih i ~400 izlaznih tokena ≈ $0,0012 - korisnik ne plaća kredite.
 */

export const CREA_LLM_MODEL = "gemini-3.5-flash-lite";
export const CREA_LLM_RATES_USD_PER_M = { input: 0.3, output: 2.5 } as const;

/** Poziva pomoćnika po korisniku i UTC danu (osoblje isto - trošak je naš). */
export const CREA_LLM_DAILY_LIMIT = 30;

/** Najduži unos koji pomoćnik prima (znakova). */
export const PROMPT_HELPER_INPUT_MAX = 600;

export const PROMPT_PART_KINDS = ["ko", "sta", "stil", "svetlo", "kamera"] as const;
export type PromptPartKind = (typeof PROMPT_PART_KINDS)[number];

/** `text` ide modelu (engleski), `gloss` je isti deo na jeziku korisnika. */
export type PromptPart = { kind: PromptPartKind; text: string; gloss: string };

export type PromptHelperResult = { parts: PromptPart[]; explanation: string; prompt: string };

export type CreaLlmLocale = "sr" | "en";

const SYSTEM = `You turn a beginner's short idea for an image into a precise, vivid image-generation prompt.
Reply with JSON only, no markdown:
{"parts":[{"kind":"ko|sta|stil|svetlo|kamera","text":"...","gloss":"..."}],"explanation":"..."}
Rules:
- 3 to 6 parts, in this order of kinds when present: ko (main subject: who or what, with concrete details), sta (action, setting, mood), stil (art style or medium), svetlo (lighting), kamera (shot type, angle, lens).
- "text" is a short English phrase for the image model (no full stops, max 25 words).
- "gloss" is the same phrase in the user's language.
- Keep everything the user asked for; invent only what makes the image clearer. Never add text or logos into the image unless asked.
- "explanation" is 1-2 friendly sentences in the user's language for a beginner: what you added and why.
- No violence, nudity, real politicians or celebrities.`;

/** Telo `generateContent` zahteva (Gemini REST). */
export function buildPromptHelperRequest(text: string, locale: CreaLlmLocale) {
  const language = locale === "sr" ? "Serbian (Latin script)" : "English";
  return {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `User's language: ${language}.\nUser's idea: ${text.trim().slice(0, PROMPT_HELPER_INPUT_MAX)}` }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.5, maxOutputTokens: 800 },
  };
}

export function geminiGenerateUrl(model: string = CREA_LLM_MODEL): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Konačan opis iz delova: redom, zarezima, bez tačke na kraju dela. */
export function promptFromParts(parts: readonly PromptPart[]): string {
  return parts.map((part) => part.text.replace(/[.\s]+$/, "")).filter(Boolean).join(", ");
}

/** Tekst odgovora iz `candidates[0].content.parts`. */
function responseText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const candidates = (raw as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } } | null)?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
    .join("");
  return text.length > 0 ? text : null;
}

/** Čita i proverava odgovor; `null` kad oblik ne valja (pozivalac tada javlja grešku). */
export function parsePromptHelperResponse(raw: unknown): PromptHelperResult | null {
  const text = responseText(raw);
  if (!text) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const record = json as { parts?: unknown; explanation?: unknown };
  if (!Array.isArray(record.parts)) return null;
  const parts: PromptPart[] = [];
  for (const entry of record.parts) {
    if (!entry || typeof entry !== "object") continue;
    const kind = (entry as { kind?: unknown }).kind;
    if (!PROMPT_PART_KINDS.includes(kind as PromptPartKind)) continue;
    const partText = clip((entry as { text?: unknown }).text, 300);
    if (!partText) continue;
    parts.push({ kind: kind as PromptPartKind, text: partText, gloss: clip((entry as { gloss?: unknown }).gloss, 300) || partText });
    if (parts.length === 8) break;
  }
  if (parts.length === 0) return null;
  return { parts, explanation: clip(record.explanation, 400), prompt: promptFromParts(parts) };
}

export type LlmUsage = { inputTokens: number; outputTokens: number };

/** Tokeni iz `usageMetadata`; „misli" modela se naplaćuju kao izlaz. */
export function llmUsageFrom(raw: unknown): LlmUsage {
  const meta = raw && typeof raw === "object" ? (raw as { usageMetadata?: Record<string, unknown> }).usageMetadata : undefined;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
  return {
    inputTokens: num(meta?.promptTokenCount),
    outputTokens: num(meta?.candidatesTokenCount) + num(meta?.thoughtsTokenCount),
  };
}

export function llmCostUsd(usage: LlmUsage): number {
  return (usage.inputTokens * CREA_LLM_RATES_USD_PER_M.input + usage.outputTokens * CREA_LLM_RATES_USD_PER_M.output) / 1_000_000;
}

/**
 * DEMO odgovor bez ključa (isto pravilo kao mock provajder, O3): deterministički,
 * od korisnikovih reči, da se ceo tok (bojeni delovi, „Upotrebi") vidi i bez Google-a.
 */
export function demoPromptHelper(text: string, locale: CreaLlmLocale): PromptHelperResult {
  const said = text.trim().replace(/\s+/g, " ").slice(0, 200) || (locale === "sr" ? "mačka na prozoru" : "a cat on a window sill");
  const sr = locale === "sr";
  const parts: PromptPart[] = [
    { kind: "ko", text: said, gloss: said },
    { kind: "sta", text: "in a cozy, detailed everyday setting", gloss: sr ? "u prijatnom prostoru punom detalja" : "in a cozy, detailed everyday setting" },
    { kind: "stil", text: "natural photograph, true-to-life colors", gloss: sr ? "prirodna fotografija, verne boje" : "natural photograph, true-to-life colors" },
    { kind: "svetlo", text: "soft warm window light", gloss: sr ? "meko toplo svetlo sa prozora" : "soft warm window light" },
    { kind: "kamera", text: "eye-level medium shot, 50mm lens", gloss: sr ? "srednji kadar u visini očiju, objektiv 50 mm" : "eye-level medium shot, 50mm lens" },
  ];
  return {
    parts,
    explanation: sr
      ? "DEMO (bez Google ključa): dodati su mesto, stil, svetlo i kadar - tako model zna tačno šta da nacrta."
      : "DEMO (no Google key): a setting, style, light and framing were added - so the model knows exactly what to draw.",
    prompt: promptFromParts(parts),
  };
}

// ── „Kako je ovo napravljeno?" (K16, S45): opis tuđe/okačene slike ─────────────

/** Najveća slika koju opis prima (bajtova) - klijent je pre slanja smanji na ~768 px JPEG. */
export const DESCRIBE_IMAGE_MAX_BYTES = 1_500_000;
export const DESCRIBE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const DESCRIBE_SYSTEM = `You look at one image and write the image-generation prompt that would recreate it.
Reply with JSON only, no markdown:
{"parts":[{"kind":"ko|sta|stil|svetlo|kamera","text":"...","gloss":"..."}],"explanation":"..."}
Rules:
- 3 to 6 parts, in this order of kinds when present: ko (main subject: who or what, with concrete details), sta (action, setting, mood), stil (art style or medium), svetlo (lighting), kamera (shot type, angle, lens).
- "text" is a short English phrase for the image model (no full stops, max 25 words).
- "gloss" is the same phrase in the user's language.
- Describe only what is visible. Never name real people; describe them generically. Do not transcribe long text from the image.
- "explanation" is 1-2 friendly sentences in the user's language for a beginner: what makes this image look the way it does.`;

/** `generateContent` sa slikom (inline base64). */
export function buildDescribeRequest(base64: string, mimeType: string, locale: CreaLlmLocale) {
  const language = locale === "sr" ? "Serbian (Latin script)" : "English";
  return {
    systemInstruction: { parts: [{ text: DESCRIBE_SYSTEM }] },
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType, data: base64 } }, { text: `User's language: ${language}.` }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 800 },
  };
}

/** Bajtovi → base64 (u delovima, da `String.fromCharCode` ne pređe granicu argumenata). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** DEMO opis bez ključa: isti oblik kao pravi, da se ceo tok vidi i bez Google-a. */
export function demoDescribe(locale: CreaLlmLocale): PromptHelperResult {
  const sr = locale === "sr";
  const parts: PromptPart[] = [
    { kind: "ko", text: "the main subject of the uploaded picture", gloss: sr ? "glavni predmet okačene slike" : "the main subject of the uploaded picture" },
    { kind: "stil", text: "natural photograph, true-to-life colors", gloss: sr ? "prirodna fotografija, verne boje" : "natural photograph, true-to-life colors" },
    { kind: "svetlo", text: "soft daylight", gloss: sr ? "meko dnevno svetlo" : "soft daylight" },
    { kind: "kamera", text: "eye-level medium shot", gloss: sr ? "srednji kadar u visini očiju" : "eye-level medium shot" },
  ];
  return {
    parts,
    explanation: sr
      ? "DEMO (bez Google ključa): pravi opis stiže kad je ključ postavljen - ovo samo pokazuje kako izgleda."
      : "DEMO (no Google key): the real description arrives once the key is set - this only shows what it looks like.",
    prompt: promptFromParts(parts),
  };
}
