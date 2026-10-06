/**
 * Registar lokalnih modela (K04): samo dozvoljene licence, nijedan zabranjen
 * model iz plana §6, telefonski modeli u budžetu, i WASM verzija MediaPipe-a
 * zakucana na paket koji je stvarno instaliran.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { deviceClassRank, MODEL_BUDGET_BYTES } from "../crea-device";
import { CREA_TOOLS } from "../crea-tools";
import {
  CDN_CODE_SHA256,
  CREA_ALLOWED_MODEL_LICENSES,
  CREA_LOCAL_MODELS,
  CREA_LOCAL_RUNTIMES,
  downloadBytes,
  MEDIAPIPE_LOADER_BYTES,
  MEDIAPIPE_VISION_VERSION,
  MEDIAPIPE_WASM_BASE,
  FLORENCE_FILES,
  modelFileUrl,
  modelFileUrls,
  modelRuntime,
  NOISE_SUPPRESSOR_BASE,
  NOISE_SUPPRESSOR_VERSION,
  ONNX_RUNTIME_WEB_VERSION,
  SIGNALSMITH_STRETCH,
  ORT_WASM_URL,
  ORT_WEBGPU_WASM_URL,
  modelWeightBytes,
  type CreaLocalModelId,
} from "./models";

const ENTRIES = Object.entries(CREA_LOCAL_MODELS) as Array<
  [CreaLocalModelId, (typeof CREA_LOCAL_MODELS)[CreaLocalModelId]]
>;

/** Plan §6 - nekomercijalne ili zabranjene težine. Poređenje po repo/URL-u, bez obzira na veličinu slova. */
const FORBIDDEN = [
  "rmbg",
  "bria",
  "codeformer",
  "gfpgan",
  "depth-anything-v2-base",
  "depth-anything-v2-large",
  "jina-clip",
  "fastvlm",
  "mobileclip",
  "depth-pro",
  "mms-tts",
  "piper",
  "sr_rs",
];

describe("registar lokalnih modela", () => {
  test("samo Apache-2.0 i MIT, i za modele i za runtime-e", () => {
    for (const [id, spec] of ENTRIES) expect(CREA_ALLOWED_MODEL_LICENSES, id).toContain(spec.license);
    for (const [id, runtime] of Object.entries(CREA_LOCAL_RUNTIMES)) {
      expect(CREA_ALLOWED_MODEL_LICENSES, id).toContain(runtime.license);
    }
  });

  test("nijedan model sa zabranjene liste (§6)", () => {
    for (const [id, spec] of ENTRIES) {
      const where = (spec.source.host === "huggingface" ? spec.source.repo : spec.source.url).toLowerCase();
      for (const word of FORBIDDEN) expect(where, id).not.toContain(word);
    }
  });

  test("model staje u budžet svoje klase; teški nikad nisu za telefon", () => {
    for (const [id, spec] of ENTRIES) {
      expect(spec.bytes, id).toBeGreaterThan(0);
      expect(spec.bytes, id).toBeLessThanOrEqual(MODEL_BUDGET_BYTES[spec.minClass]);
      if (spec.bytes > MODEL_BUDGET_BYTES.phone) {
        expect(deviceClassRank(spec.minClass), id).toBeGreaterThan(deviceClassRank("phone"));
      }
    }
  });

  test("model alata koji radi ima zakucan izvor (bez „latest\", HF sa revizijom)", () => {
    const used = new Set(CREA_TOOLS.filter((tool) => tool.status === "ready").flatMap((tool) => tool.localModels ?? []));
    expect(used.size).toBeGreaterThan(0);
    for (const id of used) {
      const source = CREA_LOCAL_MODELS[id].source;
      if (source.host === "huggingface") {
        expect("revision" in source ? source.revision : undefined, id).toMatch(/^[0-9a-f]{40}$/);
      } else {
        expect(source.url, id).toMatch(/^https:\/\//);
        expect(source.url, id).not.toMatch(/\/latest\//);
      }
    }
  });

  test("MediaPipe WASM sa CDN-a je ista verzija kao instaliran paket", () => {
    const pkg = JSON.parse(readFileSync("node_modules/@mediapipe/tasks-vision/package.json", "utf8")) as {
      version: string;
    };
    expect(pkg.version).toBe(MEDIAPIPE_VISION_VERSION);
    expect(MEDIAPIPE_WASM_BASE).toBe(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${pkg.version}/wasm`);
  });

  test("ONNX Runtime WASM sa CDN-a je ista verzija kao instaliran paket (K10)", () => {
    const pkg = JSON.parse(readFileSync("node_modules/onnxruntime-web/package.json", "utf8")) as { version: string };
    expect(pkg.version).toBe(ONNX_RUNTIME_WEB_VERSION);
    expect(ORT_WASM_URL).toBe(`https://cdn.jsdelivr.net/npm/onnxruntime-web@${pkg.version}/dist/ort-wasm-simd-threaded.wasm`);
    expect(Object.keys(CREA_LOCAL_RUNTIMES.onnx.files ?? {})).toEqual([ORT_WASM_URL]);
  });

  test("K24: zvučni modeli i biblioteke sa CDN-a su zakucani na verziju", () => {
    expect(NOISE_SUPPRESSOR_BASE).toBe(`https://cdn.jsdelivr.net/npm/@sapphi-red/web-noise-suppressor@${NOISE_SUPPRESSOR_VERSION}/dist`);
    expect(CREA_LOCAL_MODELS.rnnoise.source.url).toBe(`${NOISE_SUPPRESSOR_BASE}/rnnoise_simd.wasm`);
    expect(CREA_LOCAL_MODELS.gtcrn.source.url).toBe(`${NOISE_SUPPRESSOR_BASE}/gtcrn.wasm`);
    expect(CREA_LOCAL_MODELS["silero-vad"].source.url).toMatch(/@ricky0123\/vad-web@\d+\.\d+\.\d+\/dist\/silero_vad_v5\.onnx$/);
    // Silero radi na istom ONNX Runtime WASM-u kao ostali modeli.
    expect(modelRuntime("silero-vad")).toBe("onnx");
    expect(downloadBytes(["silero-vad"])).toBe(CREA_LOCAL_MODELS["silero-vad"].bytes + CREA_LOCAL_RUNTIMES.onnx.bytes);
    // Čišćenje: samo WASM modela (stotine KB), bez teškog runtime-a.
    expect(downloadBytes(["rnnoise", "gtcrn"])).toBeLessThan(500 * 1024);
    expect(SIGNALSMITH_STRETCH.url).toBe(`https://cdn.jsdelivr.net/npm/signalsmith-stretch@${SIGNALSMITH_STRETCH.version}/SignalsmithStretch.mjs`);
    expect(SIGNALSMITH_STRETCH.license).toBe("MIT");
  });

  test("ONNX model na WebGPU-u preuzima „asyncify\" WASM umesto običnog (K11)", () => {
    expect(ORT_WEBGPU_WASM_URL).toBe(`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_WEB_VERSION}/dist/ort-wasm-simd-threaded.asyncify.wasm`);
    expect(Object.keys(CREA_LOCAL_RUNTIMES["onnx-webgpu"].files ?? {})).toEqual([ORT_WEBGPU_WASM_URL]);
    expect(modelRuntime("swin2sr-x2")).toBe("onnx");
    expect(modelRuntime("swin2sr-x2", { webgpu: true })).toBe("onnx-webgpu");
    expect(modelRuntime("mp-face-detector", { webgpu: true })).toBe("mediapipe-vision");
    const swin = CREA_LOCAL_MODELS["swin2sr-x2"].bytes;
    expect(downloadBytes(["swin2sr-x2"])).toBe(swin + CREA_LOCAL_RUNTIMES.onnx.bytes);
    expect(downloadBytes(["swin2sr-x2"], { webgpu: true })).toBe(swin + CREA_LOCAL_RUNTIMES["onnx-webgpu"].bytes);
    // BiRefNet (fp16) postoji samo na WebGPU-u.
    expect(downloadBytes(["birefnet-lite"])).toBe(CREA_LOCAL_MODELS["birefnet-lite"].bytes + CREA_LOCAL_RUNTIMES["onnx-webgpu"].bytes);
  });

  test("veličina preuzimanja = težine + svaki runtime jednom", () => {
    const face = CREA_LOCAL_MODELS["mp-face-detector"].bytes;
    const runtime = CREA_LOCAL_RUNTIMES["mediapipe-vision"].bytes;
    expect(modelWeightBytes(["mp-face-detector"])).toBe(face);
    expect(downloadBytes(["mp-face-detector"])).toBe(face + runtime);
    expect(downloadBytes(["mp-face-detector", "mp-selfie-segmenter"])).toBe(
      face + CREA_LOCAL_MODELS["mp-selfie-segmenter"].bytes + runtime,
    );
    expect(downloadBytes([])).toBe(0);
    // Provera fotke na telefonu ne traži potvrdu (< 15 MB).
    expect(downloadBytes(["mp-face-detector"])).toBeLessThan(15 * 1024 * 1024);
  });

  test("URL fajla postoji za CDN izvore", () => {
    expect(modelFileUrl("mp-face-detector")).toMatch(/blaze_face_short_range\.tflite$/);
    // HF bez zakucane revizije (model alata koji još ne radi) nema adresu.
    expect(modelFileUrl("florence-2-base")).toBeNull();
    // HF samo sa zakucanom revizijom (K10, 3D foto).
    expect(modelFileUrl("depth-anything-v2-small")).toBe(
      "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_quantized.onnx",
    );
  });
});

describe("fajlovi modela (K16)", () => {
  test("model od više fajlova (Florence-2) ima adresu svakog fajla na zakucanoj reviziji", () => {
    const urls = modelFileUrls("florence-2-base");
    expect(urls).toHaveLength(FLORENCE_FILES.length);
    for (const url of urls) expect(url).toMatch(/^https:\/\/huggingface\.co\/onnx-community\/Florence-2-base-ft\/resolve\/[0-9a-f]{40}\//);
    expect(CREA_LOCAL_MODELS["florence-2-base"].bytes).toBe(FLORENCE_FILES.reduce((sum, file) => sum + file.bytes, 0));
    expect(modelFileUrls("clip-vit-b32")).toEqual([modelFileUrl("clip-vit-b32")]);
  });
});

describe("otisak izvršnog koda sa CDN-a (K30, nalaz K29-04)", () => {
  const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("base64");

  test("WASM i loader instaliranih paketa imaju isti otisak kao fajl u `node_modules`", () => {
    const local: Record<string, string> = {
      [`${MEDIAPIPE_WASM_BASE}/vision_wasm_internal.wasm`]: "node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm",
      [`${MEDIAPIPE_WASM_BASE}/vision_wasm_nosimd_internal.wasm`]: "node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm",
      [`${MEDIAPIPE_WASM_BASE}/vision_wasm_internal.js`]: "node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js",
      [`${MEDIAPIPE_WASM_BASE}/vision_wasm_nosimd_internal.js`]: "node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js",
      [ORT_WASM_URL]: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
      [ORT_WEBGPU_WASM_URL]: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm",
    };
    for (const [url, path] of Object.entries(local)) expect(CDN_CODE_SHA256[url], url).toBe(sha256(path));
    for (const [url, bytes] of Object.entries(MEDIAPIPE_LOADER_BYTES)) {
      expect(readFileSync(local[url]!).byteLength, url).toBe(bytes);
    }
  });

  test("svaki JS/WASM koji alati vuku sa CDN-a ima otisak", () => {
    const code = [
      ...Object.values(CREA_LOCAL_RUNTIMES).flatMap((runtime) => Object.keys(runtime.files ?? {})),
      ...Object.keys(MEDIAPIPE_LOADER_BYTES),
      SIGNALSMITH_STRETCH.url,
      CREA_LOCAL_MODELS.rnnoise.source.url,
      CREA_LOCAL_MODELS.gtcrn.source.url,
      `${NOISE_SUPPRESSOR_BASE}/rnnoise.wasm`,
      `${NOISE_SUPPRESSOR_BASE}/rnnoise/workletProcessor.js`,
      `${NOISE_SUPPRESSOR_BASE}/gtcrn/workletProcessor.js`,
    ];
    for (const url of code) expect(CDN_CODE_SHA256[url], url).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});
