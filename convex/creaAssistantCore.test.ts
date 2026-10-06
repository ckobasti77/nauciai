import { describe, expect, test } from "vitest";

import { demoAssistant, isConfirmation, parseAssistantResponse, planProblem, sanitizeAssistantSteps } from "./creaAssistantCore";

const wrap = (json: unknown) => ({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(json) + "\n```" }] } }] });

describe("pomoćnik: čitanje odgovora", () => {
  test("koraci, vrste, video iz ranije slike", () => {
    const plan = parseAssistantResponse(
      wrap({
        reply: "Napraviću sliku, video i muziku.",
        steps: [
          { kind: "slika", title: "Kafić", prompt: "cozy café", from: null },
          { kind: "video", title: "Oživi", prompt: "push in", from: 0 },
          { kind: "muzika", title: "Muzika", prompt: "acoustic", from: 0 },
          { kind: "zvuk", title: "?", prompt: "x" },
        ],
      }),
    );
    expect(plan?.steps.map((step) => [step.kind, step.from])).toEqual([
      ["slika", null],
      ["video", 0],
      ["muzika", null],
    ]);
  });

  test("najviše 4 koraka; video bez slike pre sebe nema izvor; prazno je null", () => {
    const many = Array.from({ length: 6 }, () => ({ kind: "slika", title: "s", prompt: "p" }));
    expect(sanitizeAssistantSteps(many)).toHaveLength(4);
    expect(sanitizeAssistantSteps([{ kind: "video", prompt: "x", from: 0 }])[0]?.from).toBeNull();
    expect(parseAssistantResponse(wrap({ steps: [] }))).toBeNull();
    expect(parseAssistantResponse({ candidates: [] })).toBeNull();
  });

  test("DEMO po ključnim rečima", () => {
    expect(demoAssistant("reklama za kafić sa videom i muzikom", "sr").steps.map((step) => step.kind)).toEqual(["slika", "video", "muzika"]);
    expect(demoAssistant("plakat za koncert", "sr").steps.map((step) => step.kind)).toEqual(["slika"]);
    expect(demoAssistant("slika i glas spikera", "en").steps.map((step) => step.kind)).toEqual(["slika", "govor"]);
  });
});

describe("pomoćnik: potvrda i plan", () => {
  test("samo „da” (ili „yes”) je potvrda", () => {
    for (const yes of ["da", "Da", " DA! ", "yes"]) expect(isConfirmation(yes)).toBe(true);
    for (const no of ["", "ne", "dada", "da li", "ok", "pokreni"]) expect(isConfirmation(no)).toBe(false);
  });

  test("plan: 1-4 koraka, celi krediti, video iz ranije slike", () => {
    expect(planProblem([{ kind: "image", maxCredits: 16 }])).toBeNull();
    expect(planProblem([])).toBe("NEISPRAVAN_PLAN");
    expect(planProblem([{ kind: "image", maxCredits: 1.5 }])).toBe("NEISPRAVAN_PLAN");
    expect(planProblem([{ kind: "image", maxCredits: 16 }, { kind: "video", maxCredits: 87, fromStep: 0 }])).toBeNull();
    expect(planProblem([{ kind: "audio", maxCredits: 1 }, { kind: "video", maxCredits: 87, fromStep: 0 }])).toBe("NEISPRAVAN_PLAN");
    expect(planProblem([{ kind: "video", maxCredits: 87, fromStep: 0 }])).toBe("NEISPRAVAN_PLAN");
  });
});
