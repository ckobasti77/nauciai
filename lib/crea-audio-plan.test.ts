/**
 * Zvuk montaže (K19, V24): segmenti po klipovima, brzina → `rate`, prelazi kao
 * pretapanje zvuka, muzika se seče na kraju, i kriva utišavanja muzike ispod
 * govora na sintetičkom signalu (govor 1–3 s → muzika −12 dB sa napadom i otpuštanjem).
 */
import { describe, expect, test } from "vitest";

import {
  audioPlan,
  dbToGain,
  decodeRanges,
  duckingEnvelope,
  gainToDb,
  hasAudible,
  leadingSilenceS,
  masterFixForPeak,
  MICRO_FADE_S,
  peakDb,
  rmsFrames,
} from "./crea-audio-plan";
import { addAudio, addMainClips, addOverlay, emptyTimeline, setTransition, type NewMainClip } from "./crea-timeline";

const clip = (jobId: string, length: number, extra: Partial<NewMainClip> = {}): NewMainClip => ({
  src: { jobId },
  media: "video",
  in: 0,
  out: length,
  speed: 1,
  volumeDb: 0,
  muted: false,
  fit: "cover",
  ...extra,
});

describe("plan zvuka", () => {
  test("klipovi redom, prelaz je pretapanje zvuka, rez dobija mikro-pretapanje", () => {
    let timeline = addMainClips(emptyTimeline(), [clip("a", 4), clip("b", 4, { volumeDb: -6 }), clip("c", 2)]);
    timeline = setTransition(timeline, "k-1", "pretapanje", 1);
    const plan = audioPlan(timeline);
    expect(plan.duration).toBe(9);
    expect(plan.segments.map((segment) => [segment.clipId, segment.at, segment.fadeIn, segment.fadeOut, segment.gainDb])).toEqual([
      ["k-1", 0, MICRO_FADE_S, 1, 0],
      ["k-2", 3, 1, MICRO_FADE_S, -6],
      ["k-3", 7, MICRO_FADE_S, MICRO_FADE_S, 0],
    ]);
  });

  test("brzina 0,5–2× ide kroz rate; van opsega, rampa, unazad i isključen klip su tihi", () => {
    const timeline = addMainClips(emptyTimeline(), [
      clip("a", 4, { speed: 2 }),
      clip("b", 4, { speed: 3 }),
      clip("c", 4, { speedKeys: [{ u: 0, v: 1 }, { u: 1, v: 2 }] }),
      clip("d", 4, { reverse: true }),
      clip("e", 4, { muted: true }),
      clip("f", 2, { boomerang: true }),
    ]);
    const segments = audioPlan(timeline).segments;
    expect(segments.map((segment) => [segment.clipId, segment.rate])).toEqual([
      ["k-1", 2],
      ["k-6", 1],
    ]);
    // Bumerang: zvuk samo napred (2 s od ukupno 4 s), uz kratko utišavanje pred deo unazad.
    expect(segments[1]).toMatchObject({ srcStart: 0, srcEnd: 2 });
    expect(segments[1].fadeOut).toBeLessThanOrEqual(0.5);
  });

  test("muzika duža od videa se seče na kraju; govor i muzika uključuju utišavanje", () => {
    let timeline = addMainClips(emptyTimeline(), [clip("a", 5, { isVoice: true })]);
    timeline = addAudio(timeline, { src: { jobId: "song" }, in: 10, out: 70, start: 1, volumeDb: -4, role: "music", fadeIn: 0, fadeOut: 2 }).timeline;
    const plan = audioPlan(timeline);
    const music = plan.segments.find((segment) => segment.role === "music")!;
    expect(music).toMatchObject({ at: 1, srcStart: 10, srcEnd: 14 });
    expect(plan.segments.find((segment) => segment.clipId === "k-1")?.role).toBe("voice");
    expect(plan.duck).toEqual({ amountDb: -12 });
    expect(audioPlan({ ...timeline, mix: { ...timeline.mix, duck: { on: false, amountDb: -12 } } }).duck).toBeNull();
    expect(audioPlan(addMainClips(emptyTimeline(), [clip("a", 5)])).duck).toBeNull();
  });

  test("slika u slici sa zvukom ulazi u miks; delovi izvora se spajaju za dekodiranje", () => {
    let timeline = addMainClips(emptyTimeline(), [clip("a", 4), clip("a", 4, { in: 3, out: 6 })]);
    timeline = addOverlay(timeline, {
      src: { jobId: "pip" },
      media: "video",
      in: 0,
      out: 2,
      start: 1,
      rect: { x: 0.5, y: 0.5, w: 0.3, h: 0.3 },
      volumeDb: -3,
      muted: false,
    }).timeline;
    const plan = audioPlan(timeline);
    expect(plan.segments.some((segment) => segment.clipId === "p-1")).toBe(true);
    const ranges = decodeRanges(plan, 0);
    expect(ranges.get("job:a")?.ranges).toEqual([[0, 6]]);
    expect(ranges.get("job:pip")?.ranges).toEqual([[0, 2]]);
  });
});

describe("utišavanje ispod govora", () => {
  const hop = 0.01;
  /** Sintetički RMS: tišina, govor od 1 do 3 s (sa pauzom od 100 ms između reči), tišina. */
  function speechRms(): Float32Array {
    const rms = new Float32Array(500);
    for (let index = 0; index < rms.length; index++) {
      const t = index * hop;
      const speaking = t >= 1 && t < 3 && !(t >= 2 && t < 2.1);
      rms[index] = speaking ? dbToGain(-20) : dbToGain(-70);
    }
    return rms;
  }

  test("muzika pada na −12 dB dok traje govor, a vraća se posle", () => {
    const envelope = duckingEnvelope(speechRms(), hop, { amountDb: -12 });
    const at = (t: number) => gainToDb(envelope[Math.round(t / hop)]);
    expect(at(0.5)).toBeCloseTo(0, 3);
    // Napad ~80 ms: posle 150 ms već je skoro dole.
    expect(at(1.15)).toBeLessThan(-10);
    expect(at(1.5)).toBeCloseTo(-12, 1);
    // Pauza od 100 ms između reči ne vraća muziku (zadržavanje 200 ms).
    expect(at(2.08)).toBeLessThan(-11);
    // Posle govora: još drži (200 ms), pa se postepeno vraća; posle ~1 s je skoro puna jačina.
    expect(at(3.1)).toBeLessThan(-11);
    expect(at(3.3)).toBeGreaterThan(-11);
    expect(at(3.3)).toBeLessThan(-1);
    expect(at(4)).toBeGreaterThan(-1);
    // Kriva je uvek između −12 dB i 0 dB.
    for (const value of envelope) {
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeGreaterThanOrEqual(dbToGain(-12) - 1e-6);
    }
  });

  test("bez govora kriva je ravna", () => {
    const silent = new Float32Array(200).fill(dbToGain(-80));
    expect(Array.from(duckingEnvelope(silent, hop)).every((value) => value === 1)).toBe(true);
  });
});

describe("mere miksa", () => {
  test("RMS, vrh, tišina na početku i popravka jačine", () => {
    const sampleRate = 1000;
    const samples = new Float32Array(3000);
    for (let index = 1500; index < 3000; index++) samples[index] = Math.sin(index / 5) * 0.95;
    const rms = rmsFrames([samples], sampleRate, 0.01);
    expect(rms).toHaveLength(300);
    expect(leadingSilenceS(rms, 0.01)).toBeCloseTo(1.5, 5);
    expect(hasAudible(rms)).toBe(true);
    expect(hasAudible(new Float32Array(10))).toBe(false);
    const peak = peakDb([samples]);
    expect(peak).toBeGreaterThan(-1);
    expect(peak).toBeLessThan(0);
    const fixed = masterFixForPeak(peak, 0);
    expect(peak + fixed).toBeLessThanOrEqual(-1);
    expect(masterFixForPeak(-6, -2)).toBe(-2);
    expect(peakDb([new Float32Array(4)])).toBe(-Infinity);
  });
});
