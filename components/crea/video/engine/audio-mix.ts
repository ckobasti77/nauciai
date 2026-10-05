import {
  audioPlan,
  dbToGain,
  decodeRanges,
  duckingEnvelope,
  hasAudible,
  leadingSilenceS,
  peakDb,
  rmsFrames,
  type AudioPlan,
  type AudioSegment,
} from "@/lib/crea-audio-plan";
import type { PreflightAudio } from "@/lib/crea-preflight";
import { mediaKey, type CreaTimelineV1, type MediaRef } from "@/lib/crea-timeline";
import type { DecodedAudio, DecodedPiece } from "@/components/crea/video/engine/audio-decode";

/**
 * Miks zvuka montaže (Crea K19, V24; plan K17 §1.4): `OfflineAudioContext` po
 * `audioPlan` - brzina kroz `playbackRate`, pretapanja kao krive jačine, muzika
 * utišana ispod govora krivom iz `duckingEnvelope`. ISTI miks svira u pregledu
 * i ide u MP4, pa je pregled = izvoz i za zvuk.
 */

export const MIX_SAMPLE_RATE = 48000;
const RMS_HOP_S = 0.01;

export type MixResult = { buffer: AudioBuffer | null; stats: PreflightAudio };

export type SourceResolver = (ref: MediaRef) => Blob | string | null;

/**
 * Keš dekodiranih izvora: ključ je izvor + delovi zaokruženi na celu sekundu
 * napolje, pa sitna izmena (skraćivanje, pomeranje) ne dekodira sve ponovo.
 */
export class AudioDecodeCache {
  private entries = new Map<string, Promise<DecodedAudio>>();

  get(source: Blob | string, ref: MediaRef, ranges: Array<[number, number]>, signal?: AbortSignal): Promise<DecodedAudio> {
    const wide = ranges.map(([start, end]) => [Math.max(0, Math.floor(start)), Math.ceil(end)] as [number, number]);
    const key = `${mediaKey(ref)}|${wide.map(([start, end]) => `${start}-${end}`).join(",")}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = import("@/components/crea/video/engine/audio-decode").then(({ decodeAudio }) => decodeAudio(source, wide, signal));
      entry.catch(() => this.entries.delete(key));
      if (this.entries.size > 40) this.entries.clear();
      this.entries.set(key, entry);
    }
    return entry;
  }

  clear() {
    this.entries.clear();
  }
}

function pieceFor(decoded: DecodedAudio, segment: AudioSegment): DecodedPiece | null {
  if (!decoded) return null;
  return (
    decoded.find((piece) => piece.start <= segment.srcStart + 0.05 && piece.start + piece.buffer.duration >= segment.srcStart) ?? null
  );
}

/** Jedan segment u graf: izvor (brzina, deo bafera) → jačina sa pretapanjima → izlaz. */
function schedule(context: OfflineAudioContext, segment: AudioSegment, piece: DecodedPiece, destination: AudioNode) {
  const offset = Math.max(0, segment.srcStart - piece.start);
  const sourceSeconds = Math.min(segment.srcEnd - segment.srcStart, piece.buffer.duration - offset);
  if (sourceSeconds <= 0.005) return;
  const length = sourceSeconds / segment.rate;
  const node = context.createBufferSource();
  node.buffer = piece.buffer;
  node.playbackRate.value = segment.rate;
  const gain = context.createGain();
  const level = dbToGain(segment.gainDb);
  const fadeIn = Math.min(segment.fadeIn, length / 2);
  const fadeOut = Math.min(segment.fadeOut, length / 2);
  const end = segment.at + length;
  gain.gain.setValueAtTime(fadeIn > 0 ? 0 : level, segment.at);
  if (fadeIn > 0) gain.gain.linearRampToValueAtTime(level, segment.at + fadeIn);
  if (fadeOut > 0) {
    gain.gain.setValueAtTime(level, end - fadeOut);
    gain.gain.linearRampToValueAtTime(0, end);
  }
  node.connect(gain);
  gain.connect(destination);
  node.start(segment.at, offset, sourceSeconds);
}

async function decodeAll(
  plan: AudioPlan,
  resolve: SourceResolver,
  cache: AudioDecodeCache,
  signal?: AbortSignal,
): Promise<Map<string, DecodedAudio>> {
  const decoded = new Map<string, DecodedAudio>();
  for (const [key, entry] of decodeRanges(plan)) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const source = resolve(entry.src);
    decoded.set(key, source ? await cache.get(source, entry.src, entry.ranges, signal).catch(() => null) : null);
  }
  return decoded;
}

async function renderBus(
  plan: AudioPlan,
  segments: AudioSegment[],
  decoded: Map<string, DecodedAudio>,
  channels: number,
  sampleRate: number,
  build?: (context: OfflineAudioContext, input: GainNode) => void,
): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(channels, Math.max(1, Math.ceil(plan.duration * sampleRate)), sampleRate);
  const input = context.createGain();
  input.connect(context.destination);
  build?.(context, input);
  for (const segment of segments) {
    const piece = pieceFor(decoded.get(mediaKey(segment.src)) ?? null, segment);
    if (piece) schedule(context, segment, piece, input);
  }
  return context.startRendering();
}

function channelsOf(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
}

/** Ceo miks montaže kao stereo `AudioBuffer` (48 kHz) + mere za „Proveri pre objave". */
export async function renderMix(
  timeline: CreaTimelineV1,
  resolve: SourceResolver,
  cache: AudioDecodeCache,
  options: { signal?: AbortSignal; sampleRate?: number } = {},
): Promise<MixResult> {
  const sampleRate = options.sampleRate ?? MIX_SAMPLE_RATE;
  const plan = audioPlan(timeline);
  const hasVoice = plan.segments.some((segment) => segment.role === "voice");
  const silent: MixResult = { buffer: null, stats: { audible: false, peakDb: -Infinity, leadingSilenceS: plan.duration, hasVoice } };
  if (plan.duration <= 0 || plan.segments.length === 0) return silent;

  const decoded = await decodeAll(plan, resolve, cache, options.signal);
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  // Utišavanje: prvo samo govor (mono), iz njega kriva jačine muzike.
  let duckCurve: Float32Array | null = null;
  if (plan.duck) {
    const voice = await renderBus(plan, plan.segments.filter((segment) => segment.role === "voice"), decoded, 1, sampleRate);
    duckCurve = duckingEnvelope(rmsFrames(channelsOf(voice), sampleRate, RMS_HOP_S), RMS_HOP_S, { amountDb: plan.duck.amountDb });
  }

  const music = plan.segments.filter((segment) => segment.role === "music");
  const rest = plan.segments.filter((segment) => segment.role !== "music");
  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(plan.duration * sampleRate)), sampleRate);
  const master = context.createGain();
  master.connect(context.destination);
  const masterLevel = dbToGain(plan.master.gainDb);
  const fadeIn = Math.min(plan.master.fadeIn, plan.duration / 2);
  const fadeOut = Math.min(plan.master.fadeOut, plan.duration / 2);
  master.gain.setValueAtTime(fadeIn > 0 ? 0 : masterLevel, 0);
  if (fadeIn > 0) master.gain.linearRampToValueAtTime(masterLevel, fadeIn);
  if (fadeOut > 0) {
    master.gain.setValueAtTime(masterLevel, plan.duration - fadeOut);
    master.gain.linearRampToValueAtTime(0, plan.duration);
  }
  const musicBus = context.createGain();
  musicBus.connect(master);
  if (duckCurve && duckCurve.length > 1) {
    // Kriva ide tačno preko trajanja govora (koraci od 10 ms).
    musicBus.gain.setValueCurveAtTime(duckCurve, 0, Math.min(plan.duration, duckCurve.length * RMS_HOP_S));
  }
  for (const segment of music) {
    const piece = pieceFor(decoded.get(mediaKey(segment.src)) ?? null, segment);
    if (piece) schedule(context, segment, piece, musicBus);
  }
  for (const segment of rest) {
    const piece = pieceFor(decoded.get(mediaKey(segment.src)) ?? null, segment);
    if (piece) schedule(context, segment, piece, master);
  }
  const buffer = await context.startRendering();
  const channels = channelsOf(buffer);
  const rms = rmsFrames(channels, sampleRate, RMS_HOP_S);
  return {
    buffer,
    stats: { audible: hasAudible(rms), peakDb: peakDb(channels), leadingSilenceS: leadingSilenceS(rms, RMS_HOP_S), hasVoice },
  };
}
