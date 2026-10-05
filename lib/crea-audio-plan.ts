import {
  AUDIO_SPEED_RANGE,
  clipPassLength,
  clipSourceLength,
  mainLayout,
  mediaKey,
  timelineDuration,
  type CreaTimelineV1,
  type MediaRef,
} from "./crea-timeline";

/**
 * Zvuk montaže (Crea K19, V24; plan K17 §1.4): šta svira kada, kojom brzinom i
 * jačinom, i kriva utišavanja muzike ispod govora. Čiste funkcije - sam miks
 * (`OfflineAudioContext`) je u `components/crea/video/engine/audio-mix.ts`, a
 * pregled pušta ISTI izmiksovan zvuk kao izvoz.
 *
 * Pravila za zvuk video klipa (K17-8): brzina 0,5–2× ide kroz `playbackRate`
 * (visina se menja), rampa brzine i deo unazad su bez zvuka, isključen klip
 * (`muted`) je bez zvuka.
 */

export type AudioSegmentRole = "clip" | "voice" | "music" | "sfx";

export type AudioSegment = {
  /** Id klipa iz montaže (za keš i za grešku „ovaj izvor nema zvuk"). */
  clipId: string;
  src: MediaRef;
  role: AudioSegmentRole;
  /** Kada počinje na traci (s). */
  at: number;
  /** Deo izvora (s). */
  srcStart: number;
  srcEnd: number;
  rate: number;
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
};

export type AudioPlan = {
  duration: number;
  segments: AudioSegment[];
  master: { gainDb: number; fadeIn: number; fadeOut: number };
  /** Utišavanje muzike ispod govora; `null` kad nema i muzike i govora. */
  duck: { amountDb: number } | null;
};

/** Na rezu bez prelaza zvuk se ipak blago pretopi, da ne pukne „klik". */
export const MICRO_FADE_S = 0.01;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Deo segmenta koji staje pre kraja montaže (muzika duža od videa se seče). */
function fitToDuration(segment: AudioSegment, duration: number): AudioSegment | null {
  const length = (segment.srcEnd - segment.srcStart) / segment.rate;
  const room = duration - segment.at;
  if (room <= 0.01) return null;
  if (length <= room) return segment;
  return { ...segment, srcEnd: segment.srcStart + room * segment.rate, fadeOut: Math.min(segment.fadeOut, room / 2) };
}

/** Plan zvuka: segmenti redom kako se pojavljuju, sa ulazom/izlazom na prelazima. */
export function audioPlan(timeline: CreaTimelineV1): AudioPlan {
  const duration = timelineDuration(timeline);
  const segments: AudioSegment[] = [];

  for (const placement of mainLayout(timeline)) {
    const { clip } = placement;
    if (clip.media !== "video" || clip.muted || clip.reverse || clip.speedKeys) continue;
    if (clip.speed < AUDIO_SPEED_RANGE.min || clip.speed > AUDIO_SPEED_RANGE.max) continue;
    const pass = clipPassLength(clip);
    const fadeIn = placement.transitionIn?.duration ?? MICRO_FADE_S;
    // Bumerang: zvuk svira samo napred, a deo unazad je tih.
    const fadeOut = clip.boomerang ? Math.min(0.15, pass / 4) : (placement.transitionOut?.duration ?? MICRO_FADE_S);
    segments.push({
      clipId: clip.id,
      src: clip.src,
      role: clip.isVoice ? "voice" : "clip",
      at: placement.start,
      srcStart: clip.in,
      srcEnd: clip.out,
      rate: clip.speed,
      gainDb: clip.volumeDb,
      fadeIn,
      fadeOut,
    });
  }

  for (const clip of timeline.overlay) {
    if (clip.media !== "video" || clip.muted) continue;
    segments.push({
      clipId: clip.id,
      src: clip.src,
      role: clip.isVoice ? "voice" : "clip",
      at: clip.start,
      srcStart: clip.in,
      srcEnd: clip.out,
      rate: 1,
      gainDb: clip.volumeDb,
      fadeIn: MICRO_FADE_S,
      fadeOut: MICRO_FADE_S,
    });
  }

  for (const clip of timeline.audio) {
    const length = clipSourceLength(clip);
    segments.push({
      clipId: clip.id,
      src: clip.src,
      role: clip.role,
      at: clip.start,
      srcStart: clip.in,
      srcEnd: clip.out,
      rate: 1,
      gainDb: clip.volumeDb,
      fadeIn: Math.min(Math.max(clip.fadeIn, MICRO_FADE_S), length / 2),
      fadeOut: Math.min(Math.max(clip.fadeOut, MICRO_FADE_S), length / 2),
    });
  }

  const fitted = segments
    .map((segment) => fitToDuration(segment, duration))
    .filter((segment): segment is AudioSegment => segment !== null)
    .sort((a, b) => a.at - b.at);
  const hasMusic = fitted.some((segment) => segment.role === "music");
  const hasVoice = fitted.some((segment) => segment.role === "voice");
  return {
    duration,
    segments: fitted,
    master: { gainDb: timeline.mix.masterDb, fadeIn: timeline.mix.fadeIn, fadeOut: timeline.mix.fadeOut },
    duck: timeline.mix.duck.on && hasMusic && hasVoice ? { amountDb: timeline.mix.duck.amountDb } : null,
  };
}

/**
 * Delovi izvora koje treba dekodirati (spojeni preklopi), po izvoru - dekoder
 * čita samo ono što montaža zaista koristi (K17 §1.4), uz malo rezerve.
 */
export function decodeRanges(plan: AudioPlan, padS = 0.1): Map<string, { src: MediaRef; ranges: Array<[number, number]> }> {
  const bySource = new Map<string, { src: MediaRef; ranges: Array<[number, number]> }>();
  for (const segment of plan.segments) {
    const key = mediaKey(segment.src);
    const entry = bySource.get(key) ?? { src: segment.src, ranges: [] };
    entry.ranges.push([Math.max(0, segment.srcStart - padS), segment.srcEnd + padS]);
    bySource.set(key, entry);
  }
  for (const entry of bySource.values()) {
    entry.ranges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const range of entry.ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([range[0], range[1]]);
    }
    entry.ranges = merged;
  }
  return bySource;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}

/** RMS po okviru od `hopS` sekundi (mono zbir kanala). */
export function rmsFrames(channels: readonly Float32Array[], sampleRate: number, hopS: number): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate * hopS));
  const length = channels[0]?.length ?? 0;
  const frames = new Float32Array(Math.ceil(length / hop));
  for (let frame = 0; frame < frames.length; frame++) {
    const start = frame * hop;
    const end = Math.min(length, start + hop);
    let sum = 0;
    for (let index = start; index < end; index++) {
      let sample = 0;
      for (const channel of channels) sample += channel[index];
      sample /= Math.max(1, channels.length);
      sum += sample * sample;
    }
    frames[frame] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return frames;
}

export type DuckingOptions = {
  amountDb: number;
  attackMs: number;
  releaseMs: number;
  /** Ispod ovoga (dBFS) nema govora. */
  thresholdDb: number;
  /** Koliko utišavanje traje posle poslednjeg glasa (pauze između reči). */
  holdMs: number;
};

export const DEFAULT_DUCKING: DuckingOptions = { amountDb: -12, attackMs: 80, releaseMs: 400, thresholdDb: -40, holdMs: 200 };

/**
 * Kriva jačine muzike (linearno pojačanje po okviru): 1 kad niko ne govori,
 * `amountDb` dok traje govor. Spušta se za ~`attackMs`, drži se kroz kratke
 * pauze (`holdMs`) i vraća za ~`releaseMs` - muzika ne „pumpa" između reči.
 */
export function duckingEnvelope(voiceRms: Float32Array, hopS: number, options: Partial<DuckingOptions> = {}): Float32Array {
  const settings = { ...DEFAULT_DUCKING, ...options };
  const low = dbToGain(settings.amountDb);
  const threshold = dbToGain(settings.thresholdDb);
  const holdFrames = Math.round(settings.holdMs / 1000 / hopS);
  // Jednopolni filter: posle `attackMs` kriva pređe ~95 % puta (3 vremenske konstante).
  const attack = 1 - Math.exp((-3 * hopS * 1000) / Math.max(1, settings.attackMs));
  const release = 1 - Math.exp((-3 * hopS * 1000) / Math.max(1, settings.releaseMs));
  const out = new Float32Array(voiceRms.length);
  let gain = 1;
  let held = 0;
  for (let index = 0; index < voiceRms.length; index++) {
    if (voiceRms[index] >= threshold) held = holdFrames + 1;
    else if (held > 0) held -= 1;
    const target = held > 0 ? low : 1;
    gain += (target - gain) * (target < gain ? attack : release);
    out[index] = gain;
  }
  return out;
}

/** Vrh signala u dBFS (−Infinity za tišinu). */
export function peakDb(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index++) {
      const value = Math.abs(channel[index]);
      if (value > peak) peak = value;
    }
  }
  return gainToDb(peak);
}

/** Koliko sekundi na početku je tišina (RMS ispod `thresholdDb`). */
export function leadingSilenceS(rms: Float32Array, hopS: number, thresholdDb = -50): number {
  const threshold = dbToGain(thresholdDb);
  for (let index = 0; index < rms.length; index++) if (rms[index] >= threshold) return index * hopS;
  return rms.length * hopS;
}

/** Ima li u miksu bilo čega čujnog. */
export function hasAudible(rms: Float32Array, thresholdDb = -60): boolean {
  const threshold = dbToGain(thresholdDb);
  return rms.some((value) => value >= threshold);
}

/** Popravka „Utišaj": koliko spustiti glavnu jačinu da vrh bude na −1 dBFS (uz 0,5 dB rezerve). */
export function masterFixForPeak(peak: number, masterDb: number): number {
  if (!Number.isFinite(peak) || peak <= -1) return masterDb;
  return clamp(Math.round((masterDb - (peak + 1.5)) * 10) / 10, -20, 6);
}
