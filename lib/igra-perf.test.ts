import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * Performanse i pristupačnost (K28): ispravke koje provera izvora može da čuva - DPR 3D
 * platna, lakši početni JS (kostur table, tekstovi stanja), slavlje koje ne otima fokus
 * dok se kuca i rang lista bez lažnih linkova i bez `aria-live` preko cele liste.
 */

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [relative(ROOT, join(ROOT, path)).replace(/\\/g, "/")] : [];
  });
}

describe("3D posle prijave", () => {
  test("svako platno ograničava DPR na najviše 1,5", () => {
    const canvases = [...sources("components/igra"), ...sources("components/crea")].filter((file) => /<Canvas[\s>]/.test(read(file)));
    expect(canvases).toEqual(expect.arrayContaining(["components/igra/three/igra-three-canvas.tsx", "components/crea/mascot/crea-mascot-canvas.tsx"]));
    for (const file of canvases) {
      const source = read(file);
      const dpr = source.match(/dpr=\{\[1, ([\d.]+)\]\}/);
      if (dpr) expect(Number(dpr[1]), file).toBeLessThanOrEqual(1.5);
      else expect(source, file).toContain("dpr={IGRA_THREE_DPR}");
    }
  });

  test("maskota nastavlja da crta kad se korisnik vrati na tab (kadar se pamti, ne samo gasi)", () => {
    const mascot = read("components/crea/mascot/crea-mascot.tsx");
    expect(mascot).toContain("const onVisibility = () => setVisible(inView && !document.hidden);");
    expect(mascot).not.toContain("setVisible((current) => current && !document.hidden)");
  });
});

describe("početni JS", () => {
  test("granice greške i traka bez mreže ne uvoze ceo `lib/igra-copy`", () => {
    for (const file of ["lib/igra-state.ts", "components/igra/igra-state.tsx", "components/igra/igra-error-state.tsx", "components/igra/igra-offline-bar.tsx"]) {
      expect(read(file), file).not.toMatch(/igra-copy"/);
    }
    expect(read("lib/igra-state.ts")).toContain('from "./igra-state-copy"');
    expect(read("lib/igra-copy.ts")).not.toContain("IGRA_STATE_COPY");
  });
});

describe("slavlje (K28)", () => {
  const host = read("components/igra/celebration-host.tsx");

  test("preklop se ne otvara dok korisnik kuca; kartica u uglu (bez fokusa) sme", () => {
    expect(host).toContain("const typing = !reduced && isTypingTarget(document.activeElement as HTMLElement | null);");
    expect(host).toContain("if (document.hidden || typing || document.querySelector(BUSY_SELECTOR)) {");
  });

  test("kad mu korisnik priđe mišem ili tastaturom, slavlje se više ne gasi samo", () => {
    expect(host).toContain("if (!shown || held) return;");
    expect(host).toMatch(/onPointerEnter=\{onHold\}\s+onKeyDown=/);
    expect(host).toContain('if (event.key !== "Escape") onHold();');
    expect(host).toContain('aria-live="polite" onPointerEnter={hold} onFocus={hold}');
  });

  test("zaključan skrol strane drži širinu skrol-bara (nema skoka na Windows-u)", () => {
    const dialog = read("components/ui/dialog.tsx");
    expect(dialog).toContain('document.documentElement.style.scrollbarGutter = "stable"');
    expect(dialog).toContain('document.documentElement.style.scrollbarGutter = gutterBeforeFirstTrap ?? "";');
  });
});

describe("rang lista (K28)", () => {
  const board = read("components/app/community-v2/community-leaderboard.tsx");
  const podium = read("components/igra/podium.tsx");

  test("nema lažnih linkova: bez korisničkog imena red nije link", () => {
    for (const source of [board, podium]) {
      expect(source).not.toContain('href ?? "#"');
      expect(source).not.toContain("aria-disabled={!href}");
    }
    expect(board).toMatch(/\{href \? \(\s+<Link href=\{href\} tabIndex=\{duplicate \? -1 : undefined\} className=\{ROW_MEMBER\}>/);
    expect(podium).toMatch(/\{href \? \(\s+<Link href=\{href\} className=\{PLACE_CARD\}>/);
  });

  test("lista koja se menja uživo nije `aria-live` oblast", () => {
    expect(board).not.toContain('aria-live="polite"');
    expect(board).toContain('<section ref={boardRef} className="min-w-0 space-y-6">');
  });

  test("„ti\" red je jedna meta: kopija reda koji je već na listi se ne fokusira i ne čita", () => {
    expect(board).toContain('const duplicate = bar.kind === "row" && bar.onBoard;');
    expect(board).toContain("aria-hidden={duplicate || undefined}");
    expect(board).toContain("inBar duplicate={duplicate}");
  });

  test("fokusiran red ne ostaje ispod lepljivih traka („ti\" red dole, filter gore)", () => {
    expect(board).toMatch(/const ROW_MEMBER =\s+"[^"]*scroll-mt-44 scroll-mb-40[^"]*md:scroll-mt-32 md:scroll-mb-24"/);
  });

  test("lista koja čeka ulaz ostaje u Tab redosledu (`opacity`, ne `autoAlpha`)", () => {
    const stagger = read("components/igra/motion/use-enter-stagger.ts");
    expect(stagger).toContain("gsap.set(items, { opacity: 0, y: IGRA_MOTION.enterY });");
    expect(stagger).not.toMatch(/autoAlpha:|"transform,opacity,visibility"/);
  });
});

describe("kontrast pečata (K28)", () => {
  const css = read("app/globals.css");
  const hex = (value: string) => [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16));
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  test("tekst pečata u svetloj temi je ≥ 4,5:1 na svakom papiru; tamna tema zadržava svoj koral", () => {
    const stamp = css.match(/--igra-stamp: (#[0-9a-f]{6});/i)?.[1];
    expect(stamp).toBeDefined();
    for (const paper of ["#fffdf8", "#FDEED8", "#F4F0E8"]) expect(ratio(stamp!, paper), paper).toBeGreaterThanOrEqual(4.5);
    const dark = css.slice(css.indexOf('\n[data-theme="dark"] {'));
    expect(dark.slice(0, dark.indexOf("}"))).toContain("--igra-stamp: var(--level-accent-4);");
  });
});
