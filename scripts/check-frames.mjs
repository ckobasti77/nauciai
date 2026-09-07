#!/usr/bin/env node
/**
 * Duple okvire (N12).
 *
 * Pravilo iz AGENTS.md: pun `border-2 border-ink` nosi samo NAJSPOLJASNJI element
 * grupe. Unutar takvog elementa deca se odvajaju POZADINOM ili tankom linijom
 * `--line`, nikad novim `border-2 border-ink`. Slika dobija tacno jedan okvir - na
 * omotacu, ne i na sebi.
 *
 * Nosioci stila su izuzeti jer im okvir NIJE ukras nego afordansa:
 *   - dugmad i sve sto je oblika dugmeta (`rounded-full` pilule, cipovi, bedzevi),
 *   - polja za unos (input/select/textarea) i njihove klase,
 *   - lebdeci slojevi (absolute/fixed/sticky): dropdown, popover, modal, dock -
 *     oni su vizuelno svoj najspoljasnji element, ne dete panela ispod.
 *
 * Pokretanje: npm run check:frames
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Opseg gejta = povrsine koje je N12 procesljao. Ostatak stabla (dashboard, chat,
 * krediti, laboratorija kursa) ima isti dug i migrira se kad se ta strana dira -
 * gejt se sirі dodavanjem putanje ovde, ne novim pravilom.
 */
const ROOTS = [
  "app/[locale]/(marketing)/community",
  "app/[locale]/app/community",
  "app/[locale]/app/admin",
  "app/[locale]/app/members",
  "components/app/community-v2",
  "components/app/community-comments.tsx",
  "components/app/community-thread-detail.tsx",
  "components/app/community-thread-moderation.tsx",
  "components/app/public-community-comments.tsx",
  "components/app/member-profile.tsx",
  "components/app/classroom-hub.tsx",
  "components/app/course-catalog-card.tsx",
  "components/app/admin-content-manager.tsx",
  "components/app/admin-inline-actions.tsx",
  "components/app/studio-admin-page.tsx",
  "components/app/studio-media-grid.tsx",
  "components/app/studio-media-tile.tsx",
  "components/app/studio-media-detail.tsx",
  "components/app/studio-moderation-grid.tsx",
];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);
const VOID_TAGS = new Set(["img", "br", "hr", "input", "source", "meta", "link", "path", "rect", "circle", "line", "polygon", "use", "stop", "area", "col", "embed", "track", "wbr"]);
/** Komponente iz `components/ui/primitives.tsx` koje same crtaju pun okvir. */
const FRAMED_COMPONENTS = new Set(["Panel", "Card"]);
/** Komponente koje su po definiciji nosioci stila (dugme, polje, modal). */
const CARRIER_COMPONENTS = new Set(["Button", "LinkButton", "Dialog", "ConfirmDialog", "Field", "Input", "Textarea", "Select"]);

function walk(target, out = []) {
  if (!statSync(target).isDirectory()) {
    if (target.endsWith(".tsx")) out.push(target);
    return out;
  }
  for (const entry of readdirSync(target)) {
    if (SKIP_DIRS.has(entry)) continue;
    walk(join(target, entry), out);
  }
  return out;
}

/**
 * Komentari se brisu PRE citanja tagova. Citac je svestan navodnika, pa jedan
 * apostrof ili navodnik u proznom komentaru („…od stola".) otvara nisku koja se
 * nikad ne zatvori i ostatak fajla postane nevidljiv. Brisu se samo blok komentari
 * i linijski komentari koji POCINJU red - da `https://` u niski ostane netaknut.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Isti citac tagova kao `check-corners.mjs`: svestan zagrada i navodnika. */
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

/**
 * `attrs` je isecak IZMEDJU imena taga i `>`, pa zavrsni `>` nije u njemu - granica
 * dinamickog `className={...}` je zato sledeci atribut ili KRAJ niske, ne `>`.
 */
function classesOf(attrs) {
  const match = /className=(?:"([^"]*)"|\{([\s\S]*?)\}(?=\s+[\w-]+=|\s*\/?$))/.exec(attrs);
  if (!match) return "";
  if (match[1] !== undefined) return match[1];
  return [...match[2].matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]).join(" ");
}

const tokens = (cls) => cls.split(/\s+/).filter(Boolean).map((t) => t.replace(/^!/, "").split(":").pop());
const hasToken = (cls, ...names) => tokens(cls).some((t) => names.includes(t));
/**
 * Bez varijanti: `xl:sticky` je sticky SAMO na xl, pa element nije lebdeci sloj u
 * svakom prelomu. Nosioca stila zato prepoznajemo iskljucivo po golom tokenu.
 */
const bareTokens = (cls) => cls.split(/\s+/).filter(Boolean).map((t) => t.replace(/^!/, ""));
const hasBareToken = (cls, ...names) => bareTokens(cls).some((t) => names.includes(t));
const hasBarePrefix = (cls, ...prefixes) => bareTokens(cls).some((t) => prefixes.some((p) => t.startsWith(p)));

/**
 * Pun okvir = debljina 2 na sve cetiri strane u boji iz palete (`--ink` ili `--line`).
 * Statusne boje (amber/red za upozorenje i gresku) nose znacenje, ne oblik, pa ih
 * pravilo ne broji.
 */
function drawsFullFrame(node) {
  if (FRAMED_COMPONENTS.has(node.name)) return true;
  const cls = node.cls;
  return hasToken(cls, "border-2") && hasToken(cls, "border-ink", "border-line");
}

/**
 * Lebdeci sloj (dropdown, popover, dock) PREKIDA lanac: ne lezi u panelu ispod
 * nego iznad njega, pa je i on i sve u njemu svoja grupa sa svojim najspoljasnjim
 * okvirom.
 */
function isFloatingLayer(node) {
  return hasBareToken(node.cls, "absolute", "fixed");
}

/** Nosilac stila: okvir mu je afordansa, ne ukras - pravilo ga ne dira. */
function isStyleCarrier(node) {
  if (CARRIER_COMPONENTS.has(node.name)) return true;
  const tag = node.name.toLowerCase();
  if (["button", "input", "select", "textarea", "label", "summary", "dialog"].includes(tag)) return true;
  const cls = node.cls;
  // Oblik dugmeta/pilule/cipa, ma na kom tagu stajao.
  if (hasBareToken(cls, "rounded-full")) return true;
  // Lebdeci sloj je vizuelno svoj najspoljasnji element.
  if (hasBareToken(cls, "absolute", "fixed")) return true;
  // Medaljon ikonice: kvadrat fiksne velicine sa ikonicom u sredini je ornament,
  // ne ugnjezdena kartica - istog je reda kao pilula.
  if (hasBarePrefix(cls, "size-") && hasBareToken(cls, "inline-flex", "grid", "flex")) return true;
  return false;
}

const findings = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = stripComments(readFileSync(file, "utf8"));
    const stack = [];
    for (const tag of parseTags(src)) {
      if (tag.kind === "close") {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          if (stack[i].name === tag.name) { stack.length = i; break; }
        }
        continue;
      }
      const line = src.slice(0, tag.pos).split("\n").length;
      const node = { name: tag.name, cls: tag.attrs ? classesOf(tag.attrs) : "", line, frame: null };
      const parent = stack[stack.length - 1] ?? null;
      const floating = isFloatingLayer(node);
      const inherited = floating ? null : parent ? parent.frame : null;
      const carrier = isStyleCarrier(node);
      const own = drawsFullFrame(node);

      if (own && !carrier && inherited) {
        findings.push({ file, line, outer: inherited, child: node });
      }
      // Nosilac ne prenosi svoj okvir naniže (dugme u panelu ne pravi treći nivo).
      node.frame = own && !carrier ? node : inherited;
      if (tag.kind === "open") stack.push(node);
    }
  }
}

if (findings.length === 0) {
  console.log("check:frames — nema duplih punih okvira.");
  process.exit(0);
}

console.error(`check:frames — ${findings.length} dupli okvir(a):\n`);
for (const f of findings) {
  console.error(`${f.file}:${f.line}  <${f.child.name}> unutar <${f.outer.name}> (linija ${f.outer.line})`);
  console.error(`   spoljni: ${f.outer.cls.slice(0, 110)}`);
  console.error(`   dete   : ${f.child.cls.slice(0, 110)}\n`);
}
console.error("Popravka: dete se odvaja pozadinom ili `border border-line`; pun `border-2 border-ink` ostaje samo spolja.");
process.exit(1);
