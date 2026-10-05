import type { CreaDeviceClass } from "./crea-device";
import type { LoudnessTargetId } from "./crea-loudness";

/**
 * Uređivač zvuka (Crea K24, A14): dokument izmena bez browser API-ja.
 *
 * Izmene su NEDESTRUKTIVNE: glavna traka je niz isečaka izvora (`in`..`out` u
 * sekundama izvora) koji idu jedan za drugim, bez rupa („magnetno", kao glavna
 * traka montaže K19). Brisanje dela, „zadrži samo izabrano", brisanje tišine i
 * spajanje samo menjaju spisak isečaka - izvorni snimak ostaje netaknut, pa
 * poništi/ponovi uvek radi. Dodatne trake (muzika, ambijent, efekti) stoje na
 * svom mestu ispod glavne. Efekti se primenjuju tek pri slušanju i izvozu.
 */

export type EditClip = { id: string; source: string; in: number; out: number };

export type ExtraTrack = {
  id: string;
  source: string;
  /** Gde počinje na izlazu (s). */
  at: number;
  in: number;
  out: number;
  gainDb: number;
  /** Ponavlja se do kraja glavne trake (ambijent, podloga). */
  loop: boolean;
  /** Utišava se dok neko govori na glavnoj traci. */
  duck: boolean;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
};

export const COMPRESSOR_PRESETS = ["off", "blag", "jak"] as const;
export type CompressorPreset = (typeof COMPRESSOR_PRESETS)[number];
export const ECHO_PRESETS = ["off", "soba", "sala", "katedrala", "eho"] as const;
export type EchoPreset = (typeof ECHO_PRESETS)[number];

export type AudioFx = {
  /** Pojačanje glavne trake (dB). */
  gainDb: number;
  /** Ekvilajzer: bas (100 Hz), sredina (1,5 kHz), visoki (8 kHz), ±12 dB. */
  eq: { low: number; mid: number; high: number };
  compressor: CompressorPreset;
  echo: { preset: EchoPreset; mix: number };
  /** Brzina bez promene visine (0,5-2) i visina u polutonovima (−12..12). */
  speed: number;
  pitch: number;
};

export type AudioEditDoc = {
  v: 1;
  main: EditClip[];
  /** Postepeno pojačavanje na početku i stišavanje na kraju glavne trake (s). */
  fadeIn: number;
  fadeOut: number;
  extras: ExtraTrack[];
  fx: AudioFx;
  loudness: LoudnessTargetId;
};

export const EDIT_LIMITS = {
  clips: 400,
  extras: 3,
  fadeS: 10,
  gainDb: { min: -24, max: 12 },
  eqDb: 12,
  speed: { min: 0.5, max: 2 },
  pitch: 12,
  /** Najkraći deo koji se čuva posle reza (kraći se odbaci, da ne ostanu „mrvice"). */
  minClipS: 0.02,
} as const;

/**
 * Najduži snimak koji se uređuje na uređaju (s). Ceo zvuk je u memoriji kao
 * 44,1 kHz stereo (≈21 MB po minutu po baferu, a lanac drži 3-4 bafera).
 */
export const EDITOR_MAX_SECONDS: Record<CreaDeviceClass, number> = {
  weak: 3 * 60,
  phone: 5 * 60,
  desktop: 15 * 60,
  "desktop-gpu": 15 * 60,
};

export const EDITOR_SAMPLE_RATE = 44100;

export const DEFAULT_FX: AudioFx = {
  gainDb: 0,
  eq: { low: 0, mid: 0, high: 0 },
  compressor: "off",
  echo: { preset: "off", mix: 0.25 },
  speed: 1,
  pitch: 0,
};

/** Gotovi zvuci za EQ: korisnik bira rečima, a klizači pokažu šta to znači. */
export const EQ_PRESETS = {
  ravno: { low: 0, mid: 0, high: 0 },
  jasnije: { low: -3, mid: 2, high: 4 },
  toplije: { low: 4, mid: 0, high: -2 },
  radio: { low: 3, mid: 3, high: 2 },
  telefon: { low: -12, mid: 6, high: -12 },
} as const satisfies Record<string, AudioFx["eq"]>;
export type EqPresetId = keyof typeof EQ_PRESETS;

export function emptyEdit(): AudioEditDoc {
  return { v: 1, main: [], fadeIn: 0, fadeOut: 0, extras: [], fx: { ...DEFAULT_FX, eq: { ...DEFAULT_FX.eq }, echo: { ...DEFAULT_FX.echo } }, loudness: "mreze" };
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function nextId(doc: AudioEditDoc, prefix: string): string {
  const used = new Set([...doc.main.map((clip) => clip.id), ...doc.extras.map((track) => track.id)]);
  let index = used.size + 1;
  while (used.has(`${prefix}${index}`)) index++;
  return `${prefix}${index}`;
}

export function clipLength(clip: { in: number; out: number }): number {
  return Math.max(0, clip.out - clip.in);
}

export function mainDuration(doc: AudioEditDoc): number {
  return round(doc.main.reduce((sum, clip) => sum + clipLength(clip), 0));
}

export type MainPlacement = { clip: EditClip; start: number; end: number };

export function placeMain(doc: AudioEditDoc): MainPlacement[] {
  let start = 0;
  return doc.main.map((clip) => {
    const end = round(start + clipLength(clip));
    const placement = { clip, start, end };
    start = end;
    return placement;
  });
}

/** Snimak na kraj glavne trake („spoji"). */
export function appendSource(doc: AudioEditDoc, source: string, durationS: number): AudioEditDoc {
  if (durationS <= 0 || doc.main.length >= EDIT_LIMITS.clips) return doc;
  return { ...doc, main: [...doc.main, { id: nextId(doc, "c"), source, in: 0, out: round(durationS) }] };
}

/** Sređeni opsezi: unutar [0, dužina], spojeni kad se dodiruju, rastuće. */
export function normalizeRanges(ranges: ReadonlyArray<readonly [number, number]>, durationS: number): Array<[number, number]> {
  const clean = ranges
    .map(([a, b]) => [clamp(Math.min(a, b), 0, durationS), clamp(Math.max(a, b), 0, durationS)] as [number, number])
    .filter(([a, b]) => b - a > 1e-6)
    .sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const range of clean) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged.map(([a, b]) => [round(a), round(b)]);
}

/**
 * Brisanje opsega glavne trake (vreme trake, ne izvora): isečci se podele na
 * ivicama, deo unutar opsega nestane, ostatak se pomeri ulevo. Više opsega se
 * briše od poslednjeg ka prvom, pa vremena ostalih opsega ostaju tačna.
 */
export function cutRanges(doc: AudioEditDoc, ranges: ReadonlyArray<readonly [number, number]>): AudioEditDoc {
  const cuts = normalizeRanges(ranges, mainDuration(doc));
  if (cuts.length === 0) return doc;
  let next = doc;
  for (let index = cuts.length - 1; index >= 0; index--) next = cutOne(next, cuts[index]![0], cuts[index]![1]);
  return next;
}

function cutOne(doc: AudioEditDoc, from: number, to: number): AudioEditDoc {
  const main: EditClip[] = [];
  let counter = 0;
  for (const { clip, start, end } of placeMain(doc)) {
    if (end <= from || start >= to) {
      main.push(clip);
      continue;
    }
    const headLength = from - start;
    const tailLength = end - to;
    if (headLength >= EDIT_LIMITS.minClipS) main.push({ ...clip, out: round(clip.in + headLength) });
    if (tailLength >= EDIT_LIMITS.minClipS) {
      // Desni deo podeljenog isečka dobija nov id (levi zadržava stari).
      const id = headLength >= EDIT_LIMITS.minClipS ? `${clip.id}.${++counter}` : clip.id;
      main.push({ ...clip, id, in: round(clip.out - tailLength) });
    }
  }
  return { ...doc, main: main.slice(0, EDIT_LIMITS.clips) };
}

/** „Zadrži samo izabrano": sve van [from, to] se briše. */
export function keepRange(doc: AudioEditDoc, from: number, to: number): AudioEditDoc {
  const duration = mainDuration(doc);
  return cutRanges(doc, [
    [0, Math.min(from, to)],
    [Math.max(from, to), duration],
  ]);
}

/** Tačka glavne trake → izvor i vreme u njemu (`null` posle kraja). */
export function sourceAt(doc: AudioEditDoc, t: number): { source: string; time: number } | null {
  for (const { clip, start, end } of placeMain(doc)) {
    if (t >= start && t < end) return { source: clip.source, time: round(clip.in + (t - start)) };
  }
  return null;
}

/** Ukupno obrisano iz izvora (za poruku „Uklonjeno 12,4 s"). */
export function removedSeconds(before: AudioEditDoc, after: AudioEditDoc): number {
  return Math.max(0, round(mainDuration(before) - mainDuration(after)));
}

export function setFades(doc: AudioEditDoc, fadeIn: number, fadeOut: number): AudioEditDoc {
  const half = mainDuration(doc) / 2;
  return {
    ...doc,
    fadeIn: round(clamp(fadeIn, 0, Math.min(EDIT_LIMITS.fadeS, half))),
    fadeOut: round(clamp(fadeOut, 0, Math.min(EDIT_LIMITS.fadeS, half))),
  };
}

export function setFx(doc: AudioEditDoc, patch: Partial<AudioFx>): AudioEditDoc {
  const fx = { ...doc.fx, ...patch };
  return {
    ...doc,
    fx: {
      gainDb: clamp(fx.gainDb, EDIT_LIMITS.gainDb.min, EDIT_LIMITS.gainDb.max),
      eq: {
        low: clamp(fx.eq.low, -EDIT_LIMITS.eqDb, EDIT_LIMITS.eqDb),
        mid: clamp(fx.eq.mid, -EDIT_LIMITS.eqDb, EDIT_LIMITS.eqDb),
        high: clamp(fx.eq.high, -EDIT_LIMITS.eqDb, EDIT_LIMITS.eqDb),
      },
      compressor: COMPRESSOR_PRESETS.includes(fx.compressor) ? fx.compressor : "off",
      echo: { preset: ECHO_PRESETS.includes(fx.echo.preset) ? fx.echo.preset : "off", mix: clamp(fx.echo.mix, 0, 1) },
      speed: clamp(fx.speed, EDIT_LIMITS.speed.min, EDIT_LIMITS.speed.max),
      pitch: Math.round(clamp(fx.pitch, -EDIT_LIMITS.pitch, EDIT_LIMITS.pitch)),
    },
  };
}

/** Da li efekti uopšte menjaju zvuk (bez toga se lanac preskače). */
export function fxActive(fx: AudioFx): { stretch: boolean; filters: boolean } {
  return {
    stretch: Math.abs(fx.speed - 1) > 1e-3 || fx.pitch !== 0,
    filters: fx.gainDb !== 0 || fx.eq.low !== 0 || fx.eq.mid !== 0 || fx.eq.high !== 0 || fx.compressor !== "off" || (fx.echo.preset !== "off" && fx.echo.mix > 0),
  };
}

// ── Dodatne trake ────────────────────────────────────────────────────────────

export function addExtra(doc: AudioEditDoc, source: string, durationS: number, patch: Partial<Omit<ExtraTrack, "id" | "source">> = {}): AudioEditDoc {
  if (doc.extras.length >= EDIT_LIMITS.extras || durationS <= 0) return doc;
  const track: ExtraTrack = {
    id: nextId(doc, "t"),
    source,
    at: 0,
    in: 0,
    out: round(durationS),
    gainDb: -12,
    loop: false,
    duck: true,
    fadeIn: 0.5,
    fadeOut: 1,
    muted: false,
    ...patch,
  };
  return { ...doc, extras: [...doc.extras, track] };
}

export function updateExtra(doc: AudioEditDoc, id: string, patch: Partial<Omit<ExtraTrack, "id" | "source">>): AudioEditDoc {
  return {
    ...doc,
    extras: doc.extras.map((track) => {
      if (track.id !== id) return track;
      const next = { ...track, ...patch };
      return {
        ...next,
        at: round(Math.max(0, next.at)),
        in: round(Math.max(0, Math.min(next.in, next.out - EDIT_LIMITS.minClipS))),
        gainDb: clamp(next.gainDb, EDIT_LIMITS.gainDb.min, EDIT_LIMITS.gainDb.max),
        fadeIn: clamp(next.fadeIn, 0, EDIT_LIMITS.fadeS),
        fadeOut: clamp(next.fadeOut, 0, EDIT_LIMITS.fadeS),
      };
    }),
  };
}

export function removeExtra(doc: AudioEditDoc, id: string): AudioEditDoc {
  return { ...doc, extras: doc.extras.filter((track) => track.id !== id) };
}

// ── Plan za iscrtavanje zvuka ────────────────────────────────────────────────

/** Jedan komad izvora na izlazu (s). `fadeIn`/`fadeOut` su linearni prelazi na ivicama. */
export type RenderPiece = {
  source: string;
  offset: number;
  duration: number;
  at: number;
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
};

/** Kratko pretapanje na svakom rezu, da spoj ne „pukne" (isto kao montaža K19). */
export const JOIN_FADE_S = 0.008;

/** Komadi glavne trake (pre efekata, u vremenu trake). */
export function mainPieces(doc: AudioEditDoc): RenderPiece[] {
  const placements = placeMain(doc);
  return placements.map(({ clip, start }, index) => {
    const duration = clipLength(clip);
    const first = index === 0;
    const last = index === placements.length - 1;
    return {
      source: clip.source,
      offset: clip.in,
      duration,
      at: start,
      gainDb: 0,
      fadeIn: Math.min(duration / 2, first ? Math.max(doc.fadeIn, 0) || JOIN_FADE_S : JOIN_FADE_S),
      fadeOut: Math.min(duration / 2, last ? Math.max(doc.fadeOut, 0) || JOIN_FADE_S : JOIN_FADE_S),
    };
  });
}

/**
 * Komadi dodatnih traka za izlaz dužine `durationS` (posle brzine glavne trake).
 * Petlja se ponavlja od `at` do kraja; bez petlje traka ide jednom i seče se na kraju.
 */
export function extraPieces(doc: AudioEditDoc, durationS: number): Array<RenderPiece & { trackId: string; duck: boolean }> {
  const pieces: Array<RenderPiece & { trackId: string; duck: boolean }> = [];
  for (const track of doc.extras) {
    if (track.muted) continue;
    const length = clipLength(track);
    if (length < EDIT_LIMITS.minClipS) continue;
    let at = track.at;
    let guard = 0;
    while (at < durationS - 1e-6 && guard++ < 2000) {
      const duration = Math.min(length, durationS - at);
      const first = at === track.at;
      const isLast = !track.loop || at + length >= durationS - 1e-6;
      pieces.push({
        trackId: track.id,
        duck: track.duck,
        source: track.source,
        offset: track.in,
        duration: round(duration),
        at: round(at),
        gainDb: track.gainDb,
        fadeIn: Math.min(duration / 2, first ? track.fadeIn || JOIN_FADE_S : JOIN_FADE_S),
        fadeOut: Math.min(duration / 2, isLast ? track.fadeOut || JOIN_FADE_S : JOIN_FADE_S),
      });
      if (!track.loop) break;
      at = round(at + length);
    }
  }
  return pieces;
}

// ── Poništi / ponovi ─────────────────────────────────────────────────────────

export type EditHistory<T> = { past: T[]; present: T; future: T[] };
export const HISTORY_LIMIT = 60;

export function historyStart<T>(present: T): EditHistory<T> {
  return { past: [], present, future: [] };
}

export function historyPush<T>(history: EditHistory<T>, next: T): EditHistory<T> {
  if (next === history.present) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function historyUndo<T>(history: EditHistory<T>): EditHistory<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function historyRedo<T>(history: EditHistory<T>): EditHistory<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}

/** Ime fajla izvoza (bez dijakritika, sa datumom). */
export function exportFileName(base: string, extension: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "dj")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `crea-${slug || "zvuk"}-${day}.${extension}`;
}
