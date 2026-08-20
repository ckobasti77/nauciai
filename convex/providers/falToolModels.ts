/**
 * Kling alati iz STUDIO-CATALOG-V4 (3.9), u obliku u kojem ulaze u tabelu
 * `models`. PODATAK, ne seed - upis radi `studioModels.seedStudioModels`.
 *
 * Ovo nisu modeli za generisanje iz prompta nego alati nad OKAČENIM materijalom:
 * avatar iz slike i zvuka, lipsync, prenos pokreta, proba odeće i zvuk za nem
 * video. Zato im količina koju cenovno pravilo množi ne dolazi iz forme nego iz
 * ulaznog fajla - videti `capabilities.quantity` i `modelControls.QuantitySource`.
 *
 * **Trajanje meri SERVER** (W5, `lib/media-duration.ts`):
 * `studioActions.measureInputUpload` pročita `mvhd` odnosno EBML zaglavlje
 * okačenog fajla i upiše sekunde u `studioUploads.durationS`, a `createJob`
 * naplaćuje isključivo taj broj. Parser čita sva tri formata iz
 * `VIDEO_ACCEPT`-a i sva četiri iz `AUDIO_ACCEPT`-a, pa su tri modela koja se
 * po trajanju naplaćuju vraćena u ponudu.
 *
 * Cene su prepisane iz kataloga doslovno. Ne preračunavaju se.
 */

import {
  AUDIO_ACCEPT,
  IMAGE_ACCEPT,
  promptControl,
  resolutionControl,
  VIDEO_ACCEPT,
} from "./modelControls";
import type { StudioModelSeed } from "./modelSeed";

/**
 * `kling-avatar` - govoreći avatar iz jedne slike i jednog snimka glasa
 * (katalog 3.9). Naplaćuje se po sekundi OKAČENOG zvuka: klip traje tačno
 * koliko i snimak, pa korisnik nema šta da bira - meri se ulaz.
 */
export const KLING_AVATAR: StudioModelSeed = {
  slug: "kling-avatar",
  provider: "fal",
  kind: "video",
  family: "kling",
  labelSr: "Kling avatar",
  labelEn: "Kling avatar",
  taglineSr: "Slika i snimak glasa - izlazi osoba koja govori.",
  taglineEn: "An image and a voice recording - out comes a person talking.",
  descriptionSr:
    "Okačiš fotografiju osobe i snimak glasa, a model napravi video u kojem ta osoba izgovara taj tekst. Klip traje koliko i zvuk, pa se po tome i naplaćuje.",
  descriptionEn:
    "Upload a photo of a person and a voice recording, and the model makes a video of that person saying it. The clip lasts as long as the audio, and that is what it is charged by.",
  endpoints: { image_audio: "fal-ai/kling-video/v1/pro/ai-avatar" },
  inputModes: ["image_audio"],
  inputSpec: {
    image_audio: {
      image: { max: 1, accept: IMAGE_ACCEPT },
      audio: { max: 1, accept: AUDIO_ACCEPT },
    },
  },
  paramSpec: [
    {
      key: "quality",
      type: "segmented",
      labelSr: "Kvalitet",
      labelEn: "Quality",
      default: "720p",
      options: [
        { value: "720p", labelSr: "720p", labelEn: "720p" },
        { value: "1080p", labelSr: "1080p", labelEn: "1080p" },
      ],
      affectsPrice: true,
    },
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: { params: ["quality"], map: { "720p": 0.0562, "1080p": 0.115 } },
  },
  capabilities: {
    mode: "async_webhook",
    audio: true,
    quantity: { param: "duration", from: "input_audio_seconds", min: 1, max: 60 },
  },
  sortOrder: 390,
};

/**
 * `kling-lipsync` - usne se sinhronizuju sa zvukom ili sa ukucanim tekstom
 * (katalog 3.9).
 *
 * **Naplaćuje se na pun peti sekund**: video od 3 s košta kao 5 s. To je
 * `roundUpTo: 5` u pravilu, a ne poruka u UI-ju koja se lako zaboravi.
 */
export const KLING_LIPSYNC: StudioModelSeed = {
  slug: "kling-lipsync",
  provider: "fal",
  kind: "video",
  family: "kling",
  labelSr: "Kling lipsync",
  labelEn: "Kling lipsync",
  taglineSr: "Usne prate zvuk ili tekst koji ukucaš.",
  taglineEn: "Lips follow the audio, or the text you type.",
  descriptionSr:
    "Okačiš video sa licem i dodaš zvuk ili tekst; model pomera usne da prate govor. Naplaćuje se po sekundi videa, zaokruženo naviše na pet sekundi.",
  descriptionEn:
    "Upload a video with a face and add audio or text; the model moves the lips to match. It is charged per second of video, rounded up to five seconds.",
  endpoints: { video_audio: "fal-ai/kling-video/lipsync" },
  inputModes: ["video_audio"],
  inputSpec: {
    video_audio: {
      video: { max: 1, accept: VIDEO_ACCEPT },
      audio: { max: 1, accept: AUDIO_ACCEPT },
    },
  },
  paramSpec: [
    {
      key: "source",
      type: "segmented",
      labelSr: "Izvor govora",
      labelEn: "Speech source",
      helpSr: "Zvuk koji okačiš ili tekst koji ukucaš.",
      helpEn: "Audio you upload, or text you type.",
      default: "audio",
      options: [
        { value: "audio", labelSr: "Zvuk", labelEn: "Audio" },
        { value: "text", labelSr: "Tekst", labelEn: "Text" },
      ],
      affectsPrice: false,
    },
    {
      key: "text",
      type: "textarea",
      labelSr: "Tekst za izgovor",
      labelEn: "Text to speak",
      helpSr: "Koristi se samo kad je izvor govora tekst.",
      helpEn: "Used only when the speech source is text.",
      default: "",
      max: 2000,
      affectsPrice: false,
    },
  ],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    baseUsd: 0.014,
    roundUpTo: 5,
  },
  capabilities: {
    mode: "async_webhook",
    roundUpToS: 5,
    quantity: { param: "duration", from: "input_video_seconds", min: 1, max: 60 },
  },
  sortOrder: 392,
};

/** `kling-motion` - pokret iz postojećeg videa prenet na okačenu sliku (katalog 3.9). */
export const KLING_MOTION: StudioModelSeed = {
  slug: "kling-motion",
  provider: "fal",
  kind: "video",
  family: "kling",
  labelSr: "Kling prenos pokreta",
  labelEn: "Kling motion transfer",
  taglineSr: "Pokret iz jednog videa, lik sa tvoje slike.",
  taglineEn: "Motion from one video, the character from your image.",
  descriptionSr:
    "Okačiš video sa pokretom i sliku lika; model prenese pokret na lik sa slike. Naplaćuje se po sekundi okačenog videa.",
  descriptionEn:
    "Upload a video with the motion and an image of the character; the model transfers the motion onto that character. Charged per second of the uploaded video.",
  endpoints: { video_image: "fal-ai/kling-video/motion-transfer" },
  inputModes: ["video_image"],
  inputSpec: {
    video_image: {
      video: { max: 1, accept: VIDEO_ACCEPT },
      image: { max: 1, accept: IMAGE_ACCEPT },
    },
  },
  paramSpec: [resolutionControl({ values: ["720p", "1080p"], default: "720p" })],
  priceRule: {
    unit: "second",
    quantityParam: "duration",
    lookup: { params: ["resolution"], map: { "720p": 0.126, "1080p": 0.168 } },
  },
  capabilities: {
    mode: "async_webhook",
    quantity: { param: "duration", from: "input_video_seconds", min: 1, max: 60 },
  },
  sortOrder: 394,
};

/**
 * `kling-tryon` - proba odeće (katalog 3.9). Dva imenovana slota, jer redosled
 * nije svejedno: prvo osoba, pa odevni predmet.
 */
export const KLING_TRYON: StudioModelSeed = {
  slug: "kling-tryon",
  provider: "fal",
  kind: "image",
  family: "kling",
  labelSr: "Kling proba odeće",
  labelEn: "Kling virtual try-on",
  taglineSr: "Odevni predmet obučen na osobu sa fotografije.",
  taglineEn: "A garment worn by the person in your photo.",
  descriptionSr:
    "Okačiš fotografiju osobe i fotografiju odevnog predmeta; izlazi slika te osobe u tom odevnom predmetu. Jedna cena po generaciji.",
  descriptionEn:
    "Upload a photo of a person and a photo of a garment; out comes an image of that person wearing it. One price per generation.",
  endpoints: { image_multi: "fal-ai/kling/v1-5/kolors-virtual-try-on" },
  inputModes: ["image_multi"],
  inputSpec: {
    image_multi: {
      person: { max: 1, accept: IMAGE_ACCEPT },
      garment: { max: 1, accept: IMAGE_ACCEPT },
    },
  },
  paramSpec: [],
  priceRule: { unit: "generation", baseUsd: 0.07 },
  capabilities: { mode: "async_webhook", slots: ["person", "garment"] },
  sortOrder: 90,
};

/**
 * `kling-v2a` - zvuk za nem video (katalog 3.9). Izlaz je zvučni zapis, pa je
 * red `kind: "audio"` iako se ulaz gleda kao video.
 */
export const KLING_V2A: StudioModelSeed = {
  slug: "kling-v2a",
  provider: "fal",
  kind: "audio",
  family: "kling",
  labelSr: "Kling zvuk za video",
  labelEn: "Kling video-to-audio",
  taglineSr: "Nem snimak dobija zvuk koji prati ono što se vidi.",
  taglineEn: "A silent clip gets audio that follows what is on screen.",
  descriptionSr:
    "Okačiš nem video, a model napravi zvučnu podlogu koja prati radnju u kadru. Jedna cena po generaciji, bez obzira na dužinu.",
  descriptionEn:
    "Upload a silent video and the model produces a soundtrack that follows the action. One price per generation, regardless of length.",
  endpoints: { video: "fal-ai/kling-video/v2a" },
  inputModes: ["video"],
  inputSpec: { video: { video: { max: 1, accept: VIDEO_ACCEPT } } },
  paramSpec: [promptControl()],
  priceRule: { unit: "generation", baseUsd: 0.035 },
  capabilities: { mode: "async_webhook" },
  sortOrder: 480,
};

export const FAL_TOOL_MODELS: StudioModelSeed[] = [
  KLING_AVATAR,
  KLING_LIPSYNC,
  KLING_MOTION,
  KLING_TRYON,
  KLING_V2A,
];
