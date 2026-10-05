/**
 * Brisanje tišine (Crea K24, A14): od verovatnoće govora po okviru (Silero VAD na
 * uređaju, ili jačina zvuka kad model ne može da se učita) do opsega koji se
 * brišu. Čista logika, bez modela - testovi je voze sintetičkim nizovima.
 *
 * Pauze se ne brišu do kraja: duga pauza se SKRATI na `keepS` (pola ostaje pre,
 * pola posle), pa govor i dalje diše. Kratke pauze između reči se ne diraju.
 */

export type SpeechOptions = {
  /** Okvir postaje govor iznad ovoga… */
  positive: number;
  /** …i ostaje govor dok ne padne ispod ovoga (histereza, kao Silero). */
  negative: number;
  /** Govor kraći od ovoga je šum (klik, udarac). */
  minSpeechS: number;
  /** Rezerva oko govora - da se ne odseče početak i kraj reči. */
  padS: number;
  /** Rupa kraća od ovoga unutar govora se zatvara. */
  bridgeS: number;
};

export const DEFAULT_SPEECH: SpeechOptions = { positive: 0.5, negative: 0.35, minSpeechS: 0.12, padS: 0.1, bridgeS: 0.2 };

export type SilenceOptions = {
  /** Pauza od ovoliko ili duža se skraćuje. */
  minSilenceS: number;
  /** Koliko pauze ostaje posle skraćivanja. */
  keepS: number;
};

export const SILENCE_PRESETS = {
  blago: { minSilenceS: 1.2, keepS: 0.6 },
  srednje: { minSilenceS: 0.7, keepS: 0.35 },
  jako: { minSilenceS: 0.4, keepS: 0.2 },
} as const satisfies Record<string, SilenceOptions>;
export type SilencePresetId = keyof typeof SILENCE_PRESETS;

export type Range = [number, number];

const round = (value: number) => Math.round(value * 1e4) / 1e4;

/** Delovi sa govorom (s), iz verovatnoće po okviru dužine `frameS`. */
export function speechSegments(probabilities: ArrayLike<number>, frameS: number, options: Partial<SpeechOptions> = {}): Range[] {
  const { positive, negative, minSpeechS, padS, bridgeS } = { ...DEFAULT_SPEECH, ...options };
  const total = probabilities.length * frameS;
  const raw: Range[] = [];
  let start: number | null = null;
  for (let index = 0; index < probabilities.length; index++) {
    const value = probabilities[index]!;
    if (start === null && value >= positive) start = index;
    else if (start !== null && value < negative) {
      raw.push([start * frameS, index * frameS]);
      start = null;
    }
  }
  if (start !== null) raw.push([start * frameS, total]);

  // Zatvori kratke rupe, odbaci prekratke delove, pa dodaj rezervu.
  const bridged: Range[] = [];
  for (const range of raw) {
    const last = bridged[bridged.length - 1];
    if (last && range[0] - last[1] < bridgeS) last[1] = range[1];
    else bridged.push([range[0], range[1]]);
  }
  const padded: Range[] = [];
  for (const [a, b] of bridged) {
    if (b - a < minSpeechS) continue;
    const range: Range = [Math.max(0, a - padS), Math.min(total, b + padS)];
    const last = padded[padded.length - 1];
    if (last && range[0] <= last[1]) last[1] = range[1];
    else padded.push(range);
  }
  return padded.map(([a, b]) => [round(a), round(b)]);
}

/**
 * Opsezi za brisanje: svaka pauza od `minSilenceS` ili duža (i tišina na početku i
 * kraju) se skrati tako da ostane `keepS` (na ivicama snimka ostaje pola toga).
 * Bez ijednog dela govora ne briše se ništa - bolje ništa nego ceo snimak.
 */
export function silenceCuts(speech: readonly Range[], durationS: number, options: SilenceOptions): Range[] {
  if (speech.length === 0 || durationS <= 0) return [];
  const { minSilenceS, keepS } = options;
  const cuts: Range[] = [];
  const edge = keepS / 2;
  const first = speech[0]!;
  if (first[0] > edge + 0.05) cuts.push([0, first[0] - edge]);
  for (let index = 1; index < speech.length; index++) {
    const gapStart = speech[index - 1]![1];
    const gapEnd = speech[index]![0];
    const gap = gapEnd - gapStart;
    if (gap < minSilenceS || gap <= keepS) continue;
    cuts.push([gapStart + keepS / 2, gapEnd - keepS / 2]);
  }
  const last = speech[speech.length - 1]!;
  if (durationS - last[1] > edge + 0.05) cuts.push([last[1] + edge, durationS]);
  return cuts.map(([a, b]) => [round(a), round(b)] as Range).filter(([a, b]) => b - a > 0.01);
}

export function totalSeconds(ranges: readonly Range[]): number {
  return round(ranges.reduce((sum, [a, b]) => sum + (b - a), 0));
}

/**
 * Rezervni detektor (kad Silero ne može da se učita): jačina po okviru u odnosu
 * na pod buke (donjih 10 % okvira). Govor je ≥ 12 dB iznad poda - isto pravilo kao
 * provera glasa u K22 - a prelaz je mekan (6 dB), pa radi sa istim pragovima.
 */
export function energyProbabilities(samples: Float32Array, sampleRate: number, frameS: number): Float32Array {
  const frame = Math.max(1, Math.round(frameS * sampleRate));
  const count = Math.floor(samples.length / frame);
  const levels = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    let sum = 0;
    for (let at = index * frame; at < (index + 1) * frame; at++) sum += samples[at]! * samples[at]!;
    levels[index] = 10 * Math.log10(sum / frame + 1e-12);
  }
  const sorted = Array.from(levels).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -120;
  const out = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const above = levels[index]! - Math.max(floor, -90);
    // 12 dB iznad poda = 0,5; 18 dB = 1; 6 dB = 0.
    out[index] = Math.max(0, Math.min(1, (above - 6) / 12));
    // Apsolutna tišina nije govor ni u tihom snimku.
    if (levels[index]! < -60) out[index] = 0;
  }
  return out;
}
