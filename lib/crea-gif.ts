/**
 * GIF od slika (S31, K09): redosled sličica, veličina platna, raspored svake
 * slike na njemu i brzina. Kodiranje radi `gifenc` u
 * `components/crea/tools/gif-tool.tsx`.
 */

import type { Box } from "./crea-crop";

/** Više sličica = veći fajl i duže kodiranje na telefonu; 30 je dovoljno za kratku petlju. */
export const GIF_MAX_FRAMES = 30;
export const GIF_MIN_FRAMES = 2;

export const GIF_SIZES = [320, 480, 720] as const;
export type GifSize = (typeof GIF_SIZES)[number];
export const GIF_DEFAULT_SIZE: GifSize = 480;

export const GIF_SPEEDS = [
  { id: "sporo", ms: 1000, label: { sr: "Sporo", en: "Slow" } },
  { id: "srednje", ms: 500, label: { sr: "Srednje", en: "Medium" } },
  { id: "brzo", ms: 200, label: { sr: "Brzo", en: "Fast" } },
] as const;
export type GifSpeedId = (typeof GIF_SPEEDS)[number]["id"];

export function gifDelayMs(speed: GifSpeedId): number {
  return GIF_SPEEDS.find((entry) => entry.id === speed)?.ms ?? 500;
}

/**
 * Platno GIF-a ima odnos PRVE slike, a duža stranica je `maxSide`. Stranice su
 * parne (neki pregledači pomere neparan GIF za pola piksela).
 */
export function gifCanvasSize(first: { width: number; height: number }, maxSide: number): { width: number; height: number } {
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  const scale = Math.min(1, maxSide / Math.max(first.width, first.height));
  return { width: even(first.width * scale), height: even(first.height * scale) };
}

/**
 * Gde se slika crta na platnu. „Ceo kadar" (`contain`) pokazuje celu sliku uz
 * trake; „Popuni" (`cover`) seče višak. Rezultat je pravougaonik na platnu.
 */
export function fitFrame(
  source: { width: number; height: number },
  canvas: { width: number; height: number },
  mode: "contain" | "cover",
): Box {
  const scale =
    mode === "contain"
      ? Math.min(canvas.width / source.width, canvas.height / source.height)
      : Math.max(canvas.width / source.width, canvas.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
}

/** Pomeri element liste (redosled sličica); van granica = ista lista. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Trajanje jedne petlje u sekundama, zaokruženo na desetinku. */
export function loopSeconds(frames: number, delayMs: number): number {
  return Math.round((frames * delayMs) / 100) / 10;
}
