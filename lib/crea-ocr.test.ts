/**
 * Tekst sa slike (S32, K09): sređivanje izlaza Tesseract-a i pismo.
 */
import { describe, expect, test } from "vitest";

import { cleanOcrText, fixLookalikes, ocrLanguages, scriptStats, toCyrillic, toLatin, wordCount } from "./crea-ocr";

describe("jezici", () => {
  test("oba pisma ili jedno", () => {
    expect(ocrLanguages("oba")).toEqual(["srp_latn", "srp"]);
    expect(ocrLanguages("latinica")).toEqual(["srp_latn"]);
    expect(ocrLanguages("cirilica")).toEqual(["srp"]);
  });
});

describe("slova istog oblika", () => {
  test("ćirilično „о\" u latiničnoj reči postaje latinično", () => {
    const mixed = "Beоgrad"; // ćirilično о
    expect(fixLookalikes(mixed)).toBe("Beograd");
    expect(scriptStats(fixLookalikes(mixed)).cyrillic).toBe(0);
  });

  test("latinično „a\" u ćiriličnoj reči postaje ćirilično", () => {
    expect(fixLookalikes("Бeогрaд")).toBe("Београд");
  });

  test("reč samo od slova istog oblika ostaje kakva jeste", () => {
    expect(fixLookalikes("ОКО")).toBe("ОКО");
    expect(fixLookalikes("OKO")).toBe("OKO");
  });
});

describe("sređivanje teksta", () => {
  test("kraj reda, razmaci, prelomljena reč, višak praznih redova", () => {
    const raw = "Dobro do-\r\nšli u   \r\n\r\n\r\n\r\nNauči AI  \n";
    expect(cleanOcrText(raw)).toBe("Dobro došli u\n\nNauči AI");
  });

  test("crtica ispred velikog slova ostaje (to je stvarna crtica)", () => {
    expect(cleanOcrText("Novi-\nSad")).toBe("Novi-\nSad");
  });

  test("broj reči", () => {
    expect(wordCount("Dobro došli — u 2026. godinu!")).toBe(5);
    expect(wordCount("  ")).toBe(0);
  });
});

describe("pismo", () => {
  test("prepoznaje latinicu, ćirilicu i mešano", () => {
    expect(scriptStats("Šta radiš danas?").dominant).toBe("latinica");
    expect(scriptStats("Шта радиш данас?").dominant).toBe("cirilica");
    expect(scriptStats("Šta радиш").dominant).toBe("mesano");
    expect(scriptStats("123 !?").dominant).toBe("nema");
  });

  test("ćirilica → latinica, sa dvoslovima", () => {
    expect(toLatin("Љубав, њива и џеп. Ђорђе ће доћи.")).toBe("Ljubav, njiva i džep. Đorđe će doći.");
    expect(toLatin("ЉУБАВ")).toBe("LJUBAV");
    expect(toLatin("Hello 42")).toBe("Hello 42");
  });

  test("latinica → ćirilica, sa dvoslovima", () => {
    expect(toCyrillic("Ljubav, njiva i džep. Đorđe će doći.")).toBe("Љубав, њива и џеп. Ђорђе ће доћи.");
    expect(toCyrillic("NJIVA")).toBe("ЊИВА");
  });

  test("tam-i-nazad ne gubi slova", () => {
    const text = "Čačak, Šabac, Užice, Ljig, Njegoš, Džep.";
    expect(toLatin(toCyrillic(text))).toBe(text);
  });
});
