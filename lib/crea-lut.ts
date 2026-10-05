import type { LocalizedText } from "./i18n";

/**
 * Boje i svetlo (S17, K11): klizači i filmski izgledi kao JEDNA 3D tabela boja
 * (LUT). Sve što menja boju piksela nezavisno od suseda - svetlo, kontrast,
 * zasićenost, toplina, izgled - „zapeče" se u tabelu ovde, čistom funkcijom;
 * GPU (`postprocessing` `LUT3DEffect` na three.js) samo čita tabelu. Vinjeta i
 * zrno zavise od položaja piksela, pa idu kao zasebni efekti.
 *
 * Boje su u sRGB vrednostima 0..1 (onako kako ih oko vidi), jer LUT3DEffect
 * po podrazumevanom čita tabelu u sRGB prostoru.
 */

export type RGB = [number, number, number];

/** Klizači: -100..100 (izbledi, vinjeta i zrno 0..100). */
export type CreaColorAdjust = {
  exposure: number;
  contrast: number;
  saturation: number;
  warmth: number;
  tint: number;
  highlights: number;
  shadows: number;
  fade: number;
  vignette: number;
  grain: number;
};

export const NEUTRAL_ADJUST: CreaColorAdjust = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  fade: 0,
  vignette: 0,
  grain: 0,
};

export type CreaAdjustKey = keyof CreaColorAdjust;

/** Redosled i opseg klizača; prva četiri su „osnovno", ostali u „Još". */
export const ADJUST_SLIDERS: ReadonlyArray<{ key: CreaAdjustKey; min: number; label: LocalizedText; basic: boolean }> = [
  { key: "exposure", min: -100, label: { sr: "Svetlo", en: "Light" }, basic: true },
  { key: "contrast", min: -100, label: { sr: "Kontrast", en: "Contrast" }, basic: true },
  { key: "saturation", min: -100, label: { sr: "Zasićenost", en: "Saturation" }, basic: true },
  { key: "warmth", min: -100, label: { sr: "Toplina", en: "Warmth" }, basic: true },
  { key: "tint", min: -100, label: { sr: "Nijansa", en: "Tint" }, basic: false },
  { key: "highlights", min: -100, label: { sr: "Svetli delovi", en: "Highlights" }, basic: false },
  { key: "shadows", min: -100, label: { sr: "Senke", en: "Shadows" }, basic: false },
  { key: "fade", min: 0, label: { sr: "Izbledi", en: "Fade" }, basic: false },
  { key: "vignette", min: 0, label: { sr: "Tamne ivice", en: "Vignette" }, basic: false },
  { key: "grain", min: 0, label: { sr: "Zrno filma", en: "Film grain" }, basic: false },
];

/** Toniranje: senke i svetli delovi dobijaju svoju boju (filmski „split toning"). */
type SplitTone = { shadows: RGB; highlights: RGB; amount: number };

export type CreaLook = {
  id: string;
  label: LocalizedText;
  /** Pomak klizača koji izgled donosi (sabira se sa korisnikovim). */
  adjust: Partial<CreaColorAdjust>;
  mono?: boolean;
  split?: SplitTone;
};

/** Filmski izgledi - proceduralni (nema tuđih .cube fajlova ni licenci). */
export const CREA_LOOKS: readonly CreaLook[] = [
  { id: "original", label: { sr: "Bez izgleda", en: "No look" }, adjust: {} },
  {
    id: "topli-film",
    label: { sr: "Topli film", en: "Warm film" },
    adjust: { warmth: 28, contrast: 10, fade: 18, grain: 25, vignette: 25 },
  },
  {
    id: "bioskop",
    label: { sr: "Bioskop", en: "Cinema" },
    adjust: { contrast: 18, saturation: -8, vignette: 30 },
    split: { shadows: [0.05, 0.32, 0.38], highlights: [1, 0.62, 0.32], amount: 0.22 },
  },
  { id: "crno-belo", label: { sr: "Crno-belo", en: "Black and white" }, adjust: { contrast: 22, grain: 30 }, mono: true },
  {
    id: "noar",
    label: { sr: "Noar", en: "Noir" },
    adjust: { contrast: 48, exposure: -12, shadows: -20, vignette: 55, grain: 20 },
    mono: true,
  },
  {
    id: "stara-fotka",
    label: { sr: "Stara fotka", en: "Old photo" },
    adjust: { fade: 38, contrast: -6, grain: 40, vignette: 38 },
    mono: true,
    split: { shadows: [0.32, 0.2, 0.1], highlights: [1, 0.86, 0.62], amount: 0.55 },
  },
  { id: "leto", label: { sr: "Leto", en: "Summer" }, adjust: { warmth: 16, saturation: 26, exposure: 8, highlights: -12 } },
  { id: "jesen", label: { sr: "Jesen", en: "Autumn" }, adjust: { warmth: 32, saturation: -12, contrast: 10, tint: 6 } },
  {
    id: "beograd-nocu",
    label: { sr: "Beograd noću", en: "Belgrade at night" },
    adjust: { contrast: 22, exposure: -10, saturation: 10, vignette: 35 },
    split: { shadows: [0.18, 0.14, 0.55], highlights: [1, 0.55, 0.42], amount: 0.3 },
  },
  { id: "bledo", label: { sr: "Bledo", en: "Matte" }, adjust: { fade: 42, contrast: -16, saturation: -22 } },
];

export function lookById(id: string): CreaLook {
  return CREA_LOOKS.find((look) => look.id === id) ?? CREA_LOOKS[0];
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Klizač + izgled, svedeno na opseg klizača. */
export function combinedAdjust(adjust: CreaColorAdjust, look: CreaLook): CreaColorAdjust {
  const out = { ...adjust };
  for (const slider of ADJUST_SLIDERS) {
    out[slider.key] = clamp(adjust[slider.key] + (look.adjust[slider.key] ?? 0), slider.min, 100);
  }
  return out;
}

const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/**
 * Jedna boja kroz sve klizače i izgled (sRGB 0..1 → sRGB 0..1). Redosled je
 * kao u foto-aplikacijama: svetlo (u linearnom prostoru, ±1,5 blende) → senke i
 * svetli delovi → kontrast oko sredine → toplina/nijansa → zasićenost →
 * crno-belo i toniranje → izbledi. `intensity` 0..1 meša original i rezultat.
 */
export function gradeColor(input: RGB, adjust: CreaColorAdjust, look: CreaLook, intensity = 1): RGB {
  const a = combinedAdjust(adjust, look);
  let c: RGB = [input[0], input[1], input[2]];

  if (a.exposure !== 0) {
    const gain = Math.pow(2, (a.exposure / 100) * 1.5);
    c = c.map((v) => clamp(toSrgb(toLinear(v) * gain), 0, 1)) as RGB;
  }

  if (a.shadows !== 0 || a.highlights !== 0) {
    const l = luma(c);
    const lift = (a.shadows / 100) * 0.35 * Math.pow(1 - l, 2) + (a.highlights / 100) * 0.35 * Math.pow(l, 2);
    c = c.map((v) => v + lift) as RGB;
  }

  if (a.contrast !== 0) {
    const k = a.contrast > 0 ? 1 + (a.contrast / 100) * 0.8 : 1 + (a.contrast / 100) * 0.6;
    c = c.map((v) => (v - 0.5) * k + 0.5) as RGB;
  }

  if (a.warmth !== 0 || a.tint !== 0) {
    const w = (a.warmth / 100) * 0.12;
    const t = (a.tint / 100) * 0.08;
    c = [c[0] + w + t * 0.5, c[1] - t, c[2] - w + t * 0.5];
  }

  if (a.saturation !== 0) {
    const l = luma(c);
    const s = 1 + a.saturation / 100;
    c = c.map((v) => l + (v - l) * s) as RGB;
  }

  if (look.mono) {
    const l = luma(c);
    c = [l, l, l];
  }

  if (look.split) {
    const l = clamp(luma(c), 0, 1);
    const { shadows, highlights, amount } = look.split;
    c = c.map((v, i) => {
      const toned = v + (shadows[i] - 0.5) * amount * (1 - l) + (highlights[i] - 0.5) * amount * l;
      return toned;
    }) as RGB;
  }

  if (a.fade > 0) {
    const f = (a.fade / 100) * 0.22;
    c = c.map((v) => f + v * (1 - f * 1.4)) as RGB;
  }

  const k = clamp(intensity, 0, 1);
  return [
    clamp(input[0] + (c[0] - input[0]) * k, 0, 1),
    clamp(input[1] + (c[1] - input[1]) * k, 0, 1),
    clamp(input[2] + (c[2] - input[2]) * k, 0, 1),
  ];
}

/** Veličina 3D tabele: 33³ je standard filmskih LUT-ova (glatko, ~144 KB float). */
export const LUT_SIZE = 33;

/**
 * 3D tabela boja za `LookupTexture` (postprocessing): RGBA float, `size³`
 * ćelija, indeks `r + g·size + b·size²` - isti raspored kao `LookupTexture.createNeutral`.
 */
export function buildLutData(adjust: CreaColorAdjust, look: CreaLook, intensity = 1, size = LUT_SIZE): Float32Array {
  const data = new Float32Array(size * size * size * 4);
  const step = 1 / (size - 1);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const out = gradeColor([r * step, g * step, b * step], adjust, look, intensity);
        const i = (r + g * size + b * size * size) * 4;
        data[i] = out[0];
        data[i + 1] = out[1];
        data[i + 2] = out[2];
        data[i + 3] = 1;
      }
    }
  }
  return data;
}

/** Vinjeta i zrno posle izgleda, u jedinicama efekata (0..1). */
export function screenEffects(adjust: CreaColorAdjust, look: CreaLook, intensity = 1): { vignette: number; grain: number } {
  const a = combinedAdjust(adjust, look);
  const k = clamp(intensity, 0, 1);
  return { vignette: (a.vignette / 100) * k, grain: (a.grain / 100) * k };
}

/** Da li je sve neutralno (nema šta da se sačuva). */
export function isNeutralGrade(adjust: CreaColorAdjust, look: CreaLook, intensity = 1): boolean {
  if (intensity <= 0) return true;
  return look.id === "original" && ADJUST_SLIDERS.every((slider) => adjust[slider.key] === 0);
}
