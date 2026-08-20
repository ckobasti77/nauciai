/**
 * Tri BytePlus modela iz STUDIO-CATALOG-V4 (2.6, 3.4, 3.5), u obliku u kojem
 * ulaze u tabelu `models`. Ovo je PODATAK, ne seed - upis u bazu radi seed
 * kataloga; ovde stoji da bi cenovna pravila i `paramSpec` imali jedno mesto i
 * da bi testovi tvrdili tačno ono što će biti u bazi.
 *
 * Cene su prepisane iz kataloga doslovno. Ne preračunavaju se.
 */

import type { ParamControl } from "../studioParamSpec";
import type { StudioModelSeed } from "./modelSeed";

// Oblik reda je isti za sva tri provajdera (`modelSeed.ts`); ovde je sužen na
// `byteplus` da red iz ovog fajla ne može slučajno da odglumi drugu rutu.
export type BytePlusModelSeed = StudioModelSeed & { provider: "byteplus" };

const IMAGE_ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const VIDEO_ACCEPT = ["video/mp4", "video/quicktime", "video/webm"];

/** Isti gornji limit prompta koji katalog propisuje za Nano Bananu 2 (2.1). */
const PROMPT_MAX_LENGTH = 2000;

function promptControl(): ParamControl {
  return {
    key: "prompt",
    type: "textarea",
    labelSr: "Opis",
    labelEn: "Prompt",
    default: "",
    max: PROMPT_MAX_LENGTH,
    affectsPrice: false,
  };
}

/**
 * `dola-seedream-5-0-pro-260628`. fal na njemu uzima 1,50x, pa ide direktno
 * (STUDIO-CATALOG-V4 2.6). Sinhron je - odgovor nosi sliku.
 *
 * `layerize` je jedina stvar u katalogu koju Midjourney nema ni blizu:
 * razlaganje slike na providne slojeve koje klijent menja pojedinačno. Zato i
 * ima svoje cenovno pravilo - naplaćuje se PO SLOJU, a ne po slici.
 *
 * `input_images` u `extras` NIJE kontrola iz forme i namerno ga nema u
 * `paramSpec`-u: to je broj fajlova koje je server stvarno primio u slotu, i
 * dodaje ga onaj ko pravi posao POSLE sanitizacije. Da je kontrola, klijent bi
 * mogao da pošalje deset slika a prijavi jednu.
 */
export const SEEDREAM_5_PRO: BytePlusModelSeed = {
  slug: "seedream-5-pro",
  provider: "byteplus",
  kind: "image",
  family: "seedream",
  labelSr: "Seedream 5 Pro",
  labelEn: "Seedream 5 Pro",
  taglineSr: "Slike koje se razlažu na slojeve koje posle menjaš pojedinačno.",
  taglineEn: "Images that split into layers you can edit one by one.",
  descriptionSr:
    "Vrhunski model za slike sa izmenom po regionima i razlaganjem na providne slojeve - zameni boju flaše ili tekst na etiketi bez ponovnog generisanja.",
  descriptionEn:
    "Top-tier image model with region editing and layer decomposition - swap a bottle colour or label text without regenerating.",
  endpoints: {
    text: "dola-seedream-5-0-pro-260628",
    image_multi: "dola-seedream-5-0-pro-260628",
    layerize: "dola-seedream-5-0-pro-260628",
  },
  inputModes: ["text", "image_multi", "layerize"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 10, accept: IMAGE_ACCEPT } },
    layerize: { image: { max: 1, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    {
      key: "resolution",
      type: "segmented",
      labelSr: "Rezolucija",
      labelEn: "Resolution",
      default: "1.5K",
      options: [
        { value: "1.5K", labelSr: "1,5K", labelEn: "1.5K" },
        { value: "2K", labelSr: "2K", labelEn: "2K" },
      ],
      affectsPrice: true,
    },
    {
      key: "num_images",
      type: "number",
      labelSr: "Broj slika",
      labelEn: "Number of images",
      default: 1,
      min: 1,
      max: 4,
      step: 1,
      showInModes: ["text", "image_multi"],
      affectsPrice: true,
    },
    {
      key: "layers",
      type: "slider",
      labelSr: "Broj slojeva",
      labelEn: "Number of layers",
      helpSr: "Svaki sloj se naplaćuje posebno.",
      helpEn: "Each layer is charged separately.",
      default: 2,
      min: 2,
      max: 17,
      step: 1,
      unitSr: "slojeva",
      unitEn: "layers",
      showInModes: ["layerize"],
      affectsPrice: true,
    },
  ],
  priceRule: {
    unit: "image",
    baseUsd: 0.045,
    multipliers: [{ param: "resolution", map: { "1.5K": 1, "2K": 2 } }],
    quantityParam: "num_images",
    extras: [{ param: "input_images", freeCount: 1, usdEach: 0.003 }],
    modeRules: {
      layerize: {
        unit: "layer",
        baseUsd: 0.0225,
        multipliers: [{ param: "resolution", map: { "1.5K": 1, "2K": 2 } }],
        quantityParam: "layers",
        extras: [{ param: "input_images", freeCount: 1, usdEach: 0.003 }],
      },
    },
  },
  capabilities: { sync: true, maxRefImages: 10, minLayers: 2, maxLayers: 17 },
  sortOrder: 60,
};

/**
 * `dreamina-seedance-2-0-260128`. fal na Seedance uzima TAČNO DUPLO
 * (STUDIO-CATALOG-V4 3.4) - ovo je najveći novčani dobitak u katalogu.
 *
 * `tier` menja cenu preko `lookup`, a Mini nema 1080p ni 4K. Zabrana nigde ne
 * postoji kao pravilo: kombinacije `mini|1080p` i `mini|4K` prosto nema u mapi,
 * pa je i UI sakriva i server odbija iz istog izvora.
 */
export const SEEDANCE_20: BytePlusModelSeed = {
  slug: "seedance-20",
  provider: "byteplus",
  kind: "video",
  family: "seedance",
  labelSr: "Seedance 2.0",
  labelEn: "Seedance 2.0",
  taglineSr: "Video do 4K, sa tri brzine koje menjaju cenu.",
  taglineEn: "Video up to 4K, with three speed tiers that change the price.",
  descriptionSr:
    "Model za video iz teksta, slike ili reference. Standard daje najbolji kvalitet i ide do 4K; Fast i Mini su jeftiniji i staju na 720p.",
  descriptionEn:
    "Text-, image- and reference-to-video model. Standard gives the best quality up to 4K; Fast and Mini are cheaper and stop at 720p.",
  endpoints: {
    text: "dreamina-seedance-2-0-260128",
    image: "dreamina-seedance-2-0-260128",
    reference: "dreamina-seedance-2-0-260128",
  },
  inputModes: ["text", "image", "reference"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    reference: {
      image: { max: 9, accept: IMAGE_ACCEPT },
      video: { max: 3, accept: VIDEO_ACCEPT },
    },
  },
  paramSpec: [
    promptControl(),
    {
      key: "tier",
      type: "segmented",
      labelSr: "Brzina",
      labelEn: "Tier",
      helpSr: "Mini je najjeftiniji, ali staje na 720p.",
      helpEn: "Mini is cheapest but stops at 720p.",
      default: "standard",
      options: [
        { value: "standard", labelSr: "Standard", labelEn: "Standard" },
        { value: "fast", labelSr: "Fast", labelEn: "Fast" },
        { value: "mini", labelSr: "Mini", labelEn: "Mini" },
      ],
      affectsPrice: true,
    },
    {
      key: "resolution",
      type: "segmented",
      labelSr: "Rezolucija",
      labelEn: "Resolution",
      default: "720p",
      options: [
        { value: "480p", labelSr: "480p", labelEn: "480p" },
        { value: "720p", labelSr: "720p", labelEn: "720p" },
        { value: "1080p", labelSr: "1080p", labelEn: "1080p" },
        { value: "4K", labelSr: "4K", labelEn: "4K" },
      ],
      affectsPrice: true,
    },
    {
      key: "duration",
      type: "slider",
      labelSr: "Trajanje",
      labelEn: "Duration",
      default: 5,
      min: 4,
      max: 12,
      step: 1,
      unitSr: "s",
      unitEn: "s",
      affectsPrice: true,
    },
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: {
      params: ["tier", "resolution"],
      map: {
        "standard|480p": 0.07,
        "standard|720p": 0.151,
        "standard|1080p": 0.374,
        "standard|4K": 0.78,
        "fast|480p": 0.056,
        "fast|720p": 0.121,
        "mini|480p": 0.036,
        "mini|720p": 0.077,
      },
    },
    modeMultipliers: { reference_with_video: 0.6 },
  },
  capabilities: { audio: false, minDurationS: 4, maxDurationS: 12, maxRefImages: 9, maxRefVideos: 3 },
  sortOrder: 340,
};

/**
 * `dreamina-seedance-2-5-260628`. Do 30 sekundi u jednom kadru; nema 4K, nema
 * Fast ni Mini (STUDIO-CATALOG-V4 3.5).
 */
export const SEEDANCE_25: BytePlusModelSeed = {
  slug: "seedance-25",
  provider: "byteplus",
  kind: "video",
  family: "seedance",
  labelSr: "Seedance 2.5",
  labelEn: "Seedance 2.5",
  taglineSr: "Do 30 sekundi u jednom kadru, bez rezanja.",
  taglineEn: "Up to 30 seconds in a single shot, no cuts.",
  descriptionSr:
    "Najduži klip u katalogu iz jedne generacije. Prima do 50 referenci, ali ne ide preko 1080p.",
  descriptionEn:
    "The longest single-generation clip in the catalogue. Takes up to 50 references, but does not go past 1080p.",
  endpoints: {
    text: "dreamina-seedance-2-5-260628",
    image: "dreamina-seedance-2-5-260628",
    reference: "dreamina-seedance-2-5-260628",
  },
  inputModes: ["text", "image", "reference"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    reference: {
      image: { max: 50, accept: IMAGE_ACCEPT },
      video: { max: 3, accept: VIDEO_ACCEPT },
    },
  },
  paramSpec: [
    promptControl(),
    {
      key: "resolution",
      type: "segmented",
      labelSr: "Rezolucija",
      labelEn: "Resolution",
      default: "720p",
      options: [
        { value: "480p", labelSr: "480p", labelEn: "480p" },
        { value: "720p", labelSr: "720p", labelEn: "720p" },
        { value: "1080p", labelSr: "1080p", labelEn: "1080p" },
      ],
      affectsPrice: true,
    },
    {
      key: "duration",
      type: "slider",
      labelSr: "Trajanje",
      labelEn: "Duration",
      default: 5,
      min: 4,
      max: 30,
      step: 1,
      unitSr: "s",
      unitEn: "s",
      affectsPrice: true,
    },
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: {
      params: ["resolution"],
      map: { "480p": 0.103, "720p": 0.231, "1080p": 0.569 },
    },
    modeMultipliers: { reference_with_video: 0.6 },
  },
  capabilities: { audio: false, minDurationS: 4, maxDurationS: 30, maxRefImages: 50, maxRefVideos: 3 },
  sortOrder: 350,
};

export const BYTEPLUS_MODELS: BytePlusModelSeed[] = [SEEDREAM_5_PRO, SEEDANCE_20, SEEDANCE_25];
