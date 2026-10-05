import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";
import { computeCredits } from "@/convex/studioPricing";
import { parseStoryboardSettings, sanitizeShots, SHOT_TYPE_INFO, SHOT_TYPES, storyboardJobIds, type StoryShot } from "@/convex/creaStoryboardsCore";

import { autoMontage, sceneLengthsFor, sceneStarts } from "./crea-auto-montage";
import {
  shotImageJob,
  shotVideoJob,
  shotVideoSeconds,
  storyboardCost,
  storyboardTimeline,
  STORYBOARD_QUALITY,
  type StoryElement,
} from "./crea-storyboard";
import { parseTimeline, serializeTimeline, timelineDuration } from "./crea-timeline";

const model = (slug: string) => STUDIO_MODELS.find((entry) => entry.slug === slug)!;

const shot = (extra: Partial<StoryShot> = {}): StoryShot => ({
  caption: "Maja otvara prozor.",
  shotType: "srednji",
  imagePrompt: "@maja opens a window at sunrise",
  motionPrompt: "curtains move in the breeze",
  move: "priblizavanje",
  durationS: 5,
  elements: ["maja"],
  ...extra,
});

const maja: StoryElement = {
  id: "el1",
  kind: "lik",
  name: "Maja",
  handle: "maja",
  description: "devojčica sa kikama",
  images: [
    { storageId: "s1", mime: "image/jpeg", size: 1 },
    { storageId: "s2", mime: "image/jpeg", size: 1 },
  ],
};

describe("kadrovi", () => {
  test("svaka vrsta kadra ima ime, lekciju (≤ 160) i englesku frazu", () => {
    expect(SHOT_TYPES.length).toBeGreaterThanOrEqual(6);
    for (const id of SHOT_TYPES) {
      expect(SHOT_TYPE_INFO[id].label.sr.length).toBeGreaterThan(0);
      expect(SHOT_TYPE_INFO[id].lesson.en.length).toBeLessThanOrEqual(160);
      expect(SHOT_TYPE_INFO[id].phrase).toMatch(/^[a-z]/);
    }
  });

  test("sređivanje kadrova, poslovi i podešavanja", () => {
    const shots = sanitizeShots([shot({ imageJobId: "j1", videoJobId: "j2" }), { caption: "" }, shot({ imageJobId: "j1" })], ["maja"]);
    expect(shots).toHaveLength(2);
    expect(storyboardJobIds(shots)).toEqual(["j1", "j2"]);
    expect(parseStoryboardSettings("nije json")).toEqual({ styleId: null, aspect: "9:16", quality: "jeftino", elementIds: [] });
    expect(parseStoryboardSettings(JSON.stringify({ aspect: "16:9", quality: "lepse", elementIds: ["a", 1] }))).toMatchObject({ aspect: "16:9", quality: "lepse", elementIds: ["a"] });
  });
});

describe("poslovi slike i videa", () => {
  test("prvi kadar: Lik kao referenca, vrsta kadra i stil u opisu, @maja postaje „Maja”", () => {
    const job = shotImageJob({ shot: shot(), quality: "jeftino", aspect: "9:16", styleFragment: "35mm analog film photo", elements: [maja], model: model("nano-banana-2-lite"), withFirstShot: false });
    expect(job.modelSlug).toBe("nano-banana-2-lite");
    expect(job.inputMode).toBe("image_multi");
    expect(job.images).toEqual([
      { kind: "lik", storageId: "s1" },
      { kind: "lik", storageId: "s2" },
    ]);
    expect(job.params.prompt).toContain("medium shot from the waist up: Maja opens a window");
    expect(job.params.prompt).toContain("35mm analog film photo");
    expect(job.params.prompt).toContain("Images 1-2 show Maja");
    expect(job.params.prompt).not.toContain("@maja");
    const lite = model("nano-banana-2-lite");
    expect(sanitizeSpecParams(lite.paramSpec, lite.priceRule, job.params, job.inputMode)).toMatchObject({ ok: true, params: { aspect_ratio: "9:16" } });
  });

  test("kadrovi 2..N: slika prvog kadra je slika 1, Lik posle nje", () => {
    const job = shotImageJob({ shot: shot(), quality: "lepse", aspect: "16:9", styleFragment: null, elements: [maja], model: model("nano-banana-2"), withFirstShot: true });
    expect(job.images[0]).toEqual({ kind: "prvi-kadar" });
    expect(job.params.prompt).toContain("Images 2-3 show Maja");
    expect(job.params.prompt).toContain("Image 1 is the first frame of the same film");
    expect(job.params.resolution).toBe("1K");
  });

  test("kadar bez Likova i bez prvog kadra je samo opis", () => {
    const job = shotImageJob({ shot: shot({ elements: [] }), quality: "jeftino", aspect: "1:1", styleFragment: null, elements: [maja], model: model("nano-banana-2-lite"), withFirstShot: false });
    expect(job.inputMode).toBe("text");
    expect(job.images).toEqual([]);
  });

  test("video: pokret iz kadra u opisu, trajanje svedeno na vrednosti modela (Hailuo 6/10, Veo 4-8)", () => {
    const cheap = shotVideoJob(shot({ durationS: 9 }), "jeftino", model("hailuo-23-fast"));
    expect(cheap.params).toMatchObject({ resolution: "768p", duration: "10" });
    expect(cheap.params.prompt).toContain("curtains move in the breeze");
    expect(shotVideoSeconds(cheap, 5)).toBe(10);
    const nice = shotVideoJob(shot({ durationS: 10 }), "lepse", model("veo-31-lite"));
    expect(nice.params).toMatchObject({ resolution: "720p", duration: 8 });
    const veo = model("veo-31-lite");
    expect(sanitizeSpecParams(veo.paramSpec, veo.priceRule, nice.params, "image")).toMatchObject({ ok: true, params: { duration: 8 } });
    const hailuo = model("hailuo-23-fast");
    expect(sanitizeSpecParams(hailuo.paramSpec, hailuo.priceRule, cheap.params, "image")).toMatchObject({ ok: true, params: { duration: "10" } });
  });
});

describe("cena unapred", () => {
  test("zbir cena slika i videa = isto što server naplaćuje po poslu", () => {
    const shots = [shot({ durationS: 5 }), shot({ durationS: 9 }), shot({ durationS: 4 })];
    const cost = storyboardCost(shots, "jeftino", STUDIO_MODELS);
    const image = computeCredits(model("nano-banana-2-lite").priceRule, {}, "text");
    const video6 = computeCredits(model("hailuo-23-fast").priceRule, { resolution: "768p", duration: "6" }, "image");
    const video10 = computeCredits(model("hailuo-23-fast").priceRule, { resolution: "768p", duration: "10" }, "image");
    expect(cost.images).toBe(3 * image);
    expect(cost.videos).toBe(video6 + video10 + video6);
    expect(cost.total).toBe(cost.images! + cost.videos!);
    expect(storyboardCost(shots, "lepse", STUDIO_MODELS.filter((entry) => entry.slug !== STORYBOARD_QUALITY.lepse.video.slug)).total).toBeNull();
  });
});

describe("automatska montaža", () => {
  test("scena počinje tačno u svom trenutku iako prelaz preklapa susede", () => {
    const lengths = sceneLengthsFor([0, 4, 9], 15, 0.5);
    const timeline = autoMontage({
      aspect: "16:9",
      scenes: lengths.map((length, index) => ({ ref: { jobId: `j${index}` }, media: "image" as const, length })),
      transition: { kind: "list-sveske", duration: 0.5 },
    });
    expect(sceneStarts(timeline).map((value) => Math.round(value * 1000) / 1000)).toEqual([0, 4, 9]);
    expect(timelineDuration(timeline)).toBeCloseTo(15, 6);
  });

  test("strip → film: video kadrovi, DEMO kadar kao fotka sa Ken Burnsom, pretapanje, naslov i potpisi kao titlovi", () => {
    const timeline = storyboardTimeline({
      title: "Ključ",
      aspect: "9:16",
      shots: [
        { caption: "Sve počinje jutrom.", durationS: 5, source: { kind: "video", ref: { jobId: "v1" }, durationS: 6 } },
        { caption: "DEMO kadar.", durationS: 5, source: { kind: "image", ref: { jobId: "i2" } } },
        { caption: "Bez slike.", durationS: 5, source: null },
        { caption: "Kraj.", durationS: 4, source: { kind: "video", ref: { jobId: "v4" }, durationS: 4 } },
      ],
      captions: true,
    });
    expect(timeline.main.map((clip) => clip.media)).toEqual(["video", "image", "video"]);
    expect(timeline.main[1]!.kenBurns).toBeDefined();
    expect(timeline.transitions.map((transition) => transition.kind)).toEqual(["pretapanje", "pretapanje"]);
    expect(timelineDuration(timeline)).toBeCloseTo(6 + 5 + 4 - 0.6, 6);
    expect(timeline.titles[0]).toMatchObject({ text: "Ključ", style: "rukopis", start: 0, end: 2 });
    expect(timeline.captions?.cues.map((cue) => cue.words.map((word) => word.w).join(" "))).toEqual(["Sve počinje jutrom.", "DEMO kadar.", "Kraj."]);
    const kraj = timeline.captions!.cues[2]!;
    expect(kraj.start).toBeGreaterThanOrEqual(6 + 5 - 0.6);
    expect(parseTimeline(serializeTimeline(timeline)).ok).toBe(true);
  });
});
