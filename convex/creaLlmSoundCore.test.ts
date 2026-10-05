import { describe, expect, test } from "vitest";

import {
  buildScoreRequest,
  buildTranslateRequest,
  demoScore,
  demoTranslate,
  isDubLanguage,
  parseScoreResponse,
  parseTranslateResponse,
  SCORE_LIMITS,
  TRANSLATE_LIMITS,
  translateSegmentsInput,
} from "./creaLlmSoundCore";

const reply = (body: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] });

describe("prevod rečenica (A10)", () => {
  test("ulaz: neprazne rečenice, jedinstveni id-jevi, granice", () => {
    expect(
      translateSegmentsInput([
        { id: "s1", text: "  Zdravo  " },
        { id: "s1", text: "dupla" },
        { id: "s2", text: " " },
        { id: "s3", text: "Ćao" },
      ]),
    ).toEqual([
      { id: "s1", text: "Zdravo" },
      { id: "s3", text: "Ćao" },
    ]);
    const many = Array.from({ length: 200 }, (_, index) => ({ id: `s${index}`, text: "a".repeat(400) }));
    const cut = translateSegmentsInput(many);
    expect(cut.length).toBeLessThanOrEqual(TRANSLATE_LIMITS.segments);
    expect(cut.reduce((sum, entry) => sum + entry.text.length, 0)).toBeLessThanOrEqual(TRANSLATE_LIMITS.totalChars);
  });

  test("zahtev nosi ciljni jezik i rečenice kao JSON; srpski uvek latinica", () => {
    const body = buildTranslateRequest({ segments: [{ id: "s1", text: "Good morning" }], to: "sr", from: "eng" });
    const user = body.contents[0]!.parts[0]!.text;
    expect(user).toContain("Target language: Serbian (Latin script).");
    expect(user).toContain('[{"id":"s1","text":"Good morning"}]');
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  test("odgovor: samo poslati id-jevi, prazan ili loš = null; DEMO je označen", () => {
    expect(
      parseTranslateResponse(
        reply({
          items: [
            { id: "s1", text: " Dobro jutro " },
            { id: "s9", text: "uljez" },
            { id: "s2", text: "" },
          ],
        }),
        ["s1", "s2"],
      ),
    ).toEqual({ s1: "Dobro jutro" });
    expect(parseTranslateResponse(reply({ items: [] }), ["s1"])).toBeNull();
    expect(parseTranslateResponse({ candidates: [] }, ["s1"])).toBeNull();
    expect(demoTranslate({ segments: [{ id: "s1", text: "Zdravo" }], to: "en", from: null })).toEqual({ s1: "[EN DEMO] Zdravo" });
    expect(isDubLanguage("sr") && !isDubLanguage("xx")).toBe(true);
  });
});

describe("ozvuči moj video (A12)", () => {
  test("zahtev: kadrovi kao slike, pa tekst sa trajanjem i jezikom", () => {
    const body = buildScoreRequest(
      [
        { base64: "AAA", mimeType: "image/jpeg" },
        { base64: "BBB", mimeType: "image/jpeg" },
      ],
      { durationS: 12.4, locale: "sr" },
    );
    const parts = body.contents[0]!.parts as Array<Record<string, unknown>>;
    expect(parts.slice(0, 2)).toEqual([{ inlineData: { mimeType: "image/jpeg", data: "AAA" } }, { inlineData: { mimeType: "image/jpeg", data: "BBB" } }]);
    expect(parts[2]!.text).toContain("Video length: 12 seconds");
    expect(parts[2]!.text).toContain("Serbian (Latin script)");
  });

  test("odgovor: do 4 numere i 3 efekta, bez praznih; bez numera = null; DEMO ima 4 različite", () => {
    const parsed = parseScoreResponse(
      reply({
        summary: "Devojka vozi bicikl kroz park.",
        mood: "vedro",
        tracks: [1, 2, 3, 4, 5].map((index) => ({ title: `N${index}`, prompt: `Track ${index}` })).concat([{ title: "x", prompt: "" }]),
        effects: [{ label: "Zvonce", prompt: "bike bell" }, { prompt: "birds" }, {}, { label: "a", prompt: "b" }, { label: "c", prompt: "d" }],
      }),
    )!;
    expect(parsed.tracks).toHaveLength(SCORE_LIMITS.tracks);
    expect(parsed.tracks[0]).toEqual({ title: "N1", prompt: "Track 1" });
    expect(parsed.effects).toEqual([
      { label: "Zvonce", prompt: "bike bell" },
      { label: "birds", prompt: "birds" },
      { label: "a", prompt: "b" },
    ]);
    expect(parseScoreResponse(reply({ tracks: [] }))).toBeNull();
    const demo = demoScore({ durationS: 10, locale: "sr" });
    expect(new Set(demo.tracks.map((track) => track.prompt)).size).toBe(4);
    expect(demo.summary).toContain("DEMO");
  });
});
