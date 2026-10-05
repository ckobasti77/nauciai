import type { CreaFontId } from "./crea-editor-scene";
import {
  clampKenBurns,
  kenBurnsWindow,
  sliceKenBurns,
  type CropWindow,
  type KenBurns,
} from "./crea-ken-burns";
import { stickerById } from "./crea-stickers";

/**
 * Montaža u browseru (Crea K19, V24; plan K17 §2): model vremenske linije kao
 * JSON v1 i SVE čiste funkcije nad njim - vreme, izmene, šta se crta u trenutku
 * `t` (`frameAt`). Pregled i izvoz zovu istu `frameAt`, pa su isti po definiciji
 * (K17-2). Uvozi ga i Convex (`creaMontages` proverava dokument), zato bez
 * browser API-ja i bez React-a.
 *
 * Glavna traka je „magnetna": klipovi idu redom, bez rupa, a prelaz preklapa
 * susede (skraćuje traku za svoje trajanje). Preklopi (slika u slici), zvuk,
 * naslovi i nalepnice stoje na apsolutnom vremenu.
 */

export const TIMELINE_VERSION = 1;

export const TIMELINE_ASPECTS = ["9:16", "1:1", "16:9", "4:5"] as const;
export type TimelineAspect = (typeof TIMELINE_ASPECTS)[number];
export const TIMELINE_FPS = [24, 25, 30] as const;
export type TimelineFps = (typeof TIMELINE_FPS)[number];

export const TIMELINE_LIMITS = {
  main: 60,
  overlay: 20,
  audio: 10,
  titles: 40,
  stickers: 30,
  titleChars: 120,
  /** Ukupno trajanje montaže (8 min, K17 §2.2). */
  durationS: 480,
  jsonChars: 200_000,
  /** Najkraći klip na traci posle sečenja i brzine. */
  clipMinS: 0.2,
  imageMaxS: 60,
  sourceMaxS: 4 * 60 * 60,
  speedMin: 0.25,
  speedMax: 4,
  speedKeysMax: 8,
  transitionMinS: 0.1,
  transitionMaxS: 2,
  volumeMinDb: -30,
  volumeMaxDb: 6,
  fadeMaxS: 10,
} as const;

/** Zvuk klipa ostaje uz brzinu samo u ovom opsegu (visina se menja; K17-8). */
export const AUDIO_SPEED_RANGE = { min: 0.5, max: 2 } as const;

/** Gotove rampe brzine (početnik bira oblik, ne crta krivu). Ključeve u test proverava `parseTimeline`. */
export const SPEED_RAMP_IDS = ["heroj", "metak", "uleti", "izleti", "montaza"] as const;
export type SpeedRampId = (typeof SPEED_RAMP_IDS)[number];
export const SPEED_RAMP_PRESETS: Record<SpeedRampId, SpeedKey[]> = {
  // Brzo - usporeno u sredini - brzo.
  heroj: [
    { u: 0, v: 2 },
    { u: 0.4, v: 0.4 },
    { u: 0.6, v: 0.4 },
    { u: 1, v: 2 },
  ],
  // Skoro zaustavljen trenutak na sredini.
  metak: [
    { u: 0, v: 1 },
    { u: 0.45, v: 0.25 },
    { u: 0.55, v: 0.25 },
    { u: 1, v: 1 },
  ],
  // Polako, pa sve brže.
  uleti: [
    { u: 0, v: 0.5 },
    { u: 1, v: 3 },
  ],
  // Brzo, pa sve sporije.
  izleti: [
    { u: 0, v: 3 },
    { u: 1, v: 0.5 },
  ],
  // Ubrzanje u sredini (prelaz kroz dosadan deo).
  montaza: [
    { u: 0, v: 1 },
    { u: 0.5, v: 3 },
    { u: 1, v: 1 },
  ],
};

export type MediaRef = { jobId: string } | { localFileId: string };
export type Rect01 = { x: number; y: number; w: number; h: number };
export const FULL_RECT: Rect01 = { x: 0, y: 0, w: 1, h: 1 };

/** Ključ brzine: `u` = deo reprodukcije klipa (0 = početak, 1 = kraj), `v` = brzina. */
export type SpeedKey = { u: number; v: number };

export type MainClip = {
  id: string;
  src: MediaRef;
  media: "video" | "image";
  /** Sekunde izvora. Slika: 0 i trajanje na traci. */
  in: number;
  out: number;
  speed: number;
  speedKeys?: SpeedKey[];
  reverse?: boolean;
  boomerang?: boolean;
  volumeDb: number;
  muted: boolean;
  /** Originalni zvuk je govor: muzika se utišava ispod njega. */
  isVoice?: boolean;
  fit: "cover" | "contain";
  kenBurns?: KenBurns;
};

/** Slika u slici (PiP): video ili fotka u pravougaoniku, na apsolutnom vremenu. */
export type OverlayClip = {
  id: string;
  src: MediaRef;
  media: "video" | "image";
  in: number;
  out: number;
  start: number;
  rect: Rect01;
  volumeDb: number;
  muted: boolean;
  isVoice?: boolean;
};

export const AUDIO_ROLES = ["music", "voice", "sfx"] as const;
export type AudioRole = (typeof AUDIO_ROLES)[number];

export type AudioClip = {
  id: string;
  src: MediaRef;
  in: number;
  out: number;
  start: number;
  volumeDb: number;
  role: AudioRole;
  fadeIn: number;
  fadeOut: number;
};

export const TRANSITION_KINDS = [
  "pretapanje",
  "kroz-crno",
  "kroz-belo",
  "klizanje-levo",
  "klizanje-desno",
  "brisanje",
  "zum",
  "list-sveske",
] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];
/** Prelaz između klipa `after` i sledećeg na glavnoj traci. Bez prelaza = čist rez. */
export type Transition = { after: string; kind: TransitionKind; duration: number };

export const TITLE_STYLES = ["naslov", "rukopis", "donja-traka", "titl", "pisaca-masina"] as const;
export type TitleStyle = (typeof TITLE_STYLES)[number];
export const TITLE_ANIMS = ["nista", "pretapanje", "klizanje", "kucanje"] as const;
export type TitleAnim = (typeof TITLE_ANIMS)[number];
/** Isti spisak kao `CREA_SCENE_FONTS` (K10/K15) - ovde ponovljen da Convex ne vuče editor. */
export const TITLE_FONTS = ["nunito", "rukopis", "montserrat", "lora"] as const satisfies readonly CreaFontId[];
export type TitleFont = (typeof TITLE_FONTS)[number];

export type TitleItem = {
  id: string;
  text: string;
  start: number;
  end: number;
  style: TitleStyle;
  rect: Rect01;
  font: TitleFont;
  color: string;
  anim: TitleAnim;
};

export const STICKER_ANIMS = ["nista", "iskakanje"] as const;
export type StickerAnim = (typeof STICKER_ANIMS)[number];
export type StickerItem = { id: string; sticker: string; start: number; end: number; rect: Rect01; anim: StickerAnim };

export type TimelineMix = {
  duck: { on: boolean; amountDb: number };
  masterDb: number;
  fadeIn: number;
  fadeOut: number;
};

export type CreaTimelineV1 = {
  v: 1;
  aspect: TimelineAspect;
  fps: TimelineFps;
  background: string;
  main: MainClip[];
  overlay: OverlayClip[];
  audio: AudioClip[];
  transitions: Transition[];
  titles: TitleItem[];
  stickers: StickerItem[];
  mix: TimelineMix;
};

export const DEFAULT_MIX: TimelineMix = { duck: { on: true, amountDb: -12 }, masterDb: 0, fadeIn: 0, fadeOut: 0 };
export const DUCK_RANGE_DB = { min: -24, max: -3 } as const;

export function emptyTimeline(aspect: TimelineAspect = "9:16"): CreaTimelineV1 {
  return {
    v: 1,
    aspect,
    fps: 30,
    background: "#000000",
    main: [],
    overlay: [],
    audio: [],
    transitions: [],
    titles: [],
    stickers: [],
    mix: { ...DEFAULT_MIX, duck: { ...DEFAULT_MIX.duck } },
  };
}

export function aspectRatio(aspect: TimelineAspect): number {
  const [w, h] = aspect.split(":").map(Number);
  return w / h;
}

export function mediaKey(ref: MediaRef): string {
  return "jobId" in ref ? `job:${ref.jobId}` : `file:${ref.localFileId}`;
}

/** Ključ pomoćnog obrnutog snimka (K17-9): izvor i tačan deo [in, out]. */
export function reversedKey(ref: MediaRef, range: { in: number; out: number }): string {
  return `${mediaKey(ref)}@${range.in.toFixed(3)}-${range.out.toFixed(3)}`;
}

// ── Provera i čitanje (isti obrazac kao `parseScene`, K10) ─────────────────

export type TimelineProblem = "NEISPRAVAN_JSON" | "PREVELIK" | "VERZIJA" | "NEISPRAVNO" | "PREVISE" | "PREDUGO";

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Konačan broj svedeni u granice, ili `null` (NaN, tekst, beskonačno). */
function num(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(value, min, max);
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const JOB_ID = /^[A-Za-z0-9;_-]{1,64}$/;
const FILE_ID = /^[A-Za-z0-9-]{8,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

function id(value: unknown): string | null {
  return typeof value === "string" && ID.test(value) ? value : null;
}

function color(value: unknown): string | null {
  return typeof value === "string" && COLOR.test(value) ? value.toLowerCase() : null;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : null;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function mediaRef(value: unknown): MediaRef | null {
  if (!isRecord(value)) return null;
  if (typeof value.jobId === "string" && JOB_ID.test(value.jobId) && value.localFileId === undefined) return { jobId: value.jobId };
  if (typeof value.localFileId === "string" && FILE_ID.test(value.localFileId) && value.jobId === undefined) {
    return { localFileId: value.localFileId };
  }
  return null;
}

function rect(value: unknown, minSide = 0.02): Rect01 | null {
  if (!isRecord(value)) return null;
  const w = num(value.w, minSide, 1);
  const h = num(value.h, minSide, 1);
  const x = num(value.x, 0, 1);
  const y = num(value.y, 0, 1);
  if (w === null || h === null || x === null || y === null) return null;
  return { x: Math.min(x, 1 - w), y: Math.min(y, 1 - h), w, h };
}

function speedKeys(value: unknown): SpeedKey[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 2 || value.length > TIMELINE_LIMITS.speedKeysMax) return null;
  const keys: SpeedKey[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const u = num(entry.u, 0, 1);
    const v = num(entry.v, TIMELINE_LIMITS.speedMin, TIMELINE_LIMITS.speedMax);
    if (u === null || v === null) return null;
    if (keys.length > 0 && u <= keys[keys.length - 1].u) return null;
    keys.push({ u, v });
  }
  if (keys[0].u !== 0 || keys[keys.length - 1].u !== 1) return null;
  return keys;
}

function kenBurnsOf(value: unknown): KenBurns | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.from) || !isRecord(value.to)) return null;
  const point = (raw: Raw) => {
    const zoom = num(raw.zoom, 1, 2);
    const x = num(raw.x, -1, 1);
    const y = num(raw.y, -1, 1);
    return zoom === null || x === null || y === null ? null : { zoom, x, y };
  };
  const from = point(value.from);
  const to = point(value.to);
  return from && to ? clampKenBurns({ from, to }) : null;
}

/** Izvor u sekundama: `in < out`, a za sliku trajanje u granicama. */
function sourceRange(raw: Raw, media: "video" | "image"): { in: number; out: number } | null {
  if (media === "image") {
    const length = num(raw.out, TIMELINE_LIMITS.clipMinS, TIMELINE_LIMITS.imageMaxS);
    return length === null ? null : { in: 0, out: length };
  }
  const start = num(raw.in, 0, TIMELINE_LIMITS.sourceMaxS);
  const end = num(raw.out, 0, TIMELINE_LIMITS.sourceMaxS);
  if (start === null || end === null || end - start < 0.04) return null;
  return { in: start, out: end };
}

export function sanitizeMainClip(raw: unknown): MainClip | null {
  if (!isRecord(raw)) return null;
  const clipId = id(raw.id);
  const src = mediaRef(raw.src);
  const media = oneOf(raw.media, ["video", "image"] as const);
  if (!clipId || !src || !media) return null;
  const range = sourceRange(raw, media);
  const volumeDb = num(raw.volumeDb ?? 0, TIMELINE_LIMITS.volumeMinDb, TIMELINE_LIMITS.volumeMaxDb);
  const fit = oneOf(raw.fit ?? "cover", ["cover", "contain"] as const);
  if (!range || volumeDb === null || !fit) return null;
  const clip: MainClip = { id: clipId, src, media, ...range, speed: 1, volumeDb, muted: bool(raw.muted), fit };
  const kb = kenBurnsOf(raw.kenBurns);
  if (kb === null) return null;
  if (kb) clip.kenBurns = kb;
  if (media === "video") {
    const speed = num(raw.speed ?? 1, TIMELINE_LIMITS.speedMin, TIMELINE_LIMITS.speedMax);
    const keys = speedKeys(raw.speedKeys);
    if (speed === null || keys === null) return null;
    clip.speed = speed;
    if (keys) clip.speedKeys = keys;
    // Unazad i bumerang se isključuju (bumerang već sadrži deo unazad).
    if (bool(raw.boomerang)) clip.boomerang = true;
    else if (bool(raw.reverse)) clip.reverse = true;
    if (bool(raw.isVoice)) clip.isVoice = true;
  }
  return clip;
}

export function sanitizeOverlayClip(raw: unknown): OverlayClip | null {
  if (!isRecord(raw)) return null;
  const clipId = id(raw.id);
  const src = mediaRef(raw.src);
  const media = oneOf(raw.media, ["video", "image"] as const);
  if (!clipId || !src || !media) return null;
  const range = sourceRange(raw, media);
  const start = num(raw.start, 0, TIMELINE_LIMITS.durationS);
  const box = rect(raw.rect, 0.08);
  const volumeDb = num(raw.volumeDb ?? 0, TIMELINE_LIMITS.volumeMinDb, TIMELINE_LIMITS.volumeMaxDb);
  if (!range || start === null || !box || volumeDb === null) return null;
  const clip: OverlayClip = { id: clipId, src, media, ...range, start, rect: box, volumeDb, muted: bool(raw.muted) };
  if (media === "video" && bool(raw.isVoice)) clip.isVoice = true;
  return clip;
}

export function sanitizeAudioClip(raw: unknown): AudioClip | null {
  if (!isRecord(raw)) return null;
  const clipId = id(raw.id);
  const src = mediaRef(raw.src);
  const role = oneOf(raw.role, AUDIO_ROLES);
  const range = sourceRange(raw, "video");
  const start = num(raw.start, 0, TIMELINE_LIMITS.durationS);
  const volumeDb = num(raw.volumeDb ?? 0, TIMELINE_LIMITS.volumeMinDb, TIMELINE_LIMITS.volumeMaxDb);
  const fadeIn = num(raw.fadeIn ?? 0, 0, TIMELINE_LIMITS.fadeMaxS);
  const fadeOut = num(raw.fadeOut ?? 0, 0, TIMELINE_LIMITS.fadeMaxS);
  if (!clipId || !src || !role || !range || start === null || volumeDb === null || fadeIn === null || fadeOut === null) return null;
  return { id: clipId, src, ...range, start, volumeDb, role, fadeIn, fadeOut };
}

export function sanitizeTitle(raw: unknown): TitleItem | null {
  if (!isRecord(raw)) return null;
  const titleId = id(raw.id);
  const style = oneOf(raw.style, TITLE_STYLES);
  const font = oneOf(raw.font, TITLE_FONTS);
  const anim = oneOf(raw.anim ?? "nista", TITLE_ANIMS);
  const textColor = color(raw.color);
  const box = rect(raw.rect, 0.04);
  const start = num(raw.start, 0, TIMELINE_LIMITS.durationS);
  const end = num(raw.end, 0, TIMELINE_LIMITS.durationS);
  if (!titleId || !style || !font || !anim || !textColor || !box || start === null || end === null) return null;
  if (typeof raw.text !== "string" || end - start < 0.1) return null;
  const text = Array.from(raw.text).slice(0, TIMELINE_LIMITS.titleChars).join("");
  return { id: titleId, text, start, end, style, rect: box, font, color: textColor, anim };
}

export function sanitizeSticker(raw: unknown): StickerItem | null {
  if (!isRecord(raw)) return null;
  const itemId = id(raw.id);
  const box = rect(raw.rect, 0.04);
  const anim = oneOf(raw.anim ?? "nista", STICKER_ANIMS);
  const start = num(raw.start, 0, TIMELINE_LIMITS.durationS);
  const end = num(raw.end, 0, TIMELINE_LIMITS.durationS);
  if (!itemId || !box || !anim || start === null || end === null || end - start < 0.1) return null;
  if (typeof raw.sticker !== "string" || !stickerById(raw.sticker)) return null;
  return { id: itemId, sticker: raw.sticker, start, end, rect: box, anim };
}

function sanitizeTransition(raw: unknown): Transition | null {
  if (!isRecord(raw)) return null;
  const after = id(raw.after);
  const kind = oneOf(raw.kind, TRANSITION_KINDS);
  const duration = num(raw.duration, TIMELINE_LIMITS.transitionMinS, TIMELINE_LIMITS.transitionMaxS);
  return after && kind && duration !== null ? { after, kind, duration } : null;
}

function sanitizeMix(raw: unknown): TimelineMix | null {
  if (raw === undefined) return { ...DEFAULT_MIX, duck: { ...DEFAULT_MIX.duck } };
  if (!isRecord(raw) || !isRecord(raw.duck)) return null;
  const amountDb = num(raw.duck.amountDb, DUCK_RANGE_DB.min, DUCK_RANGE_DB.max);
  const masterDb = num(raw.masterDb ?? 0, -20, 6);
  const fadeIn = num(raw.fadeIn ?? 0, 0, 5);
  const fadeOut = num(raw.fadeOut ?? 0, 0, 5);
  if (amountDb === null || masterDb === null || fadeIn === null || fadeOut === null) return null;
  return { duck: { on: bool(raw.duck.on, true), amountDb }, masterDb, fadeIn, fadeOut };
}

function list<T>(value: unknown, max: number, parse: (raw: unknown) => T | null): T[] | "previse" | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > max) return "previse";
  const out: T[] = [];
  for (const entry of value) {
    const parsed = parse(entry);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

/**
 * Dokument iz JSON-a (ili već pročitan objekat). Pogrešan oblik, nepoznata
 * vrednost, dupli id ili NaN odbijaju ceo dokument; brojevi van opsega se svode
 * u granice. Prelazi se posle toga sređuju (`normalizeTimeline`).
 */
export function parseTimeline(input: unknown): { ok: true; timeline: CreaTimelineV1 } | { ok: false; reason: TimelineProblem } {
  let raw: unknown = input;
  if (typeof input === "string") {
    if (input.length > TIMELINE_LIMITS.jsonChars) return { ok: false, reason: "PREVELIK" };
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, reason: "NEISPRAVAN_JSON" };
    }
  }
  if (!isRecord(raw)) return { ok: false, reason: "NEISPRAVNO" };
  if (raw.v !== TIMELINE_VERSION) return { ok: false, reason: "VERZIJA" };
  const aspect = oneOf(raw.aspect, TIMELINE_ASPECTS);
  const fps = TIMELINE_FPS.find((value) => value === raw.fps);
  const background = color(raw.background ?? "#000000");
  const mix = sanitizeMix(raw.mix);
  if (!aspect || !fps || !background || !mix) return { ok: false, reason: "NEISPRAVNO" };

  const main = list(raw.main, TIMELINE_LIMITS.main, sanitizeMainClip);
  const overlay = list(raw.overlay, TIMELINE_LIMITS.overlay, sanitizeOverlayClip);
  const audio = list(raw.audio, TIMELINE_LIMITS.audio, sanitizeAudioClip);
  const titles = list(raw.titles, TIMELINE_LIMITS.titles, sanitizeTitle);
  const stickers = list(raw.stickers, TIMELINE_LIMITS.stickers, sanitizeSticker);
  const transitions = list(raw.transitions, TIMELINE_LIMITS.main, sanitizeTransition);
  const parts = [main, overlay, audio, titles, stickers, transitions];
  if (parts.some((part) => part === "previse")) return { ok: false, reason: "PREVISE" };
  if (parts.some((part) => part === null)) return { ok: false, reason: "NEISPRAVNO" };

  const timeline = normalizeTimeline({
    v: 1,
    aspect,
    fps,
    background,
    main: main as MainClip[],
    overlay: overlay as OverlayClip[],
    audio: audio as AudioClip[],
    transitions: transitions as Transition[],
    titles: titles as TitleItem[],
    stickers: stickers as StickerItem[],
    mix,
  });
  const ids = [...timeline.main, ...timeline.overlay, ...timeline.audio, ...timeline.titles, ...timeline.stickers].map((item) => item.id);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "NEISPRAVNO" };
  if (timelineDuration(timeline) > TIMELINE_LIMITS.durationS + 1e-6) return { ok: false, reason: "PREDUGO" };
  return { ok: true, timeline };
}

export function serializeTimeline(timeline: CreaTimelineV1): string {
  return JSON.stringify(timeline);
}

// ── Vreme ───────────────────────────────────────────────────────────────────

export function clipSourceLength(clip: { in: number; out: number }): number {
  return Math.max(0, clip.out - clip.in);
}

function hasRamp(clip: MainClip): clip is MainClip & { speedKeys: SpeedKey[] } {
  return clip.media === "video" && Array.isArray(clip.speedKeys) && clip.speedKeys.length >= 2;
}

/** ∫ du / v(u) na jednom linearnom delu krive brzine. */
function segmentIntegral(a: SpeedKey, b: SpeedKey): number {
  const du = b.u - a.u;
  if (du <= 0) return 0;
  if (Math.abs(b.v - a.v) < 1e-9) return du / a.v;
  return (du / (b.v - a.v)) * Math.log(b.v / a.v);
}

/** Inverz `segmentIntegral`: koliki je deo `u` posle „vremena" `x` (u jedinicama dužine izvora). */
function segmentInverse(a: SpeedKey, b: SpeedKey, x: number): number {
  const du = b.u - a.u;
  if (Math.abs(b.v - a.v) < 1e-9) return a.u + x * a.v;
  const slope = (b.v - a.v) / du;
  return a.u + (a.v * (Math.exp(slope * x) - 1)) / slope;
}

/** Brzina u delu reprodukcije `u` (po delovima linearno). */
export function speedAtProgress(clip: MainClip, u: number): number {
  if (!hasRamp(clip)) return clip.media === "video" ? clip.speed : 1;
  const keys = clip.speedKeys;
  const p = clamp(u, 0, 1);
  for (let index = 1; index < keys.length; index++) {
    const a = keys[index - 1];
    const b = keys[index];
    if (p <= b.u) return a.v + ((b.v - a.v) * (p - a.u)) / (b.u - a.u);
  }
  return keys[keys.length - 1].v;
}

/** Trajanje JEDNOG prolaza kroz izvor (bez bumeranga), uz brzinu i rampu. */
export function clipPassLength(clip: MainClip): number {
  const source = clipSourceLength(clip);
  if (clip.media === "image") return source;
  if (!hasRamp(clip)) return source / clip.speed;
  let total = 0;
  for (let index = 1; index < clip.speedKeys.length; index++) total += segmentIntegral(clip.speedKeys[index - 1], clip.speedKeys[index]);
  return source * total;
}

/** Koliko klip traje na traci (bumerang = napred pa nazad). */
export function clipOutputLength(clip: MainClip): number {
  return clipPassLength(clip) * (clip.media === "video" && clip.boomerang ? 2 : 1);
}

/** Deo reprodukcije (0..1) posle `tPass` sekundi jednog prolaza. */
export function progressAt(clip: MainClip, tPass: number): number {
  const source = clipSourceLength(clip);
  if (source <= 0) return 0;
  if (clip.media === "image") return clamp(tPass / source, 0, 1);
  if (!hasRamp(clip)) return clamp((tPass * clip.speed) / source, 0, 1);
  let remaining = Math.max(0, tPass) / source;
  const keys = clip.speedKeys;
  for (let index = 1; index < keys.length; index++) {
    const segment = segmentIntegral(keys[index - 1], keys[index]);
    if (remaining <= segment) return clamp(segmentInverse(keys[index - 1], keys[index], remaining), 0, 1);
    remaining -= segment;
  }
  return 1;
}

/** Vreme jednog prolaza (u sekundama trake) do dela reprodukcije `u` - inverz `progressAt`. */
export function passTimeAt(clip: MainClip, u: number): number {
  const source = clipSourceLength(clip);
  const p = clamp(u, 0, 1);
  if (clip.media === "image") return p * source;
  if (!hasRamp(clip)) return (p * source) / clip.speed;
  let total = 0;
  const keys = clip.speedKeys;
  for (let index = 1; index < keys.length; index++) {
    const a = keys[index - 1];
    const b = keys[index];
    if (p <= b.u) {
      const end: SpeedKey = { u: p, v: a.v + ((b.v - a.v) * (p - a.u)) / (b.u - a.u) };
      return source * (total + segmentIntegral(a, end));
    }
    total += segmentIntegral(a, b);
  }
  return source * total;
}

/**
 * Koji kadar izvora se vidi `tLocal` sekundi posle početka klipa. Za deo koji
 * ide unazad (`reverse`, druga polovina bumeranga) vreme je u POMOĆNOM obrnutom
 * snimku izvora [in, out] (K17-9): 0 = poslednji kadar izvora.
 */
export function sourceTimeAt(clip: MainClip, tLocal: number): { time: number; reversed: boolean } {
  const pass = clipPassLength(clip);
  if (clip.media === "image") return { time: clamp(tLocal, 0, clipSourceLength(clip)), reversed: false };
  let t = clamp(tLocal, 0, clipOutputLength(clip));
  let backward = false;
  if (clip.boomerang && t >= pass) {
    t -= pass;
    backward = true;
  }
  const source = clipSourceLength(clip);
  const u = progressAt(clip, t);
  const offset = Math.min(u * source, Math.max(0, source - 1e-4));
  if (clip.reverse || backward) return { time: offset, reversed: true };
  return { time: clip.in + offset, reversed: false };
}

export type MainPlacement = {
  clip: MainClip;
  index: number;
  start: number;
  end: number;
  length: number;
  transitionIn: Transition | null;
  transitionOut: Transition | null;
};

export function transitionAfter(timeline: CreaTimelineV1, clipId: string): Transition | null {
  return timeline.transitions.find((transition) => transition.after === clipId) ?? null;
}

/** Gde je koji glavni klip: prelaz pomera sledeći klip unazad za svoje trajanje. */
export function mainLayout(timeline: CreaTimelineV1): MainPlacement[] {
  const placements: MainPlacement[] = [];
  let cursor = 0;
  let previousOut: Transition | null = null;
  timeline.main.forEach((clip, index) => {
    const length = clipOutputLength(clip);
    const transitionOut = index < timeline.main.length - 1 ? transitionAfter(timeline, clip.id) : null;
    const start = cursor;
    const end = start + length;
    placements.push({ clip, index, start, end, length, transitionIn: previousOut, transitionOut });
    cursor = end - (transitionOut?.duration ?? 0);
    previousOut = transitionOut;
  });
  return placements;
}

export function timelineDuration(timeline: CreaTimelineV1): number {
  const layout = mainLayout(timeline);
  return layout.length === 0 ? 0 : layout[layout.length - 1].end;
}

// ── Sređivanje posle izmene ─────────────────────────────────────────────────

/** Najduži dozvoljen prelaz između dva klipa: pola kraćeg suseda i najviše 2 s. */
export function maxTransitionDuration(a: MainClip, b: MainClip): number {
  return Math.min(TIMELINE_LIMITS.transitionMaxS, clipOutputLength(a) / 2, clipOutputLength(b) / 2);
}

/**
 * Prelazi samo između postojećih suseda (ne posle poslednjeg klipa), po jedan
 * po spoju, skraćeni na pola kraćeg suseda; slike bez brzine i unazad.
 */
export function normalizeTimeline(timeline: CreaTimelineV1): CreaTimelineV1 {
  const main = timeline.main.map((clip) => {
    if (clip.media !== "image") return clip;
    const still: MainClip = { ...clip, speed: 1 };
    delete still.speedKeys;
    delete still.reverse;
    delete still.boomerang;
    delete still.isVoice;
    return still;
  });
  const transitions: Transition[] = [];
  main.forEach((clip, index) => {
    const next = main[index + 1];
    if (!next) return;
    const transition = timeline.transitions.find((entry) => entry.after === clip.id);
    if (!transition) return;
    const max = maxTransitionDuration(clip, next);
    if (max < TIMELINE_LIMITS.transitionMinS) return;
    transitions.push({ ...transition, duration: clamp(transition.duration, TIMELINE_LIMITS.transitionMinS, max) });
  });
  return { ...timeline, main, transitions };
}

// ── Izmene (sve vraćaju novu vremensku liniju) ──────────────────────────────

/** Sledeći slobodan id sa prefiksom (`k-3`), deterministički. */
export function nextId(timeline: CreaTimelineV1, prefix: string): string {
  let max = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const item of [...timeline.main, ...timeline.overlay, ...timeline.audio, ...timeline.titles, ...timeline.stickers]) {
    const match = item.id.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}`;
}

export type NewMainClip = Omit<MainClip, "id">;

export function addMainClips(timeline: CreaTimelineV1, clips: readonly NewMainClip[], index = timeline.main.length): CreaTimelineV1 {
  let next = timeline;
  const added: MainClip[] = [];
  for (const clip of clips) {
    const withId = { ...clip, id: nextId({ ...next, main: [...next.main, ...added] }, "k") };
    const clean = sanitizeMainClip(withId);
    if (clean) added.push(clean);
  }
  const position = clamp(index, 0, timeline.main.length);
  next = { ...timeline, main: [...timeline.main.slice(0, position), ...added, ...timeline.main.slice(position)] };
  return normalizeTimeline(next);
}

export function updateMainClip(timeline: CreaTimelineV1, clipId: string, patch: Partial<NewMainClip>): CreaTimelineV1 {
  const main = timeline.main.map((clip) => {
    if (clip.id !== clipId) return clip;
    const merged: Raw = { ...clip, ...patch, id: clip.id };
    for (const key of Object.keys(patch) as Array<keyof NewMainClip>) if (patch[key] === undefined) delete merged[key];
    return sanitizeMainClip(merged) ?? clip;
  });
  return normalizeTimeline({ ...timeline, main });
}

/** Premesti glavni klip na novo mesto (magnetna traka se sama sklopi). */
export function moveClip(timeline: CreaTimelineV1, clipId: string, toIndex: number): CreaTimelineV1 {
  const from = timeline.main.findIndex((clip) => clip.id === clipId);
  if (from < 0) return timeline;
  const main = [...timeline.main];
  const [clip] = main.splice(from, 1);
  main.splice(clamp(Math.round(toIndex), 0, main.length), 0, clip);
  return normalizeTimeline({ ...timeline, main });
}

/** Obriši bilo koju stavku po id-ju; glavna traka se sama zatvori (ripple). */
export function deleteItem(timeline: CreaTimelineV1, itemId: string): CreaTimelineV1 {
  return normalizeTimeline({
    ...timeline,
    main: timeline.main.filter((clip) => clip.id !== itemId),
    overlay: timeline.overlay.filter((clip) => clip.id !== itemId),
    audio: timeline.audio.filter((clip) => clip.id !== itemId),
    titles: timeline.titles.filter((title) => title.id !== itemId),
    stickers: timeline.stickers.filter((sticker) => sticker.id !== itemId),
    transitions: timeline.transitions.filter((transition) => transition.after !== itemId),
  });
}

/** Udvostruči stavku; kopija glavnog klipa ide odmah iza originala, ostale na isto vreme. */
export function duplicateItem(timeline: CreaTimelineV1, itemId: string): { timeline: CreaTimelineV1; id: string | null } {
  const mainIndex = timeline.main.findIndex((clip) => clip.id === itemId);
  if (mainIndex >= 0) {
    if (timeline.main.length >= TIMELINE_LIMITS.main) return { timeline, id: null };
    const copyId = nextId(timeline, "k");
    const main = [...timeline.main];
    main.splice(mainIndex + 1, 0, { ...timeline.main[mainIndex], id: copyId });
    return { timeline: normalizeTimeline({ ...timeline, main }), id: copyId };
  }
  const groups = [
    ["overlay", "p", TIMELINE_LIMITS.overlay],
    ["audio", "z", TIMELINE_LIMITS.audio],
    ["titles", "n", TIMELINE_LIMITS.titles],
    ["stickers", "s", TIMELINE_LIMITS.stickers],
  ] as const;
  for (const [key, prefix, max] of groups) {
    const items = timeline[key] as ReadonlyArray<{ id: string }>;
    const found = items.find((item) => item.id === itemId);
    if (!found) continue;
    if (items.length >= max) return { timeline, id: null };
    const copyId = nextId(timeline, prefix);
    return { timeline: { ...timeline, [key]: [...items, { ...found, id: copyId }] }, id: copyId };
  }
  return { timeline, id: null };
}

/** Deo ključeva brzine [a, b] razvučen na 0..1 (podela i skraćivanje klipa sa rampom). */
export function sliceSpeedKeys(clip: MainClip, a: number, b: number): SpeedKey[] | undefined {
  if (!hasRamp(clip) || b - a < 1e-6) return undefined;
  const inside = clip.speedKeys.filter((key) => key.u > a && key.u < b);
  const points = [{ u: a, v: speedAtProgress(clip, a) }, ...inside, { u: b, v: speedAtProgress(clip, b) }];
  return points.map((key, index) => ({
    u: index === 0 ? 0 : index === points.length - 1 ? 1 : (key.u - a) / (b - a),
    v: key.v,
  }));
}

/**
 * Isti klip, ali samo deo reprodukcije [a, b] (0..1). Za klip unazad deo
 * reprodukcije je obrnut deo izvora. Bumerang se ovako ne seče.
 */
function sliceClip(clip: MainClip, a: number, b: number): MainClip {
  const source = clipSourceLength(clip);
  if (clip.media === "image") {
    return { ...clip, out: Math.max(TIMELINE_LIMITS.clipMinS, source * (b - a)), ...(clip.kenBurns ? { kenBurns: sliceKenBurns(clip.kenBurns, a, b) } : {}) };
  }
  const keys = sliceSpeedKeys(clip, a, b);
  const range = clip.reverse
    ? { in: clip.out - b * source, out: clip.out - a * source }
    : { in: clip.in + a * source, out: clip.in + b * source };
  const sliced: MainClip = { ...clip, ...range };
  if (keys) sliced.speedKeys = keys;
  else delete sliced.speedKeys;
  return sliced;
}

export type SplitResult = { timeline: CreaTimelineV1; leftId: string; rightId: string };

/**
 * Podeli glavni klip u trenutku `t` trake. Ne deli se na samoj ivici (manje od
 * `clipMinS` do kraja) ni bumerang. Prelaz posle klipa prelazi na desni deo.
 */
export function splitAt(timeline: CreaTimelineV1, t: number): SplitResult | null {
  const placement = clipAtTime(timeline, t);
  if (!placement) return null;
  const { clip, start, length } = placement;
  const local = t - start;
  if (local < TIMELINE_LIMITS.clipMinS || length - local < TIMELINE_LIMITS.clipMinS) return null;
  if (clip.media === "video" && clip.boomerang) return null;
  const u = clip.media === "image" ? local / length : progressAt(clip, local);
  const rightId = nextId(timeline, "k");
  const left = sliceClip(clip, 0, u);
  const right = { ...sliceClip(clip, u, 1), id: rightId };
  const main = timeline.main.flatMap((entry) => (entry.id === clip.id ? [left, right] : [entry]));
  const transitions = timeline.transitions.map((transition) => (transition.after === clip.id ? { ...transition, after: rightId } : transition));
  return { timeline: normalizeTimeline({ ...timeline, main, transitions }), leftId: clip.id, rightId };
}

/** Glavni klip koji se vidi u trenutku `t` (u prelazu: onaj koji počinje). */
export function clipAtTime(timeline: CreaTimelineV1, t: number): MainPlacement | null {
  const layout = mainLayout(timeline);
  for (let index = layout.length - 1; index >= 0; index--) {
    const placement = layout[index];
    if (t >= placement.start && t < placement.end) return placement;
  }
  return null;
}

/**
 * Skrati ili produži klip povlačenjem ivice za `delta` sekundi TRAKE (+ desno).
 * Leva ivica skraćuje početak, desna kraj. Ne ide ispod `clipMinS` ni preko
 * izvora (`sourceDuration`); klip sa rampom se samo skraćuje.
 */
export function trimClip(clip: MainClip, edge: "start" | "end", delta: number, sourceDuration: number | null): MainClip {
  const minSource = TIMELINE_LIMITS.clipMinS;
  if (clip.media === "image") {
    const change = edge === "end" ? delta : -delta;
    return { ...clip, out: clamp(clip.out + change, minSource, TIMELINE_LIMITS.imageMaxS) };
  }
  const maxEnd = sourceDuration ?? clip.out;
  if (hasRamp(clip)) {
    const pass = clipPassLength(clip);
    const factor = clip.boomerang ? 0.5 : 1;
    if (edge === "end") {
      const keep = clamp(pass + Math.min(0, delta) * factor, minSource, pass);
      return keep >= pass ? clip : sliceClip(clip, 0, progressAt(clip, keep));
    }
    const drop = clamp(Math.max(0, delta) * factor, 0, pass - minSource);
    return drop <= 0 ? clip : sliceClip(clip, progressAt(clip, drop), 1);
  }
  const sourceDelta = delta * clip.speed * (clip.boomerang ? 0.5 : 1);
  const minLength = minSource * clip.speed;
  // Za klip unazad kraj reprodukcije je početak izvora.
  const editsIn = (edge === "start") !== Boolean(clip.reverse);
  if (editsIn) {
    const shift = clip.reverse ? -sourceDelta : sourceDelta;
    return { ...clip, in: clamp(clip.in + shift, 0, clip.out - minLength) };
  }
  const shift = clip.reverse ? -sourceDelta : sourceDelta;
  return { ...clip, out: clamp(clip.out + shift, clip.in + minLength, Math.max(clip.out, maxEnd)) };
}

/** Postavi ili ukloni prelaz posle klipa (`kind = null` = čist rez). */
export function setTransition(timeline: CreaTimelineV1, afterId: string, kind: TransitionKind | null, duration = 0.5): CreaTimelineV1 {
  const others = timeline.transitions.filter((transition) => transition.after !== afterId);
  if (kind === null) return normalizeTimeline({ ...timeline, transitions: others });
  return normalizeTimeline({ ...timeline, transitions: [...others, { after: afterId, kind, duration }] });
}

/**
 * Skrati montažu na `maxSeconds` (provera pre objave, „Skrati"): klipovi posle
 * granice otpadaju, a klip na granici se skraćuje sa kraja.
 */
export function trimTimelineTo(timeline: CreaTimelineV1, maxSeconds: number): CreaTimelineV1 {
  const layout = mainLayout(timeline);
  const main: MainClip[] = [];
  for (const placement of layout) {
    if (placement.start >= maxSeconds - TIMELINE_LIMITS.clipMinS) break;
    if (placement.end <= maxSeconds) {
      main.push(placement.clip);
      continue;
    }
    const over = placement.end - maxSeconds;
    main.push(trimClip(placement.clip, "end", -over, null));
    break;
  }
  return normalizeTimeline({ ...timeline, main });
}

// ── Šta se crta u trenutku t (K17-2) ────────────────────────────────────────

export type LayerVisual = {
  opacity: number;
  /** Pomeraj u delovima širine/visine kadra (klizanje). */
  dx: number;
  dy: number;
  /** Uvećanje oko sredine (zum prelaz). */
  scale: number;
  /** Vidi se samo deo kadra levo od ove granice (brisanje), 0..1. */
  clipRight: number;
  /** Stranica sveske: širina sabijena ka levoj ivici (1 = cela). */
  squeezeX: number;
  /** Zatamnjenje 0..1 (stranica koja se okreće). */
  shade: number;
};

const IDENTITY_VISUAL: LayerVisual = { opacity: 1, dx: 0, dy: 0, scale: 1, clipRight: 1, squeezeX: 1, shade: 0 };

export type FrameLayer = {
  clipId: string;
  src: MediaRef;
  media: "video" | "image";
  /** Sekunde izvora, ili sekunde POMOĆNOG obrnutog snimka kad je `reversed`. */
  time: number;
  reversed: boolean;
  /** Izvor [in, out] - potreban za obrnut snimak i rezervni put pregleda. */
  range: { in: number; out: number };
  fit: "cover" | "contain";
  rect: Rect01;
  kenBurns: KenBurns | null;
  /** Deo prikaza klipa 0..1 (Ken Burns). */
  progress: number;
  visual: LayerVisual;
  overlay: boolean;
};

export type FrameTitle = {
  id: string;
  text: string;
  style: TitleStyle;
  rect: Rect01;
  font: TitleFont;
  color: string;
  opacity: number;
  /** Pomeraj naviše/naniže u delovima visine kadra (klizanje). */
  dy: number;
  /** Koliko slova se vidi (kucanje). */
  chars: number;
};

export type FrameSticker = { id: string; sticker: string; rect: Rect01; opacity: number; scale: number };

export type FramePlan = {
  t: number;
  background: string;
  layers: FrameLayer[];
  /** Pretapanje kroz boju (kroz crno / kroz belo), crta se preko glavne trake. */
  dip: { color: string; alpha: number } | null;
  /** Ivica brisanja (žuta linija), 0..1 širine. */
  wipeEdge: number | null;
  stickers: FrameSticker[];
  titles: FrameTitle[];
};

function smooth(p: number): number {
  const x = clamp(p, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Izgled izlaznog (`a`) i ulaznog (`b`) klipa u prelazu, na delu `p` (0..1). */
export function transitionVisual(
  kind: TransitionKind,
  p: number,
): {
  a: LayerVisual | null;
  b: LayerVisual | null;
  dip: { color: string; alpha: number } | null;
  wipeEdge: number | null;
  /** Izlazni klip se crta PREKO ulaznog (list sveske se okreće iznad sledećeg kadra). */
  aOnTop?: true;
} {
  const linear = clamp(p, 0, 1);
  const eased = smooth(linear);
  switch (kind) {
    case "pretapanje":
      return { a: IDENTITY_VISUAL, b: { ...IDENTITY_VISUAL, opacity: linear }, dip: null, wipeEdge: null };
    case "kroz-crno":
    case "kroz-belo": {
      const dipColor = kind === "kroz-crno" ? "#000000" : "#ffffff";
      return linear < 0.5
        ? { a: IDENTITY_VISUAL, b: null, dip: { color: dipColor, alpha: linear * 2 }, wipeEdge: null }
        : { a: null, b: IDENTITY_VISUAL, dip: { color: dipColor, alpha: (1 - linear) * 2 }, wipeEdge: null };
    }
    case "klizanje-levo":
      return { a: { ...IDENTITY_VISUAL, dx: -eased }, b: { ...IDENTITY_VISUAL, dx: 1 - eased }, dip: null, wipeEdge: null };
    case "klizanje-desno":
      return { a: { ...IDENTITY_VISUAL, dx: eased }, b: { ...IDENTITY_VISUAL, dx: eased - 1 }, dip: null, wipeEdge: null };
    case "brisanje":
      return { a: IDENTITY_VISUAL, b: { ...IDENTITY_VISUAL, clipRight: eased }, dip: null, wipeEdge: eased > 0 && eased < 1 ? eased : null };
    case "zum":
      return {
        a: { ...IDENTITY_VISUAL, scale: 1 + 0.6 * eased, opacity: 1 - linear },
        b: { ...IDENTITY_VISUAL, scale: 1.25 - 0.25 * eased, opacity: linear },
        dip: null,
        wipeEdge: null,
      };
    case "list-sveske":
      // Prethodni kadar se okreće kao list sveske (ka levoj ivici), ispod je sledeći.
      return {
        a: { ...IDENTITY_VISUAL, squeezeX: 1 - eased, shade: 0.45 * eased },
        b: IDENTITY_VISUAL,
        dip: null,
        wipeEdge: null,
        aOnTop: true,
      };
  }
}

/** Ulaz/izlaz naslova: providnost, pomeraj i broj vidljivih slova. */
export function titleVisual(title: TitleItem, t: number): { opacity: number; dy: number; chars: number } {
  const length = Array.from(title.text).length;
  const local = t - title.start;
  const duration = title.end - title.start;
  const enter = Math.min(0.4, duration / 3);
  const exit = Math.min(0.3, duration / 3);
  const fadeIn = clamp(local / enter, 0, 1);
  const fadeOut = clamp((title.end - t) / exit, 0, 1);
  switch (title.anim) {
    case "nista":
      return { opacity: 1, dy: 0, chars: length };
    case "pretapanje":
      return { opacity: Math.min(fadeIn, fadeOut), dy: 0, chars: length };
    case "klizanje":
      return { opacity: Math.min(fadeIn, fadeOut), dy: 0.05 * (1 - smooth(fadeIn)), chars: length };
    case "kucanje": {
      const typing = Math.min(duration * 0.6, Math.max(0.3, length * 0.06));
      return { opacity: fadeOut, dy: 0, chars: Math.min(length, Math.floor((local / typing) * length + 1e-6)) };
    }
  }
}

export function stickerVisual(sticker: StickerItem, t: number): { opacity: number; scale: number } {
  const local = t - sticker.start;
  const fadeOut = clamp((sticker.end - t) / Math.min(0.2, (sticker.end - sticker.start) / 3), 0, 1);
  if (sticker.anim === "nista") return { opacity: 1, scale: 1 };
  // Iskakanje: 0,4 → 1,12 → 1 za 0,35 s.
  const p = clamp(local / 0.35, 0, 1);
  const scale = p < 0.7 ? 0.4 + (1.12 - 0.4) * smooth(p / 0.7) : 1.12 - 0.12 * smooth((p - 0.7) / 0.3);
  return { opacity: Math.min(1, p * 3, fadeOut), scale };
}

function mainLayer(placement: MainPlacement, t: number, visual: LayerVisual): FrameLayer {
  const { clip } = placement;
  const local = t - placement.start;
  const source = sourceTimeAt(clip, local);
  return {
    clipId: clip.id,
    src: clip.src,
    media: clip.media,
    time: source.time,
    reversed: source.reversed,
    range: { in: clip.in, out: clip.out },
    fit: clip.fit,
    rect: FULL_RECT,
    kenBurns: clip.fit === "cover" ? (clip.kenBurns ?? null) : null,
    progress: placement.length > 0 ? clamp(local / placement.length, 0, 1) : 0,
    visual,
    overlay: false,
  };
}

/** Plan kadra u trenutku `t`: slojevi glavne trake (1-2 u prelazu), PiP, nalepnice, naslovi. */
export function frameAt(timeline: CreaTimelineV1, time: number): FramePlan {
  const duration = timelineDuration(timeline);
  const t = clamp(time, 0, Math.max(0, duration - 1e-6));
  const layout = mainLayout(timeline);
  const layers: FrameLayer[] = [];
  let dip: FramePlan["dip"] = null;
  let wipeEdge: number | null = null;

  const visible = layout.filter((placement) => t >= placement.start && t < placement.end);
  if (visible.length >= 2) {
    const [a, b] = visible;
    const transition = a.transitionOut;
    if (transition) {
      const p = (t - b.start) / transition.duration;
      const look = transitionVisual(transition.kind, p);
      const outgoing = look.a ? mainLayer(a, t, look.a) : null;
      const incoming = look.b ? mainLayer(b, t, look.b) : null;
      const ordered = look.aOnTop ? [incoming, outgoing] : [outgoing, incoming];
      for (const layer of ordered) if (layer) layers.push(layer);
      dip = look.dip;
      wipeEdge = look.wipeEdge;
    } else {
      layers.push(mainLayer(b, t, IDENTITY_VISUAL));
    }
  } else if (visible.length === 1) {
    layers.push(mainLayer(visible[0], t, IDENTITY_VISUAL));
  }

  for (const clip of timeline.overlay) {
    const length = clipSourceLength(clip);
    if (t < clip.start || t >= clip.start + length) continue;
    layers.push({
      clipId: clip.id,
      src: clip.src,
      media: clip.media,
      time: clip.media === "image" ? 0 : clip.in + (t - clip.start),
      reversed: false,
      range: { in: clip.in, out: clip.out },
      fit: "cover",
      rect: clip.rect,
      kenBurns: null,
      progress: length > 0 ? (t - clip.start) / length : 0,
      visual: IDENTITY_VISUAL,
      overlay: true,
    });
  }

  const stickers = timeline.stickers
    .filter((sticker) => t >= sticker.start && t < sticker.end)
    .map((sticker) => ({ id: sticker.id, sticker: sticker.sticker, rect: sticker.rect, ...stickerVisual(sticker, t) }));
  const titles = timeline.titles
    .filter((title) => t >= title.start && t < title.end && title.text.trim().length > 0)
    .map((title) => ({
      id: title.id,
      text: title.text,
      style: title.style,
      rect: title.rect,
      font: title.font,
      color: title.color,
      ...titleVisual(title, t),
    }));

  return { t, background: timeline.background, layers, dip, wipeEdge, stickers, titles };
}

/** Prozor izvora za sloj (Ken Burns ili običan „cover"), za izvor odnosa `sourceAspect`. */
export function layerWindow(layer: FrameLayer, sourceAspect: number, frameAspect: number): CropWindow {
  const kb = layer.kenBurns ?? { from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1, x: 0, y: 0 } };
  return kenBurnsWindow(kb, layer.progress, sourceAspect, frameAspect);
}

// ── Naslovi, nalepnice, sigurna zona ────────────────────────────────────────

/** Podrazumevan izgled stila: gde stoji, kojim slovima i kojom bojom. */
export const TITLE_STYLE_DEFAULTS: Record<TitleStyle, { font: TitleFont; color: string; anim: TitleAnim }> = {
  naslov: { font: "nunito", color: "#ffffff", anim: "klizanje" },
  rukopis: { font: "rukopis", color: "#f4be30", anim: "pretapanje" },
  "donja-traka": { font: "nunito", color: "#0e3158", anim: "klizanje" },
  titl: { font: "nunito", color: "#ffffff", anim: "nista" },
  "pisaca-masina": { font: "lora", color: "#ffffff", anim: "kucanje" },
};

/**
 * Podrazumevan položaj naslova. Uspravni kadar čuva donjih ~35 % i gornjih ~14 %
 * (tu su dugmad i opis na TikToku, Reels-u i Shorts-u), pa naslov odmah stoji
 * u sigurnoj zoni.
 */
export function defaultTitleRect(style: TitleStyle, aspect: TimelineAspect): Rect01 {
  const tall = aspect === "9:16";
  switch (style) {
    case "naslov":
      return tall ? { x: 0.08, y: 0.28, w: 0.76, h: 0.14 } : { x: 0.08, y: 0.36, w: 0.84, h: 0.2 };
    case "rukopis":
      return tall ? { x: 0.1, y: 0.46, w: 0.72, h: 0.08 } : { x: 0.1, y: 0.62, w: 0.8, h: 0.12 };
    case "donja-traka":
      return tall ? { x: 0.08, y: 0.52, w: 0.7, h: 0.07 } : { x: 0.06, y: 0.72, w: 0.6, h: 0.12 };
    case "titl":
      return tall ? { x: 0.08, y: 0.58, w: 0.76, h: 0.06 } : { x: 0.1, y: 0.8, w: 0.8, h: 0.1 };
    case "pisaca-masina":
      return tall ? { x: 0.08, y: 0.36, w: 0.76, h: 0.1 } : { x: 0.08, y: 0.42, w: 0.84, h: 0.14 };
  }
}

export function addTitle(
  timeline: CreaTimelineV1,
  input: { text: string; start: number; end: number; style: TitleStyle } & Partial<Pick<TitleItem, "font" | "color" | "anim" | "rect">>,
): { timeline: CreaTimelineV1; id: string | null } {
  if (timeline.titles.length >= TIMELINE_LIMITS.titles) return { timeline, id: null };
  const titleId = nextId(timeline, "n");
  const defaults = TITLE_STYLE_DEFAULTS[input.style];
  const title = sanitizeTitle({
    id: titleId,
    rect: defaultTitleRect(input.style, timeline.aspect),
    ...defaults,
    ...input,
  });
  return title ? { timeline: { ...timeline, titles: [...timeline.titles, title] }, id: titleId } : { timeline, id: null };
}

export function addSticker(
  timeline: CreaTimelineV1,
  input: { sticker: string; start: number; end: number; rect?: Rect01; anim?: StickerAnim },
): { timeline: CreaTimelineV1; id: string | null } {
  if (timeline.stickers.length >= TIMELINE_LIMITS.stickers) return { timeline, id: null };
  const stickerId = nextId(timeline, "s");
  const ratio = aspectRatio(timeline.aspect);
  const side = 0.22;
  const sticker = sanitizeSticker({
    id: stickerId,
    rect: { x: 0.5 - side / 2, y: 0.5 - (side * ratio) / 2, w: side, h: side * ratio },
    anim: "iskakanje",
    ...input,
  });
  return sticker ? { timeline: { ...timeline, stickers: [...timeline.stickers, sticker] }, id: stickerId } : { timeline, id: null };
}

export function addOverlay(timeline: CreaTimelineV1, input: Omit<OverlayClip, "id">): { timeline: CreaTimelineV1; id: string | null } {
  if (timeline.overlay.length >= TIMELINE_LIMITS.overlay) return { timeline, id: null };
  const overlayId = nextId(timeline, "p");
  const clip = sanitizeOverlayClip({ ...input, id: overlayId });
  return clip ? { timeline: { ...timeline, overlay: [...timeline.overlay, clip] }, id: overlayId } : { timeline, id: null };
}

export function addAudio(timeline: CreaTimelineV1, input: Omit<AudioClip, "id">): { timeline: CreaTimelineV1; id: string | null } {
  if (timeline.audio.length >= TIMELINE_LIMITS.audio) return { timeline, id: null };
  const audioId = nextId(timeline, "z");
  const clip = sanitizeAudioClip({ ...input, id: audioId });
  return clip ? { timeline: { ...timeline, audio: [...timeline.audio, clip] }, id: audioId } : { timeline, id: null };
}

type ItemPatch = Partial<Omit<OverlayClip, "id">> | Partial<Omit<AudioClip, "id">> | Partial<Omit<TitleItem, "id">> | Partial<Omit<StickerItem, "id">>;

/** Izmena preklopa, zvuka, naslova ili nalepnice (proverava se istim pravilima kao čitanje). */
export function updateItem(timeline: CreaTimelineV1, itemId: string, patch: ItemPatch): CreaTimelineV1 {
  const apply = <T extends { id: string }>(items: T[], sanitize: (raw: unknown) => T | null): T[] =>
    items.map((item) => (item.id === itemId ? (sanitize({ ...item, ...patch, id: item.id }) ?? item) : item));
  return {
    ...timeline,
    overlay: apply(timeline.overlay, sanitizeOverlayClip),
    audio: apply(timeline.audio, sanitizeAudioClip),
    titles: apply(timeline.titles, sanitizeTitle),
    stickers: apply(timeline.stickers, sanitizeSticker),
  };
}

/** Pravougaonik je ceo unutar zone (uz toleranciju zaokruživanja). */
export function rectInside(rect: Rect01, zone: Rect01): boolean {
  const eps = 1e-6;
  return rect.x >= zone.x - eps && rect.y >= zone.y - eps && rect.x + rect.w <= zone.x + zone.w + eps && rect.y + rect.h <= zone.y + zone.h + eps;
}

/** Najmanji pomeraj (i smanjenje kad ne staje) koji pravougaonik unosi u zonu. */
export function fitRectToZone(rect: Rect01, zone: Rect01): Rect01 {
  const w = Math.min(rect.w, zone.w);
  const h = Math.min(rect.h, zone.h);
  const x = clamp(rect.x + (rect.w - w) / 2, zone.x, zone.x + zone.w - w);
  const y = clamp(rect.y + (rect.h - h) / 2, zone.y, zone.y + zone.h - h);
  return { x, y, w, h };
}

/** „Popravi": svi naslovi i nalepnice ulaze u sigurnu zonu platforme. */
export function fitItemsToSafeZone(timeline: CreaTimelineV1, zone: Rect01): CreaTimelineV1 {
  return {
    ...timeline,
    titles: timeline.titles.map((title) => (rectInside(title.rect, zone) ? title : { ...title, rect: fitRectToZone(title.rect, zone) })),
    stickers: timeline.stickers.map((sticker) =>
      rectInside(sticker.rect, zone) ? sticker : { ...sticker, rect: fitRectToZone(sticker.rect, zone) },
    ),
  };
}

/**
 * Redovi na traci za stavke koje se preklapaju u vremenu (dva zvuka ili natpis i
 * nalepnica u isto vreme): svaka dobija prvi red u kojem ništa ne svira. Redosled
 * ulaza ostaje, pa stavka ne „skače" iz reda u red pri sitnoj izmeni.
 */
export function assignLanes(items: ReadonlyArray<{ start: number; end: number }>): number[] {
  const laneEnds: number[] = [];
  return items.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start + 1e-6);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    return lane;
  });
}

// ── Izvori ──────────────────────────────────────────────────────────────────

/** Radovi iz galerije koje montaža koristi (bez ponavljanja, redom pojavljivanja). */
export function timelineJobIds(timeline: CreaTimelineV1): string[] {
  const ids: string[] = [];
  for (const item of [...timeline.main, ...timeline.overlay, ...timeline.audio]) {
    if ("jobId" in item.src && !ids.includes(item.src.jobId)) ids.push(item.src.jobId);
  }
  return ids;
}

export function timelineLocalFileIds(timeline: CreaTimelineV1): string[] {
  const ids: string[] = [];
  for (const item of [...timeline.main, ...timeline.overlay, ...timeline.audio]) {
    if ("localFileId" in item.src && !ids.includes(item.src.localFileId)) ids.push(item.src.localFileId);
  }
  return ids;
}

/** Roditelj izvezenog videa u stablu verzija (K17 §2.3): prvi glavni klip iz galerije. */
export function exportParentJobId(timeline: CreaTimelineV1): string | null {
  for (const clip of timeline.main) if ("jobId" in clip.src) return clip.src.jobId;
  return null;
}
