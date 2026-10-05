import { importCdnModule } from "@/components/crea/zvuk/uredjivac/cdn-module";
import { fetchModelFile } from "@/lib/crea-local-ai/cache";
import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { CREA_LOCAL_MODELS, NOISE_SUPPRESSOR_BASE } from "@/lib/crea-local-ai/models";

/**
 * Čišćenje zvuka na uređaju (Crea K24, A15): `@sapphi-red/web-noise-suppressor`
 * 0.4.1 (MIT) - RNNoise („brzo") i GTCRN („jače"), oba na 48 kHz.
 *
 * Paket je napravljen za AudioWorklet uživo, ali njegov procesor se inicijalizuje
 * asinhrono i ne javlja kad je spreman - u `OfflineAudioContext`-u bi početak
 * (ili ceo kratak snimak) izašao prazan. Zato se ISTI kod procesora pokreće na
 * glavnoj niti: dok se modul izvršava, privremeno postoje `AudioWorkletProcessor`
 * i `registerProcessor` (odmah se brišu - drugi paketi po njima prepoznaju
 * worklet), a mi mu dajemo blokove od 128 uzoraka kao što bi pregledač.
 * Deterministično, brže od stvarnog vremena, sa napretkom i odustajanjem.
 *
 * Kod procesora i WASM idu sa jsdelivr-a (zakucana verzija) kroz naš keš
 * (`cdn-module.ts`): Turbopack ne ume da spakuje procesor iz paketa
 * (`new URL("rnnoise.wasm", import.meta.url)` pokazuje na fajl koji ne postoji
 * pored njega), pa paket nije u `package.json`.
 */

export type DenoiseEngine = "rnnoise" | "gtcrn";
export const DENOISE_SAMPLE_RATE = 48000;
const BLOCK = 128;

/** Kašnjenje procesora (uzorci na 48 kHz): blok worklet-a + okvir modela (RNNoise 10 ms, GTCRN 2 × 16 ms) - izmereno u pregledaču korelacijom (K24). */
export const DENOISE_LATENCY: Record<DenoiseEngine, number> = { rnnoise: 992, gtcrn: 1536 };

type ShimInstance = {
  processor?: unknown;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
  destroy(): void;
};
type ShimClass = new (options: { processorOptions: { maxChannels: number; wasmBinary: ArrayBuffer } }) => ShimInstance;

const PROCESSOR_NAMES: Record<DenoiseEngine, string> = {
  rnnoise: "@sapphi-red/web-noise-suppressor/rnnoise",
  gtcrn: "@sapphi-red/web-noise-suppressor/gtcrn",
};

const registry = new Map<string, ShimClass>();
const loading = new Map<DenoiseEngine, Promise<ShimClass>>();

type WorkletScope = { AudioWorkletProcessor?: unknown; registerProcessor?: unknown; sampleRate?: unknown };

/** Kod procesora (izmerene veličine fajlova u verziji 0.4.1). */
export const DENOISE_PROCESSOR_JS: Record<DenoiseEngine, { url: string; bytes: number }> = {
  rnnoise: { url: `${NOISE_SUPPRESSOR_BASE}/rnnoise/workletProcessor.js`, bytes: 64_483 },
  gtcrn: { url: `${NOISE_SUPPRESSOR_BASE}/gtcrn/workletProcessor.js`, bytes: 8_916 },
};

async function importProcessor(engine: DenoiseEngine, options: { signal?: AbortSignal; onProgress?: (loaded: number) => void }): Promise<ShimClass> {
  const existing = loading.get(engine);
  if (existing) return existing;
  const attempt = (async () => {
    const script = DENOISE_PROCESSOR_JS[engine];
    const scope = globalThis as unknown as WorkletScope;
    const hadProcessor = "AudioWorkletProcessor" in scope;
    scope.AudioWorkletProcessor ??= class {
      readonly port = new MessageChannel().port1;
    };
    scope.registerProcessor = (name: string, processor: ShimClass) => registry.set(name, processor);
    try {
      await importCdnModule(script.url, { bytes: script.bytes, signal: options.signal, onProgress: options.onProgress });
    } finally {
      // `signalsmith-stretch` i drugi po ovim imenima zaključuju da su u worklet-u - brišu se odmah.
      delete scope.registerProcessor;
      if (!hadProcessor) delete scope.AudioWorkletProcessor;
    }
    const processor = registry.get(PROCESSOR_NAMES[engine]);
    if (!processor) throw new CreaLocalAiError("MODEL_LOAD_FAILED");
    return processor;
  })();
  loading.set(engine, attempt);
  attempt.catch(() => loading.delete(engine));
  return attempt;
}

function simdSupported(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

function wasmUrl(engine: DenoiseEngine): { url: string; bytes: number } {
  if (engine === "gtcrn") return { url: CREA_LOCAL_MODELS.gtcrn.source.url, bytes: CREA_LOCAL_MODELS.gtcrn.bytes };
  // Stariji Safari bez WASM SIMD-a dobija obično izdanje (isti model).
  return simdSupported() ? { url: CREA_LOCAL_MODELS.rnnoise.source.url, bytes: CREA_LOCAL_MODELS.rnnoise.bytes } : { url: `${NOISE_SUPPRESSOR_BASE}/rnnoise.wasm`, bytes: 152_656 };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Spuštanje/podizanje na 48 kHz (oba modela rade samo na toj frekvenciji). */
async function at48k(buffer: AudioBuffer): Promise<AudioBuffer> {
  if (buffer.sampleRate === DENOISE_SAMPLE_RATE) return buffer;
  const context = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(buffer.duration * DENOISE_SAMPLE_RATE), DENOISE_SAMPLE_RATE);
  const node = context.createBufferSource();
  node.buffer = buffer;
  node.connect(context.destination);
  node.start();
  return context.startRendering();
}

export type DenoiseOptions = {
  signal?: AbortSignal;
  onDownload?: (loaded: number, total: number) => void;
  onProgress?: (fraction: number) => void;
};

/** Očišćen zvuk i original, oba na 48 kHz (isti broj kanala i dužina) - za mešanje „jačine čišćenja". */
export async function denoiseBuffer(input: AudioBuffer, engine: DenoiseEngine, options: DenoiseOptions = {}): Promise<{ cleaned: AudioBuffer; original: AudioBuffer }> {
  const { signal, onDownload, onProgress } = options;
  try {
    const wasm = wasmUrl(engine);
    const downloadTotal = wasm.bytes + DENOISE_PROCESSOR_JS[engine].bytes;
    const loaded = { js: 0, wasm: 0 };
    const report = () => onDownload?.(loaded.js + loaded.wasm, downloadTotal);
    const [Processor, binary] = await Promise.all([
      importProcessor(engine, {
        signal,
        onProgress: (bytes) => {
          loaded.js = bytes;
          report();
        },
      }),
      fetchModelFile(wasm.url, {
        signal,
        expectedBytes: wasm.bytes,
        onProgress: (progress) => {
          loaded.wasm = progress.loaded;
          report();
        },
      }).then((blob) => blob.arrayBuffer()),
    ]);
    if (signal?.aborted) throw new CreaLocalAiError("ABORTED");
    const source = await at48k(input);
    const channels = source.numberOfChannels;

    // GTCRN čita `sampleRate` iz opsega worklet-a tek posle učitavanja WASM-a.
    const scope = globalThis as unknown as WorkletScope;
    scope.sampleRate = DENOISE_SAMPLE_RATE;
    let instance: ShimInstance;
    try {
      instance = new Processor({ processorOptions: { maxChannels: channels, wasmBinary: binary } });
      const started = performance.now();
      while (!instance.processor) {
        if (signal?.aborted) throw new CreaLocalAiError("ABORTED");
        if (performance.now() - started > 15000) throw new CreaLocalAiError("MODEL_LOAD_FAILED");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      delete scope.sampleRate;
    }

    const latency = DENOISE_LATENCY[engine];
    const total = source.length + latency;
    const blocks = Math.ceil(total / BLOCK);
    const outputs = Array.from({ length: channels }, () => new Float32Array(blocks * BLOCK));
    const inBlocks = Array.from({ length: channels }, () => new Float32Array(BLOCK));
    const outBlocks = Array.from({ length: channels }, () => new Float32Array(BLOCK));
    const data = Array.from({ length: channels }, (_, channel) => source.getChannelData(channel));
    try {
      let lastYield = performance.now();
      for (let block = 0; block < blocks; block++) {
        const from = block * BLOCK;
        for (let channel = 0; channel < channels; channel++) {
          const target = inBlocks[channel]!;
          target.fill(0);
          if (from < source.length) target.set(data[channel]!.subarray(from, Math.min(source.length, from + BLOCK)));
          outBlocks[channel]!.fill(0);
        }
        instance.process([inBlocks], [outBlocks], {});
        for (let channel = 0; channel < channels; channel++) outputs[channel]!.set(outBlocks[channel]!, from);
        if (performance.now() - lastYield > 40) {
          if (signal?.aborted) throw new CreaLocalAiError("ABORTED");
          onProgress?.(block / blocks);
          await tick();
          lastYield = performance.now();
        }
      }
    } finally {
      instance.destroy();
    }
    onProgress?.(1);
    const out = new AudioBuffer({ length: source.length, numberOfChannels: channels, sampleRate: DENOISE_SAMPLE_RATE });
    for (let channel = 0; channel < channels; channel++) out.copyToChannel(outputs[channel]!.subarray(latency, latency + source.length), channel);
    return { cleaned: out, original: source };
  } catch (error) {
    throw toLocalAiError(error, signal?.aborted ? "ABORTED" : "INFERENCE_FAILED");
  }
}

/** Mešanje očišćenog i originala („jačina čišćenja" 0..1), bez ponovnog računanja modela. */
export function blendClean(original: AudioBuffer, cleaned: AudioBuffer, amount: number): AudioBuffer {
  const length = Math.min(original.length, cleaned.length);
  const out = new AudioBuffer({ length, numberOfChannels: cleaned.numberOfChannels, sampleRate: cleaned.sampleRate });
  for (let channel = 0; channel < cleaned.numberOfChannels; channel++) {
    const dry = original.getChannelData(Math.min(channel, original.numberOfChannels - 1));
    const wet = cleaned.getChannelData(channel);
    const target = out.getChannelData(channel);
    for (let index = 0; index < length; index++) target[index] = wet[index]! * amount + dry[index]! * (1 - amount);
  }
  return out;
}
