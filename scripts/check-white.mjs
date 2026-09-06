#!/usr/bin/env node
// @ts-check
/**
 * check:white (v3) — pravilo „NEMA ČISTE BELE POVRŠINE NIGDE".
 *
 * Grep-uje IZVORNI kod (app/, components/) i BUILD izlaz (.next/static/css) za
 * neprovidnu belu POVRŠINU: `bg-white`, `bg-[#fff]`/`bg-[#ffffff]`/`bg-[white]`, i
 * CSS/inline `background(-color): #fff | #ffffff | white`. Pada (exit 1) ako nađe
 * ijednu.
 *
 * NAMERNO se NE prijavljuju (nisu površine ili nisu bele):
 *   · providni slojevi `bg-white/NN`, `white/NN`, `rgba(255,255,255,α)`, `#ffffffAA`
 *     (Studio media wells i sl. — brief ih izuzima);
 *   · SVG boja poteza `fill="#ffffff"` / `stroke="#ffffff"` (zastavice u language-toggle);
 *   · `text-white` / `border-white` (nisu pozadine);
 *   · `#fffdf8` i drugi 6-cifreni heks koji samo POČINJE sa `fff` (papir nije bela).
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components"];
const SOURCE_EXT = new Set([".tsx", ".ts", ".css"]);
// Next 16 (Turbopack) emituje kompajlirani CSS u `.next/static/chunks/*.css`.
const BUILD_CSS_DIR = join(".next", "static");

/** Neprovidna bela u klasi pozadine: `bg-white` (ne `bg-white/…`) ili `bg-[#fff|#ffffff|white]`.
   `\\` u lookahead-u: u kompajliranom CSS-u je `.bg-white\/NN` (escape-ovana kosa crta) —
   providni Studio slojevi koje brief IZUZIMA; bez toga bi lažno pali na build izlazu. */
const WHITE_CLASS =
  /\bbg-white(?![\w/\\-])|\bbg-\[(?:#fff(?![0-9a-fA-F])|#ffffff|white)\]/i;
/** Neprovidna bela u CSS/inline pozadini: `background(-color): #fff|#ffffff|white` bez alfe. */
const WHITE_BG =
  /background(?:-?color)?\s*:\s*["']?(?:#fff(?![0-9a-fA-F])|#ffffff(?![0-9a-fA-F])|white)\b/i;

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".git")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.has(extname(name))) out.push(full);
  }
}

/** @param {string} file @returns {{file:string,line:number,text:string}[]} */
function scan(file) {
  const hits = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((text, i) => {
    if (WHITE_CLASS.test(text) || WHITE_BG.test(text)) {
      hits.push({ file: relative(ROOT, file), line: i + 1, text: text.trim().slice(0, 160) });
    }
  });
  return hits;
}

const sourceFiles = [];
for (const dir of SOURCE_DIRS) {
  const abs = join(ROOT, dir);
  if (existsSync(abs)) walk(abs, sourceFiles);
}

const buildFiles = [];
const buildAbs = join(ROOT, BUILD_CSS_DIR);
if (existsSync(buildAbs)) {
  /** @param {string} dir */
  const walkCss = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walkCss(full);
      else if (name.endsWith(".css")) buildFiles.push(full);
    }
  };
  walkCss(buildAbs);
}

const allHits = [...sourceFiles, ...buildFiles].flatMap(scan);

if (allHits.length > 0) {
  console.error(`check:white — nađena bela površina (${allHits.length}):\n`);
  for (const h of allHits) console.error(`  ${h.file}:${h.line}  ${h.text}`);
  console.error(`\nZameni je površinom iz sistema (bg-surface-a/-b) ili tokenom.`);
  process.exit(1);
}

const buildNote = buildFiles.length > 0 ? `, ${buildFiles.length} build css` : " (build izlaz nije nađen — pokreni posle `next build`)";
console.log(`check:white — čisto. Skenirano ${sourceFiles.length} izvornih fajlova${buildNote}.`);
