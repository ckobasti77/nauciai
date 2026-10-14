import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * IGRA tokeni i klase u `app/globals.css` (K02). Dve mehaničke provere nad izvorom:
 * token koji zavisi od teme ima tamnog parnjaka, a `.igra-*` klasa sme da animira samo
 * u `prefers-reduced-motion: no-preference` bloku (isto pravilo kao `.crea-*`).
 */

const css = readFileSync(join(__dirname, "..", "app/globals.css"), "utf8").replace(/\r\n/g, "\n");

/** Telo prvog bloka koji počinje datim selektorom (brojanje vitičastih zagrada). */
function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`nema bloka: ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 1;
  let index = open + 1;
  while (index < css.length && depth > 0) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") depth -= 1;
    index += 1;
  }
  return css.slice(open + 1, index - 1);
}

function tokensIn(block: string): string[] {
  return [...block.matchAll(/(--igra-[\w-]+)\s*:/g)].map((match) => match[1]!);
}

function mediaBlocks(source: string): Array<{ query: string; start: number; end: number }> {
  const blocks: Array<{ query: string; start: number; end: number }> = [];
  const pattern = /@media\s*([^{]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === "{") depth += 1;
      else if (source[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push({ query: match[1]!.trim(), start: match.index, end: index });
  }
  return blocks;
}

describe("IGRA tokeni", () => {
  const light = blockAfter(":root,\n[data-theme=\"dark\"] :is(");
  const dark = blockAfter("\n[data-theme=\"dark\"] {");
  const theme = blockAfter("@theme inline");

  test("svetla tema definiše ceo skup", () => {
    expect(tokensIn(light)).toEqual(
      expect.arrayContaining([
        "--igra-marker",
        "--igra-marker-wash",
        "--igra-track",
        "--igra-sticker-edge",
        "--igra-sticker-shadow",
        "--igra-stamp",
        "--igra-locked-filter",
        "--igra-medal-gold",
        "--igra-medal-silver",
        "--igra-medal-bronze",
        "--igra-scene-paper",
        "--igra-paper-grain",
        "--igra-paper-grain-opacity",
        "--igra-paper-grain-blend",
      ]),
    );
  });

  test("token koji zavisi od teme ima tamnog parnjaka", () => {
    // Mešavine sa papirom/mastilom i sve što bi na tamnom nestalo (senka, silueta, tekstura).
    expect(tokensIn(dark)).toEqual(
      expect.arrayContaining([
        "--igra-marker-wash",
        "--igra-track",
        "--igra-sticker-shadow",
        "--igra-locked-filter",
        "--igra-paper-grain-opacity",
        "--igra-paper-grain-blend",
      ]),
    );
  });

  test("tamna tema ne uvodi token kojeg nema u svetloj", () => {
    const lightTokens = new Set(tokensIn(light));
    for (const token of tokensIn(dark)) expect(lightTokens.has(token), token).toBe(true);
  });

  test("žuta markera se ne menja po temi", () => {
    expect(light).toMatch(/--igra-marker:\s*var\(--yellow\)/);
    expect(tokensIn(dark)).not.toContain("--igra-marker");
  });

  test("papir scene je ton slike: isti u obe teme", () => {
    expect(tokensIn(dark)).not.toContain("--igra-scene-paper");
  });

  test("boje su dostupne kao Tailwind klase", () => {
    for (const name of ["marker", "marker-wash", "track", "stamp", "sticker-edge", "scene-paper"]) {
      expect(theme, name).toContain(`--color-igra-${name}: var(--igra-${name});`);
    }
  });
});

describe("IGRA klase", () => {
  test("osnovne klase postoje", () => {
    for (const name of ["igra-sticker", "igra-paper", "igra-marker", "igra-stamp", "igra-tape"]) {
      expect(css, name).toMatch(new RegExp(`\\.${name}[\\s{:\\[]`));
    }
  });

  test("`.igra-*` klasa sa animacijom je samo u no-preference bloku", () => {
    const safe = mediaBlocks(css).filter((block) => block.query.includes("prefers-reduced-motion: no-preference"));
    for (const rule of css.matchAll(/\.igra-[\w-]+[^{}]*\{[^}]*\b(?:animation|transition)\s*:/g)) {
      const inside = safe.some((block) => rule.index! > block.start && rule.index! < block.end);
      expect(inside, rule[0].split("{")[0]!.trim()).toBe(true);
    }
  });

  test("nijedna `.igra-*` klasa ne crta okvir niti uvodi svoj radijus", () => {
    for (const rule of css.matchAll(/\.igra-[\w-]+[^{}]*\{([^}]*)\}/g)) {
      const body = rule[1]!;
      const name = rule[0].split("{")[0]!.trim();
      expect(body, name).not.toMatch(/\bborder(?:-(?:top|right|bottom|left|width|style|color))?\s*:/);
      for (const radius of body.matchAll(/border-radius\s*:\s*([^;]+);/g)) {
        expect(["inherit", "var(--button-radius)"], name).toContain(radius[1]!.trim());
      }
    }
  });
});

describe("IGRA komponente: samo četiri radijusa (AGENTS.md)", () => {
  const root = join(__dirname, "..");
  const files = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((name) => {
      const path = `${dir}/${name}`;
      if (statSync(join(root, path)).isDirectory()) return files(path);
      return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });

  test("nema imenovane Tailwind skale ni proizvoljnog radijusa van 8/12/16 px", () => {
    // `rounded-t-xl` je 12 px samo dok tema ne promeni skalu; tier se piše vrednošću ili `surface-*`.
    for (const file of [...files("components/igra"), "app/[locale]/igra-izlog/page.tsx"]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, file).not.toMatch(/\brounded(?:-[trblse]{1,2})?-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl)\b/);
      for (const match of source.matchAll(/\brounded(?:-[trblse]{1,2})?-\[([^\]]*)\]/g)) {
        expect(["8px", "12px", "16px"], `${file}: ${match[0]}`).toContain(match[1]);
      }
    }
  });
});
