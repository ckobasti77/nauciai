import type { ScoreTrack } from "@/convex/creaLlmSoundCore";
import { jobCredits, type PricedModel } from "./crea-job-price";
import { musicEngine, type MusicEngineId, type MusicJob } from "./crea-music";
import { addAudio, addMainClips, emptyTimeline, type CreaTimelineV1, type MediaRef, type TimelineAspect } from "./crea-timeline";

/**
 * „Ozvuči moj video" (Crea K23, A12): jeftin opis klipa (0 kr, `creaLlm.planScore`)
 * → 4 predloga muzike → 4 numere (Lyria) + po želji efekti iz slike (`kling-v2a`)
 * → izabrana numera ide u montažu sa originalnim zvukom kao govorom, pa je K19
 * miks (`OfflineAudioContext`) utiša ispod govora. Čiste funkcije: izbor motora,
 * poslovi, cena i vremenska linija.
 */

export const SCORE_TRACK_COUNT = 4;

/** Klip do 30 s dobija Lyria klip (30 s, 9 kr), duži celu pesmu (~2 min, 18 kr). */
export function scoringEngine(videoS: number): Extract<MusicEngineId, "lyria-clip" | "lyria-song"> {
  return videoS <= 30 ? "lyria-clip" : "lyria-song";
}

const NO_VOCALS = "Instrumental only, no vocals.";

/** Posao numere iz predloga: uvek bez glasa (govor iz klipa ne sme da se tuče sa pesmom). */
export function scoringJob(track: ScoreTrack, videoS: number): MusicJob {
  const engine = musicEngine(scoringEngine(videoS));
  const prompt = track.prompt.trim().replace(/[.\s]*$/, ".");
  return {
    modelSlug: engine.modelSlug,
    inputMode: "text",
    params: { prompt: /no vocals/i.test(prompt) ? prompt : `${prompt} ${NO_VOCALS}` },
  };
}

export type ScoringCost = { tracks: number | null; effects: number | null; total: number | null };

/** Cena 4 numere i efekata - ista računica kao server (Lyria po pesmi, efekti po generaciji). */
export function scoringCost(tracks: readonly ScoreTrack[], videoS: number, withEffects: boolean, catalog: readonly PricedModel[]): ScoringCost {
  let sum: number | null = 0;
  for (const track of tracks.slice(0, SCORE_TRACK_COUNT)) {
    const job = scoringJob(track, videoS);
    const price = jobCredits({ modelSlug: job.modelSlug, inputMode: job.inputMode, params: job.params, measured: {} }, catalog);
    sum = price === null || sum === null ? null : sum + price;
  }
  const effects = withEffects ? jobCredits({ modelSlug: "kling-v2a", inputMode: "video", params: { prompt: "" }, measured: {} }, catalog) : 0;
  return { tracks: sum, effects, total: sum === null || effects === null ? null : sum + effects };
}

export type ScoringMix = {
  video: MediaRef;
  videoS: number;
  aspect: TimelineAspect;
  /** Originalni zvuk klipa je govor: muzika se utišava ispod njega. */
  hasSpeech: boolean;
  music: { ref: MediaRef; seconds: number } | null;
  effects: { ref: MediaRef; seconds: number } | null;
  musicDb: number;
  effectsDb: number;
};

/** Pretapanje numere na početku i kraju klipa (s). */
export const SCORE_FADE_S = 1;

/**
 * Montaža ozvučenog klipa: video (njegov zvuk kao govor kad ga ima), numera od
 * početka - ponovljena dok ne pokrije klip - i efekti. Utišavanje ispod govora je
 * uključeno (K19, `DEFAULT_MIX`), pa ga pregled i izvoz rade isto.
 */
export function scoringTimeline(input: ScoringMix): CreaTimelineV1 {
  let timeline = addMainClips(emptyTimeline(input.aspect), [
    { src: input.video, media: "video", in: 0, out: input.videoS, speed: 1, volumeDb: 0, muted: false, isVoice: input.hasSpeech, fit: "cover" },
  ]);
  if (input.music && input.music.seconds > 0.5) {
    let at = 0;
    while (at < input.videoS - 0.2) {
      const length = Math.min(input.music.seconds, input.videoS - at);
      const first = at === 0;
      const last = at + length >= input.videoS - 0.2;
      const added = addAudio(timeline, {
        src: input.music.ref,
        in: 0,
        out: length,
        start: at,
        volumeDb: input.musicDb,
        role: "music",
        fadeIn: first ? Math.min(SCORE_FADE_S, length / 4) : 0.3,
        fadeOut: last ? Math.min(SCORE_FADE_S * 1.5, length / 3) : 0.3,
      });
      if (!added.id) break;
      timeline = added.timeline;
      at += length;
    }
  }
  if (input.effects && input.effects.seconds > 0.2) {
    const length = Math.min(input.effects.seconds, input.videoS);
    timeline = addAudio(timeline, { src: input.effects.ref, in: 0, out: length, start: 0, volumeDb: input.effectsDb, role: "sfx", fadeIn: 0.05, fadeOut: 0.3 }).timeline;
  }
  return timeline;
}
