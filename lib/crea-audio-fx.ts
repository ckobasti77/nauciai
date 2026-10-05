import type { CompressorPreset, EchoPreset } from "./crea-audio-edit";

/**
 * Efekti uređivača (Crea K24, A14) kao podaci: podešavanja kompresora, opsezi
 * ekvilajzera i PROCEDURALNI odjek (impulsni odziv se računa, ne preuzima se
 * nijedan fajl). Isti brojevi voze i pregled uživo i izvoz.
 */

export const EQ_BANDS = {
  low: { type: "lowshelf", frequency: 100 },
  mid: { type: "peaking", frequency: 1500, q: 0.8 },
  high: { type: "highshelf", frequency: 8000 },
} as const;

export type CompressorSettings = { threshold: number; knee: number; ratio: number; attack: number; release: number; makeupDb: number };

/** Blag: ujednači govor; jak: „radio" glas koji se čuje i na telefonu. */
export const COMPRESSOR_SETTINGS: Record<Exclude<CompressorPreset, "off">, CompressorSettings> = {
  blag: { threshold: -24, knee: 12, ratio: 3, attack: 0.01, release: 0.25, makeupDb: 4 },
  jak: { threshold: -32, knee: 6, ratio: 6, attack: 0.004, release: 0.18, makeupDb: 9 },
};

type ReverbSpec = { kind: "reverb"; seconds: number; predelay: number; damping: number };
type EchoSpec = { kind: "echo"; delay: number; feedback: number; repeats: number };

export const ECHO_SPECS: Record<Exclude<EchoPreset, "off">, ReverbSpec | EchoSpec> = {
  soba: { kind: "reverb", seconds: 0.5, predelay: 0.005, damping: 0.6 },
  sala: { kind: "reverb", seconds: 1.8, predelay: 0.02, damping: 0.35 },
  katedrala: { kind: "reverb", seconds: 4, predelay: 0.04, damping: 0.2 },
  eho: { kind: "echo", delay: 0.32, feedback: 0.45, repeats: 6 },
};

/** Koliko zvuka posle kraja dodaje odjek (rep se ne seče na izvozu). */
export function echoTailS(preset: EchoPreset): number {
  if (preset === "off") return 0;
  const spec = ECHO_SPECS[preset];
  return spec.kind === "reverb" ? Math.min(4, spec.seconds) : spec.delay * spec.repeats;
}

/** Deterministički šum (isti odjek svaki put, i u testu). */
function noise(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * Impulsni odziv (stereo). Odjek sobe/sale/katedrale: šum sa eksponencijalnim
 * opadanjem (−60 dB za `seconds`), levi i desni kanal različit šum (širina),
 * visoki tonovi opadaju brže (prigušenje jednopolnim filterom). Eho: ponavljanja
 * na `delay` koja slabe za `feedback`, naizmenično levo-desno.
 */
export function impulseResponse(preset: Exclude<EchoPreset, "off">, sampleRate: number): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const spec = ECHO_SPECS[preset];
  if (spec.kind === "echo") {
    const length = Math.ceil((spec.delay * spec.repeats + 0.05) * sampleRate);
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let repeat = 1; repeat <= spec.repeats; repeat++) {
      const at = Math.round(repeat * spec.delay * sampleRate);
      const gain = Math.pow(spec.feedback, repeat - 1) * 0.8;
      (repeat % 2 === 1 ? left : right)[at] = gain;
      (repeat % 2 === 1 ? right : left)[at] = gain * 0.35;
    }
    return [left, right];
  }
  const length = Math.ceil((spec.seconds + spec.predelay) * sampleRate);
  const start = Math.round(spec.predelay * sampleRate);
  const decay = Math.log(1000) / (spec.seconds * sampleRate); // −60 dB na kraju
  const out: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(length), new Float32Array(length)];
  out.forEach((channel, index) => {
    const random = noise(0x9e3779b9 + index * 7919);
    let low = 0;
    for (let at = start; at < length; at++) {
      const t = at - start;
      const raw = random() * Math.exp(-decay * t);
      // Prigušenje raste kako rep odmiče (sala zvuči tamnije pri kraju).
      const damping = Math.min(0.95, spec.damping + (t / (length - start)) * 0.3);
      low = low * damping + raw * (1 - damping);
      channel[at] = low;
    }
  });
  // Normalizacija energije: odjek ne sme da pojača ukupnu jačinu.
  let energy = 0;
  for (const channel of out) for (const value of channel) energy += value * value;
  const scale = energy > 0 ? 1 / Math.sqrt(energy / 2) : 0;
  for (const channel of out) for (let at = 0; at < channel.length; at++) channel[at]! *= scale * 0.5;
  return out;
}
