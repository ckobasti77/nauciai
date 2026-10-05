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

export type CreaLocalRuntimeId = "mediapipe-vision" | "transformers" | "onnx" | "onnx-webgpu" | "tesseract" | "vad";

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

/** Fajlovi Florence-2 (K16): grafovi i rečnik, izmerene veličine (revizija u registru ispod). */
export const FLORENCE_FILES = [
  { key: "vision", path: "onnx/vision_encoder_quantized.onnx", bytes: 93_746_540 },
  { key: "embed", path: "onnx/embed_tokens_quantized.onnx", bytes: 39_390_433 },
  { key: "encoder", path: "onnx/encoder_model_quantized.onnx", bytes: 43_651_493 },
  { key: "decoder", path: "onnx/decoder_model_quantized.onnx", bytes: 97_760_937 },
  { key: "vocab", path: "vocab.json", bytes: 1_099_884 },
] as const;

/**
 * Verzija `@mediapipe/tasks-vision` iz `package.json`. WASM se vuče sa jsdelivr-a
 * za TAČNO ovu verziju - JS iz paketa i WASM sa CDN-a moraju da se poklope.
 * `lib/crea-local-ai/models.test.ts` proverava da se slaže sa `package.json`.
 */
export const MEDIAPIPE_VISION_VERSION = "1.0.1";
export const MEDIAPIPE_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VISION_VERSION}/wasm`;

/**
 * Verzija `onnxruntime-web` iz `package.json` (K10, 3D foto). JS (`onnxruntime-web/wasm`,
 * sa ugrađenim Emscripten omotačem) je u našem async chunk-u, a WASM ide sa jsdelivr-a
 * kroz naš keš - zato verzije moraju da se poklope (proverava `models.test.ts`).
 * Samo WASM (jedna nit, bez COOP/COEP, K01-5); WebGPU izdanje se ne vuče.
 */
export const ONNX_RUNTIME_WEB_VERSION = "1.30.0";
export const ORT_WASM_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_WEB_VERSION}/dist/ort-wasm-simd-threaded.wasm`;
/**
 * WebGPU izdanje istog paketa (K11: Swin2SR na računaru sa WebGPU-om):
 * `onnxruntime-web/webgpu` traži „asyncify" WASM, ne običan. Jedna nit, bez COOP/COEP.
 */
export const ORT_WEBGPU_WASM_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_WEB_VERSION}/dist/ort-wasm-simd-threaded.asyncify.wasm`;

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
  // Izmereno (K10): `ort-wasm-simd-threaded.wasm` iz onnxruntime-web 1.30.0.
  onnx: { bytes: 14_239_897, license: "MIT", files: { [ORT_WASM_URL]: 14_239_897 } },
  // Izmereno (K11): `ort-wasm-simd-threaded.asyncify.wasm` iz onnxruntime-web 1.30.0.
  "onnx-webgpu": { bytes: 26_781_914, license: "MIT", files: { [ORT_WEBGPU_WASM_URL]: 26_781_914 } },
  // tesseract.js sam vuče worker (111 307 B) i jezgro sa SIMD-om (3 899 472 B) sa jsdelivr-a,
  // zakucano na verziju paketa (`tesseract.js@v7.0.0`, `tesseract.js-core@v7.0.0`).
  tesseract: { bytes: 4_010_779, license: "Apache-2.0" },
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
    // Izmereno (K20): `Content-Length` sa Google CDN-a. Ulaz modela je 256 × 256, režim VIDEO.
    bytes: 249_537,
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["V18"],
  },
  "mp-interactive-segmenter": {
    runtime: "mediapipe-vision",
    source: {
      host: "google-cdn",
      // K11: MagicTouch v2 (podeljen model: enkoder jednom po slici, dekoder po kliku) - jedini koji
      // `InteractiveSegmenter` iz tasks-vision 1.0.1 prima; stari `magic_touch.tflite` kroz „Legacy"
      // klasu pada pri pokretanju grafa (provereno u browseru).
      url: "https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task",
    },
    // Izmereno (K11): `Content-Length` sa Google CDN-a; staje u budžet telefona (30 MB).
    bytes: 30_525_312,
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["S12"],
  },
  modnet: {
    // K11: kroz `onnxruntime-web` direktno (pretprocesiranje u `lib/crea-matting.ts`), kao Depth Anything.
    runtime: "onnx",
    source: {
      host: "huggingface",
      repo: "Xenova/modnet",
      revision: "fa2fa546052fba4c08921230a26cc69a333fca12",
      files: ["onnx/model_quantized.onnx"],
    },
    bytes: 6_632_188,
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["S14"],
  },
  "birefnet-lite": {
    // K11: proveren i NE koristi se. Na onnxruntime-web 1.30 WebGPU izvršilac traži 17 storage bafera po
    // šejderu (i RTX 40 daje 16), JSEP pada na `bad_alloc`, a CPU nema fp16 kernele. „Ukloni pozadinu" zato
    // radi sa MODNet-om (osoba) i klikom (predmet) na svakom uređaju. Revizija ostaje zakucana za sledeći ORT.
    runtime: "onnx-webgpu",
    source: {
      host: "huggingface",
      repo: "onnx-community/BiRefNet_lite-ONNX",
      revision: "de15b22ba131738a16dff04aab8bdf8dc32e3ac1",
      files: ["onnx/model_fp16.onnx"],
    },
    bytes: 114_538_221,
    license: "MIT",
    minClass: "desktop-gpu",
    featureIds: ["S14"],
  },
  migan: {
    // K11: „pipeline" izdanje - slika i maska (uint8; 255 = ostaje, 0 = briše se) ulaze, gotova slika izlazi.
    runtime: "onnx",
    source: {
      host: "huggingface",
      repo: "andraniksargsyan/migan",
      revision: "406830d0fa60666da0071c342ad2fbc8f30c5c64",
      files: ["migan_pipeline_v2.onnx"],
    },
    bytes: 28_079_181,
    license: "MIT",
    minClass: "phone",
    featureIds: ["S13"],
  },
  "swin2sr-x2": {
    // K11: fp32 (8 MB) - kvantizovan je na WASM-u samo ~15 % brži (izmereno), a uvećanje treba detalje.
    // Licenca je Apache-2.0 originala (caidas/swin2SR-lightweight-x2-64); ONNX izvoz nema svoju karticu.
    runtime: "onnx",
    source: {
      host: "huggingface",
      repo: "Xenova/swin2SR-lightweight-x2-64",
      revision: "92a21aca5713f20faf9a87590cdfbdce2e34112c",
      files: ["onnx/model.onnx"],
    },
    bytes: 8_078_888,
    license: "Apache-2.0",
    minClass: "phone",
    featureIds: ["S16"],
  },
  "depth-anything-v2-small": {
    // K10: kroz `onnxruntime-web` direktno (pretprocesiranje je u `lib/crea-photo3d.ts`), ne kroz transformers.js.
    runtime: "onnx",
    source: {
      host: "huggingface",
      repo: "onnx-community/depth-anything-v2-small",
      revision: "4472b7362082ad9968fee890ca0f1e5aca36b93d",
      files: ["onnx/model_quantized.onnx"],
    },
    bytes: 27_258_801,
    license: "Apache-2.0",
    minClass: "desktop",
    featureIds: ["S33"],
  },
  "florence-2-base": {
    // K16 (S45): Florence-2-base-ft (MIT), kvantizovan, kroz `onnxruntime-web` direktno
    // (`lib/crea-florence.ts`); četiri grafa + BPE rečnik, zbir izmerenih veličina.
    runtime: "onnx",
    source: {
      host: "huggingface",
      repo: "onnx-community/Florence-2-base-ft",
      revision: "e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f",
      files: [...FLORENCE_FILES.map((file) => file.path)],
    },
    bytes: FLORENCE_FILES.reduce((sum, file) => sum + file.bytes, 0),
    license: "MIT",
    minClass: "desktop-gpu",
    featureIds: ["S45"],
  },
  "clip-vit-b32": {
    // K16 (S43): slika → vektor (512). Kroz `onnxruntime-web` direktno (kao K10/K11), WASM;
    // ulaz `pixel_values`, izlaz `image_embeds`. Licenca MIT (openai/clip-vit-base-patch32).
    runtime: "onnx",
    source: {
      host: "huggingface",
      repo: "Xenova/clip-vit-base-patch32",
      revision: "d15189d7028b43f1d3e65039190477f6af591c2a",
      files: ["onnx/vision_model_quantized.onnx"],
    },
    bytes: 89_117_001,
    license: "MIT",
    minClass: "desktop-gpu",
    featureIds: ["S43"],
  },
  "mclip-text": {
    // K16 (S43): srpski tekst → isti prostor kao slike. DistilBERT (kvantizovan, uint8) iz
    // zvaničnog repoa; uz njega rečnik i projekcija 768 → 512 (`CLIP_TEXT_AUX_FILES`).
    runtime: "onnx",
    source: {
      host: "huggingface",
      repo: "sentence-transformers/clip-ViT-B-32-multilingual-v1",
      revision: "58edf8cada9e398793dca955574a48cbb7f18be2",
      files: ["onnx/model_quint8_avx2.onnx"],
    },
    bytes: 135_377_779,
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
    // Tačno putanja koju tesseract.js traži kad `langPath` nije zadat (K09: izmereno 1 537 929 B, gzip).
    source: { host: "jsdelivr", url: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/srp/4.0.0_best_int/srp.traineddata.gz" },
    bytes: 1_537_929,
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
    bytes: 1_774_421,
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

/** Opcije pokretanja: `webgpu` - običan ONNX model ide kroz WebGPU izdanje ORT-a (K11, Swin2SR). */
export type CreaRuntimeOptions = { webgpu?: boolean };

/** Runtime kojim se model stvarno pokreće. */
export function modelRuntime(id: CreaLocalModelId, options: CreaRuntimeOptions = {}): CreaLocalRuntimeId {
  const runtime: CreaLocalRuntimeId = CREA_LOCAL_MODELS[id].runtime;
  return runtime === "onnx" && options.webgpu ? "onnx-webgpu" : runtime;
}

/** Sve što alat preuzima pri prvom pokretanju: težine plus svaki runtime jednom. */
export function downloadBytes(ids: readonly CreaLocalModelId[], options: CreaRuntimeOptions = {}): number {
  const runtimes = new Set(ids.map((id) => modelRuntime(id, options)));
  let total = modelWeightBytes(ids);
  for (const runtime of runtimes) total += CREA_LOCAL_RUNTIMES[runtime].bytes;
  return total;
}

/**
 * URL fajla modela koji se preuzima - samo za izvore sa jednim fajlom. Hugging
 * Face model mora da ima zakucanu reviziju (`resolve/<commit>`), inače `null`.
 */
/** Svi fajlovi modela (K16: Florence-2 ima više grafova); HF bez zakucane revizije = prazno. */
export function modelFileUrls(id: CreaLocalModelId): string[] {
  const source: CreaModelSource = CREA_LOCAL_MODELS[id].source;
  if (source.host !== "huggingface") return [source.url];
  if (!source.revision) return [];
  return source.files.map((file) => `https://huggingface.co/${source.repo}/resolve/${source.revision}/${file}`);
}

export function modelFileUrl(id: CreaLocalModelId): string | null {
  const source: CreaModelSource = CREA_LOCAL_MODELS[id].source;
  if (source.host !== "huggingface") return source.url;
  if (!source.revision || source.files.length !== 1) return null;
  return `https://huggingface.co/${source.repo}/resolve/${source.revision}/${source.files[0]}`;
}

/**
 * Pomoćni fajlovi višejezičnog CLIP tekst enkodera (K16): WordPiece rečnik i težine
 * projekcije 768 → 512 (`2_Dense`, safetensors, F32 `linear.weight`). Ista revizija
 * kao model; veličine izmerene.
 */
const MCLIP_BASE = "https://huggingface.co/sentence-transformers/clip-ViT-B-32-multilingual-v1/resolve/58edf8cada9e398793dca955574a48cbb7f18be2";
export const CLIP_TEXT_AUX_FILES = {
  vocab: { url: `${MCLIP_BASE}/vocab.txt`, bytes: 995_526 },
  dense: { url: `${MCLIP_BASE}/2_Dense/model.safetensors`, bytes: 1_572_984 },
} as const;
