import { BPM_RANGE } from "@/lib/crea-beat";
import { averageChroma, detectKey, type KeyGuess } from "@/lib/crea-key";

/**
 * Merenje ritma i tonaliteta na uređaju (Crea K24, A19): `web-audio-beat-detector`
 * (isti kao „Ubaci i gotovo", K19) na 30 s pesme posle uvoda, i `meyda` hroma
 * (12 polutonova) po okviru preko cele pesme → Krumhansl-Kessler (`lib/crea-key.ts`).
 */

const BEAT_WINDOW_S = 30;
const CHROMA_SIZE = 4096;
const MAX_CHROMA_FRAMES = 2500;

export type RhythmAnalysis = { bpm: number | null; offset: number; key: KeyGuess | null };

function slice(buffer: AudioBuffer, startS: number, lengthS: number): AudioBuffer {
  const from = Math.max(0, Math.floor(startS * buffer.sampleRate));
  const to = Math.min(buffer.length, from + Math.floor(lengthS * buffer.sampleRate));
  const out = new AudioBuffer({ length: Math.max(1, to - from), numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) out.copyToChannel(buffer.getChannelData(channel).subarray(from, to), channel);
  return out;
}

async function detectTempo(buffer: AudioBuffer): Promise<{ bpm: number; offset: number } | null> {
  // Uvod je često bez bubnja: prozor počinje na četvrtini pesme (ako stane).
  const start = Math.max(0, Math.min(buffer.duration * 0.25, buffer.duration - BEAT_WINDOW_S));
  const window = slice(buffer, start, BEAT_WINDOW_S);
  if (window.duration < 3) return null;
  try {
    const { guess } = await import("web-audio-beat-detector");
    const result = await guess(window);
    if (!Number.isFinite(result.bpm) || result.bpm < BPM_RANGE.min || result.bpm > BPM_RANGE.max) return null;
    return { bpm: result.bpm, offset: start + result.offset };
  } catch {
    return null;
  }
}

async function detectTonality(buffer: AudioBuffer, signal?: AbortSignal): Promise<KeyGuess | null> {
  const Meyda = (await import("meyda")).default;
  Meyda.bufferSize = CHROMA_SIZE;
  Meyda.sampleRate = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  const total = Math.floor(data.length / CHROMA_SIZE);
  const stride = Math.max(1, Math.ceil(total / MAX_CHROMA_FRAMES));
  const frames: number[][] = [];
  let lastYield = performance.now();
  for (let frame = 0; frame < total; frame += stride) {
    const chunk = data.subarray(frame * CHROMA_SIZE, (frame + 1) * CHROMA_SIZE);
    let energy = 0;
    for (let index = 0; index < chunk.length; index += 8) energy += chunk[index]! * chunk[index]!;
    if (energy < 1e-4) continue;
    const chroma = Meyda.extract("chroma", chunk) as unknown as number[] | null;
    if (chroma) frames.push(chroma);
    if (performance.now() - lastYield > 40) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYield = performance.now();
    }
  }
  return frames.length > 0 ? detectKey(averageChroma(frames)) : null;
}

export async function analyzeRhythm(buffer: AudioBuffer, signal?: AbortSignal): Promise<RhythmAnalysis> {
  const tempo = await detectTempo(buffer);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const key = await detectTonality(buffer, signal);
  return { bpm: tempo ? Math.round(tempo.bpm * 10) / 10 : null, offset: tempo?.offset ?? 0, key };
}
