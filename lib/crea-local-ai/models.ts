/**
 * Registar lokalnih modela Cree (K04, plan K01 §3.4): šta se preuzima u browser
 * korisnika, odakle, koliko je veliko i pod kojom licencom. Čisti podaci - bez
 * React-a i bez browser API-ja - pa ga čitaju i `lib/crea-tools.ts` i testovi.
 *
 * Ništa odavde ne ide u naš bundle ni u repo: fajlovi se vuku sa CDN-a tek kad
 * korisnik pokrene alat, i čuvaju u Cache Storage-u (`./cache.ts`).
 *
 * `bytes` je veličina RASPAKOVANOG fajla. CDN često šalje brotli, pa je
 * `Content-Length` tada manji od onoga što stigne kroz `response.body` - traka
 * napretka zato računa od ove cifre, ne od zaglavlja. Za modele koji se još ne
 * koriste (`soon` alati) cifra je okvirna; korak koji ih uključi je potvrđuje i
 * zakucava reviziju (test traži reviziju samo za modele alata koji rade).
 *
 * Nijedan model nije sa zabranjene liste iz plana §6 (BRIA RMBG, Depth Anything
 * V2 Base/Large, CodeFormer, GFPGAN, jina-clip-v2, Piper sr_RS...).
 */

import type { CreaDeviceClass } from "../crea-device";

export const CREA_ALLOWED_MODEL_LICENSES = ["Apache-2.0", "MIT"] as const;
export type CreaModelLicense = (typeof CREA_ALLOWED_MODEL_LICENSES)[number];

export type CreaLocalRuntimeId = "mediapipe-vision" | "transformers" | "onnx" | "tesseract" | "vad";

export type CreaModelSource =
  | { host: "google-cdn"; url: string }
  | { host: "huggingface"; repo: string; revision?: string; files: string[] }
  | { host: "jsdelivr"; url: string };

export type CreaLocalModelSpec = {
  runtime: CreaLocalRuntimeId;
  source: CreaModelSource;
  /** Raspakovana veličina u bajtovima (zbir svih fajlova modela). */
  bytes: number;
  license: CreaModelLicense;
  /** Najslabija klasa uređaja na kojoj model radi u punom obliku. */
  minClass: CreaDeviceClass;
  featureIds: readonly string[];
};

const MB = 1024 * 1024;

/**
 * Verzija `@mediapipe/tasks-vision` iz `package.json`. WASM se vuče sa jsdelivr-a
 * za TAČNO ovu verziju - JS iz paketa i WASM sa CDN-a moraju da se poklope.
 * `lib/crea-local-ai/models.test.ts` proverava da se slaže sa `package.json`.
 */
export const MEDIAPIPE_VISION_VERSION = "1.0.1";
export const MEDIAPIPE_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VISION_VERSION}/wasm`;

/**
 * Runtime-i koji se preuzimaju jednom i dele između modela. Ulaze u veličinu
 * preuzimanja (potvrda pre preuzimanja, traka napretka), ali NE u budžet modela
 * po klasi uređaja - budžet meri težine, a runtime je isti za mali i veliki model.
 */
export const CREA_LOCAL_RUNTIMES: Record<
  CreaLocalRuntimeId,
  { bytes: number; license: CreaModelLicense; files?: Readonly<Record<string, number>> }
> = {
  // WASM sa SIMD-om ili bez njega (bira `FilesetResolver`) + loader od ~0,3 MB.
  "mediapipe-vision": {
    bytes: 12_080_331,
    license: "Apache-2.0",
    files: {
      [`${MEDIAPIPE_WASM_BASE}/vision_wasm_internal.wasm`]: 11_756_954,
      [`${MEDIAPIPE_WASM_BASE}/vision_wasm_nosimd_internal.wasm`]: 10_960_242,
    },
  },
  transformers: { bytes: 21 * MB, license: "Apache-2.0" },
  onnx: { bytes: 10 * MB, license: "MIT" },
  tesseract: { bytes: 3 * MB, license: "Apache-2.0" },
  vad: { bytes: 2 * MB, license: "MIT" },
};

export const CREA_LOCAL_MODELS = {
  "mp-face-detector": {
    runtime: "mediapipe-vision",
    source: {
      host: "google-cdn",
      url: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    },
    bytes: 229_746,
    license: "Apache-2.0",
    minClass: "weak",
    featureIds: ["S35", "S30", "V15"],
  },
  "mp-selfie-segmenter": {
    runtime: "mediapipe-vision",
    source: {
      host: "google-cdn",
      url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
    },
    bytes: Math.round(0.3 * MB),
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["V18"],
  },
  "mp-interactive-segmenter": {
    runtime: "mediapipe-vision",
    source: {
      host: "google-cdn",
      url: "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite",
    },
    bytes: 6 * MB,
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["S12"],
  },
  modnet: {
    runtime: "transformers",
    source: { host: "huggingface", repo: "Xenova/modnet", files: ["onnx/model_quantized.onnx"] },
    bytes: 7 * MB,
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["S14"],
  },
  "birefnet-lite": {
    runtime: "transformers",
    source: { host: "huggingface", repo: "onnx-community/BiRefNet_lite", files: ["onnx/model_fp16.onnx"] },
    bytes: 115 * MB,
    license: "MIT",
    minClass: "desktop-gpu",
    featureIds: ["S14"],
  },
  migan: {
    runtime: "onnx",
    source: { host: "huggingface", repo: "andraniksargsyan/migan", files: ["migan_pipeline_v2.onnx"] },
    bytes: 30 * MB,
    license: "MIT",
    minClass: "desktop",
    featureIds: ["S13"],
  },
  "swin2sr-x2": {
    runtime: "transformers",
    source: { host: "huggingface", repo: "Xenova/swin2SR-lightweight-x2-64", files: ["onnx/model_quantized.onnx"] },
    bytes: 5 * MB,
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["S16"],
  },
  "depth-anything-v2-small": {
    runtime: "transformers",
    source: { host: "huggingface", repo: "onnx-community/depth-anything-v2-small", files: ["onnx/model_quantized.onnx"] },
    bytes: 27 * MB,
    license: "Apache-2.0",
    minClass: "desktop",
    featureIds: ["S33"],
  },
  "florence-2-base": {
    runtime: "transformers",
    source: { host: "huggingface", repo: "onnx-community/Florence-2-base", files: ["onnx/"] },
    bytes: 270 * MB,
    license: "MIT",
    minClass: "desktop-gpu",
    featureIds: ["S45"],
  },
  "clip-vit-b32": {
    runtime: "transformers",
    source: { host: "huggingface", repo: "Xenova/clip-vit-base-patch32", files: ["onnx/vision_model_quantized.onnx"] },
    bytes: 90 * MB,
    license: "MIT",
    minClass: "desktop-gpu",
    featureIds: ["S43"],
  },
  "mclip-text": {
    runtime: "transformers",
    source: {
      host: "huggingface",
      repo: "sentence-transformers/clip-ViT-B-32-multilingual-v1",
      files: ["onnx/model_quantized.onnx"],
    },
    bytes: 130 * MB,
    license: "Apache-2.0",
    minClass: "desktop-gpu",
    featureIds: ["S43"],
  },
  "whisper-large-v3-turbo": {
    runtime: "transformers",
    source: { host: "huggingface", repo: "onnx-community/whisper-large-v3-turbo", files: ["onnx/"] },
    bytes: 550 * MB,
    license: "MIT",
    minClass: "desktop-gpu",
    featureIds: ["V25", "A16"],
  },
  "silero-vad": {
    runtime: "vad",
    source: { host: "jsdelivr", url: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web/dist/silero_vad_v5.onnx" },
    bytes: 2 * MB,
    license: "MIT",
    minClass: "weak",
    featureIds: ["A7", "A14"],
  },
  rife: {
    runtime: "onnx",
    source: { host: "huggingface", repo: "onnx-community/rife", files: ["rife.onnx"] },
    bytes: 20 * MB,
    license: "MIT",
    minClass: "desktop-gpu",
    featureIds: ["V17"],
  },
  "tess-srp": {
    runtime: "tesseract",
    source: { host: "jsdelivr", url: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/srp/4.0.0_best_int/srp.traineddata.gz" },
    bytes: 2 * MB,
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["S21", "S32"],
  },
  "tess-srp-latn": {
    runtime: "tesseract",
    source: {
      host: "jsdelivr",
      url: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/srp_latn/4.0.0_best_int/srp_latn.traineddata.gz",
    },
    bytes: 2 * MB,
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["S21", "S32"],
  },
} as const satisfies Record<string, CreaLocalModelSpec>;

export type CreaLocalModelId = keyof typeof CREA_LOCAL_MODELS;

export function localModelSpec(id: CreaLocalModelId): CreaLocalModelSpec {
  return CREA_LOCAL_MODELS[id];
}

/** Zbir težina modela (bez runtime-a). */
export function modelWeightBytes(ids: readonly CreaLocalModelId[]): number {
  return ids.reduce((sum, id) => sum + CREA_LOCAL_MODELS[id].bytes, 0);
}

/** Sve što alat preuzima pri prvom pokretanju: težine plus svaki runtime jednom. */
export function downloadBytes(ids: readonly CreaLocalModelId[]): number {
  const runtimes = new Set(ids.map((id) => CREA_LOCAL_MODELS[id].runtime));
  let total = modelWeightBytes(ids);
  for (const runtime of runtimes) total += CREA_LOCAL_RUNTIMES[runtime].bytes;
  return total;
}

/** URL fajla modela koji se preuzima (samo za izvore sa jednim fajlom). */
export function modelFileUrl(id: CreaLocalModelId): string | null {
  const source: CreaModelSource = CREA_LOCAL_MODELS[id].source;
  return source.host === "huggingface" ? null : source.url;
}
