/**
 * Izvoz za mreže (K19, V30) i granice uređaja (K17-4): veličina ≤ 190 MB na
 * najdužem dozvoljenom izvozu, parne stranice, granice po klasi, GIF granice,
 * sigurne zone u kadru, nivoi podrške bez WebCodecs-a.
 */
import { describe, expect, test } from "vitest";

import type { CreaDeviceCaps } from "./crea-device";
import {
  defaultPresetFor,
  EXPORT_PRESETS,
  EXPORT_PRESET_IDS,
  exportFileName,
  GIF_LIMITS,
  outputSize,
  PLATFORM_FACTS_CHECKED,
  presetById,
} from "./crea-export-presets";
import { TIMELINE_ASPECTS } from "./crea-timeline";
import {
  estimateBytes,
  even,
  EXPORT_LIMITS,
  EXPORT_MAX_BYTES,
  exportLimits,
  exportSize,
  maxDurationFor,
  pickVideoBitrate,
  videoSupport,
} from "./crea-video-caps";

const DESKTOP: CreaDeviceCaps = {
  mobile: false,
  deviceMemoryGb: 8,
  cores: 8,
  webgpu: false,
  webgpuF16: false,
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
const PHONE: CreaDeviceCaps = { ...DESKTOP, mobile: true, deviceMemoryGb: 4 };
const WEAK: CreaDeviceCaps = { ...PHONE, deviceMemoryGb: 2 };
const FIREFOX_ANDROID: CreaDeviceCaps = { ...PHONE, webcodecsVideo: false, webcodecsAudio: false };

describe("granice po uređaju", () => {
  test("najduži izvoz u najvećoj rezoluciji staje ispod 190 MB (sa zvukom)", () => {
    for (const [name, limits] of Object.entries(EXPORT_LIMITS)) {
      const long = limits.maxLongSide;
      const short = Math.round((long * 9) / 16);
      expect(estimateBytes(long, short, limits.maxDurationS, true), name).toBeLessThanOrEqual(EXPORT_MAX_BYTES);
      expect(estimateBytes(1280, 720, limits.maxDurationAt720S, true), name).toBeLessThanOrEqual(EXPORT_MAX_BYTES);
    }
  });

  test("telefon 720p i 60 s, slab 480p i 30 s bez obrtanja, računar 1080p", () => {
    expect(exportLimits(PHONE)).toMatchObject({ maxLongSide: 1280, maxDurationS: 60, reverseMaxS: 10 });
    expect(exportLimits(WEAK)).toMatchObject({ maxLongSide: 854, maxDurationS: 30, reverseMaxS: 0 });
    expect(exportLimits(DESKTOP)).toMatchObject({ maxLongSide: 1920, maxDurationS: 240, maxDurationAt720S: 480 });
    expect(maxDurationFor(exportLimits(DESKTOP), 1080, 1920)).toBe(240);
    expect(maxDurationFor(exportLimits(DESKTOP), 720, 1280)).toBe(480);
  });

  test("bitrate po rezoluciji i parne stranice", () => {
    expect(pickVideoBitrate(854, 480)).toBe(1_200_000);
    expect(pickVideoBitrate(1280, 720)).toBe(3_000_000);
    expect(pickVideoBitrate(1080, 1920)).toBe(6_000_000);
    expect(even(721)).toBe(722);
    expect(even(0)).toBe(2);
    expect(exportSize(1081, 1921, 1280)).toEqual({ width: 720, height: 1280 });
  });

  test("bez WebCodecs-a nivo je „pregled\" (poruka + GIF), inače MP4 na uređaju", () => {
    expect(videoSupport(DESKTOP)).toBe("webcodecs");
    expect(videoSupport(FIREFOX_ANDROID)).toBe("preview");
  });
});

describe("preseti za mreže", () => {
  test("svaki preset ima tekstove, trajanje i sigurnu zonu unutar kadra", () => {
    expect(EXPORT_PRESET_IDS).toEqual(["tiktok", "reels", "shorts", "youtube", "instagram", "status", "gif"]);
    expect(PLATFORM_FACTS_CHECKED).toMatch(/^\d{4}-\d{2}$/);
    for (const id of EXPORT_PRESET_IDS) {
      const preset = EXPORT_PRESETS[id];
      expect(preset.id).toBe(id);
      expect(preset.label.sr && preset.label.en && preset.hint.sr && preset.hint.en, id).toBeTruthy();
      expect(preset.maxDurationS, id).toBeGreaterThan(0);
      const zone = preset.safeZone;
      expect(zone.x >= 0 && zone.y >= 0 && zone.x + zone.w <= 1 && zone.y + zone.h <= 1, id).toBe(true);
      expect(zone.w * zone.h, id).toBeGreaterThan(0.3);
      const [w, h] = preset.aspect.split(":").map(Number);
      if (preset.format === "mp4") expect(preset.width / preset.height, id).toBeCloseTo(w / h, 2);
      // Mreže koje se gledaju u feedu (kratki uspravni video) drže donju trećinu slobodnom.
      if (["tiktok", "reels", "shorts"].includes(id)) expect(zone.y + zone.h, id).toBeLessThanOrEqual(0.8);
    }
  });

  test("dimenzije izvoza: odnos montaže, veličina preseta, granica uređaja, uvek parno", () => {
    const desktop = exportLimits(DESKTOP);
    const phone = exportLimits(PHONE);
    expect(outputSize(EXPORT_PRESETS.tiktok, "9:16", desktop)).toEqual({ width: 1080, height: 1920 });
    expect(outputSize(EXPORT_PRESETS.tiktok, "9:16", phone)).toEqual({ width: 720, height: 1280 });
    expect(outputSize(EXPORT_PRESETS.status, "9:16", desktop)).toEqual({ width: 720, height: 1280 });
    expect(outputSize(EXPORT_PRESETS.youtube, "16:9", desktop)).toEqual({ width: 1920, height: 1080 });
    for (const aspect of TIMELINE_ASPECTS) {
      for (const id of EXPORT_PRESET_IDS) {
        const size = outputSize(EXPORT_PRESETS[id], aspect, exportLimits(WEAK));
        expect(size.width % 2, `${id} ${aspect}`).toBe(0);
        expect(size.height % 2, `${id} ${aspect}`).toBe(0);
        expect(Math.max(size.width, size.height), `${id} ${aspect}`).toBeLessThanOrEqual(854);
      }
    }
  });

  test("GIF: najviše 480 px, 10 s i 12 kadrova u sekundi", () => {
    const gif = outputSize(EXPORT_PRESETS.gif, "16:9", exportLimits(DESKTOP));
    expect(Math.max(gif.width, gif.height)).toBe(GIF_LIMITS.maxLongSide);
    expect(EXPORT_PRESETS.gif.maxDurationS).toBe(10);
    expect(GIF_LIMITS.fps).toBe(12);
  });

  test("podrazumevan preset po odnosu, id i ime fajla", () => {
    expect(defaultPresetFor("16:9").id).toBe("youtube");
    expect(defaultPresetFor("9:16").id).toBe("reels");
    expect(defaultPresetFor("4:5").id).toBe("instagram");
    expect(presetById("tiktok")?.id).toBe("tiktok");
    expect(presetById("myspace")).toBeUndefined();
    expect(exportFileName(EXPORT_PRESETS.reels, 12.4)).toBe("crea-reels-12s.mp4");
    expect(exportFileName(EXPORT_PRESETS.gif, 0.2)).toBe("crea-gif-1s.gif");
  });
});
