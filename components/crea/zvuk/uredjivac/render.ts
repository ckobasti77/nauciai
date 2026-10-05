import { buildFxChain } from "@/components/crea/zvuk/uredjivac/fx-graph";
import { channelsOf } from "@/components/crea/zvuk/audio-render";
import { dbToGain, duckingEnvelope, rmsFrames } from "@/lib/crea-audio-plan";
import { extraPieces, fxActive, mainDuration, mainPieces, type AudioEditDoc, type RenderPiece } from "@/lib/crea-audio-edit";
import { echoTailS } from "@/lib/crea-audio-fx";
import { LOUDNESS_TARGETS, measureLoudness, normalizeLoudness, type LoudnessMeasure } from "@/lib/crea-loudness";

/**
 * Iscrtavanje uređivača na uređaju (Crea K24, A14; 0 kr), korak po korak:
 * 1. glavna traka (isečci sa kratkim pretapanjem na rezovima),
 * 2. brzina i visina (`signalsmith-stretch`),
 * 3. jačina, EQ, kompresor i odjek (isti graf kao pregled uživo),
 * 4. dodatne trake - ambijent se utišava dok neko govori (kriva iz govora, kao montaža K19),
 * 5. glasnoća za mreže (BS.1770, `lib/crea-loudness.ts`) sa limiterom vrha.
 */

export type SourceBuffers = ReadonlyMap<string, AudioBuffer>;

export type RenderStep = "traka" | "brzina" | "efekti" | "trake" | "glasnoca";

/** Koliko se ambijent stišava ispod govora (dB). */
export const EDITOR_DUCK_DB = -12;
const HOP_S = 0.01;

function schedulePiece(context: BaseAudioContext, buffer: AudioBuffer, piece: RenderPiece, destination: AudioNode) {
  const span = Math.min(piece.duration, buffer.duration - piece.offset);
  if (span <= 0.005) return;
  const node = context.createBufferSource();
  node.buffer = buffer;
  const gain = context.createGain();
  const level = dbToGain(piece.gainDb);
  const end = piece.at + span;
  const fadeIn = Math.min(piece.fadeIn, span / 2);
  const fadeOut = Math.min(piece.fadeOut, span / 2);
  gain.gain.setValueAtTime(fadeIn > 0 ? 0 : level, piece.at);
  if (fadeIn > 0) gain.gain.linearRampToValueAtTime(level, piece.at + fadeIn);
  gain.gain.setValueAtTime(level, end - fadeOut);
  if (fadeOut > 0) gain.gain.linearRampToValueAtTime(0, end);
  node.connect(gain);
  gain.connect(destination);
  node.start(piece.at, piece.offset, span);
}

/** Glavna traka bez efekata (vreme trake = vreme uređivanja). */
export async function renderMainTrack(doc: AudioEditDoc, buffers: SourceBuffers, sampleRate: number): Promise<AudioBuffer | null> {
  const duration = mainDuration(doc);
  if (duration <= 0) return null;
  const context = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  for (const piece of mainPieces(doc)) {
    const buffer = buffers.get(piece.source);
    if (buffer) schedulePiece(context, buffer, piece, context.destination);
  }
  return context.startRendering();
}

/** Jačina, EQ, kompresor i odjek; rep odjeka se ne seče. */
export async function applyFilters(buffer: AudioBuffer, fx: AudioEditDoc["fx"]): Promise<AudioBuffer> {
  const tail = echoTailS(fx.echo.mix > 0 ? fx.echo.preset : "off");
  const context = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil((buffer.duration + tail) * buffer.sampleRate), buffer.sampleRate);
  const chain = buildFxChain(context, fx);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(chain.input);
  chain.output.connect(context.destination);
  source.start(0);
  return context.startRendering();
}

/** Glavna traka + dodatne trake; ambijent sa `duck` se utišava ispod glavne. */
export async function mixWithExtras(main: AudioBuffer, doc: AudioEditDoc, buffers: SourceBuffers): Promise<AudioBuffer> {
  const pieces = extraPieces(doc, main.duration);
  if (pieces.length === 0) return main;
  const sampleRate = main.sampleRate;
  const context = new OfflineAudioContext(2, main.length, sampleRate);
  const voice = context.createBufferSource();
  voice.buffer = main;
  voice.connect(context.destination);
  voice.start(0);

  const ducked = context.createGain();
  ducked.connect(context.destination);
  if (pieces.some((piece) => piece.duck)) {
    const curve = duckingEnvelope(rmsFrames(channelsOf(main), sampleRate, HOP_S), HOP_S, { amountDb: EDITOR_DUCK_DB });
    if (curve.length > 1) ducked.gain.setValueCurveAtTime(curve, 0, Math.min(main.duration, curve.length * HOP_S));
  }
  for (const piece of pieces) {
    const buffer = buffers.get(piece.source);
    if (buffer) schedulePiece(context, buffer, piece, piece.duck ? ducked : context.destination);
  }
  return context.startRendering();
}

export function toAudioBuffer(channels: readonly Float32Array<ArrayBuffer>[], sampleRate: number): AudioBuffer {
  const out = new AudioBuffer({ length: Math.max(1, channels[0]?.length ?? 1), numberOfChannels: channels.length, sampleRate });
  channels.forEach((channel, index) => out.copyToChannel(channel, index));
  return out;
}

export type FinalRender = {
  buffer: AudioBuffer;
  before: LoudnessMeasure;
  after: LoudnessMeasure;
  gainDb: number;
};

/** Ceo lanac do gotovog zvuka; `onStep` javlja korak (za „Radim: efekti…"). */
export async function renderFinal(doc: AudioEditDoc, buffers: SourceBuffers, sampleRate: number, onStep?: (step: RenderStep) => void): Promise<FinalRender | null> {
  onStep?.("traka");
  let buffer = await renderMainTrack(doc, buffers, sampleRate);
  if (!buffer) return null;
  const active = fxActive(doc.fx);
  if (active.stretch) {
    onStep?.("brzina");
    const { stretchBuffer } = await import("@/components/crea/zvuk/uredjivac/stretch");
    buffer = await stretchBuffer(buffer, doc.fx.speed, doc.fx.pitch);
  }
  if (active.filters) {
    onStep?.("efekti");
    buffer = await applyFilters(buffer, doc.fx);
  }
  if (doc.extras.some((track) => !track.muted)) {
    onStep?.("trake");
    buffer = await mixWithExtras(buffer, doc, buffers);
  }
  onStep?.("glasnoca");
  // Glavni posao ide u komadu koji pušta ekran da diše (merenje 10 min traje ~1 s).
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (doc.loudness === "isto") {
    const measure = measureLoudness(channelsOf(buffer), buffer.sampleRate);
    return { buffer, before: measure, after: measure, gainDb: 0 };
  }
  const result = normalizeLoudness(channelsOf(buffer), buffer.sampleRate, LOUDNESS_TARGETS[doc.loudness]);
  return { buffer: toAudioBuffer(result.channels, buffer.sampleRate), before: result.before, after: result.after, gainDb: result.gainDb };
}
