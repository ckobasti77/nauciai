import { AudioBufferSource, BufferTarget, canEncodeAudio, Mp3OutputFormat, Output, Quality } from "mediabunny";

import { bufferToWav } from "@/components/crea/zvuk/audio-render";

/**
 * Izvoz zvuka (Crea K24): WAV (16-bit PCM, bez gubitka) i MP3 kroz mediabunny.
 * Pregledači uglavnom NE kodiraju MP3, pa se tada registruje
 * `@mediabunny/mp3-encoder` (LAME 3.100 kao nepromenjen WASM u sopstvenom Worker-u,
 * LGPL; https://lame.sourceforge.io). Oba paketa se učitavaju tek na „Preuzmi MP3".
 */

export const MP3_BITRATE = 192_000;

let mp3Ready: Promise<void> | null = null;

async function ensureMp3Encoder() {
  mp3Ready ??= (async () => {
    if (await canEncodeAudio("mp3")) return;
    const { registerMp3Encoder } = await import("@mediabunny/mp3-encoder");
    registerMp3Encoder();
  })().catch((error: unknown) => {
    mp3Ready = null;
    throw error;
  });
  return mp3Ready;
}

/** Deo bafera [od, do) u sekundama (koder prima zvuk po komadima). */
function slice(buffer: AudioBuffer, start: number, end: number): AudioBuffer | null {
  const from = Math.floor(start * buffer.sampleRate);
  const to = Math.min(buffer.length, Math.floor(end * buffer.sampleRate));
  if (to <= from) return null;
  const out = new AudioBuffer({ length: to - from, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) out.copyToChannel(buffer.getChannelData(channel).subarray(from, to), channel);
  return out;
}

export async function encodeMp3(buffer: AudioBuffer, onProgress?: (fraction: number) => void): Promise<Blob> {
  await ensureMp3Encoder();
  const output = new Output({ format: new Mp3OutputFormat(), target: new BufferTarget() });
  const source = new AudioBufferSource({ codec: "mp3", quality: new Quality({ bitrate: MP3_BITRATE }) });
  output.addAudioTrack(source);
  await output.start();
  try {
    for (let at = 0; at < buffer.duration; at += 2) {
      const piece = slice(buffer, at, Math.min(buffer.duration, at + 2));
      if (piece) await source.add(piece);
      onProgress?.(Math.min(1, (at + 2) / buffer.duration));
    }
    source.close();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = output.target.buffer;
  if (!bytes) throw new Error("MP3");
  return new Blob([bytes], { type: "audio/mpeg" });
}

export function encodeWav(buffer: AudioBuffer): Blob {
  return bufferToWav(buffer);
}
