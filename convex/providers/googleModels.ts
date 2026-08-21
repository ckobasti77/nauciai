/**
 * Google-ovi video modeli iz STUDIO-CATALOG-V4 (3.7 i 3.8), u obliku u kojem
 * ulaze u tabelu `models`. PODATAK, ne seed - upis radi seed kataloga (S5).
 *
 * **Dva od četiri reda idu preko fal-a.** Veo je jedini model u katalogu gde
 * tarifa menja provajdera: Lite i Standard su kod fal-a parity, pa nema razloga
 * da se zove Google direktno; Fast kod fal-a nosi 17-50% marže, pa ide direktno.
 * `provider` je polje REDA, ne fajla - zato su to tri odvojena reda, a ne jedan
 * red sa parametrom `tier`. Fajl je zajednički jer je porodica ista.
 *
 * Cene su prepisane iz kataloga doslovno. Ne preračunavaju se.
 */

import type { ParamControl } from "../studioParamSpec";
import type { StudioModelSeed } from "./modelSeed";
import { OMNI_RESOLUTION } from "./googleCore";

const IMAGE_ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const VIDEO_ACCEPT = ["video/mp4", "video/quicktime", "video/webm"];

/** Isti gornji limit prompta koji katalog propisuje za ostale modele. */
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
 * Zvuk je kod Veo-a stavka na računu (`720p|on` je skuplje od `720p|off`), pa je
 * prekidač i u ceni i u zahtevu. Podrazumevano uključen - nem klip je izuzetak,
 * ne pravilo.
 */
function audioControl(): ParamControl {
  return {
    key: "audio",
    type: "switch",
    labelSr: "Zvuk",
    labelEn: "Audio",
    helpSr: "Nativni zvuk iz modela. Poskupljuje generaciju.",
    helpEn: "Native audio from the model. It raises the price.",
    default: true,
    affectsPrice: true,
  };
}

function resolutionControl(values: string[]): ParamControl {
  return {
    key: "resolution",
    type: "segmented",
    labelSr: "Rezolucija",
    labelEn: "Resolution",
    default: "720p",
    options: values.map((value) => ({ value, labelSr: value, labelEn: value })),
    affectsPrice: true,
  };
}

/**
 * Trajanje je 4-8 s u svim režimima osim u `video`-u, gde `video` znači
 * PRODUŽAVANJE postojećeg klipa i ide do 30 s (katalog 3.7). To su zato dve
 * kontrole sa istim ključem i različitim `showInModes` - u datom režimu vidi se
 * tačno jedna, pa i forma i `sanitizeSpecParams` gledaju istu granicu.
 */
const CLIP_MODES = ["text", "image", "first_last", "reference"];

function durationControl(opts: {
  min: number;
  max: number;
  showInModes?: string[];
  labelSr?: string;
  labelEn?: string;
}): ParamControl {
  return {
    key: "duration",
    type: "slider",
    labelSr: opts.labelSr ?? "Trajanje",
    labelEn: opts.labelEn ?? "Duration",
    default: opts.min,
    min: opts.min,
    max: opts.max,
    step: 1,
    unitSr: "s",
    unitEn: "s",
    ...(opts.showInModes ? { showInModes: opts.showInModes } : {}),
    affectsPrice: true,
  };
}

/**
 * `veo-31-lite` - fal, parity na sve četiri ćelije cenovnika (katalog 3.7).
 *
 * **Lite nema `reference` ni produžavanje.** To nije stvar UI-ja nego reda:
 * režima nema u `inputModes` ni u `endpoints`, pa ga ni forma ne nudi ni server
 * ne prima (`NEDOZVOLJEN_REZIM`).
 */
export const VEO_31_LITE: StudioModelSeed = {
  slug: "veo-31-lite",
  provider: "fal",
  kind: "video",
  family: "veo",
  labelSr: "Veo 3.1 Lite",
  labelEn: "Veo 3.1 Lite",
  taglineSr: "Najjeftiniji Veo sa zvukom, za brze probe.",
  taglineEn: "The cheapest Veo with audio, for quick drafts.",
  descriptionSr:
    "Google Veo 3.1 u najlakšoj tarifi. Radi iz teksta, iz slike i iz prvog i poslednjeg kadra; nema reference ni produžavanje klipa.",
  descriptionEn:
    "Google Veo 3.1 in its lightest tier. Works from text, from an image and from a first/last frame pair; no references and no clip extension.",
  endpoints: {
    text: "fal-ai/veo3.1/lite",
    image: "fal-ai/veo3.1/lite/image-to-video",
    first_last: "fal-ai/veo3.1/lite/first-last-frame-to-video",
  },
  inputModes: ["text", "image", "first_last"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl(["720p", "1080p"]),
    audioControl(),
    durationControl({ min: 4, max: 8 }),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: {
      params: ["resolution", "audio"],
      map: {
        "720p|off": 0.03,
        "720p|on": 0.05,
        "1080p|off": 0.05,
        "1080p|on": 0.08,
      },
    },
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    minDurationS: 4,
    maxDurationS: 8,
    reference: false,
    extend: false,
  },
  sortOrder: 370,
};

/**
 * `veo-31-fast` - **google, direktno.** fal na ovoj tarifi uzima 17-50%
 * (katalog 3.7), i to je jedini razlog zašto ceo poller uopšte postoji: Google
 * za video nema webhookove.
 */
export const VEO_31_FAST: StudioModelSeed = {
  slug: "veo-31-fast",
  provider: "google",
  kind: "video",
  family: "veo",
  labelSr: "Veo 3.1 Fast",
  labelEn: "Veo 3.1 Fast",
  taglineSr: "Veo sa zvukom do 4K, i produžavanje klipa do 30 s.",
  taglineEn: "Veo with audio up to 4K, plus clip extension to 30s.",
  descriptionSr:
    "Brza tarifa Veo 3.1 sa svim ulazima: tekst, slika, prvi i poslednji kadar, reference i produžavanje postojećeg klipa.",
  descriptionEn:
    "The fast Veo 3.1 tier with every input: text, image, first/last frame, references, and extending an existing clip.",
  endpoints: {
    text: "veo-3.1-fast-generate-preview",
    image: "veo-3.1-fast-generate-preview",
    first_last: "veo-3.1-fast-generate-preview",
    reference: "veo-3.1-fast-generate-preview",
    video: "veo-3.1-fast-generate-preview",
  },
  inputModes: ["text", "image", "first_last", "reference", "video"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
    reference: { image: { max: 3, accept: IMAGE_ACCEPT } },
    video: { video: { max: 1, accept: VIDEO_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl(["720p", "1080p", "4K"]),
    audioControl(),
    durationControl({ min: 4, max: 8, showInModes: CLIP_MODES }),
    durationControl({
      min: 4,
      max: 30,
      showInModes: ["video"],
      labelSr: "Trajanje produžetka",
      labelEn: "Extension duration",
    }),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: {
      params: ["resolution", "audio"],
      map: {
        "720p|off": 0.08,
        "720p|on": 0.1,
        "1080p|off": 0.1,
        "1080p|on": 0.12,
        "4K|off": 0.25,
        "4K|on": 0.3,
      },
    },
  },
  capabilities: {
    // Koji Google API vozi ovaj red - provajder grana po ovome, ne po slugu.
    api: "predictLongRunning",
    mode: "async_poll",
    audio: true,
    minDurationS: 4,
    maxDurationS: 8,
    maxExtendDurationS: 30,
    reference: true,
    extend: true,
    maxRefImages: 3,
  },
  sortOrder: 371,
};

/**
 * `veo-31` (Standard) - fal, parity na sve četiri ćelije. Najskuplji video u
 * katalogu po sekundi sa zvukom (87 kr/s), i to je tačno ono što treba da bude
 * vidljivo na dugmetu pre klika.
 */
export const VEO_31: StudioModelSeed = {
  slug: "veo-31",
  provider: "fal",
  kind: "video",
  family: "veo",
  labelSr: "Veo 3.1",
  labelEn: "Veo 3.1",
  taglineSr: "Pun Veo 3.1 - najbolji kvalitet u katalogu, i najskuplji.",
  taglineEn: "Full Veo 3.1 - the best quality in the catalogue, and the priciest.",
  descriptionSr:
    "Standardna tarifa Veo 3.1, sa svim ulazima i produžavanjem klipa. Uzmi je kad kadar ide u finalni materijal.",
  descriptionEn:
    "The standard Veo 3.1 tier, with every input and clip extension. Reach for it when the shot ships.",
  endpoints: {
    text: "fal-ai/veo3.1",
    image: "fal-ai/veo3.1/image-to-video",
    first_last: "fal-ai/veo3.1/first-last-frame-to-video",
    reference: "fal-ai/veo3.1/reference-to-video",
    video: "fal-ai/veo3.1/extend",
  },
  inputModes: ["text", "image", "first_last", "reference", "video"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    first_last: { image: { max: 2, accept: IMAGE_ACCEPT } },
    reference: { image: { max: 3, accept: IMAGE_ACCEPT } },
    video: { video: { max: 1, accept: VIDEO_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl(["720p", "1080p", "4K"]),
    audioControl(),
    durationControl({ min: 4, max: 8, showInModes: CLIP_MODES }),
    durationControl({
      min: 4,
      max: 30,
      showInModes: ["video"],
      labelSr: "Trajanje produžetka",
      labelEn: "Extension duration",
    }),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: {
      params: ["resolution", "audio"],
      map: {
        "720p|off": 0.2,
        "720p|on": 0.4,
        "1080p|off": 0.2,
        "1080p|on": 0.4,
        "4K|off": 0.4,
        "4K|on": 0.6,
      },
    },
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    minDurationS: 4,
    maxDurationS: 8,
    maxExtendDurationS: 30,
    reference: true,
    extend: true,
    maxRefImages: 3,
  },
  sortOrder: 372,
};

/**
 * `gemini-omni` - google, **Interactions API** (katalog 3.8). Izlaz 3-10 s,
 * 720p, 24 fps, nativan sinhronizovan zvuk, samo 16:9 i 9:16.
 *
 * Rezolucije NEMA u `paramSpec`-u: fiksna je, a kontrola sa jednom opcijom laže
 * da ima izbora. Stoji u `capabilities`, odakle je forma prikazuje kao podatak.
 *
 * `restrictionsSr`/`restrictionsEn` su tri ograničenja koja katalog izričito
 * traži da budu **poruka u UI-ju, ne tiha greška**. Ovde su podatak reda da bi
 * forma mogla da ih pokaže PRE nego što korisnik okači fajl; isti tekst se
 * ponavlja kao greška posla ako zahtev ipak stigne (`googleCore.ts`).
 */
export const GEMINI_OMNI: StudioModelSeed = {
  slug: "gemini-omni",
  provider: "google",
  kind: "video",
  family: "gemini",
  labelSr: "Gemini Omni Flash",
  labelEn: "Gemini Omni Flash",
  taglineSr: "Kratak klip sa nativnim zvukom, koji doradjuješ u razgovoru.",
  taglineEn: "A short clip with native audio that you refine by talking to it.",
  descriptionSr:
    "Video od 3 do 10 sekundi, 720p i 24 fps, sa zvukom koji je već sinhronizovan sa slikom. Izmena ide razgovorno, nad klipom koji je model sam napravio.",
  descriptionEn:
    "A 3-10 second video at 720p and 24fps, with audio already in sync. Editing is conversational, over a clip the model itself produced.",
  endpoints: {
    text: "gemini-omni-flash-preview",
    image: "gemini-omni-flash-preview",
    reference: "gemini-omni-flash-preview",
    video: "gemini-omni-flash-preview",
  },
  inputModes: ["text", "image", "reference", "video"],
  inputSpec: {
    text: {},
    image: { image: { max: 1, accept: IMAGE_ACCEPT } },
    // Bez audio slota, i to namerno: upload audio referenci je dokumentovan ali
    // NE RADI (katalog 3.8). Slot koji ne radi je gora poruka od poruke.
    reference: { image: { max: 3, accept: IMAGE_ACCEPT } },
    // Bez slota i namerno: `video` rezim ne prima upload (izmena OKAČENOG videa
    // nije dozvoljena iz EEA/CH/UK), nego IZBOR prethodne generacije OVOG modela
    // iz galerije - `capabilities.continuation` niže kaže formi i `createJob`-u
    // da taj rezim traži `sourceJobId`, ne fajl (nalaz S3, W7 stavka 3).
    video: {},
  },
  paramSpec: [
    promptControl(),
    {
      key: "aspect_ratio",
      type: "segmented",
      labelSr: "Odnos stranica",
      labelEn: "Aspect ratio",
      default: "16:9",
      options: [
        { value: "16:9", labelSr: "16:9", labelEn: "16:9" },
        { value: "9:16", labelSr: "9:16", labelEn: "9:16" },
      ],
      affectsPrice: false,
    },
    durationControl({ min: 3, max: 10 }),
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    baseUsd: 0.10136,
  },
  capabilities: {
    api: "interactions",
    mode: "async_poll",
    audio: true,
    resolution: OMNI_RESOLUTION,
    fps: 24,
    minDurationS: 3,
    maxDurationS: 10,
    extend: false,
    firstLast: false,
    audioReference: false,
    // `video` rezim: `sourceJobId` mora biti ID neke OD RANIJE `done` generacije
    // OVOG istog modela (`studio.ts` proverava vlasništvo i model). Server iz
    // njenog `providerRequestId`-ja izvuče Google-ov interakcijski ID i pošalje
    // ga kao `previous_interaction_id` - izmena tako ide nad klipom koji je
    // model sam napravio, nikad nad uploadovanim fajlom.
    continuation: { mode: "video", param: "previous_interaction_id" },
    restrictionsSr: [
      "Izmena videa koji si sam okačio nije dozvoljena iz EEA, Švajcarske i Ujedinjenog Kraljevstva - menja se samo klip koji je model napravio.",
      "Upload zvučnih referenci ne radi, iako je dokumentovan. Zvuk dolazi iz samog modela.",
      "Nema produžavanja klipa ni prvog i poslednjeg kadra.",
      "Model je u javnom pregledu sa uskom kvotom - ako je kvota potrošena, posao se odbija i krediti se odmah vraćaju.",
    ],
    restrictionsEn: [
      "Editing a video you uploaded is not allowed from the EEA, Switzerland and the UK - only a clip the model made can be edited.",
      "Uploading audio references does not work, even though it is documented. Audio comes from the model itself.",
      "No clip extension and no first/last frame.",
      "The model is in public preview with a tight quota - if the quota is spent the job is rejected and credits are returned immediately.",
    ],
  },
  sortOrder: 380,
};

/** Redovi koje S4 donosi. Dva idu na google, dva na fal - videti zaglavlje. */
export const GOOGLE_VIDEO_MODELS: StudioModelSeed[] = [
  VEO_31_LITE,
  VEO_31_FAST,
  VEO_31,
  GEMINI_OMNI,
];
