/**
 * QR kod (S31, K09): šta ide u kod i da li će ga kamera pročitati.
 */
import { describe, expect, test } from "vitest";

import {
  EMPTY_QR_FIELDS,
  normalizeLink,
  QR_COLOR_PRESETS,
  QR_MAX_BYTES,
  qrColorProblem,
  qrFileName,
  qrPayload,
  wifiPayload,
} from "./crea-qr";

describe("link", () => {
  test("bez šeme dobija https, web/mejl/telefon prolaze", () => {
    expect(normalizeLink(" nauciai.com/crea ")).toBe("https://nauciai.com/crea");
    expect(normalizeLink("http://primer.rs")).toBe("http://primer.rs");
    expect(normalizeLink("mailto:jovan@primer.rs")).toBe("mailto:jovan@primer.rs");
    expect(normalizeLink("tel:+381601234567")).toBe("tel:+381601234567");
  });

  test("odbija ono što nije adresa ili je opasno", () => {
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
    expect(normalizeLink("nauciai")).toBeNull();
    expect(normalizeLink("moj sajt.rs")).toBeNull();
    expect(normalizeLink("")).toBeNull();
  });
});

describe("Wi-Fi", () => {
  test("zapis koji čita kamera telefona, sa escape-ovanim znakovima", () => {
    expect(wifiPayload({ ssid: "Kuća", password: "tajna;123", security: "WPA", hidden: false })).toBe(
      "WIFI:T:WPA;S:Kuća;P:tajna\\;123;;",
    );
    expect(wifiPayload({ ssid: 'a:b,"c"\\', password: "", security: "nopass", hidden: true })).toBe(
      'WIFI:T:nopass;S:a\\:b\\,\\"c\\"\\\\;H:true;;',
    );
  });
});

describe("sadržaj koda", () => {
  test("prazno, loš link, predugo", () => {
    expect(qrPayload("link", EMPTY_QR_FIELDS)).toEqual({ ok: false, problem: "prazno" });
    expect(qrPayload("link", { ...EMPTY_QR_FIELDS, link: "nauciai" })).toEqual({ ok: false, problem: "los-link" });
    expect(qrPayload("tekst", { ...EMPTY_QR_FIELDS, text: "ž".repeat(QR_MAX_BYTES) })).toEqual({
      ok: false,
      problem: "predugo",
    });
    expect(qrPayload("wifi", { ...EMPTY_QR_FIELDS, ssid: "Kuca" })).toEqual({ ok: false, problem: "prazno" });
  });

  test("dobar unos", () => {
    expect(qrPayload("link", { ...EMPTY_QR_FIELDS, link: "nauciai.com" })).toEqual({ ok: true, data: "https://nauciai.com" });
    expect(qrPayload("tekst", { ...EMPTY_QR_FIELDS, text: "  Jelovnik: ćevapi  " })).toEqual({
      ok: true,
      data: "Jelovnik: ćevapi",
    });
    expect(qrPayload("wifi", { ...EMPTY_QR_FIELDS, ssid: "Kafić", security: "nopass" })).toEqual({
      ok: true,
      data: "WIFI:T:nopass;S:Kafić;;",
    });
  });
});

describe("boje", () => {
  test("brend preseti se čitaju", () => {
    for (const preset of QR_COLOR_PRESETS) expect(qrColorProblem(preset.dots, preset.background), preset.id).toBeNull();
  });

  test("slab kontrast, obrnute boje i nevažeća boja", () => {
    expect(qrColorProblem("#f4be30", "#fffdf8")).toBe("slab-kontrast");
    expect(qrColorProblem("#ffffff", "#0e3158")).toBe("obrnuto");
    expect(qrColorProblem("plava", "#ffffff")).toBe("nevazeca-boja");
  });
});

test("ime fajla po sadržaju, bez kvačica", () => {
  expect(qrFileName("link", { ...EMPTY_QR_FIELDS, link: "https://nauciai.com/crea" })).toBe("qr-nauciai-com-crea.png");
  expect(qrFileName("wifi", { ...EMPTY_QR_FIELDS, ssid: "Đurina Kuća" })).toBe("qr-wifi-djurina-kuca.png");
  expect(qrFileName("tekst", EMPTY_QR_FIELDS)).toBe("qr-tekst.png");
});
