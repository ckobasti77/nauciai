import { describe, expect, test } from "vitest";

import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { computeCredits } from "@/convex/studioPricing";
import { explainerSceneCount, type AdScript } from "@/convex/creaLlmVideoCore";

import { adAnimationTimeline, adCost, adJobs, adNarration, adVoiceTimeline, logoRect } from "./crea-ad";
import { sceneStarts } from "./crea-auto-montage";
import {
  estimateNarrationSeconds,
  EXPLAINER_STYLE_IDS,
  EXPLAINER_STYLES,
  explainerCost,
  explainerJobs,
  explainerTimeline,
  narrationText,
} from "./crea-explainer";
import { frameAt, parseTimeline, rectInside, serializeTimeline, timelineDuration } from "./crea-timeline";

const model = (slug: string) => STUDIO_MODELS.find((entry) => entry.slug === slug)!;

const plan = {
  title: "Kako AI uči",
  scenes: [
    { narration: "Veštačka inteligencija uči iz primera, kao đak iz zadataka.", visual: "a robot student solving tasks at a school desk", seconds: 15 },
    { narration: "Što više dobrih primera vidi, to bolje pogađa.", visual: "a big stack of example cards", seconds: 15 },
    { narration: "Zato su dobri podaci najvažniji. To je to!", visual: "a shining treasure chest full of data", seconds: 15 },
  ],
};

describe("objašnjavajući video (V28)", () => {
  test("pet stilova, svaki sa nazivom i engleskim fragmentom", () => {
    expect(EXPLAINER_STYLES.map((style) => style.id)).toEqual([...EXPLAINER_STYLE_IDS]);
    for (const style of EXPLAINER_STYLES) {
      expect(style.label.sr.length).toBeGreaterThan(0);
      expect(style.fragment).toMatch(/^[a-z0-9]/);
    }
  });

  test("poslovi: slika po sceni u stilu, bez teksta na slici; JEDAN glas za celu naraciju", () => {
    const jobs = explainerJobs(plan, { styleId: "tabla", aspect: "16:9", voice: "Aria" });
    expect(jobs.images).toHaveLength(3);
    expect(jobs.images[0]!.params.prompt).toContain("chalkboard");
    expect(jobs.images[0]!.params.prompt).toContain("No text");
    expect(jobs.images[0]!.params.aspect_ratio).toBe("16:9");
    expect(jobs.voice.params.text).toBe(narrationText(plan));
    expect(jobs.voice.measured.char_count).toBe(narrationText(plan).length);
    // K29-20: podrazumevani glas je Gemini (Google ključ), ElevenLabs samo kad ga alat izabere.
    expect(jobs.voice.modelSlug).toBe("gemini-tts");
    expect(explainerJobs(plan, { styleId: "tabla", aspect: "16:9", voice: "Aria", voiceSlug: "tts" }).voice.modelSlug).toBe("tts");
  });

  test("cena unapred = slike + glas po znaku, kao server; cena po minutu u cilju 20-50 kr za minut", () => {
    const cost = explainerCost(plan, { styleId: "glina", aspect: "16:9", voice: "Sulafat" }, STUDIO_MODELS);
    const image = computeCredits(model("nano-banana-2-lite").priceRule, {}, "text");
    const voice = computeCredits(model("gemini-tts").priceRule, { char_count: narrationText(plan).length }, "text");
    expect(cost).toMatchObject({ images: 3 * image, voice, total: 3 * image + voice });
    const eleven = computeCredits(model("tts").priceRule, { char_count: narrationText(plan).length }, "text");
    expect(explainerCost(plan, { styleId: "glina", aspect: "16:9", voice: "Aria", voiceSlug: "tts" }, STUDIO_MODELS)).toMatchObject({ voice: eleven, total: 3 * image + eleven });
    // Minut naracije (~840 znakova) sa 3 scene, kako ih plan pravi za 60 s (`explainerSceneCount`).
    const minute = { scenes: Array.from({ length: explainerSceneCount(60) }, () => ({ narration: "x".repeat(279), visual: "y", seconds: 20 })) };
    const perMinute = explainerCost(minute, { styleId: "tabla", aspect: "16:9", voice: "Aria", voiceSlug: "tts" }, STUDIO_MODELS);
    expect(perMinute.seconds).toBe(60);
    expect(perMinute.perMinute).toBeGreaterThanOrEqual(20);
    expect(perMinute.perMinute).toBeLessThanOrEqual(50);
    // Sa Gemini glasom je minut jeftiniji od rezerve (K29-20).
    const geminiMinute = explainerCost(minute, { styleId: "tabla", aspect: "16:9", voice: "Sulafat" }, STUDIO_MODELS);
    expect(geminiMinute.perMinute).toBeLessThan(perMinute.perMinute!);
    expect(explainerCost(plan, { styleId: "tabla", aspect: "16:9", voice: "Aria" }, STUDIO_MODELS.filter((entry) => entry.slug !== "gemini-tts")).total).toBeNull();
  });

  test("montaža: slike prate naratora, titlovi su reči naracije, glas ceo video, „list sveske”", () => {
    const voiceS = estimateNarrationSeconds(plan);
    const timeline = explainerTimeline({
      plan,
      images: [{ jobId: "i1" }, { jobId: "i2" }, { localFileId: "lokalna-slika-3" }],
      voice: { ref: { localFileId: "demo-glas-0001" }, durationS: voiceS },
      aspect: "16:9",
      captions: { style: "karaoke", script: "cyr" },
      title: true,
    });
    expect(timeline.main).toHaveLength(3);
    expect(timeline.main.every((clip) => clip.media === "image" && clip.kenBurns)).toBe(true);
    expect(timeline.transitions.every((transition) => transition.kind === "list-sveske")).toBe(true);
    expect(timeline.audio).toEqual([expect.objectContaining({ role: "voice", start: 0, out: voiceS })]);
    expect(timelineDuration(timeline)).toBeCloseTo(voiceS + 0.6, 6);
    const starts = sceneStarts(timeline);
    const secondSceneWord = timeline.captions!.cues.flatMap((cue) => cue.words).find((word) => word.w === "Što")!;
    expect(starts[1]).toBeCloseTo(secondSceneWord.s, 3);
    expect(timeline.captions?.script).toBe("cyr");
    const plan1 = frameAt(timeline, secondSceneWord.s + 0.05);
    expect(plan1.captions?.lines.flat().map((word) => word.text)).toContain("Што");
    expect(parseTimeline(serializeTimeline(timeline)).ok).toBe(true);
  });
});

const script: AdScript = {
  headline: "Domaći hleb",
  shots: [
    { onScreen: "Topao hleb", narration: "Svako jutro pečemo hleb od domaćeg brašna." },
    { onScreen: "Bez aditiva", narration: "Bez aditiva i bez žurbe, kao kod bake." },
    { onScreen: "Pekara Mika", narration: "Pekara Mika, u srcu Zemuna." },
  ],
  cta: "Svrati danas!",
  animationPrompt: "slow push-in on the bread, steam rising, warm morning light",
};

describe("reklama (V31)", () => {
  test("govorni oglas: jedan glas; animacija: Hailuo iz slike po receptu, bez ljudi i teksta", () => {
    expect(adJobs(script, "govor", "Sulafat")).toEqual([
      { modelSlug: "gemini-tts", inputMode: "text", params: { text: adNarration(script), voice: "Sulafat" }, measured: { char_count: adNarration(script).length } },
    ]);
    expect(adJobs(script, "govor", "Aria", "tts")[0]).toMatchObject({ modelSlug: "tts", params: { voice: "Aria" } });
    const animation = adJobs(script, "animacija", "Aria")[0]!;
    expect(animation).toMatchObject({ modelSlug: "hailuo-23-fast", inputMode: "image", params: { resolution: "768p", duration: "6" } });
    expect(animation.params.prompt).toContain("steam rising");
    expect(animation.params.prompt).toContain("no people");
    expect(adCost(script, "animacija", "Aria", STUDIO_MODELS)).toBe(computeCredits(model("hailuo-23-fast").priceRule, { resolution: "768p", duration: "6" }, "image"));
    expect(adCost(script, "govor", "Sulafat", STUDIO_MODELS)).toBe(computeCredits(model("gemini-tts").priceRule, { char_count: adNarration(script).length }, "text"));
    expect(adCost(script, "govor", "Aria", STUDIO_MODELS, "tts")).toBe(computeCredits(model("tts").priceRule, { char_count: adNarration(script).length }, "text"));
  });

  test("govorni oglas → montaža: kadrovi proizvoda, natpisi u bojama kita, poziv na akciju, logo, glas", () => {
    const timeline = adVoiceTimeline({
      script,
      product: { ref: { jobId: "proizvod" } },
      voice: { ref: { jobId: "glas" }, durationS: 9 },
      logo: { ref: { localFileId: "logo-kita-0001" } },
      kit: { colors: ["#C0392B", "#ffffff"], fonts: { heading: "montserrat", body: "lora" } },
      aspect: "9:16",
    });
    expect(timeline.main).toHaveLength(3);
    expect(timelineDuration(timeline)).toBeCloseTo(11.5, 6);
    expect(timeline.titles.map((title) => title.text)).toEqual(["Topao hleb", "Bez aditiva", "Pekara Mika", "Svrati danas!"]);
    expect(timeline.titles[3]).toMatchObject({ style: "naslov", color: "#c0392b", font: "montserrat", start: 9 });
    expect(timeline.overlay).toEqual([expect.objectContaining({ media: "image", src: { localFileId: "logo-kita-0001" }, start: 0 })]);
    expect(rectInside(timeline.overlay[0]!.rect, { x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(timeline.audio[0]).toMatchObject({ role: "voice", out: 9 });
    expect(parseTimeline(serializeTimeline(timeline)).ok).toBe(true);
  });

  test("animacija → montaža: klip (ili DEMO fotka), naslov na početku, poziv na kraju; logo je kvadrat na ekranu", () => {
    const timeline = adAnimationTimeline({ script, clip: { ref: { jobId: "anim" }, media: "video", durationS: 6 }, logo: null, kit: null, aspect: "1:1" });
    expect(timeline.main).toEqual([expect.objectContaining({ media: "video", out: 6 })]);
    expect(timeline.titles.map((title) => [title.text, title.style])).toEqual([
      ["Domaći hleb", "naslov"],
      ["Svrati danas!", "donja-traka"],
    ]);
    expect(timeline.titles[0]!.color).toBe("#f4be30");
    const demo = adAnimationTimeline({ script, clip: { ref: { jobId: "slika" }, media: "image", durationS: 6 }, logo: null, kit: null, aspect: "9:16" });
    expect(demo.main[0]).toMatchObject({ media: "image" });
    for (const aspect of ["9:16", "16:9", "1:1"] as const) {
      const rect = logoRect(aspect);
      const [w, h] = aspect.split(":").map(Number) as [number, number];
      expect((rect.w * w) / (rect.h * h)).toBeCloseTo(1, 6);
    }
  });
});
