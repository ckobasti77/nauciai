import type { LocalizedText } from "./i18n";
import { kenBurnsForIndex, scaleKenBurns } from "./crea-ken-burns";
import {
  addMainClips,
  addAudio,
  addTitle,
  emptyTimeline,
  setTransition,
  timelineDuration,
  type CreaTimelineV1,
  type MediaRef,
  type TimelineAspect,
  type TitleStyle,
  type TransitionKind,
} from "./crea-timeline";

/**
 * „Ubaci i gotovo" (Crea K19, V29): tvoje slike se same slože po ritmu pesme.
 * Ritam (BPM i prvi udarac) nalazi detektor na uređaju (`web-audio-beat-detector`),
 * a ovde je sve ostalo: šabloni, rezovi tačno na udarcima i gotova montaža.
 */

export const BEAT_IMAGES = { min: 5, max: 30 } as const;
/** Kad detektor ne nađe ritam: 120 BPM (uz poruku korisniku). */
export const FALLBACK_BPM = 120;
export const BPM_RANGE = { min: 60, max: 200 } as const;

export type BeatTemplate = {
  id: string;
  label: LocalizedText;
  hint: LocalizedText;
  /** Rez na svaki 1., 2. ili 4. udarac. */
  cutEvery: 1 | 2 | 4;
  /** Prelaz i njegovo trajanje u udarcima (null = čist rez). */
  transition: { kind: TransitionKind; beats: number } | null;
  /** Jačina Ken Burnsa (0 = mirne slike). */
  kenBurns: number;
  title?: { style: TitleStyle; text: LocalizedText; beats: number };
};

export const BEAT_TEMPLATES: readonly BeatTemplate[] = [
  {
    id: "brzi-ritam",
    label: { sr: "Brzi ritam", en: "Fast beat" },
    hint: { sr: "Nova slika na svaki udarac - za žurke i brze pesme.", en: "A new picture on every beat - for parties and fast songs." },
    cutEvery: 1,
    transition: null,
    kenBurns: 0.6,
  },
  {
    id: "na-dva",
    label: { sr: "Na svaka dva", en: "Every two" },
    hint: { sr: "Slika traje dva udarca, uz kratko pretapanje.", en: "Each picture lasts two beats, with a short crossfade." },
    cutEvery: 2,
    transition: { kind: "pretapanje", beats: 0.5 },
    kenBurns: 1,
  },
  {
    id: "lagano",
    label: { sr: "Lagano", en: "Slow and soft" },
    hint: { sr: "Četiri udarca po slici i meko pretapanje - za uspomene.", en: "Four beats per picture and a soft crossfade - for memories." },
    cutEvery: 4,
    transition: { kind: "pretapanje", beats: 1 },
    kenBurns: 1,
  },
  {
    id: "bljesak",
    label: { sr: "Bljesak", en: "Flash" },
    hint: { sr: "Beli blic na svakom rezu, kao foto-aparat.", en: "A white flash on every cut, like a camera." },
    cutEvery: 2,
    transition: { kind: "kroz-belo", beats: 0.5 },
    kenBurns: 1.4,
  },
  {
    id: "klizanje",
    label: { sr: "Klizanje", en: "Slide" },
    hint: { sr: "Slike klize jedna za drugom na svaka dva udarca.", en: "Pictures slide in one after another every two beats." },
    cutEvery: 2,
    transition: { kind: "klizanje-levo", beats: 0.5 },
    kenBurns: 0.5,
  },
  {
    id: "zum-udarac",
    label: { sr: "Zum na udarac", en: "Zoom punch" },
    hint: { sr: "Kratak zum na svakom udarcu - puno energije.", en: "A short zoom on every beat - lots of energy." },
    cutEvery: 1,
    transition: { kind: "zum", beats: 0.25 },
    kenBurns: 1.6,
  },
  {
    id: "album",
    label: { sr: "Album iz sveske", en: "Notebook album" },
    hint: { sr: "Stranice se okreću kao u svesci, uz naslov na početku.", en: "Pages turn like in a notebook, with a title at the start." },
    cutEvery: 4,
    transition: { kind: "list-sveske", beats: 1 },
    kenBurns: 0.8,
    title: { style: "rukopis", text: { sr: "Moj album", en: "My album" }, beats: 4 },
  },
  {
    id: "prica",
    label: { sr: "Priča", en: "Story" },
    hint: { sr: "Veliki naslov, pa slike na svaka četiri udarca kroz crno.", en: "A big title, then pictures every four beats through black." },
    cutEvery: 4,
    transition: { kind: "kroz-crno", beats: 0.5 },
    kenBurns: 1,
    title: { style: "naslov", text: { sr: "Naša priča", en: "Our story" }, beats: 4 },
  },
];

export function beatTemplateById(id: string | null | undefined): BeatTemplate | undefined {
  return BEAT_TEMPLATES.find((template) => template.id === id);
}

export function beatPeriod(bpm: number): number {
  return 60 / Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, bpm));
}

/**
 * Trenuci rezova (s, od početka montaže): `count + 1` granica za `count` slika.
 * Prvi rez je na prvom udarcu posle `offset` (mod. dužine koraka), pa svaki
 * `cutEvery`-ti udarac. Prva slika traje od 0 do prvog reza; kad bi bila
 * prekratka (kraća od pola udarca ili od `minFirst`), dobija ceo korak više.
 */
export function beatCuts(bpm: number, offset: number, count: number, cutEvery: 1 | 2 | 4, minFirst = 0): number[] {
  const beat = beatPeriod(bpm);
  const step = beat * cutEvery;
  let first = ((offset % step) + step) % step;
  if (first < Math.max(beat / 2, minFirst)) first += step;
  const cuts = [0];
  for (let index = 0; index < count; index++) cuts.push(first + index * step);
  return cuts;
}

export type BeatImage = { src: MediaRef };

/**
 * Gotova montaža od slika i pesme. Prelaz je centriran na udarac (klip traje
 * pola prelaza duže sa obe strane), pa se promena kadra vidi TAČNO na udarcu.
 */
export function buildBeatTimeline(input: {
  images: readonly BeatImage[];
  song: { src: MediaRef; start: number; durationS: number | null };
  bpm: number;
  /** Prvi udarac u pesmi (s od početka fajla). */
  offset: number;
  template: BeatTemplate;
  aspect: TimelineAspect;
  locale: "sr" | "en";
}): CreaTimelineV1 {
  const { template } = input;
  const count = Math.min(BEAT_IMAGES.max, input.images.length);
  const beat = beatPeriod(input.bpm);
  const transitionS = template.transition ? Math.min(2, Math.max(0.1, template.transition.beats * beat)) : 0;
  // Prvi kadar mora da primi pola prelaza i da ostane bar dvostruko duži od njega.
  const cuts = beatCuts(input.bpm, input.offset - input.song.start, count, template.cutEvery, transitionS * 1.5);
  const half = transitionS / 2;

  const clips = input.images.slice(0, count).map((image, index) => {
    const visible = cuts[index + 1] - cuts[index];
    const length = visible + (index > 0 ? half : 0) + (index < count - 1 ? half : 0);
    return {
      src: image.src,
      media: "image" as const,
      in: 0,
      out: Math.max(0.2, length),
      speed: 1,
      volumeDb: 0,
      muted: false,
      fit: "cover" as const,
      ...(template.kenBurns > 0 ? { kenBurns: scaleKenBurns(kenBurnsForIndex(index), template.kenBurns) } : {}),
    };
  });

  let timeline = addMainClips(emptyTimeline(input.aspect), clips);
  if (template.transition) {
    for (const clip of timeline.main.slice(0, -1)) timeline = setTransition(timeline, clip.id, template.transition.kind, transitionS);
  }
  const duration = timelineDuration(timeline);
  const songLength = input.song.durationS === null ? duration : Math.max(0.2, input.song.durationS - input.song.start);
  timeline = addAudio(timeline, {
    src: input.song.src,
    in: input.song.start,
    out: input.song.start + Math.min(songLength, duration),
    start: 0,
    volumeDb: 0,
    role: "music",
    fadeIn: 0,
    fadeOut: Math.min(1.5, duration / 4),
  }).timeline;
  if (template.title) {
    timeline = addTitle(timeline, {
      text: template.title.text[input.locale],
      start: 0,
      end: Math.min(duration, template.title.beats * beat),
      style: template.title.style,
    }).timeline;
  }
  return { ...timeline, mix: { ...timeline.mix, fadeOut: Math.min(1, duration / 6) } };
}
