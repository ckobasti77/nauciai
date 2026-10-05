/**
 * „Proveri fotku" (S35, osnova za K14) - čista procena nad onim što su izmerili
 * detektor lica (MediaPipe BlazeFace) i platno: broj lica, veličina glavnog lica
 * i oštrina. Pragovi su namerno blagi: alat savetuje pre plaćanja, ne zabranjuje.
 *
 * Oštrina = varijansa Laplasijana (3×3) nad sivom slikom lica, smanjenom na
 * stalnu veličinu (`SHARPNESS_SAMPLE_PX`) da bi broj bio uporediv između fotki.
 */

export type FaceBox = { x: number; y: number; width: number; height: number; score: number };

export const SHARPNESS_SAMPLE_PX = 256;

export const PHOTO_CHECK_THRESHOLDS = {
  /** Visina lica kao deo visine slike. */
  faceTooSmall: 0.1,
  faceSmall: 0.2,
  /** Varijansa Laplasijana na uzorku od 256 px. */
  blurry: 40,
  soft: 100,
  /** Kraća stranica slike u pikselima. */
  tinySide: 256,
  smallSide: 512,
} as const;

export type PhotoCheckStatus = "ok" | "warn" | "fail";
export type PhotoCheckItemId = "lica" | "velicina" | "ostrina" | "rezolucija";
export type PhotoCheckItem = { id: PhotoCheckItemId; status: PhotoCheckStatus; value: number };
export type PhotoCheckResult = { verdict: PhotoCheckStatus; items: PhotoCheckItem[]; mainFace: FaceBox | null };

/** RGBA → svetlina (BT.601), jedan broj po pikselu. */
export function toGrayscale(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
  }
  return gray;
}

/** Varijansa Laplasijana bez ivičnih piksela; mutna slika ima malo naglih prelaza, pa i malu varijansu. */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = y * width + x;
      const value =
        gray[center - width] + gray[center + width] + gray[center - 1] + gray[center + 1] - 4 * gray[center];
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

/** Najveće lice (po površini) - ono za koje se meri veličina i oštrina. */
export function mainFaceOf(faces: readonly FaceBox[]): FaceBox | null {
  let best: FaceBox | null = null;
  for (const face of faces) {
    if (!best || face.width * face.height > best.width * best.height) best = face;
  }
  return best;
}

/**
 * Isečak za merenje oštrine: lice sa malo margine, uvek unutar slike. Bez lica
 * se meri cela slika.
 */
export function sharpnessRegion(
  face: FaceBox | null,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  if (!face) return { x: 0, y: 0, width, height };
  const margin = 0.1;
  const x = Math.max(0, Math.floor(face.x - face.width * margin));
  const y = Math.max(0, Math.floor(face.y - face.height * margin));
  const right = Math.min(width, Math.ceil(face.x + face.width + face.width * margin));
  const bottom = Math.min(height, Math.ceil(face.y + face.height + face.height * margin));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function worst(statuses: readonly PhotoCheckStatus[]): PhotoCheckStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "ok";
}

export function assessPhoto(input: {
  width: number;
  height: number;
  faces: readonly FaceBox[];
  sharpness: number;
}): PhotoCheckResult {
  const t = PHOTO_CHECK_THRESHOLDS;
  const mainFace = mainFaceOf(input.faces);
  const items: PhotoCheckItem[] = [];

  const count = input.faces.length;
  items.push({ id: "lica", status: count === 1 ? "ok" : count === 0 ? "fail" : "warn", value: count });

  if (mainFace) {
    const share = input.height > 0 ? mainFace.height / input.height : 0;
    items.push({
      id: "velicina",
      status: share < t.faceTooSmall ? "fail" : share < t.faceSmall ? "warn" : "ok",
      value: Math.round(share * 100),
    });
  }

  items.push({
    id: "ostrina",
    status: input.sharpness < t.blurry ? "fail" : input.sharpness < t.soft ? "warn" : "ok",
    value: Math.round(input.sharpness),
  });

  const side = Math.min(input.width, input.height);
  items.push({ id: "rezolucija", status: side < t.tinySide ? "fail" : side < t.smallSide ? "warn" : "ok", value: side });

  return { verdict: worst(items.map((item) => item.status)), items, mainFace };
}

/** Parametri posla u galeriji (JSON primitive) - ono što se vidi u „Istoriji" rada. */
export function photoCheckParams(result: PhotoCheckResult): Record<string, string | number> {
  const params: Record<string, string | number> = { ocena: result.verdict };
  for (const item of result.items) params[item.id] = item.value;
  return params;
}
