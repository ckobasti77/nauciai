/**
 * Nalepnice (S40): test isecanja - mreža 3×3 na zelenoj pozadini daje TAČNO 9
 * nalepnica 512 × 512, bez pozadine (providni uglovi, bez zelenih piksela), sa
 * likom u sredini, vazduhom do ivice i belim obrubom.
 */

import { describe, expect, test } from "vitest";

import {
  addOutline,
  alphaBounds,
  borderColor,
  fitIntoSquare,
  isStickerSheetPrompt,
  keyOutBackground,
  spriteFrameTimes,
  spriteLayout,
  spriteMeta,
  STICKER_EXPRESSIONS,
  STICKER_MARGIN,
  STICKER_SIZE,
  stickerFileName,
  stickersFromSheet,
  stickerSheetPrompt,
  type Rgba,
} from "./crea-sticker-pack";

const GREEN: [number, number, number] = [0, 255, 0];

function solid(width: number, height: number, color: [number, number, number]): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set([...color, 255], p * 4);
  return { data, width, height };
}

function paintCircle(image: Rgba, cx: number, cy: number, r: number, color: [number, number, number]) {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) image.data.set([...color, 255], (y * image.width + x) * 4);
    }
  }
}

const alphaAt = (image: Rgba, x: number, y: number) => image.data[(y * image.width + x) * 4 + 3]!;

/** Mreža 3×3 od 600 px: u svakom polju krug druge veličine (pa se vidi da je svaki isečen za sebe). */
function sheet(): Rgba {
  const image = solid(600, 600, GREEN);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      paintCircle(image, col * 200 + 100, row * 200 + 100, 30 + (row * 3 + col) * 5, [200, 40, 60]);
    }
  }
  return image;
}

describe("isecanje nalepnica", () => {
  test("mreža daje 9 fajlova 512 × 512 bez pozadine", () => {
    const stickers = stickersFromSheet(sheet(), { outline: true });
    expect(stickers).toHaveLength(9);
    for (const sticker of stickers) {
      expect(sticker.width).toBe(STICKER_SIZE);
      expect(sticker.height).toBe(STICKER_SIZE);
      expect(sticker.data.length).toBe(STICKER_SIZE * STICKER_SIZE * 4);
      // Uglovi i ivica su providni (pozadina je skinuta, margina postoji).
      for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511], [256, 2], [2, 256]] as const) expect(alphaAt(sticker, x, y)).toBe(0);
      // Lik je u sredini i neproziran.
      expect(alphaAt(sticker, 256, 256)).toBe(255);
      // Nijedan vidljiv piksel nije zelen (ni na ivici).
      let green = 0;
      for (let p = 0; p < STICKER_SIZE * STICKER_SIZE; p++) {
        const i = p * 4;
        if (sticker.data[i + 3]! < 32) continue;
        const [r, g, b] = [sticker.data[i]!, sticker.data[i + 1]!, sticker.data[i + 2]!];
        if (g > r + 40 && g > b + 40) green += 1;
      }
      expect(green).toBe(0);
      // Vazduh do ivice: ≥ 16 px.
      const bounds = alphaBounds(sticker, 0)!;
      expect(bounds.x).toBeGreaterThanOrEqual(STICKER_MARGIN - 1);
      expect(bounds.y).toBeGreaterThanOrEqual(STICKER_MARGIN - 1);
      expect(STICKER_SIZE - (bounds.x + bounds.width)).toBeGreaterThanOrEqual(STICKER_MARGIN - 1);
    }
  });

  test("beli obrub okružuje lik; bez obruba lik ide do margine", () => {
    const [withOutline] = stickersFromSheet(sheet(), { outline: true });
    const [plain] = stickersFromSheet(sheet(), { outline: false });
    // Krug je smešten po sredini; tik do njegove ivice je beo piksel kod obruba.
    const edge = alphaBounds(withOutline!, 127)!;
    const i = ((edge.y + 2) * STICKER_SIZE + 256) * 4;
    expect([withOutline!.data[i], withOutline!.data[i + 1], withOutline!.data[i + 2]]).toEqual([255, 255, 255]);
    const plainBounds = alphaBounds(plain!, 127)!;
    expect(plainBounds.width).toBeGreaterThan(edge.width - 4);
    expect(plainBounds.x).toBeLessThanOrEqual(STICKER_MARGIN + 1);
  });

  test("prazno polje daje providnu nalepnicu", () => {
    const empty = stickersFromSheet(solid(300, 300, GREEN), { outline: true });
    expect(empty).toHaveLength(9);
    for (const sticker of empty) expect(alphaBounds(sticker)).toBeNull();
  });

  test("zeleno UNUTAR lika ostaje (uklanja se samo pozadina povezana sa ivicom)", () => {
    const image = solid(100, 100, GREEN);
    paintCircle(image, 50, 50, 30, [20, 20, 160]);
    paintCircle(image, 50, 50, 5, GREEN);
    const keyed = keyOutBackground(image);
    expect(alphaAt(keyed, 0, 0)).toBe(0);
    expect(alphaAt(keyed, 50, 50)).toBe(255);
  });

  test("boja pozadine je medijana ivice, i kad lik dodiruje ivicu", () => {
    const image = solid(80, 80, [10, 250, 12]);
    paintCircle(image, 0, 40, 20, [255, 0, 0]);
    expect(borderColor(image)).toEqual([10, 250, 12]);
  });

  test("smeštanje u kvadrat čuva odnos stranica, obrub raste za poluprečnik", () => {
    const bar = solid(40, 10, [0, 0, 255]);
    const fitted = fitIntoSquare(bar, 100, 10);
    const bounds = alphaBounds(fitted, 127)!;
    expect(bounds.width).toBe(80);
    expect(bounds.height).toBe(20);
    const outlined = addOutline(fitted, 5);
    const grown = alphaBounds(outlined, 127)!;
    expect(grown.width).toBeGreaterThanOrEqual(89);
    expect(grown.height).toBeGreaterThanOrEqual(29);
  });

  test("opis mreže: 9 izraza, zelena pozadina, prepoznaje se po prvom redu", () => {
    const prompt = stickerSheetPrompt("images 1-2", "3d", "nosi kapu");
    expect(isStickerSheetPrompt(prompt)).toBe(true);
    expect(isStickerSheetPrompt("A 3×3 grid of nine frames")).toBe(false);
    expect(prompt).toContain("#00FF00");
    expect(prompt).toContain("images 1-2");
    for (const expression of STICKER_EXPRESSIONS) expect(prompt).toContain(expression.prompt);
    expect(STICKER_EXPRESSIONS).toHaveLength(9);
    expect(stickerFileName(2)).toBe("crea-nalepnica-3-ljubav.webp");
  });
});

describe("sprajt iz videa", () => {
  test("sličice su sredine jednakih delova, dug snimak se seče na 15 s", () => {
    expect(spriteFrameTimes(2, 4)).toEqual([0.25, 0.75, 1.25, 1.75]);
    expect(spriteFrameTimes(60, 2)).toEqual([3.75, 11.25]);
  });

  test("raspored je što kvadratniji, podaci za igricu se slažu", () => {
    expect(spriteLayout(12, 128)).toEqual({ columns: 4, rows: 3, width: 512, height: 384 });
    expect(spriteLayout(16, 64)).toEqual({ columns: 4, rows: 4, width: 256, height: 256 });
    expect(spriteMeta(8, 128, 12, "sprajt.png")).toEqual({ image: "sprajt.png", frameWidth: 128, frameHeight: 128, frames: 8, columns: 3, rows: 3, fps: 12 });
  });
});
