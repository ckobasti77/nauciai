import { describe, expect, test } from "vitest";

import { studioModelBySlug } from "@/convex/providers/catalogModels";
import { falMapOf, falParams } from "@/convex/providers/falInputs";
import { computeCredits } from "@/convex/studioPricing";

import {
  elevenMinutes,
  loopCrossfade,
  musicCredits,
  musicJob,
  musicProblem,
  musicPrompt,
  musicTemplate,
  MUSIC_ENGINE_LIST,
  nextSectionId,
  repeatLoop,
  sanitizeMusicDoc,
  totalSeconds,
  type MusicDoc,
} from "./crea-music";

const catalog = MUSIC_ENGINE_LIST.map((engine) => studioModelBySlug(engine.modelSlug)!);

function song(): MusicDoc {
  const doc = musicTemplate("pesma");
  return {
    ...doc,
    style: "Pop sa akustičnom gitarom",
    mood: "vedro",
    sections: doc.sections.map((section) =>
      section.kind === "strofa"
        ? { ...section, text: "Jutro miriše na kafu\nSunce viri kroz prozor" }
        : section.kind === "refren"
          ? { ...section, text: "Hajde, hajde, pevaj sa mnom" }
          : section,
    ),
  };
}

describe("pesma po delovima (A11)", () => {
  test("šablon pesme: uvod, strofa, refren, strofa, refren, kraj = 104 s", () => {
    const doc = song();
    expect(doc.sections.map((section) => section.kind)).toEqual(["uvod", "strofa", "refren", "strofa", "refren", "kraj"]);
    expect(totalSeconds(doc)).toBe(104);
    expect(nextSectionId(doc)).toBe("d7");
  });

  test("opis: stil, raspoloženje, tempo, pa delovi sa oznakama, vremenima i tekstom", () => {
    const prompt = musicPrompt(song(), "eleven");
    expect(prompt.startsWith("Pop sa akustičnom gitarom. Mood: bright, happy. Tempo: about 100 BPM.")).toBe(true);
    expect(prompt).toContain("Structure (total 1:44):");
    expect(prompt).toContain("[0:00 - 0:08] [Intro] (instrumental)");
    expect(prompt).toContain("[0:08 - 0:32] [Verse 1]\nJutro miriše na kafu\nSunce viri kroz prozor");
    expect(prompt).toContain("[0:32 - 0:52] [Chorus 1]\nHajde, hajde, pevaj sa mnom");
    expect(prompt).toContain("[Verse 2]");
    expect(prompt).toContain("[1:36 - 1:44] [Outro] (instrumental)");
  });

  test("instrumental i petlja idu u opis; Lyria klip (30 s) ne dobija vremena koja ne staju", () => {
    const loop = { ...musicTemplate("petlja"), style: "Lo-fi hip hop" };
    const prompt = musicPrompt(loop, "lyria-clip");
    expect(prompt).toContain("Instrumental only, no vocals.");
    expect(prompt).toContain("Seamless loop");
    expect(prompt).not.toContain("Structure");
    const songForClip = musicPrompt(song(), "lyria-clip");
    expect(songForClip).toContain("[Verse 1]");
    expect(songForClip).not.toMatch(/\[0:00 - /);
    const instrumental = { ...musicTemplate("podloga"), style: "Orkestar", sections: [{ id: "d1", kind: "refren" as const, text: "veliki bubnjevi", seconds: 20 }] };
    expect(musicPrompt(instrumental, "lyria-song")).toContain("[0:00 - 0:20] [Chorus] (instrumental: veliki bubnjevi)");
  });

  test("muzika po delovima pravi posao sa ISPRAVNOM cenom: ElevenLabs po započetom minutu, Lyria po pesmi", () => {
    const doc = song();
    // 104 s = 2 započeta minuta (C0: fal zaokružuje naviše) → 2 × 130 kr.
    expect(elevenMinutes(doc)).toBe(2);
    expect(musicJob(doc, "eleven")).toEqual({ modelSlug: "music", inputMode: "text", params: { prompt: musicPrompt(doc, "eleven"), minutes: 2 } });
    expect(musicCredits(doc, "eleven", catalog)).toBe(260);
    expect(musicCredits(doc, "eleven", catalog)).toBe(computeCredits(studioModelBySlug("music")!.priceRule, { minutes: 2 }, "text"));
    // fal pravi baš toliko: minuti → `music_length_ms`.
    expect(falParams(musicJob(doc, "eleven").params, falMapOf(studioModelBySlug("music")!.capabilities))).toMatchObject({ music_length_ms: 120_000 });
    expect(musicCredits(doc, "lyria-song", catalog)).toBe(18);
    const jingle = { ...musicTemplate("dzingl"), style: "Radio džingl" };
    expect(totalSeconds(jingle)).toBe(17);
    expect(musicCredits(jingle, "lyria-clip", catalog)).toBe(9);
    // Kratka pesma na ElevenLabs-u je i dalje 1 ceo minut.
    expect(musicCredits(jingle, "eleven", catalog)).toBe(130);
    expect(musicJob(jingle, "lyria-clip").params).toEqual({ prompt: musicPrompt(jingle, "lyria-clip") });
  });

  test("problemi pre plaćanja: prazno, predugo za klip, preko 5 min, predug opis", () => {
    expect(musicProblem(musicTemplate("pesma"), "lyria-song")).toBe("PRAZNO");
    expect(musicProblem(song(), "lyria-clip")).toBe("PREDUGO_ZA_KLIP");
    expect(musicProblem(song(), "lyria-song")).toBeNull();
    const long = { ...song(), sections: Array.from({ length: 6 }, (_, index) => ({ id: `d${index + 1}`, kind: "strofa" as const, text: "la", seconds: 60 })) };
    expect(musicProblem(long, "eleven")).toBe("PREDUGO");
    const wordy = { ...song(), sections: Array.from({ length: 12 }, (_, index) => ({ id: `d${index + 1}`, kind: "strofa" as const, text: "reč ".repeat(150), seconds: 10 })) };
    expect(musicProblem(wordy, "eleven")).toBe("PREDUG_OPIS");
  });

  test("nacrt sa uređaja: nepoznati delovi i vrednosti se odbacuju", () => {
    const doc = song();
    expect(sanitizeMusicDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(sanitizeMusicDoc({ v: 2 })).toBeNull();
    const dirty = sanitizeMusicDoc({ ...doc, mood: "ljuto", tempo: "turbo", sections: [{ id: "x", kind: "refren" }, { id: "d1", kind: "nesto" }, { id: "d2", kind: "most", seconds: 999, text: 5 }] })!;
    expect(dirty.mood).toBeNull();
    expect(dirty.tempo).toBe("srednje");
    expect(dirty.sections).toEqual([{ id: "d2", kind: "most", text: "", seconds: 120 }]);
  });
});

describe("petlja na uređaju (0 kr)", () => {
  test("spoj je neprekidan: kraj petlje + početak = susedni uzorci originala; kraće za pretapanje", () => {
    const rate = 100;
    const ramp = new Float32Array(1000).map((_, index) => index);
    const [loop] = loopCrossfade([ramp], rate, 1);
    expect(loop!.length).toBe(900);
    // Početak petlje je prvi uzorak pretapanja (900), kraj je uzorak tačno pre njega (899).
    expect(loop![0]).toBeCloseTo(900, 5);
    expect(loop![loop!.length - 1]).toBe(899);
    // Sredina je netaknuta.
    expect(loop![500]).toBe(500);
  });

  test("konstantan signal ostaje bez rupe u jačini (jednaka snaga); ponavljanje N puta", () => {
    const flat = new Float32Array(600).fill(0.5);
    const [loop] = loopCrossfade([flat], 100, 1);
    expect(Math.min(...loop!)).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(repeatLoop([new Float32Array([1, 2])], 3)[0]).toEqual(new Float32Array([1, 2, 1, 2, 1, 2]));
    expect(loopCrossfade([new Float32Array(2)], 100, 1)[0]!.length).toBe(2);
  });
});
