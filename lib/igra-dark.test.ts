import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * Tamna tema (K27): žuta površina nosi mastilo ostrva (ne nasleđeni svetli tekst), a staza
 * trake i silueta zaključane nalepnice su dovoljno jake da se vide na tamnoj kartici.
 */

const css = readFileSync(join(__dirname, "..", "app/globals.css"), "utf8").replace(/\r\n/g, "\n");
const dark = css.slice(css.indexOf('[data-theme="dark"] {'));

describe("tamna tema", () => {
  test("`.bg-yellow` u tamnoj temi dobija `color: var(--ink)` u @layer base", () => {
    const at = css.indexOf('[data-theme="dark"] :is(\n    .bg-yellow,');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(css.lastIndexOf("@layer", at), at)).toMatch(/^@layer base \{\s*$/);
    expect(css.slice(at, css.indexOf("}", at))).toContain("color: var(--ink);");
  });

  test("staza trake je jača od 16 % mastila, a zaključana silueta od 22 %", () => {
    const track = dark.match(/--igra-track: color-mix\(in srgb, var\(--ink\) (\d+)%/);
    expect(Number(track?.[1])).toBeGreaterThanOrEqual(28);
    const locked = dark.match(/--igra-locked-filter: [^;]*opacity\(([\d.]+)\)/);
    expect(Number(locked?.[1])).toBeGreaterThanOrEqual(0.4);
  });
});
