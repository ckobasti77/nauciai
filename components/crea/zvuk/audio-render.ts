import { dbToGain, duckingEnvelope, rmsFrames } from "@/lib/crea-audio-plan";

/**
 * Zvuk na uređaju za alate Zvuka II (Crea K23): dekodiranje snimka ili videa,
 * WAV, isečci i lokalni miks (0 kr). Bez React-a; učitava se samo iz alata.
 *
 * Dekodiranje ide kroz isti dekoder kao montaža (`engine/audio-decode.ts`:
 * mediabunny, pa `decodeAudioData` kao rezerva), pa radi i za zvuk iz videa.
 */

export type SoundSource = Blob | string;

/** Ceo zvuk izvora kao `AudioBuffer` na traženoj frekvenciji i broju kanala; `null` = izvor nema zvuk. */
export async function decodeSound(source: SoundSource, sampleRate: number, channels: 1 | 2, signal?: AbortSignal): Promise<AudioBuffer | null> {
  const { decodeAudio } = await import("@/components/crea/video/engine/audio-decode");
  const pieces = await decodeAudio(source, [[0, 4 * 60 * 60]], signal);
  if (!pieces || pieces.length === 0) return null;
  const end = Math.max(...pieces.map((piece) => piece.start + piece.buffer.duration));
  const context = new OfflineAudioContext(channels, Math.max(1, Math.ceil(end * sampleRate)), sampleRate);
  for (const piece of pieces) {
    const node = context.createBufferSource();
    node.buffer = piece.buffer;
    node.connect(context.destination);
    node.start(Math.max(0, piece.start));
  }
  return context.startRendering();
}

export function channelsOf(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
}

/** 16-bitni PCM WAV od kanala (-1..1). */
export function wavBlob(channels: readonly Float32Array[], sampleRate: number): Blob {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytes = new Uint8Array(44 + frames * count * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + frames * count * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, frames * count * 2, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < count; channel++) {
      const value = Math.max(-1, Math.min(1, channels[channel]![frame]!));
      view.setInt16(offset, Math.round(value * 32767), true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export function bufferToWav(buffer: AudioBuffer): Blob {
  return wavBlob(channelsOf(buffer), buffer.sampleRate);
}

/** Zvuk izvora kao WAV fajl (za slanje plaćenom modelu: trajanje meri server iz zaglavlja). */
export async function soundAsWav(source: SoundSource, sampleRate: number, channels: 1 | 2, name: string): Promise<{ file: File; seconds: number } | null> {
  const buffer = await decodeSound(source, sampleRate, channels);
  if (!buffer) return null;
  return { file: new File([bufferToWav(buffer)], name, { type: "audio/wav" }), seconds: buffer.duration };
}

export type MixLayer = {
  buffer: AudioBuffer;
  /** Kada počinje na izlazu (s). */
  at: number;
  /** Deo bafera (s); bez toga ceo. */
  offset?: number;
  duration?: number;
  rate?: number;
  gainDb?: number;
  /** Kratko pretapanje na ivicama (s), da rez ne „pukne". */
  fade?: number;
  /** Pozadina: utišava se ispod slojeva sa `voice: true`. */
  bed?: boolean;
  voice?: boolean;
};

const HOP_S = 0.01;

/**
 * Lokalni miks (0 kr): slojevi na svojim mestima, uz utišavanje pozadine ispod
 * govora (`duckingEnvelope`, isti kao montaža K19) kad je `duckDb` zadat.
 */
export async function mixLayers(layers: readonly MixLayer[], options: { durationS: number; sampleRate: number; channels: 1 | 2; duckDb?: number }): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(options.durationS * options.sampleRate));
  const schedule = (context: OfflineAudioContext, layer: MixLayer, destination: AudioNode) => {
    const rate = layer.rate ?? 1;
    const offset = Math.max(0, layer.offset ?? 0);
    const span = Math.max(0, Math.min(layer.duration ?? layer.buffer.duration - offset, layer.buffer.duration - offset));
    if (span <= 0.005) return;
    const node = context.createBufferSource();
    node.buffer = layer.buffer;
    node.playbackRate.value = rate;
    const gain = context.createGain();
    const level = dbToGain(layer.gainDb ?? 0);
    const out = span / rate;
    const fade = Math.min(layer.fade ?? 0.01, out / 2);
    gain.gain.setValueAtTime(0, layer.at);
    gain.gain.linearRampToValueAtTime(level, layer.at + fade);
    gain.gain.setValueAtTime(level, layer.at + out - fade);
    gain.gain.linearRampToValueAtTime(0, layer.at + out);
    node.connect(gain);
    gain.connect(destination);
    node.start(layer.at, offset, span);
  };

  let duck: Float32Array | null = null;
  if (options.duckDb !== undefined && layers.some((layer) => layer.bed) && layers.some((layer) => layer.voice)) {
    const voiceContext = new OfflineAudioContext(1, length, options.sampleRate);
    for (const layer of layers) if (layer.voice) schedule(voiceContext, layer, voiceContext.destination);
    const voice = await voiceContext.startRendering();
    duck = duckingEnvelope(rmsFrames(channelsOf(voice), options.sampleRate, HOP_S), HOP_S, { amountDb: options.duckDb });
  }

  const context = new OfflineAudioContext(options.channels, length, options.sampleRate);
  const bedBus = context.createGain();
  bedBus.connect(context.destination);
  if (duck && duck.length > 1) bedBus.gain.setValueCurveAtTime(duck, 0, Math.min(options.durationS, duck.length * HOP_S));
  for (const layer of layers) schedule(context, layer, layer.bed ? bedBus : context.destination);
  return context.startRendering();
}

/** Preuzimanje fajla sa uređaja (bez servera). */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bajtovi sa adrese rada (galerija) ili iz fajla. */
export async function sourceBytes(source: SoundSource): Promise<Blob> {
  if (typeof source !== "string") return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error("PREUZIMANJE");
  return response.blob();
}
