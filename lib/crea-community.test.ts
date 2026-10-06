import { describe, expect, test } from "vitest";

import {
  AUTHOR_REWARD_CREDITS,
  AUTHOR_REWARDS_PER_DAY,
  AUTHOR_REWARDS_PER_MONTH,
  authorRewardBlock,
  cleanPublicTitle,
  INVITE_CODE_LENGTH,
  INVITE_REWARD_CREDITS,
  INVITE_REWARDS_PER_MONTH,
  inviteRewardBlock,
  isInviteCode,
  makeInviteCode,
  monthKeyOfDay,
  pairStreakDays,
  pairWindowStart,
  PUBLIC_TITLE_MAX,
  remixQuery,
  styleQuery,
} from "./crea-community";
import { creaModeDef, parseCreaShellState } from "./crea-shell";

/** Režim iz URL-a (prvi režim oblasti se ne piše u URL). */
function shellOf(query: URLSearchParams) {
  const state = parseCreaShellState(query);
  return { area: state.area, mode: state.area ? creaModeDef(state.area, state.mode).id : null, tool: state.tool };
}
import { computeStreak } from "./crea-streak";

describe("galerija (G8)", () => {
  test("naslov: sabijeni razmaci, prazno = bez naslova, predug baca", () => {
    expect(cleanPublicTitle("  Mačka   u svemiru ")).toBe("Mačka u svemiru");
    expect(cleanPublicTitle("   ")).toBeNull();
    expect(cleanPublicTitle(undefined)).toBeNull();
    expect(cleanPublicTitle("x".repeat(PUBLIC_TITLE_MAX))).toHaveLength(PUBLIC_TITLE_MAX);
    expect(() => cleanPublicTitle("x".repeat(PUBLIC_TITLE_MAX + 1))).toThrow("PREDUG_NASLOV");
  });
});

describe("„Napravi svoju verziju\" i „Koristi stil\"", () => {
  test("model rada + podeljen opis + zasluga; bez opisa samo model", () => {
    const query = new URLSearchParams(remixQuery("rad1", { area: "video", mode: "napravi", modelSlug: "veo-31", toolId: null }, "pas trči"));
    expect(shellOf(query)).toEqual({ area: "video", mode: "napravi", tool: null });
    expect(query.get("model")).toBe("veo-31");
    expect(query.get("opis")).toBe("pas trči");
    expect(query.get("remiks")).toBe("rad1");
    expect(new URLSearchParams(remixQuery("rad1", { area: "slika", mode: "napravi", modelSlug: "nano-banana-2", toolId: null }, null)).get("opis")).toBeNull();
  });

  test("rad lokalnog alata otvara isti alat, bez zasluge (ništa se ne plaća)", () => {
    const query = new URLSearchParams(remixQuery("rad2", { area: "slika", mode: "alati", modelSlug: null, toolId: "slika.format" }, "x"));
    expect(shellOf(query)).toEqual({ area: "slika", mode: "alati", tool: "slika.format" });
    expect(query.get("remiks")).toBeNull();
    expect(query.get("opis")).toBeNull();
  });

  test("deljen stil ide u Slika · Napravi", () => {
    const query = new URLSearchParams(styleQuery("stil9"));
    expect(shellOf(query)).toMatchObject({ area: "slika", mode: "napravi" });
    expect(query.get("stil")).toBe("stil9");
  });
});

describe("nagrade autorima (G11)", () => {
  const ok = { sameUser: false, paidCredits: 16, alreadyForUser: false, todayCount: 0, monthCount: 0 };

  test("nagrada je mala i nikad veća od plaćenog posla", () => {
    expect(AUTHOR_REWARD_CREDITS).toBeLessThanOrEqual(5);
    expect(authorRewardBlock(ok)).toBeNull();
    expect(authorRewardBlock({ ...ok, paidCredits: AUTHOR_REWARD_CREDITS - 1 })).toBe("BESPLATAN_RAD");
    expect(authorRewardBlock({ ...ok, paidCredits: 0 })).toBe("BESPLATAN_RAD");
  });

  test("zaštita: sebi, isti korisnik dvaput, dnevni i mesečni plafon", () => {
    expect(authorRewardBlock({ ...ok, sameUser: true })).toBe("ISTI_AUTOR");
    expect(authorRewardBlock({ ...ok, alreadyForUser: true })).toBe("VEC_NAGRADJENO");
    expect(authorRewardBlock({ ...ok, todayCount: AUTHOR_REWARDS_PER_DAY })).toBe("DNEVNI_LIMIT");
    expect(authorRewardBlock({ ...ok, todayCount: AUTHOR_REWARDS_PER_DAY - 1 })).toBeNull();
    expect(authorRewardBlock({ ...ok, monthCount: AUTHOR_REWARDS_PER_MONTH })).toBe("MESECNI_LIMIT");
    expect(monthKeyOfDay("2026-10-06")).toBe("2026-10");
  });
});

describe("kreativni par i pozivi (G10)", () => {
  test("kod poziva: dužina i azbuka bez zbunjujućih znakova", () => {
    let seed = 0;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const codes = Array.from({ length: 50 }, () => makeInviteCode(random));
    for (const code of codes) {
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      expect(isInviteCode(code), code).toBe(true);
      expect(code).not.toMatch(/[01ilo]/);
    }
    expect(isInviteCode("ABCDEFGH")).toBe(false);
    expect(isInviteCode("abc")).toBe(false);
  });

  test("zajednički niz: samo dani kad su oboje radili, od nastanka para", () => {
    const ana = [
      { dayKey: "2026-10-01", lessons: 1 },
      { dayKey: "2026-10-03", lessons: 0, creaWorks: 2 },
      { dayKey: "2026-10-04", lessons: 1 },
      { dayKey: "2026-10-05", lessons: 1 },
    ];
    const bora = [
      { dayKey: "2026-10-01", lessons: 1 },
      { dayKey: "2026-10-03", lessons: 1 },
      { dayKey: "2026-10-04", lessons: 0, creaWorks: 0 },
      { dayKey: "2026-10-05", lessons: 0, creaWorks: 1 },
    ];
    const days = pairStreakDays(ana, bora, "2026-10-02");
    expect(days.map((day) => day.dayKey)).toEqual(["2026-10-03", "2026-10-05"]);
    expect(computeStreak(days, "2026-10-06").current).toBe(1);
    expect(pairWindowStart("2026-10-06", "2026-10-02")).toBe("2026-10-02");
    expect(pairWindowStart("2026-10-06", "2020-01-01")).toBe("2026-06-08");
  });

  test("nagrada za poziv: nov nalog, lekcija I rad, jednom, mesečni plafon", () => {
    const ready = { rewardEligible: true, rewarded: false, friendLessonDone: true, friendWorkDone: true, rewardsThisMonth: 0 };
    expect(INVITE_REWARD_CREDITS).toBeLessThanOrEqual(10);
    expect(inviteRewardBlock(ready)).toBeNull();
    expect(inviteRewardBlock({ ...ready, rewardEligible: false })).toBe("NIJE_NOV_NALOG");
    expect(inviteRewardBlock({ ...ready, rewarded: true })).toBe("VEC_PREUZETO");
    expect(inviteRewardBlock({ ...ready, friendLessonDone: false })).toBe("PRIJATELJ_NIJE_ZAVRSIO");
    expect(inviteRewardBlock({ ...ready, friendWorkDone: false })).toBe("PRIJATELJ_NIJE_ZAVRSIO");
    expect(inviteRewardBlock({ ...ready, rewardsThisMonth: INVITE_REWARDS_PER_MONTH })).toBe("MESECNI_LIMIT");
  });
});
