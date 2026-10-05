import { describe, expect, test } from "vitest";

import {
  basicTokens,
  CLIP_DIMENSIONS,
  CLIP_IMAGE_SIZE,
  clipCropRect,
  clipPixelValues,
  cosine,
  denseProject,
  l2Normalize,
  meanPool,
  parseVocab,
  readSafetensor,
  semanticHits,
  tokenizeForClip,
  wordPiece,
} from "./crea-clip";

/**
 * Deo pravog rečnika (`sentence-transformers/clip-ViT-B-32-multilingual-v1`, vocab.txt):
 * id-jevi su iz fajla, a očekivani nizovi su izlaz HF `tokenizers` biblioteke za iste
 * rečenice (provereno K16) - tokenizacija mora da se poklopi tačno.
 */
const VOCAB = new Map<string, number>([
  ["[UNK]", 100], ["[CLS]", 101], ["[SEP]", 102],
  ["D", 141], ["##ve", 10612], ["ma", 10824], ["##čke", 16795], ["sp", 32650], ["##ava", 15181], ["##ju", 10761],
  ["na", 10132], ["ka", 10730], ["##u", 10138], ["##ču", 25427], [".", 119],
  ["мач", 90532], ["##ка", 10521], ["на", 10122], ["к", 551], ["##ров", 15755], ["##у", 10227],
  ["Đ", 298], ["##or", 10667], ["##đe", 28292], ["'", 112], ["s", 187], ["3D", 17280], ["-", 118], ["print", 31210],
  [",", 117], ["50", 10462], ["##mm", 17525], ["!", 106],
]);

describe("tokenizacija (višejezični CLIP)", () => {
  test("isti id-jevi kao HF tokenizer za srpsku latinicu, ćirilicu i interpunkciju", () => {
    expect(tokenizeForClip("Dve mačke spavaju na kauču.", VOCAB)).toEqual([
      101, 141, 10612, 10824, 16795, 32650, 15181, 10761, 10132, 10730, 10138, 25427, 119, 102,
    ]);
    expect(tokenizeForClip("мачка на крову", VOCAB)).toEqual([101, 90532, 10521, 10122, 551, 15755, 10227, 102]);
    expect(tokenizeForClip("Đorđe's 3D-print, 50mm!", VOCAB)).toEqual([
      101, 298, 10667, 28292, 112, 187, 17280, 118, 31210, 117, 10462, 17525, 106, 102,
    ]);
  });

  test("nepoznata reč je [UNK], dug tekst se seče uz [SEP] na kraju", () => {
    expect(wordPiece("zzzz", VOCAB)).toEqual(["[UNK]"]);
    expect(basicTokens("a,b  c")).toEqual(["a", ",", "b", "c"]);
    const ids = tokenizeForClip(Array.from({ length: 100 }, () => "na").join(" "), VOCAB, 16);
    expect(ids).toHaveLength(16);
    expect(ids[0]).toBe(101);
    expect(ids[15]).toBe(102);
  });

  test("rečnik iz vocab.txt: id = broj reda", () => {
    expect(parseVocab("[PAD]\n[UNK]\r\nmačka\n").get("mačka")).toBe(2);
  });
});

describe("matematika vektora", () => {
  test("srednja vrednost samo pravih tokena, projekcija i normalizacija", () => {
    const hidden = new Float32Array([1, 2, 3, 5, 100, 100]);
    expect(Array.from(meanPool(hidden, [1, 1, 0], 2))).toEqual([2, 3.5]);
    expect(Array.from(denseProject(new Float32Array([1, 2]), new Float32Array([1, 0, 0, 1, 1, 1]), 3))).toEqual([1, 2, 3]);
    expect(() => denseProject(new Float32Array([1, 2]), new Float32Array(5), 3)).toThrow("CLIP_DENSE_SHAPE");
    const unit = l2Normalize([3, 4]);
    expect(unit[0]).toBeCloseTo(0.6);
    expect(unit[1]).toBeCloseTo(0.8);
    expect(l2Normalize([0, 0])).toEqual([0, 0]);
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test("tenzor iz .safetensors fajla", () => {
    const header = new TextEncoder().encode(JSON.stringify({ "linear.weight": { dtype: "F32", shape: [1, 2], data_offsets: [0, 8] } }));
    const buffer = new ArrayBuffer(8 + header.length + 8);
    new DataView(buffer).setBigUint64(0, BigInt(header.length), true);
    new Uint8Array(buffer, 8, header.length).set(header);
    new Float32Array(buffer.slice(8 + header.length)).set([0.5, -2]);
    const view = new DataView(buffer, 8 + header.length);
    view.setFloat32(0, 0.5, true);
    view.setFloat32(4, -2, true);
    const tensor = readSafetensor(buffer, "linear.weight");
    expect(tensor.shape).toEqual([1, 2]);
    expect(Array.from(tensor.data)).toEqual([0.5, -2]);
    expect(() => readSafetensor(buffer, "nema")).toThrow("CLIP_DENSE_SHAPE");
  });

  test("slika: centralni kvadrat i CLIP normalizacija po kanalu", () => {
    expect(clipCropRect(640, 480)).toEqual({ x: 80, y: 0, size: 480 });
    expect(clipCropRect(300, 900)).toEqual({ x: 0, y: 300, size: 300 });
    const plane = CLIP_IMAGE_SIZE * CLIP_IMAGE_SIZE;
    const rgba = new Uint8ClampedArray(plane * 4).fill(255);
    const pixels = clipPixelValues(rgba);
    expect(pixels).toHaveLength(plane * 3);
    expect(pixels[0]).toBeCloseTo((1 - 0.48145466) / 0.26862954, 5);
    expect(pixels[plane * 2]).toBeCloseTo((1 - 0.40821073) / 0.27577711, 5);
    expect(() => clipPixelValues(new Uint8ClampedArray(16))).toThrow("CLIP_IMAGE_SIZE");
    expect(CLIP_DIMENSIONS).toBe(512);
  });
});

describe("pogoci semantičke pretrage", () => {
  test("izmereni K16 primer: „mačka“ → samo fotka mačaka; slab upit ne vraća ništa", () => {
    // Sličnosti iz provere (10 fotki, višejezični CLIP): cats .248, corgi .205, butterfly .190.
    const hits = [
      { id: "corgi", score: 0.205 },
      { id: "cats", score: 0.248 },
      { id: "butterfly", score: 0.19 },
    ];
    expect(semanticHits(hits).map((hit) => hit.id)).toEqual(["cats"]);
    // Dva bliska pogotka ostaju oba, redom sličnosti.
    expect(semanticHits([{ id: "a", score: 0.22 }, { id: "b", score: 0.25 }]).map((hit) => hit.id)).toEqual(["b", "a"]);
    expect(semanticHits([{ id: "a", score: 0.15 }])).toEqual([]);
    expect(semanticHits([])).toEqual([]);
  });
});
