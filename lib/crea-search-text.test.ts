import { describe, expect, test } from "vitest";

import {
  normalizeSearchText,
  searchIndexText,
  searchQueryText,
  searchStem,
  searchTextForJob,
  SEARCH_QUERY_MAX_TERMS,
  SEARCH_TEXT_MAX,
} from "./crea-search-text";

/** Kao Convex: rad je pogodak ako sadrži bar jednu reč upita (poslednja kao početak reči). */
function finds(indexText: string, query: string): boolean {
  const words = indexText.split(" ");
  const terms = searchQueryText(query).split(" ").filter(Boolean);
  return terms.some((term, index) =>
    index === terms.length - 1 ? words.some((word) => word.startsWith(term)) : words.includes(term),
  );
}

describe("normalizacija", () => {
  test("ćirilica, kvačice i velika slova daju istu latinicu", () => {
    expect(normalizeSearchText("Мачка на крову")).toBe("macka na krovu");
    expect(normalizeSearchText("Šarena MAČKA, žuti džemper!")).toBe("sarena macka zuti dzemper");
    expect(normalizeSearchText("Ђорђе и Đorđe")).toBe("djordje i djordje");
    expect(normalizeSearchText("Љубав, њива, џак")).toBe("ljubav njiva dzak");
    expect(normalizeSearchText("  --  ")).toBe("");
  });

  test("koren reči skida padeške nastavke, a kratke reči i brojeve ne dira", () => {
    for (const word of ["macka", "macke", "macki", "macku", "mackom", "mackama"]) expect(searchStem(word), word).toBe("mack");
    expect(searchStem("gradovima")).toBe("grad");
    expect(searchStem("pas")).toBe("pas");
    expect(searchStem("noc")).toBe("noc");
    expect(searchStem("4k")).toBe("4k");
    expect(searchStem("1080p")).toBe("1080p");
  });
});

describe("indeks i upit", () => {
  test("indeks čuva reč i koren, bez ponavljanja, u granici dužine", () => {
    expect(searchIndexText(["Mačka i mačke"])).toBe("macka mack i macke");
    const long = searchIndexText([Array.from({ length: 2000 }, (_, i) => `rec${i}`).join(" ")]);
    expect(long.length).toBeLessThanOrEqual(SEARCH_TEXT_MAX);
  });

  test("upit traži korene, najviše 16 pojmova", () => {
    expect(searchQueryText("Мачке на крововима")).toBe("mack krov");
    // Kratke reči ostaju samo kad nema dužih.
    expect(searchQueryText("u 4k")).toBe("u 4k");
    expect(searchQueryText("")).toBe("");
    expect(searchQueryText(Array.from({ length: 30 }, (_, i) => `slovo${i}`).join(" ")).split(" ")).toHaveLength(SEARCH_QUERY_MAX_TERMS);
  });

  test("pretraga na srpskom nalazi rad po opisu - bez obzira na pismo, kvačice i padež", () => {
    const job = searchTextForJob({
      params: JSON.stringify({ prompt: "Crvena mačka spava na krovu kuće u Beogradu, akvarel" }),
      modelSlug: "nano-banana-2",
      kind: "image",
    });
    expect(finds(job, "mačka")).toBe(true);
    expect(finds(job, "мачке")).toBe(true);
    expect(finds(job, "macku na krovu")).toBe(true);
    expect(finds(job, "beograd")).toBe(true);
    expect(finds(job, "akvar")).toBe(true); // kucanje u toku
    expect(finds(job, "nano banana")).toBe(true);
    expect(finds(job, "pas")).toBe(false);
  });

  test("rad besplatnog alata se nalazi po imenu alata (nema opis), govor po tekstu", () => {
    const local = searchTextForJob({ params: "{}", modelSlug: "local:slika.pozadina", kind: "image" });
    expect(finds(local, "pozadina")).toBe(true);
    expect(finds(local, "background")).toBe(true);
    expect(local).not.toContain("local");
    const speech = searchTextForJob({ params: JSON.stringify({ text: "Dobro jutro, Srbijo" }), modelSlug: "tts", kind: "audio" });
    expect(finds(speech, "jutro")).toBe(true);
    expect(finds(speech, "zvuk")).toBe(true);
    expect(searchTextForJob({ params: "nije json", modelSlug: "veo-31", kind: "video" })).toBe("veo 31 video vide");
  });
});
