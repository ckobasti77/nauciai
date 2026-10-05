import { describe, expect, test } from "vitest";

import {
  buildPromptHelperRequest,
  CREA_LLM_MODEL,
  demoPromptHelper,
  geminiGenerateUrl,
  llmCostUsd,
  llmUsageFrom,
  parsePromptHelperResponse,
  PROMPT_HELPER_INPUT_MAX,
  promptFromParts,
} from "./creaLlmCore";

function gemini(text: string, usage?: Record<string, number>) {
  return { candidates: [{ content: { parts: [{ text }] } }], ...(usage ? { usageMetadata: usage } : {}) };
}

const GOOD = JSON.stringify({
  parts: [
    { kind: "ko", text: "an old fisherman with a white beard", gloss: "stari ribar sa belom bradom" },
    { kind: "sta", text: "mending a net on a wooden boat at dawn.", gloss: "krpi mrežu na čamcu u zoru" },
    { kind: "stil", text: "35mm film photo", gloss: "fotka na filmu" },
    { kind: "svetlo", text: "golden hour backlight", gloss: "zlatno kontra svetlo" },
    { kind: "kamera", text: "close-up, 85mm lens", gloss: "krupni kadar, 85 mm" },
  ],
  explanation: "Dodati su mesto, svetlo i kadar.",
});

describe("pomoćnik za opis (S6)", () => {
  test("zahtev: sistemsko uputstvo, jezik korisnika, JSON odgovor, unos se seče", () => {
    const body = buildPromptHelperRequest("  ribar u zoru  ", "sr");
    expect(body.systemInstruction.parts[0]!.text).toContain("ko|sta|stil|svetlo|kamera");
    expect(body.contents[0]!.parts[0]!.text).toContain("Serbian");
    expect(body.contents[0]!.parts[0]!.text).toContain("ribar u zoru");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    const long = buildPromptHelperRequest("a".repeat(5000), "en").contents[0]!.parts[0]!.text;
    expect(long.length).toBeLessThan(PROMPT_HELPER_INPUT_MAX + 80);
    expect(geminiGenerateUrl()).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${CREA_LLM_MODEL}:generateContent`);
  });

  test("odgovor: delovi po vrsti, opis iz delova bez tačaka, objašnjenje", () => {
    const result = parsePromptHelperResponse(gemini(GOOD));
    expect(result?.parts.map((part) => part.kind)).toEqual(["ko", "sta", "stil", "svetlo", "kamera"]);
    expect(result?.parts[0]!.gloss).toBe("stari ribar sa belom bradom");
    expect(result?.prompt).toBe(
      "an old fisherman with a white beard, mending a net on a wooden boat at dawn, 35mm film photo, golden hour backlight, close-up, 85mm lens",
    );
    expect(result?.explanation).toBe("Dodati su mesto, svetlo i kadar.");
  });

  test("odgovor u ```json ogradi, nepoznata vrsta i prazan deo se preskaču, gloss pada na tekst", () => {
    const text = "```json\n" + JSON.stringify({ parts: [{ kind: "zlo", text: "x" }, { kind: "ko", text: "" }, { kind: "stil", text: "watercolor" }] }) + "\n```";
    const result = parsePromptHelperResponse(gemini(text));
    expect(result?.parts).toEqual([{ kind: "stil", text: "watercolor", gloss: "watercolor" }]);
    expect(result?.explanation).toBe("");
  });

  test("loš oblik je `null` (pozivalac javlja grešku)", () => {
    expect(parsePromptHelperResponse(null)).toBeNull();
    expect(parsePromptHelperResponse({ candidates: [] })).toBeNull();
    expect(parsePromptHelperResponse(gemini("nije json"))).toBeNull();
    expect(parsePromptHelperResponse(gemini(JSON.stringify({ parts: [] })))).toBeNull();
    expect(parsePromptHelperResponse(gemini(JSON.stringify({ parts: "x" })))).toBeNull();
  });

  test("trošak: misli se broje kao izlaz, tarifa Flash-Lite", () => {
    const usage = llmUsageFrom(gemini(GOOD, { promptTokenCount: 500, candidatesTokenCount: 300, thoughtsTokenCount: 100 }));
    expect(usage).toEqual({ inputTokens: 500, outputTokens: 400 });
    expect(llmCostUsd(usage)).toBeCloseTo((500 * 0.3 + 400 * 2.5) / 1_000_000, 12);
    expect(llmUsageFrom({})).toEqual({ inputTokens: 0, outputTokens: 0 });
    // Jedan poziv je daleko ispod jednog kredita (1 kr ≈ $0,0116).
    expect(llmCostUsd(usage)).toBeLessThan(0.005);
  });

  test("DEMO: deterministički, pet delova, korisnikove reči su glavni lik", () => {
    const a = demoPromptHelper("pas na plaži", "sr");
    expect(a).toEqual(demoPromptHelper("pas na plaži", "sr"));
    expect(a.parts.map((part) => part.kind)).toEqual(["ko", "sta", "stil", "svetlo", "kamera"]);
    expect(a.parts[0]!.text).toBe("pas na plaži");
    expect(a.prompt).toBe(promptFromParts(a.parts));
    expect(a.explanation).toContain("DEMO");
    expect(demoPromptHelper("dog", "en").parts[1]!.gloss).toBe(demoPromptHelper("dog", "en").parts[1]!.text);
  });
});
