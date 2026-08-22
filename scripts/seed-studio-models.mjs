/**
 * Seed SAMO Studio kataloga (`models`), bez `seed:seedInitialContent`.
 *
 * `scripts/seed-convex.mjs` radi oba, i to je u redu za dev - ali na PRODUKCIJI
 * `seedInitialContent` prepisuje kurseve, staze i lekcije seed-podacima preko
 * onoga sto je zivo. Katalog modela je zasebna tabela i zaseban, idempotentan
 * upis, pa ide zasebno.
 *
 * Koriscenje (dev, cita `.env.local`):
 *   node scripts/seed-studio-models.mjs
 *
 * Produkcija - nadjacaj dve promenljive:
 *   NEXT_PUBLIC_CONVEX_URL="https://<prod>.convex.cloud" \
 *   WEBHOOK_SYNC_SECRET="$(npx convex env get WEBHOOK_SYNC_SECRET --prod)" \
 *   node scripts/seed-studio-models.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

function loadEnvFile(fileName) {
  const envPath = resolve(process.cwd(), fileName);
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    process.env[trimmed.slice(0, i).trim()] ??= trimmed.slice(i + 1).trim();
  }
}

loadEnvFile(".env.local");

// `trim()` je namerno: `npx convex env get` vraca vrednost sa prelomom reda, a
// `requireSyncSecret` poredi znak po znak - jedan `\n` je "Forbidden".
const convexUrl = (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").trim();
const syncSecret = (process.env.WEBHOOK_SYNC_SECRET ?? "").trim();

if (!convexUrl) throw new Error("Nedostaje NEXT_PUBLIC_CONVEX_URL.");
if (!syncSecret) throw new Error("Nedostaje WEBHOOK_SYNC_SECRET.");

console.log(`Deployment: ${convexUrl}`);
console.log(`Tajna: ${syncSecret.length} znakova (pocinje na "${syncSecret.slice(0, 3)}...")`);

const client = new ConvexHttpClient(convexUrl);
try {
  const result = await client.mutation(
    makeFunctionReference("studioModels:seedStudioModels"),
    { syncSecret },
  );
  console.log("Katalog upisan:", JSON.stringify(result));
} catch (error) {
  const message = String(error?.message ?? error);
  console.error("\nSeed nije prosao:", message);
  if (/Server Error/i.test(message)) {
    console.error(
      "\nProdukcija sakriva tekst greske. Najcesci uzrok je da se WEBHOOK_SYNC_SECRET\n" +
        "ne poklapa sa onim koji je postavljen na tom deployment-u. Proveri sa:\n" +
        "  npx convex env list --prod\n" +
        "Tacan tekst greske vidis u logovima:\n" +
        "  npx convex logs --prod",
    );
  }
  process.exitCode = 1;
}
