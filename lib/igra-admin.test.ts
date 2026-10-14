import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HEARTBEAT_STALE_MS } from "../convex/studioCore";
import manifest from "../public/brand/igra/manifest.json";
import {
  ADMIN_LOG_LIMIT,
  ADMIN_PENDING_CAP,
  adminHeartbeatState,
  adminPendingLabel,
  adminRobiMood,
  adminSignals,
  adminSpendTone,
  adminTodayKey,
  adminUsd,
  columnHeight,
  dailyCountSeries,
  stackedShares,
  type AdminSignalInput,
} from "./igra-admin";
import { IGRA_ADMIN_COPY } from "./igra-admin-copy";
import { ADMIN_FIXTURES, IGRA_FIXTURE_IDS } from "./igra-fixtures";

/**
 * Admin „Kontrolna soba" (K21, plan K20): stanje sistema, Robi, dnevni niz i grafikoni su
 * čista logika nad POSTOJEĆIM upitima. Strane čitaju Convex, pa se ostatak proverava nad
 * izvorom: iste akcije, isti upiti, ista slika heroja samo na jednom mestu.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const assets: Record<string, { ready: boolean } | undefined> = manifest.assets;

const NOW = Date.UTC(2026, 9, 14, 7, 30);
const MIN = 60_000;
const DAY = 86_400_000;

const input = (patch: Partial<AdminSignalInput> = {}): AdminSignalInput => ({
  creaEnabled: true,
  usage: { totalCostUsd: 10, alarmUsd: 50, killUsd: 100, costCapHeartbeatAt: NOW - 5 * MIN, costCapCronFailure: null },
  pendingApprovals: 0,
  now: NOW,
  ...patch,
});

describe("stanje sistema", () => {
  it("čuvar troška: isto pravilo kao Crea admin (60 min), greška ima prednost, null = nikad", () => {
    expect(adminHeartbeatState(NOW - HEARTBEAT_STALE_MS, null, NOW)).toBe("radi");
    expect(adminHeartbeatState(NOW - HEARTBEAT_STALE_MS - 1, null, NOW)).toBe("kasni");
    expect(adminHeartbeatState(null, null, NOW)).toBe("nikad");
    expect(adminHeartbeatState(NOW, { message: "x" }, NOW)).toBe("greska");
  });

  it("trošak: strogo preko alarma je pažnja, strogo preko gašenja je problem (kao boja u Crea adminu)", () => {
    expect(adminSpendTone(50, 50, 100)).toBe("ok");
    expect(adminSpendTone(50.01, 50, 100)).toBe("paznja");
    expect(adminSpendTone(100, 50, 100)).toBe("paznja");
    expect(adminSpendTone(100.01, 50, 100)).toBe("problem");
    expect(adminUsd(12.4)).toBe("$12.40");
    expect(adminUsd(50, 0)).toBe("$50");
  });

  it("red na čekanju: 100 je plafon upita, pa piše 100+", () => {
    expect(adminPendingLabel(0)).toBe("0");
    expect(adminPendingLabel(99)).toBe("99");
    expect(adminPendingLabel(ADMIN_PENDING_CAP)).toBe("100+");
  });

  it("dok bilo koji upit nije stigao nema ni pilula ni Robija", () => {
    expect(adminSignals(input({ creaEnabled: undefined }), "sr")).toBeNull();
    expect(adminSignals(input({ usage: undefined }), "sr")).toBeNull();
    expect(adminSignals(input({ pendingApprovals: undefined }), "sr")).toBeNull();
    expect(adminRobiMood(null, "sr")).toBeNull();
  });

  it("četiri pilule, redom, svaka vodi na postojeću stranu koja to rešava", () => {
    const signals = adminSignals(input(), "sr")!;
    expect(signals.map((signal) => signal.key)).toEqual(["crea", "cuvar", "trosak", "moderacija"]);
    expect(signals.map((signal) => signal.path)).toEqual(["/app/admin/studio", "/app/admin/studio", "/app/admin/studio", "/app/community/moderation"]);
    expect(signals.every((signal) => signal.tone === "ok")).toBe(true);
    expect(signals[2]!.label).toBe("Danas $10.00 od $50");
    expect(adminSignals(input(), "en")![2]!.label).toBe("Today $10.00 of $50");
  });

  it("Robi: problem > pažnja > sve radi; unutar tona čuvar, pa trošak, pa Crea, pa red", () => {
    expect(adminRobiMood(adminSignals(input(), "sr"), "sr")).toEqual({ poza: "mase", line: "Sve radi.", tone: "ok" });

    const waiting = adminRobiMood(adminSignals(input({ pendingApprovals: 3 }), "sr"), "sr")!;
    expect(waiting.poza).toBe("misli");
    expect(waiting.line).toBe("3 objave na čekanju.");

    const creaOff = adminRobiMood(adminSignals(input({ pendingApprovals: 3, creaEnabled: false }), "sr"), "sr")!;
    expect(creaOff.line).toBe(IGRA_ADMIN_COPY.robiCreaOff.sr);

    const late = adminSignals(input({ usage: { ...input().usage!, costCapHeartbeatAt: NOW - 95 * MIN, totalCostUsd: 120 } }), "sr")!;
    expect(late[1]!.label).toBe("Čuvar troška kasni · 95 min");
    expect(adminRobiMood(late, "sr")).toEqual({ poza: "tuzan", line: IGRA_ADMIN_COPY.robiGuardLate.sr, tone: "problem" });

    const kill = adminRobiMood(adminSignals(input({ usage: { ...input().usage!, totalCostUsd: 120 } }), "sr"), "sr")!;
    expect(kill).toEqual({ poza: "tuzan", line: IGRA_ADMIN_COPY.robiSpendKill.sr, tone: "problem" });
  });

  it("Robi govori mirno: bez uzvičnika, u obe jezičke verzije", () => {
    for (const [key, copy] of Object.entries(IGRA_ADMIN_COPY)) {
      expect(copy.sr.trim(), key).not.toBe("");
      expect(copy.en.trim(), key).not.toBe("");
      expect(`${copy.sr} ${copy.en}`, key).not.toContain("!");
    }
  });

  it("test podaci izloga: prazna platforma radi, obična nedelja čeka, granica je problem", () => {
    const mood = (id: (typeof IGRA_FIXTURE_IDS)[number]) => {
      const data = ADMIN_FIXTURES[id];
      return adminRobiMood(adminSignals({ creaEnabled: data.creaEnabled, usage: data.usage, pendingApprovals: data.pendingApprovals, now: data.now }, "sr"), "sr")!.poza;
    };
    expect(IGRA_FIXTURE_IDS.map(mood)).toEqual(["mase", "misli", "tuzan"]);
  });
});

describe("dnevni niz i grafikoni", () => {
  const today = adminTodayKey(NOW);

  it("dan je po Beogradu: 00:30 posle ponoći je već novi dan, i oko kraja letnjeg vremena", () => {
    expect(today).toBe("2026-10-14");
    expect(adminTodayKey(Date.UTC(2026, 9, 13, 22, 30))).toBe("2026-10-14");
    expect(adminTodayKey(Date.UTC(2026, 9, 13, 21, 30))).toBe("2026-10-13");
    expect(adminTodayKey(Date.UTC(2026, 9, 25, 22, 30))).toBe("2026-10-25");
    expect(adminTodayKey(Date.UTC(2026, 9, 25, 23, 30))).toBe("2026-10-26");
    expect(adminTodayKey(Date.UTC(2026, 2, 28, 22, 30))).toBe("2026-03-28");
    expect(adminTodayKey(Date.UTC(2026, 2, 28, 23, 30))).toBe("2026-03-29");
  });

  it("bez plafona: svaki dan u prozoru je tačan, prazan dan je nula", () => {
    const times = [NOW - MIN, NOW - 2 * MIN, NOW - DAY, NOW - 3 * DAY];
    const series = dailyCountSeries(times, { todayKey: today, days: 5, capped: false });
    expect(series.days.map((day) => day.count)).toEqual([0, 1, 0, 1, 2]);
    expect(series.days.every((day) => !day.partial)).toBe(true);
    expect(series.total).toBe(4);
    expect(series.max).toBe(2);
    expect(series.today).toEqual({ day: "2026-10-14", count: 2, partial: false });
    expect(series.completeDays).toBe(5);
  });

  it("sa plafonom: dani pre najstarijeg zapisa nisu poznati, a njegov dan je samo donja granica", () => {
    const times = [NOW - MIN, NOW - DAY, NOW - 2 * DAY];
    const series = dailyCountSeries(times, { todayKey: today, days: 5, capped: true });
    expect(series.days.map((day) => day.count)).toEqual([null, null, 1, 1, 1]);
    expect(series.days.map((day) => day.partial)).toEqual([false, false, true, false, false]);
    expect(series.completeDays).toBe(2);
    expect(series.total).toBe(3);
  });

  it("plafon zapisa je 200, isti kao `take(200)` u upitima", () => {
    expect(ADMIN_LOG_LIMIT).toBe(200);
    expect(read("convex/studioAdmin.ts").match(/\.order\("desc"\)\.take\(200\)/g)).toHaveLength(2);
    const legend = ADMIN_FIXTURES.legenda;
    expect(legend.passed).toHaveLength(ADMIN_LOG_LIMIT);
    const series = dailyCountSeries(legend.passed, { todayKey: adminTodayKey(legend.now), days: 14, capped: true });
    expect(series.days.filter((day) => day.count === null)).toHaveLength(9);
    expect(series.days.filter((day) => day.partial)).toHaveLength(1);
  });

  it("stubići idu od nule do najveće vrednosti; nepoznat dan nema visinu", () => {
    expect(columnHeight(10, 10)).toBe(100);
    expect(columnHeight(5, 10)).toBe(50);
    expect(columnHeight(0, 10)).toBe(0);
    expect(columnHeight(null, 10)).toBe(0);
    expect(columnHeight(3, 0)).toBe(0);
  });

  it("složena traka: udeli daju 1, prazan red nema udela", () => {
    const { total, parts } = stackedShares([
      { key: "published", value: 3 },
      { key: "draft", value: 1 },
      { key: "archived", value: 0 },
    ]);
    expect(total).toBe(4);
    expect(parts.map((part) => part.share)).toEqual([0.75, 0.25, 0]);
    expect(stackedShares([{ key: "a", value: 0 }]).parts[0]!.share).toBe(0);
  });
});

describe("admin strane: samo izgled", () => {
  const MANAGER = read("components/app/admin-content-manager.tsx");
  const WINDOWS = read("components/app/dashboard-windows.tsx");
  const ADMIN_DIR = "components/igra/admin";
  const ADMIN_FILES = readdirSync(join(ROOT, ADMIN_DIR)).map((file) => read(`${ADMIN_DIR}/${file}`));
  const SOURCES = [MANAGER, WINDOWS, ...ADMIN_FILES];

  it("svaka slika admina je u manifestu i spremna; K21 koristi 7 od 8 admin.* (troskovi ide u Crea admin, K22)", () => {
    const ids = new Set<string>();
    for (const src of SOURCES) {
      for (const match of src.matchAll(/(?:id|art)[=:] ?"((?:admin|scena|lik|prazno|ikona)\.[a-z.-]+)"/g)) ids.add(match[1]!);
    }
    for (const id of ["admin.korisnici", "admin.prihod", "admin.generacije", "admin.moderacija", "admin.sadrzaj", "admin.zajednica", "admin.sistem", "scena.kontrolna-soba"]) {
      expect(ids, id).toContain(id);
    }
    for (const id of ids) expect(assets[id]?.ready, id).toBe(true);
    for (const poza of ["mase", "misli", "tuzan"]) expect(assets[`lik.robi.${poza}`]?.ready).toBe(true);
    expect(assets["lik.bajt.misli"]?.ready).toBe(true);
  });

  it("scena heroja je na jednom mestu, nije priority i telefon je ne preuzima", () => {
    const withScene = ADMIN_FILES.filter((src) => src.includes('id="scena.kontrolna-soba"'));
    expect(withScene).toHaveLength(1);
    const scene = read(`${ADMIN_DIR}/admin-hero-scene.tsx`);
    expect(scene).toContain('id="scena.kontrolna-soba"');
    expect(scene).not.toMatch(/\spriority[\s=/>]/);
    // Lenja slika u `display:none` se u Chromiumu preuzima, pa se `<img>` na uskom ekranu ne pravi.
    expect(scene).toContain('const WIDE = "(min-width: 1024px)";');
    expect(scene).toContain("if (!wide) return null;");
    expect(scene).toContain("useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false)");
    expect(MANAGER).not.toContain("scena.kontrolna-soba");
  });

  it("prezentacione komponente ne zovu Convex, a admin nema 3D, GSAP pluginove ni animaciju po redu", () => {
    for (const src of ADMIN_FILES) {
      expect(src).not.toMatch(/from "convex\/react"/);
      expect(src).not.toMatch(/useEnterStagger|loadIgraPlugin|three|FlipOrder/);
    }
    expect(MANAGER).not.toMatch(/useEnterStagger|loadIgraPlugin|FlipOrder/);
  });

  it("admin čita samo POSTOJEĆE upite i iste mutacije kao pre", () => {
    const queries = new Set([...MANAGER.matchAll(/useQuery\(\s*api\.([a-zA-Z]+\.[a-zA-Z]+)/g)].map((match) => match[1]!));
    expect([...queries].sort()).toEqual([
      "adminOverview.getAdminOverview",
      "contentHierarchy.getAdminDetail",
      "contentHierarchy.getAdminHierarchy",
      "contentReadiness.getReadiness",
      "notifications.getUserNotificationSummary",
      "studioAdmin.getKillSwitchState",
      "studioAdmin.getUsageSummary",
      "studioAdmin.listModerationEvents",
      "studioAdmin.listPromptLog",
    ]);
    for (const mutation of ["contentHierarchy.upsertTrack", "courses.upsertCourse", "contentHierarchy.upsertDirectLesson", "contentHierarchy.createDraftEntity"]) {
      expect(MANAGER).toContain(`useMutation(api.${mutation})`);
    }
    expect(MANAGER).toContain('useQuery(api.notifications.getUserNotificationSummary, {})');
  });

  it('strane „U pripremi" zadržavaju doslovno isti tekst, sada sa Bajtom', () => {
    expect(MANAGER).toContain('art={<IgraLik lik="bajt" poza="misli" size={120} decorative />}');
    expect(MANAGER).toContain("Ovde će biti spisak naloga: ko se kad prijavio, koji kurs mu je otključan, promena uloge i privremena suspenzija.");
    expect(MANAGER).toContain("Ništa se neće prikazati dok pravi podaci ne budu povezani - brojevi koje izmislimo ne vrede ništa.");
    expect(MANAGER).toContain("Ovde će biti posete, izvori saobraćaja i koliko posetilaca postane student, iz povezanog Google Analytics naloga.");
    expect(MANAGER).not.toContain("function StatCard");
  });

  it("novac nema odometar; KPI broji samo sadržaj, studente i red", () => {
    const kpi = read(`${ADMIN_DIR}/admin-kpi.tsx`);
    expect(kpi).toContain("Odometer");
    expect(kpi).not.toMatch(/Usd|costUsd|\$\{/);
    expect(read(`${ADMIN_DIR}/admin-analytics.tsx`)).not.toContain("Odometer");
  });

  it("na tabli samo dva admin prozora dobijaju nalepnicu", () => {
    expect(WINDOWS.match(/\bart="admin\./g)).toHaveLength(2);
    expect(WINDOWS).toContain('art="admin.sadrzaj"');
    expect(WINDOWS).toContain('art="admin.moderacija"');
  });
});
