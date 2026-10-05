import { describe, expect, test } from "vitest";

import {
  buildAdRequest,
  buildExplainerRequest,
  buildMomentsRequest,
  buildStoryboardRequest,
  cleanMoments,
  demoAd,
  demoExplainer,
  demoMoments,
  demoStoryboard,
  explainerSceneCount,
  LLM_OUTPUT_TOKENS,
  parseAdResponse,
  parseExplainerResponse,
  parseMomentsResponse,
  parseStoryboardResponse,
} from "./creaLlmVideoCore";
import { STORYBOARD_LIMITS } from "./creaStoryboardsCore";
import type { TranscriptSentence } from "./creaTranscriptsCore";

/** Odgovor Gemini-ja sa datim JSON-om (po želji umotan u ```json ograde). */
function reply(json: unknown, fenced = false) {
  const text = JSON.stringify(json);
  return { candidates: [{ content: { parts: [{ text: fenced ? "```json\n" + text + "\n```" : text }] } }] };
}

const shot = (extra: Record<string, unknown> = {}) => ({
  caption: "Maja otvara prozor.",
  shotType: "srednji",
  imagePrompt: "@maja opens a window at sunrise",
  motionPrompt: "curtains move in the breeze",
  move: "priblizavanje",
  durationS: 5,
  elements: ["@maja"],
  ...extra,
});

describe("strip (V10)", () => {
  test("dobar odgovor u ogradama: kadrovi, Likovi kao handle, poznat pokret", () => {
    const plan = parseStoryboardResponse(reply({ title: "Jutro", shots: [shot(), shot(), shot()] }, true), { shots: 3, handles: ["maja"] });
    expect(plan?.title).toBe("Jutro");
    expect(plan?.shots).toHaveLength(3);
    expect(plan?.shots[0]).toMatchObject({ shotType: "srednji", move: "priblizavanje", durationS: 5, elements: ["maja"] });
  });

  test("višak kadrova se odseca, nepoznat pokret je „staticno”, trajanje u 3-10 s, nepoznat Lik i vrsta kadra se sređuju", () => {
    const shots = Array.from({ length: 11 }, (_, index) =>
      shot({ move: index === 0 ? "teleportacija" : "dron-uspon", durationS: index === 1 ? 40 : 1, shotType: index === 2 ? "megaplan" : "krupni", elements: ["@nepoznat"] }),
    );
    const plan = parseStoryboardResponse(reply({ title: "", shots }), { shots: 6, handles: ["maja"] })!;
    expect(plan.shots).toHaveLength(6);
    expect(plan.shots[0]!.move).toBe("staticno");
    expect(plan.shots[1]!.durationS).toBe(STORYBOARD_LIMITS.durationMax);
    expect(plan.shots[3]!.durationS).toBe(STORYBOARD_LIMITS.durationMin);
    expect(plan.shots[2]!.shotType).toBe("srednji");
    expect(plan.shots.every((entry) => entry.elements.length === 0)).toBe(true);
    expect(plan.title).toBe("Moj film");
  });

  test("manje od 3 kadra, prazno ili neispravno = `null`", () => {
    expect(parseStoryboardResponse(reply({ title: "x", shots: [shot(), shot()] }), { shots: 3, handles: [] })).toBeNull();
    expect(parseStoryboardResponse(reply({ title: "x" }), { shots: 3, handles: [] })).toBeNull();
    expect(parseStoryboardResponse({ candidates: [] }, { shots: 3, handles: [] })).toBeNull();
    expect(parseStoryboardResponse({ candidates: [{ content: { parts: [{ text: "nije json" }] } }] }, { shots: 3, handles: [] })).toBeNull();
  });

  test("zahtev nosi Likove kao @handle, spisak pokreta i 3000 izlaznih tokena; DEMO je ispravan strip", () => {
    const input = { story: "Maja nalazi ključ.", shots: 4, style: null, characters: [{ handle: "maja", name: "Maja", description: "devojčica sa kikama" }], locale: "sr" as const };
    const body = buildStoryboardRequest(input);
    expect(body.generationConfig.maxOutputTokens).toBe(LLM_OUTPUT_TOKENS.storyboard);
    expect(body.contents[0]!.parts[0]!.text).toContain("@maja: Maja (devojčica sa kikama)");
    expect(body.systemInstruction.parts[0]!.text).toContain("staticno");
    const demo = demoStoryboard(input);
    expect(demo.shots).toHaveLength(4);
    expect(demo.shots.every((entry) => entry.elements[0] === "maja" && entry.imagePrompt.includes("@maja"))).toBe(true);
    expect(parseStoryboardResponse(reply(demo), { shots: 4, handles: ["maja"] })?.shots).toEqual(demo.shots);
  });
});

describe("najbolji momenti (V26)", () => {
  const sentences: TranscriptSentence[] = Array.from({ length: 30 }, (_, index) => ({ start: index * 10, end: index * 10 + 9, text: `Rečenica ${index}.` }));

  test("granice rečenica, 15-60 s, bez preklapanja, po oceni", () => {
    const moments = parseMomentsResponse(
      reply({
        moments: [
          { start: 12, end: 41, title: "Savet", why: "Kratko i korisno.", score: 70 },
          { start: 33, end: 70, title: "Preklapa", why: "", score: 60 },
          { start: 101, end: 250, title: "Predug", why: "", score: 95 },
          { start: 200, end: 203, title: "Prekratak", why: "", score: 80 },
        ],
      }),
      sentences,
      300,
    )!;
    expect(moments.map((moment) => moment.title)).toEqual(["Predug", "Prekratak", "Savet"]);
    expect(moments[0]).toMatchObject({ start: 100, end: 160 });
    expect(moments[2]).toMatchObject({ start: 10, end: 39 });
    for (const moment of moments) {
      expect(moment.end - moment.start).toBeGreaterThanOrEqual(15);
      expect(moment.end - moment.start).toBeLessThanOrEqual(60);
    }
  });

  test("ništa upotrebljivo = `null`; DEMO momenti bez preklapanja", () => {
    expect(parseMomentsResponse(reply({ moments: [] }), sentences, 300)).toBeNull();
    expect(parseMomentsResponse(reply({ nesto: 1 }), sentences, 300)).toBeNull();
    const demo = demoMoments(sentences, 300, "sr");
    expect(demo.length).toBeGreaterThan(0);
    expect(cleanMoments(demo, sentences, 300)).toEqual(demo);
    expect(buildMomentsRequest("[0.0-9.0] a", 300, "sr").generationConfig.maxOutputTokens).toBe(LLM_OUTPUT_TOKENS.moments);
  });
});

describe("objašnjavajući video (V28)", () => {
  test("broj scena po dužini (oko jedna na 20 s, 3-8)", () => {
    expect(explainerSceneCount(30)).toBe(3);
    expect(explainerSceneCount(60)).toBe(3);
    expect(explainerSceneCount(90)).toBe(5);
    expect(explainerSceneCount(600)).toBe(8);
  });

  test("scene sa naracijom i slikom; scena bez slike ispada; manje od 3 = `null`", () => {
    const scene = { narration: "Veštačka inteligencija uči iz primera.", visual: "a robot reading many books", seconds: 15 };
    const plan = parseExplainerResponse(reply({ title: "AI", scenes: [scene, { narration: "bez slike" }, scene, scene, { ...scene, seconds: 400 }] }), 60)!;
    expect(plan.scenes).toHaveLength(4);
    expect(plan.scenes[3]!.seconds).toBe(30);
    expect(parseExplainerResponse(reply({ scenes: [scene, scene] }), 60)).toBeNull();
    expect(buildExplainerRequest({ text: "x", seconds: 60, styleId: "tabla", locale: "sr" }).contents[0]!.parts[0]!.text).toContain("chalkboard");
  });

  test("DEMO plan deli tekst po scenama", () => {
    const demo = demoExplainer({ text: "Prva. Druga. Treća.", seconds: 60, locale: "sr" });
    expect(demo.scenes).toHaveLength(3);
    expect(demo.scenes.map((scene) => scene.narration)).toEqual(["Prva.", "Druga.", "Treća."]);
  });
});

describe("reklama (V31)", () => {
  test("3-4 kadra, poziv na akciju i opis pokreta; manje od 3 = `null`", () => {
    const script = parseAdResponse(
      reply({
        headline: "Domaći hleb",
        shots: [
          { onScreen: "Topao hleb", narration: "Svako jutro pečemo hleb." },
          { onScreen: "Domaće brašno", narration: "Samo domaće brašno." },
          { onScreen: "Za tvoj sto", narration: "Za tvoj doručak." },
          { onScreen: "Peti", narration: "višak" },
          { onScreen: "Šesti", narration: "višak" },
        ],
        cta: "Svrati danas!",
      }),
    )!;
    expect(script.shots).toHaveLength(4);
    expect(script.cta).toBe("Svrati danas!");
    expect(script.animationPrompt.length).toBeGreaterThan(0);
    expect(parseAdResponse(reply({ shots: [{ onScreen: "a", narration: "b" }] }))).toBeNull();
    expect(buildAdRequest({ product: "Hleb.", brand: "Pekara Mika", locale: "sr" }).contents[0]!.parts[0]!.text).toContain("Pekara Mika");
  });

  test("DEMO scenario od korisnikovih rečenica", () => {
    const demo = demoAd({ product: "Pečemo hleb svako jutro. Samo domaće brašno.", brand: "Pekara Mika", locale: "sr" });
    expect(demo.shots[0]!.narration).toBe("Pečemo hleb svako jutro.");
    expect(demo.shots[2]!.narration).toContain("Pekara Mika");
    expect(parseAdResponse(reply(demo))).toEqual(demo);
  });
});
