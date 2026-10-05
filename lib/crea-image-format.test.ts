import { describe, expect, test } from "vitest";

import {
  CANVAS_MAX_PIXELS,
  clampQuality,
  CREA_IMAGE_FORMAT_IDS,
  encoderQuality,
  fitPixels,
  needsWasmEncoder,
  outputFileName,
  QUALITY_DEFAULT,
  sensitiveMetadata,
  sizeChangePercent,
} from "./crea-image-format";

describe("format i kvalitet", () => {
  test("tri formata, PNG bez kvaliteta", () => {
    expect(CREA_IMAGE_FORMAT_IDS).toEqual(["webp", "jpeg", "png"]);
    expect(encoderQuality("webp", 80)).toBe(0.8);
    expect(encoderQuality("jpeg", 120)).toBe(1);
    expect(encoderQuality("png", 80)).toBeUndefined();
  });

  test("kvalitet se drži u granicama", () => {
    expect(clampQuality(10)).toBe(40);
    expect(clampQuality(73.6)).toBe(74);
    expect(clampQuality(Number.NaN)).toBe(QUALITY_DEFAULT);
  });

  test("Safari koji vrati PNG umesto WebP-a traži jSquash", () => {
    expect(needsWasmEncoder("webp", "image/png")).toBe(true);
    expect(needsWasmEncoder("webp", "image/webp")).toBe(false);
    expect(needsWasmEncoder("jpeg", undefined)).toBe(true);
  });
});

describe("granica piksela", () => {
  test("mala slika ostaje ista", () => {
    expect(fitPixels(4000, 3000)).toEqual({ width: 4000, height: 3000, scaled: false });
  });

  test("48 MP sa telefona se srazmerno smanjuje ispod granice iPhone-a", () => {
    const fit = fitPixels(8064, 6048);
    expect(fit.scaled).toBe(true);
    expect(fit.width * fit.height).toBeLessThanOrEqual(CANVAS_MAX_PIXELS);
    expect(fit.width / fit.height).toBeCloseTo(8064 / 6048, 2);
  });
});

describe("ime fajla i ušteda", () => {
  test("nastavak se menja, putanja i zabranjeni znakovi nestaju", () => {
    expect(outputFileName("odmor-na-moru.HEIC", "webp")).toBe("odmor-na-moru.webp");
    expect(outputFileName("C:\\slike\\Ćevapi u Nišu.png", "jpeg")).toBe("Ćevapi u Nišu.jpg");
    expect(outputFileName("a<b>:c.png", "png")).toBe("abc.png");
    expect(outputFileName(".png", "webp")).toBe("slika.webp");
    expect(outputFileName("x".repeat(200) + ".png", "png")).toHaveLength(84);
  });

  test("procenat promene", () => {
    expect(sizeChangePercent(1000, 250)).toBe(-75);
    expect(sizeChangePercent(1000, 1200)).toBe(20);
    expect(sizeChangePercent(0, 10)).toBe(0);
  });
});

describe("skriveni podaci", () => {
  test("lokacija, uređaj, datum i autor iz exifr izlaza", () => {
    expect(
      sensitiveMetadata({
        latitude: 44.8,
        longitude: 20.4,
        Make: "Apple",
        Model: "iPhone 15",
        DateTimeOriginal: new Date(0),
        Artist: "Mila",
      }),
    ).toEqual(["gps", "device", "date", "author"]);
    expect(sensitiveMetadata({ Orientation: 1, ImageWidth: 100 })).toEqual([]);
    expect(sensitiveMetadata(undefined)).toEqual([]);
    expect(sensitiveMetadata({ Make: "" })).toEqual([]);
  });
});
