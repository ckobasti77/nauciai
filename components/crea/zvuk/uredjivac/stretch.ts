import { importCdnModule } from "@/components/crea/zvuk/uredjivac/cdn-module";
import { SIGNALSMITH_STRETCH } from "@/lib/crea-local-ai/models";

/**
 * Brzina bez promene visine i visina bez promene brzine (Crea K24, A14):
 * `signalsmith-stretch` 1.3.2 (MIT, WASM u AudioWorklet-u). Paket sam pravi kod
 * worklet-a od sopstvenih funkcija, pa se uvozi ORIGINAL sa CDN-a (`cdn-module.ts`).
 *
 * Izvoz ide kroz `OfflineAudioContext`: čvor se pravi tek pošto iscrtavanje krene
 * i stane na prvom bloku (`suspend`) - tada nit worklet-a sigurno radi u svakom
 * pregledaču, pa odgovori čvora („spreman", „bafer primljen") stižu. Ispred
 * snimka ide kratka tišina da se čvor zagreje, pa se ona odseče.
 */

type StretchSchedule = { output?: number; active?: boolean; input?: number; rate?: number; semitones?: number };
export type StretchNode = AudioWorkletNode & {
  schedule(change: StretchSchedule): Promise<unknown>;
  addBuffers(channels: Float32Array[]): Promise<number>;
};
type StretchFactory = (context: BaseAudioContext, options?: AudioWorkletNodeOptions) => Promise<StretchNode>;

/** Koliko ranije se zakazuje početak, da prvi slog ne bude „mek" dok čvor hvata ritam. */
const STRETCH_LEAD_S = 0.25;

let factory: Promise<StretchFactory> | null = null;

function loadStretch(signal?: AbortSignal): Promise<StretchFactory> {
  factory ??= importCdnModule<{ default: StretchFactory }>(SIGNALSMITH_STRETCH.url, { bytes: SIGNALSMITH_STRETCH.bytes, signal }).then((module) => module.default);
  factory.catch(() => {
    factory = null;
  });
  return factory;
}

export async function stretchBuffer(input: AudioBuffer, speed: number, semitones: number, signal?: AbortSignal): Promise<AudioBuffer> {
  const SignalsmithStretch = await loadStretch(signal);
  const channels = input.numberOfChannels;
  const sampleRate = input.sampleRate;
  const outS = input.duration / speed;
  const startAt = (128 / sampleRate) * 2;
  const context = new OfflineAudioContext(channels, Math.ceil((startAt + STRETCH_LEAD_S + outS + 0.3) * sampleRate), sampleRate);

  let failure: unknown = null;
  const setup = context.suspend(startAt).then(async () => {
    try {
      const node = await SignalsmithStretch(context, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [channels] });
      node.connect(context.destination);
      // Ispred snimka ide tišina od `lead` (u vremenu izlaza): čvor se zagreje na njoj,
      // pa pravi početak izlazi tačno na `startAt + lead`.
      const lead = Math.round(STRETCH_LEAD_S * speed * sampleRate);
      await node.addBuffers(
        Array.from({ length: channels }, (_, channel) => {
          const padded = new Float32Array(lead + input.length);
          padded.set(input.getChannelData(channel), lead);
          return padded;
        }),
      );
      await node.schedule({ output: startAt, active: true, input: 0, rate: speed, semitones });
    } catch (error) {
      failure = error;
    } finally {
      await context.resume();
    }
  });
  const rendered = await context.startRendering();
  await setup;
  if (failure) throw failure;

  const from = Math.round((startAt + STRETCH_LEAD_S) * sampleRate);
  const length = Math.max(1, Math.round(outS * sampleRate));
  const out = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
  for (let channel = 0; channel < channels; channel++) {
    out.copyToChannel(rendered.getChannelData(channel).subarray(from, from + length), channel);
  }
  return out;
}

/** Visina uživo (pregled): čvor bez bafera obrađuje ulaz koji mu stiže. */
export async function livePitchNode(context: AudioContext, semitones: number): Promise<StretchNode> {
  const SignalsmithStretch = await loadStretch();
  const node = await SignalsmithStretch(context);
  await node.schedule({ active: true, semitones });
  return node;
}
