/**
 * Google-ov govor (Crea K22, A2; plan K06 §5.1), u obliku u kojem ulazi u tabelu
 * `models`. PODATAK, ne seed - upis radi `studioModels.seedStudioModels`.
 *
 * `gemini-tts` = Gemini 3.8 Flash TTS, osnovni srpski glas Cree: direktno na
 * Google (ključ već postoji), sinhrono kroz Interactions API - isti poziv i isti
 * čitač odgovora kao Nano Banana (`providers/google.ts`), samo je izlaz WAV.
 * https://ai.google.dev/gemini-api/docs/speech-generation (2026-10-05).
 *
 * Cena: ulaz $0,50/M, izlaz $9/M audio tokena (~25 tokena u sekundi), pa je
 * 1 000 znakova srpskog (~65-85 s) ~$0,015-0,019; pravilo je zaokruženo na
 * $0,02 po hiljadu znakova = 5 kr (ElevenLabs: 22 kr). Stvaran trošak se upisuje
 * iz potrošnje tokena (`tokenRatesUsdPerMillion`). Od 2027-01-01 ulaz poskupljuje
 * na $1/M - admin tada menja `baseUsd` kroz `applyPriceEdit`.
 */

import type { ParamControl } from "../studioParamSpec";
import type { StudioModelSeed } from "./modelSeed";

/** 30 ugrađenih glasova (isti spisak kao `lib/crea-voices.ts`). */
export const GEMINI_TTS_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
] as const;

export const GEMINI_TTS_DEFAULT_VOICE = "Sulafat";

/**
 * Najduži tekst jednog posla. Izlaz je WAV od 24 kHz koji stiže inline (base64)
 * u odgovoru, a akcija ima ograničenu memoriju: 2 000 znakova je ~2,5 min i
 * ~7 MB WAV-a. Duži tekst ide u više replika (Dijalog) ili u ElevenLabs.
 */
export const GEMINI_TTS_MAX_CHARS = 2000;

/** Opis stila (`speech_metadata.style`): raspoloženje, brzina, visina, „kako da zvuči". */
export const GEMINI_TTS_STYLE_MAX = 300;

const STYLE_CONTROL: ParamControl = {
  key: "style",
  type: "textarea",
  labelSr: "Kako da zvuči",
  labelEn: "How it should sound",
  helpSr: "Npr. „toplo i polako, kao da priča priču za laku noć\". Ne menja cenu.",
  helpEn: "E.g. \"warm and slow, like a bedtime story\". Does not change the price.",
  default: "",
  max: GEMINI_TTS_STYLE_MAX,
  affectsPrice: false,
};

export const GEMINI_TTS: StudioModelSeed = {
  slug: "gemini-tts",
  provider: "google",
  kind: "audio",
  family: "gemini",
  labelSr: "Gemini govor",
  labelEn: "Gemini speech",
  taglineSr: "Jeftin srpski glas: 30 glasova, emocije i opis kako da zvuči.",
  taglineEn: "A cheap Serbian voice: 30 voices, emotions and a description of how to sound.",
  descriptionSr:
    "Gemini 3.8 Flash TTS. Ukucaš tekst, izabereš glas i opišeš kako da zvuči; nalepnice poput <laugh> ili <short pause> idu pravo u tekst. Cena ide po hiljadu znakova.",
  descriptionEn:
    "Gemini 3.8 Flash TTS. Type the text, pick a voice and describe how it should sound; tags like <laugh> or <short pause> go right into the text. Priced per thousand characters.",
  endpoints: { text: "gemini-3.8-flash-tts" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [
    {
      key: "text",
      type: "textarea",
      labelSr: "Tekst",
      labelEn: "Text",
      helpSr: "Cena ide po hiljadu znakova i pomera se dok kucaš.",
      helpEn: "The price goes per thousand characters and moves as you type.",
      default: "",
      max: GEMINI_TTS_MAX_CHARS,
      affectsPrice: false,
    },
    {
      key: "voice",
      type: "select",
      labelSr: "Glas",
      labelEn: "Voice",
      default: GEMINI_TTS_DEFAULT_VOICE,
      options: GEMINI_TTS_VOICES.map((value) => ({ value, labelSr: value, labelEn: value })),
      affectsPrice: false,
    },
    STYLE_CONTROL,
  ],
  priceRule: { unit: "chars1k", baseUsd: 0.02, quantityParam: "char_count" },
  capabilities: {
    api: "interactions",
    mode: "sync",
    serbian: true,
    maxChars: GEMINI_TTS_MAX_CHARS,
    quantity: { param: "char_count", from: "text_length", measuredFrom: "text", min: 1, max: GEMINI_TTS_MAX_CHARS },
    tokenRatesUsdPerMillion: { output: 9, prompt: 0.5 },
  },
  sortOrder: 398,
};

// ── Muzika (Crea K23, A11; plan K06 §5.2): Lyria kroz isti Interactions API ──

/**
 * Najduži opis pesme: stil + delovi sa tekstom (`[Intro]`, `[Verse]`…). Google ne
 * objavljuje granicu ulaza za Lyriu; 3 000 znakova je cela pesma od ~2 min sa
 * tekstom, a prompt i dalje ide kroz moderaciju (granica je granica kontrole).
 */
export const LYRIA_PROMPT_MAX = 3000;

const LYRIA_PROMPT: ParamControl = {
  key: "prompt",
  type: "textarea",
  labelSr: "Opis i tekst pesme",
  labelEn: "Description and lyrics",
  helpSr: "Žanr, raspoloženje i instrumenti; tekst ide po delovima: [Intro], [Verse], [Chorus]. Za numeru bez glasa napiši „Instrumental only, no vocals“.",
  helpEn: "Genre, mood and instruments; lyrics go by section: [Intro], [Verse], [Chorus]. For a track without vocals write \"Instrumental only, no vocals\".",
  default: "",
  max: LYRIA_PROMPT_MAX,
  affectsPrice: false,
};

/**
 * `lyria-3-clip` - Lyria 3 Clip: numera od tačno 30 s, sa glasom i tekstom ili
 * instrumental. $0,04 po klipu (https://ai.google.dev/gemini-api/docs/pricing,
 * pročitano 2026-10-05) = 9 kr. Zahtev: `POST /v1beta/interactions` sa
 * `model` + `input` (tekst); bez `response_format` izlaz je MP3
 * (https://ai.google.dev/gemini-api/docs/music-generation). Svaki izlaz nosi
 * nečujan SynthID vodeni žig. Izmene posle generisanja nema - pesma nastaje u
 * jednom potezu.
 */
export const LYRIA_CLIP: StudioModelSeed = {
  slug: "lyria-3-clip",
  provider: "google",
  kind: "audio",
  family: "lyria",
  labelSr: "Lyria klip",
  labelEn: "Lyria clip",
  taglineSr: "Numera od 30 s za 9 kr - sa tekstom ili bez glasa.",
  taglineEn: "A 30 s track for 9 credits - with lyrics or instrumental.",
  descriptionSr:
    "Google Lyria 3. Opišeš žanr i raspoloženje, po želji dodaš tekst po delovima i dobiješ numeru od 30 sekundi. Jedna cena po klipu.",
  descriptionEn:
    "Google Lyria 3. Describe genre and mood, optionally add lyrics by section and get a 30-second track. One price per clip.",
  endpoints: { text: "lyria-3-clip-preview" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [LYRIA_PROMPT],
  priceRule: { unit: "generation", baseUsd: 0.04 },
  capabilities: { api: "interactions", mode: "sync", music: true, outputSeconds: 30 },
  sortOrder: 424,
};

/**
 * `lyria-35` - Lyria 3.5: cela pesma (~2 min) iz jednog opisa, sa delovima i
 * tekstom. $0,08 po pesmi (isti izvor) = 18 kr. Trajanje bira model (~2 min);
 * tačno trajanje do 5 min pravi samo ElevenLabs (`music`).
 */
export const LYRIA_SONG: StudioModelSeed = {
  slug: "lyria-35",
  provider: "google",
  kind: "audio",
  family: "lyria",
  labelSr: "Lyria pesma",
  labelEn: "Lyria song",
  taglineSr: "Cela pesma od ~2 min za 18 kr - uvod, strofe, refren.",
  taglineEn: "A whole ~2 min song for 18 credits - intro, verses, chorus.",
  descriptionSr:
    "Google Lyria 3.5. Cela pesma iz jednog opisa: delovi (uvod, strofa, refren) sa tvojim tekstom ili instrumental. Jedna cena po pesmi.",
  descriptionEn:
    "Google Lyria 3.5. A whole song from one description: sections (intro, verse, chorus) with your lyrics, or instrumental. One price per song.",
  endpoints: { text: "lyria-3.5" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [LYRIA_PROMPT],
  priceRule: { unit: "generation", baseUsd: 0.08 },
  capabilities: { api: "interactions", mode: "sync", music: true, outputSeconds: 120 },
  sortOrder: 426,
};

export const GOOGLE_AUDIO_MODELS: StudioModelSeed[] = [GEMINI_TTS, LYRIA_CLIP, LYRIA_SONG];
