import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

/**
 * Telefon (K26): dodirne mete od 44 px na prst, zatvorena fioka bez senke na ekranu i
 * traka filtera rang liste koja se na telefonu prelama umesto da beži udesno.
 */

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

describe("dodirne mete (pointer: coarse)", () => {
  test("`.igra-hit` širi metu na 44 px samo na prst, u @layer components", () => {
    const css = read("app/globals.css");
    const at = css.indexOf("@media (pointer: coarse)");
    expect(at).toBeGreaterThan(-1);
    // Odmah unutar `@layer components {`: autorski utility (`absolute`, `fixed`) pobeđuje.
    expect(css.slice(css.lastIndexOf("@layer components", at), at)).toMatch(/^@layer components \{\s*$/);
    const block = css.slice(at, css.indexOf("/* IGRA (K24): podrazumevano", at));
    expect(block).toContain(".igra-hit::after");
    expect(block).toContain("inset: min(0px, calc((100% - 44px) / 2))");
  });

  test("malo dugme (`size=\"sm\"`) na prst raste na 44 px", () => {
    expect(read("components/ui/button.tsx")).toMatch(/sm: "min-h-10[^"]*pointer-coarse:min-h-11"/);
  });

  test("gusti natpisi i prekidači nose `igra-hit`", () => {
    for (const [file, marker] of [
      ["components/app/sound-toggle.tsx", '"igra-press igra-hit'],
      ["components/app/chat/chat-thread.tsx", 'className="igra-hit rounded-full border border-line'],
      ["components/studio/param-control.tsx", '"igra-hit inline-flex h-7 w-12'],
      ["components/app/community-v2/community-shared.tsx", 'className="igra-hit relative z-10 shrink-0'],
    ] as const) {
      expect(read(file), file).toContain(marker);
    }
  });
});

describe("raspored na 390 px", () => {
  test("zatvorena fioka ne baca senku preko leve ivice ekrana", () => {
    const sidebar = read("components/app/app-sidebar.tsx");
    const base = sidebar.match(/"app-sidebar fixed[^"]*"/)?.[0] ?? "";
    expect(base).toContain("-translate-x-full");
    expect(base).not.toContain("shadow-");
    expect(sidebar).toContain('mobileOpen && "translate-x-0 shadow-[18px_0_45px_var(--shadow-hard)]"');
  });

  test("traka filtera rang liste se na telefonu prelama, od `sm` je jedan red", () => {
    expect(read("components/app/community-v2/community-filters.tsx")).toContain(
      'inline ? "flex flex-wrap items-center gap-2 sm:min-w-max sm:flex-nowrap"',
    );
    expect(read("components/app/community-v2/community-leaderboard.tsx")).toContain(
      '<div className="flex items-center gap-2 sm:min-w-max">',
    );
  });
});
