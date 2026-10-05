/**
 * Ken Burns za fotke u montaži (Crea K19, V24/V29; plan K17 §2.1): lagan zum i
 * pomeranje kadra preko mirne slike. Čista geometrija - test proverava da se
 * ivica slike NIKAD ne vidi (isti princip kao `photo3dCameraDistance`, K10).
 *
 * Prozor se računa nad CELOM slikom: pri zumu 1 to je najveći isečak oblika
 * kadra koji staje u sliku (kao `cover`), a veći zum ga smanjuje. Pomeraj
 * `x`/`y` (−1 … 1) pomera prozor od jedne do druge ivice slike, pa široka fotka
 * u uspravnom videu dobija dugačku vožnju s leva na desno.
 */

export type KenBurnsPoint = {
  /** ≥ 1: koliko je kadar uvećan u odnosu na isečak „cover". */
  zoom: number;
  /** −1 = leva ivica slike, 0 = sredina, 1 = desna ivica. */
  x: number;
  /** −1 = gornja ivica, 0 = sredina, 1 = donja ivica. */
  y: number;
};

export type KenBurns = { from: KenBurnsPoint; to: KenBurnsPoint };

/** Prozor slike u delovima njene širine i visine (0..1). */
export type CropWindow = { x: number; y: number; w: number; h: number };

export const KEN_BURNS_ZOOM_MAX = 2;

export const KEN_BURNS_PRESET_IDS = ["pribli", "udalji", "levo-desno", "desno-levo", "gore-dole", "dole-gore"] as const;
export type KenBurnsPresetId = (typeof KEN_BURNS_PRESET_IDS)[number];

export const KEN_BURNS_PRESETS: Record<KenBurnsPresetId, KenBurns> = {
  pribli: { from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1.25, x: 0, y: 0 } },
  udalji: { from: { zoom: 1.25, x: 0, y: 0 }, to: { zoom: 1, x: 0, y: 0 } },
  "levo-desno": { from: { zoom: 1.15, x: -1, y: 0 }, to: { zoom: 1.15, x: 1, y: 0 } },
  "desno-levo": { from: { zoom: 1.15, x: 1, y: 0 }, to: { zoom: 1.15, x: -1, y: 0 } },
  "gore-dole": { from: { zoom: 1.15, x: 0, y: -1 }, to: { zoom: 1.15, x: 0, y: 1 } },
  "dole-gore": { from: { zoom: 1.15, x: 0, y: 1 }, to: { zoom: 1.15, x: 0, y: -1 } },
};

/** Jačina pokreta za šablone po ritmu (V29): koliko se zum i vožnja pojačavaju. */
export function scaleKenBurns(kb: KenBurns, strength: number): KenBurns {
  const scale = (point: KenBurnsPoint): KenBurnsPoint => ({
    zoom: 1 + (point.zoom - 1) * strength,
    x: point.x * Math.min(1, strength),
    y: point.y * Math.min(1, strength),
  });
  return clampKenBurns({ from: scale(kb.from), to: scale(kb.to) });
}

/** Naizmenični pokreti za niz fotki (slajdšou ne sme da „vozi" stalno na istu stranu). */
export function kenBurnsForIndex(index: number): KenBurns {
  const order: KenBurnsPresetId[] = ["pribli", "levo-desno", "udalji", "desno-levo", "pribli", "dole-gore"];
  return KEN_BURNS_PRESETS[order[((index % order.length) + order.length) % order.length]];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampKenBurnsPoint(point: KenBurnsPoint): KenBurnsPoint {
  return { zoom: clamp(point.zoom, 1, KEN_BURNS_ZOOM_MAX), x: clamp(point.x, -1, 1), y: clamp(point.y, -1, 1) };
}

export function clampKenBurns(kb: KenBurns): KenBurns {
  return { from: clampKenBurnsPoint(kb.from), to: clampKenBurnsPoint(kb.to) };
}

/**
 * Prozor slike u trenutku `p` (0..1) za sliku odnosa `imageAspect` (š/v) u kadru
 * odnosa `frameAspect`. Uvek ceo unutar slike: veličina prozora je isečak oblika
 * kadra podeljen zumom (≥ 1), a centar se kreće samo koliko prozor dozvoljava.
 */
export function kenBurnsWindow(kb: KenBurns, p: number, imageAspect: number, frameAspect: number): CropWindow {
  const t = clamp(p, 0, 1);
  const from = clampKenBurnsPoint(kb.from);
  const to = clampKenBurnsPoint(kb.to);
  const zoom = from.zoom + (to.zoom - from.zoom) * t;
  const panX = from.x + (to.x - from.x) * t;
  const panY = from.y + (to.y - from.y) * t;

  // Isečak „cover" u delovima slike: širi kadar od slike seče visinu, uži seče širinu.
  const ratio = frameAspect / imageAspect;
  const coverW = ratio < 1 ? ratio : 1;
  const coverH = ratio < 1 ? 1 : 1 / ratio;
  const w = coverW / zoom;
  const h = coverH / zoom;
  const cx = 0.5 + panX * (0.5 - w / 2);
  const cy = 0.5 + panY * (0.5 - h / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Prozor bez Ken Burnsa: običan isečak „cover" iz sredine. */
export function coverWindow(imageAspect: number, frameAspect: number): CropWindow {
  return kenBurnsWindow({ from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1, x: 0, y: 0 } }, 0, imageAspect, frameAspect);
}

/** Ken Burns isečen na deo [a, b] trajanja (podela klipa, K19 `splitAt`). */
export function sliceKenBurns(kb: KenBurns, a: number, b: number): KenBurns {
  const at = (p: number): KenBurnsPoint => ({
    zoom: kb.from.zoom + (kb.to.zoom - kb.from.zoom) * p,
    x: kb.from.x + (kb.to.x - kb.from.x) * p,
    y: kb.from.y + (kb.to.y - kb.from.y) * p,
  });
  return clampKenBurns({ from: at(clamp(a, 0, 1)), to: at(clamp(b, 0, 1)) });
}
