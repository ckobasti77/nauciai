import { describe, expect, it } from "vitest";

import { igraArt, igraBedzArt, type IgraBedzKey } from "./igra-art";
import {
  EMPTY_BADGE_COUNTERS,
  evaluateBadges,
  FAVORITE_UPVOTES,
  IGRA_BADGE_GROUP_LABEL,
  IGRA_BADGE_GROUPS,
  IGRA_BADGE_KEYS,
  IGRA_BADGES,
  igraBadge,
  isBadgePublic,
  MENTOR_HELPFUL_ANSWERS,
  type IgraBadgeCounters,
  type IgraBadgeKey,
} from "./igra-badges";

// Ključ kataloga i ključ iz manifesta (`IgraBedzKey`, K02) su isti tip, u oba smera:
// slavlje (`lib/igra-celebrations.ts`) prima ključeve iz `igra:getMyProgress` bez pretvaranja.
const _catalogToManifest: IgraBedzKey = "" as IgraBadgeKey;
const _manifestToCatalog: IgraBadgeKey = "" as IgraBedzKey;
void _catalogToManifest;
void _manifestToCatalog;

function state(counters: Partial<IgraBadgeCounters>) {
  const results = evaluateBadges({ ...EMPTY_BADGE_COUNTERS, ...counters });
  return Object.fromEntries(results.map((result) => [result.key, result])) as Record<IgraBadgeKey, (typeof results)[number]>;
}

function earned(counters: Partial<IgraBadgeCounters>): IgraBadgeKey[] {
  return evaluateBadges({ ...EMPTY_BADGE_COUNTERS, ...counters })
    .filter((result) => result.earned)
    .map((result) => result.key);
}

describe("katalog bedževa", () => {
  it("ima 24 jedinstvena ključa, po 8 u svakoj grupi", () => {
    expect(IGRA_BADGES).toHaveLength(24);
    expect(new Set(IGRA_BADGE_KEYS).size).toBe(24);
    for (const group of IGRA_BADGE_GROUPS) {
      expect(IGRA_BADGES.filter((badge) => badge.group === group), group).toHaveLength(8);
      expect(IGRA_BADGE_GROUP_LABEL[group].sr).toBeTruthy();
      expect(IGRA_BADGE_GROUP_LABEL[group].en).toBeTruthy();
    }
  });

  it("redosled je onaj iz docs/igra/SLIKE.md", () => {
    expect(IGRA_BADGE_KEYS).toEqual([
      "prva-lekcija", "prvi-zadatak", "pet-lekcija", "prvi-kurs", "tri-kursa", "staza", "nocna-sova", "rani-pevac",
      "prvi-rad", "deset-radova", "sto-radova", "prvi-video", "prvi-zvuk", "recept", "tehnika", "izazov",
      "prva-objava", "koristan-odgovor", "omiljen", "mentor", "niz-3", "niz-7", "niz-30", "top-10",
    ]);
  });

  it("svaki bedž ima sliku u manifestu i isto ime kao ona", () => {
    for (const badge of IGRA_BADGES) {
      const art = igraArt(igraBedzArt(badge.key));
      expect(art.kind, badge.key).toBe("bedz");
      expect(art.alt.sr, badge.key).toBe(`Bedž: ${badge.name.sr}`);
      expect(art.alt.en, badge.key).toBe(`Badge: ${badge.name.en}`);
    }
  });

  it("svaki bedž ima uslov na oba jezika i cilj od bar 1", () => {
    for (const badge of IGRA_BADGES) {
      expect(badge.condition.sr.length, badge.key).toBeGreaterThan(5);
      expect(badge.condition.en.length, badge.key).toBeGreaterThan(5);
      expect(Number.isInteger(badge.target) && badge.target >= 1, badge.key).toBe(true);
    }
    expect(igraBadge("pet-lekcija").condition.sr).toBe("Završi 5 lekcija");
  });

  it("uslov nikad ne plaši i ne obećava nagradu (O6, O9)", () => {
    const banned = /kredit|popust|nagrad|izgubi|poslednja šansa|credit|discount|reward|lose/i;
    for (const badge of IGRA_BADGES) {
      expect(`${badge.condition.sr} ${badge.condition.en} ${badge.name.sr} ${badge.name.en}`, badge.key).not.toMatch(banned);
    }
  });

  it("nalazi bedž po ključu", () => {
    expect(igraBadge("top-10").group).toBe("zajednica");
  });
});

describe("evaluateBadges", () => {
  it("prazan korisnik: 24 reda, ništa zarađeno, izazov je uskoro", () => {
    const results = evaluateBadges(EMPTY_BADGE_COUNTERS);
    expect(results.map((result) => result.key)).toEqual(IGRA_BADGE_KEYS);
    expect(results.filter((result) => result.earned)).toEqual([]);
    expect(results.filter((result) => result.soon).map((result) => result.key)).toEqual(["izazov"]);
  });

  it("učenje: granice lekcija i zadataka", () => {
    expect(earned({ completedLessons: 1 })).toEqual(["prva-lekcija"]);
    expect(earned({ completedLessons: 4 })).toEqual(["prva-lekcija"]);
    expect(earned({ completedLessons: 5 })).toEqual(["prva-lekcija", "pet-lekcija"]);
    expect(earned({ completedTasks: 1 })).toEqual(["prvi-zadatak"]);
  });

  it("učenje: kursevi i staza", () => {
    expect(earned({ completedCourses: 1 })).toEqual(["prvi-kurs"]);
    expect(earned({ completedCourses: 2 })).toEqual(["prvi-kurs"]);
    expect(earned({ completedCourses: 3 })).toEqual(["prvi-kurs", "tri-kursa"]);
    expect(earned({ completedTracks: 1 })).toEqual(["staza"]);
  });

  it("učenje: noćna sova i rani pevac", () => {
    expect(earned({ nightLessons: 1 })).toEqual(["nocna-sova"]);
    expect(earned({ earlyLessons: 2 })).toEqual(["rani-pevac"]);
  });

  it("Crea: prvi rad po oblasti", () => {
    expect(earned({ creaAreas: ["slika"] })).toEqual(["prvi-rad"]);
    expect(earned({ creaAreas: ["video"] })).toEqual(["prvi-rad", "prvi-video"]);
    expect(earned({ creaAreas: ["slika", "zvuk"] })).toEqual(["prvi-rad", "prvi-zvuk"]);
    expect(earned({ creaAreas: ["slika", "video", "zvuk"] })).toEqual(["prvi-rad", "prvi-video", "prvi-zvuk"]);
  });

  it("Crea: 10 i 100 radova", () => {
    expect(earned({ creaWorks: 9 })).toEqual([]);
    expect(earned({ creaWorks: 10 })).toEqual(["deset-radova"]);
    expect(earned({ creaWorks: 99 })).toEqual(["deset-radova"]);
    expect(earned({ creaWorks: 100 })).toEqual(["deset-radova", "sto-radova"]);
  });

  it("Crea: recept, tehnika i izazov", () => {
    expect(earned({ recipeWorks: 1 })).toEqual(["recept"]);
    expect(earned({ techniques: 1 })).toEqual(["tehnika"]);
    expect(earned({ challenges: 1, challengesOpen: true })).toEqual(["izazov"]);
  });

  it("izazov je uskoro dok izazovi ne rade; zarađen bedž nikad nije uskoro", () => {
    expect(state({ challengesOpen: false }).izazov).toMatchObject({ earned: false, soon: true, progress: null });
    expect(state({ challengesOpen: true }).izazov).toMatchObject({ earned: false, soon: false });
    expect(state({ challengesOpen: false, challenges: 1 }).izazov).toMatchObject({ earned: true, soon: false });
  });

  it("zajednica: objava, koristan odgovor, omiljen", () => {
    expect(earned({ threads: 1 })).toEqual(["prva-objava"]);
    expect(earned({ helpfulAnswers: 1 })).toEqual(["koristan-odgovor"]);
    expect(earned({ bestThreadUpvotes: FAVORITE_UPVOTES - 1 })).toEqual([]);
    expect(earned({ bestThreadUpvotes: FAVORITE_UPVOTES })).toEqual(["omiljen"]);
  });

  it("mentor: 5 korisnih odgovora ILI partner za učenje", () => {
    expect(earned({ helpfulAnswers: MENTOR_HELPFUL_ANSWERS - 1 })).toEqual(["koristan-odgovor"]);
    expect(earned({ helpfulAnswers: MENTOR_HELPFUL_ANSWERS })).toEqual(["koristan-odgovor", "mentor"]);
    expect(earned({ studyPartners: 1 })).toEqual(["mentor"]);
  });

  it("nizovi: 3, 7 i 30 dana po najdužem nizu", () => {
    expect(earned({ bestStreak: 2 })).toEqual([]);
    expect(earned({ bestStreak: 3 })).toEqual(["niz-3"]);
    expect(earned({ bestStreak: 7 })).toEqual(["niz-3", "niz-7"]);
    expect(earned({ bestStreak: 29 })).toEqual(["niz-3", "niz-7"]);
    expect(earned({ bestStreak: 30 })).toEqual(["niz-3", "niz-7", "niz-30"]);
  });

  it("top 10", () => {
    expect(earned({ weeklyTop10: true })).toEqual(["top-10"]);
  });

  it("napredak postoji samo za bedževe koji se broje i ne prelazi cilj", () => {
    const empty = state({});
    expect(empty["prva-lekcija"].progress).toBeNull();
    expect(empty["top-10"].progress).toBeNull();
    expect(empty["pet-lekcija"].progress).toEqual({ current: 0, target: 5 });
    expect(state({ completedLessons: 3 })["pet-lekcija"].progress).toEqual({ current: 3, target: 5 });
    expect(state({ completedLessons: 80 })["pet-lekcija"].progress).toEqual({ current: 5, target: 5 });
    expect(state({ creaWorks: 42 })["sto-radova"].progress).toEqual({ current: 42, target: 100 });
    expect(state({ bestStreak: 4 })["niz-7"].progress).toEqual({ current: 4, target: 7 });
    expect(state({ helpfulAnswers: 2 }).mentor.progress).toEqual({ current: 2, target: 5 });
    expect(state({ bestThreadUpvotes: 6 }).omiljen.progress).toEqual({ current: 6, target: 10 });
    const counted = IGRA_BADGES.filter((badge) => badge.target > 1).map((badge) => badge.key);
    expect(counted).toEqual(["pet-lekcija", "tri-kursa", "deset-radova", "sto-radova", "omiljen", "mentor", "niz-3", "niz-7", "niz-30"]);
  });

  it("loš brojač (NaN, negativan, razlomak) ne otključava ništa", () => {
    expect(earned({ completedLessons: Number.NaN, creaWorks: -5, bestStreak: 2.9 })).toEqual([]);
    expect(state({ completedLessons: Number.NaN })["pet-lekcija"].progress).toEqual({ current: 0, target: 5 });
  });
});

describe("isBadgePublic (tuđi profil)", () => {
  const closed = { creaPublic: false, helpfulAnswers: 0 };
  const open = { creaPublic: true, helpfulAnswers: MENTOR_HELPFUL_ANSWERS };
  const shown = (profile: { creaPublic: boolean; helpfulAnswers: number }) => IGRA_BADGE_KEYS.filter((key) => isBadgePublic(key, profile));

  it("vreme učenja i broj radova nisu javni ni uz javnu knjižicu", () => {
    for (const key of ["nocna-sova", "rani-pevac", "deset-radova", "sto-radova"] as const) {
      expect(isBadgePublic(key, closed), key).toBe(false);
      expect(isBadgePublic(key, open), key).toBe(false);
    }
  });

  it("Crea i nizovi samo uz javnu knjižicu", () => {
    for (const key of ["prvi-rad", "prvi-video", "prvi-zvuk", "recept", "tehnika", "izazov", "niz-3", "niz-7", "niz-30"] as const) {
      expect(isBadgePublic(key, closed), key).toBe(false);
      expect(isBadgePublic(key, { ...closed, creaPublic: true }), key).toBe(true);
    }
  });

  it("mentor samo uz javan broj korisnih odgovora (partner za učenje nije javan)", () => {
    expect(isBadgePublic("mentor", { creaPublic: true, helpfulAnswers: MENTOR_HELPFUL_ANSWERS - 1 })).toBe(false);
    expect(isBadgePublic("mentor", { creaPublic: false, helpfulAnswers: MENTOR_HELPFUL_ANSWERS })).toBe(true);
  });

  it("ostalo je uvek javno: 10 bez knjižice, 20 sa njom", () => {
    expect(shown(closed)).toEqual(["prva-lekcija", "prvi-zadatak", "pet-lekcija", "prvi-kurs", "tri-kursa", "staza", "prva-objava", "koristan-odgovor", "omiljen", "top-10"]);
    expect(shown(open)).toHaveLength(20);
  });
});
