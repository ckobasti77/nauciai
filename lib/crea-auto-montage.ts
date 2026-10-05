import { kenBurnsForIndex } from "./crea-ken-burns";
import type { CaptionCue, CaptionScript, CaptionStyle } from "./crea-subtitles";
import {
  addAudio,
  addMainClips,
  addOverlay,
  addTitle,
  emptyTimeline,
  mainLayout,
  setTransition,
  TIMELINE_LIMITS,
  type CreaTimelineV1,
  type MediaRef,
  type NewMainClip,
  type OverlayClip,
  type TimelineAspect,
  type TitleFont,
  type TitleItem,
  type TitleStyle,
  type TransitionKind,
} from "./crea-timeline";

/**
 * Automatska montaža (Crea K21): strip → film (V10), objašnjavajući video (V28)
 * i reklama (V31) završavaju kao obična montaža (`CreaTimelineV1`, K19) - scene
 * redom, prelaz, naslov, titlovi, glas i logo - koju korisnik izveze na uređaju
 * (0 kr) ili dalje dorađuje u Montaži. Čista funkcija, bez browser API-ja.
 */

export type AutoScene = {
  ref: MediaRef;
  media: "video" | "image";
  /** Koliko scena traje na traci (s). */
  length: number;
  /** Trajanje izvornog videa (video se ne produžava preko kraja). */
  sourceLength?: number;
  /** Redni broj Ken Burns pokreta za fotku (`kenBurnsForIndex`). */
  kenBurnsIndex?: number;
};

export type AutoTitle = {
  text: string;
  start: number;
  end: number;
  style: TitleStyle;
  font?: TitleFont;
  color?: string;
  anim?: TitleItem["anim"];
  rect?: TitleItem["rect"];
};

export type AutoMontageInput = {
  aspect: TimelineAspect;
  scenes: readonly AutoScene[];
  transition?: { kind: TransitionKind; duration: number } | null;
  titles?: readonly AutoTitle[];
  captions?: { cues: CaptionCue[]; style: CaptionStyle; script: CaptionScript } | null;
  /** Glas ispod celog videa (muzika se utišava ispod njega u montaži). */
  voice?: { ref: MediaRef; length: number } | null;
  overlays?: ReadonlyArray<Omit<OverlayClip, "id">>;
};

export function autoMontage(input: AutoMontageInput): CreaTimelineV1 {
  const clips: NewMainClip[] = input.scenes.slice(0, TIMELINE_LIMITS.main).map((scene, index) => {
    const wanted = Math.max(TIMELINE_LIMITS.clipMinS, scene.length);
    if (scene.media === "video") {
      const out = scene.sourceLength && scene.sourceLength > 0 ? Math.min(wanted, scene.sourceLength) : wanted;
      return { src: scene.ref, media: "video", in: 0, out, speed: 1, volumeDb: 0, muted: input.voice ? true : false, fit: "cover" };
    }
    return {
      src: scene.ref,
      media: "image",
      in: 0,
      out: Math.min(wanted, TIMELINE_LIMITS.imageMaxS),
      speed: 1,
      volumeDb: 0,
      muted: false,
      fit: "cover",
      kenBurns: kenBurnsForIndex(scene.kenBurnsIndex ?? index),
    };
  });
  let timeline = addMainClips(emptyTimeline(input.aspect), clips);
  if (input.transition) {
    for (const clip of timeline.main.slice(0, -1)) timeline = setTransition(timeline, clip.id, input.transition.kind, input.transition.duration);
  }
  for (const title of input.titles ?? []) {
    if (!title.text.trim()) continue;
    timeline = addTitle(timeline, {
      text: title.text,
      start: title.start,
      end: title.end,
      style: title.style,
      ...(title.font ? { font: title.font } : {}),
      ...(title.color ? { color: title.color } : {}),
      ...(title.anim ? { anim: title.anim } : {}),
      ...(title.rect ? { rect: title.rect } : {}),
    }).timeline;
  }
  for (const overlay of input.overlays ?? []) timeline = addOverlay(timeline, overlay).timeline;
  if (input.voice) {
    timeline = addAudio(timeline, {
      src: input.voice.ref,
      in: 0,
      out: Math.max(0.2, input.voice.length),
      start: 0,
      volumeDb: 0,
      role: "voice",
      fadeIn: 0,
      fadeOut: 0,
    }).timeline;
  }
  if (input.captions && input.captions.cues.length > 0) timeline = { ...timeline, captions: { ...input.captions } };
  return timeline;
}

/**
 * Dužine scena tako da scena `i` POČNE tačno u `starts[i]` iako prelaz preklapa
 * susede (svaka scena osim poslednje traje duže za trajanje prelaza), a cela
 * montaža traje `total`. Za glas: slika se menja kad narator pređe na novu scenu.
 */
export function sceneLengthsFor(starts: readonly number[], total: number, transition: number): number[] {
  return starts.map((start, index) => {
    const next = starts[index + 1];
    return next === undefined ? Math.max(TIMELINE_LIMITS.clipMinS, total - start) : Math.max(TIMELINE_LIMITS.clipMinS, next - start + transition);
  });
}

/** Početak svake scene na traci (posle prelaza) - za proveru i titlove. */
export function sceneStarts(timeline: CreaTimelineV1): number[] {
  return mainLayout(timeline).map((placement) => placement.start);
}
