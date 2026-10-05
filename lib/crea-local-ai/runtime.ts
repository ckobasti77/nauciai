import type { BrushMode, FaceDetector, InteractiveSegmenter } from "@mediapipe/tasks-vision";
import type { Worker as TesseractWorker } from "tesseract.js";

import { fetchModelFile } from "./cache";
import { CreaLocalAiError, toLocalAiError } from "./errors";
import {
  CREA_LOCAL_MODELS,
  CREA_LOCAL_RUNTIMES,
  MEDIAPIPE_WASM_BASE,
  modelFileUrl,
  ORT_WASM_URL,
  ORT_WEBGPU_WASM_URL,
  type CreaLocalModelId,
} from "./models";
import { aggregateProgress, type AggregateProgress, type FileProgress } from "./progress";

/**
 * Lenjo učitavanje lokalnih AI biblioteka (K04, plan K01 §3.3). Ovo je jedino
 * mesto sa `import()`-om teških paketa: modul se uvozi samo iz komponenti alata
 * koje se same učitavaju kroz `components/crea/tools/index.tsx`, pa ni JS
 * MediaPipe-a ne ulazi u zajednički bundle (proverava `npm run check:bundle`).
 *
 * MediaPipe radi na glavnoj niti (plan K01 §3.3): brz je, a WASM sa CDN-a u
 * Worker-u ume da „visi" bez greške (isto kao Draco dekoder, vidi memoriju
 * repoa). Višenitni WASM se ne traži, pa COOP/COEP nije potreban (K01-5).
 */

export type LocalLoadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: AggregateProgress) => void;
};

type VisionModule = typeof import("@mediapipe/tasks-vision");
type WasmFileset = Awaited<ReturnType<VisionModule["FilesetResolver"]["forVisionTasks"]>>;

let visionModule: Promise<VisionModule> | null = null;
let visionFileset: Promise<WasmFileset> | null = null;
let faceDetector: Promise<FaceDetector> | null = null;

function importVision(): Promise<VisionModule> {
  visionModule ??= import("@mediapipe/tasks-vision").catch((error: unknown) => {
    visionModule = null;
    throw toLocalAiError(error, "MODEL_LOAD_FAILED");
  });
  return visionModule;
}

/** Više fajlova, jedna traka: svaki fajl javlja svoj napredak, a napolje ide zbir. */
function progressTracker(onProgress: LocalLoadOptions["onProgress"]) {
  const files = new Map<string, FileProgress>();
  return (key: string, initial: FileProgress) => {
    files.set(key, initial);
    return (progress: FileProgress) => {
      files.set(key, progress);
      onProgress?.(aggregateProgress([...files.values()]));
    };
  };
}

/**
 * WASM MediaPipe-a ide kroz naš keš (napredak, odustajanje, rad bez interneta
 * drugi put), pa se predaje kao `blob:` URL - loader ga traži preko `locateFile`.
 */
async function loadVisionFileset(options: LocalLoadOptions, track: ReturnType<typeof progressTracker>) {
  const vision = await importVision();
  const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
  const expectedBytes = CREA_LOCAL_RUNTIMES["mediapipe-vision"].files?.[fileset.wasmBinaryPath];
  const wasm = await fetchModelFile(fileset.wasmBinaryPath, {
    signal: options.signal,
    expectedBytes,
    onProgress: track("wasm", { loaded: 0, total: expectedBytes ?? null }),
  });
  return {
    ...fileset,
    wasmBinaryPath: URL.createObjectURL(new Blob([wasm], { type: "application/wasm" })),
  };
}

/**
 * Detektor lica (BlazeFace short range, ~0,2 MB) - „Proveri fotku" (S35), a
 * kasnije pametan isečak (S30) i reframe (V15). Pravi se jednom po strani.
 */
export async function loadFaceDetector(options: LocalLoadOptions = {}): Promise<FaceDetector> {
  if (faceDetector) return faceDetector;
  const track = progressTracker(options.onProgress);
  const spec = CREA_LOCAL_MODELS["mp-face-detector"];
  const modelUrl = modelFileUrl("mp-face-detector");
  if (!modelUrl) throw new CreaLocalAiError("MODEL_LOAD_FAILED");

  const attempt = (async () => {
    const vision = await importVision();
    visionFileset ??= loadVisionFileset(options, track);
    const [fileset, model] = await Promise.all([
      visionFileset,
      fetchModelFile(modelUrl, {
        signal: options.signal,
        expectedBytes: spec.bytes,
        onProgress: track("model", { loaded: 0, total: spec.bytes }),
      }),
    ]);
    if (options.signal?.aborted) throw new CreaLocalAiError("ABORTED");
    try {
      return await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: new Uint8Array(await model.arrayBuffer()), delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    } catch (error) {
      throw new CreaLocalAiError("MODEL_LOAD_FAILED", error);
    }
  })();

  faceDetector = attempt;
  try {
    return await attempt;
  } catch (error) {
    // Prekinuto ili palo: sledeći pokušaj kreće ispočetka (keš čuva ono što je stiglo celo).
    faceDetector = null;
    visionFileset = null;
    throw toLocalAiError(error, "MODEL_LOAD_FAILED");
  }
}

// ── Tekst sa slike (S32, K09) ────────────────────────────────────────────────

/** Jezik Tesseract-a → model u registru (zbog veličine preuzimanja). */
const OCR_LANGUAGE_MODELS = { srp: "tess-srp", srp_latn: "tess-srp-latn" } as const;
export type OcrLanguage = keyof typeof OCR_LANGUAGE_MODELS;

let ocr: { key: string; worker: Promise<TesseractWorker> } | null = null;
/** Kome Tesseract javlja napredak (logger se zadaje jednom, pri pravljenju workera). */
let ocrProgress: ((status: string, progress: number) => void) | null = null;

/** Ugasi Tesseract worker - jedini način da se prekine prepoznavanje koje traje. */
export function terminateOcrWorker() {
  const current = ocr;
  ocr = null;
  void current?.worker.then((worker) => worker.terminate()).catch(() => undefined);
}

/**
 * Tesseract worker za izabrana pisma (`srp` ćirilica, `srp_latn` latinica).
 * tesseract.js sam preuzima worker, WASM jezgro i jezike sa jsdelivr-a i čuva
 * jezike u IndexedDB-u, pa drugi put radi bez interneta. Worker se pravi jednom
 * po kombinaciji jezika i ostaje za sledeću sliku.
 */
export async function loadOcrWorker(languages: readonly OcrLanguage[], options: LocalLoadOptions = {}): Promise<TesseractWorker> {
  const key = languages.join("+");
  const coreBytes = CREA_LOCAL_RUNTIMES.tesseract.bytes;
  const langBytes = languages.reduce((sum, lang) => sum + CREA_LOCAL_MODELS[OCR_LANGUAGE_MODELS[lang]].bytes, 0);
  let core = 0;
  let langs = 0;
  ocrProgress = (status, progress) => {
    if (status === "loading tesseract core") core = progress;
    else if (status === "loading language traineddata") langs = progress;
    else return;
    options.onProgress?.(
      aggregateProgress([
        { loaded: Math.round(core * coreBytes), total: coreBytes },
        { loaded: Math.round(langs * langBytes), total: langBytes },
      ]),
    );
  };

  if (ocr?.key !== key) {
    terminateOcrWorker();
    // tesseract.js je CommonJS: imenovani izvozi su na `default` kad ih bundler ne razdvoji.
    const worker = import("tesseract.js").then((module) => {
      const { createWorker, OEM } = "createWorker" in module ? module : (module as { default: typeof module }).default;
      return createWorker([...languages], OEM.LSTM_ONLY, {
        logger: (message) => ocrProgress?.(message.status, message.progress),
        errorHandler: () => undefined,
      });
    });
    ocr = { key, worker };
  }

  const pending = ocr!;
  const onAbort = () => terminateOcrWorker();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const worker = await pending.worker;
    if (options.signal?.aborted) throw new CreaLocalAiError("ABORTED");
    return worker;
  } catch (error) {
    if (ocr === pending) ocr = null;
    throw toLocalAiError(error, options.signal?.aborted ? "ABORTED" : "MODEL_LOAD_FAILED");
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}

// ── Dubina fotke (S33, K10) ─────────────────────────────────────────────────

type OrtModule = typeof import("onnxruntime-web/wasm");
export type DepthSession = { ort: OrtModule; session: import("onnxruntime-web/wasm").InferenceSession };

let depthSession: Promise<DepthSession> | null = null;

/**
 * Depth Anything V2 Small (Apache-2.0, ~27 MB, kvantizovan) na ONNX Runtime
 * WASM-u, jedna nit (bez COOP/COEP, K01-5). I WASM runtime-a i model idu kroz
 * naš keš (napredak, odustajanje, drugi put bez interneta), pa se ORT-u daje
 * gotov bajt-niz (`wasmBinary`) - ne vuče ništa sam. Sesija se pravi jednom po strani.
 */
export async function loadDepthSession(options: LocalLoadOptions = {}): Promise<DepthSession> {
  if (depthSession) return depthSession;
  const track = progressTracker(options.onProgress);
  const spec = CREA_LOCAL_MODELS["depth-anything-v2-small"];
  const modelUrl = modelFileUrl("depth-anything-v2-small");
  if (!modelUrl) throw new CreaLocalAiError("MODEL_LOAD_FAILED");

  const attempt = (async () => {
    const [ort, wasm, model] = await Promise.all([
      import("onnxruntime-web/wasm").catch((error: unknown) => {
        throw toLocalAiError(error, "MODEL_LOAD_FAILED");
      }),
      fetchModelFile(ORT_WASM_URL, {
        signal: options.signal,
        expectedBytes: CREA_LOCAL_RUNTIMES.onnx.bytes,
        onProgress: track("wasm", { loaded: 0, total: CREA_LOCAL_RUNTIMES.onnx.bytes }),
      }),
      fetchModelFile(modelUrl, {
        signal: options.signal,
        expectedBytes: spec.bytes,
        onProgress: track("model", { loaded: 0, total: spec.bytes }),
      }),
    ]);
    if (options.signal?.aborted) throw new CreaLocalAiError("ABORTED");
    ort.env.wasm.wasmBinary = await wasm.arrayBuffer();
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    try {
      const session = await ort.InferenceSession.create(new Uint8Array(await model.arrayBuffer()), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      return { ort, session };
    } catch (error) {
      throw new CreaLocalAiError("MODEL_LOAD_FAILED", error);
    }
  })();

  depthSession = attempt;
  try {
    return await attempt;
  } catch (error) {
    depthSession = null;
    throw toLocalAiError(error, "MODEL_LOAD_FAILED");
  }
}

// ── Klikni i izaberi (S12, K11) ──────────────────────────────────────────────

/** Klik na predmet → maska poverenja 0..1 (veličine slike koja je data u `setImage`). */
export type ClickSegmenter = {
  setImage: (image: HTMLCanvasElement) => void;
  segmentAt: (x: number, y: number) => { confidence: Float32Array; width: number; height: number };
};

let clickSegmenter: Promise<ClickSegmenter> | null = null;
const BRUSH_POSITIVE = 1 as BrushMode;

/**
 * MediaPipe MagicTouch v2 (~30 MB): `setImage` jednom pokrene teški enkoder,
 * a svaki klik samo laki dekoder. Prima normalizovanu tačku (0..1). Pravi se
 * jednom po strani i deli WASM sa detektorom lica.
 */
export async function loadClickSegmenter(options: LocalLoadOptions = {}): Promise<ClickSegmenter> {
  if (clickSegmenter) return clickSegmenter;
  const track = progressTracker(options.onProgress);
  const spec = CREA_LOCAL_MODELS["mp-interactive-segmenter"];
  const modelUrl = modelFileUrl("mp-interactive-segmenter");
  if (!modelUrl) throw new CreaLocalAiError("MODEL_LOAD_FAILED");

  const attempt = (async (): Promise<ClickSegmenter> => {
    const vision = await importVision();
    visionFileset ??= loadVisionFileset(options, track);
    const [fileset, model] = await Promise.all([
      visionFileset,
      fetchModelFile(modelUrl, {
        signal: options.signal,
        expectedBytes: spec.bytes,
        onProgress: track("model", { loaded: 0, total: spec.bytes }),
      }),
    ]);
    if (options.signal?.aborted) throw new CreaLocalAiError("ABORTED");
    let segmenter: InteractiveSegmenter;
    try {
      segmenter = await vision.InteractiveSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: new Uint8Array(await model.arrayBuffer()), delegate: "CPU" },
      });
    } catch (error) {
      throw new CreaLocalAiError("MODEL_LOAD_FAILED", error);
    }
    return {
      setImage: (image) => segmenter.setImage(image),
      segmentAt: (x, y) => {
        // `BrushMode` postoji samo kao tip (paket ga ne izvozi u JS-u); 1 = POSITIVE.
        const mask = segmenter.segment([{ brushMode: BRUSH_POSITIVE, point: [{ x, y }], isCompleted: true }]);
        try {
          return { confidence: new Float32Array(mask.getAsFloat32Array()), width: mask.width, height: mask.height };
        } finally {
          mask.close();
        }
      },
    };
  })();

  clickSegmenter = attempt;
  try {
    return await attempt;
  } catch (error) {
    clickSegmenter = null;
    visionFileset = null;
    throw toLocalAiError(error, "MODEL_LOAD_FAILED");
  }
}

// ── ONNX modeli za izmene (K11: MI-GAN, MODNet, Swin2SR) ─────────────────────

type OrtWebgpuModule = typeof import("onnxruntime-web/webgpu");
export type OnnxBackend = "wasm" | "webgpu";
export type OnnxModel = {
  ort: OrtModule | OrtWebgpuModule;
  session: import("onnxruntime-web/wasm").InferenceSession;
  backend: OnnxBackend;
};

const onnxModels = new Map<string, Promise<OnnxModel>>();

/**
 * Jedan ONNX model na ONNX Runtime-u, jednom po strani i po pozadini. WASM i
 * model idu kroz naš keš (napredak, odustajanje, drugi put bez interneta), pa se
 * ORT-u daje gotov bajt-niz (`wasmBinary`) - ne vuče ništa sam. Jedna nit, bez
 * COOP/COEP (K01-5).
 *
 * `webgpu`: `onnxruntime-web/webgpu` sa „asyncify" WASM-om i WebGPU izvršiocem
 * (Swin2SR na računaru sa WebGPU-om). Depth Anything (K10) ostaje na
 * svom `loadDepthSession`.
 */
export async function loadOnnxModel(
  id: CreaLocalModelId,
  backend: OnnxBackend,
  options: LocalLoadOptions = {},
): Promise<OnnxModel> {
  const key = `${id}:${backend}`;
  const existing = onnxModels.get(key);
  if (existing) return existing;
  const track = progressTracker(options.onProgress);
  const spec = CREA_LOCAL_MODELS[id];
  const modelUrl = modelFileUrl(id);
  if (!modelUrl) throw new CreaLocalAiError("MODEL_LOAD_FAILED");
  const runtime = backend === "webgpu" ? CREA_LOCAL_RUNTIMES["onnx-webgpu"] : CREA_LOCAL_RUNTIMES.onnx;
  const wasmUrl = backend === "webgpu" ? ORT_WEBGPU_WASM_URL : ORT_WASM_URL;

  const attempt = (async (): Promise<OnnxModel> => {
    const [ort, wasm, model] = await Promise.all([
      (backend === "webgpu" ? import("onnxruntime-web/webgpu") : import("onnxruntime-web/wasm")).catch((error: unknown) => {
        throw toLocalAiError(error, "MODEL_LOAD_FAILED");
      }),
      fetchModelFile(wasmUrl, {
        signal: options.signal,
        expectedBytes: runtime.bytes,
        onProgress: track("wasm", { loaded: 0, total: runtime.bytes }),
      }),
      fetchModelFile(modelUrl, {
        signal: options.signal,
        expectedBytes: spec.bytes,
        onProgress: track("model", { loaded: 0, total: spec.bytes }),
      }),
    ]);
    if (options.signal?.aborted) throw new CreaLocalAiError("ABORTED");
    ort.env.wasm.wasmBinary = await wasm.arrayBuffer();
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    try {
      const session = await ort.InferenceSession.create(new Uint8Array(await model.arrayBuffer()), {
        executionProviders: [backend],
        graphOptimizationLevel: "all",
      });
      return { ort, session, backend };
    } catch (error) {
      throw new CreaLocalAiError(backend === "webgpu" ? "UNSUPPORTED" : "MODEL_LOAD_FAILED", error);
    }
  })();

  onnxModels.set(key, attempt);
  try {
    return await attempt;
  } catch (error) {
    onnxModels.delete(key);
    throw toLocalAiError(error, "MODEL_LOAD_FAILED");
  }
}
