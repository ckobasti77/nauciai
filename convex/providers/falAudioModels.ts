/**
 * ElevenLabs modeli preko fal-a iz STUDIO-CATALOG-V4 (4.1 i 4.2), u obliku u
 * kojem ulaze u tabelu `models`. PODATAK, ne seed - upis radi
 * `studioModels.seedStudioModels`.
 *
 * Sve je parity kod fal-a (katalog 7), pa direktne rute nema. **Eleven v3 je
 * jedini model u katalogu koji govori srpski** - Multilingual v2 i Flash v2.5
 * imaju hrvatski ali ne i srpski, pa ne ulaze ni po jeftinijoj tarifi.
 *
 * Cene su prepisane iz kataloga doslovno. Ne preračunavaju se.
 */

import type { ParamControl } from "../studioParamSpec";
import { AUDIO_ACCEPT, promptControl, TEXT_MAX_LENGTH, VIDEO_ACCEPT } from "./modelControls";
import type { StudioModelSeed } from "./modelSeed";

/**
 * Glasovi koje forma nudi u `Select`-u sa preslušavanjem (katalog 4.1). Lista je
 * polje reda, ne konstanta u UI-ju - menja se iz admin ekrana kad ElevenLabs
 * doda ili povuče glas, bez deploy-a.
 */
const VOICE_OPTIONS = [
  "Aria",
  "Roger",
  "Sarah",
  "Laura",
  "Charlie",
  "George",
  "Callum",
  "Liam",
  "Charlotte",
  "Alice",
];

function voiceControl(): ParamControl {
  return {
    key: "voice",
    type: "select",
    labelSr: "Glas",
    labelEn: "Voice",
    default: VOICE_OPTIONS[0],
    options: VOICE_OPTIONS.map((value) => ({ value, labelSr: value, labelEn: value })),
    affectsPrice: false,
  };
}

function textControl(labelSr: string, labelEn: string): ParamControl {
  return {
    key: "text",
    type: "textarea",
    labelSr,
    labelEn,
    helpSr: "Cena ide po hiljadu znakova i pomera se dok kucaš.",
    helpEn: "The price goes per thousand characters and moves as you type.",
    default: "",
    max: TEXT_MAX_LENGTH,
    affectsPrice: false,
  };
}

function unitSlider(opts: {
  key: string;
  labelSr: string;
  labelEn: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unitSr: string;
  unitEn: string;
  helpSr?: string;
  helpEn?: string;
}): ParamControl {
  return {
    key: opts.key,
    type: "slider",
    labelSr: opts.labelSr,
    labelEn: opts.labelEn,
    ...(opts.helpSr ? { helpSr: opts.helpSr } : {}),
    ...(opts.helpEn ? { helpEn: opts.helpEn } : {}),
    default: opts.default,
    min: opts.min,
    max: opts.max,
    step: opts.step,
    unitSr: opts.unitSr,
    unitEn: opts.unitEn,
    affectsPrice: true,
  };
}

/** Klizači koji oblikuju izgovor - nijedan ne dira cenu (katalog 4.1). */
function toneSlider(key: string, labelSr: string, labelEn: string, value: number): ParamControl {
  return {
    key,
    type: "slider",
    labelSr,
    labelEn,
    default: value,
    min: 0,
    max: 1,
    step: 0.05,
    affectsPrice: false,
  };
}

/** Količina za naplatu po znaku: broj znakova iz kontrole `text`, ne iz forme. */
const CHAR_QUANTITY = {
  param: "char_count",
  from: "text_length",
  measuredFrom: "text",
  min: 1,
  max: TEXT_MAX_LENGTH,
};

/**
 * Količina za naplatu po minutu: dužina OKAČENOG snimka.
 *
 * **Meri je SERVER** (W5, `lib/media-duration.ts`):
 * `studioActions.measureInputUpload` pročita zaglavlje okačenog fajla i upiše
 * sekunde u `studioUploads.durationS`, a `createJob` naplaćuje isključivo taj
 * broj. Dok je taj broj dolazio od klijenta, 120 minuta prijavljenih kao 0,1
 * naplaćivalo se kao 0,1 a ElevenLabs je naplaćivao 120 (nalaz R3).
 */
const MINUTE_QUANTITY = {
  param: "minutes",
  from: "input_media_minutes",
  min: 0.1,
  max: 120,
};

/**
 * `tts` - ElevenLabs Eleven v3 (katalog 4.1). Jedini model sa srpskim.
 *
 * `unit: "chars1k"` znači da `computeCostUsd` količinu deli sa 1 000: pravilo
 * nosi cenu HILJADE znakova, a `char_count` je broj znakova. Da nije tako,
 * jedan pasus bi koštao kao hiljadu.
 */
export const TTS: StudioModelSeed = {
  slug: "tts",
  provider: "fal",
  kind: "audio",
  family: "elevenlabs",
  labelSr: "Govor iz teksta",
  labelEn: "Text to speech",
  taglineSr: "Jedini glas u katalogu koji govori srpski.",
  taglineEn: "The only voice in the catalogue that speaks Serbian.",
  descriptionSr:
    "ElevenLabs Eleven v3. Ukucaš tekst, izabereš glas i dobiješ snimak. Klizači menjaju izgovor, ne cenu - cena ide po hiljadu znakova.",
  descriptionEn:
    "ElevenLabs Eleven v3. Type the text, pick a voice, get a recording. The sliders change delivery, not price - the price goes per thousand characters.",
  endpoints: { text: "fal-ai/elevenlabs/tts/eleven-v3" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [
    textControl("Tekst", "Text"),
    voiceControl(),
    toneSlider("stability", "Stabilnost", "Stability", 0.5),
    toneSlider("similarity", "Sličnost glasu", "Voice similarity", 0.75),
    toneSlider("style", "Stil", "Style", 0),
    {
      key: "speed",
      type: "slider",
      labelSr: "Brzina",
      labelEn: "Speed",
      default: 1,
      min: 0.7,
      max: 1.2,
      step: 0.05,
      affectsPrice: false,
    },
  ],
  priceRule: { unit: "chars1k", baseUsd: 0.1, quantityParam: "char_count" },
  capabilities: {
    mode: "async_webhook",
    serbian: true,
    maxChars: TEXT_MAX_LENGTH,
    quantity: CHAR_QUANTITY,
  },
  sortOrder: 400,
};

/** `dialogue` - Eleven v3 za razgovor sa više govornika, ista tarifa po znaku (katalog 4.2). */
export const DIALOGUE: StudioModelSeed = {
  slug: "dialogue",
  provider: "fal",
  kind: "audio",
  family: "elevenlabs",
  labelSr: "Dijalog",
  labelEn: "Dialogue",
  taglineSr: "Više govornika u jednom snimku, iz jednog teksta.",
  taglineEn: "Several speakers in one recording, from one script.",
  descriptionSr:
    "Isti motor kao govor iz teksta, ali za razgovor: napišeš replike sa oznakama govornika i dobiješ jedan snimak. Naplaćuje se po hiljadu znakova.",
  descriptionEn:
    "The same engine as text to speech, but for conversation: write the lines with speaker tags and get one recording. Charged per thousand characters.",
  endpoints: { text: "fal-ai/elevenlabs/text-to-dialogue/eleven-v3" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [textControl("Replike", "Lines")],
  priceRule: { unit: "chars1k", baseUsd: 0.1, quantityParam: "char_count" },
  capabilities: {
    mode: "async_webhook",
    serbian: true,
    maxChars: TEXT_MAX_LENGTH,
    quantity: CHAR_QUANTITY,
  },
  sortOrder: 410,
};

/** `sfx` - zvučni efekti, naplata po sekundi sa minimumom od pet (katalog 4.2). */
export const SFX: StudioModelSeed = {
  slug: "sfx",
  provider: "fal",
  kind: "audio",
  family: "elevenlabs",
  labelSr: "Zvučni efekat",
  labelEn: "Sound effect",
  taglineSr: "Kratak efekat iz opisa - korak, škripa, udarac.",
  taglineEn: "A short effect from a description - a step, a creak, a hit.",
  descriptionSr:
    "Opišeš zvuk i dobiješ efekat. Najkraći snimak koji se naplaćuje je pet sekundi.",
  descriptionEn:
    "Describe a sound and get the effect. The shortest billed clip is five seconds.",
  endpoints: { text: "fal-ai/elevenlabs/sound-effects/v2" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [
    promptControl(),
    unitSlider({
      key: "duration",
      labelSr: "Trajanje",
      labelEn: "Duration",
      min: 5,
      max: 22,
      step: 1,
      default: 5,
      unitSr: "s",
      unitEn: "s",
      helpSr: "Ispod pet sekundi se svejedno naplaćuje pet.",
      helpEn: "Anything under five seconds is still billed as five.",
    }),
  ],
  priceRule: { unit: "second", baseUsd: 0.002, quantityParam: "duration" },
  capabilities: {
    mode: "async_webhook",
    minDurationS: 5,
    maxDurationS: 22,
    // C0 (Crea K07): fal trajanje čita iz `duration_seconds` (0,5-22 s). Bez njega
    // model sam bira dužinu - i do 22 s, a mi smo naplatili izabranu.
    // https://fal.ai/models/fal-ai/elevenlabs/sound-effects/v2/llms.txt
    fal: { params: { duration: { to: "duration_seconds" } } },
  },
  sortOrder: 420,
};

/**
 * `music` - ElevenLabs Music, naplata po minutu (katalog 4.2).
 *
 * **C0 (Crea K07): fal naplaćuje SVAKI ZAPOČETI minut** - „$0.6 per output audio
 * minute. The audio will be rounded up to the closest minute"
 * (https://fal.ai/models/fal-ai/elevenlabs/music/llms.txt, pročitano 2026-10-05).
 * Pola minuta je zato koštalo nas kao ceo, a klizač je nudio 0,5. Sada se bira
 * u celim minutima (`roundUpTo: 1` čuva pravilo i ako neko pošalje razlomak),
 * a dužina stvarno stiže do fal-a kao `music_length_ms` - ranije je išla kao
 * `minutes`, koje fal ne čita, pa je model sam birao koliko će trajati.
 */
export const MUSIC: StudioModelSeed = {
  slug: "music",
  provider: "fal",
  kind: "audio",
  family: "elevenlabs",
  labelSr: "Muzika",
  labelEn: "Music",
  taglineSr: "Numera iz opisa, do pet minuta.",
  taglineEn: "A track from a description, up to five minutes.",
  descriptionSr:
    "Opišeš žanr, tempo i raspoloženje i dobiješ numeru. Naplaćuje se po minutu, pa cena prati klizač trajanja.",
  descriptionEn:
    "Describe genre, tempo and mood and get a track. Charged per minute, so the price follows the duration slider.",
  endpoints: { text: "fal-ai/elevenlabs/music" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [
    promptControl(),
    unitSlider({
      key: "minutes",
      labelSr: "Trajanje",
      labelEn: "Duration",
      min: 1,
      max: 5,
      step: 1,
      default: 1,
      unitSr: "min",
      unitEn: "min",
      helpSr: "Naplaćuje se svaki započeti minut.",
      helpEn: "Every started minute is billed.",
    }),
  ],
  priceRule: { unit: "minute", baseUsd: 0.6, quantityParam: "minutes", roundUpTo: 1 },
  capabilities: {
    mode: "async_webhook",
    minMinutes: 1,
    maxMinutes: 5,
    fal: { params: { minutes: { to: "music_length_ms", scale: 60_000 } } },
  },
  sortOrder: 430,
};

/**
 * `stt` - Scribe V2 (katalog 4.2). V1 ne ulazi u katalog: 3,75x je skuplji
 * ($0,03 prema $0,008 po minutu) za isti posao.
 */
export const STT: StudioModelSeed = {
  slug: "stt",
  provider: "fal",
  kind: "audio",
  family: "elevenlabs",
  labelSr: "Transkripcija",
  labelEn: "Transcription",
  taglineSr: "Snimak u tekst, po minutu i vrlo jeftino.",
  taglineEn: "A recording into text, per minute and very cheap.",
  descriptionSr:
    "Scribe V2 pretvara zvuk ili video u tekst. Naplaćuje se po minutu okačenog snimka, pa cenu zna tek kad se fajl doda.",
  descriptionEn:
    "Scribe V2 turns audio or video into text. Charged per minute of the uploaded file, so the price is known once the file is added.",
  endpoints: {
    audio: "fal-ai/elevenlabs/speech-to-text/scribe-v2",
    video: "fal-ai/elevenlabs/speech-to-text/scribe-v2",
  },
  inputModes: ["audio", "video"],
  inputSpec: {
    audio: { audio: { max: 1, accept: AUDIO_ACCEPT } },
    video: { video: { max: 1, accept: VIDEO_ACCEPT } },
  },
  paramSpec: [],
  priceRule: { unit: "minute", baseUsd: 0.008, quantityParam: "minutes" },
  // K21: izlaz je transkript (tekst + reči sa vremenima → `creaTranscripts`), ne fajl.
  // Scribe prima samo `audio_url` (ElevenLabs čita i video fajl), pa video ide u to
  // polje; zvučni događaji („smeh") ne idu u titlove
  // (https://fal.ai/models/fal-ai/elevenlabs/speech-to-text/scribe-v2/llms.txt, 2026-10-05).
  capabilities: {
    mode: "async_webhook",
    quantity: MINUTE_QUANTITY,
    output: "transcript",
    fal: { fields: { video: "audio_url" }, fixed: { tag_audio_events: false } },
  },
  sortOrder: 440,
};

/** `voice-changer` - isti govor, drugi glas (katalog 4.2). */
export const VOICE_CHANGER: StudioModelSeed = {
  slug: "voice-changer",
  provider: "fal",
  kind: "audio",
  family: "elevenlabs",
  labelSr: "Promena glasa",
  labelEn: "Voice changer",
  taglineSr: "Tvoja intonacija, tudji glas.",
  taglineEn: "Your delivery, someone else's voice.",
  descriptionSr:
    "Okačiš snimak i izabereš glas; izlazi isti govor sa istim naglaskom i pauzama, ali drugim glasom. Naplaćuje se po minutu.",
  descriptionEn:
    "Upload a recording and pick a voice; out comes the same delivery with the same stresses and pauses, in a different voice. Charged per minute.",
  endpoints: { audio: "fal-ai/elevenlabs/voice-changer" },
  inputModes: ["audio"],
  inputSpec: { audio: { audio: { max: 1, accept: AUDIO_ACCEPT } } },
  paramSpec: [voiceControl()],
  priceRule: { unit: "minute", baseUsd: 0.3, quantityParam: "minutes" },
  capabilities: { mode: "async_webhook", quantity: MINUTE_QUANTITY },
  sortOrder: 450,
};

/** `audio-isolation` - glas odvojen od pozadinske buke (katalog 4.2). */
export const AUDIO_ISOLATION: StudioModelSeed = {
  slug: "audio-isolation",
  provider: "fal",
  kind: "audio",
  family: "elevenlabs",
  labelSr: "Čišćenje zvuka",
  labelEn: "Audio isolation",
  taglineSr: "Glas ostaje, buka odlazi.",
  taglineEn: "The voice stays, the noise goes.",
  descriptionSr:
    "Okačiš snimak sa šumom, saobraćajem ili odjekom i dobiješ čist glas. Naplaćuje se po minutu.",
  descriptionEn:
    "Upload a recording with hiss, traffic or room echo and get a clean voice. Charged per minute.",
  endpoints: { audio: "fal-ai/elevenlabs/audio-isolation" },
  inputModes: ["audio"],
  inputSpec: { audio: { audio: { max: 1, accept: AUDIO_ACCEPT } } },
  paramSpec: [],
  priceRule: { unit: "minute", baseUsd: 0.1, quantityParam: "minutes" },
  capabilities: { mode: "async_webhook", quantity: MINUTE_QUANTITY },
  sortOrder: 460,
};

/**
 * `dubbing` - snimak prebačen na drugi jezik, uz zadržan glas (katalog 4.2).
 *
 * **C0 (Crea K07): fal naplaćuje po CELOM minutu** - „The calculation will be
 * based on the closest minute after rounding upwards"
 * (https://fal.ai/models/fal-ai/elevenlabs/dubbing/llms.txt, pročitano
 * 2026-10-05). Sinhronizacija od 6 s je kod nas koštala 13 kr (0,1 min), a fal
 * je uzimao 0,60 $ - zato je najmanja količina 1 minut i svaki započeti se
 * naplaćuje ceo. Jezik ide kao `target_lang` (obavezno polje u fal šemi), ne
 * kao `target_language` koje fal ne prepoznaje.
 */
export const DUBBING: StudioModelSeed = {
  slug: "dubbing",
  provider: "fal",
  kind: "audio",
  family: "elevenlabs",
  labelSr: "Sinhronizacija",
  labelEn: "Dubbing",
  taglineSr: "Isti glas, drugi jezik.",
  taglineEn: "The same voice, another language.",
  descriptionSr:
    "Okačiš video ili zvuk i izabereš jezik; izlazi snimak na tom jeziku sa glasom koji liči na originalni. Naplaćuje se po minutu.",
  descriptionEn:
    "Upload a video or audio file and pick a language; out comes the recording in that language in a voice close to the original. Charged per minute.",
  endpoints: {
    video: "fal-ai/elevenlabs/dubbing",
    audio: "fal-ai/elevenlabs/dubbing",
  },
  inputModes: ["video", "audio"],
  inputSpec: {
    video: { video: { max: 1, accept: VIDEO_ACCEPT } },
    audio: { audio: { max: 1, accept: AUDIO_ACCEPT } },
  },
  paramSpec: [
    {
      key: "target_language",
      type: "select",
      labelSr: "Ciljni jezik",
      labelEn: "Target language",
      default: "en",
      options: [
        { value: "sr", labelSr: "Srpski", labelEn: "Serbian" },
        { value: "en", labelSr: "Engleski", labelEn: "English" },
        { value: "de", labelSr: "Nemački", labelEn: "German" },
        { value: "fr", labelSr: "Francuski", labelEn: "French" },
        { value: "es", labelSr: "Španski", labelEn: "Spanish" },
        { value: "it", labelSr: "Italijanski", labelEn: "Italian" },
        { value: "ru", labelSr: "Ruski", labelEn: "Russian" },
      ],
      affectsPrice: false,
    },
  ],
  priceRule: { unit: "minute", baseUsd: 0.6, quantityParam: "minutes", roundUpTo: 1 },
  capabilities: {
    mode: "async_webhook",
    quantity: { ...MINUTE_QUANTITY, min: 1 },
    fal: { params: { target_language: { to: "target_lang" } } },
  },
  sortOrder: 470,
};

/**
 * `mmaudio-sfx` - jeftiniji zvučni efekti (Crea K23, A13): MMAudio v2 preko fal-a,
 * „$0.001 per seconds", 1-30 s (https://fal.ai/models/fal-ai/mmaudio-v2/text-to-audio/llms.txt,
 * pročitano 2026-10-05) - upola ElevenLabs-a ($0,002/s), bez minimuma od 5 s.
 * fal ga vodi kao „Commercial use". Trajanje ide pod istim imenom (`duration`).
 */
export const MMAUDIO_SFX: StudioModelSeed = {
  slug: "mmaudio-sfx",
  provider: "fal",
  kind: "audio",
  family: "mmaudio",
  labelSr: "Brzi zvučni efekat",
  labelEn: "Quick sound effect",
  taglineSr: "Efekat iz opisa upola jeftinije, od 1 do 30 sekundi.",
  taglineEn: "An effect from a description at half the price, 1 to 30 seconds.",
  descriptionSr:
    "MMAudio v2. Opišeš zvuk (na engleskom radi najbolje) i dobiješ efekat. Plaća se po sekundi, bez najkraćeg trajanja.",
  descriptionEn:
    "MMAudio v2. Describe a sound and get the effect. Charged per second, with no minimum length.",
  endpoints: { text: "fal-ai/mmaudio-v2/text-to-audio" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [
    promptControl(),
    unitSlider({
      key: "duration",
      labelSr: "Trajanje",
      labelEn: "Duration",
      min: 1,
      max: 30,
      step: 1,
      default: 5,
      unitSr: "s",
      unitEn: "s",
    }),
  ],
  priceRule: { unit: "second", baseUsd: 0.001, quantityParam: "duration" },
  capabilities: { mode: "async_webhook", minDurationS: 1, maxDurationS: 30 },
  sortOrder: 418,
};

/** Trake koje `stems` traži, ovim redom: prva je izlaz posla, ostale su njegova deca. */
export const STEM_KEYS = ["vocals", "drums", "bass", "other"] as const;
export type StemKey = (typeof STEM_KEYS)[number];

/**
 * `stems` - razdvajanje na trake (Crea K23, A18): Demucs preko fal-a, „$0.0007
 * per seconds" (https://fal.ai/models/fal-ai/demucs/llms.txt, pročitano
 * 2026-10-05) = $0,042 po minutu okačenog snimka; bez pravila o zaokruživanju.
 * Model `htdemucs` daje četiri trake (glas, bubanj, bas, ostalo); izlaz su
 * zasebni fajlovi pod imenom trake (`falWebhookCore.extractOutputUrls`). Demucs
 * je MIT, a fal ga vodi kao „Commercial use".
 */
export const STEMS: StudioModelSeed = {
  slug: "stems",
  provider: "fal",
  kind: "audio",
  family: "demucs",
  labelSr: "Razdvoji na trake",
  labelEn: "Split into stems",
  taglineSr: "Glas, bubanj, bas i ostalo kao četiri zasebne trake.",
  taglineEn: "Vocals, drums, bass and the rest as four separate tracks.",
  descriptionSr:
    "Okačiš pesmu ili snimak i dobiješ četiri trake: glas, bubanj, bas i ostale instrumente. Naplaćuje se po minutu.",
  descriptionEn:
    "Upload a song or a recording and get four tracks: vocals, drums, bass and the other instruments. Charged per minute.",
  endpoints: { audio: "fal-ai/demucs" },
  inputModes: ["audio"],
  inputSpec: { audio: { audio: { max: 1, accept: AUDIO_ACCEPT } } },
  paramSpec: [],
  priceRule: { unit: "minute", baseUsd: 0.042, quantityParam: "minutes" },
  capabilities: {
    mode: "async_webhook",
    quantity: { ...MINUTE_QUANTITY, max: 10 },
    output: "stems",
    fal: { fixed: { model: "htdemucs", stems: [...STEM_KEYS], output_format: "mp3" } },
  },
  sortOrder: 465,
};

export const FAL_AUDIO_MODELS: StudioModelSeed[] = [
  TTS,
  DIALOGUE,
  SFX,
  MUSIC,
  STT,
  VOICE_CHANGER,
  AUDIO_ISOLATION,
  DUBBING,
  MMAUDIO_SFX,
  STEMS,
];
