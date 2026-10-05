import type { LocalizedText } from "./i18n";

/**
 * Retro efekti za video (Crea K21, V27; plan K17 §6.3): preseti, parametri
 * (opsezi, podrazumevano, jačina) i pravila koja nisu šejder - Nokia mreža
 * piksela i 12 kadrova u sekundi, VHS natpis „PLAY ▶ 12.03.1996", naslov
 * pisaće mašine koji se kuca. Šejderi su u
 * `components/crea/video/engine/retro-shaders.ts`; ovde su samo podaci i čiste
 * funkcije (bez browser API-ja), pa se testiraju bez pregledača.
 *
 * Šum u šejderima zavisi samo od semena kadra (`retroSeed`) i vremena kadra,
 * nikad od `Math.random` ili sata: pregled kadra N i izvoz kadra N su isti.
 */

export const RETRO_IDS = ["vhs", "crt", "glic", "termo", "nocni-vid", "nokia", "pisaca-masina", "super8"] as const;
export type RetroId = (typeof RETRO_IDS)[number];

/** Klizač jednog efekta. Šejder dobija vrednost svedenu na 0..1 (`retroUniforms`). */
export type RetroParam = { key: string; label: LocalizedText; min: number; max: number; step: number; default: number };

export type RetroPreset = {
  id: RetroId;
  label: LocalizedText;
  hint: LocalizedText;
  /** Podrazumevana jačina (0..100) za ovaj efekat. */
  strength: number;
  /** Najviše 4 (šejder ih prima kao jedan `vec4`). */
  params: readonly RetroParam[];
};

export const RETRO_STRENGTH = { min: 0, max: 100, step: 1 } as const;
/** Šejder prima najviše ovoliko parametara po efektu (`uniform vec4 uParams`). */
export const RETRO_MAX_PARAMS = 4;

function param(key: string, sr: string, en: string, value: number): RetroParam {
  return { key, label: { sr, en }, min: 0, max: 100, step: 1, default: value };
}

export const RETRO_PRESETS: readonly RetroPreset[] = [
  {
    id: "vhs",
    label: { sr: "VHS", en: "VHS" },
    hint: {
      sr: "Stara video kaseta: boje se razlivaju, traka trza i šumi.",
      en: "An old video tape: the colours bleed, the tape jitters and hisses.",
    },
    strength: 70,
    params: [
      param("pomak", "Razlivene boje", "Colour bleed", 50),
      param("linije", "Linije trake", "Tape lines", 45),
      param("sum", "Šum", "Noise", 40),
      param("mekoca", "Mekoća", "Softness", 50),
    ],
  },
  {
    id: "crt",
    label: { sr: "Stari televizor", en: "Old TV" },
    hint: { sr: "Linije ekrana, zaobljeno staklo i tamne ivice.", en: "Scan lines, curved glass and dark edges." },
    strength: 75,
    params: [
      param("linije", "Linije ekrana", "Scan lines", 60),
      param("zakrivljenost", "Zaobljenost", "Curvature", 50),
      param("vinjeta", "Tamne ivice", "Dark edges", 50),
      param("maska", "RGB tačkice", "RGB dots", 40),
    ],
  },
  {
    id: "glic",
    label: { sr: "Glič", en: "Glitch" },
    hint: { sr: "Slika se lomi u blokove, a boje se razilaze.", en: "The picture breaks into blocks and the colours split." },
    strength: 60,
    params: [
      param("blokovi", "Blokovi", "Blocks", 50),
      param("rgb", "Razdvojene boje", "RGB split", 50),
      param("ucestalost", "Koliko često", "How often", 40),
    ],
  },
  {
    id: "termo",
    label: { sr: "Termo kamera", en: "Thermal camera" },
    hint: { sr: "Svetlo postaje žuto i belo, a tamno plavo i ljubičasto.", en: "Bright turns yellow and white, dark turns blue and purple." },
    strength: 100,
    params: [param("kontrast", "Kontrast", "Contrast", 50), param("sum", "Šum", "Noise", 20)],
  },
  {
    id: "nocni-vid",
    label: { sr: "Noćni vid", en: "Night vision" },
    hint: { sr: "Zeleni sjaj, šum i tamni krug kao kroz dvogled.", en: "A green glow, noise and a dark ring like binoculars." },
    strength: 100,
    params: [param("sum", "Šum", "Noise", 45), param("sjaj", "Sjaj", "Glow", 40), param("vinjeta", "Tamni krug", "Dark ring", 50)],
  },
  {
    id: "nokia",
    label: { sr: "Nokia", en: "Nokia" },
    hint: {
      sr: "Ekran starog telefona: krupni pikseli, 12 kadrova u sekundi i 4096 boja.",
      en: "An old phone screen: big pixels, 12 frames a second and 4096 colours.",
    },
    strength: 100,
    params: [param("mreza", "Mreža ekrana", "Screen grid", 40), param("bledilo", "Bledilo", "Washed out", 40)],
  },
  {
    id: "pisaca-masina",
    label: { sr: "Pisaća mašina", en: "Typewriter" },
    hint: {
      sr: "Sepija na papiru, a naslov se kuca slovo po slovo.",
      en: "Sepia on paper, and the title types itself letter by letter.",
    },
    strength: 85,
    params: [param("sepija", "Sepija", "Sepia", 80), param("papir", "Papir", "Paper", 60), param("vinjeta", "Tamne ivice", "Dark edges", 40)],
  },
  {
    id: "super8",
    label: { sr: "Super 8", en: "Super 8" },
    hint: { sr: "Topla filmska traka: zrno, ljuljanje i treperenje.", en: "Warm film stock: grain, gate weave and flicker." },
    strength: 70,
    params: [
      param("toplina", "Toplina", "Warmth", 60),
      param("zrno", "Zrno", "Grain", 50),
      param("ljuljanje", "Ljuljanje kadra", "Gate weave", 40),
      param("treperenje", "Treperenje", "Flicker", 40),
    ],
  },
];

export function retroPreset(id: RetroId): RetroPreset {
  return RETRO_PRESETS.find((preset) => preset.id === id) ?? RETRO_PRESETS[0];
}

export function isRetroId(value: unknown): value is RetroId {
  return typeof value === "string" && (RETRO_IDS as readonly string[]).includes(value);
}

/** Jačina (0..100) i vrednosti klizača u jedinicama klizača. */
export type RetroValues = { strength: number; params: Record<string, number> };

function snap(value: unknown, min: number, max: number, step: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const stepped = min + Math.round((value - min) / step) * step;
  return Number(Math.min(max, Math.max(min, stepped)).toFixed(6));
}

/**
 * Vrednosti efekta: podrazumevane, pa izmene korisnika svedene u opseg i na
 * korak klizača. Nepoznat ključ se odbacuje; NaN i tekst daju podrazumevano.
 */
export function retroParamsFor(id: RetroId, strength?: number, overrides: Readonly<Record<string, unknown>> = {}): RetroValues {
  const preset = retroPreset(id);
  const params: Record<string, number> = {};
  for (const entry of preset.params) {
    params[entry.key] = snap(overrides[entry.key], entry.min, entry.max, entry.step, entry.default);
  }
  return { strength: snap(strength, RETRO_STRENGTH.min, RETRO_STRENGTH.max, RETRO_STRENGTH.step, preset.strength), params };
}

/** Uniforme šejdera: jačina 0..1 i do 4 parametra svedena na 0..1 (redom iz preseta). */
export function retroUniforms(id: RetroId, values: RetroValues): { strength: number; params: [number, number, number, number] } {
  const preset = retroPreset(id);
  const out: [number, number, number, number] = [0, 0, 0, 0];
  preset.params.slice(0, RETRO_MAX_PARAMS).forEach((entry, index) => {
    const value = values.params[entry.key] ?? entry.default;
    out[index] = Math.min(1, Math.max(0, (value - entry.min) / (entry.max - entry.min)));
  });
  return { strength: Math.min(1, Math.max(0, values.strength / 100)), params: out };
}

// ── Seme šuma ───────────────────────────────────────────────────────────────

/**
 * Seme šuma za kadar (32-bitni ceo broj bez znaka). Isti broj kadra uvek daje
 * isto seme, susedni kadrovi potpuno različito (heš, ne brojač).
 */
export function retroSeed(frameIndex: number): number {
  const index = Number.isFinite(frameIndex) ? Math.max(0, Math.floor(frameIndex)) : 0;
  let x = (index + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

// ── Nokia ───────────────────────────────────────────────────────────────────

/** Nokia: duža stranica 176 piksela (kao 176 × 144), 12 kadrova u sekundi, 4 bita po boji = 4096 boja. */
export const NOKIA = { longSide: 176, fps: 12, bitsPerChannel: 4 } as const;
export const NOKIA_COLORS = 2 ** (NOKIA.bitsPerChannel * 3);

/** Mreža piksela za kadar `width × height`: duža stranica 176, oblik ostaje. */
export function nokiaSize(width: number, height: number): { width: number; height: number } {
  const scale = NOKIA.longSide / Math.max(1, width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Redni broj „otkucaja" sporog sata (`fps`) u trenutku `timeS`. */
export function retroTick(timeS: number, fps: number = NOKIA.fps): number {
  return Math.floor(Math.max(0, Number.isFinite(timeS) ? timeS : 0) * fps + 1e-6);
}

/**
 * Izlaz ostaje na fps-u izvora, ali slika se menja samo `targetFps` puta u
 * sekundi: kadar `i` pokazuje prvi kadar izvora u svom otkucaju (nikad kasniji
 * od `i`, pa izvoz koji čita redom uvek već ima taj kadar).
 */
export function heldFrameIndex(i: number, srcFps: number, targetFps: number = NOKIA.fps): number {
  const index = Math.max(0, Math.floor(i));
  if (!(srcFps > targetFps)) return index;
  const tick = Math.floor((index * targetFps) / srcFps + 1e-9);
  return Math.min(index, Math.max(0, Math.ceil((tick * srcFps) / targetFps - 1e-9)));
}

/** Raspored na 12 fps: za svaki izlazni kadar (ceil(trajanje × 12)) - koji kadar izvora pokazuje. */
export function nokiaFrameSchedule(srcFps: number, durationS: number): number[] {
  if (!(srcFps > 0) || !(durationS > 0)) return [];
  const count = Math.ceil(durationS * NOKIA.fps - 1e-9);
  const last = Math.max(0, Math.ceil(durationS * srcFps - 1e-9) - 1);
  return Array.from({ length: count }, (_, k) => Math.min(last, Math.max(0, Math.ceil((k * srcFps) / NOKIA.fps - 1e-9))));
}

// ── VHS natpis ──────────────────────────────────────────────────────────────

/** Datum na snimku; mesec je 1..12. */
export type VhsDate = { d: number; m: number; y: number };
export type VhsStamp = { play: string; date: string; counter: string };

const pad = (value: number, length = 2) => String(Math.trunc(value)).padStart(length, "0");

/** „PLAY ▶", „12.03.1996" i brojač „0:00:07" (sati:minuti:sekunde od početka snimka). */
export function vhsStamp(date: Date | VhsDate, elapsedS: number): VhsStamp {
  const day = date instanceof Date ? { d: date.getDate(), m: date.getMonth() + 1, y: date.getFullYear() } : date;
  const total = Math.floor(Math.max(0, Number.isFinite(elapsedS) ? elapsedS : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return {
    play: "PLAY ▶",
    date: `${pad(day.d)}.${pad(day.m)}.${pad(day.y, 4)}`,
    counter: `${hours}:${pad(minutes)}:${pad(total % 60)}`,
  };
}

/** Vrednost polja `<input type="date">` („1996-03-12") → datum, ili `null` kad datum ne postoji. */
export function parseDateInput(value: string): VhsDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth ? { d, m, y } : null;
}

/** Datum → vrednost polja `<input type="date">` (lokalni dan). */
export function dateInputValue(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ── Pisaća mašina ───────────────────────────────────────────────────────────

/** Naslov pisaće mašine: najviše 60 slova, kuca se 12 slova u sekundi od početka videa. */
export const TYPEWRITER = { maxChars: 60, cps: 12 } as const;

/** Jedan red bez suvišnih razmaka, najviše 60 slova (č, ć i ćirilica su po jedno slovo). */
export function cleanTypewriterText(text: string): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, TYPEWRITER.maxChars).join("");
}

/** Deo naslova koji je otkucan posle `t` sekundi, uz `cps` slova u sekundi. */
export function typewriterTitle(text: string, t: number, cps: number = TYPEWRITER.cps): string {
  if (!(t > 0) || !(cps > 0)) return "";
  const chars = Array.from(text);
  return chars.slice(0, Math.min(chars.length, Math.floor(t * cps + 1e-6))).join("");
}
