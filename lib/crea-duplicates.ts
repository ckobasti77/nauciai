/**
 * Duplikati u biblioteci (K16, S43): perceptualni otisak slike (blockhash) i
 * grupisanje radova čiji se otisci razlikuju u malo bitova - ista slika
 * sačuvana dvaput, ista slika u drugom formatu ili veličini, skoro ista
 * varijacija. Radi na uređaju (0 kredita); čista funkcija nad pikselima, pa se
 * testira bez browsera. Smanjivanje na `BLOCKHASH_SIZE` radi platno pozivaoca.
 */

/** Slika se pre otiska smanji na 64 × 64; blok je 4 × 4 piksela → 16 × 16 = 256 bitova. */
export const BLOCKHASH_SIZE = 64;
const BITS = 16;
/** Najviše različitih bitova (od 256) da bi dve slike bile „ista". */
export const DUPLICATE_MAX_DISTANCE = 12;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
}

/**
 * Blockhash (Yang i sar.): zbir svetline po bloku, pa bit = blok svetliji od
 * medijane svoje četvrtine slike. Providan piksel se računa kao beo (isečak bez
 * pozadine i isti isečak na beloj pozadini daju isti otisak). Vraća 64 heks znaka.
 */
export function blockhash(rgba: Uint8ClampedArray, size = BLOCKHASH_SIZE): string {
  if (rgba.length !== size * size * 4 || size % BITS !== 0) throw new Error("BLOCKHASH_SIZE");
  const block = size / BITS;
  const values: number[] = [];
  for (let by = 0; by < BITS; by += 1) {
    for (let bx = 0; bx < BITS; bx += 1) {
      let sum = 0;
      for (let y = by * block; y < (by + 1) * block; y += 1) {
        for (let x = bx * block; x < (bx + 1) * block; x += 1) {
          const i = (y * size + x) * 4;
          sum += rgba[i + 3] === 0 ? 765 : rgba[i] + rgba[i + 1] + rgba[i + 2];
        }
      }
      values.push(sum);
    }
  }
  const band = values.length / 4;
  const bits: number[] = [];
  for (let b = 0; b < 4; b += 1) {
    const slice = values.slice(b * band, (b + 1) * band);
    const m = median(slice);
    for (const value of slice) bits.push(value > m ? 1 : 0);
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  }
  return hex;
}

/** Broj različitih bitova dva otiska iste dužine. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

/**
 * Grupe duplikata (bar dva rada), povezane prelazno: A≈B i B≈C su jedna grupa.
 * Redosled u grupi i grupa prati ulaz (pozivalac daje najnoviji rad prvi, pa je
 * prvi u grupi „original" koji ostaje, a ostali su predlog za brisanje).
 */
export function duplicateGroups<T extends { id: string; hash: string }>(
  items: readonly T[],
  maxDistance = DUPLICATE_MAX_DISTANCE,
): T[][] {
  const parent = items.map((_, index) => index);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (hammingDistance(items[i].hash, items[j].hash) <= maxDistance) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }
  const groups = new Map<number, T[]>();
  items.forEach((item, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), item]);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}
