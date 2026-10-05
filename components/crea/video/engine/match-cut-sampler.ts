import type { FaceDetector } from "@mediapipe/tasks-vision";

import { forEachFrameAt, type VideoSource } from "@/components/crea/video/engine/transform";
import { blockhash, BLOCKHASH_SIZE } from "@/lib/crea-duplicates";
import { CreaLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadFaceDetector } from "@/lib/crea-local-ai/runtime";
import type { MatchFace, MatchSample } from "@/lib/crea-match-cut";

/**
 * Uzorci za match-cut po licu (Crea K21, V27): kadrovi dva klipa u traženim
 * trenucima (8 u sekundi, `matchCutTimes`), umanjeni na 256 piksela. Za svaki
 * kadar najveće lice (MediaPipe BlazeFace, IMAGE režim - isti detektor kao
 * „Prekroji kadar") i blockhash otisak slike 64 × 64 (K16). Odluku donosi
 * `lib/crea-match-cut.ts`.
 *
 * Učitava se samo kroz `import()` iz inspektora montaže.
 */

/** Analiza gleda umanjen kadar - lice je i dalje jasno, a brzo je. */
const SAMPLE_MAX_SIDE = 256;

export type MatchCutSide = { source: VideoSource; times: readonly number[] };

/** Najveće lice u kadru, u delovima kadra (centar i visina). */
function largestFace(detector: FaceDetector, frame: HTMLCanvasElement): MatchFace | null {
  let best: MatchFace | null = null;
  let bestArea = 0;
  for (const detection of detector.detect(frame).detections) {
    const box = detection.boundingBox;
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const area = box.width * box.height;
    if (area <= bestArea) continue;
    bestArea = area;
    best = {
      cx: (box.originX + box.width / 2) / frame.width,
      cy: (box.originY + box.height / 2) / frame.height,
      size: box.height / frame.height,
    };
  }
  return best;
}

/**
 * Uzorci kraja klipa A i početka klipa B. Kad detektor lica ne može da se
 * učita (mreža, stari pregledač), lica su `null` i odlučuje sličnost slike.
 */
export async function sampleMatchCut(
  a: MatchCutSide,
  b: MatchCutSide,
  options: { signal: AbortSignal; onProgress?: (fraction: number) => void },
): Promise<{ a: MatchSample[]; b: MatchSample[] }> {
  const { signal, onProgress } = options;
  const detector = await loadFaceDetector({ signal }).catch(() => {
    if (signal.aborted) throw new CreaLocalAiError("ABORTED");
    return null;
  });
  const hashCanvas = document.createElement("canvas");
  hashCanvas.width = BLOCKHASH_SIZE;
  hashCanvas.height = BLOCKHASH_SIZE;
  const hashCtx = hashCanvas.getContext("2d", { willReadFrequently: true });
  if (!hashCtx) throw new CreaLocalAiError("UNSUPPORTED");
  hashCtx.imageSmoothingQuality = "high";

  const total = Math.max(1, a.times.length + b.times.length);
  let done = 0;
  const sampleSide = async (side: MatchCutSide): Promise<MatchSample[]> => {
    const samples: MatchSample[] = [];
    await forEachFrameAt(
      side.source,
      side.times,
      SAMPLE_MAX_SIDE,
      (canvas, time) => {
        const frame = canvas as HTMLCanvasElement;
        hashCtx.drawImage(frame, 0, 0, BLOCKHASH_SIZE, BLOCKHASH_SIZE);
        const hash = blockhash(hashCtx.getImageData(0, 0, BLOCKHASH_SIZE, BLOCKHASH_SIZE).data);
        samples.push({ t: time, face: detector ? largestFace(detector, frame) : null, hash });
        done += 1;
        onProgress?.(done / total);
      },
      signal,
    );
    return samples;
  };

  const aSamples = await sampleSide(a);
  const bSamples = await sampleSide(b);
  return { a: aSamples, b: bSamples };
}
