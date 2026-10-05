/**
 * „Iseci, okreni, promeni veličinu" (S26, K09) i pametan isečak (S30) - sve
 * što se može izračunati bez browsera: preseti formata, okretanje u koracima od
 * 90° i preslikavanje, isečak iz procenata u piksele i izlazna veličina. Crtanje
 * (canvas, pica) živi u `components/crea/tools/crop-tool.tsx`.
 */

import { fitPixels, outputFileName } from "./crea-image-format";
import type { LocalizedText } from "./i18n";

export type CropPresetId = "original" | "kvadrat" | "objava" | "prica" | "youtube" | "profilna";

export type CropPreset = {
  id: CropPresetId;
  label: LocalizedText;
  /** Gde se koristi - jedna kratka linija ispod naziva. */
  hint: LocalizedText;
  /** Širina / visina; `null` = isti oblik kao slika (isecanje zumiranjem). */
  aspect: number | null;
  /** Preporučena izlazna veličina; `null` = koliko je isečeno. */
  size: { width: number; height: number } | null;
  /** Pregled isečka kao krug (profilna se svuda prikazuje okrugla). */
  round?: boolean;
};

export const CROP_PRESETS: readonly CropPreset[] = [
  {
    id: "original",
    label: { sr: "Kao original", en: "Like the original" },
    hint: { sr: "isti oblik, ti biraš veličinu", en: "same shape, you pick the size" },
    aspect: null,
    size: null,
  },
  {
    id: "kvadrat",
    label: { sr: "Instagram kvadrat", en: "Instagram square" },
    hint: { sr: "1:1 · 1080 × 1080", en: "1:1 · 1080 × 1080" },
    aspect: 1,
    size: { width: 1080, height: 1080 },
  },
  {
    id: "objava",
    label: { sr: "Instagram objava", en: "Instagram post" },
    hint: { sr: "4:5 · 1080 × 1350", en: "4:5 · 1080 × 1350" },
    aspect: 4 / 5,
    size: { width: 1080, height: 1350 },
  },
  {
    id: "prica",
    label: { sr: "Priča · TikTok · Reels", en: "Story · TikTok · Reels" },
    hint: { sr: "9:16 · 1080 × 1920", en: "9:16 · 1080 × 1920" },
    aspect: 9 / 16,
    size: { width: 1080, height: 1920 },
  },
  {
    id: "youtube",
    label: { sr: "YouTube sličica", en: "YouTube thumbnail" },
    hint: { sr: "16:9 · 1280 × 720", en: "16:9 · 1280 × 720" },
    aspect: 16 / 9,
    size: { width: 1280, height: 720 },
  },
  {
    id: "profilna",
    label: { sr: "Profilna", en: "Profile picture" },
    hint: { sr: "1:1 · 800 × 800, prikaz u krugu", en: "1:1 · 800 × 800, shown as a circle" },
    aspect: 1,
    size: { width: 800, height: 800 },
    round: true,
  },
];

export function cropPreset(id: CropPresetId): CropPreset {
  return CROP_PRESETS.find((preset) => preset.id === id) ?? CROP_PRESETS[0];
}

/** Preseti koje nudi pametan isečak (S30): svi sa fiksnim odnosom. */
export const SMART_CROP_PRESET_IDS: readonly CropPresetId[] = ["kvadrat", "objava", "prica", "youtube", "profilna"];

// ── Okretanje i preslikavanje ────────────────────────────────────────────────

export type Rotation = 0 | 90 | 180 | 270;
/** Okretanje (u smeru kazaljke) pa preslikavanje - oba onako kako se vide na ekranu. */
export type Orientation = { rotation: Rotation; flipH: boolean; flipV: boolean };

export const NO_ORIENTATION: Orientation = { rotation: 0, flipH: false, flipV: false };

function normRotation(degrees: number): Rotation {
  return ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as Rotation;
}

/** Oba preslikavanja = okret za 180°; čuvamo kraći zapis. */
function normalize(orientation: Orientation): Orientation {
  if (orientation.flipH && orientation.flipV) {
    return { rotation: normRotation(orientation.rotation + 180), flipH: false, flipV: false };
  }
  return { ...orientation, rotation: normRotation(orientation.rotation) };
}

/**
 * Okret za `delta` stepeni (+90 = udesno) u prostoru EKRANA. Posle jednog
 * preslikavanja okret u ekranu je obrnut okret slike (R·S = S·R⁻¹).
 */
export function rotateBy(orientation: Orientation, delta: 90 | -90): Orientation {
  const mirrored = orientation.flipH !== orientation.flipV;
  return normalize({ ...orientation, rotation: normRotation(orientation.rotation + (mirrored ? -delta : delta)) });
}

export function flip(orientation: Orientation, axis: "h" | "v"): Orientation {
  return normalize(
    axis === "h" ? { ...orientation, flipH: !orientation.flipH } : { ...orientation, flipV: !orientation.flipV },
  );
}

export function isIdentity(orientation: Orientation): boolean {
  return orientation.rotation === 0 && !orientation.flipH && !orientation.flipV;
}

export function orientedSize(width: number, height: number, orientation: Orientation) {
  return orientation.rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

/** Matrica za `ctx.setTransform(a, b, c, d, e, f)`: slika `width × height` → okrenuto platno. */
export type CanvasMatrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export function orientationMatrix(width: number, height: number, orientation: Orientation): CanvasMatrix {
  const out = orientedSize(width, height, orientation);
  const [cos, sin] = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] }[orientation.rotation];
  const sx = orientation.flipH ? -1 : 1;
  const sy = orientation.flipV ? -1 : 1;
  // T(centar izlaza) · S(preslikaj) · R(okreni) · T(-centar slike)
  const a = sx * cos;
  const b = sy * sin;
  const c = -sx * sin;
  const d = sy * cos;
  const e = out.width / 2 - (a * width) / 2 - (c * height) / 2;
  const f = out.height / 2 - (b * width) / 2 - (d * height) / 2;
  return [a, b, c, d, e, f].map((value) => (Object.is(value, -0) ? 0 : value)) as unknown as CanvasMatrix;
}

export function applyMatrix(matrix: CanvasMatrix, x: number, y: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

// ── Isečak i izlazna veličina ────────────────────────────────────────────────

export type Box = { x: number; y: number; width: number; height: number };

/** Isečak iz `react-easy-crop` (procenti 0-100) u cele piksele, uvek unutar slike i bar 1 × 1. */
export function percentToPixels(area: Box, width: number, height: number): Box {
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
  const x = Math.round(clamp((area.x / 100) * width, width - 1));
  const y = Math.round(clamp((area.y / 100) * height, height - 1));
  const right = Math.round(clamp(((area.x + area.width) / 100) * width, width));
  const bottom = Math.round(clamp(((area.y + area.height) / 100) * height, height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

export const RESIZE_MIN_PX = 16;
export const RESIZE_MAX_PX = 8192;

export type OutputSize = {
  width: number;
  height: number;
  /** Isečak je manji od preporučene veličine preseta - ne uvećavamo, samo kažemo. */
  belowRecommended: boolean;
  /** Smanjeno zbog granice platna na telefonu (`CANVAS_MAX_PIXELS`). */
  limited: boolean;
};

/**
 * Izlazna veličina. Preset sa veličinom: tačno ta veličina ako je isečak dovoljno
 * velik, inače veličina isečka (uvećanje ne dodaje detalje, samo mutnoću).
 * „Kao original": širina koju je korisnik upisao (16-8192 px), visina ide po odnosu.
 */
export function outputSize(crop: { width: number; height: number }, preset: CropPreset, customWidth: number | null): OutputSize {
  let width = crop.width;
  let height = crop.height;
  let belowRecommended = false;

  if (preset.size) {
    if (crop.width >= preset.size.width) {
      width = preset.size.width;
      height = preset.size.height;
    } else {
      belowRecommended = true;
      height = Math.round(width / (preset.aspect ?? crop.width / crop.height));
    }
  } else if (customWidth !== null && Number.isFinite(customWidth)) {
    width = Math.min(RESIZE_MAX_PX, Math.max(RESIZE_MIN_PX, Math.round(customWidth)));
    height = Math.max(1, Math.round((width * crop.height) / crop.width));
  }

  const fit = fitPixels(width, height);
  return { width: fit.width, height: fit.height, belowRecommended, limited: fit.scaled };
}

/**
 * Format isečka: JPG ostaje JPG, PNG i WebP ostaju (mogu da budu providni),
 * a sve ostalo (GIF, AVIF, BMP) postaje PNG - platno ih ne ume sve kodirati.
 */
export function cropOutputType(inputType: string): "image/jpeg" | "image/png" | "image/webp" {
  if (inputType === "image/jpeg" || inputType === "image/webp") return inputType;
  return "image/png";
}

/** „more.jpg" → „more-isecak.jpg" (isto čišćenje imena kao u „Promeni format"). */
export function cropFileName(inputName: string, type: string): string {
  const format = type === "image/jpeg" ? "jpeg" : type === "image/webp" ? "webp" : "png";
  return outputFileName(inputName, format).replace(/(\.[a-z]+)$/, "-isecak$1");
}
