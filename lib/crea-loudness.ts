/**
 * Glasnoća po ITU-R BS.1770-4 (Crea K24, A14): čista logika, bez browser API-ja.
 *
 * - K-filter: dva bikvadratna filtra (visoka polica ~1,7 kHz +4 dB i visokopropusni
 *   ~38 Hz). Koeficijenti se računaju za BILO KOJU frekvenciju uzorkovanja iz
 *   analognog prototipa (isti postupak kao libebur128); na 48 kHz daju tačno
 *   brojke iz tabela standarda (test to proverava).
 * - Integrisana glasnoća: blokovi od 400 ms sa preklapanjem 75 %, apsolutna kapija
 *   −70 LUFS i relativna kapija −10 LU.
 * - Pravi vrh (true peak): 4× nadsemplovanje (Annex 2), ovde prozorom-oblikovanim
 *   sinc interpolatorom od 12 tačaka po fazi.
 * - Normalizacija: pojačanje do cilja (npr. −14 LUFS za mreže) pa limiter sa
 *   pogledom unapred koji drži vrh ispod plafona (−1 dB), bez izobličenja „seckanjem".
 */

export type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** Ciljevi glasnoće koje korisnik bira („za mreže" je podrazumevano). */
export const LOUDNESS_TARGETS = {
  mreze: -14,
  podkast: -16,
} as const;
export type LoudnessTargetId = keyof typeof LOUDNESS_TARGETS | "isto";

/** Plafon vrha posle normalizacije (dBTP) - preporuka platformi. */
export const PEAK_CEILING_DB = -1;
/** Najviše pojačanje koje normalizacija sme da da (tih snimak ne postaje šum). */
export const MAX_NORMALIZE_GAIN_DB = 24;

const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;
const BLOCK_S = 0.4;
const STEP_S = 0.1;

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function linearToDb(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : Number.NEGATIVE_INFINITY;
}

/** Koeficijenti K-filtra za frekvenciju uzorkovanja `sampleRate`. */
export function kWeightingCoefficients(sampleRate: number): { shelf: Biquad; highpass: Biquad } {
  // Faza 1: visoka polica (glava kao kugla).
  const f0 = 1681.974450955533;
  const gainDb = 3.999843853973347;
  const q = 0.7071752369554196;
  const k1 = Math.tan((Math.PI * f0) / sampleRate);
  const vh = Math.pow(10, gainDb / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a0 = 1 + k1 / q + k1 * k1;
  const shelf: Biquad = {
    b0: (vh + (vb * k1) / q + k1 * k1) / a0,
    b1: (2 * (k1 * k1 - vh)) / a0,
    b2: (vh - (vb * k1) / q + k1 * k1) / a0,
    a1: (2 * (k1 * k1 - 1)) / a0,
    a2: (1 - k1 / q + k1 * k1) / a0,
  };
  // Faza 2: visokopropusni (RLB).
  const f1 = 38.13547087602444;
  const q1 = 0.5003270373238773;
  const k2 = Math.tan((Math.PI * f1) / sampleRate);
  const d = 1 + k2 / q1 + k2 * k2;
  const highpass: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (k2 * k2 - 1)) / d, a2: (1 - k2 / q1 + k2 * k2) / d };
  return { shelf, highpass };
}

/** Kvadrat K-filtriranog kanala (filter u direktnom obliku II, transponovan). */
function kWeightedSquares(samples: Float32Array, filters: { shelf: Biquad; highpass: Biquad }): Float64Array {
  const out = new Float64Array(samples.length);
  const s = filters.shelf;
  const h = filters.highpass;
  let s1 = 0;
  let s2 = 0;
  let h1 = 0;
  let h2 = 0;
  for (let index = 0; index < samples.length; index++) {
    const x = samples[index]!;
    const y = s.b0 * x + s1;
    s1 = s.b1 * x - s.a1 * y + s2;
    s2 = s.b2 * x - s.a2 * y;
    const z = h.b0 * y + h1;
    h1 = h.b1 * y - h.a1 * z + h2;
    h2 = h.b2 * y - h.a2 * z;
    out[index] = z * z;
  }
  return out;
}

/** Glasnoća bloka iz srednjih kvadrata kanala (težine kanala L/R/C = 1). */
function blockLoudness(meanSquareSum: number): number {
  return meanSquareSum > 0 ? -0.691 + 10 * Math.log10(meanSquareSum) : Number.NEGATIVE_INFINITY;
}

/**
 * Srednji kvadrati blokova od 400 ms (korak 100 ms) po kanalu, sabrani preko kanala.
 * Snimak kraći od jednog bloka je jedan blok cele dužine.
 */
function blockPowers(channels: readonly Float32Array[], sampleRate: number): number[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0) return [];
  const filters = kWeightingCoefficients(sampleRate);
  const step = Math.max(1, Math.round(STEP_S * sampleRate));
  const block = Math.max(step, Math.round(BLOCK_S * sampleRate));
  const segments = Math.ceil(length / step);
  const segmentSums = new Float64Array(segments);
  for (const channel of channels) {
    const squares = kWeightedSquares(channel, filters);
    for (let index = 0; index < length; index++) segmentSums[Math.floor(index / step)]! += squares[index]!;
  }
  if (length < block) {
    let total = 0;
    for (const sum of segmentSums) total += sum;
    return [total / length];
  }
  const perBlock = Math.round(block / step);
  const count = Math.floor((length - block) / step) + 1;
  const powers: number[] = [];
  for (let start = 0; start < count; start++) {
    let total = 0;
    for (let offset = 0; offset < perBlock; offset++) total += segmentSums[start + offset]!;
    powers.push(total / block);
  }
  return powers;
}

/** Integrisana glasnoća (LUFS); tišina = −∞. */
export function integratedLoudness(channels: readonly Float32Array[], sampleRate: number): number {
  const powers = blockPowers(channels, sampleRate);
  const absolute = powers.filter((power) => blockLoudness(power) > ABSOLUTE_GATE_LUFS);
  if (absolute.length === 0) return Number.NEGATIVE_INFINITY;
  const relativeGate = blockLoudness(absolute.reduce((sum, power) => sum + power, 0) / absolute.length) + RELATIVE_GATE_LU;
  const gated = absolute.filter((power) => blockLoudness(power) > relativeGate);
  if (gated.length === 0) return Number.NEGATIVE_INFINITY;
  return blockLoudness(gated.reduce((sum, power) => sum + power, 0) / gated.length);
}

export function samplePeak(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index++) {
      const value = Math.abs(channel[index]!);
      if (value > peak) peak = value;
    }
  }
  return peak;
}

const TAPS_HALF = 6;
const PHASES = [0.25, 0.5, 0.75] as const;

/** Težine interpolatora za fazu `phase` (sinc × Blackman prozor, zbir = 1). */
const INTERPOLATOR: readonly Float64Array[] = PHASES.map((phase) => {
  const weights = new Float64Array(TAPS_HALF * 2);
  let sum = 0;
  for (let tap = 0; tap < weights.length; tap++) {
    const distance = phase - (tap - TAPS_HALF + 1);
    const sinc = distance === 0 ? 1 : Math.sin(Math.PI * distance) / (Math.PI * distance);
    const position = (distance + TAPS_HALF) / (TAPS_HALF * 2);
    const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * position) + 0.08 * Math.cos(4 * Math.PI * position);
    weights[tap] = sinc * window;
    sum += weights[tap]!;
  }
  for (let tap = 0; tap < weights.length; tap++) weights[tap]! /= sum;
  return weights;
});

/**
 * Pravi vrh (linearno). Interpolira se samo oko uzoraka koji su blizu najvišeg
 * uzorka (−6 dB) - vrh između uzoraka ne može biti mnogo viši od susednih uzoraka
 * kod stvarnog zvuka, a ceo snimak od 10 minuta se tako meri za delić sekunde.
 */
export function truePeak(channels: readonly Float32Array[]): number {
  const peak = samplePeak(channels);
  if (peak === 0) return 0;
  const near = peak * dbToLinear(-6);
  let best = peak;
  for (const channel of channels) {
    for (let index = 0; index < channel.length - 1; index++) {
      if (Math.abs(channel[index]!) < near && Math.abs(channel[index + 1]!) < near) continue;
      for (const weights of INTERPOLATOR) {
        let value = 0;
        for (let tap = 0; tap < weights.length; tap++) {
          const at = index + tap - TAPS_HALF + 1;
          if (at >= 0 && at < channel.length) value += channel[at]! * weights[tap]!;
        }
        const magnitude = Math.abs(value);
        if (magnitude > best) best = magnitude;
      }
    }
  }
  return best;
}

export type LoudnessMeasure = {
  /** Integrisana glasnoća (LUFS), −∞ za tišinu. */
  integratedLufs: number;
  samplePeakDb: number;
  truePeakDb: number;
  durationS: number;
};

export function measureLoudness(channels: readonly Float32Array[], sampleRate: number): LoudnessMeasure {
  return {
    integratedLufs: integratedLoudness(channels, sampleRate),
    samplePeakDb: linearToDb(samplePeak(channels)),
    truePeakDb: linearToDb(truePeak(channels)),
    durationS: (channels[0]?.length ?? 0) / sampleRate,
  };
}

/** Pojačanje (dB) koje dovodi snimak na cilj; tišina ili „isto" = 0. */
export function normalizationGainDb(measuredLufs: number, targetLufs: number, maxGainDb = MAX_NORMALIZE_GAIN_DB): number {
  if (!Number.isFinite(measuredLufs)) return 0;
  return Math.max(-maxGainDb, Math.min(maxGainDb, targetLufs - measuredLufs));
}

export function applyGain(channels: readonly Float32Array[], gainDb: number): Float32Array<ArrayBuffer>[] {
  const gain = dbToLinear(gainDb);
  return channels.map((channel) => {
    const out = new Float32Array(channel.length);
    for (let index = 0; index < channel.length; index++) out[index] = channel[index]! * gain;
    return out;
  });
}

export type LimiterOptions = { ceilingDb: number; lookaheadMs: number; releaseMs: number };
export const DEFAULT_LIMITER: LimiterOptions = { ceilingDb: PEAK_CEILING_DB, lookaheadMs: 5, releaseMs: 80 };

/**
 * Limiter sa pogledom unapred, isti za sve kanale (slika se ne pomera):
 * 1. potrebno pojačanje po uzorku `g[n] = min(1, plafon / |x[n]|)`;
 * 2. minimum unapred preko prozora L (`m[n] = min g[n..n+L-1]`);
 * 3. pokretni prosek unazad preko istog prozora - glatko spuštanje koje je uvek ≤ g[n]
 *    (svaki član proseka je minimum prozora koji sadrži n), pa izlaz NIKAD ne prelazi plafon;
 * 4. sporo vraćanje (release) - ali nikad iznad koraka 3.
 */
export function limitPeaks(channels: readonly Float32Array[], sampleRate: number, options: Partial<LimiterOptions> = {}): Float32Array<ArrayBuffer>[] {
  const { ceilingDb, lookaheadMs, releaseMs } = { ...DEFAULT_LIMITER, ...options };
  const length = channels[0]?.length ?? 0;
  const ceiling = dbToLinear(ceilingDb);
  if (length === 0 || samplePeak(channels) <= ceiling) return channels.map((channel) => channel.slice());
  const window = Math.max(1, Math.round((lookaheadMs / 1000) * sampleRate));

  const needed = new Float64Array(length);
  for (let index = 0; index < length; index++) {
    let peak = 0;
    for (const channel of channels) peak = Math.max(peak, Math.abs(channel[index]!));
    needed[index] = peak > ceiling ? ceiling / peak : 1;
  }

  // Minimum unapred (deque indeksa sa rastućim vrednostima).
  const ahead = new Float64Array(length);
  const deque = new Int32Array(length);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let index = 0; index < length; index++) {
    const end = Math.min(length - 1, index + window - 1);
    while (next <= end) {
      while (tail > head && needed[deque[tail - 1]!]! >= needed[next]!) tail--;
      deque[tail++] = next++;
    }
    while (deque[head]! < index) head++;
    ahead[index] = needed[deque[head]!]!;
  }

  // Pokretni prosek unazad (prozor L), pa sporo vraćanje.
  const release = 1 - Math.exp(-1 / Math.max(1, (releaseMs / 1000) * sampleRate));
  const gains = new Float64Array(length);
  let sum = 0;
  let current = 1;
  for (let index = 0; index < length; index++) {
    sum += ahead[index]!;
    // Pre početka snimka „ahead" je 1 (ništa se ne smanjuje).
    const outgoing = index - window >= 0 ? ahead[index - window]! : 1;
    if (index - window >= 0) sum -= outgoing;
    const filled = index + 1 >= window ? sum : sum + (window - index - 1);
    const smooth = Math.min(1, filled / window);
    current = Math.min(smooth, current + (1 - current) * release);
    gains[index] = current;
  }

  return channels.map((channel) => {
    const out = new Float32Array(length);
    for (let index = 0; index < length; index++) {
      // Zaokruživanje u float32 ne sme da probije plafon.
      const value = channel[index]! * gains[index]!;
      out[index] = Math.max(-ceiling, Math.min(ceiling, value));
    }
    return out;
  });
}

export type NormalizeResult = {
  channels: Float32Array<ArrayBuffer>[];
  gainDb: number;
  before: LoudnessMeasure;
  after: LoudnessMeasure;
};

/**
 * Snimak na ciljnu glasnoću uz vrh ispod plafona. Limiter skida malo glasnoće,
 * pa se razlika nadoknadi još najviše tri puta (konvergira za stvaran govor i muziku).
 * Plafon za uzorke je 0,3 dB ispod traženog da bi i PRAVI vrh ostao ispod njega.
 */
export function normalizeLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
  targetLufs: number,
  ceilingDb = PEAK_CEILING_DB,
): NormalizeResult {
  const before = measureLoudness(channels, sampleRate);
  if (!Number.isFinite(before.integratedLufs)) {
    return { channels: channels.map((channel) => channel.slice()), gainDb: 0, before, after: before };
  }
  let gainDb = normalizationGainDb(before.integratedLufs, targetLufs);
  let out = limitPeaks(applyGain(channels, gainDb), sampleRate, { ceilingDb: ceilingDb - 0.3 });
  let loudness = integratedLoudness(out, sampleRate);
  for (let round = 0; round < 3 && Number.isFinite(loudness) && targetLufs - loudness > 0.1; round++) {
    const extra = Math.min(targetLufs - loudness, MAX_NORMALIZE_GAIN_DB - gainDb);
    if (extra <= 0.05) break;
    gainDb += extra;
    out = limitPeaks(applyGain(channels, gainDb), sampleRate, { ceilingDb: ceilingDb - 0.3 });
    loudness = integratedLoudness(out, sampleRate);
  }
  return { channels: out, gainDb, before, after: measureLoudness(out, sampleRate) };
}
