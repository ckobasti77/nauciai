import { GRID_COLS, GRID_INSET, GRID_ROWS, gridCells } from "./crea-grid-crop";
import type { LocalizedText } from "./i18n";

/**
 * Viber/WhatsApp nalepnice i sprajt (S40, K15). JEDNA plaćena slika - mreža 3×3
 * sa devet izraza lika na ravnoj zelenoj pozadini - a ostalo radi uređaj, bez AI-a:
 * svako polje se iseče, zelena pozadina se ukloni (od ivice ka unutra, pa zeleni
 * ostaci na ivici lika ne ulaze u nalepnicu), lik se smesti u 512 × 512 sa
 * marginom i dobije beli obrub kao prava nalepnica.
 *
 * Sve ovde je čista logika nad RGBA nizovima (bez platna), pa test proverava
 * ceo put: mreža → 9 fajlova 512 × 512 bez pozadine. Platno je samo za
 * dekodiranje ulaza i WebP izlaz (alat).
 */

export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

/** WhatsApp: tačno 512 × 512, providna pozadina, ≥ 16 px vazduha do ivice. */
export const STICKER_SIZE = 512;
export const STICKER_MARGIN = 16;
/** Beli obrub (px na 512). */
export const STICKER_OUTLINE = 10;
/** Ikonica paketa (WhatsApp „tray"): 96 × 96 PNG. */
export const STICKER_TRAY_SIZE = 96;

export const STICKER_EXPRESSIONS: ReadonlyArray<{ id: string; label: LocalizedText; prompt: string }> = [
  { id: "srecan", label: { sr: "Srećan", en: "Happy" }, prompt: "big happy smile" },
  { id: "smeh", label: { sr: "Smeje se", en: "Laughing" }, prompt: "laughing out loud with closed eyes" },
  { id: "ljubav", label: { sr: "Zaljubljen", en: "In love" }, prompt: "in love, sending a kiss, small hearts around" },
  { id: "palac", label: { sr: "Palac gore", en: "Thumbs up" }, prompt: "giving a thumbs up, confident" },
  { id: "iznenadjen", label: { sr: "Iznenađen", en: "Surprised" }, prompt: "shocked and surprised, mouth open" },
  { id: "tuzan", label: { sr: "Tužan", en: "Sad" }, prompt: "sad with a small tear" },
  { id: "ljut", label: { sr: "Ljut", en: "Angry" }, prompt: "grumpy and angry, frowning" },
  { id: "mislim", label: { sr: "Razmišlja", en: "Thinking" }, prompt: "thinking, hand on chin" },
  { id: "zdravo", label: { sr: "Zdravo", en: "Hi" }, prompt: "waving hello cheerfully" },
];

export const STICKER_STYLES: ReadonlyArray<{ id: string; label: LocalizedText; prompt: string }> = [
  { id: "crtano", label: { sr: "Crtano", en: "Cartoon" }, prompt: "cute cartoon sticker style with clean bold outlines and flat colours" },
  { id: "3d", label: { sr: "3D", en: "3D" }, prompt: "glossy 3D animated character style" },
  { id: "anime", label: { sr: "Anime", en: "Anime" }, prompt: "chibi anime style" },
];

/** Prvi red opisa: po njemu detalj rada prepoznaje mrežu nalepnica. */
export const STICKER_PROMPT_MARKER = "A 3×3 sticker sheet of nine expressions.";

/**
 * Opis mreže: ista osoba/lik u svih 9 polja, jedan izraz po polju, ravna
 * hroma-zelena pozadina (lako se uklanja), bez zelenog na liku i bez teksta.
 */
export function stickerSheetPrompt(subjectImages: string, styleId: string, extra = ""): string {
  const style = STICKER_STYLES.find((entry) => entry.id === styleId) ?? STICKER_STYLES[0]!;
  const cells = STICKER_EXPRESSIONS.map((expression, index) => `${index + 1}. ${expression.prompt}`).join("; ");
  const said = extra.trim();
  return (
    `${STICKER_PROMPT_MARKER} Make ONE square image split into 9 equal square cells (3 rows × 3 columns), with no borders, lines, numbers or text. ` +
    `Every cell shows the same character as in ${subjectImages} - same face, hair and outfit - as a ${style.prompt}, head and upper body, centred with empty space around it, one expression per cell, left to right and top to bottom: ${cells}. ` +
    `The whole background of every cell is one flat, solid pure green (#00FF00) with no shadows, gradients or patterns; the character itself has no green on it.` +
    (said ? ` Also: ${said}.` : "")
  );
}

export function isStickerSheetPrompt(prompt: string | null | undefined): boolean {
  return typeof prompt === "string" && prompt.trimStart().startsWith(STICKER_PROMPT_MARKER);
}

/** Mreža nalepnica: kvadrat 2K (polje ~680 px - dovoljno za 512). */
export const STICKER_SHEET_PARAMS = { aspect_ratio: "1:1", resolution: "2K" } as const;

// ── Pozadina ────────────────────────────────────────────────────────────────

/** Boja pozadine: medijana piksela sa ivice (otporno na lik koji dodiruje ivicu). */
export function borderColor(image: Rgba): [number, number, number] {
  const { data, width, height } = image;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const take = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    rs.push(data[i]!);
    gs.push(data[i + 1]!);
    bs.push(data[i + 2]!);
  };
  const step = Math.max(1, Math.floor(Math.max(width, height) / 64));
  for (let x = 0; x < width; x += step) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    take(0, y);
    take(width - 1, y);
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1] ?? 0;
  return [median(rs), median(gs), median(bs)];
}

/** Pragovi udaljenosti od boje pozadine (RGB): do `hard` je pozadina, do `soft` meka ivica. */
export const KEY_HARD = 90;
export const KEY_SOFT = 150;

/**
 * Ukloni ravnu pozadinu: popuni od ivice sve piksele bliske boji pozadine
 * (samo povezane sa ivicom - zelena dugmad na odeći ostaju), pa ivici lika
 * daj meku providnost i skini zeleni odsjaj (despill). Vraća novu sliku.
 */
export function keyOutBackground(image: Rgba, background = borderColor(image)): Rgba {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data);
  const [br, bg, bb] = background;
  const distance = (i: number) => Math.hypot(data[i]! - br, data[i + 1]! - bg, data[i + 2]! - bb);
  const removed = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * width + x;
    if (removed[p]) return;
    if (distance(p * 4) > KEY_HARD) return;
    removed[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  // Dominantan kanal pozadine (kod zelene: G) - za despill na ivici.
  const channel = bg >= br && bg >= bb ? 1 : br >= bb ? 0 : 2;
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (removed[p]) {
      data[i + 3] = 0;
      continue;
    }
    const x = p % width;
    const y = (p - x) / width;
    const nearRemoved =
      (x > 0 && removed[p - 1]) || (x < width - 1 && removed[p + 1]) || (y > 0 && removed[p - width]) || (y < height - 1 && removed[p + width]);
    if (!nearRemoved) continue;
    const d = distance(i);
    if (d < KEY_SOFT) data[i + 3] = Math.round((data[i + 3]! * (d - KEY_HARD)) / (KEY_SOFT - KEY_HARD));
    // Ivica ne sme da zeleni: dominantni kanal ne prelazi veći od druga dva.
    const others = [0, 1, 2].filter((c) => c !== channel).map((c) => data[i + c]!);
    data[i + channel] = Math.min(data[i + channel]!, Math.max(...others));
  }
  return { data, width, height };
}

/** Okvir neprovidnog dela (`alpha > threshold`), ili `null` kad je sve providno. */
export function alphaBounds(image: Rgba, threshold = 16): { x: number; y: number; width: number; height: number } | null {
  const { data, width, height } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Isečak slike (kopija). */
export function cropRgba(image: Rgba, rect: { x: number; y: number; width: number; height: number }): Rgba {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * image.width + rect.x) * 4;
    out.set(image.data.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return { data: out, width: rect.width, height: rect.height };
}

/**
 * Bilinearno skaliranje u premultipliciranom obliku (bez tamnog oreola oko
 * providnih ivica), pa smeštanje u kvadrat `size` tačno po sredini.
 */
export function fitIntoSquare(image: Rgba, size: number, padding: number): Rgba {
  const out = new Uint8ClampedArray(size * size * 4);
  const box = Math.max(1, size - padding * 2);
  const scale = Math.min(box / image.width, box / image.height);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  // Premultiplicirana kopija izvora: boja providnog piksela ne curi u susede.
  const src = new Float32Array(image.width * image.height * 4);
  for (let i = 0; i < src.length; i += 4) {
    const a = image.data[i + 3]!;
    src[i] = (image.data[i]! * a) / 255;
    src[i + 1] = (image.data[i + 1]! * a) / 255;
    src[i + 2] = (image.data[i + 2]! * a) / 255;
    src[i + 3] = a;
  }
  for (let y = 0; y < h; y++) {
    const sy = Math.min(image.height - 1, Math.max(0, (y + 0.5) / scale - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(image.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(image.width - 1, Math.max(0, (x + 0.5) / scale - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(image.width - 1, x0 + 1);
      const fx = sx - x0;
      const i00 = (y0 * image.width + x0) * 4;
      const i10 = (y0 * image.width + x1) * 4;
      const i01 = (y1 * image.width + x0) * 4;
      const i11 = (y1 * image.width + x1) * 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const o = ((oy + y) * size + ox + x) * 4;
      const alpha = src[i00 + 3]! * w00 + src[i10 + 3]! * w10 + src[i01 + 3]! * w01 + src[i11 + 3]! * w11;
      out[o + 3] = Math.round(alpha);
      if (alpha <= 0) continue;
      for (let c = 0; c < 3; c++) {
        const value = src[i00 + c]! * w00 + src[i10 + c]! * w10 + src[i01 + c]! * w01 + src[i11 + c]! * w11;
        out[o + c] = Math.round((value * 255) / alpha);
      }
    }
  }
  return { data: out, width: size, height: size };
}

/**
 * Beli obrub: rastojanje svakog piksela do lika (chamfer 3-4, dva prolaza), pa
 * sve na `radius` ili bliže dobija belu podlogu ispod lika.
 */
export function addOutline(image: Rgba, radius: number, color: [number, number, number] = [255, 255, 255]): Rgba {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data);
  if (radius <= 0) return { data, width, height };
  const far = 1e9;
  const dist = new Float64Array(width * height);
  for (let p = 0; p < dist.length; p++) dist[p] = data[p * 4 + 3]! > 127 ? 0 : far;
  const relax = (p: number, q: number, cost: number) => {
    if (dist[q]! + cost < dist[p]!) dist[p] = dist[q]! + cost;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (x > 0) relax(p, p - 1, 3);
      if (y > 0) {
        relax(p, p - width, 3);
        if (x > 0) relax(p, p - width - 1, 4);
        if (x < width - 1) relax(p, p - width + 1, 4);
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x;
      if (x < width - 1) relax(p, p + 1, 3);
      if (y < height - 1) {
        relax(p, p + width, 3);
        if (x < width - 1) relax(p, p + width + 1, 4);
        if (x > 0) relax(p, p + width - 1, 4);
      }
    }
  }
  for (let p = 0; p < dist.length; p++) {
    const d = dist[p]! / 3;
    if (d > radius + 1) continue;
    // Meka spoljna ivica obruba (1 px), lik se crta preko bele podloge.
    const under = d <= radius ? 1 : radius + 1 - d;
    const i = p * 4;
    const a = data[i + 3]! / 255;
    const outA = a + under * (1 - a);
    if (outA <= 0) continue;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round((data[i + c]! * a + color[c]! * under * (1 - a)) / outA);
    data[i + 3] = Math.round(outA * 255);
  }
  return { data, width, height };
}

/** Jedno polje mreže → nalepnica 512 × 512 (providna kad je polje prazno). */
export function stickerFromCell(cell: Rgba, options: { outline: boolean }): Rgba {
  const keyed = keyOutBackground(cell);
  const bounds = alphaBounds(keyed);
  if (!bounds) return { data: new Uint8ClampedArray(STICKER_SIZE * STICKER_SIZE * 4), width: STICKER_SIZE, height: STICKER_SIZE };
  const outline = options.outline ? STICKER_OUTLINE : 0;
  const fitted = fitIntoSquare(cropRgba(keyed, bounds), STICKER_SIZE, STICKER_MARGIN + outline);
  return outline > 0 ? addOutline(fitted, outline) : fitted;
}

/** Cela mreža 3×3 → 9 nalepnica, redom polja (ivica polja se odseca kao kod uglova). */
export function stickersFromSheet(sheet: Rgba, options: { outline: boolean }): Rgba[] {
  return gridCells(sheet.width, sheet.height, GRID_ROWS, GRID_COLS, GRID_INSET).map((cell) =>
    stickerFromCell(cropRgba(sheet, cell), options),
  );
}

/** Ime fajla nalepnice: `crea-nalepnica-3-ljubav.webp`. */
export function stickerFileName(index: number, extension = "webp"): string {
  const expression = STICKER_EXPRESSIONS[index];
  return `crea-nalepnica-${index + 1}-${expression?.id ?? "polje"}.${extension}`;
}

// ── Sprajt iz videa ─────────────────────────────────────────────────────────

export const SPRITE_FRAME_COUNTS = [8, 12, 16, 24] as const;
export const SPRITE_FRAME_SIZES = [64, 128, 256] as const;
/** Duži snimak od ovoga nije „kratak video" za sprajt. */
export const SPRITE_MAX_SECONDS = 15;

/** Trenuci za sličice: sredine `count` jednakih delova snimka (bez crnog prvog/poslednjeg kadra). */
export function spriteFrameTimes(durationSeconds: number, count: number): number[] {
  const duration = Math.max(0, Math.min(durationSeconds, SPRITE_MAX_SECONDS));
  return Array.from({ length: count }, (_, i) => Math.round(((i + 0.5) * duration * 1000) / count) / 1000);
}

/** Raspored lista: što kvadratniji (kolone = ⌈√n⌉). */
export function spriteLayout(count: number, frame: number): { columns: number; rows: number; width: number; height: number } {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  return { columns, rows, width: columns * frame, height: rows * frame };
}

/** Podaci za igricu (Phaser/Godot/Unity ih čitaju ručno): veličina sličice, broj, kolone, brzina. */
export function spriteMeta(count: number, frame: number, fps: number, image: string) {
  const layout = spriteLayout(count, frame);
  return {
    image,
    frameWidth: frame,
    frameHeight: frame,
    frames: count,
    columns: layout.columns,
    rows: layout.rows,
    fps,
  };
}
