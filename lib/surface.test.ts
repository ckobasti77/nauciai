import { describe, expect, it } from "vitest";

import { nextLevel, surfaceClass, surfaceVar } from "@/lib/surface";

describe("surface — parnost naizmeničnih površina", () => {
  it("paran nivo je A, neparan je B", () => {
    expect(surfaceClass(0)).toBe("bg-surface-a");
    expect(surfaceClass(1)).toBe("bg-surface-b");
    expect(surfaceClass(2)).toBe("bg-surface-a");
    expect(surfaceClass(3)).toBe("bg-surface-b");
  });

  it("surfaceVar prati istu parnost kao klasa", () => {
    expect(surfaceVar(0)).toBe("var(--surface-a)");
    expect(surfaceVar(1)).toBe("var(--surface-b)");
    expect(surfaceVar(4)).toBe("var(--surface-a)");
    expect(surfaceVar(5)).toBe("var(--surface-b)");
  });

  it("nextLevel obrne parnost i uvek vrati 0 ili 1", () => {
    expect(nextLevel(0)).toBe(1);
    expect(nextLevel(1)).toBe(0);
    expect(nextLevel(2)).toBe(1);
    expect(nextLevel(3)).toBe(0);
  });

  it("dubinsko smenjivanje: nivo N i N+1 nikad nisu ista boja", () => {
    for (let level = 0; level < 8; level += 1) {
      expect(surfaceClass(level)).not.toBe(surfaceClass(nextLevel(level)));
    }
  });

  it("negativni i necele vrednosti se svode na parnost celog dela", () => {
    expect(surfaceClass(-1)).toBe("bg-surface-b");
    expect(surfaceClass(-2)).toBe("bg-surface-a");
    expect(surfaceClass(2.9)).toBe("bg-surface-a");
  });
});
