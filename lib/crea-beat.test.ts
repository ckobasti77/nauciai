/**
 * „Ubaci i gotovo" (K19, V29): rezovi tačno na udarcima, šabloni i gotova
 * montaža od slika i pesme (promena kadra je na udarcu i kad ima prelaza).
 */
import { describe, expect, test } from "vitest";

import { audioPlan } from "./crea-audio-plan";
import {
  BEAT_IMAGES,
  BEAT_TEMPLATES,
  beatCuts,
  beatPeriod,
  beatTemplateById,
  buildBeatTimeline,
  FALLBACK_BPM,
} from "./crea-beat";
import { mainLayout, parseTimeline, serializeTimeline, timelineDuration, TRANSITION_KINDS } from "./crea-timeline";

const images = (count: number) => Array.from({ length: count }, (_, index) => ({ src: { localFileId: `slika-${String(index).padStart(4, "0")}` } }));

const cutsOf = (...args: Parameters<typeof beatCuts>) => beatCuts(...args).map((value) => Math.round(value * 1e9) / 1e9);

describe("rezovi po ritmu", () => {
  test("120 BPM: rez na svaki udarac (0,5 s) od prvog udarca", () => {
    expect(cutsOf(120, 0.3, 4, 1)).toEqual([0, 0.3, 0.8, 1.3, 1.8]);
    // Prvi udarac pre pola takta → prvi kadar dobija ceo korak više.
    expect(cutsOf(120, 0.1, 2, 1)).toEqual([0, 0.6, 1.1]);
    expect(cutsOf(120, 0, 3, 2)).toEqual([0, 1, 2, 3]);
    // Pomak veći od koraka se svodi na prvi udarac posle početka; prvi kadar prima prelaz.
    expect(cutsOf(120, 2.4, 2, 2)).toEqual([0, 0.4, 1.4]);
    expect(cutsOf(120, 0.6, 2, 2, 0.75)).toEqual([0, 1.6, 2.6]);
  });

  test("BPM van opsega se svodi; bez detektora 120 BPM", () => {
    expect(beatPeriod(1000)).toBeCloseTo(60 / 200, 9);
    expect(beatPeriod(10)).toBeCloseTo(1, 9);
    expect(FALLBACK_BPM).toBe(120);
  });
});

describe("šabloni", () => {
  test("6-8 šablona, jedinstveni, sa tekstovima i poznatim prelazom", () => {
    expect(BEAT_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(BEAT_TEMPLATES.length).toBeLessThanOrEqual(8);
    expect(new Set(BEAT_TEMPLATES.map((template) => template.id)).size).toBe(BEAT_TEMPLATES.length);
    for (const template of BEAT_TEMPLATES) {
      expect(template.label.sr && template.label.en && template.hint.sr && template.hint.en, template.id).toBeTruthy();
      if (template.transition) expect(TRANSITION_KINDS).toContain(template.transition.kind);
      expect(beatTemplateById(template.id)).toBe(template);
    }
  });

  test("svaki šablon pravi ispravnu montažu: promena kadra na udarcu, muzika od početka", () => {
    const bpm = 128;
    const offset = 0.31;
    for (const template of BEAT_TEMPLATES) {
      const timeline = buildBeatTimeline({
        images: images(12),
        song: { src: { jobId: "pesma" }, start: 0, durationS: 200 },
        bpm,
        offset,
        template,
        aspect: "9:16",
        locale: "sr",
      });
      expect(parseTimeline(serializeTimeline(timeline)).ok, template.id).toBe(true);
      expect(timeline.main, template.id).toHaveLength(12);
      const transitionS = template.transition ? template.transition.beats * beatPeriod(bpm) : 0;
      const cuts = beatCuts(bpm, offset, 12, template.cutEvery, transitionS * 1.5);
      const layout = mainLayout(timeline);
      // Sredina prelaza (ili rez) pada tačno na udarac.
      for (let index = 1; index < layout.length; index++) {
        const transition = layout[index].transitionIn?.duration ?? 0;
        expect(layout[index].start + transition / 2, `${template.id} ${index}`).toBeCloseTo(cuts[index], 6);
      }
      expect(timelineDuration(timeline), template.id).toBeCloseTo(cuts[12], 6);
      const music = audioPlan(timeline).segments.find((segment) => segment.role === "music");
      expect(music, template.id).toMatchObject({ at: 0, srcStart: 0 });
      if (template.title) expect(timeline.titles, template.id).toHaveLength(1);
    }
  });

  test("početak pesme i granica broja slika", () => {
    const timeline = buildBeatTimeline({
      images: images(40),
      song: { src: { jobId: "pesma" }, start: 12, durationS: 20 },
      bpm: 100,
      offset: 12.3,
      template: BEAT_TEMPLATES[0],
      aspect: "1:1",
      locale: "en",
    });
    expect(timeline.main).toHaveLength(BEAT_IMAGES.max);
    const music = timeline.audio[0];
    expect(music.in).toBe(12);
    // Pesma (8 s posle početka) je kraća od montaže, pa svira do svog kraja.
    expect(music.out).toBeCloseTo(20, 9);
  });
});
