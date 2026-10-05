/**
 * Jeftin LLM za video tokove Cree (K21, K17-19): strip (V10), najbolji momenti
 * dugog snimka (V26), objašnjavajući video (V28) i reklama (V31). Isti model i
 * obrazac kao „Pomoćnik za opis" (`creaLlmCore.ts`): šablon zahteva, čitanje i
 * sređivanje odgovora i deterministički DEMO bez ključa. Mrežu radi `creaLlm.ts`.
 */

import { CAMERA_MOVES } from "../lib/crea-camera-moves";
import { responseText, type CreaLlmLocale } from "./creaLlmCore";
import { sanitizeShots, SHOT_TYPES, STORYBOARD_LIMITS, type StoryShot } from "./creaStoryboardsCore";
import type { TranscriptSentence } from "./creaTranscriptsCore";

/** `maxOutputTokens` po nameni (800 iz pomoćnika je premalo za strip od 8 kadrova). */
export const LLM_OUTPUT_TOKENS = { storyboard: 3000, moments: 1500, explainer: 3000, ad: 1200 } as const;

function language(locale: CreaLlmLocale): string {
  return locale === "sr" ? "Serbian (Latin script)" : "English";
}

function request(system: string, user: string, maxOutputTokens: number, temperature = 0.6) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", temperature, maxOutputTokens },
  };
}

/** JSON iz odgovora (i kad je umotan u ```json ograde); `null` kad ga nema. */
export function parseJsonResponse(raw: unknown): Record<string, unknown> | null {
  const text = responseText(raw);
  if (!text) return null;
  try {
    const json: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function num(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

// ── Strip → film (V10) ──────────────────────────────────────────────────────

export type StoryCharacter = { handle: string; name: string; description: string | null };
export type StoryboardPlanInput = {
  story: string;
  shots: number;
  /** Engleski fragment stila (iz `lib/crea-styles.ts`), ili `null`. */
  style: string | null;
  characters: readonly StoryCharacter[];
  locale: CreaLlmLocale;
};
export type StoryboardPlan = { title: string; shots: StoryShot[] };

const STORYBOARD_SYSTEM = `You are a film director who turns a short story into a storyboard for an AI image and video generator.
Reply with JSON only, no markdown:
{"title":"...","shots":[{"caption":"...","shotType":"...","imagePrompt":"...","motionPrompt":"...","move":"...","durationS":5,"elements":["@handle"]}]}
Rules:
- Exactly the requested number of shots, in story order, with a clear beginning, middle and end.
- "title": a short film title in the user's language (max 6 words).
- "caption": one short sentence in the user's language that tells what happens (max 120 characters).
- "shotType": one of ${SHOT_TYPES.join(", ")}. Vary them like a real film: open wide, use close-ups for feelings.
- "imagePrompt": English, one vivid still frame: who, where, what they do, light. Refer to a listed character ONLY as its @handle (for example "@maja smiles at the window"). Never invent real people or celebrities. No text in the image.
- "motionPrompt": English, what moves during the shot (people, objects, weather), max 30 words.
- "move": one camera move id from this list: ${CAMERA_MOVES.map((move) => move.id).join(", ")}.
- "durationS": 3 to 8 seconds.
- "elements": the @handles of the listed characters that appear in the shot (empty array if none).
- No violence, no nudity, nothing unsafe for children.`;

export function buildStoryboardRequest(input: StoryboardPlanInput) {
  const characters =
    input.characters.length > 0
      ? input.characters.map((character) => `@${character.handle}: ${character.name}${character.description ? ` (${character.description})` : ""}`).join("\n")
      : "(none - invent generic characters, never real people)";
  const user = [
    `User's language: ${language(input.locale)}.`,
    `Number of shots: ${input.shots}.`,
    `Visual style: ${input.style ?? "cinematic, natural colours"}.`,
    `Characters:\n${characters}`,
    `Story:\n${input.story.trim().slice(0, STORYBOARD_LIMITS.storyChars)}`,
  ].join("\n\n");
  return request(STORYBOARD_SYSTEM, user, LLM_OUTPUT_TOKENS.storyboard);
}

/** `@maja` u odgovoru → handle `maja` (samo za Likove iz unosa). */
function handlesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.replace(/^@/, "")) : [];
}

/**
 * Odgovor → strip: višak kadrova se odseca, nepoznat pokret postaje „staticno",
 * trajanje se svodi na 3-10 s, nepoznati Likovi ispadaju. Manje od 3 kadra ili
 * neispravan JSON = `null`.
 */
export function parseStoryboardResponse(raw: unknown, options: { shots: number; handles: readonly string[] }): StoryboardPlan | null {
  const json = parseJsonResponse(raw);
  if (!json || !Array.isArray(json.shots)) return null;
  const prepared = json.shots.map((shot) =>
    shot && typeof shot === "object" ? { ...(shot as Record<string, unknown>), elements: handlesOf((shot as Record<string, unknown>).elements) } : shot,
  );
  const shots = sanitizeShots(prepared, options.handles).slice(0, Math.min(STORYBOARD_LIMITS.shotsMax, Math.max(STORYBOARD_LIMITS.shotsMin, options.shots)));
  if (shots.length < STORYBOARD_LIMITS.shotsMin) return null;
  return { title: clip(json.title, STORYBOARD_LIMITS.titleChars) || "Moj film", shots };
}

const DEMO_BEATS: ReadonlyArray<{ sr: string; en: string; shotType: StoryShot["shotType"]; image: string; motion: string; move: string }> = [
  { sr: "Sve počinje jednog mirnog jutra.", en: "It all starts one quiet morning.", shotType: "siroki", image: "a quiet street at sunrise, warm light on the rooftops", motion: "birds fly across the sky, leaves move in the breeze", move: "dron-uspon" },
  { sr: "Glavni lik primećuje nešto neobično.", en: "The main character notices something unusual.", shotType: "srednji", image: "the main character stops and looks at something surprising", motion: "the character turns the head slowly", move: "priblizavanje" },
  { sr: "Iznenađenje mu se vidi na licu.", en: "Surprise shows on their face.", shotType: "krupni", image: "close view of the character's surprised face", motion: "the eyes widen, a small smile appears", move: "zum-unutra" },
  { sr: "Odluka je pala - kreće u avanturu.", en: "The decision is made - the adventure begins.", shotType: "zablja", image: "the character walks forward with confidence", motion: "the character walks toward the camera", move: "pracenje-iza" },
  { sr: "Na putu pronalazi važan trag.", en: "On the way they find an important clue.", shotType: "detalj", image: "a small glowing key lying on old stone steps", motion: "the key glints in the light", move: "do-detalja" },
  { sr: "Grad odozgo izgleda kao mapa.", en: "From above the city looks like a map.", shotType: "ptica", image: "the city seen from above with tiny people on the streets", motion: "clouds drift slowly over the city", move: "dron-kruzenje" },
  { sr: "Prijatelj stiže u pravom trenutku.", en: "A friend arrives just in time.", shotType: "preko-ramena", image: "two friends meet and talk on a bridge", motion: "the friends wave and laugh", move: "kruzenje-levo" },
  { sr: "Kraj dana, a priča tek počinje.", en: "The day ends, and the story is just beginning.", shotType: "siroki", image: "the characters watch the sunset over the river", motion: "the sun slowly sets, the water sparkles", move: "udaljavanje" },
];

/**
 * DEMO strip bez ključa (O3): kadrovi iz šablona (početak - zaplet - kraj), uz
 * prvi Lik iz unosa u svakom kadru, da se ceo tok (kartice, cena, slike, video,
 * montaža) vidi i bez Google-a.
 */
export function demoStoryboard(input: StoryboardPlanInput): StoryboardPlan {
  const count = Math.min(STORYBOARD_LIMITS.shotsMax, Math.max(STORYBOARD_LIMITS.shotsMin, input.shots));
  const lead = input.characters[0];
  const shots: StoryShot[] = Array.from({ length: count }, (_, index) => {
    const beat = DEMO_BEATS[index % DEMO_BEATS.length]!;
    const who = lead ? `@${lead.handle}` : "a young person";
    const image = beat.image.replace("the main character", who).replace("the character", who);
    return {
      caption: input.locale === "sr" ? beat.sr : beat.en,
      shotType: beat.shotType,
      imagePrompt: image.includes(who) ? image : `${image}, ${who} in the frame`,
      motionPrompt: beat.motion,
      move: beat.move,
      durationS: 5,
      elements: lead ? [lead.handle] : [],
    };
  });
  const words = input.story.trim().split(/\s+/).slice(0, 4).join(" ");
  return { title: words ? `DEMO: ${words}` : "DEMO film", shots };
}

// ── Najbolji momenti (V26) ──────────────────────────────────────────────────

export const MOMENT_LIMITS = { minS: 15, maxS: 60, count: 5, titleChars: 60, whyChars: 160 } as const;
export type Moment = { start: number; end: number; title: string; why: string; score: number };

const MOMENTS_SYSTEM = `You pick the best moments of a long video for short vertical clips (TikTok, Reels, Shorts).
You get the transcript as lines "[start-end] sentence" with times in seconds.
Reply with JSON only, no markdown:
{"moments":[{"start":12.3,"end":41.0,"title":"...","why":"...","score":87}]}
Rules:
- 3 to 5 moments, each ${MOMENT_LIMITS.minS} to ${MOMENT_LIMITS.maxS} seconds, not overlapping.
- Start and end on sentence boundaries from the transcript (use the given times).
- Prefer a strong hook in the first seconds, a complete thought, humour, surprise or a useful tip.
- "title": a catchy title in the user's language (max 8 words). "why": one sentence in the user's language why it works.
- "score": 0-100, how likely it is to do well.`;

export function buildMomentsRequest(digest: string, durationS: number, locale: CreaLlmLocale) {
  const user = `User's language: ${language(locale)}.\nVideo length: ${Math.round(durationS)} s.\nTranscript:\n${digest}`;
  return request(MOMENTS_SYSTEM, user, LLM_OUTPUT_TOKENS.moments, 0.4);
}

/** Najbliža granica rečenice (početak ili kraj) vremenu `t`. */
function nearest(values: readonly number[], t: number): number {
  return values.reduce((best, value) => (Math.abs(value - t) < Math.abs(best - t) ? value : best), values[0] ?? t);
}

/**
 * Momenti vezani za granice rečenica, 15-60 s, bez preklapanja (ostaje bolji
 * po oceni), najviše 5, poređani po oceni. Prazno ili neispravno = `null`.
 */
export function cleanMoments(rawMoments: readonly unknown[], sentences: readonly TranscriptSentence[], durationS: number): Moment[] {
  const starts = sentences.map((sentence) => sentence.start);
  const ends = sentences.map((sentence) => sentence.end);
  const candidates: Moment[] = [];
  for (const entry of rawMoments) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    let start = num(record.start);
    let end = num(record.end);
    if (start === null || end === null) continue;
    if (starts.length > 0) {
      start = nearest(starts, start);
      end = nearest(ends.filter((value) => value > start! + MOMENT_LIMITS.minS - 5), end);
    }
    start = Math.max(0, start);
    end = Math.min(durationS, end);
    if (end - start > MOMENT_LIMITS.maxS) end = start + MOMENT_LIMITS.maxS;
    if (end - start < MOMENT_LIMITS.minS) end = Math.min(durationS, start + MOMENT_LIMITS.minS);
    if (end - start < MOMENT_LIMITS.minS - 0.5) continue;
    const score = Math.max(0, Math.min(100, Math.round(num(record.score) ?? 50)));
    candidates.push({
      start: Math.round(start * 10) / 10,
      end: Math.round(end * 10) / 10,
      title: clip(record.title, MOMENT_LIMITS.titleChars) || "Moment",
      why: clip(record.why, MOMENT_LIMITS.whyChars),
      score,
    });
  }
  const kept: Moment[] = [];
  for (const moment of [...candidates].sort((a, b) => b.score - a.score)) {
    if (kept.some((other) => moment.start < other.end && other.start < moment.end)) continue;
    kept.push(moment);
    if (kept.length === MOMENT_LIMITS.count) break;
  }
  return kept;
}

export function parseMomentsResponse(raw: unknown, sentences: readonly TranscriptSentence[], durationS: number): Moment[] | null {
  const json = parseJsonResponse(raw);
  if (!json || !Array.isArray(json.moments)) return null;
  const moments = cleanMoments(json.moments, sentences, durationS);
  return moments.length > 0 ? moments : null;
}

/** DEMO momenti bez ključa: ravnomerno kroz snimak, na granicama rečenica. */
export function demoMoments(sentences: readonly TranscriptSentence[], durationS: number, locale: CreaLlmLocale): Moment[] {
  const length = Math.min(MOMENT_LIMITS.maxS, Math.max(MOMENT_LIMITS.minS, durationS / 4));
  const count = Math.max(1, Math.min(3, Math.floor(durationS / length)));
  const raw = Array.from({ length: count }, (_, index) => ({
    start: (index * durationS) / count,
    end: (index * durationS) / count + length,
    title: locale === "sr" ? `DEMO moment ${index + 1}` : `DEMO moment ${index + 1}`,
    why: locale === "sr" ? "DEMO: pravi izbor stiže uz Google ključ." : "DEMO: the real pick comes with the Google key.",
    score: 80 - index * 10,
  }));
  return cleanMoments(raw, sentences, durationS);
}

// ── Objašnjavajući video (V28) ──────────────────────────────────────────────

export const EXPLAINER_STYLE_IDS = ["tabla", "stapici", "papir", "glina", "pikseli"] as const;
export type ExplainerStyleId = (typeof EXPLAINER_STYLE_IDS)[number];

/** Engleski fragment stila za slike scena (i za LLM, da „visual" odgovara stilu). */
export const EXPLAINER_STYLE_FRAGMENTS: Record<ExplainerStyleId, string> = {
  tabla: "hand-drawn white chalk illustration on a dark green school chalkboard, simple clear shapes",
  stapici: "minimal stick-figure doodle with black marker on white paper, friendly and funny",
  papir: "colourful layered paper cut-out collage, soft shadows between paper layers",
  glina: "cute claymation style, soft plasticine figures, warm studio light",
  pikseli: "retro 16-bit pixel art, bright limited palette, crisp pixels",
};

export const EXPLAINER_LIMITS = { textChars: 3000, scenesMin: 3, scenesMax: 8, narrationChars: 300, visualChars: 400, lengths: [30, 60, 90] as const } as const;

export type ExplainerScene = { narration: string; visual: string; seconds: number };
export type ExplainerPlan = { title: string; scenes: ExplainerScene[] };

/**
 * Broj scena za dužinu: oko jedna slika na 20 s (Ken Burns je drži živom), 3-8.
 * Tako minut staje u cilj od ~20-50 kr (3 slike + glas, plan §7.7).
 */
export function explainerSceneCount(seconds: number): number {
  return Math.min(EXPLAINER_LIMITS.scenesMax, Math.max(EXPLAINER_LIMITS.scenesMin, Math.round(seconds / 20)));
}

const EXPLAINER_SYSTEM = `You turn a lesson or text into a short explainer video for beginners.
Reply with JSON only, no markdown:
{"title":"...","scenes":[{"narration":"...","visual":"...","seconds":15}]}
Rules:
- Exactly the requested number of scenes; together they explain the text simply, start with a hook and end with a one-sentence recap.
- "narration": what the narrator says, in the user's language, friendly and clear, max 280 characters; spoken at about 14 characters per second.
- "visual": English, one picture that shows the idea of the scene in the requested style, no text or letters in the picture.
- "seconds": how long the scene lasts; all scenes together should be about the requested length.
- "title": max 6 words, in the user's language.`;

export function buildExplainerRequest(input: { text: string; seconds: number; styleId: ExplainerStyleId; locale: CreaLlmLocale }) {
  const user = [
    `User's language: ${language(input.locale)}.`,
    `Length: about ${input.seconds} seconds. Number of scenes: ${explainerSceneCount(input.seconds)}.`,
    `Style of the pictures: ${EXPLAINER_STYLE_FRAGMENTS[input.styleId]}.`,
    `Text:\n${input.text.trim().slice(0, EXPLAINER_LIMITS.textChars)}`,
  ].join("\n\n");
  return request(EXPLAINER_SYSTEM, user, LLM_OUTPUT_TOKENS.explainer);
}

function cleanScenes(raw: readonly unknown[], scenesMax: number): ExplainerScene[] {
  const scenes: ExplainerScene[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const narration = clip(record.narration, EXPLAINER_LIMITS.narrationChars);
    const visual = clip(record.visual, EXPLAINER_LIMITS.visualChars);
    if (!narration || !visual) continue;
    const seconds = Math.min(30, Math.max(4, Math.round(num(record.seconds) ?? Math.ceil(narration.length / 14))));
    scenes.push({ narration, visual, seconds });
    if (scenes.length === scenesMax) break;
  }
  return scenes;
}

export function parseExplainerResponse(raw: unknown, seconds: number): ExplainerPlan | null {
  const json = parseJsonResponse(raw);
  if (!json || !Array.isArray(json.scenes)) return null;
  const scenes = cleanScenes(json.scenes, Math.min(EXPLAINER_LIMITS.scenesMax, explainerSceneCount(seconds) + 1));
  if (scenes.length < EXPLAINER_LIMITS.scenesMin) return null;
  return { title: clip(json.title, 80) || "Objašnjenje", scenes };
}

/** DEMO plan: rečenice teksta raspoređene u scene, sa opštom slikom stila. */
export function demoExplainer(input: { text: string; seconds: number; locale: CreaLlmLocale }): ExplainerPlan {
  const count = explainerSceneCount(input.seconds);
  const sentences = input.text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const per = Math.max(1, Math.ceil(sentences.length / count));
  const scenes: ExplainerScene[] = [];
  for (let index = 0; index < count; index++) {
    const part = sentences.slice(index * per, (index + 1) * per).join(" ");
    const narration = (part || (input.locale === "sr" ? `DEMO scena ${index + 1}.` : `DEMO scene ${index + 1}.`)).slice(0, EXPLAINER_LIMITS.narrationChars);
    scenes.push({ narration, visual: `a simple friendly illustration of idea number ${index + 1} of the lesson`, seconds: Math.round(input.seconds / count) });
  }
  return { title: input.locale === "sr" ? "DEMO objašnjenje" : "DEMO explainer", scenes };
}

// ── Reklama za mali biznis (V31) ────────────────────────────────────────────

export const AD_LIMITS = { productChars: 400, brandChars: 60, shotsMin: 3, shotsMax: 4, onScreenChars: 60, narrationChars: 200, ctaChars: 40, promptChars: 400 } as const;
export type AdScript = { headline: string; shots: Array<{ onScreen: string; narration: string }>; cta: string; animationPrompt: string };

const AD_SYSTEM = `You write a 15-20 second video ad for a small local business, from a product photo and two sentences.
Reply with JSON only, no markdown:
{"headline":"...","shots":[{"onScreen":"...","narration":"..."}],"cta":"...","animationPrompt":"..."}
Rules:
- 3 or 4 shots. "onScreen": a short on-screen text in the user's language (max 6 words). "narration": what the voice-over says in that shot, in the user's language, max 160 characters.
- All narration together is 200-280 characters (15-20 seconds of speech). Warm, honest, no false claims, no prices unless given.
- "headline": max 5 words. "cta": a call to action in the user's language, max 5 words (for example "Svrati danas!").
- "animationPrompt": English, how the product could move in a short commercial shot (camera move, light, small motion), max 40 words, no people, no text.`;

export function buildAdRequest(input: { product: string; brand: string | null; locale: CreaLlmLocale }) {
  const user = [
    `User's language: ${language(input.locale)}.`,
    input.brand ? `Business name: ${input.brand.slice(0, AD_LIMITS.brandChars)}.` : "",
    `About the product or offer:\n${input.product.trim().slice(0, AD_LIMITS.productChars)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return request(AD_SYSTEM, user, LLM_OUTPUT_TOKENS.ad, 0.7);
}

export function parseAdResponse(raw: unknown): AdScript | null {
  const json = parseJsonResponse(raw);
  if (!json || !Array.isArray(json.shots)) return null;
  const shots = json.shots
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const onScreen = clip(record.onScreen, AD_LIMITS.onScreenChars);
      const narration = clip(record.narration, AD_LIMITS.narrationChars);
      return onScreen || narration ? { onScreen, narration } : null;
    })
    .filter((shot): shot is { onScreen: string; narration: string } => shot !== null)
    .slice(0, AD_LIMITS.shotsMax);
  if (shots.length < AD_LIMITS.shotsMin) return null;
  return {
    headline: clip(json.headline, AD_LIMITS.onScreenChars),
    shots,
    cta: clip(json.cta, AD_LIMITS.ctaChars),
    animationPrompt: clip(json.animationPrompt, AD_LIMITS.promptChars) || "slow push-in on the product, soft studio light, gentle reflections",
  };
}

/** DEMO scenario bez ključa: od korisnikovih rečenica, da se ceo tok vidi. */
export function demoAd(input: { product: string; brand: string | null; locale: CreaLlmLocale }): AdScript {
  const sr = input.locale === "sr";
  const sentences = input.product.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const first = (sentences[0] ?? (sr ? "Naš proizvod." : "Our product.")).slice(0, AD_LIMITS.narrationChars);
  const second = (sentences[1] ?? (sr ? "Napravljen sa ljubavlju, za tebe." : "Made with love, for you.")).slice(0, AD_LIMITS.narrationChars);
  const brand = input.brand?.trim() || (sr ? "nas" : "us");
  return {
    headline: sr ? "DEMO reklama" : "DEMO ad",
    shots: [
      { onScreen: sr ? "Upoznaj nas" : "Meet us", narration: first },
      { onScreen: sr ? "Napravljeno sa ljubavlju" : "Made with love", narration: second },
      { onScreen: sr ? "Za tebe" : "For you", narration: sr ? `Svrati do ${brand} i uveri se sam.` : `Visit ${brand} and see for yourself.` },
    ],
    cta: sr ? "Svrati danas!" : "Visit today!",
    animationPrompt: "slow push-in on the product, soft studio light, gentle reflections",
  };
}
