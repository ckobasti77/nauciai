/**
 * Semantička pretraga radova (K16, S43): čisti delovi CLIP-a koji rade u browseru.
 *
 * - slika → vektor: CLIP ViT-B/32 (`Xenova/clip-vit-base-patch32`, izlaz `image_embeds`, 512);
 * - tekst → vektor: višejezični CLIP tekst enkoder
 *   (`sentence-transformers/clip-ViT-B-32-multilingual-v1`): DistilBERT → srednja
 *   vrednost tokena → linearni sloj 768 → 512 (`2_Dense`, bez bias-a). Isti prostor
 *   kao slike, pa „crvena mačka na krovu" nalazi sliku bez ijedne oznake.
 *
 * Ovde je samo matematika (tokenizacija, pretprocesiranje, pooling, projekcija,
 * normalizacija) - bez ORT-a i bez browser API-ja, da bi se testirala. Modele
 * učitava `lib/crea-local-ai/runtime.ts`.
 */

export const CLIP_DIMENSIONS = 512;
export const CLIP_IMAGE_SIZE = 224;
const CLIP_MEAN = [0.48145466, 0.4578275, 0.40821073] as const;
const CLIP_STD = [0.26862954, 0.26130258, 0.27577711] as const;

/** Najviše tokena opisa (višejezični enkoder je treniran na kratkim rečenicama). */
export const CLIP_TEXT_MAX_TOKENS = 64;
const TEXT_HIDDEN = 768;

// ── Tekst: BERT WordPiece (multilingual cased: bez malih slova i bez skidanja kvačica) ──

export type WordPieceVocab = ReadonlyMap<string, number>;

export function parseVocab(vocabTxt: string): Map<string, number> {
  const vocab = new Map<string, number>();
  vocabTxt.split(/\r?\n/).forEach((token, index) => {
    if (token.length > 0 && !vocab.has(token)) vocab.set(token, index);
  });
  return vocab;
}

function isPunctuation(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if ((code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126)) {
    return true;
  }
  return /\p{P}/u.test(char);
}

function isCjk(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/** BERT „basic" tokenizacija: razmaci, interpunkcija i CJK znak su zasebni tokeni. */
export function basicTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  const flush = () => {
    if (current) tokens.push(current);
    current = "";
  };
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0 || code === 0xfffd || (/\p{Cc}/u.test(char) && !/\s/.test(char))) continue;
    if (/\s/u.test(char)) {
      flush();
    } else if (isPunctuation(char) || isCjk(code)) {
      flush();
      tokens.push(char);
    } else {
      current += char;
    }
  }
  flush();
  return tokens;
}

/** WordPiece: najduži prefiks iz rečnika, nastavak sa `##`; reč koja ne može → `[UNK]`. */
export function wordPiece(word: string, vocab: WordPieceVocab): string[] {
  const chars = Array.from(word);
  if (chars.length > 100) return ["[UNK]"];
  const pieces: string[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let found: string | null = null;
    while (start < end) {
      const piece = (start > 0 ? "##" : "") + chars.slice(start, end).join("");
      if (vocab.has(piece)) {
        found = piece;
        break;
      }
      end -= 1;
    }
    if (found === null) return ["[UNK]"];
    pieces.push(found);
    start = end;
  }
  return pieces;
}

/** Id-jevi tokena sa `[CLS]` … `[SEP]`, najviše `maxTokens` ukupno. */
export function tokenizeForClip(text: string, vocab: WordPieceVocab, maxTokens = CLIP_TEXT_MAX_TOKENS): number[] {
  const id = (token: string) => vocab.get(token) ?? vocab.get("[UNK]") ?? 100;
  const ids: number[] = [id("[CLS]")];
  for (const word of basicTokens(text)) {
    for (const piece of wordPiece(word, vocab)) {
      if (ids.length >= maxTokens - 1) break;
      ids.push(id(piece));
    }
  }
  ids.push(id("[SEP]"));
  return ids;
}

/** Srednja vrednost skrivenih stanja po tokenima (maska 1 = pravi token). */
export function meanPool(hidden: Float32Array, mask: readonly number[], dim = TEXT_HIDDEN): Float32Array {
  const out = new Float32Array(dim);
  let count = 0;
  mask.forEach((on, token) => {
    if (!on) return;
    count += 1;
    const offset = token * dim;
    for (let i = 0; i < dim; i += 1) out[i] += hidden[offset + i];
  });
  if (count > 0) for (let i = 0; i < dim; i += 1) out[i] /= count;
  return out;
}

/** `y = W·x` (W je `[out][in]`, kao `torch.nn.Linear.weight`). */
export function denseProject(input: Float32Array, weight: Float32Array, outDim = CLIP_DIMENSIONS): Float32Array {
  const inDim = input.length;
  if (weight.length !== outDim * inDim) throw new Error("CLIP_DENSE_SHAPE");
  const out = new Float32Array(outDim);
  for (let row = 0; row < outDim; row += 1) {
    let sum = 0;
    const offset = row * inDim;
    for (let col = 0; col < inDim; col += 1) sum += weight[offset + col] * input[col];
    out[row] = sum;
  }
  return out;
}

export function l2Normalize(vector: ArrayLike<number>): number[] {
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  return Array.from(vector, (value) => (norm > 0 ? value / norm : 0));
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/** Jedan F32 tenzor iz `.safetensors` fajla (8 B dužina zaglavlja, JSON, pa podaci). */
export function readSafetensor(buffer: ArrayBuffer, name: string): { shape: number[]; data: Float32Array } {
  const view = new DataView(buffer);
  const headerLength = Number(view.getBigUint64(0, true));
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength))) as Record<
    string,
    { dtype: string; shape: number[]; data_offsets: [number, number] }
  >;
  const entry = header[name];
  if (!entry || entry.dtype !== "F32") throw new Error("CLIP_DENSE_SHAPE");
  const [begin, end] = entry.data_offsets;
  const start = 8 + headerLength + begin;
  // Kopija: podaci u fajlu ne moraju biti poravnati na 4 bajta.
  const data = new Float32Array(buffer.slice(start, 8 + headerLength + end));
  return { shape: entry.shape, data };
}

// ── Slika ──────────────────────────────────────────────────────────────────

/** Kvadrat u sredini slike koji CLIP gleda (kraća stranica, pa centralni isečak). */
export function clipCropRect(width: number, height: number): { x: number; y: number; size: number } {
  const size = Math.min(width, height);
  return { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };
}

/** RGBA 224×224 → `pixel_values` [1, 3, 224, 224] (CLIP srednja vrednost i odstupanje). */
export function clipPixelValues(rgba: Uint8ClampedArray, size = CLIP_IMAGE_SIZE): Float32Array {
  const plane = size * size;
  if (rgba.length !== plane * 4) throw new Error("CLIP_IMAGE_SIZE");
  const out = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[c * plane + i] = (rgba[i * 4 + c] / 255 - CLIP_MEAN[c]) / CLIP_STD[c];
    }
  }
  return out;
}

/**
 * Koji pogoci semantičke pretrage su pravi: CLIP sličnost teksta i slike je mala
 * (izmereno K16 na 10 fotki i 14 srpskih upita: pogodak ≈0,24-0,32, ostalo
 * ≈0,15-0,22), pa važi pod (`floor`) i razmak od najboljeg pogotka (`margin`).
 */
export function semanticHits<T extends { score: number }>(hits: readonly T[], options: { floor?: number; margin?: number } = {}): T[] {
  const floor = options.floor ?? 0.2;
  const margin = options.margin ?? 0.04;
  const sorted = [...hits].sort((a, b) => b.score - a.score);
  const best = sorted[0]?.score ?? 0;
  return sorted.filter((hit) => hit.score >= floor && hit.score >= best - margin);
}
