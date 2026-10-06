import type { LocalizedText } from "./i18n";

/**
 * Glasovi Cree (K22, A2/A3/A8): dva motora i biblioteka njihovih glasova.
 *
 * Čist modul - uvoze ga i Convex (`creaVoices` proverava `engine`/`voiceId`) i UI.
 *
 * - **Gemini** (`gemini-tts`, Gemini 3.8 Flash TTS): osnovni srpski glas, 30
 *   ugrađenih glasova, stil se zadaje opisom (https://ai.google.dev/gemini-api/docs/speech-generation).
 * - **ElevenLabs** (`tts`, Eleven v3 preko fal-a): premium, 10 glasova iz kataloga.
 *
 * Oba motora govore srpski. Pol je sa zvaničnih spiskova (Google Chirp 3 HD
 * spisak istih glasova, ElevenLabs biblioteka); OSOBINA je Google-ova reč iz
 * dokumentacije („Bright", „Firm"…), a GODINE i TON su naša procena iz te reči
 * (Google ih ne objavljuje) - zato filter kaže „otprilike".
 */

export const VOICE_ENGINES = ["gemini", "eleven"] as const;
export type VoiceEngineId = (typeof VOICE_ENGINES)[number];

export type VoiceEngine = {
  id: VoiceEngineId;
  /** Red kataloga (`models.slug`) koji ovaj motor vozi. */
  modelSlug: string;
  label: LocalizedText;
  /** Kratko: zašto baš ovaj motor. */
  pitch: LocalizedText;
  serbian: true;
  /** Najduži tekst jednog posla (isto kao `capabilities.maxChars` reda). */
  maxChars: number;
  /** Šta motor ume od podešavanja (A4). */
  supports: { describe: boolean; pitch: boolean };
};

export const VOICE_ENGINE_LIST: readonly VoiceEngine[] = [
  {
    id: "gemini",
    modelSlug: "gemini-tts",
    label: { sr: "Gemini", en: "Gemini" },
    pitch: {
      sr: "Osnovni i najjeftiniji. 30 glasova, razume opis kako da zvuči.",
      en: "The default and the cheapest. 30 voices, understands a description of how to sound.",
    },
    serbian: true,
    maxChars: 2000,
    supports: { describe: true, pitch: true },
  },
  {
    id: "eleven",
    modelSlug: "tts",
    label: { sr: "ElevenLabs", en: "ElevenLabs" },
    pitch: {
      sr: "Premium: najživlja intonacija, skuplji po znaku.",
      en: "Premium: the liveliest delivery, pricier per character.",
    },
    serbian: true,
    maxChars: 5000,
    supports: { describe: false, pitch: false },
  },
];

export const DEFAULT_VOICE_ENGINE: VoiceEngineId = "gemini";

/** Stanje modela u katalogu za ovog korisnika: radi uživo, samo DEMO (osoblje bez ključa) ili nedostupan. */
export type EngineAvailability = "live" | "demo" | null;

/**
 * Glas za naraciju alata (objašnjenje, govorni oglas; K30, nalaz K29-20): prvi
 * motor po redu (Gemini, pa ElevenLabs) koji prima ceo tekst i radi uživo; ako
 * nijedan ne radi uživo, prvi koji postoji kao DEMO. `null` = nema glasa.
 */
export function narrationEngine(chars: number, availability: (modelSlug: string) => EngineAvailability): VoiceEngine | null {
  const fits = VOICE_ENGINE_LIST.filter((engine) => chars <= engine.maxChars);
  return (
    fits.find((engine) => availability(engine.modelSlug) === "live") ??
    fits.find((engine) => availability(engine.modelSlug) === "demo") ??
    null
  );
}

export function voiceEngine(id: VoiceEngineId): VoiceEngine {
  return VOICE_ENGINE_LIST.find((engine) => engine.id === id) ?? VOICE_ENGINE_LIST[0]!;
}

export function isVoiceEngineId(value: unknown): value is VoiceEngineId {
  return typeof value === "string" && (VOICE_ENGINES as readonly string[]).includes(value);
}

export type VoiceGender = "zenski" | "muski";
export type VoiceAge = "mlad" | "srednji" | "zreo";
export const VOICE_TONES = ["energican", "topao", "mek", "ozbiljan", "jasan", "opusten"] as const;
export type VoiceTone = (typeof VOICE_TONES)[number];

export type CreaVoice = {
  engine: VoiceEngineId;
  /** Ime glasa kod provajdera - ide u `params.voice`. */
  id: string;
  gender: VoiceGender;
  age: VoiceAge;
  tones: readonly VoiceTone[];
  trait: LocalizedText;
  /** Naglasak (samo ElevenLabs objavljuje). */
  accent?: LocalizedText;
};

const T = (sr: string, en: string): LocalizedText => ({ sr, en });

const GEMINI: readonly CreaVoice[] = [
  { engine: "gemini", id: "Zephyr", gender: "zenski", age: "mlad", tones: ["energican"], trait: T("Vedar", "Bright") },
  { engine: "gemini", id: "Puck", gender: "muski", age: "mlad", tones: ["energican"], trait: T("Razigran", "Upbeat") },
  { engine: "gemini", id: "Charon", gender: "muski", age: "srednji", tones: ["jasan", "ozbiljan"], trait: T("Informativan", "Informative") },
  { engine: "gemini", id: "Kore", gender: "zenski", age: "srednji", tones: ["ozbiljan"], trait: T("Odlučan", "Firm") },
  { engine: "gemini", id: "Fenrir", gender: "muski", age: "mlad", tones: ["energican"], trait: T("Uzbudljiv", "Excitable") },
  { engine: "gemini", id: "Leda", gender: "zenski", age: "mlad", tones: ["energican"], trait: T("Mladalački", "Youthful") },
  { engine: "gemini", id: "Orus", gender: "muski", age: "srednji", tones: ["ozbiljan"], trait: T("Odlučan", "Firm") },
  { engine: "gemini", id: "Aoede", gender: "zenski", age: "mlad", tones: ["opusten"], trait: T("Lagan", "Breezy") },
  { engine: "gemini", id: "Callirrhoe", gender: "zenski", age: "srednji", tones: ["opusten"], trait: T("Opušten", "Easy-going") },
  { engine: "gemini", id: "Autonoe", gender: "zenski", age: "srednji", tones: ["energican"], trait: T("Vedar", "Bright") },
  { engine: "gemini", id: "Enceladus", gender: "muski", age: "srednji", tones: ["mek"], trait: T("Prozračan", "Breathy") },
  { engine: "gemini", id: "Iapetus", gender: "muski", age: "srednji", tones: ["jasan"], trait: T("Jasan", "Clear") },
  { engine: "gemini", id: "Umbriel", gender: "muski", age: "srednji", tones: ["opusten"], trait: T("Opušten", "Easy-going") },
  { engine: "gemini", id: "Algieba", gender: "muski", age: "srednji", tones: ["mek", "topao"], trait: T("Uglađen", "Smooth") },
  { engine: "gemini", id: "Despina", gender: "zenski", age: "srednji", tones: ["mek"], trait: T("Uglađen", "Smooth") },
  { engine: "gemini", id: "Erinome", gender: "zenski", age: "srednji", tones: ["jasan"], trait: T("Jasan", "Clear") },
  { engine: "gemini", id: "Algenib", gender: "muski", age: "zreo", tones: ["ozbiljan"], trait: T("Promukao", "Gravelly") },
  { engine: "gemini", id: "Rasalgethi", gender: "muski", age: "zreo", tones: ["jasan"], trait: T("Informativan", "Informative") },
  { engine: "gemini", id: "Laomedeia", gender: "zenski", age: "mlad", tones: ["energican"], trait: T("Razigran", "Upbeat") },
  { engine: "gemini", id: "Achernar", gender: "zenski", age: "srednji", tones: ["mek"], trait: T("Mek", "Soft") },
  { engine: "gemini", id: "Alnilam", gender: "muski", age: "srednji", tones: ["ozbiljan"], trait: T("Odlučan", "Firm") },
  { engine: "gemini", id: "Schedar", gender: "muski", age: "srednji", tones: ["jasan"], trait: T("Ujednačen", "Even") },
  { engine: "gemini", id: "Gacrux", gender: "zenski", age: "zreo", tones: ["ozbiljan"], trait: T("Zreo", "Mature") },
  { engine: "gemini", id: "Pulcherrima", gender: "zenski", age: "srednji", tones: ["jasan"], trait: T("Direktan", "Forward") },
  { engine: "gemini", id: "Achird", gender: "muski", age: "srednji", tones: ["topao"], trait: T("Prijateljski", "Friendly") },
  { engine: "gemini", id: "Zubenelgenubi", gender: "muski", age: "mlad", tones: ["opusten"], trait: T("Ležeran", "Casual") },
  { engine: "gemini", id: "Vindemiatrix", gender: "zenski", age: "zreo", tones: ["mek"], trait: T("Nežan", "Gentle") },
  { engine: "gemini", id: "Sadachbia", gender: "muski", age: "mlad", tones: ["energican"], trait: T("Živahan", "Lively") },
  { engine: "gemini", id: "Sadaltager", gender: "muski", age: "zreo", tones: ["jasan"], trait: T("Upućen", "Knowledgeable") },
  { engine: "gemini", id: "Sulafat", gender: "zenski", age: "srednji", tones: ["topao"], trait: T("Topao", "Warm") },
];

/** Isti glasovi kao `VOICE_OPTIONS` reda `tts` (`convex/providers/falAudioModels.ts`). */
const ELEVEN: readonly CreaVoice[] = [
  { engine: "eleven", id: "Aria", gender: "zenski", age: "srednji", tones: ["energican"], trait: T("Izražajan", "Expressive"), accent: T("američki", "American") },
  { engine: "eleven", id: "Roger", gender: "muski", age: "srednji", tones: ["ozbiljan"], trait: T("Samouveren", "Confident"), accent: T("američki", "American") },
  { engine: "eleven", id: "Sarah", gender: "zenski", age: "mlad", tones: ["mek"], trait: T("Mek", "Soft"), accent: T("američki", "American") },
  { engine: "eleven", id: "Laura", gender: "zenski", age: "mlad", tones: ["energican"], trait: T("Razigran", "Upbeat"), accent: T("američki", "American") },
  { engine: "eleven", id: "Charlie", gender: "muski", age: "srednji", tones: ["opusten"], trait: T("Prirodan", "Natural"), accent: T("australijski", "Australian") },
  { engine: "eleven", id: "George", gender: "muski", age: "srednji", tones: ["topao"], trait: T("Topao", "Warm"), accent: T("britanski", "British") },
  { engine: "eleven", id: "Callum", gender: "muski", age: "srednji", tones: ["ozbiljan"], trait: T("Snažan", "Intense"), accent: T("transatlantski", "Transatlantic") },
  { engine: "eleven", id: "Liam", gender: "muski", age: "mlad", tones: ["jasan"], trait: T("Razgovetan", "Articulate"), accent: T("američki", "American") },
  { engine: "eleven", id: "Charlotte", gender: "zenski", age: "mlad", tones: ["mek"], trait: T("Zavodljiv", "Seductive"), accent: T("švedski", "Swedish") },
  { engine: "eleven", id: "Alice", gender: "zenski", age: "srednji", tones: ["jasan", "ozbiljan"], trait: T("Samouveren", "Confident"), accent: T("britanski", "British") },
];

export const CREA_VOICES: readonly CreaVoice[] = [...GEMINI, ...ELEVEN];

export const DEFAULT_VOICE: Record<VoiceEngineId, string> = { gemini: "Sulafat", eleven: "Aria" };

export function voiceById(engine: VoiceEngineId, id: string): CreaVoice | undefined {
  return CREA_VOICES.find((voice) => voice.engine === engine && voice.id === id);
}

export function voicesOf(engine: VoiceEngineId): CreaVoice[] {
  return CREA_VOICES.filter((voice) => voice.engine === engine);
}

/** Ključ glasa u URL-u i u spisku omiljenih: `gemini:Kore`. */
export function voiceKey(voice: { engine: VoiceEngineId; id: string }): string {
  return `${voice.engine}:${voice.id}`;
}

export function parseVoiceKey(key: string | null | undefined): CreaVoice | undefined {
  if (!key) return undefined;
  const [engine, id] = key.split(":");
  return isVoiceEngineId(engine) && id ? voiceById(engine, id) : undefined;
}

/**
 * Jezici iz filtera. Oba motora govore sve ove jezike (Gemini 3.8 TTS 130+,
 * Eleven v3 70+), pa filter po jeziku nikad ne sakrije glas - stoji da bi
 * početnik video da srpski radi sa svakim glasom.
 */
export const VOICE_LANGUAGES = ["sr", "hr", "en", "de", "fr", "es", "it", "ru"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export const VOICE_LANGUAGE_LABELS: Record<VoiceLanguage, LocalizedText> = {
  sr: T("Srpski", "Serbian"),
  hr: T("Hrvatski", "Croatian"),
  en: T("Engleski", "English"),
  de: T("Nemački", "German"),
  fr: T("Francuski", "French"),
  es: T("Španski", "Spanish"),
  it: T("Italijanski", "Italian"),
  ru: T("Ruski", "Russian"),
};

const ENGINE_LANGUAGES: Record<VoiceEngineId, readonly VoiceLanguage[]> = { gemini: VOICE_LANGUAGES, eleven: VOICE_LANGUAGES };

export function speaksLanguage(voice: CreaVoice, language: VoiceLanguage): boolean {
  return ENGINE_LANGUAGES[voice.engine].includes(language);
}

export type VoiceFilter = {
  engine?: VoiceEngineId | null;
  language?: VoiceLanguage | null;
  gender?: VoiceGender | null;
  age?: VoiceAge | null;
  tone?: VoiceTone | null;
  /** Samo ovi ključevi (`voiceKey`) - „Samo omiljeni". */
  only?: ReadonlySet<string> | null;
};

export function filterVoices(voices: readonly CreaVoice[], filter: VoiceFilter): CreaVoice[] {
  return voices.filter(
    (voice) =>
      (!filter.engine || voice.engine === filter.engine) &&
      (!filter.language || speaksLanguage(voice, filter.language)) &&
      (!filter.gender || voice.gender === filter.gender) &&
      (!filter.age || voice.age === filter.age) &&
      (!filter.tone || voice.tones.includes(filter.tone)) &&
      (!filter.only || filter.only.has(voiceKey(voice))),
  );
}

/** Rečenica uzorka (A3). Promena teksta = nova verzija, pa se svi uzorci prave ponovo. */
export const VOICE_SAMPLE_VERSION = 1;
export const VOICE_SAMPLE_TEXT = "Zdravo! Ja sam tvoj glas u Crei. Napiši bilo šta, a ja ću to izgovoriti na srpskom.";

// ── Dizajniraj glas (A8) ────────────────────────────────────────────────────

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const GENDER_WORDS: Record<VoiceGender, readonly string[]> = {
  zenski: ["zensk", "zena", "zene", "devojk", "devojc", "baka", "majk", "mama", "gospodj", "female", "woman", "girl", "lady", "grandma", "mother"],
  muski: ["musk", "muskar", "decak", "deda", "otac", "tata", "momak", "gospodin", "male", "man ", "boy", "guy", "grandpa", "father"],
};

const AGE_WORDS: Record<VoiceAge, readonly string[]> = {
  mlad: ["mlad", "dete", "devojc", "decak", "tinejdz", "student", "young", "teen", "kid", "child"],
  srednji: ["srednjih godina", "sredovec", "middle"],
  zreo: ["star", "baka", "deda", "zreo", "zrel", "iskusn", "old", "mature", "elderly", "grandma", "grandpa"],
};

const TONE_WORDS: Record<VoiceTone, readonly string[]> = {
  energican: ["energic", "vedar", "vesel", "razigran", "uzbud", "zivahn", "radosn", "energetic", "cheerful", "upbeat", "excited", "happy", "lively"],
  topao: ["topa", "topl", "prijat", "prijatelj", "srdac", "warm", "friendly", "kind"],
  mek: ["mek", "nezn", "tih", "smiren", "sapu", "blag", "uspavank", "soft", "gentle", "calm", "quiet", "whisper"],
  ozbiljan: ["ozbilj", "dubok", "dubo", "autoritat", "strog", "odlucn", "promukao", "serious", "deep", "firm", "authoritative", "strict"],
  jasan: ["jasan", "jasn", "razgovet", "spiker", "narator", "vesti", "predavac", "clear", "news", "narrator", "teacher"],
  opusten: ["opusten", "lezer", "lezern", "lagan", "casual", "relaxed", "easy"],
};

export type VoiceWish = { gender: VoiceGender | null; age: VoiceAge | null; tones: VoiceTone[] };

/** Šta opis traži (pol, godine, ton) - po rečima, bez LLM-a. */
export function readVoiceWish(description: string): VoiceWish {
  const text = ` ${fold(description)} `;
  const has = (words: readonly string[]) => words.some((word) => text.includes(word));
  const gender = has(GENDER_WORDS.zenski) ? "zenski" : has(GENDER_WORDS.muski) ? "muski" : null;
  const age = (["zreo", "mlad", "srednji"] as const).find((value) => has(AGE_WORDS[value])) ?? null;
  const tones = VOICE_TONES.filter((tone) => has(TONE_WORDS[tone]));
  return { gender, age, tones };
}

/**
 * Tri glasa koja najviše liče na opis (A8, plan K06 §5.3): pol nosi najviše, pa
 * godine, pa ton. Izjednačeni ostaju redom biblioteke, pa je izbor ponovljiv.
 */
export function suggestVoices(description: string, engine: VoiceEngineId = "gemini", count = 3): CreaVoice[] {
  const wish = readVoiceWish(description);
  const scored = voicesOf(engine).map((voice, index) => {
    let score = 0;
    if (wish.gender) score += voice.gender === wish.gender ? 4 : -6;
    if (wish.age) score += voice.age === wish.age ? 2 : 0;
    for (const tone of wish.tones) if (voice.tones.includes(tone)) score += 2;
    return { voice, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, Math.max(0, count)).map((entry) => entry.voice);
}
