import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { IGRA_FIXTURE_IDS, IGRA_FIXTURES } from "./igra-fixtures";
import { bestStreakText, levelRingGeometry, shellProgressView, streakStripLabel, weekRankHint } from "./igra-shell";
import type { Locale } from "./i18n";

/**
 * Ljuska aplikacije (K06): šta red napretka, prsten nivoa i panel „Moj napredak" prikazuju
 * i kažu, plus provere nad izvorom - donji meni ostaje na 4 slota, ljuska ne učitava
 * slike, a slavlje se montira samo u ljusci aplikacije i samo lenjo.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const LOCALES: Locale[] = ["sr", "en"];
/** Reči pretnje i žurbe kojih u tekstovima napretka ne sme da bude (O9). */
const FEAR = /izgubi|propusti|požuri|kazn|ističe|lose|hurry|miss|penalt|expire/i;

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = `${dir}/${entry}`;
    if (statSync(join(ROOT, path)).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

describe("levelRingGeometry", () => {
  it("linija ostaje u kutiji i obim je obim kruga", () => {
    const ring = levelRingGeometry(40, 4, 0.5);
    expect(ring.center).toBe(20);
    expect(ring.radius).toBe(18);
    expect(ring.radius + 4 / 2).toBe(40 / 2);
    expect(ring.circumference).toBeCloseTo(2 * Math.PI * 18, 6);
  });

  it("prazan prsten je ceo pomak, pun je nula, polovina je pola obima", () => {
    const { circumference } = levelRingGeometry(58, 3, 0);
    expect(levelRingGeometry(58, 3, 0).offset).toBeCloseTo(circumference, 6);
    expect(levelRingGeometry(58, 3, 1).offset).toBe(0);
    expect(levelRingGeometry(58, 3, 0.5).offset).toBeCloseTo(circumference / 2, 6);
  });

  it("steže napredak na 0..1 i ne pada na lošem ulazu", () => {
    const { circumference } = levelRingGeometry(28, 2.5, 0);
    expect(levelRingGeometry(28, 2.5, -3).offset).toBeCloseTo(circumference, 6);
    expect(levelRingGeometry(28, 2.5, 7).offset).toBe(0);
    expect(levelRingGeometry(28, 2.5, Number.NaN).offset).toBeCloseTo(circumference, 6);
    expect(levelRingGeometry(2, 10, 0.5).radius).toBe(0);
  });
});

describe("shellProgressView", () => {
  it("aktivan korisnik: nivo, napredak kroz nivo, XP i niz", () => {
    const view = shellProgressView(IGRA_FIXTURES.aktivan, "sr");
    expect(view).toMatchObject({ level: 5, levelName: "Graditelj", progress: 0.49, xpText: "490 / 1.000 XP", streakCount: "6", streakBurning: true });
    expect(view.label).toBe("Moj napredak: Graditelj. Nivo 5, 490 od 1.000 XP. Niz: 6 dana. Danas je upisano, plamen gori.");
    expect(shellProgressView(IGRA_FIXTURES.aktivan, "en")).toMatchObject({ levelName: "Builder", xpText: "490 / 1,000 XP" });
    expect(shellProgressView(IGRA_FIXTURES.aktivan, "en").label).toBe("My progress: Builder. Level 5, 490 of 1,000 XP. Streak: 6 days. Today is logged, the flame is lit.");
  });

  it("nov korisnik: prazan prsten, plamen tinja, poziv bez pretnje", () => {
    const view = shellProgressView(IGRA_FIXTURES.novi, "sr");
    expect(view).toMatchObject({ level: 1, levelName: "Početnik", progress: 0, xpText: "0 / 100 XP", streakCount: "0", streakBurning: false });
    expect(view.label).toContain("Jedna lekcija ili rad i niz počinje.");
  });

  it("poslednji nivo: pun prsten i ukupan XP umesto razlomka", () => {
    const view = shellProgressView(IGRA_FIXTURES.legenda, "sr");
    expect(view).toMatchObject({ level: 12, levelName: "Legenda", progress: 1, xpText: "23.480 XP" });
    expect(view.label).toContain("najviši nivo");
  });

  it("niz koji danas još nije upisan tinja, ali broj ostaje", () => {
    const view = shellProgressView({ xp: 1890, streak: { current: 6, todayDone: false } }, "sr");
    expect(view).toMatchObject({ streakCount: "6", streakBurning: false });
  });

  it("loš ulaz ne ruši red", () => {
    expect(shellProgressView({ xp: Number.NaN, streak: { current: -4, todayDone: false } }, "sr")).toMatchObject({ level: 1, progress: 0, streakCount: "0" });
  });

  it("naziv dugmeta nikad ne plaši i ne požuruje (O9)", () => {
    for (const id of IGRA_FIXTURE_IDS) {
      for (const locale of LOCALES) {
        expect(shellProgressView(IGRA_FIXTURES[id], locale).label, `${id}/${locale}`).not.toMatch(FEAR);
        expect(shellProgressView({ xp: IGRA_FIXTURES[id].xp, streak: { current: 5, todayDone: false } }, locale).label, `${id}/${locale}`).not.toMatch(FEAR);
      }
    }
  });
});

describe("panel", () => {
  it("traka niza ima rečenicu za čitač ekrana umesto 14 tačaka", () => {
    const { recent } = IGRA_FIXTURES.aktivan.streak;
    const active = recent.filter((day) => day.state === "active").length;
    expect(recent).toHaveLength(14);
    expect(streakStripLabel(recent, "sr")).toBe(`Aktivno ${active} od poslednjih 14 dana.`);
    expect(streakStripLabel(recent, "en")).toBe(`Active on ${active} of the last 14 days.`);
    expect(streakStripLabel(IGRA_FIXTURES.novi.streak.recent, "sr")).toBe("Aktivno 0 od poslednjih 14 dana.");
  });

  it("najduži niz ima množinu po jeziku", () => {
    expect(bestStreakText(9, "sr")).toBe("Najduži niz: 9 dana");
    expect(bestStreakText(1, "sr")).toBe("Najduži niz: 1 dan");
    expect(bestStreakText(1, "en")).toBe("Longest streak: 1 day");
    expect(bestStreakText(64, "en")).toBe("Longest streak: 64 days");
    expect(bestStreakText(Number.NaN, "sr")).toBe("Najduži niz: 0 dana");
  });

  it("mesto na nedeljnoj listi: čip govori sam, a bez mesta stoji blaga rečenica", () => {
    expect(weekRankHint({ weekXp: 435, weekRank: 7, eligible: true }, "sr")).toBeNull();
    expect(weekRankHint({ weekXp: 0, weekRank: null, eligible: true }, "sr")).toBe("Prva lekcija ili rad ove nedelje i na listi si.");
    expect(weekRankHint({ weekXp: 120, weekRank: null, eligible: true }, "sr")).toBe("Van prvih 100 ove nedelje. Tačno mesto je na rang listi.");
    expect(weekRankHint({ weekXp: 900, weekRank: null, eligible: false }, "sr")).toBe("Nalozi tima nisu na rang listi.");
    expect(weekRankHint({ weekXp: 0, weekRank: null, eligible: true }, "en")).toBe("One lesson or creation this week puts you on the board.");
  });

  it("nijedna rečenica uz nedeljnu listu ne plaši (O9)", () => {
    for (const locale of LOCALES) {
      for (const input of [
        { weekXp: 0, weekRank: null, eligible: true },
        { weekXp: 50, weekRank: null, eligible: true },
        { weekXp: 50, weekRank: null, eligible: false },
      ]) {
        expect(weekRankHint(input, locale)).not.toMatch(FEAR);
      }
    }
  });
});

describe("ljuska (izvor)", () => {
  const sidebar = read("components/app/app-sidebar.tsx");
  const SHELL_FILES = ["components/igra/shell-progress.tsx", "components/igra/level-ring.tsx"];

  it("donji meni na telefonu ostaje na tačno 4 slota, bez napretka u njemu", () => {
    const start = sidebar.indexOf("function AppBottomNav(");
    const bottomNav = sidebar.slice(start, sidebar.indexOf("function AppSidebarContent("));
    expect(start).toBeGreaterThan(-1);
    expect(bottomNav).toContain('<ul className="grid grid-cols-4">');
    // Pet zapisa, četiri slota: treći je „Sekcije" ILI „Zajednica" (jedan uslov).
    expect([...bottomNav.matchAll(/key: "([a-z]+)"/g)].map((match) => match[1])).toEqual(["dashboard", "classroom", "sections", "community", "messages"]);
    expect(bottomNav.match(/contextActive\s*\?/g)).toHaveLength(1);
    expect(bottomNav).not.toMatch(/ShellProgress|igraShell|LevelRing/);
  });

  it("napredak je u mobilnom zaglavlju, u sidebaru i u rail-u", () => {
    expect(sidebar).toContain("<ShellProgressChip");
    expect(sidebar).toContain("<ShellProgressRow");
    expect(sidebar).toContain("<ShellProgressRail");
    expect(sidebar.match(/<LevelRing /g)).toHaveLength(2);
  });

  it("ljuska ne učitava slike: pečat i prsten su crtani u kodu", () => {
    for (const file of SHELL_FILES) {
      const source = read(file);
      expect(source, file).not.toMatch(/<img\b|IgraArt|igra-art|\/brand\/igra\//);
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, file).not.toMatch(/rounded-[\w[\]./-]+!|!rounded-|borderRadius/);
    }
  });

  it("početni JS ljuske ne nosi katalog bedževa ni manifest slika", () => {
    const HEAVY = /from "[^"]*(igra-badges|igra-badge-view|igra-art|igra-celebrations|manifest\.json)"/;
    // Ovo se učitava na SVAKOJ strani aplikacije; bedževi i slike stižu tek sa panelom.
    for (const file of [...SHELL_FILES, "lib/igra-shell.ts", "lib/igra-a11y.ts", "components/igra/igra-progress-context.tsx"]) {
      expect(read(file), file).not.toMatch(HEAVY);
    }
    expect(read("components/igra/igra-progress-provider.tsx")).not.toMatch(HEAVY);
  });

  it("delovi ljuske i panel su prezentacioni: bez upita i mutacija", () => {
    for (const file of [...SHELL_FILES, "components/igra/progress-panel.tsx"]) {
      expect(read(file), file).not.toMatch(/from "convex\/react"|_generated\/api|useQuery|useMutation|igra-fixtures/);
    }
  });

  it("kontekst napretka ne uvlači Convex u izvršni kod (samo tip)", () => {
    const context = read("components/igra/igra-progress-context.tsx");
    expect(context).toContain('import type { api } from "@/convex/_generated/api";');
    expect(context).not.toMatch(/from "convex\/react"/);
  });

  it("slavlje i panel se učitavaju lenjo, bez SSR-a", () => {
    const provider = read("components/igra/igra-progress-provider.tsx");
    expect(provider).not.toMatch(/^import .*(celebration-host|progress-panel)/m);
    expect(provider.match(/dynamic\(\(\) => import\("@\/components\/igra\/(celebration-host|progress-panel)"\)[^\n]*\{ ssr: false \}\)/g)).toHaveLength(2);
  });

  it("domaćin slavlja živi samo u ljusci aplikacije - nikad na javnom sajtu", () => {
    const files = [...sources("app"), ...sources("components")];
    const importers = (needle: string) => files.filter((file) => read(file).includes(needle));
    expect(importers("igra/igra-progress-provider")).toEqual(["components/app/app-shell.tsx"]);
    expect(importers("igra/celebration-host").sort()).toEqual([
      "components/igra/igra-progress-provider.tsx",
      "components/igra/izlog/izlog-ljuska.tsx",
      "components/igra/izlog/izlog-pokret.tsx",
      "components/igra/izlog/izlog-ucionica.tsx",
    ]);
    // `AppShell` montira samo deo iza prijave (`app/[locale]/app/*`).
    expect(sources("app").filter((file) => read(file).includes("AppShell") && !file.startsWith("app/[locale]/app/"))).toEqual([]);
  });
});
