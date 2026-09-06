// Proverava kako origin služi landing video fajlove. HEAD na svaki
// public/images/landing/*.webm i *.mp4 na zadatom origin-u (argument;
// podrazumevano https://nauciai.com) i ispiše tabelu content-type /
// content-encoding / status. Exit 1 ako je bilo koji video text/plain ili
// ima content-encoding (LiteSpeed regresija koja obara webm reprodukciju).
//
// Bez zavisnosti (čist Node fetch). Pokretanje: npm run check:media [origin]

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const origin = (process.argv[2] ?? "https://nauciai.com").replace(/\/$/, "");
const landingDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "images", "landing");

const files = readdirSync(landingDir)
  .filter((name) => name.endsWith(".webm") || name.endsWith(".mp4"))
  .sort();

const rows = [];
let bad = 0;

for (const name of files) {
  const url = `${origin}/images/landing/${name}`;
  let status = "ERR";
  let contentType = "";
  let contentEncoding = "";
  try {
    const res = await fetch(url, { method: "HEAD" });
    status = String(res.status);
    contentType = res.headers.get("content-type") ?? "";
    contentEncoding = res.headers.get("content-encoding") ?? "";
  } catch (error) {
    contentType = `fetch failed: ${error.message}`;
  }

  const expected = name.endsWith(".webm") ? "video/webm" : "video/mp4";
  const typeOk = contentType.split(";")[0].trim() === expected;
  const encodingOk = contentEncoding === "";
  const ok = status === "200" && typeOk && encodingOk;
  if (!ok) bad += 1;

  rows.push({ name, status, contentType, contentEncoding: contentEncoding || "—", ok });
}

const pad = (value, width) => String(value).padEnd(width);
const widths = {
  name: Math.max(4, ...rows.map((r) => r.name.length)),
  status: 6,
  type: Math.max(12, ...rows.map((r) => r.contentType.length)),
  enc: Math.max(8, ...rows.map((r) => r.contentEncoding.length)),
};

console.log(`Origin: ${origin}\n`);
console.log(
  `${pad("file", widths.name)}  ${pad("status", widths.status)}  ${pad("content-type", widths.type)}  ${pad("content-encoding", widths.enc)}  ok`,
);
for (const r of rows) {
  console.log(
    `${pad(r.name, widths.name)}  ${pad(r.status, widths.status)}  ${pad(r.contentType, widths.type)}  ${pad(r.contentEncoding, widths.enc)}  ${r.ok ? "✓" : "✗"}`,
  );
}

if (bad > 0) {
  console.error(`\n${bad} fajl(ova) pogrešno posluženo (text/plain ili content-encoding).`);
  process.exit(1);
}
console.log("\nSvi video fajlovi posluženi ispravno.");
