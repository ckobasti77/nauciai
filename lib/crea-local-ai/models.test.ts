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
    expect(modelFileUrl("birefnet-lite")).toBeNull();
  });
});
