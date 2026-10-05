import { getStroke } from "perfect-freehand";

/**
 * Maske za izmene slike (K11: S11 četkica, S12 klik, S13 brisanje) - čista
 * logika nad pikselima, bez platna i bez browser API-ja, pa se testira bez
 * browsera. Maska je `Uint8ClampedArray` dužine `width * height`: 0 = netaknuto,
 * 255 = označeno. Platno je samo crta.
 */

export type MaskBox = { x: number; y: number; width: number; height: number };
export type MaskStats = { coverage: number; box: MaskBox | null };

/** Iznad ove vrednosti (0..255) piksel je označen. */
export const MASK_THRESHOLD = 128;

/**
 * Najduža stranica slike u editoru maske. Maska ne treba punu rezoluciju (na
 * kraju se razvuče sa omekšanom ivicom), a koraci „Poništi" čuvaju kopije maske -
 * na 1536 px to je ~2,4 MB po koraku umesto ~12 MB za fotku od 12 MP.
 */
export const MASK_WORK_MAX_SIDE = 1536;

/** Koliko koraka „Poništi" pamti editor maske. */
export const MASK_UNDO_STEPS = 15;

/** Alfa kanal RGBA piksela → maska (0/255). */
export function maskFromAlpha(rgba: Uint8ClampedArray, threshold = MASK_THRESHOLD): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3] >= threshold ? 255 : 0;
  return mask;
}

/** Maska poverenja 0..1 (MediaPipe MagicTouch) → maska (0/255). */
export function maskFromConfidence(confidence: Float32Array, threshold = 0.5): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(confidence.length);
  for (let i = 0; i < mask.length; i++) mask[i] = confidence[i] >= threshold ? 255 : 0;
  return mask;
}

/** Koliko slike je označeno (0..1) i najmanji okvir oko označenog; prazna maska → `box: null`. */
export function maskStats(mask: Uint8ClampedArray, width: number, height: number): MaskStats {
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] < MASK_THRESHOLD) continue;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const total = width * height;
  return {
    coverage: total > 0 ? count / total : 0,
    box: count === 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

/**
 * Proširi masku za `radius` px (kvadratni prozor; dva prolaza, vodoravno pa
 * uspravno, O(n) po pikselu). Brisanje tako pokrije i ivicu i senku predmeta
 * koju četkica promaši - bez toga ostaje „duh" obrisanog predmeta.
 */
export function dilateMask(mask: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return mask.slice();
  const pass = (source: Uint8ClampedArray, horizontal: boolean) => {
    const out = new Uint8ClampedArray(source.length);
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    const at = (line: number, i: number) => (horizontal ? line * width + i : i * width + line);
    for (let line = 0; line < lines; line++) {
      // Koliko označenih piksela je u prozoru [i - r, i + r].
      let inside = 0;
      for (let i = 0; i <= Math.min(r, length - 1); i++) if (source[at(line, i)] >= MASK_THRESHOLD) inside++;
      for (let i = 0; i < length; i++) {
        out[at(line, i)] = inside > 0 ? 255 : 0;
        const enter = i + r + 1;
        const leave = i - r;
        if (enter < length && source[at(line, enter)] >= MASK_THRESHOLD) inside++;
        if (leave >= 0 && source[at(line, leave)] >= MASK_THRESHOLD) inside--;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

/**
 * Maska za Ideogram (fal `ideogram/v4.5/edit`): CRNO = menja se, BELO = ostaje,
 * neprovidan RGBA iste veličine kao slika (https://fal.ai/models/ideogram/v4.5/edit/llms.txt).
 */
export function providerMaskRgba(mask: Uint8ClampedArray): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(mask.length * 4);
  for (let i = 0; i < mask.length; i++) {
    const value = mask[i] >= MASK_THRESHOLD ? 0 : 255;
    rgba[i * 4] = value;
    rgba[i * 4 + 1] = value;
    rgba[i * 4 + 2] = value;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/** MI-GAN „pipeline": 255 = ostaje, 0 = popunjava se (provereno na modelu u K11). */
export function miganMask(mask: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] >= MASK_THRESHOLD ? 0 : 255;
  return out;
}

/**
 * Najmanje i najviše označenog da bi maska imala smisla. Ideogram traži „obe
 * oblasti" (i deo koji se menja i deo koji ostaje); cela slika ionako nije
 * izmena dela nego nova slika.
 */
export const MASK_COVERAGE_RANGE = { min: 0.0005, max: 0.9 } as const;

export function maskIsUsable(stats: MaskStats): boolean {
  return stats.box !== null && stats.coverage >= MASK_COVERAGE_RANGE.min && stats.coverage <= MASK_COVERAGE_RANGE.max;
}

/**
 * Kad je predmet „velik" za besplatno brisanje na uređaju: MI-GAN dobro krpi
 * male rupe, a veliku zakrpu razmaže. Iznad ovih granica nudi se plaćeni put
 * (S13: „mali predmeti 0 kr, za velike plaćeno"). Heuristika - podesiva.
 */
export const LARGE_OBJECT = { coverage: 0.12, boxShare: 0.35 } as const;

export function isLargeObject(stats: MaskStats, width: number, height: number): boolean {
  if (!stats.box) return false;
  const boxShare = (stats.box.width * stats.box.height) / Math.max(1, width * height);
  return stats.coverage > LARGE_OBJECT.coverage || boxShare > LARGE_OBJECT.boxShare;
}

/**
 * Isečak oko maske za brisanje na uređaju: okvir maske proširen okolinom
 * (`context` × veća stranica okvira, najmanje `minSide`), uvek unutar slike.
 * Model tako vidi dovoljno pozadine da je nastavi, a ne radi nad celom fotkom
 * od 12 MP (telefon bi ostao bez memorije).
 */
export function inpaintCrop(
  box: MaskBox,
  width: number,
  height: number,
  options: { context?: number; minSide?: number } = {},
): MaskBox {
  const context = options.context ?? 0.75;
  const minSide = options.minSide ?? 256;
  const pad = Math.round(Math.max(box.width, box.height) * context);
  const wantW = Math.min(width, Math.max(minSide, box.width + 2 * pad));
  const wantH = Math.min(height, Math.max(minSide, box.height + 2 * pad));
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const x = Math.round(Math.min(Math.max(0, centerX - wantW / 2), width - wantW));
  const y = Math.round(Math.min(Math.max(0, centerY - wantH / 2), height - wantH));
  return { x, y, width: Math.round(wantW), height: Math.round(wantH) };
}

/**
 * Nano Banana nema masku (K06 §4.1): uz original ide druga slika sa obojenim
 * delom koji se menja. Boja je jarka crveno-ljubičasta jer je u fotkama retka,
 * pa model ne meša oznaku sa sadržajem.
 */
export const ZONE_TINT: readonly [number, number, number] = [255, 0, 96];

export function tintMasked(
  rgba: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  color: readonly [number, number, number] = ZONE_TINT,
  opacity = 0.6,
): Uint8ClampedArray {
  const out = rgba.slice();
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < MASK_THRESHOLD) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(out[i * 4 + c] * (1 - opacity) + color[c] * opacity);
  }
  return out;
}

/** Tačka poteza četkice u koordinatama slike (pritisak 0..1 je opcion). */
export type StrokePoint = readonly [x: number, y: number, pressure?: number];

/**
 * Obris poteza četkice (`perfect-freehand`) kao poligon. Debljina je stalna
 * (`thinning: 0`), da potez bude tačno širok koliko krug ispod prsta pokazuje;
 * glatko je, ali ne „beži" od prsta.
 */
export function strokeOutline(points: readonly StrokePoint[], size: number, last = true): Array<[number, number]> {
  if (points.length === 0) return [];
  return getStroke(
    points.map(([x, y, pressure]) => (pressure === undefined ? [x, y] : [x, y, pressure])),
    { size, thinning: 0, smoothing: 0.5, streamline: 0.35, simulatePressure: false, last },
  ) as Array<[number, number]>;
}

/** Veličina radne slike editora: duža stranica najviše `maxSide`, nikad uvećana. */
export function workSize(width: number, height: number, maxSide = MASK_WORK_MAX_SIDE): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
