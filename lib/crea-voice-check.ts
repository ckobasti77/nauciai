/**
 * Provera snimka glasa pre kloniranja (Crea K22, A7): koliko ima govora, koliko
 * je jaka buka u pauzama, da li je pretiho ili „pucketa" (preglasno).
 *
 * Detektor govora je energetski (VAD po jačini okvira od 30 ms): buka je donjih
 * 10 % okvira, govor su okviri bar 12 dB iznad nje. Deterministički je i radi
 * na svakom uređaju bez modela - ODLUKA K22 umesto Silero VAD-a.
 */

export const VOICE_CHECK = {
  frameS: 0.03,
  /** Govor = okvir bar ovoliko iznad buke (dB). */
  speechOverNoiseDb: 12,
  /** Ispod ovoga je tišina bez obzira na buku (dBFS). */
  silenceDb: -50,
  /** Buka u pauzama glasnija od ovoga = bučna soba (dBFS). */
  maxNoiseDb: -45,
  /** Najmanja razlika govor - buka (dB). */
  minSnrDb: 15,
  /** Govor tiši od ovoga = pretiho (dBFS). */
  minSpeechDb: -35,
  /** Udeo uzoraka u zasićenju iznad kog snimak „pucketa". */
  maxClipping: 0.005,
} as const;

export type VoiceCheckVerdict = "ok" | "tisina" | "preglasno" | "tiho" | "bucno" | "prekratko";

export type VoiceCheck = {
  durationS: number;
  speechS: number;
  noiseDb: number;
  speechDb: number;
  snrDb: number;
  clipping: number;
  verdict: VoiceCheckVerdict;
};

function toDb(rms: number): number {
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return -100;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * (sorted.length - 1))))]!;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Jačina okvira u dBFS (RMS), redom. */
export function frameLevels(samples: Float32Array, sampleRate: number, frameS: number = VOICE_CHECK.frameS): number[] {
  const size = Math.max(1, Math.round(frameS * sampleRate));
  const levels: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let sum = 0;
    for (let index = start; index < start + size; index++) sum += samples[index]! * samples[index]!;
    levels.push(toDb(Math.sqrt(sum / size)));
  }
  return levels;
}

export function analyzeVoice(samples: Float32Array, sampleRate: number, minSpeechS: number): VoiceCheck {
  const levels = frameLevels(samples, sampleRate);
  const sorted = [...levels].sort((a, b) => a - b);
  const noiseDb = percentile(sorted, 0.1);
  const threshold = Math.max(noiseDb + VOICE_CHECK.speechOverNoiseDb, VOICE_CHECK.silenceDb);
  const speech = levels.filter((level) => level >= threshold).sort((a, b) => a - b);
  const speechDb = speech.length > 0 ? percentile(speech, 0.5) : -100;
  let clipped = 0;
  for (let index = 0; index < samples.length; index++) if (Math.abs(samples[index]!) >= 0.99) clipped += 1;
  const clipping = samples.length > 0 ? clipped / samples.length : 0;
  const speechS = speech.length * VOICE_CHECK.frameS;

  const verdict: VoiceCheckVerdict =
    speechS < 1
      ? "tisina"
      : clipping > VOICE_CHECK.maxClipping
        ? "preglasno"
        : speechDb < VOICE_CHECK.minSpeechDb
          ? "tiho"
          : noiseDb > VOICE_CHECK.maxNoiseDb || speechDb - noiseDb < VOICE_CHECK.minSnrDb
            ? "bucno"
            : speechS < minSpeechS
              ? "prekratko"
              : "ok";

  return {
    durationS: round1(samples.length / sampleRate),
    speechS: round1(speechS),
    noiseDb: round1(noiseDb),
    speechDb: round1(speechDb),
    snrDb: round1(speechDb - noiseDb),
    clipping: Math.round(clipping * 10000) / 10000,
    verdict,
  };
}

/** Merač za vreme snimanja: RMS bloka → 0..1 (‑60 dBFS = 0, 0 dBFS = 1). */
export function meterLevel(block: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < block.length; index++) sum += block[index]! * block[index]!;
  const db = toDb(Math.sqrt(sum / Math.max(1, block.length)));
  return Math.min(1, Math.max(0, (db + 60) / 60));
}

/** Mono uzorci spušteni na nižu frekvenciju (prosek prozora) - manji fajl za proveru pristanka. */
export function downsample(samples: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let index = 0; index < out.length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor++) sum += samples[cursor]!;
    out[index] = sum / Math.max(1, end - start);
  }
  return out;
}
