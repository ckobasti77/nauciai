import { CREA_SCENE_FONTS, type CreaFontId } from "./crea-editor-scene";
import { normalizeHex } from "./crea-matting";
import { colorName, hexToRgb, relativeLuminance, type PaletteColor } from "./crea-palette";
import type { Locale, LocalizedText } from "./i18n";

/**
 * Brend kit (S38, K15): ime, logo, boje, fontovi i ton jedne firme. Sačuva se
 * jednom, a recepti (S37), editor (tekst i vodeni žig, S28) i logo (S41) ga
 * sami koriste. Čista logika - provere koje radi i Convex (`creaBrandKit.ts`) i
 * rečenica koja ide modelu - bez React-a i browser API-ja.
 */

export const BRAND_NAME_MAX = 60;
export const BRAND_COLORS_MAX = 8;
export const BRAND_TONE_MAX = 300;

/**
 * Fontovi kita su tačno fontovi editora (allowlist, sve OFL): editor ume da ih
 * nacrta, a modelu se šalje opis stila, jer AI ne prima font kao fajl.
 */
export const BRAND_FONTS: readonly CreaFontId[] = CREA_SCENE_FONTS;

export const BRAND_FONT_INFO: Record<CreaFontId, { label: LocalizedText; hint: LocalizedText; style: string }> = {
  nunito: {
    label: { sr: "Nunito", en: "Nunito" },
    hint: { sr: "zaobljen, prijateljski", en: "rounded, friendly" },
    style: "a rounded, friendly sans-serif (like Nunito)",
  },
  rukopis: {
    label: { sr: "Rukopis", en: "Handwriting" },
    hint: { sr: "kao pisano rukom", en: "like handwriting" },
    style: "a casual handwritten script (like Patrick Hand)",
  },
  montserrat: {
    label: { sr: "Montserrat", en: "Montserrat" },
    hint: { sr: "čist, poslovni", en: "clean, businesslike" },
    style: "a clean geometric sans-serif (like Montserrat)",
  },
  lora: {
    label: { sr: "Lora", en: "Lora" },
    hint: { sr: "elegantan, sa serifima", en: "elegant, with serifs" },
    style: "an elegant serif (like Lora)",
  },
};

/** Brzi izbor tona; korisnik ga posle dopisuje svojim rečima. */
export const BRAND_TONE_PRESETS: ReadonlyArray<{ id: string; label: LocalizedText; text: LocalizedText }> = [
  { id: "topao", label: { sr: "Topao", en: "Warm" }, text: { sr: "topao i prijateljski, kao komšija", en: "warm and friendly, like a neighbour" } },
  { id: "ozbiljan", label: { sr: "Ozbiljan", en: "Serious" }, text: { sr: "ozbiljan i pouzdan, bez šala", en: "serious and reliable, no jokes" } },
  { id: "zabavan", label: { sr: "Zabavan", en: "Playful" }, text: { sr: "zabavan i razigran, puno energije", en: "playful and lively, full of energy" } },
  { id: "luksuzan", label: { sr: "Luksuzan", en: "Luxury" }, text: { sr: "luksuzan i smiren, malo reči", en: "luxurious and calm, few words" } },
];

export type CreaBrandFonts = { heading: CreaFontId; body: CreaFontId };

/** Kit kako ga vidi klijent (`creaBrandKit.getMine`). */
export type CreaBrandKit = {
  name: string;
  colors: readonly string[];
  fonts: CreaBrandFonts;
  tone: string;
  logoStorageId: string | null;
  logoUrl: string | null;
};

export const DEFAULT_BRAND_FONTS: CreaBrandFonts = { heading: "nunito", body: "nunito" };

export function isBrandFont(value: string): value is CreaFontId {
  return (BRAND_FONTS as readonly string[]).includes(value);
}

/** Ime bez suvišnih razmaka i kontrolnih znakova; `null` kad je prazno ili predugo. */
export function cleanBrandName(raw: string): string | null {
  const visible = Array.from(raw, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch)).join("");
  const name = visible.replace(/\s+/g, " ").trim();
  if (name.length === 0 || name.length > BRAND_NAME_MAX) return null;
  return name;
}

/** Boje kao `#rrggbb`, bez duplikata, najviše 8; `null` kad neka nije boja ili ih ima previše. */
export function cleanBrandColors(raw: readonly string[]): string[] | null {
  if (raw.length > BRAND_COLORS_MAX) return null;
  const out: string[] = [];
  for (const value of raw) {
    const hex = normalizeHex(value);
    if (!hex) return null;
    if (!out.includes(hex)) out.push(hex);
  }
  return out;
}

/** Ton: prazno je dozvoljeno (`""`), predugo nije (`null`). */
export function cleanBrandTone(raw: string): string | null {
  const tone = raw.replace(/\s+/g, " ").trim();
  return tone.length > BRAND_TONE_MAX ? null : tone;
}

/**
 * Boje logoa iz palete (`colorthief` + `tidyPalette`): pozadina logoa - skoro
 * bela boja koja zauzima veliki deo slike - nije boja brenda, pa se izbacuje.
 */
export function brandColorsFromPalette(colors: readonly PaletteColor[], max = 5): string[] {
  return colors
    .filter((color) => !(relativeLuminance(color.rgb) > 0.9 && color.share > 0.25))
    .slice(0, max)
    .map((color) => color.hex);
}

/**
 * Rečenica za model (engleski, kao ostala uputstva modelu u Crei - K13/K14): ime,
 * boje sa nazivima, stil slova, ton i - kad je logo priložen - koja je slika logo.
 */
export function brandPromptLine(
  kit: Pick<CreaBrandKit, "name" | "colors" | "fonts" | "tone">,
  options: { logoImage?: number } = {},
): string {
  const parts = [`Brand: "${kit.name}".`];
  if (kit.colors.length > 0) {
    const named = kit.colors.map((hex) => {
      const rgb = hexToRgb(hex);
      return rgb ? `${colorName(rgb, "en")} (${hex})` : hex;
    });
    parts.push(`Use the brand colours ${named.join(", ")} as the main palette.`);
  }
  parts.push(`Lettering style: headings in ${BRAND_FONT_INFO[kit.fonts.heading].style}, other text in ${BRAND_FONT_INFO[kit.fonts.body].style}.`);
  if (kit.tone.trim()) parts.push(`Tone of voice: ${kit.tone.trim()}.`);
  if (options.logoImage !== undefined) {
    parts.push(`Image ${options.logoImage} is the brand logo: place it small and clean in a corner, exactly as it is - do not redraw or change it.`);
  }
  return parts.join(" ");
}

/** Tekst vodenog žiga iz kita (ime firme). */
export function brandWatermarkText(kit: Pick<CreaBrandKit, "name">): string {
  return kit.name;
}

/** Kratak opis kita za ekran recepta: „Pekara Klas · 3 boje · Lora". */
export function brandSummary(kit: Pick<CreaBrandKit, "name" | "colors" | "fonts">, locale: Locale): string {
  const n = kit.colors.length;
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  const colors = locale === "sr" ? `${n} ${few ? "boje" : "boja"}` : `${n} colour${n === 1 ? "" : "s"}`;
  return `${kit.name} · ${colors} · ${BRAND_FONT_INFO[kit.fonts.heading].label[locale]}`;
}
