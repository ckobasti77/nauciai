import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { SFX_CATEGORIES, SFX_CATEGORY_LABELS, SFX_LIBRARY, SFX_LICENSE, SFX_PACKS, searchSfx, sfxById, sfxSourceUrl, sfxUrl } from "./crea-sfx-library";

const DIR = join(process.cwd(), "public", "brand", "crea", "sfx");

describe("CC0 biblioteka efekata (A13)", () => {
  test("svaki fajl na disku je u spisku i obrnuto; samo MP3 + dokument izvora", () => {
    const onDisk = readdirSync(DIR).sort();
    expect(onDisk.filter((name) => !name.endsWith(".mp3"))).toEqual(["IZVORI.txt"]);
    expect(onDisk.filter((name) => name.endsWith(".mp3"))).toEqual(SFX_LIBRARY.map((file) => `${file.id}.mp3`).sort());
    expect(new Set(SFX_LIBRARY.map((file) => file.id)).size).toBe(SFX_LIBRARY.length);
    expect(SFX_LIBRARY.length).toBeGreaterThanOrEqual(40);
  });

  test("svaki fajl ima zapisan izvor (Kenney paket + originalni fajl) i CC0 licencu - i u IZVORI.txt", () => {
    const sources = readFileSync(join(DIR, "IZVORI.txt"), "utf8");
    expect(SFX_LICENSE).toMatchObject({ id: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" });
    expect(sources).toContain(SFX_LICENSE.url);
    const rows = sources.split(/\r?\n/);
    for (const file of SFX_LIBRARY) {
      expect(sfxSourceUrl(file), file.id).toMatch(/^https:\/\/kenney\.nl\/assets\//);
      expect(file.source.file, file.id).toMatch(/\.ogg$/);
      const line = rows.find((row) => row.startsWith(`${file.id}.mp3 |`));
      expect(line, file.id).toBeDefined();
      expect(line, file.id).toContain(file.source.file);
      expect(line, file.id).toContain(sfxSourceUrl(file));
      expect(line, file.id).toContain("CC0 1.0");
    }
    expect(Object.values(SFX_PACKS).every((url) => url.startsWith("https://kenney.nl/assets/"))).toBe(true);
  });

  test("naslovi na oba jezika, svaka kategorija ima fajlove, trajanje > 0", () => {
    for (const file of SFX_LIBRARY) {
      expect(file.title.sr.trim() && file.title.en.trim(), file.id).toBeTruthy();
      expect(file.seconds, file.id).toBeGreaterThan(0.03);
      expect(sfxUrl(file)).toBe(`/brand/crea/sfx/${file.id}.mp3`);
    }
    for (const category of SFX_CATEGORIES) {
      expect(SFX_CATEGORY_LABELS[category].sr).toBeTruthy();
      expect(SFX_LIBRARY.some((file) => file.category === category), category).toBe(true);
    }
  });

  test("pretraga: srpski i engleski, bez kvačica, ćirilica, padež; kategorija sužava", () => {
    // „Škripa vrata" se takođe nalazi, ali posle vrata (pogodak u naslovu ide pre).
    expect(searchSfx("vrata").map((file) => file.id)).toEqual(["vrata-otvaranje", "vrata-zatvaranje", "skripa"]);
    expect(searchSfx("door").map((file) => file.id)).toEqual(["vrata-otvaranje", "vrata-zatvaranje", "skripa"]);
    expect(searchSfx("vratima").map((file) => file.id)).toContain("vrata-zatvaranje");
    expect(searchSfx("врата").map((file) => file.id)).toContain("vrata-otvaranje");
    expect(searchSfx("skripa").map((file) => file.id)).toEqual(["skripa"]);
    expect(searchSfx("korak sneg").map((file) => file.id)).toEqual(["korak-sneg"]);
    expect(searchSfx("korak", "koraci")).toHaveLength(4);
    expect(searchSfx("", "dzinglovi")).toHaveLength(5);
    expect(searchSfx("xyzzy")).toEqual([]);
    expect(searchSfx("")).toHaveLength(SFX_LIBRARY.length);
    expect(sfxById("klik")?.category).toBe("interfejs");
    expect(sfxById("nema")).toBeUndefined();
  });
});
