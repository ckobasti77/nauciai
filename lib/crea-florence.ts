/**
 * „Kako je ovo napravljeno?" na uređaju (K16, S45): Florence-2-base-ft (MIT)
 * opisuje sliku rečenicama, bez servera i bez kredita, na računaru sa WebGPU-om.
 *
 * Model ide kroz `onnxruntime-web` direktno (kao K10/K11, bez transformers.js):
 * četiri grafa (`vision_encoder`, `embed_tokens`, `encoder_model`, `decoder_model`)
 * i pohlepno dekodiranje. Ovde su samo čisti delovi - pretprocesiranje, zabrana
 * ponavljanja, izbor sledećeg tokena i BPE dekodiranje - da bi se testirali.
 */

export const FLORENCE_IMAGE_SIZE = 768;
const FLORENCE_MEAN = [0.485, 0.456, 0.406] as const;
const FLORENCE_STD = [0.229, 0.224, 0.225] as const;

/** Zadatak `<MORE_DETAILED_CAPTION>`: „Describe with a paragraph what is shown in the image." (BART tokeni). */
export const FLORENCE_CAPTION_PROMPT_IDS = [0, 47066, 21700, 19, 10, 17818, 99, 16, 2343, 11, 5, 2274, 4, 2] as const;
export const FLORENCE_DECODER_START_ID = 2;
export const FLORENCE_BOS_ID = 0;
export const FLORENCE_EOS_ID = 2;
/** `generation_config.json`: ista trojka reči se ne ponavlja. */
export const FLORENCE_NO_REPEAT_NGRAM = 3;
export const FLORENCE_MAX_TOKENS = 160;

/** RGBA 768 × 768 → `pixel_values` [1, 3, 768, 768] (ImageNet srednja vrednost i odstupanje). */
export function florencePixelValues(rgba: Uint8ClampedArray, size = FLORENCE_IMAGE_SIZE): Float32Array {
  const plane = size * size;
  if (rgba.length !== plane * 4) throw new Error("FLORENCE_IMAGE_SIZE");
  const out = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1) out[c * plane + i] = (rgba[i * 4 + c] / 255 - FLORENCE_MEAN[c]) / FLORENCE_STD[c];
  }
  return out;
}

/** Tokeni koji bi ponovili već viđenu n-torku (kao `no_repeat_ngram_size` u transformers). */
export function bannedNextTokens(ids: readonly number[], n = FLORENCE_NO_REPEAT_NGRAM): Set<number> {
  const banned = new Set<number>();
  if (ids.length < n) return banned;
  const prefix = ids.slice(ids.length - (n - 1)).join(",");
  for (let i = 0; i + n <= ids.length; i += 1) {
    if (ids.slice(i, i + n - 1).join(",") === prefix) banned.add(ids[i + n - 1]);
  }
  return banned;
}

/**
 * Sledeći token iz logita poslednje pozicije: prvi korak je uvek BOS (`forced_bos`),
 * zabranjene n-torke se preskaču, inače najveći logit.
 */
export function nextToken(logits: Float32Array, generated: readonly number[]): number {
  if (generated.length === 1) return FLORENCE_BOS_ID;
  const banned = bannedNextTokens(generated);
  let best = -1;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < logits.length; i += 1) {
    if (banned.has(i)) continue;
    if (logits[i] > bestValue) {
      bestValue = logits[i];
      best = i;
    }
  }
  return best;
}

/** GPT-2 mapa bajt → vidljiv znak (BART koristi isti „byte-level" BPE). */
function byteDecoder(): Map<string, number> {
  const bytes: number[] = [];
  for (let b = 33; b <= 126; b += 1) bytes.push(b);
  for (let b = 161; b <= 172; b += 1) bytes.push(b);
  for (let b = 174; b <= 255; b += 1) bytes.push(b);
  const chars = [...bytes];
  let extra = 0;
  for (let b = 0; b < 256; b += 1) {
    if (!bytes.includes(b)) {
      bytes.push(b);
      chars.push(256 + extra);
      extra += 1;
    }
  }
  return new Map(chars.map((code, index) => [String.fromCharCode(code), bytes[index]]));
}

let decoderMap: Map<string, number> | null = null;

/** Id-jevi → tekst: tokeni iz `vocab.json`, bez posebnih (`<s>`, `</s>`, `<loc_…>`), pa UTF-8. */
export function decodeBpe(ids: readonly number[], idToToken: ReadonlyMap<number, string>): string {
  decoderMap ??= byteDecoder();
  const bytes: number[] = [];
  for (const id of ids) {
    const token = idToToken.get(id);
    if (!token || (token.startsWith("<") && token.endsWith(">"))) continue;
    for (const char of token) {
      const byte = decoderMap.get(char);
      if (byte !== undefined) bytes.push(byte);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\s+/g, " ").trim();
}

/** `vocab.json` (token → id) obrnut u id → token. */
export function invertVocab(vocab: Record<string, number>): Map<number, string> {
  return new Map(Object.entries(vocab).map(([token, id]) => [id, token]));
}
