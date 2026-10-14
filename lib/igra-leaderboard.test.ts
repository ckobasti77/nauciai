import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { belgradeWeekKey } from "../convex/leaderboardCore";
import { IGRA_LEADERBOARD_COPY } from "./igra-copy";
import { fixtureLeaderboard, IGRA_FIXTURE_IDS, LEADERBOARD_FIXTURE_SIZES, rankFixtureRows } from "./igra-fixtures";
import {
  podiumStep,
  rankOrderChanged,
  remainingText,
  rowXpIsTotal,
  splitPodium,
  unrankedHint,
  viewerBar,
  weekCountdown,
  weekEndsAt,
} from "./igra-leaderboard";
import { weekPlaceView } from "./igra-shell";

/**
 * Rang lista (K12): kraj nedelje po Beogradu, iskreno odbrojavanje, podijum, promena mesta,
 * „ti“ red, isti izvor mesta u ljusci i na tabli, test podaci za 0 / 3 / 50 / 500 članova i
 * provere nad izvorom (Flip i 3D samo lenjo, upiti rang liste nisu dirani).
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
/** Reči pretnje, žurbe i lažne hitnosti (O9). */
const FEAR = /izgubi|propust|požuri|žuri|kazn|ističe|samo još|poslednj|hurry|lose|miss|penalt|expire|last chance|only \d/i;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("kraj nedelje (ponedeljak 00:00 po Beogradu)", () => {
  it("zimi je UTC+1, leti UTC+2", () => {
    expect(new Date(weekEndsAt("2026-11-16")!).toISOString()).toBe("2026-11-22T23:00:00.000Z");
    expect(new Date(weekEndsAt("2026-06-15")!).toISOString()).toBe("2026-06-21T22:00:00.000Z");
    expect(new Date(weekEndsAt("2026-10-12")!).toISOString()).toBe("2026-10-18T22:00:00.000Z");
  });

  it("nedelja u kojoj se menja sat traje 167 ili 169 sati", () => {
    // Letnje računanje počinje u nedelju 29. 3. 2026, a završava se u nedelju 25. 10. 2026.
    expect(new Date(weekEndsAt("2026-03-23")!).toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(new Date(weekEndsAt("2026-10-19")!).toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(weekEndsAt("2026-03-23")! - weekEndsAt("2026-03-16")!).toBe(167 * HOUR);
    expect(weekEndsAt("2026-10-19")! - weekEndsAt("2026-10-12")!).toBe(169 * HOUR);
  });

  it("kraj se slaže sa ključem nedelje koji računa server", () => {
    for (const weekKey of ["2026-01-05", "2026-03-23", "2026-06-15", "2026-10-19", "2026-12-28"]) {
      const endsAt = weekEndsAt(weekKey)!;
      expect(belgradeWeekKey(endsAt - 1), weekKey).toBe(weekKey);
      expect(belgradeWeekKey(endsAt), weekKey).not.toBe(weekKey);
      expect(belgradeWeekKey(endsAt + 7 * DAY - 1), weekKey).toBe(belgradeWeekKey(endsAt));
    }
  });

  it("ključ koji nije ponedeljak ili nije datum nema kraj", () => {
    for (const bad of ["2026-10-14", "2026-02-30", "2026-13-02", "abc", "", "2026-10-12T00:00"]) expect(weekEndsAt(bad), bad).toBeNull();
  });
});

describe("odbrojavanje", () => {
  it("tekst je na minut i zaokružen nadole", () => {
    expect(remainingText(0, "sr")).toBe("manje od minuta");
    expect(remainingText(MINUTE - 1, "sr")).toBe("manje od minuta");
    expect(remainingText(MINUTE, "sr")).toBe("1 minut");
    expect(remainingText(2 * MINUTE + 59_000, "sr")).toBe("2 minuta");
    expect(remainingText(HOUR, "sr")).toBe("1 sat");
    expect(remainingText(HOUR + MINUTE, "sr")).toBe("1 sat i 1 minut");
    expect(remainingText(2 * HOUR + 5 * MINUTE, "sr")).toBe("2 sata i 5 minuta");
    expect(remainingText(21 * HOUR, "sr")).toBe("21 sat");
    expect(remainingText(DAY, "sr")).toBe("1 dan");
    expect(remainingText(2 * DAY + 5 * HOUR + 59 * MINUTE, "sr")).toBe("2 dana i 5 sati");
    expect(remainingText(6 * DAY + 23 * HOUR, "en")).toBe("6 days and 23 hours");
    expect(remainingText(HOUR + MINUTE, "en")).toBe("1 hour and 1 minute");
    expect(remainingText(Number.NaN, "en")).toBe("less than a minute");
    expect(remainingText(-5, "sr")).toBe("manje od minuta");
  });

  it("broji do stvarnog kraja nedelje koju lista prikazuje", () => {
    const now = Date.parse("2026-10-14T10:00:00Z"); // sreda, 12:00 u Beogradu
    expect(weekCountdown("2026-10-12", now, "sr")).toEqual({
      text: "Nedelja se završava za 4 dana i 12 sati",
      endsAtLabel: "u ponedeljak u 00:00",
      endsAt: Date.parse("2026-10-18T22:00:00Z"),
    });
    expect(weekCountdown("2026-10-12", Date.parse("2026-10-18T21:59:30Z"), "en")?.text).toBe("This week ends in less than a minute");
  });

  it("kad je kraj prošao ili je ključ iz budućnosti, odbrojavanja nema", () => {
    expect(weekCountdown("2026-10-12", Date.parse("2026-10-18T22:00:00Z"), "sr")).toBeNull();
    expect(weekCountdown("2026-10-12", Date.parse("2026-10-30T10:00:00Z"), "sr")).toBeNull();
    expect(weekCountdown("2026-10-19", Date.parse("2026-10-11T10:00:00Z"), "sr")).toBeNull();
    expect(weekCountdown("nije-kljuc", Date.parse("2026-10-14T10:00:00Z"), "sr")).toBeNull();
    expect(weekCountdown("2026-10-12", Number.NaN, "sr")).toBeNull();
  });

  it("bez sekundi, bez žurbe i bez pretnje (O9)", () => {
    const start = Date.parse("2026-10-12T00:00:00Z");
    for (const locale of ["sr", "en"] as const) {
      for (let step = 0; step < 7 * 24 * 4; step += 1) {
        const countdown = weekCountdown("2026-10-12", start + step * 15 * MINUTE, locale);
        if (!countdown) continue;
        expect(countdown.text).not.toMatch(/sekund|second|\d+s\b/i);
        expect(countdown.text).not.toMatch(FEAR);
      }
    }
    for (const [key, text] of Object.entries(IGRA_LEADERBOARD_COPY)) {
      expect(text.sr, key).not.toMatch(FEAR);
      expect(text.en, key).not.toMatch(FEAR);
    }
  });
});

describe("podijum i lista", () => {
  const rows = (ranks: number[]) => ranks.map((rank, index) => ({ userId: `u${index}`, rank }));

  it("prva tri reda sa mestom ≤ 3 su na podijumu, ostali u listi", () => {
    expect(splitPodium(rows([1, 2, 3, 4, 5]))).toEqual({ podium: rows([1, 2, 3]), rest: rows([1, 2, 3, 4, 5]).slice(3) });
    const tied = splitPodium(rows([1, 1, 2, 3, 4]));
    expect(tied.podium.map((row) => row.rank)).toEqual([1, 1, 2]);
    expect(tied.rest.map((row) => row.rank)).toEqual([3, 4]);
    // Četvrti izjednačen sa trećim ide u listu sa istim brojem mesta.
    expect(splitPodium(rows([1, 2, 2, 2, 3])).rest.map((row) => row.rank)).toEqual([2, 3]);
    expect(splitPodium(rows([1, 2]))).toEqual({ podium: rows([1, 2]), rest: [] });
    expect(splitPodium([])).toEqual({ podium: [], rest: [] });
  });

  it("stepenik po mestu: prvo najviše, izjednačeni dele visinu", () => {
    expect([1, 2, 3].map(podiumStep)).toEqual([1, 2, 3]);
    expect(podiumStep(0)).toBe(1);
  });

  it("nivo se prikazuje samo kad red nosi ukupan XP cele platforme", () => {
    expect(rowXpIsTotal("global", "all_time")).toBe(true);
    expect(rowXpIsTotal("global", "week")).toBe(false);
    expect(rowXpIsTotal("track", "all_time")).toBe(false);
    expect(rowXpIsTotal("course", "week")).toBe(false);
  });

  it("Flip samo kad se promeni redosled redova koji postoje i pre i posle", () => {
    expect(rankOrderChanged(["a", "b", "c"], ["a", "b", "c"])).toBe(false);
    expect(rankOrderChanged(["a", "b"], ["a", "b", "c", "d"])).toBe(false);
    expect(rankOrderChanged(["a", "b", "c"], ["a", "c"])).toBe(false);
    expect(rankOrderChanged(["a", "b", "c"], ["b", "a", "c"])).toBe(true);
    expect(rankOrderChanged(["a", "b", "c", "d"], ["a", "d", "b", "c"])).toBe(true);
    expect(rankOrderChanged(["a", "b"], ["x", "a", "b"])).toBe(false);
    expect(rankOrderChanged([], [])).toBe(false);
  });
});

describe("„ti“ red", () => {
  const me = { userId: "me", rank: 27 };
  const board = [
    { userId: "a", rank: 1 },
    { userId: "b", rank: 2 },
  ];

  it("nalog tima, prazna lista i nepoznat gledalac nemaju red", () => {
    expect(viewerBar(undefined, board)).toBeNull();
    expect(viewerBar({ eligible: false, row: null }, board)).toBeNull();
    expect(viewerBar({ eligible: true, row: me }, [])).toBeNull();
  });

  it("bez XP-a je poziv; moj red zna da li je već na listi", () => {
    expect(viewerBar({ eligible: true, row: null }, board)).toEqual({ kind: "unranked" });
    expect(viewerBar({ eligible: true, row: me }, board)).toEqual({ kind: "row", onBoard: false });
    expect(viewerBar({ eligible: true, row: { userId: "b", rank: 2 } }, board)).toEqual({ kind: "row", onBoard: true });
  });

  it("poziv je po periodu i opsegu, bez pretnje", () => {
    expect(unrankedHint("global", "week", "sr")).toBe("Prva lekcija ili rad ove nedelje i na listi si.");
    expect(unrankedHint("global", "all_time", "sr")).toBe("Prva lekcija ili rad i na listi si.");
    expect(unrankedHint("track", "week", "sr")).toContain("smera");
    expect(unrankedHint("course", "all_time", "en")).toContain("course");
    for (const locale of ["sr", "en"] as const) {
      for (const scope of ["global", "track", "course"] as const) {
        for (const period of ["week", "all_time"] as const) expect(unrankedHint(scope, period, locale)).not.toMatch(FEAR);
      }
    }
  });
});

describe("mesto u ljusci i na tabli: isti izvor", () => {
  it("mesto, „100+“, nalog tima i bez XP-a", () => {
    expect(weekPlaceView({ weekRank: 7, weekXp: 435, eligible: true }, "sr")).toMatchObject({ text: "#7", label: "7. mesto na listi", medal: null });
    expect(weekPlaceView({ weekRank: 1, weekXp: 1310, eligible: true }, "sr").medal).toBe("zlato");
    expect(weekPlaceView({ weekRank: 3, weekXp: 900, eligible: true }, "en").medal).toBe("bronza");
    expect(weekPlaceView({ weekRank: null, weekXp: 120, eligible: true }, "sr")).toMatchObject({
      text: "100+",
      label: "Van prvih 100 ove nedelje. Tačno mesto je na rang listi.",
    });
    expect(weekPlaceView({ weekRank: null, weekXp: 900, eligible: false }, "sr")).toMatchObject({ text: "—", label: "Nalozi tima nisu na rang listi." });
    expect(weekPlaceView({ weekRank: null, weekXp: 0, eligible: true }, "sr")).toMatchObject({ text: "—", label: "Prva lekcija ili rad ove nedelje i na listi si." });
    expect(weekPlaceView(null, "en")).toMatchObject({ text: "—", label: "Not on the leaderboard yet", ranked: false });
  });

  it("tabla čita mesto iz napretka ljuske, ne iz svog agregata", () => {
    const home = read("components/app/dashboard-home.tsx");
    expect(home).toContain("rankView={weekPlaceView(igra, locale)}");
    expect(home).not.toMatch(/overview\??\.leaderboard/);
    expect(read("components/igra/progress-panel.tsx")).toContain("progress.weekRank");
  });
});

describe("test podaci: 0, 3, 50 i 500 članova", () => {
  it("broj redova, mesta kao na serveru i izjednačeni", () => {
    for (const size of LEADERBOARD_FIXTURE_SIZES) {
      for (const period of ["week", "all_time"] as const) {
        const { rows } = fixtureLeaderboard({ size, period, stanje: "aktivan" });
        expect(rows, `${size}/${period}`).toHaveLength(size);
        for (let index = 1; index < rows.length; index += 1) {
          const previous = rows[index - 1]!;
          const row = rows[index]!;
          expect(row.xp).toBeLessThanOrEqual(previous.xp);
          expect(row.rank).toBe(row.xp === previous.xp ? previous.rank : previous.rank + 1);
        }
        expect(new Set(rows.map((row) => row.userId)).size).toBe(size);
        expect(new Set(rows.map((row) => row.username)).size).toBe(size);
        expect(rows.every((row) => row.xp > 0)).toBe(true);
      }
    }
    const fifty = fixtureLeaderboard({ size: 50, period: "week", stanje: "novi" }).rows;
    expect(fifty[4]!.rank).toBe(fifty[5]!.rank);
  });

  it("„ti“: na podijumu, u prvih 20, daleko iza učitanog dela i van liste", () => {
    const place = (size: (typeof LEADERBOARD_FIXTURE_SIZES)[number], stanje: (typeof IGRA_FIXTURE_IDS)[number], staff = false) => {
      const { rows, viewer } = fixtureLeaderboard({ size, period: "week", stanje, staff });
      return { index: rows.findIndex((row) => row.isViewer), viewer, rows };
    };
    expect(place(3, "aktivan").index).toBe(1);
    expect(place(50, "aktivan").index).toBe(11);
    expect(place(500, "aktivan").index).toBe(326);
    expect(place(500, "legenda").viewer.row?.rank).toBe(1);
    expect(place(50, "novi")).toMatchObject({ index: -1, viewer: { eligible: true, row: null } });
    expect(place(0, "legenda")).toMatchObject({ index: -1, viewer: { eligible: true, row: null } });
    expect(place(50, "aktivan", true)).toMatchObject({ index: -1, viewer: { eligible: false, row: null } });
    const far = place(500, "aktivan");
    expect(viewerBar(far.viewer, far.rows.slice(0, 20))).toEqual({ kind: "row", onBoard: false });
  });

  it("„Ukupno“ ima veći XP od nedelje, a rang se računa kao na serveru", () => {
    const week = fixtureLeaderboard({ size: 50, period: "week", stanje: "legenda" }).rows;
    const all = fixtureLeaderboard({ size: 50, period: "all_time", stanje: "legenda" }).rows;
    expect(all[0]!.xp).toBeGreaterThan(week[0]!.xp);
    expect(rankFixtureRows([{ xp: 5, rank: 0 }, { xp: 9, rank: 0 }, { xp: 5, rank: 0 }]).map((row) => row.rank)).toEqual([1, 2, 2]);
  });
});

describe("izvor", () => {
  const leaderboard = read("components/app/community-v2/community-leaderboard.tsx");
  const podium = read("components/igra/podium.tsx");
  const flip = read("components/igra/leaderboard/flip-order.tsx");

  it("lista: podijum, Flip, odbrojavanje i lepljiv „ti“ red iznad donjeg menija", () => {
    expect(leaderboard).toContain("<Podium");
    expect(leaderboard).toContain("<FlipOrder");
    expect(leaderboard).toContain("<WeekCountdown");
    expect(leaderboard).toMatch(/sticky bottom-\[calc\(4\.5rem\+env\(safe-area-inset-bottom\)\)\][^"]*md:bottom-4/);
    expect(leaderboard).toContain('useEnterStagger(listRef, { selector: "li[data-flip-id]"');
    expect(leaderboard).not.toContain("community-rank-row");
    expect(read("app/globals.css")).not.toContain("community-rank-row");
  });

  it("prazno stanje vodi u učionicu, ne na nepostojeći /app/courses", () => {
    expect(leaderboard).not.toContain('"/app/courses"');
    expect(leaderboard).toContain("href={classroomPath(locale)}");
  });

  it("Flip i 3D samo lenjo, podijum bez upita i test podataka", () => {
    expect(flip).toContain('loadIgraPlugin("Flip")');
    expect(flip).not.toMatch(/from "gsap\//);
    expect(podium).toContain("<IgraThreeStage");
    expect(podium).not.toMatch(/from "three"|@react-three/);
    for (const source of [podium, flip, read("components/igra/leaderboard/rank-avatar.tsx"), read("components/igra/leaderboard/week-countdown.tsx")]) {
      expect(source).not.toMatch(/from "convex\/react"|_generated\/api|useQuery|igra-fixtures|\/brand\/igra\//);
    }
  });

  it("odbrojavanje se ne crta na serveru (nema nepoklapanja pri hidrataciji)", () => {
    const countdown = read("components/igra/leaderboard/week-countdown.tsx");
    expect(countdown).toContain("useSyncExternalStore(subscribeMinute, currentMinute, serverMinute)");
    expect(countdown).toContain("const serverMinute = () => null;");
  });

  it("upiti rang liste i XP pravila nisu dirani", () => {
    const query = read("convex/leaderboard.ts");
    expect(query).toContain(".paginate(args.paginationOpts)");
    expect(leaderboard).toContain("useLeaderboard({");
    expect(leaderboard).not.toMatch(/useQuery\(|useMutation\(/);
  });
});
