import { describe, expect, it } from "vitest";

import { LEADERBOARD_XP } from "../convex/leaderboardCore";
import { igraArt, igraNivoArt, IGRA_NIVO_COUNT } from "./igra-art";
import { IGRA_LEVELS, IGRA_MAX_LEVEL, levelFromXp } from "./igra-level";

describe("IGRA_LEVELS", () => {
  it("ima 12 nivoa, redom od 1, a pragovi strogo rastu od 0", () => {
    expect(IGRA_LEVELS).toHaveLength(12);
    expect(IGRA_MAX_LEVEL).toBe(12);
    expect(IGRA_MAX_LEVEL).toBe(IGRA_NIVO_COUNT);
    expect(IGRA_LEVELS.map((row) => row.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(IGRA_LEVELS[0]!.minXp).toBe(0);
    for (let i = 1; i < IGRA_LEVELS.length; i += 1) {
      expect(IGRA_LEVELS[i]!.minXp, `nivo ${i + 1}`).toBeGreaterThan(IGRA_LEVELS[i - 1]!.minXp);
    }
  });

  it("i korak do sledećeg nivoa raste (svaki nivo je teži od prethodnog)", () => {
    const steps = IGRA_LEVELS.slice(1).map((row, i) => row.minXp - IGRA_LEVELS[i]!.minXp);
    expect(steps).toEqual([100, 200, 400, 700, 1000, 1400, 1800, 2400, 3000, 4000, 5000]);
  });

  it("imena se slažu sa amblemima u manifestu (sr i en)", () => {
    for (const row of IGRA_LEVELS) {
      const alt = igraArt(igraNivoArt(row.level)).alt;
      expect(alt.sr, `nivo ${row.level}`).toBe(`Nivo ${row.level}: ${row.name.sr}`);
      expect(alt.en, `nivo ${row.level}`).toContain(row.name.en);
    }
  });
});

describe("levelFromXp", () => {
  it("granice nivoa: prag pripada višem nivou", () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(299).level).toBe(2);
    expect(levelFromXp(300).level).toBe(3);
    expect(levelFromXp(1399).level).toBe(4);
    expect(levelFromXp(1400).level).toBe(5);
    expect(levelFromXp(19999).level).toBe(11);
    expect(levelFromXp(20000).level).toBe(12);
    for (const row of IGRA_LEVELS) {
      expect(levelFromXp(row.minXp).level, `prag ${row.minXp}`).toBe(row.level);
      if (row.minXp > 0) expect(levelFromXp(row.minXp - 1).level, `ispod ${row.minXp}`).toBe(row.level - 1);
    }
  });

  it("vraća ime, napredak unutar nivoa i koliko još fali", () => {
    expect(levelFromXp(540)).toEqual({
      level: 3,
      name: { sr: "Skicar", en: "Sketcher" },
      minXp: 300,
      nextMinXp: 700,
      xpIntoLevel: 240,
      xpForNext: 160,
      progress: 0.6,
    });
    expect(levelFromXp(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNext: 100, progress: 0 });
    expect(levelFromXp(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 200, progress: 0 });
  });

  it("napredak je uvek u [0, 1) ispod poslednjeg nivoa", () => {
    for (let xp = 0; xp < 20000; xp += 37) {
      const { progress, xpIntoLevel, xpForNext, minXp, nextMinXp } = levelFromXp(xp);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThan(1);
      expect(xpIntoLevel + xpForNext!).toBe(nextMinXp! - minXp);
    }
  });

  it("poslednji nivo: puna traka i nema sledećeg", () => {
    expect(levelFromXp(20000)).toMatchObject({ level: 12, nextMinXp: null, xpIntoLevel: 0, xpForNext: null, progress: 1 });
    expect(levelFromXp(1_000_000)).toMatchObject({ level: 12, xpIntoLevel: 980_000, xpForNext: null, progress: 1 });
  });

  it("loš ulaz se steže na 0, razlomak se zaokružuje nadole", () => {
    expect(levelFromXp(-50)).toMatchObject({ level: 1, xpIntoLevel: 0, progress: 0 });
    expect(levelFromXp(Number.NaN)).toMatchObject({ level: 1, xpIntoLevel: 0 });
    expect(levelFromXp(Number.POSITIVE_INFINITY)).toMatchObject({ level: 1, xpIntoLevel: 0 });
    expect(levelFromXp(99.9)).toMatchObject({ level: 1, xpIntoLevel: 99, xpForNext: 1 });
    expect(levelFromXp(100.4)).toMatchObject({ level: 2, xpIntoLevel: 0 });
  });
});

describe("kriva iz stvarnih vrednosti LEADERBOARD_XP (plan K01 §5.2)", () => {
  const XP = LEADERBOARD_XP;
  /** Redovna nedelja: 5 lekcija, 2 zadatka, 4 dana sa radom, 6 tehnika, recept, mini-lekcija, koristan odgovor. */
  const regularWeek =
    5 * XP.lesson + 2 * XP.required_task + 4 * XP.crea_daily_work + 6 * XP.crea_technique + XP.crea_recipe + XP.crea_mini_lesson + XP.helpful_comment;
  /** Jednokratno: prvi rad u svakoj od 3 oblasti Cree. */
  const firstWorks = 3 * XP.crea_first_work;

  it("prva lekcija prvog dana daje nivo 2", () => {
    expect(levelFromXp(XP.lesson).level).toBe(2);
  });

  it("tipičan prvi dan (2 lekcije, zadatak, prvi rad u Crei) ostaje na nivou 2", () => {
    const firstDay = 2 * XP.lesson + XP.required_task + XP.crea_first_work + XP.crea_daily_work;
    expect(firstDay).toBe(260);
    expect(levelFromXp(firstDay).level).toBe(2);
  });

  it("dve nedelje redovnog rada daju nivo 5", () => {
    expect(regularWeek).toBe(655);
    expect(levelFromXp(2 * regularWeek + firstWorks).level).toBe(5);
    expect(levelFromXp(regularWeek + firstWorks).level).toBe(4);
  });

  it("nivo 12 je retkost: više od pola godine redovnog rada", () => {
    const weeks = Math.ceil((IGRA_LEVELS[11]!.minXp - firstWorks) / regularWeek);
    expect(weeks).toBeGreaterThanOrEqual(26);
  });
});
