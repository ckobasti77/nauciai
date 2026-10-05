import type { CreaTool } from "./crea-tools";

/**
 * Šta ovaj uređaj ume (K04, plan K01 §3.2, U15). Odluka „može / ne može / samo
 * mali model" je čista funkcija nad opisom uređaja, pa se testira bez browsera;
 * browser se dira samo u `detectCreaDeviceCaps`.
 *
 * Klase, od najslabije:
 * - `weak`        malo memorije ili ≤ 2 jezgra - samo sitni modeli;
 * - `phone`       telefon/tablet - modeli do ~30 MB (plan §4.4);
 * - `desktop`     računar bez WebGPU-a - srednji modeli na WASM-u;
 * - `desktop-gpu` računar sa WebGPU-om - i veliki modeli.
 */

export const CREA_DEVICE_CLASSES = ["weak", "phone", "desktop", "desktop-gpu"] as const;
export type CreaDeviceClass = (typeof CREA_DEVICE_CLASSES)[number];

export type CreaCapability =
  | "webgpu"
  | "webcodecs-video"
  | "webcodecs-audio"
  | "wasm-simd"
  | "webgl2"
  | "audio-worklet"
  | "media-recorder"
  | "offscreen-canvas"
  | "web-speech";

export type CreaDeviceCaps = {
  mobile: boolean;
  /** `navigator.deviceMemory` (GB). Safari i Firefox ga nemaju → `null`. */
  deviceMemoryGb: number | null;
  cores: number | null;
  webgpu: boolean;
  webgpuF16: boolean;
  webcodecsVideo: boolean;
  webcodecsAudio: boolean;
  wasmSimd: boolean;
  webgl2: boolean;
  audioWorklet: boolean;
  mediaRecorder: boolean;
  offscreenCanvas: boolean;
  webSpeech: boolean;
  crossOriginIsolated: boolean;
  saveData: boolean;
};

const MB = 1024 * 1024;

/**
 * Koliko TEŽINA modela sme da preuzme alat u punom obliku na datoj klasi.
 * Runtime (WASM) se ne računa - isti je za mali i veliki model.
 */
export const MODEL_BUDGET_BYTES: Record<CreaDeviceClass, number> = {
  weak: 8 * MB,
  phone: 30 * MB,
  desktop: 200 * MB,
  "desktop-gpu": 1024 * MB,
};

/** Iznad ovoga se pita pre preuzimanja (mobilni podaci se plaćaju). */
export const CONFIRM_DOWNLOAD_ABOVE_BYTES = { mobile: 15 * MB, desktop: 50 * MB } as const;

export function deviceClassRank(deviceClass: CreaDeviceClass): number {
  return CREA_DEVICE_CLASSES.indexOf(deviceClass);
}

export function classifyDevice(caps: CreaDeviceCaps): CreaDeviceClass {
  if ((caps.deviceMemoryGb !== null && caps.deviceMemoryGb < 3) || (caps.cores !== null && caps.cores <= 2)) {
    return "weak";
  }
  if (caps.mobile) return "phone";
  return caps.webgpu ? "desktop-gpu" : "desktop";
}

export function hasCapability(caps: CreaDeviceCaps, capability: CreaCapability): boolean {
  switch (capability) {
    case "webgpu":
      return caps.webgpu;
    case "webcodecs-video":
      return caps.webcodecsVideo;
    case "webcodecs-audio":
      return caps.webcodecsAudio;
    case "wasm-simd":
      return caps.wasmSimd;
    case "webgl2":
      return caps.webgl2;
    case "audio-worklet":
      return caps.audioWorklet;
    case "media-recorder":
      return caps.mediaRecorder;
    case "offscreen-canvas":
      return caps.offscreenCanvas;
    case "web-speech":
      return caps.webSpeech;
  }
}

export type CreaUnavailableReason =
  | "soon"
  | "server-off"
  | "needs-webgpu"
  | "needs-webcodecs"
  | "missing-capability"
  | "too-heavy-for-phone"
  | "weak-device";

export type CreaToolAvailability =
  | { ok: true; variant: "full" | "small" }
  | { ok: false; reason: CreaUnavailableReason };

/** Samo uređaj: da li bi alat radio ovde, nezavisno od toga da li je gotov. */
export function deviceProblem(tool: CreaTool, caps: CreaDeviceCaps): CreaToolAvailability {
  // Plaćeni alat radi kod provajdera; uređaju treba samo browser.
  if (tool.tier === "paid" || tool.tier === "server") return { ok: true, variant: "full" };

  for (const capability of tool.device.requires ?? []) {
    if (hasCapability(caps, capability)) continue;
    if (capability === "webgpu") return { ok: false, reason: "needs-webgpu" };
    if (capability === "webcodecs-video" || capability === "webcodecs-audio") {
      return { ok: false, reason: "needs-webcodecs" };
    }
    return { ok: false, reason: "missing-capability" };
  }

  const deviceClass = classifyDevice(caps);
  const rank = deviceClassRank(deviceClass);
  if (rank >= deviceClassRank(tool.device.minClass)) return { ok: true, variant: "full" };
  if (tool.device.smallVariantFrom && rank >= deviceClassRank(tool.device.smallVariantFrom)) {
    return { ok: true, variant: "small" };
  }
  if (deviceClass === "weak") return { ok: false, reason: "weak-device" };
  if (deviceClass === "phone") return { ok: false, reason: "too-heavy-for-phone" };
  // Računar bez WebGPU-a, a alat traži `desktop-gpu`.
  return { ok: false, reason: "needs-webgpu" };
}

/** Da li alat sme da se ponudi na ovom uređaju: prvo status, pa server, pa uređaj. */
export function toolAvailability(tool: CreaTool, caps: CreaDeviceCaps): CreaToolAvailability {
  if (tool.tier === "server") return { ok: false, reason: "server-off" };
  if (tool.status === "soon") return { ok: false, reason: "soon" };
  return deviceProblem(tool, caps);
}

/** Da li preuzimanje ove veličine traži potvrdu na ovom uređaju. */
export function needsDownloadConfirm(bytes: number, caps: CreaDeviceCaps): boolean {
  if (caps.saveData) return bytes > 0;
  return bytes > (caps.mobile ? CONFIRM_DOWNLOAD_ABOVE_BYTES.mobile : CONFIRM_DOWNLOAD_ABOVE_BYTES.desktop);
}

/**
 * Najmanji deo `globalThis`-a koji detekcija čita. Test podmeće svoj objekat;
 * browser daje pravi `globalThis`.
 */
export type CreaDeviceEnv = {
  navigator?: {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
    connection?: { saveData?: boolean };
    gpu?: { requestAdapter(): Promise<{ features?: { has(name: string): boolean } } | null> };
  };
  WebAssembly?: { validate(bytes: BufferSource): boolean };
  VideoEncoder?: unknown;
  VideoDecoder?: unknown;
  AudioEncoder?: unknown;
  AudioDecoder?: unknown;
  WebGL2RenderingContext?: unknown;
  AudioWorkletNode?: unknown;
  MediaRecorder?: unknown;
  OffscreenCanvas?: unknown;
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  crossOriginIsolated?: boolean;
};

/** Najmanji WASM modul sa jednom SIMD instrukcijom (`wasm-feature-detect`). */
const WASM_SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

const WEBGPU_TIMEOUT_MS = 1500;

function isMobile(nav: NonNullable<CreaDeviceEnv["navigator"]>): boolean {
  if (typeof nav.userAgentData?.mobile === "boolean" && nav.userAgentData.mobile) return true;
  const ua = nav.userAgent ?? "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS se predstavlja kao Mac; odaje ga ekran na dodir.
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

async function detectWebgpu(nav: NonNullable<CreaDeviceEnv["navigator"]>): Promise<{ webgpu: boolean; f16: boolean }> {
  if (!nav.gpu) return { webgpu: false, f16: false };
  try {
    const adapter = await Promise.race([
      nav.gpu.requestAdapter(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), WEBGPU_TIMEOUT_MS)),
    ]);
    if (!adapter) return { webgpu: false, f16: false };
    return { webgpu: true, f16: adapter.features?.has("shader-f16") === true };
  } catch {
    return { webgpu: false, f16: false };
  }
}

/** Jedini deo koji dira browser. Bez `navigator`-a (SSR) vraća najslabiji opis. */
export async function detectCreaDeviceCaps(env: CreaDeviceEnv = globalThis as unknown as CreaDeviceEnv): Promise<CreaDeviceCaps> {
  const nav = env.navigator ?? {};
  const { webgpu, f16 } = await detectWebgpu(nav);
  let wasmSimd = false;
  try {
    wasmSimd = env.WebAssembly?.validate(WASM_SIMD_PROBE) === true;
  } catch {
    wasmSimd = false;
  }

  return {
    mobile: isMobile(nav),
    deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : null,
    webgpu,
    webgpuF16: f16,
    webcodecsVideo: typeof env.VideoEncoder === "function" && typeof env.VideoDecoder === "function",
    webcodecsAudio: typeof env.AudioEncoder === "function" && typeof env.AudioDecoder === "function",
    wasmSimd,
    webgl2: typeof env.WebGL2RenderingContext === "function",
    audioWorklet: typeof env.AudioWorkletNode === "function",
    mediaRecorder: typeof env.MediaRecorder === "function",
    offscreenCanvas: typeof env.OffscreenCanvas === "function",
    webSpeech: typeof env.SpeechRecognition === "function" || typeof env.webkitSpeechRecognition === "function",
    crossOriginIsolated: env.crossOriginIsolated === true,
    saveData: nav.connection?.saveData === true,
  };
}
