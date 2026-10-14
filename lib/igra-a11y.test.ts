import { describe, expect, it } from "vitest";

import { clampLevel, formatLevel, formatXp, levelLabel, levelName, rankChipView, streakFlameView, xpBarA11y, xpBarCaption, xpBarFraction } from "./igra-a11y";
import { badgeStickerView, badgeTally, shelfBadges, type IgraBadgeViewState } from "./igra-badge-view";
import { IGRA_BADGE_KEYS, igraBadge, type IgraBadgeKey } from "./igra-badges";

describe("formatiranje XP-a i nivoa", () => {
  it("XP nosi separator hiljada po jeziku i jedinicu", () => {
    expect(formatXp(0, "sr")).toBe("0 XP");
    expect(formatXp(999, "sr")).toBe("999 XP");
    expect(formatXp(1250, "sr")).toBe("1.250 XP");
    expect(formatXp(1250, "en")).toBe("1,250 XP");
    expect(formatXp(23480, "sr")).toBe("23.480 XP");
  });

  it("loš XP je nula, razlomak se zaokružuje nadole", () => {
    expect(formatXp(-40, "sr")).toBe("0 XP");
    expect(formatXp(Number.NaN, "sr")).toBe("0 XP");
    expect(formatXp(Number.POSITIVE_INFINITY, "en")).toBe("0 XP");
    expect(formatXp(99.9, "sr")).toBe("99 XP");
  });

  it("nivo se steže na 1..12", () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(-3)).toBe(1);
    expect(clampLevel(3.9)).toBe(3);
    expect(clampLevel(12)).toBe(12);
    expect(clampLevel(40)).toBe(12);
    expect(clampLevel(Number.NaN)).toBe(1);
  });

  it("nivo ima broj, ime i naziv za čitač ekrana na oba jezika", () => {
    expect(formatLevel(3, "sr")).toBe("Nivo 3");
    expect(formatLevel(3, "en")).toBe("Level 3");
    expect(levelName(3, "sr")).toBe("Skicar");
    expect(levelName(12, "en")).toBe("Legend");
    expect(levelLabel(3, "sr")).toBe("Nivo 3: Skicar");
    expect(levelLabel(99, "en")).toBe("Level 12: Legend");
  });
});

describe("XP traka", () => {
  it("natpis kaže koliko fali do sledećeg nivoa", () => {
    expect(xpBarCaption(0, "sr")).toBe("još 100 XP do nivoa 2");
    expect(xpBarCaption(1890, "sr")).toBe("još 510 XP do nivoa 6");
    expect(xpBarCaption(1890, "en")).toBe("510 XP to level 6");
    expect(xpBarCaption(15000, "sr")).toBe("još 5.000 XP do nivoa 12");
  });

  it("na poslednjem nivou nema „još\", ni razlomka", () => {
    expect(xpBarCaption(20000, "sr")).toBe("Najviši nivo");
    expect(xpBarCaption(23480, "en")).toBe("Top level");
    expect(xpBarFraction(23480, "sr")).toBeNull();
  });

  it("razlomak je XP unutar nivoa kroz korak nivoa", () => {
    expect(xpBarFraction(0, "sr")).toBe("0 / 100 XP");
    expect(xpBarFraction(1890, "sr")).toBe("490 / 1.000 XP");
    expect(xpBarFraction(1890, "en")).toBe("490 / 1,000 XP");
  });

  it("ima ulogu, naziv i vrednost 0..100 kroz tekući nivo", () => {
    const a11y = xpBarA11y(1890, "sr");
    expect(a11y.role).toBe("progressbar");
    expect(a11y["aria-label"]).toBe("Napredak nivoa");
    expect(a11y["aria-valuemin"]).toBe(0);
    expect(a11y["aria-valuemax"]).toBe(100);
    expect(a11y["aria-valuenow"]).toBe(49);
    expect(a11y["aria-valuetext"]).toBe("Nivo 5, 490 od 1.000 XP");
    expect(xpBarA11y(1890, "en")["aria-valuetext"]).toBe("Level 5, 490 of 1,000 XP");
    expect(xpBarA11y(1890, "en")["aria-label"]).toBe("Level progress");
  });

  it("vrednost se zaokružuje nadole: pred sam prag nije 100", () => {
    expect(xpBarA11y(0, "sr")["aria-valuenow"]).toBe(0);
    expect(xpBarA11y(99, "sr")["aria-valuenow"]).toBe(99);
    expect(xpBarA11y(100, "sr")["aria-valuenow"]).toBe(0);
    expect(xpBarA11y(19999, "sr")["aria-valuenow"]).toBe(99);
  });

  it("poslednji nivo je puna traka sa ukupnim XP-om u tekstu", () => {
    const a11y = xpBarA11y(23480, "sr");
    expect(a11y["aria-valuenow"]).toBe(100);
    expect(a11y["aria-valuetext"]).toBe("Nivo 12, najviši nivo, 23.480 XP");
  });

  it("loš XP se čita kao nula", () => {
    for (const xp of [-5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const a11y = xpBarA11y(xp, "sr");
      expect(a11y["aria-valuenow"]).toBe(0);
      expect(a11y["aria-valuetext"]).toBe("Nivo 1, 0 od 100 XP");
    }
  });
});

describe("stanja bedža", () => {
  it("osvojen: u boji, sa sjajem, uslov ostaje u oblačiću", () => {
    const view = badgeStickerView("pet-lekcija", "unlocked", null, "sr");
    expect(view).toEqual({
      name: "Pet lekcija",
      detail: "Završi 5 lekcija",
      status: "Osvojeno",
      tag: null,
      label: "Pet lekcija — osvojeno",
      locked: false,
      peel: true,
    });
  });

  it("nov: isto što i osvojen, uz etiketu „Novo\"", () => {
    const view = badgeStickerView("niz-7", "fresh", null, "sr");
    expect(view.tag).toBe("Novo");
    expect(view.locked).toBe(false);
    expect(view.peel).toBe(true);
    expect(view.label).toBe("Niz od 7 dana — novo, osvojeno");
    expect(badgeStickerView("niz-7", "fresh", null, "en").label).toBe("7-day streak — new, earned");
  });

  it("zaključan: silueta, uslov i napredak u nazivu", () => {
    const view = badgeStickerView("pet-lekcija", "locked", { current: 3, target: 5 }, "sr");
    expect(view.locked).toBe(true);
    expect(view.peel).toBe(false);
    expect(view.tag).toBeNull();
    expect(view.detail).toBe("Završi 5 lekcija");
    expect(view.status).toBe("3 / 5");
    expect(view.label).toBe("Pet lekcija — Završi 5 lekcija, 3 od 5");
    expect(badgeStickerView("pet-lekcija", "locked", { current: 3, target: 5 }, "en").label).toBe("Five lessons — Complete 5 lessons, 3 of 5");
  });

  it("zaključan bez brojača nema napredak", () => {
    const view = badgeStickerView("prva-lekcija", "locked", null, "sr");
    expect(view.status).toBeNull();
    expect(view.label).toBe("Prva lekcija — Završi prvu lekciju");
    expect(badgeStickerView("prva-lekcija", "locked", undefined, "sr").status).toBeNull();
  });

  it("napredak ne prelazi cilj i ne ide ispod nule", () => {
    expect(badgeStickerView("pet-lekcija", "locked", { current: 9, target: 5 }, "sr").status).toBe("5 / 5");
    expect(badgeStickerView("pet-lekcija", "locked", { current: -2, target: 5 }, "sr").status).toBe("0 / 5");
    expect(badgeStickerView("pet-lekcija", "locked", { current: Number.NaN, target: 5 }, "sr").status).toBe("0 / 5");
  });

  it("„uskoro\": silueta bez uslova, ni u oblačiću ni u nazivu", () => {
    const view = badgeStickerView("izazov", "soon", null, "sr");
    expect(view).toEqual({ name: "Izazov", detail: null, status: "Uskoro", tag: "Uskoro", label: "Izazov — uskoro", locked: true, peel: false });
    const condition = igraBadge("izazov").condition;
    expect(view.label).not.toContain(condition.sr);
    expect(badgeStickerView("izazov", "soon", { current: 0, target: 1 }, "en").label).toBe("Challenge — coming soon");
  });

  it("svaki bedž u svakom stanju ima naziv koji počinje imenom", () => {
    const states: IgraBadgeViewState[] = ["unlocked", "fresh", "locked", "soon"];
    for (const key of IGRA_BADGE_KEYS) {
      for (const state of states) {
        for (const locale of ["sr", "en"] as const) {
          const view = badgeStickerView(key, state, null, locale);
          expect(view.label.startsWith(`${igraBadge(key).name[locale]} — `), `${key} ${state} ${locale}`).toBe(true);
          expect(view.locked, `${key} ${state}`).toBe(state === "locked" || state === "soon");
          expect(view.peel, `${key} ${state}`).toBe(!view.locked);
        }
      }
    }
  });
});

describe("polica bedževa", () => {
  const row = (key: IgraBadgeKey, state: IgraBadgeViewState, unlockedAt: number | null = null) => ({ key, state, unlockedAt });
  const badges = [
    row("prva-lekcija", "unlocked", 100),
    row("prvi-zadatak", "locked"),
    row("pet-lekcija", "unlocked", 300),
    row("izazov", "soon"),
    row("niz-7", "fresh"),
    row("prvi-kurs", "locked"),
    row("niz-3", "unlocked", 200),
  ];

  it("red: novi, pa osvojeni od najskorijeg, pa zaključani redom, „uskoro\" na kraju", () => {
    expect(shelfBadges(badges).map((badge) => badge.key)).toEqual(["niz-7", "pet-lekcija", "niz-3", "prva-lekcija", "prvi-zadatak", "prvi-kurs", "izazov"]);
  });

  it("`max` seče red, a ulaz se ne menja", () => {
    const before = badges.map((badge) => badge.key);
    expect(shelfBadges(badges, 3).map((badge) => badge.key)).toEqual(["niz-7", "pet-lekcija", "niz-3"]);
    expect(shelfBadges(badges, 0)).toEqual([]);
    expect(shelfBadges(badges, 99)).toHaveLength(badges.length);
    expect(badges.map((badge) => badge.key)).toEqual(before);
  });

  it("nov korisnik vidi prve zaključane bedževe (polica nije prazna)", () => {
    const locked = IGRA_BADGE_KEYS.map((key) => row(key, "locked"));
    expect(shelfBadges(locked, 3).map((badge) => badge.key)).toEqual(["prva-lekcija", "prvi-zadatak", "pet-lekcija"]);
  });

  it("zbir broji osvojene i nove", () => {
    expect(badgeTally(badges, "sr")).toEqual({ earned: 4, total: 7, text: "4 / 7", label: "4 od 7 bedževa" });
    expect(badgeTally(badges, "en").label).toBe("4 of 7 badges");
    expect(badgeTally(IGRA_BADGE_KEYS.map((key) => row(key, "locked")), "sr").label).toBe("0 od 24 bedža");
  });
});

describe("plamen niza", () => {
  it("danas upisano: plamen gori, bez poziva", () => {
    const view = streakFlameView(6, true, "sr");
    expect(view.burning).toBe(true);
    expect(view.count).toBe("6");
    expect(view.unit).toBe("dana");
    expect(view.label).toBe("Niz: 6 dana. Danas je upisano, plamen gori.");
  });

  it("danas još ne: tinja, uz blag poziv", () => {
    const view = streakFlameView(6, false, "sr");
    expect(view.burning).toBe(false);
    expect(view.hint).toBe("Jedna lekcija ili rad i plamen gori.");
    expect(streakFlameView(6, false, "en").label).toBe("Streak: 6 days. One lesson or creation and the flame is lit.");
  });

  it("bez niza: poziv da počne", () => {
    const view = streakFlameView(0, false, "sr");
    expect(view.count).toBe("0");
    expect(view.burning).toBe(false);
    expect(view.hint).toBe("Jedna lekcija ili rad i niz počinje.");
  });

  it("množina dana po jeziku", () => {
    expect(streakFlameView(1, true, "sr").unit).toBe("dan");
    expect(streakFlameView(2, true, "sr").unit).toBe("dana");
    expect(streakFlameView(21, true, "sr").unit).toBe("dan");
    expect(streakFlameView(112, true, "sr").unit).toBe("dana");
    expect(streakFlameView(1, true, "en").unit).toBe("day");
    expect(streakFlameView(21, true, "en").unit).toBe("days");
  });

  it("poziv nikad ne preti gubitkom (O9)", () => {
    for (const locale of ["sr", "en"] as const) {
      for (const view of [streakFlameView(0, false, locale), streakFlameView(9, false, locale), streakFlameView(9, true, locale)]) {
        expect(view.hint).not.toMatch(/izgubi|propašć|propada|poslednja šansa|požuri|lose|expire|hurry|last chance/i);
      }
    }
  });

  it("loš broj dana je nula", () => {
    expect(streakFlameView(-4, false, "sr").count).toBe("0");
    expect(streakFlameView(Number.NaN, false, "sr").count).toBe("0");
  });
});

describe("rang čip", () => {
  it("prva tri mesta nose medalju", () => {
    expect(rankChipView(1, "sr")).toEqual({ text: "#1", label: "1. mesto na listi", medal: "zlato", ranked: true });
    expect(rankChipView(2, "sr").medal).toBe("srebro");
    expect(rankChipView(3, "sr").medal).toBe("bronza");
    expect(rankChipView(4, "sr").medal).toBeNull();
  });

  it("ostala mesta su samo broj, sa separatorom hiljada", () => {
    expect(rankChipView(42, "sr")).toEqual({ text: "#42", label: "42. mesto na listi", medal: null, ranked: true });
    expect(rankChipView(1280, "sr").text).toBe("#1.280");
    expect(rankChipView(1280, "en")).toEqual({ text: "#1,280", label: "Rank 1,280 on the leaderboard", medal: null, ranked: true });
  });

  it("bez mesta: crta i jasan naziv, bez medalje", () => {
    for (const rank of [null, undefined, 0, -1, Number.NaN]) {
      expect(rankChipView(rank, "sr")).toEqual({ text: "—", label: "Još bez mesta na listi", medal: null, ranked: false });
    }
    expect(rankChipView(null, "en").label).toBe("Not on the leaderboard yet");
  });
});
