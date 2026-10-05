import type { FaceDetector } from "@mediapipe/tasks-vision";

import { fetchModelFile } from "./cache";
import { CreaLocalAiError, toLocalAiError } from "./errors";
import { CREA_LOCAL_MODELS, CREA_LOCAL_RUNTIMES, MEDIAPIPE_WASM_BASE, modelFileUrl } from "./models";
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
