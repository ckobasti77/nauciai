import { expect, test } from "vitest";

import { STUDIO_EXAMPLES, STUDIO_LANDING, validStudioExample } from "./studio-landing";

test("manifest primera: prazan niz je validno stanje, svaki unos mora biti potpun", () => {
  // Prazna galerija je NAMERNO validna (sekcija se ne renderuje) - primeri
  // stižu tek kad Jovan ubaci prave generacije (BLOKADA u studio-landing.ts).
  for (const example of STUDIO_EXAMPLES) {
    expect(validStudioExample(example), `${example.src} nije validan unos`).toBe(true);
  }

  expect(validStudioExample({ src: "/studio-examples/a.png", alt: { sr: "A", en: "A" }, kind: "image" })).toBe(true);
  expect(validStudioExample({ src: "/drugde/a.png", alt: { sr: "A", en: "A" }, kind: "image" })).toBe(false);
  expect(validStudioExample({ src: "/studio-examples/a.png", alt: { sr: " ", en: "A" }, kind: "image" })).toBe(false);
});

test("svaka poruka landinga ima sr i en varijantu", () => {
  const flat = (node: unknown): Array<{ sr: string; en: string }> => {
    if (node && typeof node === "object") {
      if ("sr" in node && "en" in node) return [node as { sr: string; en: string }];
      return Object.values(node).flatMap(flat);
    }
    return [];
  };
  const entries = flat(STUDIO_LANDING);
  expect(entries.length).toBeGreaterThan(15);
  for (const entry of entries) {
    expect(entry.sr.trim().length).toBeGreaterThan(0);
    expect(entry.en.trim().length).toBeGreaterThan(0);
  }
});
