import { describe, expect, test } from "vitest";

import { CREA_SCENE_COLORS, parseScene } from "./crea-editor-scene";
import {
  groupLines,
  linesFromOcr,
  padBox,
  sceneWithText,
  textColorIn,
  textMask,
  textNodeForLine,
  type OcrBlocks,
} from "./crea-text-layer";

const blocks: OcrBlocks = [
  {
    paragraphs: [
      {
        lines: [
          { text: "Ђурђевдан у Чачку\n", confidence: 91, bbox: { x0: 100, y0: 300, x1: 700, y1: 360 } },
          { text: "Žuta kuća — čaj, ćevapi, šljive, đak", confidence: 88, bbox: { x0: 80, y0: 100, x1: 900, y1: 150 } },
          { text: "~", confidence: 12, bbox: { x0: 10, y0: 10, x1: 14, y1: 14 } },
          { text: "", confidence: 95, bbox: { x0: 0, y0: 0, x1: 100, y1: 40 } },
          { text: "sitno", confidence: 90, bbox: { x0: 0, y0: 500, x1: 20, y1: 503 } },
        ],
      },
    ],
  },
];

describe("redovi iz Tesseract-a", () => {
  test("odozgo nadole, bez šuma, praznih i nečitljivo sitnih redova; slova ostaju tačna", () => {
    const lines = linesFromOcr(blocks);
    expect(lines.map((line) => line.text)).toEqual(["Žuta kuća — čaj, ćevapi, šljive, đak", "Ђурђевдан у Чачку"]);
    expect(lines[0]!.box).toEqual({ x: 80, y: 100, width: 820, height: 50 });
    expect(new Set(lines.map((line) => line.id)).size).toBe(2);
  });

  test("koordinate se vraćaju na original kad je prepoznavanje radilo na umanjenoj kopiji", () => {
    const lines = linesFromOcr(blocks, 0.5);
    expect(lines[0]!.box).toEqual({ x: 160, y: 200, width: 1640, height: 100 });
  });

  test("prazan ili neispravan odgovor daje prazan spisak", () => {
    expect(linesFromOcr(null)).toEqual([]);
    expect(linesFromOcr([{}])).toEqual([]);
    expect(linesFromOcr([{ paragraphs: [{ lines: [{ text: "bez okvira" }] }] }])).toEqual([]);
  });
});

describe("maska za brisanje starog teksta", () => {
  test("okvir se proširi za deo visine reda i ostaje u slici", () => {
    // Pad = 22 % visine (11 px): levo i gore se seče na ivicu slike.
    expect(padBox({ x: 10, y: 10, width: 100, height: 50 }, 1000, 1000)).toEqual({ x: 0, y: 0, width: 121, height: 71 });
    expect(padBox({ x: 100, y: 100, width: 100, height: 50 }, 1000, 1000)).toEqual({ x: 89, y: 89, width: 122, height: 72 });
    const edge = padBox({ x: 950, y: 970, width: 50, height: 30 }, 1000, 1000);
    expect(edge.x + edge.width).toBeLessThanOrEqual(1000);
    expect(edge.y + edge.height).toBeLessThanOrEqual(1000);
  });

  test("maska je 255 u okvirima redova i 0 svuda drugde", () => {
    const mask = textMask([{ x: 2, y: 2, width: 4, height: 2 }], 20, 10);
    expect(mask[4 * 20 + 4]).toBe(255);
    expect(mask[9 * 20 + 19]).toBe(0);
    expect(mask.filter((value) => value === 255).length).toBeGreaterThan(8);
    expect(mask.every((value) => value === 0 || value === 255)).toBe(true);
  });

  test("bliski redovi se brišu zajedno, udaljeni posebno", () => {
    const groups = groupLines([
      { box: { x: 0, y: 500, width: 10, height: 20 } },
      { box: { x: 0, y: 100, width: 10, height: 20 } },
      { box: { x: 0, y: 130, width: 10, height: 20 } },
    ]);
    expect(groups.map((group) => group.map((line) => line.box.y))).toEqual([[100, 130], [500]]);
    expect(groupLines([])).toEqual([]);
  });
});

describe("boja teksta", () => {
  function image(width: number, height: number, background: [number, number, number], text: [number, number, number]) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isText = x > 2 && x < width - 3 && y > 2 && y < height - 3 && (x + y) % 3 === 0;
        const [r, g, b] = isText ? text : background;
        const i = (y * width + x) * 4;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
    }
    return rgba;
  }

  test("tamna slova na svetloj pozadini i svetla na tamnoj", () => {
    expect(textColorIn(image(30, 12, [250, 245, 235], [14, 49, 88]), 30, { x: 0, y: 0, width: 30, height: 12 })).toBe("#0e3158");
    expect(textColorIn(image(30, 12, [20, 20, 20], [244, 190, 48]), 30, { x: 0, y: 0, width: 30, height: 12 })).toBe("#f4be30");
  });
});

describe("tekst kao sloj editora", () => {
  test("red postaje Nunito tekst na starom mestu, sa istim slovima (č ć š ž đ, ćirilica)", () => {
    const node = textNodeForLine({ id: "red-1", text: "Ђурђевдан — čćšžđ", box: { x: 100, y: 200, width: 600, height: 46 } }, "#0e3158", 0.5);
    expect(node).toMatchObject({ kind: "text", text: "Ђурђевдан — čćšžđ", font: "nunito", x: 50, y: 100, fill: "#0e3158", fit: false });
    expect(node.fontSize).toBe(20);
    expect(node.width).toBeGreaterThan(300);
  });

  test("scena: zaključana fotka dole, tekstovi iznad; prolazi proveru scene; prazni redovi otpadaju", () => {
    const scene = sceneWithText(
      { id: "slika-1", width: 4000, height: 3000 },
      [
        { id: "red-1", text: "Žuta kuća", box: { x: 400, y: 300, width: 1200, height: 120 }, color: "#0e3158" },
        { id: "red-2", text: "   ", box: { x: 0, y: 0, width: 10, height: 10 }, color: "#000000" },
      ],
      4000,
    );
    expect(scene.width).toBe(2048);
    expect(scene.height).toBe(1536);
    expect(scene.background).toBe(CREA_SCENE_COLORS.bela);
    expect(scene.nodes.map((node) => node.kind)).toEqual(["image", "text"]);
    expect(scene.nodes[0]).toMatchObject({ locked: true, asset: "slika-1", width: 2048, height: 1536 });
    expect(scene.nodes[1]).toMatchObject({ x: 205, y: 154, text: "Žuta kuća" });
    expect(parseScene(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
  });
});
