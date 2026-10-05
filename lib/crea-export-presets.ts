import type { LocalizedText } from "./i18n";
import type { Rect01, TimelineAspect } from "./crea-timeline";
import { even, exportSize, type ExportLimits } from "./crea-video-caps";

/**
 * Izvoz za mreže (Crea K19, V30): preseti platformi - rezolucija, odnos,
 * najduže trajanje i sigurna zona (deo kadra koji dugmad, opis i traka
 * platforme NE pokrivaju), kao `Rect01`.
 *
 * Brojevi platformi se menjaju, zato su OKVIRNI i nose datum provere
 * (`PLATFORM_FACTS_CHECKED`). Sigurne zone su procena iz vodiča platformi:
 * dovoljno tačne da natpis ne završi ispod dugmadi.
 */

export const PLATFORM_FACTS_CHECKED = "2026-10";

export const EXPORT_PRESET_IDS = ["tiktok", "reels", "shorts", "youtube", "instagram", "status", "gif"] as const;
export type ExportPresetId = (typeof EXPORT_PRESET_IDS)[number];

export type ExportPreset = {
  id: ExportPresetId;
  label: LocalizedText;
  /** Kratko: gde se objavljuje i šta je bitno. */
  hint: LocalizedText;
  aspect: TimelineAspect;
  width: number;
  height: number;
  /** Najduže što platforma prima (okvirno). */
  maxDurationS: number;
  format: "mp4" | "gif";
  /** Deo kadra bez dugmadi i opisa platforme. */
  safeZone: Rect01;
};

/** Ceo kadar uz 5 % margine („title safe" za YouTube i obične objave). */
const TITLE_SAFE: Rect01 = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };

export const EXPORT_PRESETS: Record<ExportPresetId, ExportPreset> = {
  tiktok: {
    id: "tiktok",
    label: { sr: "TikTok", en: "TikTok" },
    hint: { sr: "Uspravno 9:16, do 10 min (okvirno). Desno su dugmad, dole opis.", en: "Vertical 9:16, up to 10 min (approx.). Buttons on the right, caption at the bottom." },
    aspect: "9:16",
    width: 1080,
    height: 1920,
    maxDurationS: 600,
    format: "mp4",
    safeZone: { x: 0.06, y: 0.08, w: 0.8, h: 0.7 },
  },
  reels: {
    id: "reels",
    label: { sr: "Instagram Reels", en: "Instagram Reels" },
    hint: { sr: "Uspravno 9:16, do 3 min (okvirno). Gornjih 14 % i donjih 35 % pokriva Instagram.", en: "Vertical 9:16, up to 3 min (approx.). Instagram covers the top 14% and bottom 35%." },
    aspect: "9:16",
    width: 1080,
    height: 1920,
    maxDurationS: 180,
    format: "mp4",
    safeZone: { x: 0.06, y: 0.14, w: 0.88, h: 0.51 },
  },
  shorts: {
    id: "shorts",
    label: { sr: "YouTube Shorts", en: "YouTube Shorts" },
    hint: { sr: "Uspravno 9:16, do 3 min (okvirno). Desno dugmad, dole naslov i kanal.", en: "Vertical 9:16, up to 3 min (approx.). Buttons on the right, title and channel at the bottom." },
    aspect: "9:16",
    width: 1080,
    height: 1920,
    maxDurationS: 180,
    format: "mp4",
    safeZone: { x: 0.06, y: 0.12, w: 0.78, h: 0.62 },
  },
  youtube: {
    id: "youtube",
    label: { sr: "YouTube video", en: "YouTube video" },
    hint: { sr: "Položeno 16:9. Dugi snimci traže potvrđen kanal (preko 15 min).", en: "Landscape 16:9. Long uploads need a verified channel (over 15 min)." },
    aspect: "16:9",
    width: 1920,
    height: 1080,
    maxDurationS: 15 * 60,
    format: "mp4",
    safeZone: TITLE_SAFE,
  },
  instagram: {
    id: "instagram",
    label: { sr: "Instagram objava", en: "Instagram post" },
    hint: { sr: "4:5 u feedu (okvirno do 3 min). Na profilu se vidi sredina.", en: "4:5 in the feed (approx. up to 3 min). The profile grid shows the middle." },
    aspect: "4:5",
    width: 1080,
    height: 1350,
    maxDurationS: 180,
    format: "mp4",
    safeZone: { x: 0.05, y: 0.06, w: 0.9, h: 0.88 },
  },
  status: {
    id: "status",
    label: { sr: "Status (WhatsApp, Viber)", en: "Status (WhatsApp, Viber)" },
    hint: { sr: "Uspravno, do 60 s po statusu (okvirno). Manji fajl se brže šalje.", en: "Vertical, up to 60 s per status (approx.). A smaller file sends faster." },
    aspect: "9:16",
    width: 720,
    height: 1280,
    maxDurationS: 60,
    format: "mp4",
    safeZone: { x: 0.05, y: 0.12, w: 0.9, h: 0.74 },
  },
  gif: {
    id: "gif",
    label: { sr: "GIF", en: "GIF" },
    hint: { sr: "Bez zvuka, do 10 s i 480 px - za poruke i komentare.", en: "No sound, up to 10 s and 480 px - for chats and comments." },
    aspect: "1:1",
    width: 480,
    height: 480,
    maxDurationS: 10,
    format: "gif",
    safeZone: TITLE_SAFE,
  },
};

/** GIF: najviše 10 s, 480 px duža stranica, 12 kadrova u sekundi (plan §1.5). */
export const GIF_LIMITS = { maxDurationS: 10, maxLongSide: 480, fps: 12 } as const;

/** Odnos širina/visina za odnos montaže. */
const ASPECT_SIZE: Record<TimelineAspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

/**
 * Konačne dimenzije izvoza. Kadar uvek ima odnos MONTAŽE (preset se proverava
 * u „Proveri pre objave" i nudi „promeni odnos"), a veličina je veličina preseta
 * na toj duže/kraćoj stranici, smanjena do granice uređaja. GIF je ≤ 480 px.
 */
export function outputSize(preset: ExportPreset, aspect: TimelineAspect, limits: ExportLimits): { width: number; height: number } {
  const base = ASPECT_SIZE[aspect];
  if (preset.format === "gif") return exportSize(base.width, base.height, GIF_LIMITS.maxLongSide);
  const presetLong = Math.max(preset.width, preset.height);
  const scale = presetLong / Math.max(base.width, base.height);
  const size = exportSize(base.width * scale, base.height * scale, limits.maxLongSide);
  return { width: even(size.width), height: even(size.height) };
}

export function presetById(id: string | null | undefined): ExportPreset | undefined {
  return EXPORT_PRESET_IDS.includes(id as ExportPresetId) ? EXPORT_PRESETS[id as ExportPresetId] : undefined;
}

/** Preset koji odgovara odnosu montaže (podrazumevan izbor). */
export function defaultPresetFor(aspect: TimelineAspect): ExportPreset {
  if (aspect === "16:9") return EXPORT_PRESETS.youtube;
  if (aspect === "4:5" || aspect === "1:1") return EXPORT_PRESETS.instagram;
  return EXPORT_PRESETS.reels;
}

/** Ime fajla izvoza: `crea-reels-12s.mp4`. */
export function exportFileName(preset: ExportPreset, seconds: number): string {
  return `crea-${preset.id}-${Math.max(1, Math.round(seconds))}s.${preset.format}`;
}
