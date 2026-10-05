import type { LocalizedText } from "./i18n";

/**
 * „3D foto" (S33, K10): čista matematika oko Depth Anything V2 Small i
 * paralakse. Model procenjuje dubinu fotke na uređaju, three.js je pomeri u
 * blagi reljef, kamera polako kruži, a mediabunny to upiše u kratak MP4.
 *
 * Ovde su samo brojevi koji se mogu proveriti bez browsera: ulazna veličina za
 * model (pravila DPT procesora), sređivanje mape dubine, putanja kamere (petlja
 * se zatvara bez trzaja) i veličina videa (parne stranice za H.264).
 */

/** `preprocessor_config.json` modela (onnx-community/depth-anything-v2-small). */
export const DEPTH_PREPROCESS = {
  size: 518,
  multiple: 14,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  /** Duža stranica ulaza najviše 2 × 518: panorama inače pravi ogroman ulaz za WASM. */
  maxSide: 1036,
} as const;

function toMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

/**
 * Veličina ulaza kao u DPT procesoru (`keep_aspect_ratio`, `ensure_multiple_of: 14`):
 * bira se razmera koja je bliža 1, pa se obe stranice zaokruže na umnožak 14.
 */
export function depthInputSize(width: number, height: number): { width: number; height: number } {
  const { size, multiple, maxSide } = DEPTH_PREPROCESS;
  let scaleWidth = size / width;
  let scaleHeight = size / height;
  if (Math.abs(1 - scaleWidth) < Math.abs(1 - scaleHeight)) scaleHeight = scaleWidth;
  else scaleWidth = scaleHeight;
  let outWidth = width * scaleWidth;
  let outHeight = height * scaleHeight;
  const longest = Math.max(outWidth, outHeight);
  if (longest > maxSide) {
    outWidth *= maxSide / longest;
    outHeight *= maxSide / longest;
  }
  return { width: Math.min(maxSide, toMultiple(outWidth, multiple)), height: Math.min(maxSide, toMultiple(outHeight, multiple)) };
}

/**
 * RGBA pikseli → tenzor `[1, 3, H, W]` (float32, normalizovan srednjom
 * vrednošću i odstupanjem ImageNet-a), kako model očekuje.
 */
export function rgbaToTensor(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  const { mean, std } = DEPTH_PREPROCESS;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (rgba[i * 4 + c]! / 255 - mean[c]!) / std[c]!;
  }
  return out;
}

/**
 * Izlaz modela (relativna inverzna dubina - veće = bliže) → 0..1, gde je 1
 * najbliže. Krajnjih 2 % sa obe strane se odseče, da jedna tačka (nebo, odsjaj)
 * ne spljošti ceo reljef.
 */
export function normalizeDepth(depth: ArrayLike<number>, clip = 0.02): Float32Array {
  const count = depth.length;
  const out = new Float32Array(count);
  if (count === 0) return out;
  const step = Math.max(1, Math.floor(count / 50_000));
  const sample: number[] = [];
  for (let i = 0; i < count; i += step) {
    const value = depth[i]!;
    if (Number.isFinite(value)) sample.push(value);
  }
  if (sample.length === 0) return out;
  sample.sort((a, b) => a - b);
  const low = sample[Math.floor((sample.length - 1) * clip)]!;
  const high = sample[Math.ceil((sample.length - 1) * (1 - clip))]!;
  const range = high - low;
  for (let i = 0; i < count; i++) {
    const value = depth[i]!;
    out[i] = range > 1e-6 && Number.isFinite(value) ? Math.min(1, Math.max(0, (value - low) / range)) : 0.5;
  }
  return out;
}

/** Zamućenje mape dubine (dva prolaza kutijom): ivice predmeta se ne „cepaju" u reljefu. */
export function blurDepth(depth: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius < 1) return depth.slice();
  const temp = new Float32Array(depth.length);
  const out = new Float32Array(depth.length);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    for (let line = 0; line < lines; line++) {
      const at = (i: number) => (horizontal ? line * width + i : i * width + line);
      let sum = 0;
      let n = 0;
      for (let i = -radius; i <= radius; i++) {
        if (i >= 0 && i < length) {
          sum += from[at(i)]!;
          n++;
        }
      }
      for (let i = 0; i < length; i++) {
        to[at(i)] = sum / n;
        const leave = i - radius;
        const enter = i + radius + 1;
        if (leave >= 0) {
          sum -= from[at(leave)]!;
          n--;
        }
        if (enter < length) {
          sum += from[at(enter)]!;
          n++;
        }
      }
    }
  };
  pass(depth, temp, true);
  pass(temp, out, false);
  return out;
}

export type Photo3dMotion = "krug" | "levo-desno" | "priblizi";
export type Photo3dStrength = "blago" | "srednje" | "jako";

export const PHOTO3D_MOTIONS: ReadonlyArray<{ id: Photo3dMotion; label: LocalizedText }> = [
  { id: "krug", label: { sr: "Kamera kruži", en: "Camera circles" } },
  { id: "levo-desno", label: { sr: "Levo-desno", en: "Side to side" } },
  { id: "priblizi", label: { sr: "Približi se", en: "Move closer" } },
];

export const PHOTO3D_STRENGTHS: ReadonlyArray<{ id: Photo3dStrength; label: LocalizedText; depth: number; travel: number }> = [
  { id: "blago", label: { sr: "Blago", en: "Gentle" }, depth: 0.18, travel: 0.15 },
  { id: "srednje", label: { sr: "Srednje", en: "Medium" }, depth: 0.26, travel: 0.25 },
  { id: "jako", label: { sr: "Jako", en: "Strong" }, depth: 0.34, travel: 0.3 },
];

export const PHOTO3D_DURATIONS = [3, 5, 8] as const;
export type Photo3dDuration = (typeof PHOTO3D_DURATIONS)[number];
export const PHOTO3D_FPS = 30;

/** Vertikalni ugao kamere (stepeni); ravan fotke je visoka 1 i široka koliko je odnos stranica. */
export const PHOTO3D_FOV = 30;

/** Udaljenost na kojoj ravan visine 1 tačno staje u kadar (bez kretanja i dubine). */
export function photo3dFitDistance(fov: number = PHOTO3D_FOV): number {
  return 0.5 / Math.tan(((fov / 2) * Math.PI) / 180);
}

type Vec = { x: number; y: number; z: number };

/**
 * Da li kamera u tački `camera` (gleda u centar fotke) vidi samo fotku: sva
 * četiri ugla kadra moraju da padnu na fotku i na dubini POZADINE (najdalja
 * tačka reljefa, `-depthScale / 2`), jer tu zrak putuje najdalje. Inače se uz
 * ivicu vidi crna traka.
 */
export function photo3dFrameInside(camera: Vec, aspect: number, depthScale: number, fov: number = PHOTO3D_FOV): boolean {
  const length = Math.hypot(camera.x, camera.y, camera.z);
  const forward = { x: -camera.x / length, y: -camera.y / length, z: -camera.z / length };
  // Desno i gore kamere, isto kao three.js `lookAt` sa `up = (0, 1, 0)`.
  const rightLength = Math.hypot(forward.z, forward.x);
  const right = { x: -forward.z / rightLength, y: 0, z: forward.x / rightLength };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const tanHeight = Math.tan(((fov / 2) * Math.PI) / 180);
  const tanWidth = tanHeight * aspect;
  const background = -depthScale / 2;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const ray = {
        x: forward.x + right.x * sx * tanWidth + up.x * sy * tanHeight,
        y: forward.y + right.y * sx * tanWidth + up.y * sy * tanHeight,
        z: forward.z + right.z * sx * tanWidth + up.z * sy * tanHeight,
      };
      if (ray.z >= 0) return false;
      const step = (background - camera.z) / ray.z;
      const hitX = camera.x + ray.x * step;
      const hitY = camera.y + ray.y * step;
      // 0,5 % rezerve, da zaokruživanje i ivica teksture ne provire.
      if (Math.abs(hitX) > (aspect / 2) * 0.995 || Math.abs(hitY) > 0.5 * 0.995) return false;
    }
  }
  return true;
}

/**
 * Najveća udaljenost kamere (najmanje uvećanje kadra) na kojoj se ivica fotke ne
 * vidi ni u jednom trenutku putanje. Bez kretanja i dubine to je `photo3dFitDistance`.
 */
export function photo3dCameraDistance(motion: Photo3dMotion, strength: { depth: number; travel: number }, aspect: number): number {
  const travel = photo3dTravel(strength.travel, aspect);
  const samples = Array.from({ length: 96 }, (_, i) => cameraOffset(i / 96, motion, travel));
  const ok = (distance: number) =>
    samples.every((offset) => photo3dFrameInside({ x: offset.x, y: offset.y, z: distance + offset.z }, aspect, strength.depth));
  let low = 0.2;
  let high = photo3dFitDistance();
  if (ok(high)) return high;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (ok(mid)) low = mid;
    else high = mid;
  }
  // 1 % bliže od nađene granice: pokriva trenutke između proverenih tačaka putanje.
  return low * 0.99;
}

/**
 * Pomeraj kamere za ovu fotku: za uspravnu fotku (uža od visine) srazmerno manji,
 * da uska slika ne mora mnogo da se uveća da bi ivice ostale skrivene.
 */
export function photo3dTravel(travel: number, aspect: number): number {
  return travel * Math.min(1, aspect);
}

export function photo3dStrength(id: Photo3dStrength) {
  return PHOTO3D_STRENGTHS.find((entry) => entry.id === id) ?? PHOTO3D_STRENGTHS[1]!;
}

/**
 * Pomeraj kamere u trenutku `t` (0..1, jedan krug = ceo klip) u jedinicama
 * visine slike (ravan fotke je visoka 1, a kamera gleda u njen centar, pa se
 * srednja dubina ne pomera, bliže ide na jednu, dalje na drugu stranu). Sve putanje su periodične: `t = 0` i `t = 1` daju istu tačku,
 * pa se video vrti u petlji bez trzaja.
 */
export function cameraOffset(t: number, motion: Photo3dMotion, travel: number): { x: number; y: number; z: number } {
  const angle = 2 * Math.PI * t;
  switch (motion) {
    case "krug":
      return { x: Math.sin(angle) * travel, y: Math.cos(angle) * travel * 0.6, z: 0 };
    case "levo-desno":
      return { x: Math.sin(angle) * travel, y: 0, z: 0 };
    case "priblizi":
      return { x: 0, y: Math.sin(angle) * travel * 0.25, z: -((1 - Math.cos(angle)) / 2) * travel * 1.2 };
  }
}

/** Najveća duža stranica videa: 1080 p je dovoljno za mreže, a WebCodecs ga kodira brzo. */
export const PHOTO3D_MAX_SIDE = 1080;

/** Veličina videa: odnos fotke, duža stranica ≤ `maxSide`, obe stranice parne (H.264). */
export function photo3dVideoSize(width: number, height: number, maxSide: number = PHOTO3D_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const even = (value: number) => Math.max(2, Math.floor((value * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** Broj kadrova i trajanje jednog kadra. */
export function photo3dFrames(duration: Photo3dDuration, fps: number = PHOTO3D_FPS) {
  return { count: duration * fps, frameDuration: 1 / fps };
}

/** Mreža reljefa: oko jedne tačke na 4 piksela dubine, najviše 256 × 256. */
export function photo3dSegments(depthWidth: number, depthHeight: number) {
  return {
    x: Math.max(16, Math.min(256, Math.round(depthWidth / 4))),
    y: Math.max(16, Math.min(256, Math.round(depthHeight / 4))),
  };
}
