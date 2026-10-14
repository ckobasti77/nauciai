import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../public/brand/igra/manifest.json";
import { CREA_AREAS, creaShellQuery } from "./crea-shell";
import { IGRA_CREA_COPY } from "./igra-copy";
import { CREA_AREA_LIK, CREA_RADI_ART, creaLikForArea, creaLikForKind, creaMomentLik, creaRadiArt, isCreaGenerationError } from "./igra-crea";
import { creaXpRun, type CreaXpEvent, type CreaXpRun } from "./igra-crea-xp";
import { CREA_GAME_FIXTURES, creaJobFixture, IGRA_FIXTURE_IDS, IGRA_FIXTURES } from "./igra-fixtures";
import { jobStatusText } from "./studio-form";
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
      for (const poza of ["mase", "misli", "slavi", "tuzan"]) expect(assets[`lik.${lik}.${poza}`]?.ready, `lik.${lik}.${poza}`).toBe(true);
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

/** Ceo niz događaja kroz reduktor. */
function play(events: CreaXpEvent[], from: CreaXpRun = null): CreaXpRun {
  return events.reduce(creaXpRun, from);
}

/** Kod bez komentara (komentari smeju da pominju zabranjeno). */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("K16: mini slavlje i neuspeh", () => {
  it("prvi rad i prvi rad svake vrste slavi lik te vrste; jubilej i običan rad ne", () => {
    expect(creaMomentLik({ id: "prvi-rad" }, "video")).toBe("kadar");
    expect(creaMomentLik({ id: "prvi-od-vrste", kind: "image" }, "image")).toBe("piksi");
    expect(creaMomentLik({ id: "prvi-od-vrste", kind: "video" }, "video")).toBe("kadar");
    expect(creaMomentLik({ id: "prvi-od-vrste", kind: "audio" }, "audio")).toBe("eho");
    expect(creaMomentLik({ id: "jubilej", count: 10 }, "image")).toBeNull();
    expect(creaMomentLik(null, "image")).toBeNull();
  });

  it("tužan lik samo za grešku generisanja, ne za posao koji je korisnik otkazao", () => {
    expect(isCreaGenerationError({ status: "failed" })).toBe(true);
    expect(isCreaGenerationError({ status: "refunded" })).toBe(true);
    expect(isCreaGenerationError({ status: "refunded", error: "OTKAZAO_KORISNIK" })).toBe(false);
    for (const status of ["done", "running", "queued", "reserved"]) expect(isCreaGenerationError({ status })).toBe(false);
  });

  it("poruka o povraćaju kredita ostaje postojeća (lik je samo dodat uz nju)", () => {
    const now = 1_700_000_000_000;
    expect(jobStatusText(creaJobFixture("image", "failed", now), "sr")).toBe("Generacija nije uspela. Vraćamo kredite…");
    expect(jobStatusText(creaJobFixture("image", "refunded", now), "sr")).toBe("Generacija nije uspela - krediti su ti vraćeni.");
    const tile = read("components/app/studio-media-tile.tsx");
    expect(tile).toContain('waitSize === "stage" && isCreaGenerationError(job)');
    expect(tile).toContain('poza="tuzan"');
    expect(tile).toContain("{statusMessage}");
  });

  it("oblačić: lik udari kao pečat, marker iza poruke, „+N XP” samo uz porast", () => {
    const companion = read("components/crea/wait/stage-companion.tsx");
    expect(companion).toContain('poza="slavi"');
    expect(companion).toContain("useStampIn(ref");
    expect(companion).toContain("igra-marker bg-yellow text-ink");
    expect(companion).toContain("xpGain && xpGain > 0");
    const stage = read("components/crea/crea-stage.tsx");
    expect(stage).toContain("creaMomentLik(jobMoment, job.kind)");
    expect(stage).toContain("useCreaXpGain(job?._id ?? null");
  });
});

describe("K16: XP posle rada (meri se, ne upisuje)", () => {
  const start = (xp: number, jobId = "a"): CreaXpEvent => ({ type: "start", jobId, xp });
  const finish = (xp: number, jobId = "a"): CreaXpEvent => ({ type: "finish", jobId, xp });
  const xp = (value: number): CreaXpEvent => ({ type: "xp", xp: value });

  it("porast u prozoru posle kraja rada je broj", () => {
    expect(play([start(100), finish(100), xp(140)])?.gain).toBe(40);
    // XP stigao malo pre nego što je klijent video kraj rada.
    expect(play([start(100), xp(130), finish(130)])?.gain).toBe(30);
  });

  it("bez porasta nema broja", () => {
    expect(play([start(100), finish(100), xp(100)])?.gain).toBeNull();
  });

  it("porast posle zatvorenog prozora (8 s) se ignoriše", () => {
    expect(play([start(100), finish(100), { type: "close", jobId: "a" }, xp(140)])?.gain).toBeNull();
  });

  it("drugi porast ne menja prvi broj", () => {
    expect(play([start(100), finish(100), xp(140), xp(200)])?.gain).toBe(40);
  });

  it("nov posao počinje ispočetka; kraj tuđeg posla ne meri ništa", () => {
    const first = play([start(100), finish(100), xp(140)]);
    expect(play([start(140, "b")], first)).toEqual({ jobId: "b", before: 140, finished: false, open: false, gain: null });
    expect(play([start(100), finish(150, "b")])?.gain).toBeNull();
  });

  it("rad koji nije viđen u izradi ne daje broj; loš ulaz se ne broji", () => {
    expect(play([finish(100), xp(200)])).toBeNull();
    expect(play([start(Number.NaN), finish(100), xp(200)])).toBeNull();
    expect(play([start(100), finish(100), xp(Number.NaN)])?.gain).toBeNull();
    expect(play([start(100), finish(100), { type: "reset" }])).toBeNull();
  });

  it("nepromenjeno stanje je ista referenca (React ne crta ponovo)", () => {
    const running = play([start(100)]);
    expect(creaXpRun(running, start(100))).toBe(running);
    expect(creaXpRun(running, xp(500))).toBe(running);
  });

  it("hook čita samo napredak iz ljuske, bez upita; nijedan XP iznos nije upisan", () => {
    const hook = read("components/igra/crea/use-crea-xp-gain.ts");
    expect(hook).toContain("useIgraProgress()");
    expect(hook).not.toMatch(/from "convex\/react"|_generated\/api|useQuery/);
    expect(code("components/crea/crea-stage.tsx")).not.toMatch(/xpGain=\{\d/);
  });
});

describe("K16: čekanje", () => {
  it("lik „radi” samo u velikom prikazu; staje za noćni posao i uz smanjen pokret", () => {
    const wait = read("components/crea/wait/wait-screen.tsx");
    expect(wait).toContain("creaRadiArt(creaLikForKind(job.kind))");
    expect(wait).toContain('animated && !state.night && "igra-lik-radi"');
    const css = read("app/globals.css").replace(/\r\n/g, "\n");
    const rule = css.indexOf(".igra-lik-radi {");
    const block = css.lastIndexOf("@media (prefers-reduced-motion: no-preference) {", rule);
    expect(block).toBeGreaterThan(-1);
    expect(css.slice(block, rule)).not.toContain("}\n}");
  });

  it("bez lažnog procenta: čekanje ne prikazuje % i ne množi napredak sa 100", () => {
    for (const file of ["components/crea/wait/wait-screen.tsx", "components/crea/wait/sketch-paper.tsx", "components/crea/wait/stage-companion.tsx"]) {
      const source = code(file);
      expect(source, file).not.toMatch(/\*\s*100\b|\b100\s*\*/);
      // `%` sme samo u Tailwind/CSS vrednostima (npr. `-7%`), nikad u tekstu za čitanje.
      expect(source.replace(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g, '""'), file).not.toMatch(/%/);
    }
    const copy = code("lib/crea-wait.ts");
    expect(copy).not.toMatch(/\*\s*100\b|%\s*["`']/);
  });
});

describe("K16: slavlja se ne preklapaju", () => {
  it("domaćin slavlja čeka i Crea preklope (`data-igra-busy`)", () => {
    expect(read("components/igra/celebration-host.tsx")).toContain(`const BUSY_SELECTOR = '[aria-modal="true"], .crea-stamp-note, [data-igra-busy]';`);
    for (const file of ["components/crea/game/crea-stamp-host.tsx", "components/crea/game/crea-streak-burst.tsx", "components/crea/wait/stage-companion.tsx"]) {
      expect(read(file), file).toContain('data-igra-busy=""');
    }
  });

  it("3D maskota Cree je Robi", () => {
    expect(read("lib/crea-experience-copy.ts")).toContain('label: { sr: "Robi", en: "Robi" }');
  });
});
