import { describe, expect, test } from "vitest";

import {
  anglesFromDirection,
  anglesFromSpherePoint,
  clampLight,
  DEFAULT_LIGHT,
  horizontalWords,
  kelvinToRgb,
  LIGHT_PRESETS,
  lightDirection,
  lightSummary,
  relightPrompt,
  shadowWords,
  verticalWords,
  warmthWords,
  wrapAzimuth,
} from "./crea-relight";

describe("smer svetla na kugli", () => {
  test("uglovi ↔ vektor idu tamo i nazad", () => {
    for (const azimuth of [-180, -135, -90, -45, 0, 30, 90, 150]) {
      for (const elevation of [-30, 0, 20, 45, 89]) {
        const back = anglesFromDirection(lightDirection(azimuth, elevation));
        expect(back.elevation).toBe(elevation);
        expect(wrapAzimuth(back.azimuth - azimuth)).toBe(0);
      }
    }
  });

  test("osnovni pravci: spreda je ka kameri, −90° sleva, +90° zdesna, 90° gore", () => {
    const front = lightDirection(0, 0);
    expect(front.z).toBeCloseTo(1, 6);
    expect(lightDirection(-90, 0).x).toBeCloseTo(-1, 6);
    expect(lightDirection(90, 0).x).toBeCloseTo(1, 6);
    expect(lightDirection(0, 90).y).toBeCloseTo(1, 6);
    expect(lightDirection(180, 0).z).toBeCloseTo(-1, 6);
  });

  test("tačka na kugli ispod prsta: sredina = spreda, levo = sleva, gore = odozgo, van kugle = bočno", () => {
    expect(anglesFromSpherePoint(0, 0)).toEqual({ azimuth: 0, elevation: 0 });
    expect(anglesFromSpherePoint(-1, 0)).toEqual({ azimuth: -90, elevation: 0 });
    expect(anglesFromSpherePoint(0, 1)).toEqual({ azimuth: 0, elevation: 90 });
    expect(anglesFromSpherePoint(-0.5, 0.5).azimuth).toBeLessThan(0);
    expect(anglesFromSpherePoint(-0.5, 0.5).elevation).toBeGreaterThan(0);
    expect(anglesFromSpherePoint(3, 0)).toEqual({ azimuth: 90, elevation: 0 });
  });

  test("granice: smer se obmotava, visina i toplina se svode, mekoća je jedna od dve", () => {
    expect(wrapAzimuth(190)).toBe(-170);
    expect(wrapAzimuth(-180)).toBe(180);
    expect(clampLight({ azimuth: 370, elevation: 200, kelvin: 99999, softness: "tvrdo" })).toEqual({
      azimuth: 10,
      elevation: 90,
      kelvin: 10000,
      softness: "tvrdo",
    });
    expect(clampLight({ azimuth: Number.NaN, elevation: -80, kelvin: 10, softness: "x" as "meko" }).softness).toBe("meko");
    for (const preset of LIGHT_PRESETS) expect(clampLight(preset.setup), preset.id).toEqual(preset.setup);
  });
});

describe("toplina", () => {
  test("niža temperatura je crvenija, viša plavlja", () => {
    const candle = kelvinToRgb(1900);
    const day = kelvinToRgb(6500);
    const blue = kelvinToRgb(10000);
    expect(candle[0]).toBe(255);
    expect(candle[2]).toBeLessThan(day[2]);
    expect(day[2]).toBeLessThanOrEqual(blue[2]);
    expect(blue[0]).toBeLessThan(candle[0]);
    for (const value of [...candle, ...day, ...blue]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(255);
    }
  });

  test("rečima: sveća, zalazak, dnevno, plavi sat", () => {
    expect(warmthWords(1900).sr).toContain("sveće");
    expect(warmthWords(3200).sr).toContain("zalazak");
    expect(warmthWords(5600).sr).toContain("dnevno");
    expect(warmthWords(9000).en).toContain("blue hour");
  });
});

describe("opis svetla za model", () => {
  test("vodoravno i uspravno rečima", () => {
    expect(horizontalWords(0).sr).toBe("spreda");
    expect(horizontalWords(-45).sr).toBe("spreda sleva");
    expect(horizontalWords(90).sr).toBe("zdesna");
    expect(horizontalWords(-140).sr).toBe("sleva i otpozadi");
    expect(horizontalWords(175).sr).toContain("kontra");
    expect(verticalWords(-20).sr).toBe("odozdo");
    expect(verticalWords(0).sr).toBe("u visini lica");
    expect(verticalWords(30).sr).toBe("malo odozgo");
    expect(verticalWords(80).en).toContain("directly above");
  });

  test("senke padaju na suprotnu stranu od svetla", () => {
    expect(shadowWords(-60, 30).sr).toContain("udesno");
    expect(shadowWords(60, 30).sr).toContain("ulevo");
    expect(shadowWords(60, -20).sr).toContain("nagore");
    expect(shadowWords(0, 80).sr).toContain("pravo nadole");
    expect(shadowWords(180, 10).en).toContain("rim");
  });

  test("ceo opis: smer u stepenima, toplina u K, mekoća, i da se ostalo NE menja", () => {
    const sr = relightPrompt({ azimuth: -60, elevation: 35, kelvin: 3200, softness: "meko" }, "sr");
    expect(sr).toContain("Promeni samo osvetljenje");
    expect(sr).toContain("spreda sleva");
    expect(sr).toContain("60° levo od kamere");
    expect(sr).toContain("35° iznad visine očiju");
    expect(sr).toContain("3200 K");
    expect(sr).toContain("meko");
    expect(sr).toContain("udesno");
    expect(sr).toContain("ostaju potpuno isti");

    const en = relightPrompt({ azimuth: 100, elevation: -15, kelvin: 9000, softness: "tvrdo" }, "en", "neon in the hair");
    expect(en).toContain("from the right");
    expect(en).toContain("100° to the right of the camera");
    expect(en).toContain("15° below eye level");
    expect(en).toContain("hard and directional");
    expect(en).toContain("Also: neon in the hair.");
  });

  test("isti izbor daje isti opis (deterministički), a drugi izbor drugi", () => {
    expect(relightPrompt(DEFAULT_LIGHT, "sr")).toBe(relightPrompt({ ...DEFAULT_LIGHT }, "sr"));
    const prompts = new Set(LIGHT_PRESETS.map((preset) => relightPrompt(preset.setup, "sr")));
    expect(prompts.size).toBe(LIGHT_PRESETS.length);
    expect(lightSummary({ azimuth: -60, elevation: 20, kelvin: 3200, softness: "meko" }, "sr")).toBe(
      "Spreda sleva, malo odozgo · toplo, kao zalazak sunca (3200 K) · meko",
    );
  });
});
