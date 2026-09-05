/**
 * Seed pocetnog sadrzaja (smerovi + kursevi) u Convex.
 *
 * Idempotentno je (patch postojecih po slug-u), pa se moze pokrenuti vise puta.
 * Podaci su `convex/seedData.ts` - isti izvor koji koristi i `seed:seedInitialContent`
 * mutacija, pa je --dry-run sazetak uvek tacan.
 *
 * Ova skripta NE koristi Stripe. Projekat planira domaci paywall; cene se ne
 * citaju, ne validiraju i ne prosledjuju (`videoAudioStripePriceId` /
 * `vibeCodingStripePriceId` ostaju `undefined`).
 *
 * Koriscenje:
 *   npm run convex:seed                      # dev (cita .env.local), upisuje sadrzaj + Studio katalog
 *   npm run convex:seed -- --dry-run         # samo prikaze plan, nista ne upisuje
 *   npm run convex:seed -- --prod            # prod: prikaze plan (dry-run) i STANE
 *   npm run convex:seed -- --prod --yes      # prod: stvarno upisuje seed:seedInitialContent
 *   npm run convex:seed -- --prod --url https://<deployment>.convex.cloud --yes
 *
 * U --prod rezimu NEXT_PUBLIC_CONVEX_URL je podrazumevano prod deployment, a
 * WEBHOOK_SYNC_SECRET se cita sa prod Convex env-a (`convex env get ... --prod`).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { courseSeeds, trackSeeds } from "../convex/seedData.ts";

// Podrazumevani prod deployment (vidi README: `CONVEX_DEPLOYMENT=prod:quick-yak-270`).
// Nadjacaj sa `--url` ako treba drugi.
const PROD_CONVEX_URL = "https://quick-yak-270.eu-west-1.convex.cloud";

function parseArgs(argv) {
  const flags = { prod: false, dryRun: false, yes: false, url: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--prod") flags.prod = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--yes") flags.yes = true;
    else if (arg === "--url") {
      flags.url = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Nepoznat argument: ${arg}`);
    }
  }
  return flags;
}

function loadEnvFile(fileName) {
  const envPath = resolve(process.cwd(), fileName);
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ??= value;
  }
}

// Cita prod WEBHOOK_SYNC_SECRET preko lokalnog convex CLI. NODE_OPTIONS zbog
// masinskog TLS baga (vidi docs/STUDIO-PUBLIC-REPORT.md), `trim()` jer CLI vraca
// vrednost sa prelomom reda a `requireSyncSecret` poredi znak po znak.
function readProdSyncSecret() {
  const convexBin = resolve(process.cwd(), "node_modules/convex/bin/main.js");
  const result = spawnSync(
    process.execPath,
    [convexBin, "env", "get", "WEBHOOK_SYNC_SECRET", "--prod"],
    { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--no-use-system-ca" } },
  );
  if (result.status !== 0) {
    throw new Error(
      `Neuspelo citanje WEBHOOK_SYNC_SECRET sa prod-a (convex env get --prod).\n${result.stderr ?? ""}`,
    );
  }
  return (result.stdout ?? "").trim();
}

function printPlan(deploymentLabel, convexUrl) {
  console.log(`Seed plan (${deploymentLabel}): ${convexUrl}`);
  console.log(`  Smerovi: ${trackSeeds.length}`);
  console.log(`  Kursevi: ${courseSeeds.length}`);
  for (const course of courseSeeds) {
    const moduleCount = course.modules.length;
    const lessonCount = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
    const partCount = course.modules.reduce(
      (sum, module) => sum + module.lessons.reduce((inner, lesson) => inner + (lesson.parts?.length ?? 0), 0),
      0,
    );
    console.log(
      `    - ${course.slug} [${course.status}]: moduli ${moduleCount}, lekcije ${lessonCount}, delovi ${partCount}`,
    );
  }
}

const flags = parseArgs(process.argv.slice(2));
loadEnvFile(".env.local");

const deploymentLabel = flags.prod ? "PROD" : "dev";
const convexUrl = flags.prod
  ? (flags.url ?? PROD_CONVEX_URL).trim()
  : (flags.url ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "").trim();

if (!convexUrl) {
  throw new Error("Nedostaje NEXT_PUBLIC_CONVEX_URL (dev). Pokreni `npx convex dev` ili prosledi --url.");
}

printPlan(deploymentLabel, convexUrl);

if (flags.dryRun) {
  console.log("\n--dry-run: nista nije upisano.");
  process.exit(0);
}

if (flags.prod && !flags.yes) {
  console.log("\nProd rezim bez --yes: prikazan je samo plan. Dodaj --yes da stvarno upises.");
  process.exit(0);
}

const syncSecret = flags.prod
  ? readProdSyncSecret()
  : (process.env.WEBHOOK_SYNC_SECRET ?? "").trim();

if (!syncSecret) {
  throw new Error(
    flags.prod
      ? "Prazan WEBHOOK_SYNC_SECRET sa prod-a."
      : "Nedostaje WEBHOOK_SYNC_SECRET u .env.local i Convex env.",
  );
}

const client = new ConvexHttpClient(convexUrl);
const seedInitialContent = makeFunctionReference("seed:seedInitialContent");

// Bez Stripe argumenata - projekat ne koristi Stripe (opciona polja ostaju undefined).
const result = await client.mutation(seedInitialContent, { syncSecret });

if (flags.prod) {
  console.log(JSON.stringify(result, null, 2));
} else {
  // Dev: uz sadrzaj se seed-uje i Studio katalog (`models`) - zaseban, idempotentan
  // upis. Na prod-u ga NE diramo odavde; za to postoji `scripts/seed-studio-models.mjs`.
  const seedStudioModels = makeFunctionReference("studioModels:seedStudioModels");
  const studioModels = await client.mutation(seedStudioModels, { syncSecret });
  console.log(JSON.stringify({ ...result, studioModels }, null, 2));
}
