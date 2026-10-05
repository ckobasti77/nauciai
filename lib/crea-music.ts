import { LYRIA_PROMPT_MAX } from "@/convex/providers/googleAudioModels";
import { PROMPT_MAX_LENGTH } from "@/convex/providers/modelControls";
import type { LocalizedText } from "./i18n";
import { jobCredits, type PricedModel } from "./crea-job-price";

/**
 * Pesma po delovima (Crea K23, A11): uvod, strofa, refren… svaki deo sa svojim
 * tekstom (ili opisom instrumenata), plus instrumental i petlja. Čiste funkcije:
 * dokument pesme → opis za motor → posao (`studio.createJob`) i cena na dugmetu
 * (ista računica kao server).
 *
 * Delovi i tekst idu u SAM opis, kao oznake `[Intro]`, `[Verse]`, `[Chorus]` sa
 * vremenima - tako ih po zvaničnoj strani čita Lyria
 * (https://ai.google.dev/gemini-api/docs/music-generation), a ElevenLabs Music
 * prima tekst pesme u opisu. Cena zato ostaje pravilo reda kataloga: Lyria po
 * pesmi, ElevenLabs po započetom minutu (C0) - `minutes` = zbir delova
 * zaokružen naviše, pa server pravi i naplaćuje baš toliko.
 */

export const MUSIC_ENGINES = ["lyria-clip", "lyria-song", "eleven"] as const;
export type MusicEngineId = (typeof MUSIC_ENGINES)[number];

export type MusicEngine = {
  id: MusicEngineId;
  modelSlug: string;
  label: LocalizedText;
  pitch: LocalizedText;
  /** Koliko traje izlaz: tačno (klip), otprilike (pesma) ili po tvom zbiru delova (ElevenLabs). */
  seconds: { kind: "fixed"; value: number } | { kind: "about"; value: number } | { kind: "exact"; min: number; max: number };
  /** Najduži opis koji red kataloga prima (granica kontrole `prompt`). */
  maxChars: number;
};

export const MUSIC_ENGINE_LIST: readonly MusicEngine[] = [
  {
    id: "lyria-clip",
    modelSlug: "lyria-3-clip",
    label: { sr: "Lyria klip · 30 s", en: "Lyria clip · 30 s" },
    pitch: { sr: "Najjeftinije: kratka numera, džingl ili petlja.", en: "The cheapest: a short track, a jingle or a loop." },
    seconds: { kind: "fixed", value: 30 },
    maxChars: LYRIA_PROMPT_MAX,
  },
  {
    id: "lyria-song",
    modelSlug: "lyria-35",
    label: { sr: "Lyria pesma · ~2 min", en: "Lyria song · ~2 min" },
    pitch: { sr: "Cela pesma sa delovima i tekstom, jedna cena.", en: "A whole song with sections and lyrics, one price." },
    seconds: { kind: "about", value: 120 },
    maxChars: LYRIA_PROMPT_MAX,
  },
  {
    id: "eleven",
    modelSlug: "music",
    label: { sr: "ElevenLabs · tačno trajanje", en: "ElevenLabs · exact length" },
    pitch: { sr: "Tačno trajanje do 5 min; plaća se svaki započeti minut.", en: "An exact length up to 5 min; every started minute is billed." },
    seconds: { kind: "exact", min: 60, max: 300 },
    maxChars: PROMPT_MAX_LENGTH,
  },
];

export function musicEngine(id: MusicEngineId): MusicEngine {
  return MUSIC_ENGINE_LIST.find((engine) => engine.id === id)!;
}

export function isMusicEngineId(value: unknown): value is MusicEngineId {
  return typeof value === "string" && (MUSIC_ENGINES as readonly string[]).includes(value);
}

export const SECTION_KINDS = ["uvod", "strofa", "predrefren", "refren", "most", "solo", "kraj"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** Naziv dela za korisnika i oznaka koju motor čita. */
export const SECTION_META: Record<SectionKind, { label: LocalizedText; marker: string; seconds: number }> = {
  uvod: { label: { sr: "Uvod", en: "Intro" }, marker: "Intro", seconds: 8 },
  strofa: { label: { sr: "Strofa", en: "Verse" }, marker: "Verse", seconds: 24 },
  predrefren: { label: { sr: "Pred-refren", en: "Pre-chorus" }, marker: "Pre-Chorus", seconds: 8 },
  refren: { label: { sr: "Refren", en: "Chorus" }, marker: "Chorus", seconds: 20 },
  most: { label: { sr: "Most", en: "Bridge" }, marker: "Bridge", seconds: 12 },
  solo: { label: { sr: "Solo", en: "Solo" }, marker: "Instrumental Solo", seconds: 12 },
  kraj: { label: { sr: "Kraj", en: "Outro" }, marker: "Outro", seconds: 8 },
};

export const MUSIC_MOODS = ["vedro", "energicno", "opusteno", "romanticno", "epsko", "tuzno", "misteriozno", "zaigrano"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export const MUSIC_MOOD_META: Record<MusicMood, { label: LocalizedText; words: string }> = {
  vedro: { label: { sr: "Vedro", en: "Bright" }, words: "bright, happy" },
  energicno: { label: { sr: "Energično", en: "Energetic" }, words: "energetic, driving" },
  opusteno: { label: { sr: "Opušteno", en: "Chill" }, words: "chill, relaxed" },
  romanticno: { label: { sr: "Romantično", en: "Romantic" }, words: "romantic, warm" },
  epsko: { label: { sr: "Epsko", en: "Epic" }, words: "epic, cinematic" },
  tuzno: { label: { sr: "Tužno", en: "Sad" }, words: "sad, melancholic" },
  misteriozno: { label: { sr: "Misteriozno", en: "Mysterious" }, words: "mysterious, dark" },
  zaigrano: { label: { sr: "Zaigrano", en: "Playful" }, words: "playful, quirky" },
};

export const MUSIC_TEMPOS = ["sporo", "srednje", "brzo"] as const;
export type MusicTempo = (typeof MUSIC_TEMPOS)[number];
export const MUSIC_TEMPO_META: Record<MusicTempo, { label: LocalizedText; bpm: number }> = {
  sporo: { label: { sr: "Sporo", en: "Slow" }, bpm: 75 },
  srednje: { label: { sr: "Srednje", en: "Medium" }, bpm: 100 },
  brzo: { label: { sr: "Brzo", en: "Fast" }, bpm: 128 },
};

export const MUSIC_LIMITS = { sections: 12, sectionChars: 600, styleChars: 200, sectionSeconds: { min: 3, max: 120 } } as const;

export type MusicSection = { id: string; kind: SectionKind; text: string; seconds: number };
export type MusicDoc = {
  v: 1;
  /** Žanr i instrumenti, slobodno („pop sa gitarom", „trap"). */
  style: string;
  mood: MusicMood | null;
  tempo: MusicTempo;
  instrumental: boolean;
  /** Petlja: bez uvoda i kraja, isti nivo energije - za pozadinu videa. */
  loop: boolean;
  sections: MusicSection[];
};

export const MUSIC_TEMPLATES = ["pesma", "dzingl", "petlja", "podloga"] as const;
export type MusicTemplate = (typeof MUSIC_TEMPLATES)[number];
export const MUSIC_TEMPLATE_LABELS: Record<MusicTemplate, LocalizedText> = {
  pesma: { sr: "Pesma sa refrenom", en: "Song with a chorus" },
  dzingl: { sr: "Kratak džingl", en: "Short jingle" },
  petlja: { sr: "Petlja za video", en: "Loop for a video" },
  podloga: { sr: "Podloga bez glasa", en: "Instrumental bed" },
};

function sections(kinds: readonly SectionKind[]): MusicSection[] {
  return kinds.map((kind, index) => ({ id: `d${index + 1}`, kind, text: "", seconds: SECTION_META[kind].seconds }));
}

export function musicTemplate(template: MusicTemplate): MusicDoc {
  const base = { v: 1 as const, style: "", mood: null, tempo: "srednje" as const };
  switch (template) {
    case "pesma":
      return { ...base, instrumental: false, loop: false, sections: sections(["uvod", "strofa", "refren", "strofa", "refren", "kraj"]) };
    case "dzingl":
      return { ...base, instrumental: false, loop: false, sections: [{ id: "d1", kind: "uvod", text: "", seconds: 3 }, { id: "d2", kind: "refren", text: "", seconds: 10 }, { id: "d3", kind: "kraj", text: "", seconds: 4 }] };
    case "petlja":
      return { ...base, instrumental: true, loop: true, sections: [] };
    case "podloga":
      return { ...base, instrumental: true, loop: false, sections: sections(["uvod", "strofa", "refren", "kraj"]) };
  }
}

export function nextSectionId(doc: MusicDoc): string {
  let max = 0;
  for (const section of doc.sections) {
    const match = /^d(\d+)$/.exec(section.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `d${max + 1}`;
}

export function clampSectionSeconds(value: number): number {
  if (!Number.isFinite(value)) return MUSIC_LIMITS.sectionSeconds.min;
  return Math.round(Math.min(MUSIC_LIMITS.sectionSeconds.max, Math.max(MUSIC_LIMITS.sectionSeconds.min, value)));
}

/** Zbir trajanja delova (s); petlja bez delova = 30 s. */
export function totalSeconds(doc: MusicDoc): number {
  if (doc.sections.length === 0) return 30;
  return doc.sections.reduce((sum, section) => sum + clampSectionSeconds(section.seconds), 0);
}

/** ElevenLabs: celih minuta koliko delovi traju (1-5) - toliko se pravi i naplaćuje (C0). */
export function elevenMinutes(doc: MusicDoc): number {
  return Math.min(5, Math.max(1, Math.ceil(totalSeconds(doc) / 60)));
}

function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function clean(text: string, max: number): string {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

/** Da li delovi staju u izlaz motora (Lyria klip je tačno 30 s). */
function sectionsFit(doc: MusicDoc, engine: MusicEngine): boolean {
  if (engine.seconds.kind === "fixed") return totalSeconds(doc) <= engine.seconds.value;
  return true;
}

/**
 * Opis za motor (engleski okvir, tekst pesme ostaje na jeziku korisnika):
 * žanr, raspoloženje, tempo, instrumental/petlja, pa delovi sa oznakama i
 * vremenima. Vremena se pišu samo kad ih motor može da ispoštuje.
 */
export function musicPrompt(doc: MusicDoc, engineId: MusicEngineId): string {
  const engine = musicEngine(engineId);
  const head: string[] = [];
  const style = clean(doc.style, MUSIC_LIMITS.styleChars);
  if (style) head.push(`${style.replace(/[.\s]+$/, "")}.`);
  if (doc.mood) head.push(`Mood: ${MUSIC_MOOD_META[doc.mood].words}.`);
  head.push(`Tempo: about ${MUSIC_TEMPO_META[doc.tempo].bpm} BPM.`);
  if (doc.instrumental) head.push("Instrumental only, no vocals.");
  if (doc.loop) head.push("Seamless loop: no intro and no ending, steady energy from start to finish, so the end flows straight back into the start.");

  const parts = [head.join(" ")];
  const withTimes = sectionsFit(doc, engine);
  let at = 0;
  const counts: Partial<Record<SectionKind, number>> = {};
  const lines: string[] = [];
  for (const section of doc.sections) {
    const seconds = clampSectionSeconds(section.seconds);
    counts[section.kind] = (counts[section.kind] ?? 0) + 1;
    const repeated = doc.sections.filter((entry) => entry.kind === section.kind).length > 1;
    const marker = `[${SECTION_META[section.kind].marker}${repeated ? ` ${counts[section.kind]}` : ""}]`;
    const text = clean(section.text, MUSIC_LIMITS.sectionChars);
    const time = withTimes ? `[${clock(at)} - ${clock(at + seconds)}] ` : "";
    if (doc.instrumental || section.kind === "solo") lines.push(`${time}${marker}${text ? ` (instrumental: ${text.replace(/\n+/g, ", ")})` : " (instrumental)"}`);
    else lines.push(`${time}${marker}${text ? `\n${text}` : " (instrumental)"}`);
    at += seconds;
  }
  if (lines.length > 0) parts.push(`Structure${withTimes ? ` (total ${clock(at)})` : ""}:\n${lines.join("\n")}`);
  return parts.join("\n\n");
}

export type MusicJob = { modelSlug: string; inputMode: "text"; params: Record<string, string | number | boolean> };

export function musicJob(doc: MusicDoc, engineId: MusicEngineId): MusicJob {
  const engine = musicEngine(engineId);
  const prompt = musicPrompt(doc, engineId);
  return {
    modelSlug: engine.modelSlug,
    inputMode: "text",
    params: engineId === "eleven" ? { prompt, minutes: elevenMinutes(doc) } : { prompt },
  };
}

export type MusicProblem = "PRAZNO" | "PREDUG_OPIS" | "PREDUGO_ZA_KLIP" | "PREDUGO";

export function musicProblem(doc: MusicDoc, engineId: MusicEngineId): MusicProblem | null {
  const engine = musicEngine(engineId);
  const hasWords = doc.style.trim().length > 0 || doc.mood !== null || doc.sections.some((section) => section.text.trim().length > 0);
  if (!hasWords) return "PRAZNO";
  if (musicPrompt(doc, engineId).length > engine.maxChars) return "PREDUG_OPIS";
  if (engine.seconds.kind === "fixed" && totalSeconds(doc) > engine.seconds.value) return "PREDUGO_ZA_KLIP";
  if (engine.seconds.kind === "exact" && totalSeconds(doc) > engine.seconds.max) return "PREDUGO";
  return null;
}

/** Cena na dugmetu: ista funkcija kao server (`jobCredits`). */
export function musicCredits(doc: MusicDoc, engineId: MusicEngineId, catalog: readonly PricedModel[]): number | null {
  const job = musicJob(doc, engineId);
  return jobCredits({ modelSlug: job.modelSlug, inputMode: job.inputMode, params: job.params, measured: {} }, catalog);
}

/** Dokument iz nepouzdanog izvora (`localStorage`); loš oblik = `null`. */
export function sanitizeMusicDoc(raw: unknown): MusicDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.v !== 1 || !Array.isArray(record.sections)) return null;
  const out: MusicSection[] = [];
  for (const entry of record.sections.slice(0, MUSIC_LIMITS.sections)) {
    if (!entry || typeof entry !== "object") continue;
    const section = entry as Record<string, unknown>;
    if (typeof section.id !== "string" || !/^d\d{1,3}$/.test(section.id) || out.some((existing) => existing.id === section.id)) continue;
    if (!(SECTION_KINDS as readonly unknown[]).includes(section.kind)) continue;
    out.push({
      id: section.id,
      kind: section.kind as SectionKind,
      text: typeof section.text === "string" ? section.text.slice(0, MUSIC_LIMITS.sectionChars) : "",
      seconds: clampSectionSeconds(typeof section.seconds === "number" ? section.seconds : SECTION_META[section.kind as SectionKind].seconds),
    });
  }
  return {
    v: 1,
    style: typeof record.style === "string" ? record.style.slice(0, MUSIC_LIMITS.styleChars) : "",
    mood: (MUSIC_MOODS as readonly unknown[]).includes(record.mood) ? (record.mood as MusicMood) : null,
    tempo: (MUSIC_TEMPOS as readonly unknown[]).includes(record.tempo) ? (record.tempo as MusicTempo) : "srednje",
    instrumental: record.instrumental === true,
    loop: record.loop === true,
    sections: out,
  };
}

// ── Petlja na uređaju (0 kr) ─────────────────────────────────────────────────

/**
 * Besprekorna petlja: poslednjih `fadeS` sekundi se pretopi u prve (jednaka snaga),
 * pa je izlaz kraći za `fadeS`. Kraj izlaza je uzorak tačno pre početka pretapanja
 * u originalu, a početak izlaza je prvi uzorak tog pretapanja - kad se ponovi,
 * spoj je neprekidan kao i original.
 */
export function loopCrossfade(channels: readonly Float32Array[], sampleRate: number, fadeS = 1.5): Float32Array[] {
  const length = channels[0]?.length ?? 0;
  const fade = Math.min(Math.floor(length / 3), Math.max(0, Math.round(fadeS * sampleRate)));
  if (fade === 0) return channels.map((channel) => channel.slice());
  return channels.map((channel) => {
    const out = new Float32Array(length - fade);
    for (let index = 0; index < fade; index++) {
      const t = index / fade;
      const fadeIn = Math.sin((t * Math.PI) / 2);
      const fadeOut = Math.cos((t * Math.PI) / 2);
      out[index] = channel[index]! * fadeIn + channel[length - fade + index]! * fadeOut;
    }
    out.set(channel.subarray(fade, length - fade), fade);
    return out;
  });
}

/** Petlja ponovljena `times` puta (za izvoz dužeg fajla). */
export function repeatLoop(channels: readonly Float32Array[], times: number): Float32Array[] {
  const count = Math.max(1, Math.min(20, Math.round(times)));
  return channels.map((channel) => {
    const out = new Float32Array(channel.length * count);
    for (let index = 0; index < count; index++) out.set(channel, index * channel.length);
    return out;
  });
}
