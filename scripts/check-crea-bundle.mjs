#!/usr/bin/env node
/**
 * Provera bundle-a za Creu (K04, plan K01 §9): teške biblioteke (lokalni AI,
 * kodeci, editori) smeju da žive SAMO u async chunk-ovima koji se učitavaju tek
 * kad korisnik otvori alat - nikad u početnim chunk-ovima bilo koje rute.
 *
 * Pokreće se POSLE `npm run build`:
 *   npm run check:bundle
 *
 * Kako radi:
 * 1. Za svaku rutu čita `.next/server/app/**\/page_client-reference-manifest.js`
 *    i skuplja početne chunk-ove: `entryJSFiles` (layout-i i strana) i chunk-ove
 *    klijentskih modula koje strana učitava odmah (`async: false`).
 * 2. U svakom početnom chunk-u traži markere biblioteka. Pogodak = greška.
 * 3. Kontrola markera: za svaku biblioteku iz `package.json` marker mora da se
 *    nađe u BAR jednom chunk-u build-a. Inače je marker zastareo i provera bi
 *    lažno prolazila - korak koji uvodi biblioteku dopisuje i marker ovde.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";

const ROOT = process.cwd();
const NEXT = join(ROOT, ".next");
const SERVER_APP = join(NEXT, "server", "app");

/** Biblioteka → tekst koji se pojavljuje SAMO u njenom kodu (ne u našem registru modela). */
const MARKERS = [
  { pkg: "@mediapipe/tasks-vision", marker: "graph_runner" },
  { pkg: "@jsquash/webp", marker: "webp_enc" },
  { pkg: "exifr", marker: "makerNote" },
  { pkg: "react-compare-slider", marker: "--rcs-current-position" },
  { pkg: "@huggingface/transformers", marker: "allowLocalModels" },
  { pkg: "onnxruntime-web", marker: "ort-wasm" },
  // tesseract.js vuče worker i jezgro sa CDN-a; u našem chunk-u ostaje adresa workera.
  { pkg: "tesseract.js", marker: "tesseract.js@v" },
  { pkg: "@jsquash/avif", marker: "avif_enc" },
  { pkg: "heic-to", marker: "libheif" },
  { pkg: "react-easy-crop", marker: "reactEasyCrop_Container" },
  { pkg: "pica", marker: "unsharp" },
  { pkg: "smartcrop", marker: "boostWeight" },
  { pkg: "colorthief", marker: "Video has no dimensions" },
  { pkg: "qr-code-styling", marker: "_roundSize" },
  { pkg: "gifenc", marker: "NETSCAPE2.0" },
  { pkg: "vectortracer", marker: "binaryimageconverter" },
  { pkg: "konva", marker: "Konva" },
  { pkg: "mediabunny", marker: "mediabunny" },
  { pkg: "wavesurfer.js", marker: "wavesurfer" },
  { pkg: "@xzdarcy/react-timeline-editor", marker: "timeline-editor" },
];

function fail(message) {
  console.error(`check:bundle - ${message}`);
  process.exit(1);
}

if (!existsSync(SERVER_APP)) fail("nema `.next/server/app` - prvo pokreni `npm run build`.");

function findManifests(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findManifests(path));
    else if (entry.name === "page_client-reference-manifest.js") found.push(path);
  }
  return found;
}

function readManifest(path) {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  runInNewContext(readFileSync(path, "utf8"), sandbox);
  const manifests = sandbox.__RSC_MANIFEST ?? {};
  return Object.entries(manifests);
}

function chunkPath(file) {
  const clean = file.replace(/^\/?_next\//, "");
  return join(NEXT, clean);
}

const chunkText = new Map();
function textOf(file) {
  const path = chunkPath(file);
  if (!chunkText.has(path)) chunkText.set(path, existsSync(path) ? readFileSync(path, "utf8") : "");
  return chunkText.get(path);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const installed = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
const active = MARKERS.filter((entry) => installed.has(entry.pkg));

const problems = [];
const manifests = findManifests(SERVER_APP);
let routes = 0;
const initialChunks = new Set();

for (const file of manifests) {
  for (const [route, manifest] of readManifest(file)) {
    routes += 1;
    const chunks = new Set(Object.values(manifest.entryJSFiles ?? {}).flat());
    for (const mod of Object.values(manifest.clientModules ?? {})) {
      if (!mod.async) for (const chunk of mod.chunks ?? []) chunks.add(chunk);
    }
    for (const chunk of chunks) {
      initialChunks.add(chunk);
      const text = textOf(chunk);
      for (const { pkg: name, marker } of active) {
        if (text.includes(marker)) problems.push(`${route}: početni chunk ${chunk} sadrži ${name} („${marker}")`);
      }
    }
  }
}

// Kontrola markera nad svim chunk-ovima build-a (početnim i async).
const staticChunks = join(NEXT, "static", "chunks");
const allChunks = readdirSync(staticChunks).filter((name) => name.endsWith(".js"));
for (const { pkg: name, marker } of active) {
  const where = allChunks.filter((chunk) => readFileSync(join(staticChunks, chunk), "utf8").includes(marker));
  if (where.length === 0) {
    problems.push(`marker „${marker}" za ${name} nije nađen ni u jednom chunk-u - proveri marker (ili se paket ne koristi)`);
  } else {
    console.log(`  ${name}: samo u async chunk-ovima (${where.map((chunk) => relative(NEXT, join(staticChunks, chunk))).join(", ")})`);
  }
}

if (problems.length > 0) {
  console.error("check:bundle - teške biblioteke van async chunk-ova:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `check:bundle - u redu: ${routes} ruta, ${initialChunks.size} početnih chunk-ova, nijedan ne sadrži ${active.map((entry) => entry.pkg).join(", ")}.`,
);
