/**
 * Raspored teksta (S28/S29, K10): prelom po rečima, duge reči po slovima, i
 * `fit` koji smanjuje slova tako da tekst NIKAD ne izađe iz svog okvira.
 */
import { describe, expect, test } from "vitest";

import { layoutText, MIN_FONT_SIZE, wrapLines, type MeasureText } from "./crea-text-fit";

/** Svako slovo je široko pola veličine fonta (dovoljno za proveru pravila). */
const measure: MeasureText = (text, fontSize) => Array.from(text).length * fontSize * 0.5;

function assertInsideBox(lines: string[], fontSize: number, width: number) {
  for (const line of lines) expect(measure(line, fontSize), line).toBeLessThanOrEqual(width + 0.001);
}

describe("prelom", () => {
  test("reči idu u red dok staju, prazan red ostaje", () => {
    // 10 px po slovu na 20 px: širina 100 = 10 slova.
    expect(wrapLines("Čačak Šabac Žabalj", 100, 20, measure)).toEqual(["Čačak", "Šabac", "Žabalj"]);
    expect(wrapLines("ab cd ef", 100, 20, measure)).toEqual(["ab cd ef"]);
    expect(wrapLines("prvi\n\ntreći", 100, 20, measure)).toEqual(["prvi", "", "treći"]);
  });

  test("reč šira od okvira se lomi po slovima (i ćirilica)", () => {
    const lines = wrapLines("Ђурђевданскииии", 50, 20, measure);
    expect(lines).toEqual(["Ђурђе", "вданс", "кииии"]);
    assertInsideBox(lines, 20, 50);
  });

  test("višak razmaka se ne pretvara u prazne reči", () => {
    expect(wrapLines("  a   b  ", 100, 20, measure)).toEqual(["a b"]);
  });
});

describe("fit", () => {
  const box = { width: 400, height: 200, lineHeight: 1.2 };

  test("kratak tekst ostaje na najvećoj veličini", () => {
    const layout = layoutText({ text: "Slava", ...box, fontSize: 80, minFontSize: 20, fit: true }, measure);
    expect(layout.fontSize).toBe(80);
    expect(layout.truncated).toBe(false);
  });

  test("duži tekst smanji slova i staje u okvir - širinom i visinom", () => {
    const long = "Pozivamo vas na slavu Sveti Nikola u nedelju posle podne";
    const layout = layoutText({ text: long, ...box, fontSize: 80, minFontSize: 12, fit: true }, measure);
    expect(layout.fontSize).toBeLessThan(80);
    expect(layout.height).toBeLessThanOrEqual(box.height);
    assertInsideBox(layout.lines, layout.fontSize, box.width);
    expect(layout.lines.join(" ")).toBe(long);
    // Najveća veličina koja staje: jedan više više ne staje.
    const bigger = layoutText({ text: long, ...box, fontSize: layout.fontSize + 1, fit: false }, measure);
    expect(bigger.height > box.height || bigger.lines.some((line) => measure(line, layout.fontSize + 1) > box.width)).toBe(true);
  });

  test("ni najmanja veličina ne staje: redovi se seku sa „…\" i i dalje su u okviru", () => {
    const huge = "reč ".repeat(400);
    const layout = layoutText({ text: huge, ...box, fontSize: 80, minFontSize: 20, fit: true }, measure);
    expect(layout.truncated).toBe(true);
    expect(layout.fontSize).toBe(20);
    expect(layout.height).toBeLessThanOrEqual(box.height);
    expect(layout.lines[layout.lines.length - 1]?.endsWith("…")).toBe(true);
    assertInsideBox(layout.lines, 20, box.width);
  });

  test("radije manja slova nego reč prelomljena po slovima", () => {
    // „POČETNIKE" (9 slova) na 130 px je šira od 580 px, pa bi se lomila; na 128 px staje cela.
    const layout = layoutText({ text: "AI ZA POČETNIKE", width: 580, height: 400, fontSize: 130, minFontSize: 48, lineHeight: 1, fit: true }, measure);
    expect(layout.brokenWord).toBe(false);
    expect(layout.lines).toEqual(["AI ZA", "POČETNIKE"]);
    expect(layout.fontSize).toBe(128);
    // Kad ni najmanja veličina ne da celu reč, prelom je dozvoljen (i tekst i dalje staje).
    const forced = layoutText({ text: "Ђурђевданскииии", width: 100, height: 400, fontSize: 60, minFontSize: 20, lineHeight: 1, fit: true }, measure);
    expect(forced.brokenWord).toBe(true);
    expect(forced.height).toBeLessThanOrEqual(400);
    assertInsideBox(forced.lines, forced.fontSize, 100);
  });

  test("bez `fit` veličina je zadata, a visina raste sa redovima", () => {
    const layout = layoutText({ text: "jedan dva tri četiri pet šest", width: 100, fontSize: 20, lineHeight: 1.5, fit: false }, measure);
    expect(layout.fontSize).toBe(20);
    expect(layout.height).toBe(layout.lines.length * 30);
  });

  test("veličina nikad ispod donje granice", () => {
    const layout = layoutText({ text: "a", width: 10, height: 1, fontSize: 2, fit: true, lineHeight: 1 }, measure);
    expect(layout.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
  });
});
