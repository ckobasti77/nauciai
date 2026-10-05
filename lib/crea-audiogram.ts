import type { LocalizedText } from "./i18n";
import type { Rect01, TimelineAspect } from "./crea-timeline";

/**
 * Audiogram (Crea K24, A20): zvuk + slika → video sa talasom i titlovima. Ovde su
 * raspored kadra, teme i nivoi talasa po kadru - čista logika; crtanje i MP4
 * (mediabunny) su u alatu. Boje su deo VIDEA (brend svetle teme, kao titlovi
 * u montaži), ne interfejsa, pa fajl izgleda isto u obe teme.
 */

export const AUDIOGRAM_ASPECTS = ["9:16", "1:1", "16:9"] as const satisfies readonly TimelineAspect[];
export type AudiogramAspect = (typeof AUDIOGRAM_ASPECTS)[number];

export const AUDIOGRAM_WAVES = ["stubici", "talas", "krug"] as const;
export type AudiogramWave = (typeof AUDIOGRAM_WAVES)[number];

export const AUDIOGRAM_THEMES = ["papir", "mastilo", "zuta"] as const;
export type AudiogramTheme = (typeof AUDIOGRAM_THEMES)[number];

/** Boje teme u fajlu (hex, platno ne čita CSS tokene). */
export const AUDIOGRAM_PALETTE: Record<AudiogramTheme, { background: string; card: string; wave: string; text: string; accent: string }> = {
  papir: { background: "#fffdf8", card: "#ffffff", wave: "#0e3158", text: "#0e3158", accent: "#f4be30" },
  mastilo: { background: "#0e3158", card: "#16406f", wave: "#f4be30", text: "#ffffff", accent: "#f4be30" },
  zuta: { background: "#f4be30", card: "#fffdf8", wave: "#0e3158", text: "#0e3158", accent: "#ffffff" },
};

export const AUDIOGRAM_LABELS = {
  waves: {
    stubici: { sr: "Stubići", en: "Bars" },
    talas: { sr: "Talas", en: "Wave" },
    krug: { sr: "Krug oko slike", en: "Ring" },
  },
  themes: {
    papir: { sr: "Papir", en: "Paper" },
    mastilo: { sr: "Mastilo", en: "Ink" },
    zuta: { sr: "Žuta", en: "Yellow" },
  },
} satisfies { waves: Record<AudiogramWave, LocalizedText>; themes: Record<AudiogramTheme, LocalizedText> };

export const AUDIOGRAM_FPS = 30;
export const AUDIOGRAM_BARS = 48;
export const AUDIOGRAM_TITLE_MAX = 80;

export type AudiogramLayout = {
  image: Rect01;
  wave: Rect01;
  captions: Rect01;
  title: Rect01 | null;
};

/**
 * Raspored po obliku. Uspravno: naslov gore, slika, talas, titl dole. Kvadrat:
 * slika levo-gore, talas i titl ispod. Položeno: slika levo, desno naslov, talas i titl.
 * Kod „kruga" talas obavija sliku (isti pravougaonik kao slika, malo veći).
 */
export function audiogramLayout(aspect: AudiogramAspect, wave: AudiogramWave, withTitle: boolean): AudiogramLayout {
  const ringPad = (rect: Rect01, ratio: number): Rect01 => {
    // Prsten je krug: dodatak mora biti isti u pikselima po obe ose (ratio = širina / visina).
    const padX = 0.06;
    const padY = padX * ratio;
    return { x: rect.x - padX, y: rect.y - padY, w: rect.w + padX * 2, h: rect.h + padY * 2 };
  };
  if (aspect === "9:16") {
    const ratio = 9 / 16;
    // Kvadratna slika: širina 0,62 kadra = 0,62 × 9/16 visine.
    const image = { x: 0.19, y: withTitle ? 0.2 : 0.14, w: 0.62, h: 0.62 * ratio };
    const below = image.y + image.h;
    return {
      title: withTitle ? { x: 0.08, y: 0.07, w: 0.84, h: 0.09 } : null,
      image,
      wave: wave === "krug" ? ringPad(image, ratio) : { x: 0.1, y: below + 0.06, w: 0.8, h: 0.12 },
      captions: { x: 0.08, y: 0.76, w: 0.84, h: 0.16 },
    };
  }
  if (aspect === "1:1") {
    const image = { x: 0.3, y: withTitle ? 0.2 : 0.08, w: 0.4, h: 0.4 };
    return {
      title: withTitle ? { x: 0.08, y: 0.03, w: 0.84, h: 0.11 } : null,
      image,
      wave: wave === "krug" ? ringPad(image, 1) : { x: 0.1, y: image.y + image.h + 0.04, w: 0.8, h: 0.12 },
      captions: { x: 0.06, y: 0.79, w: 0.88, h: 0.17 },
    };
  }
  const ratio = 16 / 9;
  // Položeno: kvadratna slika visine 0,64 = širina 0,64 × 9/16.
  const image = { x: 0.07, y: 0.18, w: 0.64 / ratio, h: 0.64 };
  // Prsten oko slike zauzme još ~0,06 širine, pa desna kolona počinje dalje.
  const right = image.x + image.w + (wave === "krug" ? 0.09 : 0.05);
  return {
    title: withTitle ? { x: right, y: 0.12, w: 0.93 - right, h: 0.14 } : null,
    image,
    wave: wave === "krug" ? ringPad(image, ratio) : { x: right, y: withTitle ? 0.34 : 0.22, w: 0.93 - right, h: 0.2 },
    captions: { x: right, y: 0.6, w: 0.93 - right, h: 0.26 },
  };
}

/** Rect01 je unutar kadra (uz malu toleranciju za zaokruživanje). */
export function insideFrame(rect: Rect01): boolean {
  const eps = 1e-9;
  return rect.x >= -eps && rect.y >= -eps && rect.x + rect.w <= 1 + eps && rect.y + rect.h <= 1 + eps && rect.w > 0 && rect.h > 0;
}

export function overlaps(a: Rect01, b: Rect01): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const LEVEL_FLOOR_DB = -50;
const WINDOW_S = 0.5;

/**
 * Nivoi talasa po kadru (`frames × bars`, 0..1). Svaki kadar gleda pola sekunde
 * zvuka oko svog trenutka, podeljeno na `bars` delića: stubić = jačina delića u dB
 * (−50..0), normalizovano na 98. percentil celog snimka - tih podkast i glasna
 * pesma oba popune visinu. Pad je sporiji od rasta, pa talas „diše" umesto da trepće.
 */
export function waveFrames(samples: Float32Array, sampleRate: number, fps: number, bars: number): { levels: Float32Array; frames: number } {
  const durationS = samples.length / sampleRate;
  const frames = Math.max(1, Math.ceil(durationS * fps));
  const levels = new Float32Array(frames * bars);
  const slice = WINDOW_S / bars;
  const sliceSamples = Math.max(1, Math.round(slice * sampleRate));
  for (let frame = 0; frame < frames; frame++) {
    const center = frame / fps;
    for (let bar = 0; bar < bars; bar++) {
      const start = Math.round((center - WINDOW_S / 2 + bar * slice) * sampleRate);
      let sum = 0;
      let count = 0;
      for (let at = Math.max(0, start); at < Math.min(samples.length, start + sliceSamples); at++) {
        sum += samples[at]! * samples[at]!;
        count++;
      }
      const db = count > 0 ? 10 * Math.log10(sum / count + 1e-12) : LEVEL_FLOOR_DB;
      levels[frame * bars + bar] = Math.max(0, (db - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB);
    }
  }
  const sorted = Array.from(levels)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const top = sorted[Math.floor(sorted.length * 0.98)] ?? 0;
  if (top > 0) for (let index = 0; index < levels.length; index++) levels[index] = Math.min(1, levels[index]! / top);
  // Brz rast, sporiji pad (po stubiću, kroz kadrove).
  for (let bar = 0; bar < bars; bar++) {
    for (let frame = 1; frame < frames; frame++) {
      const previous = levels[(frame - 1) * bars + bar]!;
      const current = levels[frame * bars + bar]!;
      if (current < previous) levels[frame * bars + bar] = previous * 0.6 + current * 0.4;
    }
  }
  return { levels, frames };
}

/** Nivoi jednog kadra. */
export function waveAt(levels: Float32Array, bars: number, frame: number): Float32Array {
  const frames = Math.floor(levels.length / bars);
  const index = Math.max(0, Math.min(frames - 1, frame));
  return levels.subarray(index * bars, (index + 1) * bars);
}
