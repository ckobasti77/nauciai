import { decodeAudio } from "@/components/crea/video/engine/audio-decode";
import { BPM_RANGE } from "@/lib/crea-beat";

/**
 * Ritam pesme na uređaju (Crea K19, V29): `web-audio-beat-detector` (MIT) traži
 * udarce u 30 sekundi pesme od izabranog početka i vraća BPM i prvi udarac.
 * Paket se učitava tek ovde (`import()`), a radi u svom Worker-u.
 */

const WINDOW_S = 30;

export type DetectedBeat = { bpm: number; offset: number };

/** `null` kad u pesmi nema jasnog ritma (ili je pregledač ne ume da dekodira). */
export async function detectBeat(source: Blob | string, startS: number, signal: AbortSignal): Promise<DetectedBeat | null> {
  const decoded = await decodeAudio(source, [[startS, startS + WINDOW_S]], signal);
  const piece = decoded?.[0];
  if (!piece || signal.aborted) return null;
  // Iz celog fajla (rezervni put) uzima se samo prozor od početka.
  const from = Math.max(0, Math.floor((startS - piece.start) * piece.buffer.sampleRate));
  const to = Math.min(piece.buffer.length, from + Math.floor(WINDOW_S * piece.buffer.sampleRate));
  if (to - from < piece.buffer.sampleRate * 3) return null;
  const slice = new AudioBuffer({ length: to - from, numberOfChannels: piece.buffer.numberOfChannels, sampleRate: piece.buffer.sampleRate });
  for (let channel = 0; channel < piece.buffer.numberOfChannels; channel++) {
    slice.copyToChannel(piece.buffer.getChannelData(channel).subarray(from, to), channel);
  }
  try {
    const { guess } = await import("web-audio-beat-detector");
    // Podrazumevan opseg detektora (90-180 BPM) je najpouzdaniji; duplo/upola brže rešava izbor šablona.
    const result = await guess(slice);
    if (!Number.isFinite(result.bpm) || result.bpm < BPM_RANGE.min || result.bpm > BPM_RANGE.max) return null;
    return { bpm: result.bpm, offset: piece.start + from / piece.buffer.sampleRate + result.offset };
  } catch {
    return null;
  }
}
