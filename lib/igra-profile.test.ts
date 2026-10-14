import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { badgeStickerView, badgeTally } from "./igra-badge-view";
import { IGRA_BADGE_KEYS, igraBadge } from "./igra-badges";
import { inkCalendarView } from "./igra-calendar";
import { IGRA_FIXTURE_IDS, IGRA_FIXTURES, memberProgressFixture, PROFILE_FIXTURES } from "./igra-fixtures";
import {
  badgeFilterOptions,
  bannerOptions,
  profileBannerKey,
  profileCalendarActivity,
  profileCounters,
  profileShelfBadges,
  profileWorks,
  type ProfileActivityDay,
} from "./igra-profile";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const day = (dayKey: string, lessons: number, tasks = 0, threads = 0, comments = 0): ProfileActivityDay => ({
  dayKey,
  lessons,
  tasks,
  threads,
  comments,
  total: lessons + tasks + threads + comments,
});

describe("polica na profilu", () => {
  const aktivan = IGRA_FIXTURES.aktivan;

  it("vlasnik vidi pun napredak iz ljuske: sva četiri stanja, uslovi i napredak", () => {
    const shelf = profileShelfBadges({ isOwner: true, mine: aktivan, member: undefined })!;
    expect(shelf.map((badge) => badge.key)).toEqual(IGRA_BADGE_KEYS);
    expect(new Set(shelf.map((badge) => badge.state))).toEqual(new Set(["unlocked", "fresh", "locked", "soon"]));
    expect(shelf.some((badge) => badge.progress !== null)).toBe(true);
  });

  it("učitavanje i nedostupan napredak", () => {
    expect(profileShelfBadges({ isOwner: true, mine: undefined, member: undefined })).toBeUndefined();
    expect(profileShelfBadges({ isOwner: false, mine: aktivan, member: undefined })).toBeUndefined();
    expect(profileShelfBadges({ isOwner: false, mine: undefined, member: null })).toBeNull();
    // Vlasnik bez napretka ljuske pada na `getMemberProgress` (dnevnik), sa uslovima.
    const fallback = profileShelfBadges({ isOwner: true, mine: null, member: memberProgressFixture("aktivan", { creaPublic: true }) })!;
    expect(fallback.find((badge) => badge.key === "niz-30")!.state).toBe("locked");
  });

  it("drugi vide samo osvojeno iz dnevnika; ostalo je neutralna silueta bez uslova", () => {
    for (const stanje of IGRA_FIXTURE_IDS) {
      for (const creaPublic of [false, true]) {
        const member = memberProgressFixture(stanje, { creaPublic });
        const shelf = profileShelfBadges({ isOwner: false, mine: IGRA_FIXTURES[stanje], member })!;
        expect(shelf).toHaveLength(24);
        // Ni napredak ni vreme otključavanja drugog člana.
        expect(shelf.every((badge) => badge.progress === null && badge.unlockedAt === null)).toBe(true);
        expect(new Set(shelf.map((badge) => badge.state)).size).toBeLessThanOrEqual(2);
        for (const badge of shelf) {
          expect(["unlocked", "hidden"]).toContain(badge.state);
          const view = badgeStickerView(badge.key, badge.state, badge.progress, "sr");
          if (badge.state === "hidden") {
            expect(view.detail).toBeNull();
            expect(view.status).toBeNull();
            expect(view.label).not.toContain(igraBadge(badge.key).condition.sr);
            expect(view.label).not.toMatch(/zaključan|nema/i);
          }
        }
        // Vreme učenja se drugima nikad ne prikazuje; Crea samo uz javnu knjižicu.
        expect(shelf.find((badge) => badge.key === "nocna-sova")!.state).toBe("hidden");
        const creaShown = shelf.filter((badge) => igraBadge(badge.key).group === "crea" && badge.state === "unlocked");
        if (!creaPublic) expect(creaShown).toEqual([]);
      }
    }
  });

  it("nov, još neviđen bedž drugi ne vide (samo dnevnik)", () => {
    const fresh = IGRA_FIXTURES.aktivan.badges.filter((badge) => badge.state === "fresh").map((badge) => badge.key);
    expect(fresh.length).toBeGreaterThan(0);
    const shelf = profileShelfBadges({ isOwner: false, mine: undefined, member: memberProgressFixture("aktivan", { creaPublic: true }) })!;
    for (const key of fresh) expect(shelf.find((badge) => badge.key === key)!.state).toBe("hidden");
  });

  it("filter: „Sve“ pa tri grupe, sa brojem osvojenih po grupi", () => {
    const options = badgeFilterOptions(IGRA_FIXTURES.legenda.badges, "sr");
    expect(options.label).toBe("Prikaži bedževe");
    expect(options.items.map((item) => [item.id, item.count])).toEqual([
      ["all", "24/24"],
      ["ucenje", "8/8"],
      ["crea", "8/8"],
      ["zajednica", "8/8"],
    ]);
    const novi = badgeFilterOptions(IGRA_FIXTURES.novi.badges, "en");
    expect(novi.items[0]).toMatchObject({ label: "All", count: "0/24", ariaLabel: "All: 0 of 24" });
    expect(novi.items[3]!.label).toBe("Community and streaks");
  });

  it("skriveni bedž ne ulazi u zbir osvojenih", () => {
    const shelf = profileShelfBadges({ isOwner: false, mine: undefined, member: memberProgressFixture("legenda", { creaPublic: false }) })!;
    // 24 - 8 (Crea) - 2 (vreme učenja; „Noćna sova" i „Rani pevac" su u učenju) = 14.
    expect(badgeTally(shelf, "sr").earned).toBe(14);
  });
});

describe("brojači i kalendar", () => {
  const days = [day("2026-10-14", 2, 1, 0, 3), day("2026-10-10", 1, 0, 1, 0), day("2026-01-02", 0, 2, 1, 1)];

  it("zbir javnog kalendara + radovi, sa oblicima množine", () => {
    expect(profileCounters(days, 21, "sr")).toEqual([
      { key: "lessons", value: 3, unit: "lekcije" },
      { key: "tasks", value: 3, unit: "zadatka" },
      { key: "works", value: 21, unit: "rad" },
      { key: "threads", value: 2, unit: "objave" },
    ]);
    expect(profileCounters([], 5, "en").map((counter) => `${counter.value} ${counter.unit}`)).toEqual(["0 lessons", "0 tasks", "5 creations", "0 posts"]);
  });

  it("radovi: broj, učitavanje (skelet) ili bez pločice", () => {
    expect(profileCounters(days, null, "sr").map((counter) => counter.key)).toEqual(["lessons", "tasks", "threads"]);
    expect(profileCounters(days, undefined, "sr").find((counter) => counter.key === "works")!.value).toBeNull();
    expect(profileWorks(true, undefined)).toBeUndefined();
    expect(profileWorks(false, undefined)).toBeNull();
    expect(profileWorks(false, null)).toBeNull();
    expect(profileWorks(false, { works: null })).toBeNull();
    expect(profileWorks(false, { works: 7 })).toBe(7);
  });

  it("loš broj u danu se ne sabira", () => {
    const bad = [{ ...day("2026-10-14", 1), tasks: Number.NaN, threads: -4 }];
    expect(profileCounters(bad, Number.POSITIVE_INFINITY, "sr").map((counter) => counter.value)).toEqual([1, 0, 0, 0]);
  });

  it("kalendar broji svaku javnu aktivnost dana i pokriva godinu (52 nedelje)", () => {
    expect(profileCalendarActivity(days)).toEqual([
      { day: "2026-10-14", completed: 6 },
      { day: "2026-10-10", completed: 2 },
      { day: "2026-01-02", completed: 4 },
    ]);
    const view = inkCalendarView({ activity: profileCalendarActivity(PROFILE_FIXTURES.legenda.days), todayKey: "2026-10-14", weeks: 52 }, "sr");
    expect(view.cells).toHaveLength(52 * 7);
    expect(view.label).toMatch(/^Aktivnih dana u poslednje 52 nedelje: \d+\.$/);
    expect(inkCalendarView({ activity: [], todayKey: "2026-10-14", weeks: 52 }, "en").label).toBe("Active days in the last 52 weeks: 0.");
    expect(inkCalendarView({ activity: [], todayKey: "2026-10-14", weeks: 21 }, "sr").label).toBe("Aktivnih dana u poslednjoj 21 nedelji: 0.");
  });

  it("test podaci: godina ne prelazi ukupne brojače test korisnika", () => {
    const value = (stanje: (typeof IGRA_FIXTURE_IDS)[number]) =>
      profileCounters(PROFILE_FIXTURES[stanje].days, PROFILE_FIXTURES[stanje].works, "sr").map((counter) => counter.value!);
    expect(value("novi")).toEqual([0, 0, 0, 0]);
    // Aktivan: ceo rad mu je u poslednjih mesec dana, pa je godina isto što i ukupno.
    expect(value("aktivan")).toEqual([14, 5, 12, 3]);
    // Legenda: ukupno 148 lekcija, 61 zadatak, 240 radova i 18 tema (`IGRA_FIXTURES`).
    const [lessons, tasks, works, threads] = value("legenda");
    expect(lessons).toBeGreaterThan(0);
    expect(lessons).toBeLessThanOrEqual(148);
    expect(tasks).toBeLessThanOrEqual(61);
    expect(works).toBeLessThanOrEqual(240);
    expect(threads).toBeLessThanOrEqual(18);
  });
});

describe("baner na profilu", () => {
  it("vlasniku iz ljuske, drugima iz `getMemberProgress`; dok se ne zna, prazan papir", () => {
    expect(profileBannerKey({ isOwner: true, mine: { banner: "studio" }, member: undefined })).toBe("studio");
    expect(profileBannerKey({ isOwner: true, mine: { banner: null }, member: undefined })).toBe("sveska");
    expect(profileBannerKey({ isOwner: true, mine: undefined, member: undefined })).toBeUndefined();
    expect(profileBannerKey({ isOwner: true, mine: null, member: { banner: "okean" } })).toBe("okean");
    expect(profileBannerKey({ isOwner: false, mine: { banner: "studio" }, member: { banner: "grad" } })).toBe("grad");
    expect(profileBannerKey({ isOwner: false, mine: undefined, member: undefined })).toBeUndefined();
    // Upit pao: podrazumevani baner, profil radi.
    expect(profileBannerKey({ isOwner: false, mine: undefined, member: null })).toBe("sveska");
  });

  it("izbor: otključani po nivou, zaključani sa nivoom, izabran je jedan", () => {
    const options = bannerOptions(5, "laboratorija", "sr");
    expect(options.map((option) => [option.key, option.unlocked, option.selected, option.note])).toEqual([
      ["sveska", true, false, null],
      ["laboratorija", true, true, "Izabran"],
      ["studio", true, false, null],
      ["svemir", false, false, "Od nivoa 7"],
      ["grad", false, false, "Od nivoa 9"],
      ["okean", false, false, "Od nivoa 11"],
    ]);
    expect(options[3]!.label).toBe("Svemir — zaključan, od nivoa 7");
    expect(options[1]!.label).toBe("Laboratorija — izabran");
    expect(bannerOptions(1, null, "en").filter((option) => option.selected).map((option) => option.key)).toEqual(["sveska"]);
    // Sačuvan izbor koji više nije otključan nije označen kao izabran.
    expect(bannerOptions(2, "okean", "sr").some((option) => option.selected)).toBe(false);
  });
});

describe("izvor: profil", () => {
  const PROFILE_UI = readdirSync(join(ROOT, "components/igra/profile")).map((file) => `components/igra/profile/${file}`);

  it("delovi profila su prezentacioni: bez upita, mutacija i test podataka", () => {
    expect(PROFILE_UI.length).toBeGreaterThanOrEqual(4);
    for (const file of PROFILE_UI) {
      const source = read(file);
      expect(source, file).not.toMatch(/from "convex\/react"|_generated\/api|useQuery|useMutation|igra-fixtures/);
      expect(source, file).not.toMatch(/\/brand\/igra\//);
      expect(source, file).not.toMatch(/rounded-[\w[\]./-]+!|!rounded-|borderRadius|#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("slike idu kroz IgraArt; jedini `<img>` je avatar člana", () => {
    for (const file of PROFILE_UI) {
      const images = read(file).match(/<img\b/g) ?? [];
      expect(images.length, file).toBe(file.endsWith("profile-banner.tsx") ? 1 : 0);
    }
  });

  it("baner je jedini hero i jedina prioritetna slika profila", () => {
    const sources = [...PROFILE_UI, "components/app/member-profile.tsx"].map(read).join("\n");
    expect(sources.match(/data-igra-hero/g)).toHaveLength(1);
    expect(sources.match(/<IgraArt\b[^>]*\spriority[\s/>]/g)).toHaveLength(1);
  });

  it("profil pita IGRA podatke JEDNOM po strani, kroz jedan hook, i ne pada kad upita nema", () => {
    const hook = read("components/app/member-profile-igra.ts");
    expect(hook.match(/query: api\.igra\.getMemberProgress/g)).toHaveLength(1);
    expect(hook).toContain("useQueries");
    expect(hook).not.toMatch(/\buseQuery\(/);
    const page = read("components/app/member-profile.tsx");
    expect(page.match(/useMemberIgra\(/g)).toHaveLength(1);
    // Napredak vlasnika već drži ljuska (K06): stranica ne pravi svoj upit.
    expect(page).not.toMatch(/getMyProgress|api\.igra\./);
  });

  it("javni profil (getPublicProfile) nije diran", () => {
    expect(read("convex/publicProfiles.ts")).not.toMatch(/igra|creaWorks/);
  });
});
