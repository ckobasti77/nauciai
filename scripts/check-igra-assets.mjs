#!/usr/bin/env node
/**
 * Slike IGRA-e (K02): da li svaki ID koji kod koristi postoji i da li je slika stigla.
 *
 * Izvor istine je `public/brand/igra/manifest.json` (ID → `src`, `ready`). Kod slike
 * traži ISKLJUČIVO kroz `<IgraArt id="…">`, pa je ID uvek literal (`"lik.robi.mase"`)
 * ili poziv porodice (`igraLikArt(…)`, `igraNivoArt(…)`, `igraBedzArt(…)`).
 *
 * Šta prijavljuje:
 *   - ID iz koda koji NIJE spreman (`ready: false`) ili je tek planiran
 *     (`IGRA_PLANNED_ART` u `lib/igra-art.ts`) - komponenta tu crta fallback;
 *   - NEPOZNAT ID: nema ga ni u manifestu ni među planiranima (greška u kucanju);
 *   - red manifesta sa `ready: true` čiji fajl ne postoji na disku;
 *   - spremne slike koje niko ne koristi (za K25);
 *   - fajl sa više od jednog `<IgraArt priority>` (samo LCP slika sme da ga nosi).
 *
 * Podrazumevano samo UPOZORAVA (izlaz 0): slike stižu tokom noći. Uz `--strict`
 * nepoznat ID i `ready: true` bez fajla obaraju proveru (izlaz 1).
 *
 * Pokretanje: npm run check:igra [-- --strict]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STRICT = process.argv.includes("--strict");
const MANIFEST_PATH = "public/brand/igra/manifest.json";
const REGISTRY_PATH = "lib/igra-art.ts";
const SOURCE_DIRS = ["app", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);
/**
 * Fajlovi koji ID-jeve DEFINIŠU ili mapiraju (registar, mapa fallback ikona): njihovi
 * ID-jevi se proveravaju da postoje, ali se ne broje kao upotreba slike.
 */
const DEFINITION_FILES = new Set([REGISTRY_PATH, "components/igra/igra-fallback-icons.ts"]);
const PREFIXES = ["lik", "nivo", "bedz", "rang", "scena", "baner", "prazno", "admin", "ikona"];
const ID_LITERAL = new RegExp(`["'\`]((?:${PREFIXES.join("|")})\\.[a-z0-9]+(?:[.-][a-z0-9]+)*)["'\`]`, "g");
/** Poziv koji bira sliku u vreme izvršavanja → cela porodica se računa kao korišćena. */
const FAMILY_CALLS = { igraLikArt: "lik.", igraNivoArt: "nivo.", igraBedzArt: "bedz." };

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path.replace(/\\/g, "/"));
  }
  return out;
}

/** ID u komentaru nije upotreba: blok komentari i `//` do kraja reda (ne i `https://`). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function plannedIds(src) {
  const start = src.indexOf("IGRA_PLANNED_ART = {");
  if (start < 0) return new Set();
  const end = src.indexOf("} as const", start);
  const block = src.slice(start, end < 0 ? undefined : end);
  return new Set([...block.matchAll(ID_LITERAL)].map((match) => match[1]));
}

function priorityCount(src) {
  let count = 0;
  for (const part of src.split("<IgraArt").slice(1)) {
    const end = part.search(/\/?>/);
    const attrs = end < 0 ? part : part.slice(0, end);
    if (/(^|\s)priority(?!\s*=\s*\{\s*false\s*\})(\s|=|$)/.test(attrs)) count += 1;
  }
  return count;
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(`check:igra — nema manifesta (${MANIFEST_PATH}).`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const assets = manifest.assets ?? {};
const manifestIds = Object.keys(assets);
const planned = existsSync(REGISTRY_PATH) ? plannedIds(readFileSync(REGISTRY_PATH, "utf8")) : new Set();

/** ID → fajlovi koji ga koriste. */
const usedBy = new Map();
/** Prefiks porodice → fajlovi koji je zovu. */
const familyBy = new Map();
/** ID iz definicionih fajlova koji ne postoji nigde. */
const unknownDefined = new Map();
const manyPriority = [];

for (const dir of SOURCE_DIRS) {
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const src = stripComments(readFileSync(file, "utf8"));
    const definition = DEFINITION_FILES.has(file);
    for (const match of src.matchAll(ID_LITERAL)) {
      const id = match[1];
      if (definition) {
        if (!assets[id] && !planned.has(id)) unknownDefined.set(id, [...(unknownDefined.get(id) ?? []), file]);
        continue;
      }
      if (!usedBy.has(id)) usedBy.set(id, new Set());
      usedBy.get(id).add(file);
    }
    if (definition) continue;
    for (const [call, prefix] of Object.entries(FAMILY_CALLS)) {
      if (!new RegExp(`\\b${call}\\(`).test(src)) continue;
      if (!familyBy.has(prefix)) familyBy.set(prefix, new Set());
      familyBy.get(prefix).add(file);
    }
    if (file.endsWith(".tsx")) {
      const count = priorityCount(src);
      if (count > 1) manyPriority.push({ file, count });
    }
  }
}

const filesOf = (id) => [...(usedBy.get(id) ?? [])].sort().join(", ");
const usedIds = [...usedBy.keys()].sort();
const unknown = usedIds.filter((id) => !assets[id] && !planned.has(id));
const plannedUsed = usedIds.filter((id) => !assets[id] && planned.has(id));
const notReady = usedIds.filter((id) => assets[id] && !assets[id].ready);
const readyUsed = usedIds.filter((id) => assets[id]?.ready);

const inUsedFamily = (id) => [...familyBy.keys()].some((prefix) => id.startsWith(prefix));
const readyNoFile = manifestIds.filter((id) => assets[id].ready && !existsSync(join("public", assets[id].src)));
const fileNotReady = manifestIds.filter((id) => !assets[id].ready && existsSync(join("public", assets[id].src)));
const unused = manifestIds.filter((id) => assets[id].ready && !usedBy.has(id) && !inUsedFamily(id));
const readyTotal = manifestIds.filter((id) => assets[id].ready).length;

const lines = [];
const section = (title, ids, describe = (id) => id) => {
  lines.push(`\n${title}: ${ids.length}`);
  for (const id of ids) lines.push(`  ${describe(id)}`);
};

lines.push(`check:igra — manifest ${readyTotal}/${manifestIds.length} spremno${manifest.updatedAt ? ` (ažuriran ${manifest.updatedAt})` : ""}.`);
lines.push(`U kodu: ${usedIds.length} ID-jeva, ${readyUsed.length} spremno.`);

for (const [prefix, files] of [...familyBy.entries()].sort()) {
  const members = manifestIds.filter((id) => id.startsWith(prefix));
  const missing = members.filter((id) => !assets[id].ready);
  lines.push(`Porodica ${prefix}* (${[...files].sort().join(", ")}): ${members.length - missing.length}/${members.length} spremno${missing.length ? ` — nisu: ${missing.join(", ")}` : ""}.`);
}

if (notReady.length) section("Nije spremna (crta se fallback)", notReady, (id) => `${id}  ←  ${filesOf(id)}`);
if (plannedUsed.length) section("Planirana (TRAŽENE SLIKE; crta se fallback)", plannedUsed, (id) => `${id}  ←  ${filesOf(id)}`);
if (unknown.length) section("NEPOZNAT ID (nema ga ni u manifestu ni među planiranima)", unknown, (id) => `${id}  ←  ${filesOf(id)}`);
if (unknownDefined.size) {
  section("NEPOZNAT ID u registru ili mapi ikona", [...unknownDefined.keys()].sort(), (id) => `${id}  ←  ${unknownDefined.get(id).join(", ")}`);
}
if (readyNoFile.length) section("`ready: true`, a fajla nema na disku", readyNoFile, (id) => `${id}  →  public${assets[id].src}`);
if (fileNotReady.length) section("Fajl je na disku, a manifest kaže `ready: false`", fileNotReady, (id) => `${id}  →  public${assets[id].src}`);
if (manyPriority.length) {
  lines.push(`\nViše od jednog <IgraArt priority> u fajlu (sme samo LCP slika): ${manyPriority.length}`);
  for (const item of manyPriority) lines.push(`  ${item.file} (${item.count})`);
}
if (unused.length) {
  lines.push(`\nSpremne slike koje kod još ne koristi: ${unused.length}`);
  lines.push(`  ${unused.join(", ")}`);
}

const errors = unknown.length + unknownDefined.size + readyNoFile.length;
const warnings = notReady.length + plannedUsed.length + manyPriority.length;
lines.push(
  errors || warnings
    ? `\ncheck:igra — za popravku: ${errors} · upozorenja: ${warnings}${STRICT ? " (--strict)" : ""}.`
    : "\ncheck:igra — sve slike koje kod koristi su na mestu.",
);

(errors || warnings ? console.warn : console.log)(lines.join("\n"));
process.exit(STRICT && errors > 0 ? 1 : 0);
