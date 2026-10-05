import { describe, expect, test } from "vitest";

import { promptSegments } from "./crea-prompt-parts";

describe("opis po delovima („Kako je ovo napravljeno?“)", () => {
  test("delovi se pogađaju po rečima, a spojeni daju doslovno isti tekst", () => {
    const prompt =
      "a red cat sleeping on a roof, old Belgrade at dusk, watercolor illustration, warm golden hour light, wide angle shot, 35mm";
    const segments = promptSegments(prompt);
    expect(segments.map((segment) => segment.text).join("")).toBe(prompt);
    expect(segments.map((segment) => segment.kind)).toEqual(["ko", "sta", "stil", "svetlo", "kamera"]);
  });

  test("srpski opis: koren reči (svetlost, fotografija, krupni plan)", () => {
    const segments = promptSegments("Baka mesi hleb. U staroj kuhinji. Fotografija na filmu. Meka svetlost sa prozora. Krupni plan ruku.");
    expect(segments.map((segment) => segment.kind)).toEqual(["ko", "sta", "stil", "svetlo", "kamera"]);
  });

  test("susedni delovi iste vrste se spajaju; reči unutar drugih reči se ne broje", () => {
    // „little" nije „lit", „artichoke" nije stil.
    const segments = promptSegments("a little artichoke, on a plate, on a table");
    expect(segments).toEqual([
      { kind: "ko", text: "a little artichoke," },
      { kind: "sta", text: " on a plate, on a table" },
    ]);
    expect(promptSegments("")).toEqual([]);
  });
});
