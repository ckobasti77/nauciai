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

export const FAL_VIDEO_MODELS: StudioModelSeed[] = [
  KLING_3,
  KLING_3_TURBO,
  KLING_OMNI,
  MINIMAX_H3,
];
