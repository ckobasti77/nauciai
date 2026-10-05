import { describe, expect, test } from "vitest";

import { cameraFragment } from "./crea-camera";
import { assembleSlotsPrompt, COMPOSED_PROMPT_MAX, composeCreatePrompt, lookFragments, sketchToImagePrompt } from "./crea-prompt-compose";
import { styleById } from "./crea-styles";

describe("sklapanje opisa (S8)", () => {
  test("bez izgleda opis ostaje korisnikov", () => {
    expect(composeCreatePrompt("  mačka na krovu  ", {})).toEqual({ text: "mačka na krovu", overBy: 0 });
  });

  test("stil, kamera, paleta i dodatak idu redom, posle korisnikovih reči", () => {
    const camera = { body: "dslr", lens: "fiksni", focal: 50, aperture: "f/2.8" } as const;
    const { text } = composeCreatePrompt("mačka na krovu.", {
      styleId: "ilu-akvarel",
      camera,
      palette: ["#0E3158", "loše", "#f4be30"],
      extra: "  jesen,   lišće ",
    });
    expect(text).toBe(
      `mačka na krovu. ${styleById("ilu-akvarel")!.fragment}. ${cameraFragment(camera)}. color palette: #0e3158, #f4be30. jesen, lišće.`,
    );
  });

  test("nepoznat stil i prazna paleta se ne dodaju; samo izgled bez opisa je i dalje opis", () => {
    expect(lookFragments({ styleId: "nema", palette: [] })).toEqual([]);
    expect(composeCreatePrompt("", { styleId: "3d-glina" }).text).toBe(`${styleById("3d-glina")!.fragment}.`);
  });

  test("preko granice: `overBy` kaže za koliko, ništa se ne seče tiho", () => {
    const long = "a".repeat(COMPOSED_PROMPT_MAX - 5);
    const result = composeCreatePrompt(long, { styleId: "ilu-strip" });
    expect(result.overBy).toBe(result.text.length - COMPOSED_PROMPT_MAX);
    expect(result.overBy).toBeGreaterThan(0);
    expect(result.text.startsWith(long)).toBe(true);
  });
});

describe("Ko · Gde · Kako (S7)", () => {
  test("sve tri slike: redosled i redni brojevi u opisu", () => {
    const { order, prompt } = assembleSlotsPrompt({ ko: true, gde: true, kako: true }, "pije kafu", "sr");
    expect(order).toEqual(["ko", "gde", "kako"]);
    expect(prompt).toContain("sa prve slike");
    expect(prompt).toContain("sa druge slike");
    expect(prompt).toContain("sa treće slike");
    expect(prompt.endsWith("pije kafu.")).toBe(true);
  });

  test("bez lika: mesto postaje prva slika", () => {
    const { order, prompt } = assembleSlotsPrompt({ gde: true, kako: true }, "", "en");
    expect(order).toEqual(["gde", "kako"]);
    expect(prompt).toContain("place from the first image");
    expect(prompt).toContain("from the second image");
    expect(prompt).not.toContain("main subject");
  });

  test("lik i mesto bez opisa dobijaju rečenicu koja ih spaja", () => {
    expect(assembleSlotsPrompt({ ko: true, gde: true }, "  ", "sr").prompt).toContain("Prirodno ga smesti");
    expect(assembleSlotsPrompt({}, "", "sr")).toEqual({ order: [], prompt: "" });
  });
});

describe("skica → slika (S9/S10)", () => {
  test("platno bez stila: realna fotografija, kompozicija ostaje", () => {
    const prompt = sketchToImagePrompt({ source: "platno", text: "kuća pored reke." }, "sr");
    expect(prompt).toContain("gruba skica");
    expect(prompt).toContain("realna fotografija");
    expect(prompt).toContain("Zadrži isti raspored");
    expect(prompt).toContain("Na slici je: kuća pored reke.");
    expect(prompt).not.toContain("Linije papira");
  });

  test("sveska sa stilom: stil i napomena o linijama papira", () => {
    const prompt = sketchToImagePrompt({ source: "sveska", styleId: "ilu-anime", text: "" }, "en");
    expect(prompt).toContain("a photo of a sketch in a notebook");
    expect(prompt).toContain(styleById("ilu-anime")!.fragment);
    expect(prompt).toContain("Paper lines");
    expect(prompt).not.toContain("It shows");
  });
});
