/**
 * Registar lokalnih modela (K04): samo dozvoljene licence, nijedan zabranjen
 * model iz plana §6, telefonski modeli u budžetu, i WASM verzija MediaPipe-a
 * zakucana na paket koji je stvarno instaliran.
 */

import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { deviceClassRank, MODEL_BUDGET_BYTES } from "../crea-device";
import { CREA_TOOLS } from "../crea-tools";
import {
  CREA_ALLOWED_MODEL_LICENSES,
  CREA_LOCAL_MODELS,
  CREA_LOCAL_RUNTIMES,
  downloadBytes,
  MEDIAPIPE_VISION_VERSION,
  MEDIAPIPE_WASM_BASE,
  modelFileUrl,
  modelRuntime,
  ONNX_RUNTIME_WEB_VERSION,
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
