import { ADTS, AudioBufferSink, BlobSource, FLAC, Input, MATROSKA, MP3, MP4, OGG, QTFF, UrlSource, WAVE, WEBM } from "mediabunny";

/**
 * Dekodiranje zvuka za miks montaže (Crea K19, plan K17 §1.4): samo delovi
 * izvora koje montaža koristi. Prvi put je mediabunny (`AudioBufferSink`, čita
 * samo pakete zvuka, i iz galerije preko Range zahteva), a kad pregledač nema
 * `AudioDecoder` ili ne ume kodek - `decodeAudioData` nad celim fajlom.
 *
 * Zaseban modul sa IMENOVANIM uvozima (K10): miks ga učitava tek kad treba.
 */

export type DecodedPiece = { start: number; buffer: AudioBuffer };
/** `null` = izvor nema zvuk (video bez zvučne trake). */
export type DecodedAudio = DecodedPiece[] | null;

const FORMATS = [MP4, QTFF, WEBM, MATROSKA, MP3, WAVE, OGG, ADTS, FLAC];

function concat(pieces: AudioBuffer[], sampleRate: number): AudioBuffer | null {
  if (pieces.length === 0) return null;
  const channels = Math.max(...pieces.map((piece) => piece.numberOfChannels));
  const length = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const out = new AudioBuffer({ length: Math.max(1, length), numberOfChannels: channels, sampleRate });
  for (let channel = 0; channel < channels; channel++) {
    const target = out.getChannelData(channel);
    let offset = 0;
    for (const piece of pieces) {
      target.set(piece.getChannelData(Math.min(channel, piece.numberOfChannels - 1)), offset);
      offset += piece.length;
    }
  }
  return out;
}

async function withMediabunny(source: Blob | string, ranges: ReadonlyArray<readonly [number, number]>, signal?: AbortSignal): Promise<DecodedAudio | "fallback"> {
  const input = new Input({ source: typeof source === "string" ? new UrlSource(source) : new BlobSource(source), formats: FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    if (!(await track.canDecode())) return "fallback";
    const sink = new AudioBufferSink(track);
    const result: DecodedPiece[] = [];
    for (const [start, end] of ranges) {
      const pieces: AudioBuffer[] = [];
      let first: number | null = null;
      for await (const wrapped of sink.buffers(start, end)) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        first ??= wrapped.timestamp;
        pieces.push(wrapped.buffer);
      }
      const buffer = concat(pieces, track.sampleRate);
      if (buffer && first !== null) result.push({ start: first, buffer });
    }
    return result;
  } finally {
    input.dispose();
  }
}

async function withDecodeAudioData(source: Blob | string): Promise<DecodedAudio> {
  const bytes = typeof source === "string" ? await (await fetch(source)).arrayBuffer() : await source.arrayBuffer();
  const context = new OfflineAudioContext(2, 1, 48000);
  try {
    const buffer = await context.decodeAudioData(bytes);
    return [{ start: 0, buffer }];
  } catch {
    // Video bez zvučne trake (ili zvuk koji pregledač ne ume) - tih izvor.
    return null;
  }
}

/** Dekodirani delovi izvora (`ranges` u sekundama izvora). */
export async function decodeAudio(
  source: Blob | string,
  ranges: ReadonlyArray<readonly [number, number]>,
  signal?: AbortSignal,
): Promise<DecodedAudio> {
  if (typeof AudioDecoder === "function") {
    const decoded = await withMediabunny(source, ranges, signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return "fallback" as const;
    });
    if (decoded !== "fallback") return decoded;
  }
  return withDecodeAudioData(source);
}
