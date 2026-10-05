import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import type { AggregateProgress } from "@/lib/crea-local-ai/progress";
import { loadOnnxModel } from "@/lib/crea-local-ai/runtime";
import { energyProbabilities } from "@/lib/crea-silence";

/**
 * Gde se govori (Crea K24, A14): Silero VAD v5 (MIT, 2,3 MB) na ONNX Runtime
 * WASM-u - okvir od 512 uzoraka na 16 kHz (32 ms) uz 64 uzorka konteksta i
 * stanje mreže koje se prenosi s okvira na okvir (isto kao `@ricky0123/vad-web`).
 * Kad model ne može da se učita (nema mreže, star pregledač), ide rezervni
 * detektor po jačini - isti pragovi, malo grublji rezultat.
 */

export const VAD_SAMPLE_RATE = 16000;
export const VAD_FRAME = 512;
export const VAD_FRAME_S = VAD_FRAME / VAD_SAMPLE_RATE;
const CONTEXT = 64;

export type SpeechMap = { probabilities: Float32Array; frameS: number; method: "silero" | "jacina" };

/** Mono 16 kHz (prosek kanala, pa Web Audio preuzorkovanje). */
export async function toVadInput(buffer: AudioBuffer): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, Math.max(1, Math.ceil(buffer.duration * VAD_SAMPLE_RATE)), VAD_SAMPLE_RATE);
  const node = context.createBufferSource();
  node.buffer = buffer;
  node.connect(context.destination);
  node.start();
  const rendered = await context.startRendering();
  return rendered.getChannelData(0);
}

export async function speechMap(
  buffer: AudioBuffer,
  options: { method: "silero" | "jacina"; signal?: AbortSignal; onDownload?: (progress: AggregateProgress) => void; onProgress?: (fraction: number) => void },
): Promise<SpeechMap> {
  const samples = await toVadInput(buffer);
  if (options.method === "jacina") return { probabilities: energyProbabilities(samples, VAD_SAMPLE_RATE, VAD_FRAME_S), frameS: VAD_FRAME_S, method: "jacina" };
  try {
    const { ort, session } = await loadOnnxModel("silero-vad", "wasm", { signal: options.signal, onProgress: options.onDownload });
    const frames = Math.floor(samples.length / VAD_FRAME);
    const probabilities = new Float32Array(frames);
    let state = new ort.Tensor("float32", new Float32Array(2 * 128), [2, 1, 128]);
    const sr = new ort.Tensor("int64", BigInt64Array.from([BigInt(VAD_SAMPLE_RATE)]), [1]);
    const input = new Float32Array(CONTEXT + VAD_FRAME);
    let lastYield = performance.now();
    for (let frame = 0; frame < frames; frame++) {
      const from = frame * VAD_FRAME;
      input.copyWithin(0, VAD_FRAME, VAD_FRAME + CONTEXT);
      input.set(samples.subarray(from, from + VAD_FRAME), CONTEXT);
      const result = await session.run({ input: new ort.Tensor("float32", input.slice(), [1, CONTEXT + VAD_FRAME]), state, sr });
      const output = result.output;
      const next = result.stateN;
      if (!output || !next) throw new CreaLocalAiError("INFERENCE_FAILED");
      probabilities[frame] = Number((output.data as Float32Array)[0] ?? 0);
      state = next as typeof state;
      if (performance.now() - lastYield > 50) {
        if (options.signal?.aborted) throw new CreaLocalAiError("ABORTED");
        options.onProgress?.(frame / frames);
        lastYield = performance.now();
      }
    }
    return { probabilities, frameS: VAD_FRAME_S, method: "silero" };
  } catch (error) {
    const coded = toLocalAiError(error, "MODEL_LOAD_FAILED");
    if (coded.code === "ABORTED") throw coded;
    // Bez modela: jačina zvuka (radi svuda, bez preuzimanja).
    return { probabilities: energyProbabilities(samples, VAD_SAMPLE_RATE, VAD_FRAME_S), frameS: VAD_FRAME_S, method: "jacina" };
  }
}
