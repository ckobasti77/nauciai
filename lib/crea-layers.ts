/**
 * Editor slojeva (S20, K12): stanje slojeva posle razlaganja (Seedream 5 Pro
 * „layerize") - pomeri, sakrij, prefarbaj, promeni redosled, spoji sa donjim.
 * Čista logika bez browsera; crtanje (Konva) i slaganje piksela su u
 * `components/crea/tools/layers-tool.tsx`.
 *
 * Slojevi idu odozdo nagore: `layers[0]` je pozadina.
 */

import { hexToRgb, type Rgb } from "./crea-palette";
import type { Locale } from "./i18n";

export type LayerTint = { color: string; amount: number };

export type EditorLayer = {
  id: string;
  /** Redni broj iz razlaganja (1 = pozadina); spojen sloj nosi najmanji od spojenih. */
  number: number;
  /** Id slike u editoru (sirov sloj ili rezultat spajanja). */
  asset: string;
  x: number;
  y: number;
  visible: boolean;
  tint: LayerTint | null;
  /** Koliko slojeva je spojeno u ovaj (1 = nije spajan). */
  merged: number;
};

export type LayersState = { width: number; height: number; layers: EditorLayer[] };

/** Pomeraj sloja ne sme da ga odnese daleko van platna (ostaje da se vrati). */
export const LAYER_MAX_OFFSET_FACTOR = 1;

export function initialLayers(width: number, height: number, assets: ReadonlyArray<{ asset: string; number: number }>): LayersState {
  return {
    width,
    height,
    layers: assets.map((entry, index) => ({
      id: `sloj-${entry.number}-${index}`,
      number: entry.number,
      asset: entry.asset,
      x: 0,
      y: 0,
      visible: true,
      tint: null,
      merged: 1,
    })),
  };
}

function update(state: LayersState, id: string, patch: (layer: EditorLayer) => EditorLayer): LayersState {
  let changed = false;
  const layers = state.layers.map((layer) => {
    if (layer.id !== id) return layer;
    changed = true;
    return patch(layer);
  });
  return changed ? { ...state, layers } : state;
}

export function moveLayer(state: LayersState, id: string, x: number, y: number): LayersState {
  const limitX = state.width * LAYER_MAX_OFFSET_FACTOR;
  const limitY = state.height * LAYER_MAX_OFFSET_FACTOR;
  const clamp = (value: number, limit: number) => Math.round(Math.max(-limit, Math.min(limit, Number.isFinite(value) ? value : 0)));
  return update(state, id, (layer) => ({ ...layer, x: clamp(x, limitX), y: clamp(y, limitY) }));
}

export function nudgeLayer(state: LayersState, id: string, dx: number, dy: number): LayersState {
  const layer = state.layers.find((entry) => entry.id === id);
  return layer ? moveLayer(state, id, layer.x + dx, layer.y + dy) : state;
}

export function toggleLayer(state: LayersState, id: string): LayersState {
  return update(state, id, (layer) => ({ ...layer, visible: !layer.visible }));
}

/** Boja + jačina 0..1; `null` ili jačina 0 skida bojenje. Neispravna boja se ignoriše. */
export function setLayerTint(state: LayersState, id: string, tint: LayerTint | null): LayersState {
  if (tint && !hexToRgb(tint.color)) return state;
  const next = tint && tint.amount > 0 ? { color: tint.color.toLowerCase(), amount: Math.min(1, Math.max(0, tint.amount)) } : null;
  return update(state, id, (layer) => ({ ...layer, tint: next }));
}

/** Gore = bliže gledaocu (kraj niza). */
export function reorderLayer(state: LayersState, id: string, direction: "up" | "down"): LayersState {
  const index = state.layers.findIndex((layer) => layer.id === id);
  const target = direction === "up" ? index + 1 : index - 1;
  if (index < 0 || target < 0 || target >= state.layers.length) return state;
  const layers = [...state.layers];
  [layers[index], layers[target]] = [layers[target]!, layers[index]!];
  return { ...state, layers };
}

export function canMergeDown(state: LayersState, id: string): boolean {
  return state.layers.findIndex((layer) => layer.id === id) > 0;
}

/** Dva sloja koja se spajaju (donji pa gornji) - crtač ih slaže tim redom u novu sliku. */
export function mergePair(state: LayersState, id: string): [below: EditorLayer, above: EditorLayer] | null {
  const index = state.layers.findIndex((layer) => layer.id === id);
  if (index <= 0) return null;
  return [state.layers[index - 1]!, state.layers[index]!];
}

/**
 * Spoji sloj sa onim ispod: oba nestaju, na njihovo mesto dolazi jedan sloj sa
 * slikom `mergedAsset` (crtač je već složio oba, sa pomerajem i bojom), bez
 * pomeraja i bojenja. Sakriven sloj se ne spaja (crtač ga ne bi video).
 */
export function mergeDown(state: LayersState, id: string, mergedAsset: string): LayersState {
  const pair = mergePair(state, id);
  if (!pair) return state;
  const [below, above] = pair;
  if (!below.visible || !above.visible) return state;
  const index = state.layers.indexOf(above);
  const merged: EditorLayer = {
    id: `spojeno-${below.id}-${above.id}`.slice(0, 80),
    number: Math.min(below.number, above.number),
    asset: mergedAsset,
    x: 0,
    y: 0,
    visible: true,
    tint: null,
    merged: below.merged + above.merged,
  };
  const layers = [...state.layers.slice(0, index - 1), merged, ...state.layers.slice(index + 1)];
  return { ...state, layers };
}

/** Šta se crta (i izvozi), odozdo nagore. */
export function visibleLayers(state: LayersState): EditorLayer[] {
  return state.layers.filter((layer) => layer.visible);
}

/** Da li je išta promenjeno u odnosu na početak (za „Vrati sve" i izvoz). */
export function layersChanged(initial: LayersState, current: LayersState): boolean {
  if (initial.layers.length !== current.layers.length) return true;
  return current.layers.some((layer, index) => {
    const start = initial.layers[index]!;
    return (
      layer.id !== start.id ||
      layer.x !== start.x ||
      layer.y !== start.y ||
      layer.visible !== start.visible ||
      (layer.tint?.color ?? null) !== (start.tint?.color ?? null) ||
      (layer.tint?.amount ?? 0) !== (start.tint?.amount ?? 0)
    );
  });
}

export function layerName(layer: Pick<EditorLayer, "number" | "merged">, locale: Locale): string {
  if (layer.merged > 1) return locale === "sr" ? `Spojeno (${layer.merged} sloja)` : `Merged (${layer.merged} layers)`;
  if (layer.number === 1) return locale === "sr" ? "Sloj 1 · pozadina" : "Layer 1 · background";
  return locale === "sr" ? `Sloj ${layer.number}` : `Layer ${layer.number}`;
}

// ── Bojenje (prefarbaj) ──────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

function hueToChannel(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const value = Math.round(l * 255);
    return [value, value, value];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToChannel(p, q, h + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, h) * 255),
    Math.round(hueToChannel(p, q, h - 1 / 3) * 255),
  ];
}

/**
 * Prefarbaj jedan piksel: nijansa i zasićenost iz izabrane boje, svetlina iz
 * piksela (senke i odsjaji ostaju), pa mešanje sa originalom po jačini.
 */
export function tintPixel(r: number, g: number, b: number, target: Rgb, amount: number): Rgb {
  const a = Math.min(1, Math.max(0, amount));
  if (a === 0) return [r, g, b];
  const [th, ts] = rgbToHsl(target[0], target[1], target[2]);
  const [, , l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(th, ts, l);
  return [Math.round(r + (nr - r) * a), Math.round(g + (ng - g) * a), Math.round(b + (nb - b) * a)];
}

/** Bojenje celog RGBA bafera na mestu; providni pikseli se ne diraju. */
export function tintPixels(rgba: Uint8ClampedArray, tint: LayerTint): void {
  const target = hexToRgb(tint.color);
  if (!target || tint.amount <= 0) return;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const [r, g, b] = tintPixel(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, target, tint.amount);
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
  }
}
