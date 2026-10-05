/**
 * Retro efekti (K21, V27): preseti i opsezi, Nokia raspored kadrova (12 fps),
 * seme šuma po kadru, VHS natpis i naslov pisaće mašine.
 */
import { describe, expect, test } from "vitest";

import {
  cleanTypewriterText,
  dateInputValue,
  heldFrameIndex,
  NOKIA,
  NOKIA_COLORS,
  nokiaFrameSchedule,
  nokiaSize,
  parseDateInput,
  RETRO_IDS,
  RETRO_MAX_PARAMS,
  RETRO_PRESETS,
  RETRO_STRENGTH,
  retroParamsFor,
  retroPreset,
  retroSeed,
  retroTick,
  retroUniforms,
  typewriterTitle,
  vhsStamp,
} from "./crea-retro";

describe("preseti", () => {
  test("svaki id ima tačno jedan preset, istim redom", () => {
    expect(new Set(RETRO_IDS).size).toBe(RETRO_IDS.length);
    expect(RETRO_PRESETS.map((preset) => preset.id)).toEqual([...RETRO_IDS]);
    for (const id of RETRO_IDS) expect(retroPreset(id).id).toBe(id);
  });

  test("nazivi i opisi postoje na srpskom i engleskom", () => {
    for (const preset of RETRO_PRESETS) {
      for (const text of [preset.label, preset.hint, ...preset.params.map((entry) => entry.label)]) {
        expect(text.sr.trim().length, preset.id).toBeGreaterThan(0);
        expect(text.en.trim().length, preset.id).toBeGreaterThan(0);
      }
    }
  });

  test("opsezi i podrazumevane vrednosti su ispravni", () => {
    for (const preset of RETRO_PRESETS) {
      expect(preset.params.length).toBeGreaterThan(0);
      expect(preset.params.length).toBeLessThanOrEqual(RETRO_MAX_PARAMS);
      expect(new Set(preset.params.map((entry) => entry.key)).size).toBe(preset.params.length);
      expect(preset.strength).toBeGreaterThanOrEqual(RETRO_STRENGTH.min);
      expect(preset.strength).toBeLessThanOrEqual(RETRO_STRENGTH.max);
      for (const entry of preset.params) {
        expect(entry.min, `${preset.id}.${entry.key}`).toBeLessThan(entry.max);
        expect(entry.step).toBeGreaterThan(0);
        expect(entry.default).toBeGreaterThanOrEqual(entry.min);
        expect(entry.default).toBeLessThanOrEqual(entry.max);
        // Podrazumevano je tačno na koraku klizača.
        expect(Number.isInteger(Number(((entry.default - entry.min) / entry.step).toFixed(9)))).toBe(true);
      }
    }
  });

  test("bez izmena: podrazumevane vrednosti preseta", () => {
    for (const preset of RETRO_PRESETS) {
      const values = retroParamsFor(preset.id);
      expect(values.strength).toBe(preset.strength);
      expect(values.params).toEqual(Object.fromEntries(preset.params.map((entry) => [entry.key, entry.default])));
    }
  });
});

describe("svođenje parametara u opseg", () => {
  test("jačina i parametri se seku na granice i korak", () => {
    expect(retroParamsFor("vhs", 150).strength).toBe(100);
    expect(retroParamsFor("vhs", -5).strength).toBe(0);
    expect(retroParamsFor("vhs", 42.4).strength).toBe(42);
    expect(retroParamsFor("vhs", Number.NaN).strength).toBe(retroPreset("vhs").strength);
    const values = retroParamsFor("vhs", 50, { pomak: 999, linije: -3, sum: 12.6, mekoca: Number.POSITIVE_INFINITY });
    expect(values.params).toEqual({ pomak: 100, linije: 0, sum: 13, mekoca: 50 });
  });

  test("nepoznat ključ i tekst se odbacuju", () => {
    const values = retroParamsFor("nokia", 100, { mreza: "70", nepoznato: 5 });
    expect(values.params).toEqual({ mreza: 40, bledilo: 40 });
    expect(Object.keys(values.params)).not.toContain("nepoznato");
  });

  test("uniforme šejdera su 0..1, uvek četiri", () => {
    for (const preset of RETRO_PRESETS) {
      const uniforms = retroUniforms(preset.id, retroParamsFor(preset.id));
      expect(uniforms.params).toHaveLength(4);
      for (const value of [uniforms.strength, ...uniforms.params]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      // Višak mesta (manje od 4 parametra) je nula.
      expect(uniforms.params.slice(preset.params.length).every((value) => value === 0)).toBe(true);
    }
    expect(retroUniforms("glic", retroParamsFor("glic", 60, { blokovi: 100, rgb: 0, ucestalost: 25 }))).toEqual({
      strength: 0.6,
      params: [1, 0, 0.25, 0],
    });
  });
});

describe("seme šuma", () => {
  test("isti kadar uvek daje isto seme (pregled = izvoz)", () => {
    for (const index of [0, 1, 2, 29, 30, 1234, 99999]) expect(retroSeed(index)).toBe(retroSeed(index));
    expect(retroSeed(12)).toBe(retroSeed(12.7));
  });

  test("seme je 32-bitni ceo broj, susedni kadrovi se razlikuju", () => {
    const seeds = Array.from({ length: 2000 }, (_, index) => retroSeed(index));
    for (const seed of seeds) {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  test("neispravan broj kadra se svodi na 0", () => {
    expect(retroSeed(-4)).toBe(retroSeed(0));
    expect(retroSeed(Number.NaN)).toBe(retroSeed(0));
  });
});

describe("Nokia", () => {
  test("4 bita po kanalu = 4096 boja", () => {
    expect(NOKIA_COLORS).toBe(4096);
    expect(NOKIA.fps).toBe(12);
  });

  test("mreža piksela: duža stranica 176, oblik ostaje", () => {
    expect(nokiaSize(1920, 1080)).toEqual({ width: 176, height: 99 });
    expect(nokiaSize(1080, 1920)).toEqual({ width: 99, height: 176 });
    expect(nokiaSize(1000, 1000)).toEqual({ width: 176, height: 176 });
    expect(nokiaSize(176, 144)).toEqual({ width: 176, height: 144 });
  });

  test("30 fps → 12 fps: raspored ima ceil(trajanje × 12) kadrova", () => {
    expect(nokiaFrameSchedule(30, 1)).toEqual([0, 3, 5, 8, 10, 13, 15, 18, 20, 23, 25, 28]);
    expect(nokiaFrameSchedule(30, 2.5)).toHaveLength(30);
    expect(nokiaFrameSchedule(30, 1.01)).toHaveLength(13);
    expect(nokiaFrameSchedule(25, 0.5)).toHaveLength(6);
    expect(nokiaFrameSchedule(30, 0)).toEqual([]);
    // Poslednji kadar rasporeda postoji u izvoru.
    const schedule = nokiaFrameSchedule(30, 1.01);
    expect(schedule[schedule.length - 1]).toBeLessThanOrEqual(Math.ceil(1.01 * 30) - 1);
  });

  test("kadar se drži: 30 fps pokazuje samo 12 različitih kadrova u sekundi", () => {
    const held = Array.from({ length: 30 }, (_, i) => heldFrameIndex(i, 30, 12));
    expect(held.slice(0, 11)).toEqual([0, 0, 0, 3, 3, 5, 5, 5, 8, 8, 10]);
    expect(new Set(held).size).toBe(12);
    // Držani kadar nikad nije iz budućnosti i sam sebe drži.
    held.forEach((source, i) => {
      expect(source).toBeLessThanOrEqual(i);
      expect(heldFrameIndex(source, 30, 12)).toBe(source);
    });
    // Isti kadrovi kao raspored na 12 fps.
    expect([...new Set(held)]).toEqual(nokiaFrameSchedule(30, 1));
  });

  test("izvor sporiji ili jednak 12 fps ne drži ništa", () => {
    for (const fps of [10, 12]) {
      for (let i = 0; i < 24; i += 1) expect(heldFrameIndex(i, fps, 12)).toBe(i);
    }
  });

  test("otkucaj sata od 12 fps prati vreme kadra", () => {
    expect(retroTick(0)).toBe(0);
    expect(retroTick(1 / 30)).toBe(0);
    expect(retroTick(3 / 30)).toBe(1);
    expect(retroTick(5 / 30)).toBe(2);
    expect(retroTick(1)).toBe(12);
    expect(retroTick(-1)).toBe(0);
  });
});

describe("VHS natpis", () => {
  test("PLAY ▶, datum i brojač", () => {
    expect(vhsStamp(new Date(1996, 2, 12), 7)).toEqual({ play: "PLAY ▶", date: "12.03.1996", counter: "0:00:07" });
    expect(vhsStamp({ d: 1, m: 1, y: 2024 }, 3725.9)).toEqual({ play: "PLAY ▶", date: "01.01.2024", counter: "1:02:05" });
    expect(vhsStamp({ d: 31, m: 12, y: 1989 }, -3).counter).toBe("0:00:00");
    expect(vhsStamp({ d: 31, m: 12, y: 1989 }, 59.99).counter).toBe("0:00:59");
  });

  test("polje datuma tamo-nazad", () => {
    expect(parseDateInput("1996-03-12")).toEqual({ d: 12, m: 3, y: 1996 });
    expect(parseDateInput(dateInputValue(new Date(1996, 2, 12)))).toEqual({ d: 12, m: 3, y: 1996 });
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("1996-02-30")).toBeNull();
    expect(parseDateInput("1996-13-01")).toBeNull();
    expect(parseDateInput("12.03.1996")).toBeNull();
    expect(parseDateInput("2024-02-29")).toEqual({ d: 29, m: 2, y: 2024 });
  });
});

describe("pisaća mašina", () => {
  test("broj otkucanih slova raste sa vremenom", () => {
    expect(typewriterTitle("Zdravo svete", 0, 10)).toBe("");
    expect(typewriterTitle("Zdravo svete", 0.5, 10)).toBe("Zdrav");
    expect(typewriterTitle("Zdravo svete", 0.1, 10)).toBe("Z");
    expect(typewriterTitle("Zdravo svete", 100, 10)).toBe("Zdravo svete");
    expect(typewriterTitle("Zdravo", -1, 10)).toBe("");
  });

  test("slova sa kvačicama i ćirilica su po jedno slovo", () => {
    expect(Array.from(typewriterTitle("Ђурђевдан čćžšđ", 0.5, 12))).toHaveLength(6);
    expect(typewriterTitle("čćžšđ", 3 / 12)).toBe("čćž");
  });

  test("naslov je jedan red do 60 slova", () => {
    expect(cleanTypewriterText("  Leto \n u   Beogradu  ")).toBe("Leto u Beogradu");
    expect(Array.from(cleanTypewriterText("ž".repeat(80)))).toHaveLength(60);
  });
});
