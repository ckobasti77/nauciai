"use client";

import type { FaceDetector } from "@mediapipe/tasks-vision";

import { CreaLocalAiError, toLocalAiError } from "@/lib/crea-local-ai/errors";
import { loadFaceDetector, type LocalLoadOptions } from "@/lib/crea-local-ai/runtime";
import {
  assessPhoto,
  laplacianVariance,
  meanLuminance,
  SHARPNESS_SAMPLE_PX,
  sharpnessRegion,
  toGrayscale,
  type FaceBox,
  type PhotoCheckPurpose,
  type PhotoCheckResult,
} from "@/lib/crea-photo-check";

/**
 * Provera fotke na uređaju (S35): BlazeFace nađe lica, platno izmeri oštrinu
 * (varijansa Laplasijana) i svetlinu lica, a `assessPhoto` presudi. Isti put
 * koriste alat „Proveri fotku", ekran „Likovi" (pre čuvanja Lika) i „Zameni lik"
 * (pre plaćanja). MediaPipe se učitava tek ovde (`loadFaceDetector` → `import()`).
 */

/** Oštrina i svetlina uzorka lica (ili cele slike bez lica), smanjenog na stalnu veličinu. */
function measureFace(bitmap: ImageBitmap, face: FaceBox | null): { sharpness: number; brightness: number } {
  const region = sharpnessRegion(face, bitmap.width, bitmap.height);
  const scale = SHARPNESS_SAMPLE_PX / Math.max(region.width, region.height);
  const width = Math.max(3, Math.round(region.width * scale));
  const height = Math.max(3, Math.round(region.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new CreaLocalAiError("UNSUPPORTED");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = toGrayscale(data, width, height);
  return { sharpness: laplacianVariance(gray, width, height), brightness: meanLuminance(gray) };
}

/** Lica + procena nad već dekodiranom slikom (alat „Proveri fotku" posle crta izveštaj). */
export function analyzeFaces(
  detector: FaceDetector,
  bitmap: ImageBitmap,
  purpose: PhotoCheckPurpose,
): { result: PhotoCheckResult; faces: FaceBox[] } {
  let faces: FaceBox[];
  try {
    faces = detector.detect(bitmap).detections.flatMap((detection) =>
      detection.boundingBox
        ? [
            {
              x: detection.boundingBox.originX,
              y: detection.boundingBox.originY,
              width: detection.boundingBox.width,
              height: detection.boundingBox.height,
              score: detection.categories[0]?.score ?? 0,
            },
          ]
        : [],
    );
  } catch (error) {
    throw toLocalAiError(error, "INFERENCE_FAILED");
  }
  const preliminary = assessPhoto({ width: bitmap.width, height: bitmap.height, faces, sharpness: 0 }, purpose);
  const measured = measureFace(bitmap, preliminary.mainFace);
  return { result: assessPhoto({ width: bitmap.width, height: bitmap.height, faces, ...measured }, purpose), faces };
}

/** Cela provera jednog fajla: učita detektor (prvi put preuzima ~12 MB), dekodira i proceni. */
export async function checkFacePhoto(
  file: Blob,
  purpose: PhotoCheckPurpose,
  options: LocalLoadOptions = {},
): Promise<PhotoCheckResult> {
  const detector = await loadFaceDetector(options);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    throw new CreaLocalAiError("BAD_INPUT", error);
  }
  try {
    if (options.signal?.aborted) throw new CreaLocalAiError("ABORTED");
    return analyzeFaces(detector, bitmap, purpose).result;
  } finally {
    bitmap.close();
  }
}
