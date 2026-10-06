import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * Smanjen pokret (K25, U16): Crea ne sme da mrda kad korisnik to ne želi. Dve mehaničke
 * provere nad izvorom - CSS klase Cree sa `animation` žive samo u `no-preference` bloku, a
 * Tailwind `animate-*` u komponentama Cree ide samo kroz `motion-safe:`. Pokret iz
 * motion/react i rAF petlji prolazi kroz `creaMotionFor` (test u `motion-contract.test.ts`).
 */

const root = join(__dirname, "..");

/** Blokovi `@media (...) { ... }` sa tačnim granicama (brojanje vitičastih zagrada). */
function mediaBlocks(css: string): Array<{ query: string; start: number; end: number }> {
  const blocks: Array<{ query: string; start: number; end: number }> = [];
  const pattern = /@media\s*([^{]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css))) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < css.length && depth > 0) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push({ query: match[1]!.trim(), start: match.index, end: index });
  }
  return blocks;
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("Crea poštuje prefers-reduced-motion", () => {
  test("svaka `.crea-*` klasa sa animacijom je samo u no-preference bloku", () => {
    const css = readFileSync(join(root, "app/globals.css"), "utf8");
    const safe = mediaBlocks(css).filter((block) => block.query.includes("prefers-reduced-motion: no-preference"));
    const rules = [...css.matchAll(/\.crea-[\w-]+[^{]*\{[^}]*\banimation\s*:/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const inside = safe.some((block) => rule.index! > block.start && rule.index! < block.end);
      expect(inside, rule[0].split("{")[0]!.trim()).toBe(true);
    }
  });

  test("Tailwind `animate-*` u komponentama Cree samo uz `motion-safe:`", () => {
    const offenders: string[] = [];
    for (const path of files(join(root, "components/crea"))) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/(?<=["'`\s])([\w:-]*)animate-[\w[\]-]+/g)) {
        if (!match[1]!.includes("motion-safe:")) offenders.push(`${path.slice(root.length + 1)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("logo zraci pulsiraju samo uz dozvoljen pokret", () => {
    const logo = readFileSync(join(root, "components/crea/crea-logo.tsx"), "utf8");
    expect(logo).toContain("motion-safe:animate-[crea-ray");
  });
});
