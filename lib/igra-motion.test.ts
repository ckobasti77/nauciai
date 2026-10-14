import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "vitest";

import { formatOdometer, IGRA_MOTION, loadIgraPlugin, shouldAnimate } from "./igra-motion";
import { pageMotionContract } from "./motion-contract";

describe("IGRA_MOTION", () => {
  test("ulaz i stagger su isti kao standardni ulaz strane", () => {
    expect(IGRA_MOTION.enter).toBe(pageMotionContract.standard.itemDuration);
    expect(IGRA_MOTION.enterY).toBe(pageMotionContract.standard.itemY);
    expect(IGRA_MOTION.stagger).toBe(pageMotionContract.standard.stagger);
    expect(IGRA_MOTION.ease.out).toBe(pageMotionContract.standard.pageEase);
  });

  test("trajanja ostaju u granicama plana: mikro 120-220 ms, ulazi 300-600 ms, slavlje ≤ 2,5 s", () => {
    expect(IGRA_MOTION.micro).toBeGreaterThanOrEqual(0.12);
    expect(IGRA_MOTION.micro).toBeLessThanOrEqual(0.22);
    for (const enter of [IGRA_MOTION.enter, IGRA_MOTION.stamp]) {
      expect(enter).toBeGreaterThanOrEqual(0.3);
      expect(enter).toBeLessThanOrEqual(0.6);
    }
    expect(IGRA_MOTION.celebrate).toBeLessThanOrEqual(2.5);
    // Ceo stagger staje u pola sekunde i kad lista ima više od `staggerMax` stavki.
    expect(IGRA_MOTION.stagger * IGRA_MOTION.staggerMax).toBeLessThanOrEqual(0.5);
  });
});

describe("shouldAnimate", () => {
  test("animira samo bez smanjenog pokreta i u aktivnom tabu", () => {
    expect(shouldAnimate({ reduced: false })).toBe(true);
    expect(shouldAnimate({ reduced: false, hidden: false })).toBe(true);
  });

  test("smanjen pokret uvek gasi animaciju", () => {
    expect(shouldAnimate({ reduced: true })).toBe(false);
    expect(shouldAnimate({ reduced: true, hidden: false })).toBe(false);
  });

  test("u pozadinskom tabu nema animacije", () => {
    expect(shouldAnimate({ reduced: false, hidden: true })).toBe(false);
  });
});

describe("loadIgraPlugin", () => {
  test("na serveru odbija (pluginovi diraju DOM)", async () => {
    expect(typeof document).toBe("undefined");
    await expect(loadIgraPlugin("Flip")).rejects.toThrow(/Flip/);
  });
});

describe("formatOdometer", () => {
  test("separator hiljada po jeziku", () => {
    expect(formatOdometer(1250, "sr")).toBe("1.250");
    expect(formatOdometer(1250, "en")).toBe("1,250");
    expect(formatOdometer(1234567, "sr")).toBe("1.234.567");
    expect(formatOdometer(1234567, "en")).toBe("1,234,567");
  });

  test("ispod hiljadu nema separatora", () => {
    expect(formatOdometer(0, "sr")).toBe("0");
    expect(formatOdometer(7, "en")).toBe("7");
    expect(formatOdometer(999, "sr")).toBe("999");
    expect(formatOdometer(1000, "sr")).toBe("1.000");
  });

  test("usred brojanja zaokružuje na ceo broj", () => {
    expect(formatOdometer(999.4, "sr")).toBe("999");
    expect(formatOdometer(999.5, "sr")).toBe("1.000");
  });

  test("loš ulaz je nula, nikad NaN ni minus", () => {
    expect(formatOdometer(Number.NaN, "sr")).toBe("0");
    expect(formatOdometer(Number.POSITIVE_INFINITY, "sr")).toBe("0");
    expect(formatOdometer(-40, "en")).toBe("0");
  });
});

/**
 * Pravilo bundle-a (rules.md): three.js i GSAP pluginovi samo kroz dinamički uvoz. Build
 * to meri kroz `npm run check:bundle`; ovo hvata grešku već u testu, čitanjem izvora.
 */
describe("IGRA: teške biblioteke samo dinamički", () => {
  const root = join(__dirname, "..");

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  const files = [
    ...walk(join(root, "components/igra")),
    ...readdirSync(join(root, "lib"))
      .filter((name) => name.startsWith("igra-"))
      .map((name) => join(root, "lib", name)),
  ]
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.ts$/.test(path))
    .map((path) => ({ path: relative(root, path).replace(/\\/g, "/"), source: readFileSync(path, "utf8") }));

  /** Statički uvozi (`import … from "x"`), bez `import type` i bez dinamičkog `import("x")`. */
  function staticImports(source: string): string[] {
    return [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((match) => match[1]!);
  }

  /** Jedini fajlovi koji smeju da uvezu three.js: platno i modeli, a do njih vodi samo `next/dynamic`. */
  const THREE_FILES = new Set([
    "components/igra/three/igra-three-canvas.tsx",
    "components/igra/three/toon.tsx",
    "components/igra/three/trophy.tsx",
    "components/igra/three/medal.tsx",
  ]);

  test("ima šta da se proveri", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((file) => file.path === "components/igra/three/igra-three-stage.tsx")).toBe(true);
  });

  test("GSAP plugin se nigde ne uvozi statički", () => {
    const offenders = files.filter((file) => staticImports(file.source).some((name) => name.startsWith("gsap/")));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  test("`lib/igra-motion.ts` nema statički uvoz gsap-a", () => {
    const motion = files.find((file) => file.path === "lib/igra-motion.ts")!;
    expect(staticImports(motion.source).filter((name) => name === "gsap" || name.startsWith("@gsap/"))).toEqual([]);
    expect(motion.source).toContain('import("gsap/Flip")');
    expect(motion.source).toContain('import("gsap/DrawSVGPlugin")');
    expect(motion.source).toContain('import("gsap/SplitText")');
  });

  test("three.js uvoze samo platno i modeli", () => {
    const offenders = files.filter(
      (file) => !THREE_FILES.has(file.path) && staticImports(file.source).some((name) => name === "three" || name.startsWith("three/") || name.startsWith("@react-three/")),
    );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  test("do platna i modela vodi samo `next/dynamic` iz ljuske", () => {
    const heavy = [...THREE_FILES].map((path) => `@/${path.replace(/\.tsx$/, "")}`);
    const offenders = files.filter((file) => !THREE_FILES.has(file.path) && staticImports(file.source).some((name) => heavy.includes(name)));
    expect(offenders.map((file) => file.path)).toEqual([]);

    const stage = files.find((file) => file.path === "components/igra/three/igra-three-stage.tsx")!;
    expect(stage.source).toMatch(/dynamic\(\(\) => import\("@\/components\/igra\/three\/igra-three-canvas"\)/);
    expect(stage.source).toMatch(/ssr:\s*false/);
  });

  test("konfete se uvoze lenjo (ni `canvas-confetti` ni Crea ulaz nisu statički)", () => {
    const offenders = files.filter((file) => staticImports(file.source).some((name) => name === "canvas-confetti" || name.endsWith("/fire-confetti")));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });
});
