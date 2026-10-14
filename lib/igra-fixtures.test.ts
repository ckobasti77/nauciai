import { describe, expect, it } from "vitest";

import { IGRA_BADGE_KEYS } from "./igra-badges";
import { planCelebrations } from "./igra-celebrations";
import { IGRA_FIXTURE_IDS, IGRA_FIXTURE_LABEL, IGRA_FIXTURE_TODAY, IGRA_FIXTURES } from "./igra-fixtures";
import { levelFromXp } from "./igra-level";

describe("IGRA_FIXTURES", () => {
  it("svaki korisnik ima naziv, misiju i oblik odgovora `igra:getMyProgress`", () => {
    expect(Object.keys(IGRA_FIXTURES)).toEqual([...IGRA_FIXTURE_IDS]);
    for (const id of IGRA_FIXTURE_IDS) {
      const progress = IGRA_FIXTURES[id];
      expect(IGRA_FIXTURE_LABEL[id].sr, id).not.toBe("");
      expect(progress.level, id).toEqual(levelFromXp(progress.xp));
      expect(progress.badges.map((badge) => badge.key), id).toEqual([...IGRA_BADGE_KEYS]);
      expect(progress.weekXp, id).toBeLessThanOrEqual(progress.xp);
      expect(progress.streak.recent.at(-1)?.dayKey, id).toBe(IGRA_FIXTURE_TODAY);
    }
  });

  it("stanje bedža i njegova polja se slažu (kao na serveru)", () => {
    for (const id of IGRA_FIXTURE_IDS) {
      const { badges, fresh } = IGRA_FIXTURES[id];
      for (const badge of badges) {
        expect(badge.unlockedAt !== null, `${id} ${badge.key}`).toBe(badge.state === "unlocked");
        if (badge.state !== "locked") expect(badge.progress, `${id} ${badge.key}`).toBeNull();
      }
      expect(fresh.badges, id).toEqual(badges.filter((badge) => badge.state === "fresh").map((badge) => badge.key));
    }
  });

  it("novi korisnik: nula svega, sve zaključano, dnevnik prazan", () => {
    const { xp, level, streak, badges, fresh, weekRank } = IGRA_FIXTURES.novi;
    expect(xp).toBe(0);
    expect(level.level).toBe(1);
    expect(weekRank).toBeNull();
    expect(streak.current).toBe(0);
    expect(streak.todayDone).toBe(false);
    expect(badges.every((badge) => badge.state === "locked" || badge.state === "soon")).toBe(true);
    expect(fresh).toEqual({ level: null, badges: [], courses: [], ledgerEmpty: true });
    expect(planCelebrations(fresh, fresh.ledgerEmpty).show).toEqual([]);
  });

  it("aktivan: nivo 5 usred trake, niz gori, sva četiri stanja bedža", () => {
    const { level, streak, badges, fresh, weekRank } = IGRA_FIXTURES.aktivan;
    expect(level.level).toBe(5);
    expect(level.progress).toBeGreaterThan(0.2);
    expect(level.progress).toBeLessThan(0.8);
    expect(weekRank).toBe(7);
    expect(streak.current).toBe(6);
    expect(streak.best).toBe(9);
    expect(streak.todayDone).toBe(true);
    expect(new Set(badges.map((badge) => badge.state))).toEqual(new Set(["unlocked", "fresh", "locked", "soon"]));
    expect(fresh.badges).toEqual(["niz-7", "top-10"]);
    expect(fresh.ledgerEmpty).toBe(false);
    expect(planCelebrations(fresh, fresh.ledgerEmpty).show.map((item) => item.key)).toEqual(["badge:niz-7", "badge:top-10"]);
  });

  it("aktivan: zaključani bedževi koji se broje nose napredak ispod cilja", () => {
    const counted = IGRA_FIXTURES.aktivan.badges.filter((badge) => badge.progress !== null);
    expect(counted.map((badge) => badge.key)).toEqual(["tri-kursa", "sto-radova", "omiljen", "mentor", "niz-30"]);
    for (const badge of counted) expect(badge.progress!.current, badge.key).toBeLessThan(badge.progress!.target);
  });

  it("legenda: poslednji nivo, sve osvojeno i viđeno, prvo mesto", () => {
    const { level, streak, badges, fresh, weekRank } = IGRA_FIXTURES.legenda;
    expect(level.level).toBe(12);
    expect(level.xpForNext).toBeNull();
    expect(weekRank).toBe(1);
    expect(streak.current).toBeGreaterThanOrEqual(30);
    expect(badges.every((badge) => badge.state === "unlocked")).toBe(true);
    expect(fresh.badges).toEqual([]);
  });
});
