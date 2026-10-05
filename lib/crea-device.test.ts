/**
 * Odluka „može / ne može / samo mali model" (K04, U15). Glavna tvrdnja
 * prihvatanja: na uređaju bez WebGPU-a teški modeli se ne nude, a razlog je
 * jedan od poznatih kodova za koje `lib/crea-copy.ts` ima srpsku rečenicu.
 */

import { describe, expect, test } from "vitest";

import { CREA_DEVICE_COPY } from "./crea-copy";
import {
  classifyDevice,
  CONFIRM_DOWNLOAD_ABOVE_BYTES,
  detectCreaDeviceCaps,
  deviceProblem,
  needsDownloadConfirm,
  toolAvailability,
  type CreaDeviceCaps,
  type CreaUnavailableReason,
} from "./crea-device";
import { CREA_TOOLS, toolById, type CreaTool } from "./crea-tools";

const DESKTOP_GPU: CreaDeviceCaps = {
  mobile: false,
  deviceMemoryGb: 8,
  cores: 8,
  webgpu: true,
  webgpuF16: true,
  webcodecsVideo: true,
  webcodecsAudio: true,
  wasmSimd: true,
  webgl2: true,
  audioWorklet: true,
  mediaRecorder: true,
  offscreenCanvas: true,
  webSpeech: true,
  crossOriginIsolated: false,
  saveData: false,
};
const DESKTOP_NO_GPU: CreaDeviceCaps = { ...DESKTOP_GPU, webgpu: false, webgpuF16: false };
const PHONE: CreaDeviceCaps = { ...DESKTOP_GPU, mobile: true, deviceMemoryGb: 4, cores: 8, webgpu: false };
const WEAK: CreaDeviceCaps = { ...PHONE, deviceMemoryGb: 2 };
// Safari na iPhone-u: nema `deviceMemory`, nema WebCodecs enkoder za video u starijim verzijama.
const OLD_SAFARI: CreaDeviceCaps = { ...PHONE, deviceMemoryGb: null, webcodecsVideo: false };

function soonAsReady(id: string): CreaTool {
  const tool = toolById(id);
  if (!tool) throw new Error(id);
  return { ...tool, status: "ready" };
}

describe("klasa uređaja", () => {
  test("slab, telefon, računar, računar sa WebGPU-om", () => {
    expect(classifyDevice(DESKTOP_GPU)).toBe("desktop-gpu");
    expect(classifyDevice(DESKTOP_NO_GPU)).toBe("desktop");
    expect(classifyDevice(PHONE)).toBe("phone");
    // Telefon sa WebGPU-om (noviji Android) i dalje je telefon: veliki modeli samo na računaru.
    expect(classifyDevice({ ...PHONE, webgpu: true })).toBe("phone");
    expect(classifyDevice(WEAK)).toBe("weak");
    expect(classifyDevice({ ...DESKTOP_GPU, cores: 2 })).toBe("weak");
    // Bez podatka o memoriji (Safari/Firefox) ne kažnjavamo uređaj.
    expect(classifyDevice({ ...DESKTOP_NO_GPU, deviceMemoryGb: null, cores: null })).toBe("desktop");
  });
});

describe("dostupnost alata", () => {
  test("oba alata iz K04 rade svuda, i na slabom telefonu", () => {
    for (const id of ["slika.format", "slika.provera"]) {
      for (const caps of [DESKTOP_GPU, DESKTOP_NO_GPU, PHONE, WEAK, OLD_SAFARI]) {
        expect(toolAvailability(toolById(id)!, caps), id).toEqual({ ok: true, variant: "full" });
      }
    }
  });

  test("bez WebGPU-a teški modeli se ne nude (prihvatanje K04)", () => {
    const heavy = CREA_TOOLS.filter((tool) => tool.device.minClass === "desktop-gpu");
    expect(heavy.length).toBeGreaterThan(0);
    for (const tool of heavy) {
      const ready = { ...tool, status: "ready" as const };
      expect(toolAvailability(ready, DESKTOP_GPU).ok, tool.id).toBe(true);
      const onDesktop = toolAvailability(ready, DESKTOP_NO_GPU);
      // Izuzeci: alat sa malom varijantom (MODNet umesto BiRefNet-a) i alat sa putem u
      // oblaku (K16, „Kako je ovo napravljeno?" - opis za 0 kredita bez lokalnog modela).
      if (tool.device.smallVariantFrom) {
        expect(onDesktop, tool.id).toEqual({ ok: true, variant: "small" });
      } else if (tool.cloudFallback) {
        expect(onDesktop, tool.id).toEqual({ ok: true, variant: "cloud" });
      } else {
        expect(onDesktop, tool.id).toEqual({ ok: false, reason: "needs-webgpu" });
      }
    }
  });

  test("telefon dobija malu varijantu ili jasan razlog", () => {
    // Mala varijanta (`smallVariantFrom`): alat koji je samo za računar sa WebGPU-om, ali ima lakši model.
    expect(deviceProblem({ ...soonAsReady("slika.opis"), device: { minClass: "desktop-gpu", smallVariantFrom: "phone" } }, PHONE)).toEqual({
      ok: true,
      variant: "small",
    });
    expect(deviceProblem(soonAsReady("slika.pozadina"), PHONE)).toEqual({ ok: true, variant: "full" });
    // K11: MI-GAN (28 MB) staje u budžet telefona; slab uređaj dobija razlog.
    expect(deviceProblem(soonAsReady("slika.obrisi"), PHONE)).toEqual({ ok: true, variant: "full" });
    expect(deviceProblem(soonAsReady("slika.obrisi"), WEAK)).toEqual({ ok: false, reason: "weak-device" });
    expect(deviceProblem(soonAsReady("slika.3d-foto"), PHONE)).toEqual({ ok: false, reason: "too-heavy-for-phone" });
    expect(deviceProblem(soonAsReady("slika.uvecaj"), PHONE)).toEqual({ ok: true, variant: "full" });
    expect(deviceProblem(soonAsReady("slika.uvecaj"), WEAK)).toEqual({ ok: false, reason: "weak-device" });
  });

  test("nedostaje sposobnost browsera", () => {
    expect(deviceProblem(soonAsReady("video.poslednji-kadar"), OLD_SAFARI)).toEqual({
      ok: false,
      reason: "needs-webcodecs",
    });
    expect(deviceProblem(soonAsReady("slika.boje"), { ...DESKTOP_GPU, webgl2: false })).toEqual({
      ok: false,
      reason: "missing-capability",
    });
    expect(deviceProblem(soonAsReady("zvuk.transkript"), { ...DESKTOP_GPU, webgpu: false })).toEqual({
      ok: false,
      reason: "needs-webgpu",
    });
  });

  test("status ima prednost nad uređajem; plaćeni alat ne zavisi od uređaja", () => {
    // K16: `slika.opis` je gotov, pa je primer „uskoro" alat iz videa.
    expect(toolAvailability(toolById("video.reframe")!, DESKTOP_GPU)).toEqual({ ok: false, reason: "soon" });
    expect(toolAvailability(soonAsReady("slika.prosiri"), WEAK)).toEqual({ ok: true, variant: "full" });
    expect(toolAvailability({ ...toolById("slika.format")!, tier: "server" }, DESKTOP_GPU)).toEqual({
      ok: false,
      reason: "server-off",
    });
  });

  test("svaki razlog ima rečenicu na srpskom i engleskom", () => {
    const reasons: CreaUnavailableReason[] = [
      "soon",
      "server-off",
      "needs-webgpu",
      "needs-webcodecs",
      "missing-capability",
      "too-heavy-for-phone",
      "weak-device",
    ];
    for (const reason of reasons) {
      expect(CREA_DEVICE_COPY.reasons[reason].sr.trim(), reason).not.toBe("");
      expect(CREA_DEVICE_COPY.reasons[reason].en.trim(), reason).not.toBe("");
    }
    expect(CREA_DEVICE_COPY.reasons["needs-webgpu"].sr).toMatch(/WebGPU/);
  });
});

describe("potvrda preuzimanja", () => {
  test("telefon pita iznad 15 MB, računar iznad 50 MB, ušteda podataka uvek", () => {
    const MB = 1024 * 1024;
    expect(needsDownloadConfirm(13 * MB, PHONE)).toBe(false);
    expect(needsDownloadConfirm(CONFIRM_DOWNLOAD_ABOVE_BYTES.mobile + 1, PHONE)).toBe(true);
    expect(needsDownloadConfirm(40 * MB, DESKTOP_GPU)).toBe(false);
    expect(needsDownloadConfirm(CONFIRM_DOWNLOAD_ABOVE_BYTES.desktop + 1, DESKTOP_GPU)).toBe(true);
    expect(needsDownloadConfirm(1, { ...DESKTOP_GPU, saveData: true })).toBe(true);
    expect(needsDownloadConfirm(0, { ...DESKTOP_GPU, saveData: true })).toBe(false);
  });
});

describe("detekcija iz browsera", () => {
  test("pun računar sa WebGPU-om", async () => {
    const fn = function () {};
    const caps = await detectCreaDeviceCaps({
      navigator: {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0",
        hardwareConcurrency: 12,
        deviceMemory: 8,
        gpu: { requestAdapter: async () => ({ features: { has: (name: string) => name === "shader-f16" } }) },
      },
      WebAssembly,
      VideoEncoder: fn,
      VideoDecoder: fn,
      AudioEncoder: fn,
      AudioDecoder: fn,
      WebGL2RenderingContext: fn,
      AudioWorkletNode: fn,
      MediaRecorder: fn,
      OffscreenCanvas: fn,
      webkitSpeechRecognition: fn,
      crossOriginIsolated: false,
    });
    expect(caps).toMatchObject({
      mobile: false,
      deviceMemoryGb: 8,
      cores: 12,
      webgpu: true,
      webgpuF16: true,
      webcodecsVideo: true,
      webcodecsAudio: true,
      wasmSimd: true,
      webgl2: true,
      webSpeech: true,
      saveData: false,
    });
    expect(classifyDevice(caps)).toBe("desktop-gpu");
  });

  test("iPhone bez WebGPU-a i bez deviceMemory; iPad se predstavlja kao Mac", async () => {
    const iphone = await detectCreaDeviceCaps({
      navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", hardwareConcurrency: 6 },
    });
    expect(iphone).toMatchObject({ mobile: true, deviceMemoryGb: null, webgpu: false, webcodecsVideo: false });
    expect(classifyDevice(iphone)).toBe("phone");

    const ipad = await detectCreaDeviceCaps({
      navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 },
    });
    expect(ipad.mobile).toBe(true);
  });

  test("WebGPU adapter koji ne stigne ili pukne znači „nema WebGPU-a\"", async () => {
    const failing = await detectCreaDeviceCaps({
      navigator: { gpu: { requestAdapter: async () => Promise.reject(new Error("blocked")) } },
    });
    expect(failing.webgpu).toBe(false);
    const empty = await detectCreaDeviceCaps({ navigator: { gpu: { requestAdapter: async () => null } } });
    expect(empty.webgpu).toBe(false);
  });

  test("ušteda podataka i bez navigatora (server)", async () => {
    const saving = await detectCreaDeviceCaps({ navigator: { connection: { saveData: true } } });
    expect(saving.saveData).toBe(true);
    const bare = await detectCreaDeviceCaps({});
    expect(bare).toMatchObject({ mobile: false, deviceMemoryGb: null, cores: null, webgpu: false, wasmSimd: false });
  });
});
