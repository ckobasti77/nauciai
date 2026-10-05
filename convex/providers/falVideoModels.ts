/**
 * fal-ovi video modeli iz STUDIO-CATALOG-V4 (3.1, 3.2, 3.3, 3.6), u obliku u
 * kojem ulaze u tabelu `models`. PODATAK, ne seed - upis radi
 * `studioModels.seedStudioModels`.
 *
 * Veo redovi (3.7) stoje u `googleModels.ts` jer im tarifa menja provajdera;
 * Seedance (3.4, 3.5) u `bytePlusModels.ts`. Ovde je ono što je kod fal-a
 * parity: Kling i MiniMax.
 *
 * Cene su prepisane iz kataloga doslovno. Ne preračunavaju se.
 */

import type { ParamControl } from "../studioParamSpec";
import {
  aspectRatioControl,
  audioControl,
  durationControl,
  IMAGE_ACCEPT,
  promptControl,
  resolutionControl,
  VIDEO_ACCEPT,
} from "./modelControls";
import type { StudioModelSeed } from "./modelSeed";

/**
 * fal Kling rutu bira po tarifi (`standard`/`pro`), a ta tarifa **nije
 * kvalitet nego rezolucija** - isti model, iste težine (katalog 3.1). Zato
 * endpoint nosi `{tier}`, a `capabilities.tierByResolution` kaže šta se u njega
 * upisuje za izabranu rezoluciju. Da je tarifa kontrola u formi, korisnik bi
 * birao "Pro" misleći da dobija bolju sliku.
 */
const KLING_TIER_BY_RESOLUTION = { "720p": "standard", "1080p": "pro", "4K": "pro" };

/** Kling klip traje 5 ili 10 sekundi; slajder izmedju je isti raspon (katalog 3.1). */
function klingDuration(): ParamControl {
  return durationControl({ min: 5, max: 10, default: 5 });
}

/**
 * `kling-3` - Kling 3.0 (katalog 3.1).
 *
 * Zvuk i voice control su stavke na računu, pa idu u `lookup`. Kombinacije
 * "zvuk isključen a voice control uključen" **nema u mapi** - i to je cela
 * zabrana: `isCombinationPriceable` je odbija i u formi i na serveru, bez
 * ijednog spiska izuzetaka u kodu.
 *
 * Na 4K zvuk NE menja cenu (sve tri ćelije su $0,42) - to mora da se vidi u
 * UI-ju, a ne da prekidač tiho ne radi ništa.
 */
export const KLING_3: StudioModelSeed = {
  slug: "kling-3",
  provider: "fal",
  kind: "video",
  family: "kling",
  labelSr: "Kling 3.0",
  labelEn: "Kling 3.0",
  taglineSr: "Kling sa nativnim zvukom i kontrolom glasa, do 4K.",
  taglineEn: "Kling with native audio and voice control, up to 4K.",
  descriptionSr:
    "Video iz teksta ili iz slike, sa zvukom koji model sam pravi. Kontrola glasa dodatno naplaćuje, a na 4K je cena ista sa zvukom i bez njega.",
  descriptionEn:
    "Video from text or from an image, with audio the model generates itself. Voice control costs extra, and at 4K the price is the same with and without audio.",
  endpoints: {
    text: "fal-ai/kling-video/v3/{tier}/text-to-video",
    image: "fal-ai/kling-video/v3/{tier}/image-to-video",
  },
  inputModes: ["text", "image"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({
      values: ["720p", "1080p", "4K"],
      default: "720p",
      helpSr: "Na 4K je cena ista sa zvukom i bez njega.",
      helpEn: "At 4K the price is the same with and without audio.",
    }),
    audioControl(),
    {
      key: "voice_control",
      type: "switch",
      labelSr: "Kontrola glasa",
      labelEn: "Voice control",
      helpSr: "Radi samo uz uključen zvuk. Dodatno se naplaćuje.",
      helpEn: "Works only with audio on. It is charged on top.",
      default: false,
      affectsPrice: true,
    },
    klingDuration(),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: {
      params: ["resolution", "audio", "voice_control"],
      map: {
        "720p|off|off": 0.084,
        "720p|on|off": 0.126,
        "720p|on|on": 0.154,
        "1080p|off|off": 0.112,
        "1080p|on|off": 0.168,
        "1080p|on|on": 0.196,
        "4K|off|off": 0.42,
        "4K|on|off": 0.42,
        "4K|on|on": 0.42,
      },
    },
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    voiceControl: true,
    minDurationS: 5,
    maxDurationS: 10,
    tierByResolution: KLING_TIER_BY_RESOLUTION,
  },
  sortOrder: 300,
};

/**
 * `kling-3-turbo` - Kling 3.0 Turbo (katalog 3.2). Zvuk je uključen u cenu (pa
 * nema prekidač), **nema 4K**, i nije jeftiniji od običnog Klinga - Turbo je
 * brzina, ne popust.
 *
 * `first_last` radi samo 720p varijanta. To je REZOLUCIJA sa jednom opcijom u
 * tom režimu, ne spisak zabrana: druga kontrola sa istim ključem i
 * `showInModes: ["first_last"]`, isti obrazac koji `googleModels` koristi za
 * trajanje produžetka.
 */
export const KLING_3_TURBO: StudioModelSeed = {
  slug: "kling-3-turbo",
  provider: "fal",
  kind: "video",
  family: "kling",
  labelSr: "Kling 3.0 Turbo",
  labelEn: "Kling 3.0 Turbo",
  taglineSr: "Isti Kling, brže gotov - zvuk je u ceni.",
  taglineEn: "The same Kling, done faster - audio is included.",
  descriptionSr:
    "Brza varijanta Klinga 3.0 sa zvukom u ceni. Ide do 1080p i ume prvi i poslednji kadar u 720p. Nije jeftiniji od običnog - kupuje se vreme, ne cena.",
  descriptionEn:
    "The fast Kling 3.0 variant with audio included. It goes up to 1080p and does first/last frame at 720p. It is not cheaper than the regular one - you are buying time, not price.",
  endpoints: {
    text: "fal-ai/kling-video/v3/turbo/{tier}/text-to-video",
    image: "fal-ai/kling-video/v3/turbo/{tier}/image-to-video",
    first_last: "fal-ai/kling-video/v3/turbo/{tier}/first-last-frame-to-video",
  },
  inputModes: ["text", "image", "first_last"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({
      values: ["720p", "1080p"],
      default: "720p",
      showInModes: ["text", "image"],
    }),
    resolutionControl({
      values: ["720p"],
      default: "720p",
      showInModes: ["first_last"],
      helpSr: "Prvi i poslednji kadar radi samo u 720p.",
      helpEn: "First/last frame works at 720p only.",
    }),
    klingDuration(),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    baseUsd: 0.112,
    multipliers: [{ param: "resolution", map: { "720p": 1, "1080p": 1.25 } }],
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    audioIncluded: true,
    minDurationS: 5,
    maxDurationS: 10,
    tierByResolution: { "720p": "standard", "1080p": "pro" },
  },
  sortOrder: 310,
};

/**
 * `kling-omni` - Kling O3 (katalog 3.3). Najbogatiji ulazima u celom katalogu:
 * tekst, prvi i poslednji kadar, reference i izmena postojećeg videa.
 *
 * Izmena videa se naplaćuje 1,5x, i to preko `modeMultipliers` - množilac
 * zavisi od REŽIMA, ne od parametra, pa nema šta da se pita korisnika.
 */
export const KLING_OMNI: StudioModelSeed = {
  slug: "kling-omni",
  provider: "fal",
  kind: "video",
  family: "kling",
  labelSr: "Kling O3 (Omni)",
  labelEn: "Kling O3 (Omni)",
  taglineSr: "Prima sve - kadrove, reference i postojeći video.",
  taglineEn: "Takes everything - frames, references and an existing video.",
  descriptionSr:
    "Kling koji radi iz teksta, iz prvog i poslednjeg kadra, iz referenci i iz postojećeg videa. Izmena videa je jedan i po put skuplja od generisanja iz teksta.",
  descriptionEn:
    "The Kling that works from text, from a first/last frame pair, from references and from an existing video. Editing a video costs one and a half times generating from text.",
  endpoints: {
    text: "fal-ai/kling-video/o3/text-to-video",
    first_last: "fal-ai/kling-video/o3/first-last-frame-to-video",
    reference: "fal-ai/kling-video/o3/reference-to-video",
    video: "fal-ai/kling-video/o3/video-to-video",
  },
  inputModes: ["text", "first_last", "reference", "video"],
  inputSpec: {
    text: {},
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
    reference: {
      image: { max: 9, accept: IMAGE_ACCEPT },
      video: { max: 3, accept: VIDEO_ACCEPT },
    },
    video: { video: { max: 1, accept: VIDEO_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({
      values: ["720p", "1080p", "4K"],
      default: "720p",
      helpSr: "Na 4K je cena ista sa zvukom i bez njega.",
      helpEn: "At 4K the price is the same with and without audio.",
    }),
    audioControl(),
    klingDuration(),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: {
      params: ["resolution", "audio"],
      map: {
        "720p|off": 0.084,
        "720p|on": 0.112,
        "1080p|off": 0.112,
        "1080p|on": 0.14,
        "4K|off": 0.42,
        "4K|on": 0.42,
      },
    },
    modeMultipliers: { video: 1.5 },
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    minDurationS: 5,
    maxDurationS: 10,
    maxRefImages: 9,
    maxRefVideos: 3,
    videoEditMultiplier: 1.5,
  },
  sortOrder: 320,
};

/**
 * `minimax-h3` - MiniMax H3 (katalog 3.6). Endpoint ide **bez `fal-ai/`
 * prefiksa** (`minimax/h3/*`), i to nije previd nego kako fal ruta izgleda.
 *
 * Nativni stereo zvuk je u ceni, bez doplate - zato nema prekidač zvuka, a 5 s
 * u 768P sa zvukom je najjeftiniji ozvučen video u katalogu (65 kredita).
 *
 * `reference_images` u `extras` NIJE kontrola i namerno ga nema u `paramSpec`-u:
 * to je broj fajlova koje je server stvarno primio, i upisuje ga onaj ko pravi
 * posao POSLE sanitizacije. Da je kontrola, klijent bi mogao da pošalje devet
 * slika a prijavi pet.
 */
export const MINIMAX_H3: StudioModelSeed = {
  slug: "minimax-h3",
  provider: "fal",
  kind: "video",
  family: "minimax",
  labelSr: "MiniMax H3",
  labelEn: "MiniMax H3",
  taglineSr: "Najjeftiniji video sa zvukom, i ide do 15 sekundi.",
  taglineEn: "The cheapest video with audio, and it runs to 15 seconds.",
  descriptionSr:
    "Nativni stereo zvuk je uključen u cenu. Radi iz teksta, slike, prvog i poslednjeg kadra i iz referenci; pet referentnih slika je besplatno, svaka sledeća se naplaćuje. LoRA za konzistentnost subjekta poskupljuje 25%.",
  descriptionEn:
    "Native stereo audio is included in the price. It works from text, an image, a first/last frame pair and references; five reference images are free, each further one is charged. The subject-consistency LoRA adds 25%.",
  endpoints: {
    text: "minimax/h3/text-to-video",
    image: "minimax/h3/image-to-video",
    first_last: "minimax/h3/first-last-frame-to-video",
    reference: "minimax/h3/reference-to-video",
  },
  inputModes: ["text", "image", "first_last", "reference"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
    reference: { image: { max: 9, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({
      values: ["480p", "768p", "2K", "4K"],
      default: "768p",
      labels: { "768p": "768P" },
    }),
    {
      key: "lora",
      type: "switch",
      labelSr: "LoRA za lik",
      labelEn: "Subject LoRA",
      helpSr: "Drži isti lik kroz više klipova. Poskupljuje 25%.",
      helpEn: "Keeps the same subject across clips. Adds 25%.",
      default: false,
      affectsPrice: true,
    },
    durationControl({ min: 4, max: 15, default: 5 }),
    aspectRatioControl(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "2:3"], "16:9"),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    baseUsd: 0.05,
    multipliers: [
      { param: "resolution", map: { "480p": 1, "768p": 1.2, "2K": 2.6, "4K": 3.2 } },
      { param: "lora", map: { off: 1, on: 1.25 } },
    ],
    extras: [{ param: "reference_images", freeCount: 5, usdEach: 0.08 }],
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    audioIncluded: true,
    minDurationS: 4,
    maxDurationS: 15,
    maxRefImages: 9,
    freeRefImages: 5,
  },
  sortOrder: 330,
};

// ── Crea K07 (V2): novi video modeli ───────────────────────────────────────
// Rute, polja i cene: `docs/crea/planovi/K06.md` §3 (izvori pročitani
// 2026-10-05). Svaki je fal (BytePlus i Google ih nemaju).

/**
 * `grok-video-15-lite` - xAI Grok Imagine Video 1.5 Lite: $0,02 / $0,03 / $0,14
 * po sekundi za 480p / 720p / 1080p, a slika na ulazu dodaje $0,01
 * (https://fal.ai/models/xai/grok-imagine-video/v1.5/lite/text-to-video/llms.txt).
 * Najjeftinija proba pokreta (V3). Šema nema seme ni prekidač zvuka; da li klip
 * ima zvuk nije potvrđeno, pa se ne tvrdi.
 */
export const GROK_VIDEO_15_LITE: StudioModelSeed = {
  slug: "grok-video-15-lite",
  provider: "fal",
  kind: "video",
  family: "grok-imagine",
  labelSr: "Grok Imagine Video Lite",
  labelEn: "Grok Imagine Video Lite",
  taglineSr: "Najjeftinija proba pokreta - par kredita po sekundi.",
  taglineEn: "The cheapest motion test - a few credits per second.",
  descriptionSr:
    "Brz video iz opisa ili iz slike, do 15 sekundi. Dobar za probu ideje pre skupljeg modela.",
  descriptionEn:
    "A fast video from a prompt or an image, up to 15 seconds. Good for testing an idea before a pricier model.",
  endpoints: {
    text: "xai/grok-imagine-video/v1.5/lite/text-to-video",
    image: "xai/grok-imagine-video/v1.5/lite/image-to-video",
  },
  inputModes: ["text", "image"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({ values: ["480p", "720p", "1080p"], default: "480p" }),
    durationControl({ min: 1, max: 15, default: 6 }),
    {
      ...aspectRatioControl(["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"], "16:9"),
      showInModes: ["text"],
    },
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: { params: ["resolution"], map: { "480p": 0.02, "720p": 0.03, "1080p": 0.14 } },
    extras: [{ param: "input_images", freeCount: 0, usdEach: 0.01 }],
  },
  capabilities: {
    mode: "async_webhook",
    minDurationS: 1,
    maxDurationS: 15,
    tags: ["cheap", "draft", "animate"],
  },
  sortOrder: 332,
};

/**
 * `wan-30` - Alibaba Wan 3.0: $0,05 / $0,10 / $0,20 po sekundi za 480p / 720p /
 * 1080p, zvuk u ceni, do 30 s (https://fal.ai/models/alibaba/wan-3.0/
 * text-to-video/llms.txt). Prvi i poslednji kadar su ista ruta kao slika
 * (`start_image_url` + `end_image_url`).
 *
 * Reference primaju samo SLIKE: da li fal u `reference` režimu naplaćuje i ulazni
 * video nije potvrđeno - isti princip kao kod Seedance-a (`referenceVideoBillableSeconds`).
 */
export const WAN_30: StudioModelSeed = {
  slug: "wan-30",
  provider: "fal",
  kind: "video",
  family: "wan",
  labelSr: "Wan 3.0",
  labelEn: "Wan 3.0",
  taglineSr: "Dug kadar do 30 sekundi, sa zvukom u ceni.",
  taglineEn: "A long shot up to 30 seconds, with audio included.",
  descriptionSr:
    "Video iz opisa, iz slike, iz prvog i poslednjeg kadra ili iz referenci. Zvuk je uključen u cenu, a klip traje do pola minuta.",
  descriptionEn:
    "Video from a prompt, an image, a first/last frame pair or references. Audio is included in the price, and a clip runs up to half a minute.",
  endpoints: {
    text: "alibaba/wan-3.0/text-to-video",
    image: "alibaba/wan-3.0/image-to-video",
    first_last: "alibaba/wan-3.0/image-to-video",
    reference: "alibaba/wan-3.0/reference-to-video",
  },
  inputModes: ["text", "image", "first_last", "reference"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
    reference: { image: { max: 10, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({ values: ["480p", "720p", "1080p"], default: "720p" }),
    durationControl({ min: 2, max: 30, default: 5 }),
    aspectRatioControl(["16:9", "9:16", "1:1", "4:3", "3:4"], "16:9"),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: { params: ["resolution"], map: { "480p": 0.05, "720p": 0.1, "1080p": 0.2 } },
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    audioIncluded: true,
    minDurationS: 2,
    maxDurationS: 30,
    maxRefImages: 10,
    seedParam: "seed",
    fal: {
      fields: { image: "start_image_url", first: "start_image_url", last: "end_image_url" },
      fixed: { enable_prompt_expansion: false },
    },
    tags: ["audio", "long", "firstLast", "refs", "draft"],
  },
  sortOrder: 334,
};

/**
 * `ltx-23-fast` - Lightricks LTX-2.3 Fast: $0,06 / $0,12 / $0,24 po sekundi za
 * 1080p / 1440p / 2160p, zvuk u ceni (https://fal.ai/models/fal-ai/ltx-2.3/
 * text-to-video/fast/llms.txt). Trajanje 6-10 s: 12-20 s ide samo na 1080p i
 * 25 fps, a to bi bilo pravilo van cenovnika - ne nudi se.
 */
export const LTX_23_FAST: StudioModelSeed = {
  slug: "ltx-23-fast",
  provider: "fal",
  kind: "video",
  family: "ltx",
  labelSr: "LTX-2.3 Fast",
  labelEn: "LTX-2.3 Fast",
  taglineSr: "Oštar video od 1080p naviše, sa zvukom.",
  taglineEn: "A sharp video from 1080p up, with audio.",
  descriptionSr:
    "Video iz opisa, iz slike ili iz prvog i poslednjeg kadra, uvek najmanje 1080p i sa zvukom u ceni.",
  descriptionEn:
    "Video from a prompt, an image or a first/last frame pair, always at least 1080p and with audio included.",
  endpoints: {
    text: "fal-ai/ltx-2.3/text-to-video/fast",
    image: "fal-ai/ltx-2.3/image-to-video/fast",
    first_last: "fal-ai/ltx-2.3/image-to-video/fast",
  },
  inputModes: ["text", "image", "first_last"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({ values: ["1080p", "1440p", "2160p"], default: "1080p", labels: { "2160p": "4K" } }),
    durationControl({ min: 6, max: 10, step: 2, default: 6 }),
    aspectRatioControl(["16:9", "9:16"], "16:9"),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: { params: ["resolution"], map: { "1080p": 0.06, "1440p": 0.12, "2160p": 0.24 } },
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    audioIncluded: true,
    minDurationS: 6,
    maxDurationS: 10,
    fal: { fields: { image: "image_url", first: "image_url", last: "end_image_url" } },
    tags: ["audio", "quality", "firstLast"],
  },
  sortOrder: 336,
};

/**
 * `hailuo-23-fast` - MiniMax Hailuo 2.3 Fast, samo iz slike. Cena po KLIPU:
 * 768p 6 s $0,19, 10 s $0,32; 1080p 6 s $0,33
 * (https://fal.ai/models/fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video/llms.txt
 * i …/pro/…). 1080p od 10 s ne postoji: kombinacije nema u mapi, pa je i forma
 * i server odbijaju iz istog izvora. Tarifa u ruti je rezolucija, kao kod Klinga.
 */
export const HAILUO_23_FAST: StudioModelSeed = {
  slug: "hailuo-23-fast",
  provider: "fal",
  kind: "video",
  family: "minimax",
  labelSr: "Hailuo 2.3 Fast",
  labelEn: "Hailuo 2.3 Fast",
  taglineSr: "Oživi fotku najjeftinije - fiksna cena po klipu.",
  taglineEn: "Bring a photo to life for the least - a fixed price per clip.",
  descriptionSr:
    "Okačiš jednu sliku i opišeš pokret. Klip traje 6 ili 10 sekundi i ima fiksnu cenu.",
  descriptionEn:
    "Upload one picture and describe the motion. The clip runs 6 or 10 seconds and has a fixed price.",
  endpoints: { image: "fal-ai/minimax/hailuo-2.3-fast/{tier}/image-to-video" },
  inputModes: ["image"],
  inputSpec: { image: { image: { max: 1, accept: IMAGE_ACCEPT } } },
  paramSpec: [
    promptControl(),
    resolutionControl({ values: ["768p", "1080p"], default: "768p", labels: { "768p": "768P" } }),
    {
      // fal prima trajanje kao TEKST ("6" | "10"), pa je ovo segmentirani izbor, ne klizač.
      key: "duration",
      type: "segmented",
      labelSr: "Trajanje",
      labelEn: "Duration",
      helpSr: "1080p ide samo uz 6 sekundi.",
      helpEn: "1080p comes with 6 seconds only.",
      default: "6",
      options: [
        { value: "6", labelSr: "6 s", labelEn: "6 s" },
        { value: "10", labelSr: "10 s", labelEn: "10 s" },
      ],
      affectsPrice: true,
    },
  ],
  priceRule: {
    unit: "generation",
    lookup: {
      params: ["resolution", "duration"],
      map: { "768p|6": 0.19, "768p|10": 0.32, "1080p|6": 0.33 },
    },
  },
  capabilities: {
    mode: "async_webhook",
    tierByResolution: { "768p": "standard", "1080p": "pro" },
    tags: ["cheap", "animate"],
  },
  sortOrder: 338,
};

/**
 * `minimax-h3-max-turbo` - MiniMax H3 Max Turbo. **Cena POSLE promocije**: fal do
 * 2026-10-15 daje 40% popusta, a posle toga je $0,025 / $0,04 / $0,08 po sekundi
 * za 480P / 768P / 1080P (https://fal.ai/models/minimax/h3-max-turbo/
 * text-to-video/llms.txt). Katalog piše punu cenu (K06-10) - inače bismo od
 * 16. oktobra prodavali ispod nabavne. Rezolucije fal piše velikim slovom.
 */
export const MINIMAX_H3_MAX_TURBO: StudioModelSeed = {
  slug: "minimax-h3-max-turbo",
  provider: "fal",
  kind: "video",
  family: "minimax",
  labelSr: "MiniMax H3 Max Turbo",
  labelEn: "MiniMax H3 Max Turbo",
  taglineSr: "Brz i jeftin video, iz opisa, slike ili dva kadra.",
  taglineEn: "Fast, cheap video from a prompt, an image or two frames.",
  descriptionSr:
    "Brza tarifa MiniMax H3 Max. Video iz opisa, iz slike ili iz prvog i poslednjeg kadra, do 15 sekundi.",
  descriptionEn:
    "The fast tier of MiniMax H3 Max. Video from a prompt, an image or a first/last frame pair, up to 15 seconds.",
  endpoints: {
    text: "minimax/h3-max-turbo/text-to-video",
    image: "minimax/h3-max-turbo/image-to-video",
    first_last: "minimax/h3-max-turbo/image-to-video",
  },
  inputModes: ["text", "image", "first_last"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({ values: ["480P", "768P", "1080P"], default: "768P" }),
    durationControl({ min: 1, max: 15, default: 5 }),
    {
      ...aspectRatioControl(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], "16:9"),
      showInModes: ["text"],
    },
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: { params: ["resolution"], map: { "480P": 0.025, "768P": 0.04, "1080P": 0.08 } },
  },
  capabilities: {
    mode: "async_webhook",
    minDurationS: 1,
    maxDurationS: 15,
    seedParam: "seed",
    fal: {
      fields: { image: "image_url", first: "image_url", last: "end_image_url" },
      fixed: { prompt_expansion_mode: "disabled" },
    },
    tags: ["cheap", "draft", "firstLast"],
  },
  sortOrder: 339,
};

/**
 * `pixverse-v6` - PixVerse V6: po sekundi bez / sa zvukom 360p $0,025/$0,035,
 * 540p $0,035/$0,045, 720p $0,045/$0,06, 1080p $0,09/$0,115
 * (https://fal.ai/models/fal-ai/pixverse/v6/text-to-video/llms.txt). Prvi i
 * poslednji kadar idu na rutu `transition`. Zvuk je kod fal-a
 * `generate_audio_switch`, a forma ga zove `audio` kao i ostali modeli.
 */
export const PIXVERSE_V6: StudioModelSeed = {
  slug: "pixverse-v6",
  provider: "fal",
  kind: "video",
  family: "pixverse",
  labelSr: "PixVerse V6",
  labelEn: "PixVerse V6",
  taglineSr: "Jeftin video sa zvukom na prekidač, od 360p do 1080p.",
  taglineEn: "Cheap video with switchable audio, from 360p to 1080p.",
  descriptionSr:
    "Video iz opisa, iz slike ili prelaz između dva kadra. Zvuk se uključuje po želji i malo poskupljuje.",
  descriptionEn:
    "Video from a prompt, an image or a transition between two frames. Audio is optional and costs a little more.",
  endpoints: {
    text: "fal-ai/pixverse/v6/text-to-video",
    image: "fal-ai/pixverse/v6/image-to-video",
    first_last: "fal-ai/pixverse/v6/transition",
  },
  inputModes: ["text", "image", "first_last"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({ values: ["360p", "540p", "720p", "1080p"], default: "720p" }),
    audioControl(),
    durationControl({ min: 1, max: 15, default: 5 }),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: {
      params: ["resolution", "audio"],
      map: {
        "360p|off": 0.025,
        "360p|on": 0.035,
        "540p|off": 0.035,
        "540p|on": 0.045,
        "720p|off": 0.045,
        "720p|on": 0.06,
        "1080p|off": 0.09,
        "1080p|on": 0.115,
      },
    },
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    minDurationS: 1,
    maxDurationS: 15,
    seedParam: "seed",
    fal: {
      fields: { image: "image_url", first: "first_image_url", last: "end_image_url" },
      params: { audio: { to: "generate_audio_switch" } },
    },
    tags: ["cheap", "draft", "audio", "firstLast"],
  },
  sortOrder: 341,
};

export const FAL_VIDEO_MODELS: StudioModelSeed[] = [
  KLING_3,
  KLING_3_TURBO,
  KLING_OMNI,
  MINIMAX_H3,
  GROK_VIDEO_15_LITE,
  WAN_30,
  LTX_23_FAST,
  HAILUO_23_FAST,
  MINIMAX_H3_MAX_TURBO,
  PIXVERSE_V6,
];
