import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../public/brand/igra/manifest.json";
import { CREA_AREAS, creaShellQuery } from "./crea-shell";
import { IGRA_CREA_COPY } from "./igra-copy";
import { CREA_AREA_LIK, CREA_RADI_ART, creaLikForArea, creaLikForKind, creaRadiArt } from "./igra-crea";
import { CREA_GAME_FIXTURES, IGRA_FIXTURE_IDS, IGRA_FIXTURES } from "./igra-fixtures";
import { levelFromXp } from "./igra-level";

/**
 * Crea ekipa (K15, plan K14): oblast → lik, tekstovi likova i provere nad izvorom -
 * jedna scena ulaza, prezentacioni delovi bez upita, nivo u traci iz XP-a.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const assets: Record<string, { ready: boolean } | undefined> = manifest.assets;

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const path = `${dir}/${entry}`;
    if (statSync(join(ROOT, path)).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

/** Reči pretnje i žurbe (O9), isti spisak kao `lib/igra-shell.test.ts`. */
const FEAR = /izgubi|propusti|požuri|kazn|ističe|lose|hurry|miss|penalt|expire/i;

describe("oblast → lik", () => {
  it("Piksi slika, Kadar video, Eho zvuk; vrsta posla vodi istom liku", () => {
    expect(CREA_AREA_LIK).toEqual({ slika: "piksi", video: "kadar", zvuk: "eho" });
    expect(CREA_AREAS.map(creaLikForArea)).toEqual(["piksi", "kadar", "eho"]);
    expect([creaLikForKind("image"), creaLikForKind("video"), creaLikForKind("audio")]).toEqual(["piksi", "kadar", "eho"]);
  });

  it("svaka poza koju Crea koristi postoji u manifestu i spremna je", () => {
    for (const area of CREA_AREAS) {
      const lik = creaLikForArea(area);
      for (const poza of ["mase", "misli", "slavi"]) expect(assets[`lik.${lik}.${poza}`]?.ready, `lik.${lik}.${poza}`).toBe(true);
      expect(creaRadiArt(lik)).toBe(CREA_RADI_ART[lik]);
      expect(assets[creaRadiArt(lik)]?.ready, creaRadiArt(lik)).toBe(true);
    }
    expect(assets["scena.crea-radionica"]?.ready).toBe(true);
  });

  it("modul ne vuče manifest ni ljusku Cree u vreme izvršavanja (tabla ga uvozi)", () => {
    const source = read("lib/igra-crea.ts");
    expect(source).not.toMatch(/manifest\.json/);
    for (const line of source.split("\n").filter((row) => row.startsWith("import "))) expect(line).toMatch(/^import type /);
  });
});

describe("tekstovi", () => {
  it("svaki tekst ima sr i en, nije prazan i nije isti na oba jezika", () => {
    for (const [key, text] of Object.entries(IGRA_CREA_COPY)) {
      expect(text.sr.trim(), key).not.toBe("");
      expect(text.en.trim(), key).not.toBe("");
      expect(text.sr, key).not.toBe(text.en);
    }
  });

  it("likovi ne prete, ne žure i ne pričaju o ceni", () => {
    for (const [key, text] of Object.entries(IGRA_CREA_COPY)) {
      for (const value of [text.sr, text.en]) {
        expect(value, key).not.toMatch(FEAR);
        expect(value, key).not.toMatch(/kredit|credit|cen[aeiu]\b|price|plat|pay/i);
      }
    }
  });
});

describe("ulaz", () => {
  it("pločica lika otvara radionicu i briše cilj, alat, recept i model", () => {
    const current = new URLSearchParams("cilj=logo&alat=paleta&recept=x&model=flux&project=p1");
    expect(creaShellQuery({ area: "video", mode: null }, current)).toBe("oblast=video&project=p1");
    expect(creaShellQuery({ area: "slika", mode: null }, new URLSearchParams())).toBe("oblast=slika");
  });

  it("ulaz crta heroja sa tri radionice i zadržava naslov sekcije", () => {
    const screen = read("components/crea/crea-start-screen.tsx");
    expect(screen).toContain("<CreaStartHero");
    expect(screen).toContain('titleId="crea-start-title"');
    expect(screen).toContain('aria-labelledby="crea-start-title"');
    expect(screen).toContain("creaShellQuery({ area, mode: null }, searchParams)");
  });

  it("jedna scena u celoj radionici: jedan IgraHero i nijedna druga prioritetna slika", () => {
    const files = [...sources("components/crea"), ...sources("components/igra/crea")];
    expect(files.filter((file) => read(file).includes("<IgraHero"))).toEqual(["components/igra/crea/crea-start-hero.tsx"]);
    expect(files.filter((file) => /\bpriority\b/.test(read(file)))).toEqual([]);
    expect(read("components/igra/crea/crea-start-hero.tsx")).toContain('art="scena.crea-radionica"');
  });
});

describe("delovi u components/igra/crea", () => {
  const files = sources("components/igra/crea");

  it("prezentacioni su: bez upita, mutacija i test podataka", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) expect(read(file), file).not.toMatch(/from "convex\/react"|_generated\/api|useQuery|useMutation|igra-fixtures/);
  });

  it("slike samo kroz IgraArt; bez forsiranog radijusa, golog hex-a i drugog okvira", () => {
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(/<img\b|\/brand\/igra\//);
      expect(source, file).not.toMatch(/rounded-[\w[\]./-]+!|!rounded-|borderRadius/);
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, file).not.toMatch(/border-2/);
    }
  });
});

describe("radionice", () => {
  it("zaglavlje sa likom stoji između oblasti i režima", () => {
    const workshop = read("components/crea/crea-workshop.tsx");
    const header = workshop.indexOf("<CreaAreaHeader");
    expect(header).toBeGreaterThan(workshop.indexOf("<CreaAreaTabs"));
    expect(header).toBeLessThan(workshop.indexOf("<CreaModeTabs"));
  });

  it("prazne pozornice nose lika oblasti, ne znak Cree", () => {
    for (const file of ["components/crea/crea-stage.tsx", "components/crea/crea-tool-stage.tsx"]) {
      const source = read(file);
      expect(source, file).toContain("creaLikForArea(area)");
      expect(source, file).not.toContain('<CreaLogo variant="znak"');
    }
  });
});

describe("traka napretka", () => {
  it("nivo je iz XP-a istim pravilom kao ljuska, nikad stari serverski nivo", () => {
    const strip = read("components/crea/game/crea-game-strip.tsx");
    expect(strip).toContain("levelFromXp(xp)");
    expect(strip).toContain("<LevelSeal");
    const code = strip.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toMatch(/game\.level|\{[^}]*\blevel\b[^}]*\}\s*=\s*game/);
    for (const id of IGRA_FIXTURE_IDS) {
      const game = CREA_GAME_FIXTURES[id];
      expect(game.xp).toBe(IGRA_FIXTURES[id].xp);
      expect(levelFromXp(game.xp).level).toBe(IGRA_FIXTURES[id].level.level);
    }
    // Test korisnik „aktivan": 1.890 XP je nivo 5 po IGRA-i, a 4 po starom obračunu.
    expect(CREA_GAME_FIXTURES.aktivan.level).toBe(4);
    expect(levelFromXp(CREA_GAME_FIXTURES.aktivan.xp).level).toBe(5);
  });
});
