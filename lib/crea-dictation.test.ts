import { describe, expect, test } from "vitest";

import { appendSpoken } from "./crea-dictation";

describe("glasom do opisa", () => {
  test("prazno polje: izgovoreno ide velikim početnim slovom, ćirilica u latinicu", () => {
    expect(appendSpoken("", "мачка спава на крову")).toBe("Mačka spava na krovu");
    expect(appendSpoken("", "  crveni   bicikl ")).toBe("Crveni bicikl");
  });

  test("dopisuje se uz razmak; posle tačke veliko slovo", () => {
    expect(appendSpoken("Pas na plaži", "у залазак сунца")).toBe("Pas na plaži u zalazak sunca");
    expect(appendSpoken("Pas na plaži.", "лето")).toBe("Pas na plaži. Leto");
    expect(appendSpoken("Pas na plaži  ", "leto")).toBe("Pas na plaži leto");
  });

  test("polje pisano ćirilicom ostaje ćirilica", () => {
    expect(appendSpoken("Мачка на крову", "у ноћи")).toBe("Мачка на крову у ноћи");
  });

  test("dvoslovi i velika slova", () => {
    expect(appendSpoken("", "љубав и њива")).toBe("Ljubav i njiva");
  });

  test("prazan govor ne menja polje; granica dužine se poštuje", () => {
    expect(appendSpoken("Opis", "   ")).toBe("Opis");
    expect(appendSpoken("12345", "678", 7)).toBe("12345 6");
  });

  test("engleski ostaje kakav jeste", () => {
    expect(appendSpoken("", "a red bike")).toBe("A red bike");
  });
});
