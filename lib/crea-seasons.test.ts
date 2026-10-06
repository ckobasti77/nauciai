import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { CREA_SEASONS, orthodoxEaster, seasonById, seasonDayIndex, seasonForDay } from "./crea-seasons";
import { CREA_SEASON_STICKERS, stickerById, stickerPickerGroups, stickerUrl } from "./crea-stickers";

describe("sezonski događaji (G12)", () => {
  test("pravoslavni Uskrs po godinama", () => {
    expect(orthodoxEaster(2024)).toBe("2024-05-05");
    expect(orthodoxEaster(2025)).toBe("2025-04-20");
    expect(orthodoxEaster(2026)).toBe("2026-04-12");
    expect(orthodoxEaster(2027)).toBe("2027-05-02");
    expect(orthodoxEaster(2030)).toBe("2030-04-28");
  });

  test("prozori: Slava, Nova godina preko granice godine, Uskrs od Cveti do ponedeljka, festival", () => {
    expect(seasonForDay("2026-12-13")?.id).toBe("slava");
    expect(seasonForDay("2026-12-19")?.id).toBe("slava");
    expect(seasonForDay("2026-12-20")).toBeNull();
    expect(seasonForDay("2026-12-26")?.id).toBe("nova-godina");
    expect(seasonForDay("2027-01-01")?.id).toBe("nova-godina");
    expect(seasonForDay("2027-01-14")?.id).toBe("nova-godina");
    expect(seasonForDay("2027-01-15")).toBeNull();
    expect(seasonForDay("2026-04-05")?.id).toBe("uskrs");
    expect(seasonForDay("2026-04-13")?.id).toBe("uskrs");
    expect(seasonForDay("2026-04-14")).toBeNull();
    expect(seasonForDay("2026-07-06")?.id).toBe("exit");
    expect(seasonForDay("2026-07-13")?.id).toBe("exit");
    expect(seasonForDay("2026-10-06")).toBeNull();
  });

  test("sezone se ne preklapaju ni jedne godine 2025-2035", () => {
    for (let year = 2025; year <= 2035; year += 1) {
      const covered = new Map<string, string>();
      for (const season of CREA_SEASONS) {
        const { start, end } = season.window(year);
        for (let day = start; day <= end; day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
          expect(covered.get(day), `${season.id} ${day}`).toBeUndefined();
          covered.set(day, season.id);
        }
      }
    }
  });

  test("svaka sezona: naziv i teme na oba jezika, efekat, nalepnice postoje", () => {
    const ids = new Set<string>();
    for (const season of CREA_SEASONS) {
      expect(season.label.sr && season.label.en && season.tagline.sr && season.tagline.en).toBeTruthy();
      expect(season.themes.length).toBeGreaterThanOrEqual(7);
      for (const theme of season.themes) {
        expect(ids.has(theme.id), theme.id).toBe(false);
        ids.add(theme.id);
        expect(theme.label.sr && theme.label.en && theme.hint.sr && theme.hint.en, theme.id).toBeTruthy();
      }
      expect(season.stickers.length).toBeGreaterThanOrEqual(5);
      for (const sticker of season.stickers) expect(stickerById(sticker), `${season.id}: ${sticker}`).toBeDefined();
    }
    expect(seasonById("uskrs")?.effect).toBe("jaja");
    expect(seasonById("nepostoji")).toBeUndefined();
  });

  test("redni dan sezone, i preko nove godine", () => {
    const newYear = seasonById("nova-godina")!;
    expect(seasonDayIndex(newYear, "2026-12-26")).toBe(0);
    expect(seasonDayIndex(newYear, "2027-01-01")).toBe(6);
  });

  test("sezonske nalepnice: fajl kod nas, birač ih nudi samo dok sezona traje", () => {
    const source = readFileSync("public/brand/crea/stickers/IZVOR.md", "utf8");
    for (const sticker of CREA_SEASON_STICKERS) {
      const path = `public${stickerUrl(sticker.id)}`;
      expect(existsSync(path), sticker.id).toBe(true);
      const svg = readFileSync(path, "utf8");
      expect(svg.startsWith("<svg") && svg.includes('viewBox="0 0 32 32"'), path).toBe(true);
      expect(svg).not.toMatch(/<script|on[a-z]+=|href="http/i);
      expect(source, sticker.id).toContain(`\`${sticker.id}.svg\``);
      expect(sticker.label.sr && sticker.label.en).toBeTruthy();
    }
    const regular = stickerPickerGroups(null);
    expect(regular.some((group) => group.id === "sezona")).toBe(false);
    const easter = stickerPickerGroups(seasonById("uskrs")!);
    expect(easter[0]).toMatchObject({ id: "sezona", label: { sr: "Uskršnja nedelja" } });
    expect(easter[0]!.stickers.map((sticker) => sticker.id)).toEqual(seasonById("uskrs")!.stickers);
    expect(easter.slice(1)).toEqual(regular);
  });
});
