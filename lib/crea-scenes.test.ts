import { describe, expect, test } from "vitest";

import { falMapOf, falParams, parseMultiShot } from "@/convex/providers/falInputs";
import { STUDIO_MODELS } from "@/convex/providers/catalogModels";
import { sanitizeSpecParams } from "@/convex/studioParamSpec";
import { computeCredits } from "@/convex/studioPricing";

import {
  distributeSeconds,
  MULTI_SHOT_MODEL,
  MULTI_SHOT_PARAM,
  scenesParams,
  scenesProblem,
  totalSecondsRange,
  type SceneCard,
} from "./crea-scenes";

const kling = STUDIO_MODELS.find((model) => model.slug === MULTI_SHOT_MODEL)!;

const CARDS: SceneCard[] = [
  { text: "Devojka otvara prozor u Beogradu", move: "the camera slowly dollies in toward the subject", seconds: 3 },
  { text: "Golubovi poleću sa krova", move: "", seconds: 2 },
  { text: "Sunce izlazi iznad Ade", move: "aerial drone shot flying forward over the landscape", seconds: 3 },
];

describe("više scena u klipu (V11, Kling 3.0 multi_prompt)", () => {
  test("ukupno trajanje iz kontrole modela i ravnomerna podela", () => {
    expect(totalSecondsRange(kling.paramSpec)).toEqual({ min: 5, max: 10 });
    expect(distributeSeconds(10, 3)).toEqual([4, 3, 3]);
    expect(distributeSeconds(8, 4)).toEqual([2, 2, 2, 2]);
    expect(distributeSeconds(5, 6).reduce((a, b) => a + b, 0)).toBe(5);
    expect(distributeSeconds(5, 0)).toEqual([]);
  });

  test("provera kartica", () => {
    const range = totalSecondsRange(kling.paramSpec);
    expect(scenesProblem(CARDS, range)).toBeNull();
    expect(scenesProblem(CARDS.slice(0, 1), range)).toBe("premalo-scena");
    expect(scenesProblem([...CARDS, ...CARDS, CARDS[0]], range)).toBe("previse-scena");
    expect(scenesProblem([{ ...CARDS[0], text: "  " }, CARDS[1]], range)).toBe("prazna-scena");
    expect(scenesProblem([{ ...CARDS[0], seconds: 0 }, CARDS[1]], range)).toBe("kratka-scena");
    expect(scenesProblem([{ ...CARDS[0], seconds: 9 }, CARDS[1]], range)).toBe("trajanje");
  });

  test("parametri: zbir sekundi je trajanje, scene kao JSON, opis za istoriju", () => {
    const params = scenesParams(CARDS);
    expect(params.duration).toBe(8);
    expect(JSON.parse(params.scenes)).toEqual([
      { prompt: "Devojka otvara prozor u Beogradu, the camera slowly dollies in toward the subject", duration: "3" },
      { prompt: "Golubovi poleću sa krova", duration: "2" },
      { prompt: "Sunce izlazi iznad Ade, aerial drone shot flying forward over the landscape", duration: "3" },
    ]);
    expect(params.prompt).toMatch(/^Scene 1: Devojka.*\. Scene 2: Golubovi.*\. Scene 3: Sunce/);
  });

  test("server prima parametre, a cena je ista kao za jedan klip istog trajanja", () => {
    const params = scenesParams(CARDS);
    const sanitized = sanitizeSpecParams(kling.paramSpec, kling.priceRule, { ...params, resolution: "720p", audio: false }, "text");
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;
    expect(sanitized.params[MULTI_SHOT_PARAM]).toBe(params.scenes);
    const single = sanitizeSpecParams(kling.paramSpec, kling.priceRule, { prompt: "x", duration: 8, resolution: "720p", audio: false }, "text");
    if (!single.ok) throw new Error("nije prošlo");
    expect(computeCredits(kling.priceRule, sanitized.params, "text")).toBe(computeCredits(kling.priceRule, single.params, "text"));
  });

  test("telo fal zahteva: multi_prompt umesto opisa, generate_audio, start_image_url", () => {
    const params = scenesParams(CARDS);
    const map = falMapOf(kling.capabilities);
    const body = falParams({ ...params, resolution: "720p", audio: false, voice_control: false }, map);
    expect(body.prompt).toBeUndefined();
    expect(body.scenes).toBeUndefined();
    expect(body.shot_type).toBe("customize");
    expect(body.multi_prompt).toEqual(JSON.parse(params.scenes));
    expect(body.generate_audio).toBe(false);
    expect(body.audio).toBeUndefined();
    expect(map?.fields?.image).toBe("start_image_url");
  });

  test("neispravne scene se odbacuju i ide običan opis", () => {
    const map = falMapOf(kling.capabilities);
    const body = falParams({ prompt: "jedan klip", duration: 5, scenes: "" }, map);
    expect(body).toEqual({ prompt: "jedan klip", duration: 5 });
    // Zbir mora biti tačno trajanje posla (po njemu se plaća).
    expect(parseMultiShot(JSON.stringify([{ prompt: "a", duration: "3" }, { prompt: "b", duration: "3" }]), 6, 5)).toBeNull();
    expect(parseMultiShot(JSON.stringify([{ prompt: "a", duration: "3" }, { prompt: "b", duration: "2" }]), 6, 5)).toEqual([
      { prompt: "a", duration: "3" },
      { prompt: "b", duration: "2" },
    ]);
    expect(parseMultiShot(JSON.stringify([{ prompt: "a", duration: 5 }]), 6, 5)).toBeNull();
    expect(parseMultiShot(JSON.stringify(Array.from({ length: 7 }, () => ({ prompt: "a", duration: 1 }))), 6, 7)).toBeNull();
    expect(parseMultiShot(JSON.stringify([{ prompt: " ", duration: 3 }, { prompt: "b", duration: 2 }]), 6, 5)).toBeNull();
    expect(parseMultiShot(JSON.stringify([{ prompt: "a", duration: 2.5 }, { prompt: "b", duration: 2.5 }]), 6, 5)).toBeNull();
    expect(parseMultiShot("nije json", 6, 5)).toBeNull();
  });
});
