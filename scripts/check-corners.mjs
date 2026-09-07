#!/usr/bin/env node
/**
 * Ispadi na uglovima panela (N9).
 *
 * Dva pravila, oba geometrijska i oba se daju proveriti iz klasa:
 *   1. Dete koje NEŠTO CRTA (pozadina ili gornji/donji okvir) i naleže na ivicu
 *      zaobljenog roditelja mora da bude odsečeno — roditelj dobija `overflow-hidden`.
 *      Bez toga pravi ugao deteta prekrije zaobljeni ugao roditelja („rogalj").
 *   2. Radius deteta na zajedničkom uglu nikad ne sme biti veći od radiusa roditelja —
 *      inače zaobljeni ugao deteta viri izvan roditeljeve krive.
 *
 * „Naleže na ivicu" = roditelj ga ne drži podalje paddingom, ili ga dete negativnom
 * marginom vrati na ivicu. Padovan roditelj ne može da ima ispad, pa se preskače.
 *
 * Pokretanje: npm run check:corners
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["components", "app"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

const NAMED_RADIUS = {
  "rounded-none": 0, "rounded-sm": 2, rounded: 4, "rounded-md": 6, "rounded-lg": 8,
  "rounded-xl": 12, "rounded-2xl": 16, "rounded-3xl": 24, "rounded-full": 9999,
  "surface-card": 16, "surface-inset": 12, "surface-media": 8,
};
/** Komponente iz `components/ui/primitives.tsx` koje same crtaju zaobljen panel. */
const COMPONENT_RADIUS = { Panel: 16, Card: 16 };
const CORNERS = ["tl", "tr", "bl", "br"];
const SIDE_CORNERS = {
  t: ["tl", "tr"], b: ["bl", "br"], l: ["tl", "bl"], r: ["tr", "br"],
  tl: ["tl"], tr: ["tr"], bl: ["bl"], br: ["br"],
};
const VOID_TAGS = new Set(["img", "br", "hr", "input", "source", "meta", "link", "path", "rect", "circle", "line", "polygon", "use", "stop", "area", "col", "embed", "track", "wbr"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Tagovi se čitaju sa svešću o zagradama i navodnicima, da `() => x` u propu ne prekine tag. */
function parseTags(src) {
  const tags = [];
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] !== "<") continue;
    const close = /^\/\s*([A-Za-z][\w.-]*)\s*>/.exec(src.slice(i + 1));
    if (close) {
      tags.push({ kind: "close", name: close[1], attrs: "", pos: i });
      i += close[0].length;
      continue;
    }
    const open = /^([A-Za-z][\w.-]*)/.exec(src.slice(i + 1));
    if (!open) continue;
    let k = i + 1 + open[0].length;
    let depth = 0;
    let quote = null;
    for (; k < src.length; k += 1) {
      const ch = src[k];
      if (quote) {
        if (ch === quote) quote = null;
        else if (ch === "\\") k += 1;
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) break;
    }
    if (k >= src.length) break;
    const attrs = src.slice(i + 1 + open[0].length, k);
    const selfClosing = attrs.trimEnd().endsWith("/") || VOID_TAGS.has(open[1].toLowerCase());
    tags.push({ kind: selfClosing ? "selfclose" : "open", name: open[1], attrs, pos: i });
    i = k;
  }
  return tags;
}

function classesOf(attrs) {
  const match = /className=(?:"([^"]*)"|\{([\s\S]*?)\}(?=\s+[\w-]+=|\s*\/?>))/.exec(attrs);
  if (!match) return "";
  if (match[1] !== undefined) return match[1];
  // Iz dinamičkog izraza (`cn(...)`) uzmi sve doslovne niske — one nose klase.
  return [...match[2].matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]).join(" ");
}

const tokens = (cls) => cls.split(/\s+/).filter(Boolean).map((t) => t.replace(/^!/, "").split(":").pop());
const hasToken = (cls, ...names) => tokens(cls).some((t) => names.includes(t));
const hasPrefix = (cls, ...prefixes) => tokens(cls).some((t) => prefixes.some((p) => t.startsWith(p)));

function radiusOf(cls) {
  const corners = {};
  for (const token of tokens(cls)) {
    if (NAMED_RADIUS[token] !== undefined) {
      for (const c of CORNERS) corners[c] = NAMED_RADIUS[token];
      continue;
    }
    const arbitrary = /^rounded(?:-(t|b|l|r|tl|tr|bl|br))?-\[(\d+)px\]$/.exec(token);
    if (arbitrary) {
      for (const c of arbitrary[1] ? SIDE_CORNERS[arbitrary[1]] : CORNERS) corners[c] = Number(arbitrary[2]);
      continue;
    }
    const named = /^rounded-(t|b|l|r|tl|tr|bl|br)-(none|sm|md|lg|xl|2xl|3xl|full)$/.exec(token);
    if (named) {
      for (const c of SIDE_CORNERS[named[1]]) corners[c] = NAMED_RADIUS[`rounded-${named[2]}`];
    }
  }
  return corners;
}

/** Roditelj sa paddingom po obe ose drži decu dalje od uglova. */
function padsBothAxes(cls) {
  let x = false;
  let y = false;
  for (const token of tokens(cls)) {
    const m = /^(p|px|py|pt|pb|ps|pe)-(.+)$/.exec(token);
    if (!m || m[2] === "0" || m[2] === "[0px]") continue;
    if (m[1] === "p") { x = true; y = true; }
    else if (m[1] === "px" || m[1] === "ps" || m[1] === "pe") x = true;
    else y = true;
  }
  return x && y;
}

function panelRadius(node) {
  const own = radiusOf(node.cls);
  if (Object.keys(own).length) return own;
  const fromComponent = COMPONENT_RADIUS[node.name];
  return fromComponent ? Object.fromEntries(CORNERS.map((c) => [c, fromComponent])) : {};
}

const findings = [];

function inspect(parent, child, file) {
  const parentRadius = panelRadius(parent);
  const radii = Object.values(parentRadius);
  if (!radii.length || Math.max(...radii) === 0) return;
  if (hasPrefix(child.cls, "rounded-[inherit]", "rounded-t-[inherit]", "rounded-b-[inherit]")) {
    findings.push({ file, line: child.line, rule: "radius-inherit",
      detail: "`rounded-*-[inherit]` uzima SPOLJNI radius roditelja, pa ugao viri preko okvira" ,
      parent: parent.cls, child: child.cls });
    return;
  }
  const flush = !padsBothAxes(parent.cls) || hasPrefix(child.cls, "-m");
  if (!flush) return;
  const clips = hasPrefix(parent.cls, "overflow-hidden", "overflow-clip");
  const childRadius = radiusOf(child.cls);

  // Za preklop uglova dete mora da dodiruje DVE ivice roditelja; usko dete koje se
  // samo poravnava u redu (pilula, bedž) nikad ne stigne do ugla.
  const spansParent = hasToken(child.cls, "w-full", "flex-1", "block") || hasPrefix(child.cls, "inset-", "w-full");
  if (!clips && spansParent) {
    for (const [corner, px] of Object.entries(childRadius)) {
      const parentPx = parentRadius[corner];
      if (parentPx !== undefined && parentPx < 9999 && px > parentPx) {
        findings.push({ file, line: child.line, rule: "child-radius-gt-parent",
          detail: `${corner}: dete ${px}px > roditelj ${parentPx}px`, parent: parent.cls, child: child.cls });
        break;
      }
    }
  }

  const paintsBackground = tokens(child.cls).some((t) => t.startsWith("bg-") && t !== "bg-transparent");
  const paints = paintsBackground || hasPrefix(child.cls, "border-b-2", "border-t-2");
  const floats = hasToken(child.cls, "absolute", "fixed", "sticky");
  if (!paints || clips || floats) return;
  const uncovered = CORNERS.filter((c) => (parentRadius[c] ?? 0) > 0 && (childRadius[c] ?? 0) < parentRadius[c]);
  if (uncovered.length) {
    findings.push({ file, line: child.line, rule: "square-child-in-rounded-parent",
      detail: `uglovi ${uncovered.join(",")} — roditelju nedostaje overflow-hidden`,
      parent: parent.cls, child: child.cls });
  }
}

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    const stack = [];
    for (const tag of parseTags(src)) {
      const line = src.slice(0, tag.pos).split("\n").length;
      const node = { name: tag.name, cls: tag.attrs ? classesOf(tag.attrs) : "", line, carrier: null };
      if (tag.kind === "close") {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          if (stack[i].name === tag.name) { stack.length = i; break; }
        }
        continue;
      }
      const parent = stack[stack.length - 1] ?? null;
      if (parent) {
        inspect(parent, node, file);
        const parentRadius = panelRadius(parent);
        const clips = hasPrefix(parent.cls, "overflow-hidden", "overflow-clip");
        const values = Object.values(parentRadius);
        if (values.length && Math.max(...values) > 0 && !clips) node.carrier = parent;
        else if (!values.length && !clips && !padsBothAxes(parent.cls)) node.carrier = parent.carrier;
        // Providan omotač (bez radiusa, bez paddinga) prenosi ugao dalje na svoju decu.
        if (node.carrier && node.carrier !== parent) inspect(node.carrier, node, file);
      }
      if (tag.kind === "open") stack.push(node);
    }
  }
}

if (findings.length === 0) {
  console.log("check:corners — nema ispada na uglovima panela.");
  process.exit(0);
}

console.error(`check:corners — ${findings.length} ispad(a):\n`);
for (const f of findings) {
  console.error(`${f.file}:${f.line}  [${f.rule}] ${f.detail}`);
  console.error(`   roditelj: ${f.parent.slice(0, 100)}`);
  console.error(`   dete    : ${f.child.slice(0, 100)}\n`);
}
console.error("Popravka: roditelj koji secka decu dobija `overflow-hidden`; radius deteta nikad veci od roditeljevog.");
process.exit(1);
