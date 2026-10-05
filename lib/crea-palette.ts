/**
 * Paleta boja (S31, K09) i boje QR koda: HEX, kontrast, srpski nazivi boja i
 * tekst koji ide u opis slike. Boje iz slike vadi `colorthief`
 * (`components/crea/tools/palette-tool.tsx`); ovde je sve što se može proveriti
 * testom.
 */

import type { Locale } from "./i18n";

export type Rgb = readonly [r: number, g: number, b: number];

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (value: number) => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** `#abc`, `abc`, `#aabbcc` → [r, g, b]; sve ostalo je `null`. */
export function hexToRgb(hex: string): Rgb | null {
  const clean = hex.trim().replace(/^#/, "");
  const full = /^[0-9a-f]{3}$/i.test(clean) ? [...clean].map((c) => c + c).join("") : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** Relativna osvetljenost po WCAG 2.x. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Tekst preko boje: taman ili svetao, šta god ima veći kontrast. */
export function readableOn(color: Rgb): "dark" | "light" {
  return contrastRatio(color, [0, 0, 0]) >= contrastRatio(color, [255, 255, 255]) ? "dark" : "light";
}

function toHsl([r, g, b]: Rgb): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

type Name = { sr: string; en: string };

const HUES: ReadonlyArray<{ upTo: number; name: Name }> = [
  { upTo: 12, name: { sr: "crvena", en: "red" } },
  { upTo: 40, name: { sr: "narandžasta", en: "orange" } },
  { upTo: 65, name: { sr: "žuta", en: "yellow" } },
  { upTo: 85, name: { sr: "žutozelena", en: "lime" } },
  { upTo: 160, name: { sr: "zelena", en: "green" } },
  { upTo: 195, name: { sr: "tirkizna", en: "teal" } },
  { upTo: 255, name: { sr: "plava", en: "blue" } },
  { upTo: 290, name: { sr: "ljubičasta", en: "purple" } },
  { upTo: 335, name: { sr: "roze", en: "pink" } },
  { upTo: 360, name: { sr: "crvena", en: "red" } },
];

/**
 * Približan naziv boje za opis slike („tamnoplava", „krem"). Modeli bolje
 * razumeju reč nego HEX, a početnik zna šta je izabrao.
 */
export function colorName(color: Rgb, locale: Locale): string {
  const { h, s, l } = toHsl(color);
  const pick = (name: Name) => name[locale];
  if (l < 0.12) return pick({ sr: "crna", en: "black" });
  if (l > 0.94 && s < 0.6) return pick({ sr: "bela", en: "white" });
  if (s < 0.12) {
    if (l < 0.35) return pick({ sr: "tamnosiva", en: "dark grey" });
    if (l > 0.75) return pick({ sr: "svetlosiva", en: "light grey" });
    return pick({ sr: "siva", en: "grey" });
  }
  // Topli i bledi tonovi imaju svoja imena: krem, bež, braon.
  if (h >= 8 && h < 55) {
    if (l > 0.85) return pick({ sr: "krem", en: "cream" });
    if (s < 0.45 && l > 0.55) return pick({ sr: "bež", en: "beige" });
    if (l < 0.42) return pick({ sr: "braon", en: "brown" });
  }
  const hue = HUES.find((entry) => h < entry.upTo)?.name ?? HUES[0].name;
  // Prigušene boje (npr. „slate"): siva sa primesom boje.
  if (s < 0.25) return locale === "sr" ? `sivo${hue.sr}` : `greyish ${hue.en}`;
  if (l < 0.32) return locale === "sr" ? `tamno${hue.sr}` : `dark ${hue.en}`;
  if (l > 0.72) return locale === "sr" ? `svetlo${hue.sr}` : `light ${hue.en}`;
  return hue[locale];
}

export type PaletteColor = { rgb: Rgb; hex: string; share: number };

/** Najmanji udeo boje u slici da bi ušla u paletu. */
export const PALETTE_MIN_SHARE = 0.01;

/** Boje bliže od ovoga (euklidski u RGB) su „ista boja" za početnika. */
export const PALETTE_MERGE_DISTANCE = 28;

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Sredi sirovu paletu: spoji skoro iste boje (udeo se sabira), izbaci boje
 * ispod 1 % slike, poređaj od najzastupljenije i ostavi najviše `max`. Udeli
 * se normalizuju na 1.
 */
export function tidyPalette(colors: ReadonlyArray<{ rgb: Rgb; share: number }>, max = 8): PaletteColor[] {
  const merged: Array<{ rgb: Rgb; share: number }> = [];
  for (const color of [...colors].sort((a, b) => b.share - a.share)) {
    const near = merged.find((entry) => distance(entry.rgb, color.rgb) < PALETTE_MERGE_DISTANCE);
    if (near) near.share += color.share;
    else merged.push({ rgb: color.rgb, share: color.share });
  }
  // Boja ispod 1 % slike je obično ivica ili šum (npr. logo od tri boje) - ne nudimo je kao „glavnu".
  const all = merged.reduce((sum, entry) => sum + entry.share, 0) || 1;
  const kept = merged
    .filter((entry, index) => index === 0 || entry.share / all >= PALETTE_MIN_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, max);
  const total = kept.reduce((sum, entry) => sum + entry.share, 0) || 1;
  return kept.map((entry) => ({ rgb: entry.rgb, hex: rgbToHex(entry.rgb), share: entry.share / total }));
}

/** Rečenica za opis slike: „paleta boja: tamnoplava (#0e3158), žuta (#f4be30)". */
export function palettePrompt(colors: readonly PaletteColor[], locale: Locale): string {
  const list = colors.map((color) => `${colorName(color.rgb, locale)} (${color.hex})`).join(", ");
  return locale === "sr" ? `Paleta boja: ${list}.` : `Colour palette: ${list}.`;
}

/** Ceo spisak za kopiranje/preuzimanje: jedna boja po redu, sa udelom. */
export function paletteText(colors: readonly PaletteColor[], locale: Locale): string {
  return colors
    .map((color) => `${color.hex}  ${colorName(color.rgb, locale)}  ${Math.round(color.share * 100)} %`)
    .join("\n");
}
