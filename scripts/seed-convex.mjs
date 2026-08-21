import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

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

loadEnvFile(".env.local");

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const syncSecret = process.env.WEBHOOK_SYNC_SECRET;

if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL. Run `npx convex dev` first.");
}

if (!syncSecret) {
  throw new Error("Missing WEBHOOK_SYNC_SECRET in .env.local and Convex env.");
}

const client = new ConvexHttpClient(convexUrl);
const seedInitialContent = makeFunctionReference("seed:seedInitialContent");
const seedStudioModels = makeFunctionReference("studioModels:seedStudioModels");

const result = await client.mutation(seedInitialContent, {
  syncSecret,
  videoAudioStripePriceId: process.env.STRIPE_PRICE_VIDEO_AUDIO_AI || undefined,
  vibeCodingStripePriceId: process.env.STRIPE_PRICE_VIBE_CODING || undefined,
});

// Katalog v4 (`models`) je zaseban seed jer je zasebna tabela - stari
// `modelCatalog` živi još jedan ciklus (STUDIO-CATALOG-V4 1.1). Idempotentan je
// i ne pali modele koje je admin ugasio.
const studioModels = await client.mutation(seedStudioModels, { syncSecret });

console.log(JSON.stringify({ ...result, studioModels }, null, 2));
