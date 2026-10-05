/**
 * Kreator lika (S36, K14): meniji bez kucanja → opis lista lika (napred, bok,
 * leđa). Opis mora da počne oznakom kreatora - po njoj server prima list kao Lik.
 */

import { describe, expect, test } from "vitest";

import { CHARACTER_SHEET_MARKER, handleBase, isCharacterSheetPrompt } from "@/convex/creaElementsCore";
import {
  CHARACTER_MENUS,
  CHARACTER_SHEET_PARAMS,
  CHARACTER_SPECIES,
  characterDescription,
  characterSheetPrompt,
  characterSummary,
  DEFAULT_CHARACTER,
  normalizeChoice,
  randomChoice,
  suggestedNames,
  visibleMenus,
  type CharacterChoice,
} from "./crea-character";

describe("meniji", () => {
  test("traženi meniji postoje: vrsta, godine, kosa, oči, odeća, stil", () => {
    const ids = CHARACTER_MENUS.map((menu) => menu.id);
    for (const id of ["godine", "kosa", "bojaKose", "oci", "odeca", "stil"] as const) expect(ids).toContain(id);
    expect(CHARACTER_SPECIES.length).toBeGreaterThanOrEqual(4);
  });

  test("svaka opcija ima srpski i engleski naziv, jedinstven id i deo opisa", () => {
    for (const menu of [{ id: "vrsta", options: CHARACTER_SPECIES }, ...CHARACTER_MENUS]) {
      const ids = menu.options.map((option) => option.id);
      expect(new Set(ids).size, menu.id).toBe(ids.length);
      expect(menu.options.length, menu.id).toBeGreaterThanOrEqual(4);
      for (const option of menu.options) {
        expect(option.label.sr.trim(), `${menu.id}.${option.id}`).not.toBe("");
        expect(option.label.en.trim(), `${menu.id}.${option.id}`).not.toBe("");
        if (option.id !== "bez") expect(option.prompt.trim(), `${menu.id}.${option.id}`).not.toBe("");
        if (option.swatch) expect(option.swatch).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  test("podrazumevan izbor je ispravan, a svaka vrsta ima predloge imena", () => {
    expect(normalizeChoice(DEFAULT_CHARACTER)).toEqual(DEFAULT_CHARACTER);
    for (const species of CHARACTER_SPECIES) {
      const names = suggestedNames({ ...DEFAULT_CHARACTER, vrsta: species.id });
      expect(names.length, species.id).toBeGreaterThanOrEqual(3);
      for (const name of names) expect(handleBase(name), name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  test("bez dece: najmlađe godine su dvadesete", () => {
    const ages = CHARACTER_MENUS.find((menu) => menu.id === "godine")!.options.map((option) => option.prompt).join(" ");
    expect(ages).not.toMatch(/child|kid|teen|boy|girl/i);
  });

  test("robot nema godine, kosu ni ten; ljudi imaju sve", () => {
    const robot = visibleMenus({ ...DEFAULT_CHARACTER, vrsta: "robot" }).map((menu) => menu.id);
    expect(robot).not.toContain("godine");
    expect(robot).not.toContain("kosa");
    expect(robot).not.toContain("ten");
    expect(robot).toContain("odeca");
    expect(visibleMenus(DEFAULT_CHARACTER).map((menu) => menu.id)).toEqual(CHARACTER_MENUS.map((menu) => menu.id));
  });

  test("nepoznat izbor (stari link) pada na podrazumevan", () => {
    expect(normalizeChoice({ vrsta: "zmaj", kosa: "duga", stil: "nepostoji" })).toEqual({ ...DEFAULT_CHARACTER, kosa: "duga" });
  });

  test("„Iznenadi me\" daje ispravan izbor iz svakog menija", () => {
    let seed = 0.13;
    const random = () => {
      seed = (seed * 9301 + 0.49297) % 1;
      return seed;
    };
    for (let round = 0; round < 25; round += 1) {
      const choice = randomChoice(random);
      expect(normalizeChoice(choice)).toEqual(choice);
    }
    expect(randomChoice(() => 0.999999)).toEqual(normalizeChoice(randomChoice(() => 0.999999)));
  });
});

describe("opis lista lika", () => {
  const choice: CharacterChoice = {
    ...DEFAULT_CHARACTER,
    vrsta: "zena",
    godine: "30",
    kosa: "duga",
    bojaKose: "rida",
    oci: "zelene",
    ten: "svetao",
    odeca: "nosnja",
    dodatak: "naocare",
    stil: "akvarel",
  };

  test("počinje oznakom kreatora i traži tri pogleda istog lika bez teksta", () => {
    const prompt = characterSheetPrompt(choice);
    expect(prompt.startsWith(CHARACTER_SHEET_MARKER)).toBe(true);
    expect(isCharacterSheetPrompt(prompt)).toBe(true);
    expect(prompt).toContain("front view");
    expect(prompt).toContain("side profile view");
    expect(prompt).toContain("back view");
    expect(prompt).toContain("No text");
    expect(prompt.length).toBeLessThan(2000);
  });

  test("svaki izbor ulazi u opis", () => {
    const text = characterDescription(choice);
    expect(text).toBe(
      "an adult woman, in their thirties, copper red long straight hair, green eyes, fair skin, wearing a traditional Serbian folk costume with embroidered vest and opanci shoes, with round glasses",
    );
    expect(characterSheetPrompt(choice)).toContain("Style: soft watercolour illustration on paper.");
  });

  test("ćelav lik nema boju kose; robot nema kosu ni ten", () => {
    expect(characterDescription({ ...choice, kosa: "celav" })).toContain("a shaved bald head");
    expect(characterDescription({ ...choice, kosa: "celav" })).not.toContain("copper red");
    const robot = characterDescription({ ...choice, vrsta: "robot" });
    expect(robot).not.toContain("hair");
    expect(robot).not.toContain("skin");
    expect(robot).not.toContain("thirties");
  });

  test("isti izbor daje isti opis; drugi izbor drugi", () => {
    expect(characterSheetPrompt(choice)).toBe(characterSheetPrompt({ ...choice }));
    expect(characterSheetPrompt(choice)).not.toBe(characterSheetPrompt({ ...choice, stil: "anime" }));
    expect(CHARACTER_SHEET_PARAMS).toEqual({ aspect_ratio: "16:9" });
  });

  test("sažetak za korisnika je na njegovom jeziku", () => {
    expect(characterSummary(choice, "sr")).toEqual([
      "Žena",
      "Tridesete",
      "Duga kosa, riđa",
      "Oči: zelene",
      "Ten: svetao",
      "Narodna nošnja",
      "Naočare",
      "Akvarel",
    ]);
    expect(characterSummary({ ...choice, vrsta: "robot", dodatak: "bez" }, "en")).toEqual([
      "Robot",
      "Eyes: green",
      "Folk costume",
      "Watercolour",
    ]);
  });
});
