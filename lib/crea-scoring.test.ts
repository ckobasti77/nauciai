import { describe, expect, test } from "vitest";

import { studioModelBySlug } from "@/convex/providers/catalogModels";

import { audioPlan } from "./crea-audio-plan";
import { scoringCost, scoringEngine, scoringJob, scoringTimeline } from "./crea-scoring";

const catalog = ["lyria-3-clip", "lyria-35", "kling-v2a"].map((slug) => studioModelBySlug(slug)!);
const tracks = [
  { title: "Mirno", prompt: "Calm piano, 80 BPM" },
  { title: "Brzo", prompt: "Upbeat pop, 120 BPM. Instrumental only, no vocals." },
  { title: "Film", prompt: "Cinematic strings" },
  { title: "Igra", prompt: "Playful ukulele" },
];

describe("ozvuči moj video (A12)", () => {
  test("klip do 30 s dobija Lyria klip, duži celu pesmu; numera je uvek bez glasa", () => {
    expect(scoringEngine(12)).toBe("lyria-clip");
    expect(scoringEngine(30)).toBe("lyria-clip");
    expect(scoringEngine(31)).toBe("lyria-song");
    expect(scoringJob(tracks[0]!, 12)).toEqual({ modelSlug: "lyria-3-clip", inputMode: "text", params: { prompt: "Calm piano, 80 BPM. Instrumental only, no vocals." } });
    expect(scoringJob(tracks[1]!, 60).params.prompt).toBe("Upbeat pop, 120 BPM. Instrumental only, no vocals.");
  });

  test("cena: 4 numere po ceni modela + efekti iz slike (Kling) po želji", () => {
    expect(scoringCost(tracks, 20, false, catalog)).toEqual({ tracks: 36, effects: 0, total: 36 });
    expect(scoringCost(tracks, 45, true, catalog)).toEqual({ tracks: 72, effects: 8, total: 80 });
    expect(scoringCost(tracks, 20, true, [studioModelBySlug("lyria-3-clip")!]).total).toBeNull();
  });

  test("montaža: video kao govor, numera ponovljena do kraja klipa, efekti; muzika se utišava ispod govora", () => {
    const timeline = scoringTimeline({
      video: { jobId: "v1" },
      videoS: 70,
      aspect: "9:16",
      hasSpeech: true,
      music: { ref: { localFileId: "muzika-001" }, seconds: 30 },
      effects: { ref: { jobId: "fx" }, seconds: 70 },
      musicDb: -6,
      effectsDb: -3,
    });
    expect(timeline.main).toHaveLength(1);
    expect(timeline.main[0]).toMatchObject({ isVoice: true, in: 0, out: 70 });
    const music = timeline.audio.filter((clip) => clip.role === "music");
    expect(music.map((clip) => [clip.start, clip.out])).toEqual([
      [0, 30],
      [30, 30],
      [60, 10],
    ]);
    expect(timeline.audio.find((clip) => clip.role === "sfx")).toMatchObject({ start: 0, out: 70, volumeDb: -3 });
    expect(audioPlan(timeline).duck).toEqual({ amountDb: -12 });
    // Bez govora nema šta da se utišava.
    const silent = scoringTimeline({ video: { jobId: "v1" }, videoS: 10, aspect: "16:9", hasSpeech: false, music: { ref: { jobId: "m" }, seconds: 30 }, effects: null, musicDb: 0, effectsDb: 0 });
    expect(silent.audio).toHaveLength(1);
    expect(audioPlan(silent).duck).toBeNull();
  });
});
