/**
 * Tekst kao sloj (S21, K12): OCR (Tesseract, srpska latinica i ćirilica) nađe
 * redove teksta na slici → stari tekst se obriše (MI-GAN na uređaju, ili
 * plaćeno maskom) → tekst se ponovo doda kao sloj editora (K10) sa našim
 * fontovima. Tako je tekst bez grešaka sa č ć š ž đ i ćirilicom: slova crta
 * font, ne AI model.
 *
 * Čista logika: redovi iz Tesseract-ovog odgovora, maska za brisanje, boja
 * teksta i čvor scene za editor.
 */

import { canvasSizeForImage, CREA_SCENE_COLORS, emptyScene, type CreaScene, type CreaTextNode } from "./crea-editor-scene";
import { cleanOcrText } from "./crea-ocr";
import { rgbToHex, type Rgb } from "./crea-palette";

export type TextBox = { x: number; y: number; width: number; height: number };

export type FoundTextLine = {
  id: string;
  /** Prepoznat tekst, sređen (`cleanOcrText`); korisnik ga ispravlja pre postavljanja. */
  text: string;
  confidence: number;
  /** U pikselima slike na kojoj je rađeno prepoznavanje. */
  box: TextBox;
};

/** Ono što nam treba iz Tesseract-ovog `data.blocks` (tesseract.js 7). */
type OcrBbox = { x0: number; y0: number; x1: number; y1: number };
export type OcrBlocks = ReadonlyArray<{
  paragraphs?: ReadonlyArray<{ lines?: ReadonlyArray<{ text?: string; confidence?: number; bbox?: OcrBbox }> }>;
}>;

/** Ispod ove pouzdanosti red je skoro sigurno šum (ivica, šara) - ne nudi se. */
export const TEXT_LINE_MIN_CONFIDENCE = 35;
/** Red niži od ovoga (px) nije čitljiv tekst. */
export const TEXT_LINE_MIN_HEIGHT = 6;
export const TEXT_LINES_MAX = 40;

/**
 * Redovi teksta odozgo nadole. `scale` vraća koordinate na sliku od koje je
 * napravljena umanjena kopija za prepoznavanje (npr. 0,5 → koordinate × 2).
 */
export function linesFromOcr(blocks: OcrBlocks | null | undefined, scale = 1): FoundTextLine[] {
  const factor = scale > 0 ? 1 / scale : 1;
  const lines: FoundTextLine[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const text = cleanOcrText(line.text ?? "").replace(/\s*\n\s*/g, " ");
        const bbox = line.bbox;
        if (!text || !bbox) continue;
        const confidence = Math.round(line.confidence ?? 0);
        const height = (bbox.y1 - bbox.y0) * factor;
        if (confidence < TEXT_LINE_MIN_CONFIDENCE || height < TEXT_LINE_MIN_HEIGHT || bbox.x1 <= bbox.x0) continue;
        lines.push({
          id: `red-${lines.length + 1}`,
          text,
          confidence,
          box: {
            x: Math.round(bbox.x0 * factor),
            y: Math.round(bbox.y0 * factor),
            width: Math.round((bbox.x1 - bbox.x0) * factor),
            height: Math.round(height),
          },
        });
      }
    }
  }
  return lines.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x).slice(0, TEXT_LINES_MAX);
}

/** Okvir proširen za deo visine reda (kvačice, repovi slova, senka teksta), u granicama slike. */
export function padBox(box: TextBox, width: number, height: number, ratio = 0.22): TextBox {
  const pad = Math.max(2, Math.round(box.height * ratio));
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return {
    x,
    y,
    width: Math.min(width, box.x + box.width + pad) - x,
    height: Math.min(height, box.y + box.height + pad) - y,
  };
}

/** Maska (0/255) svih izabranih redova - ono što se briše. */
export function textMask(boxes: readonly TextBox[], width: number, height: number): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  for (const raw of boxes) {
    const box = padBox(raw, width, height);
    for (let y = box.y; y < box.y + box.height; y++) mask.fill(255, y * width + box.x, y * width + box.x + box.width);
  }
  return mask;
}

/**
 * Boja teksta u okviru: pozadina je ono što preovlađuje na ivici okvira, a
 * tekst su pikseli najdalji od nje (najtamnijih ili najsvetlijih 8 % - jezgro
 * poteza, bez ivice slova koja se meša sa pozadinom).
 */
export function textColorIn(rgba: Uint8ClampedArray, width: number, box: TextBox): string {
  const luminance = (i: number) => 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
  let edgeSum = 0;
  let edgeCount = 0;
  const pixels: number[] = [];
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = (y * width + x) * 4;
      pixels.push(i);
      if (y === box.y || y === box.y + box.height - 1 || x === box.x || x === box.x + box.width - 1) {
        edgeSum += luminance(i);
        edgeCount += 1;
      }
    }
  }
  if (pixels.length === 0) return CREA_SCENE_COLORS.mastilo;
  const background = edgeCount > 0 ? edgeSum / edgeCount : 128;
  const darkText = background >= 128;
  pixels.sort((a, b) => (darkText ? luminance(a) - luminance(b) : luminance(b) - luminance(a)));
  const take = pixels.slice(0, Math.max(1, Math.round(pixels.length * 0.08)));
  const sum: [number, number, number] = [0, 0, 0];
  for (const i of take) {
    sum[0] += rgba[i]!;
    sum[1] += rgba[i + 1]!;
    sum[2] += rgba[i + 2]!;
  }
  const rgb: Rgb = [Math.round(sum[0] / take.length), Math.round(sum[1] / take.length), Math.round(sum[2] / take.length)];
  return rgbToHex(rgb);
}

/** Visina reda (od vrha velikih slova do dna repova) ≈ veličina fonta × 1,15 kod Nunita. */
export const LINE_BOX_TO_FONT = 1 / 1.15;

/**
 * Red kao tekstualni sloj editora: ista pozicija i veličina kao stari tekst,
 * Nunito (ima latinicu sa č ć š ž đ i ćirilicu), boja starog teksta. Širina
 * ima vazduha jer naš font nije isti kao original - tekst se ne lomi u dva reda.
 */
export function textNodeForLine(line: Pick<FoundTextLine, "id" | "text" | "box">, color: string, scale = 1): CreaTextNode {
  const fontSize = Math.max(8, Math.round(line.box.height * LINE_BOX_TO_FONT * scale));
  return {
    id: `tekst-${line.id}`.slice(0, 40),
    kind: "text",
    x: Math.round(line.box.x * scale),
    y: Math.round(line.box.y * scale),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    text: line.text,
    font: "nunito",
    weight: 700,
    fontSize,
    fit: false,
    width: Math.max(fontSize * 2, Math.round(line.box.width * scale * 1.3)),
    lineHeight: 1.15,
    align: "left",
    verticalAlign: "top",
    fill: color,
    uppercase: false,
  };
}

/** Grupe redova koji su blizu (razmak manji od visine reda) - briše se grupa po grupa, oštrije od jedne velike zakrpe. */
export function groupLines<T extends { box: TextBox }>(lines: readonly T[]): T[][] {
  const sorted = [...lines].sort((a, b) => a.box.y - b.box.y);
  const groups: Array<{ items: T[]; bottom: number }> = [];
  for (const line of sorted) {
    const last = groups[groups.length - 1];
    if (last && line.box.y - last.bottom <= line.box.height) {
      last.items.push(line);
      last.bottom = Math.max(last.bottom, line.box.y + line.box.height);
    } else {
      groups.push({ items: [line], bottom: line.box.y + line.box.height });
    }
  }
  return groups.map((group) => group.items);
}

/**
 * Scena editora (K10): očišćena fotka kao zaključan donji sloj + svaki red kao
 * tekstualni sloj na starom mestu. `imageWidth` je širina slike u kojoj su
 * okviri redova (original) - scena je ista slika, umanjena do 2048 px.
 */
export function sceneWithText(
  photo: { id: string; width: number; height: number },
  lines: ReadonlyArray<Pick<FoundTextLine, "id" | "text" | "box"> & { color: string }>,
  imageWidth: number,
): CreaScene {
  const size = canvasSizeForImage(photo.width, photo.height);
  const scale = imageWidth > 0 ? size.width / imageWidth : 1;
  return {
    ...emptyScene(size.width, size.height, CREA_SCENE_COLORS.bela),
    nodes: [
      {
        id: "fotka-1",
        kind: "image",
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: true,
        asset: photo.id,
        cornerRadius: 0,
        placeholder: CREA_SCENE_COLORS.krem,
      },
      ...lines.filter((line) => line.text.trim()).map((line) => textNodeForLine(line, line.color, scale)),
    ],
  };
}
