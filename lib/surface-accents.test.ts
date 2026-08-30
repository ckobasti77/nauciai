import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Regresioni cuvar recnika tvrdih senki (U12).
 *
 * Brend ima tacno dva ofset akcenta:
 *   - `var(--shadow-hard*)` = obicna povrsina podignuta sa stola,
 *   - `var(--yellow)`       = "ova povrsina je istaknuta" (zakacena tema,
 *                             nepracitano obavestenje, korisan komentar, prvo
 *                             mesto na rang listi).
 *
 * Pre U12 je zuta senka bila ispisana kao goli `rgba(244, 190, 48, ALFA)` sa
 * DESET razlicitih alfi (0.25 ... 0.9), pa se iz koda nije moglo procitati sta je
 * pravilo a sta slucajnost - a `#f4be30` sweep iz U8 ovaj zapis nije video, jer
 * je trazio heks. Ovaj test ne da da se goli zapis vrati.
 *
 * `components/ui/primitives.tsx` je dokumentovan izuzetak: `LinkButton tone="smoke"`
 * je varijanta koja se renderuje i na marketing stranicama, a one nisu tema ovog
 * run-a, pa je njena tisa zuta senka (0.25 / 0.2 u tamnoj) ostavljena netaknuta.
 */
const APP_SCOPE = ["components/app", "components/studio", "app"];
const DOCUMENTED_EXCEPTIONS = ["components/ui/primitives.tsx"];

const RAW_YELLOW_SHADOW = /shadow-\[[^\]]*rgba\(\s*244\s*,\s*190\s*,\s*48/;

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsxFiles(path));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

const appFiles = APP_SCOPE.flatMap((dir) => collectTsxFiles(join(process.cwd(), dir))).filter(
  (path) => !DOCUMENTED_EXCEPTIONS.some((exception) => path.endsWith(exception.replace(/\//g, "\\")) || path.endsWith(exception)),
);

describe("recnik tvrdih senki", () => {
  it("nijedan app ekran ne pise zutu senku kao gol rgba", () => {
    const offenders = appFiles.filter((path) => RAW_YELLOW_SHADOW.test(readFileSync(path, "utf8")));
    expect(offenders, "koristi shadow-[Npx_Npx_0_0_var(--yellow)] umesto rgba(244,190,48,…)").toEqual([]);
  });

  it("scan uopste vidi fajlove - inace bi test prolazio prazan", () => {
    expect(appFiles.length).toBeGreaterThan(40);
  });
});

describe("skolske podloge", () => {
  const globalsCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  it("`ink-dots` postoji i izvodi se iz `--yellow`, ne iz golog rgba", () => {
    const block = /\.ink-dots\s*\{([\s\S]*?)\}\s*\n/.exec(globalsCss);
    expect(block, "nedostaje .ink-dots u app/globals.css").not.toBeNull();
    expect(block![1]).toContain("var(--yellow)");
    expect(block![1]).not.toMatch(/rgba\(\s*244/);
  });

  it("`sketch-grid` ostaje mastilo, pa dve podloge nisu ista stvar", () => {
    const block = /\.sketch-grid\s*\{([\s\S]*?)\}\s*\n/.exec(globalsCss);
    expect(block).not.toBeNull();
    expect(block![1]).toContain("var(--ink)");
  });
});
