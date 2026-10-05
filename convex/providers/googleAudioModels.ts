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

export const GOOGLE_AUDIO_MODELS: StudioModelSeed[] = [GEMINI_TTS];
