/// <reference types="vite/client" />

/**
 * Recepti (S37, K15) - prihvatanje: SVAKI recept radi od kartice do rezultata
 * bez ključa provajdera (plaćeni DEMO, O3). Polja se popune primerom, fotke se
 * okače istim putem kao iz alata, Lik i logo brend kita su pinovani uploadi,
 * a posao ide kroz POSTOJEĆI `studio.createJob` → `submitJob` (mock) →
 * `completeMockJob`. Naplaćeno je tačno onoliko koliko piše na dugmetu, i to je
 * ista cena kao za bilo koji drugi izbor u receptu (fiksna cena).
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brandPromptLine } from "../lib/crea-brand-kit";
import {
  CREA_RECIPES,
  recipeDefaults,
  recipeExampleValues,
  recipeRequest,
  type CreaRecipe,
  type CreaRecipeModel,
} from "../lib/crea-recipes";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";
import { mockJobSucceeds } from "./studioCore";
import { sanitizeSpecParams } from "./studioParamSpec";
import { computeCredits } from "./studioPricing";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type TestUser = ReturnType<TestConvex["withIdentity"]>;

const KEYS = ["FAL_KEY", "GOOGLE_AI_API_KEY", "BYTEPLUS_API_KEY", "STUDIO_MOCK", "CONVEX_SITE_URL"] as const;
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  // Zakazane funkcije (predaja posla, mock odgovor) puštamo ručno, do kraja.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const key of KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

function seedOf(slug: string) {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(`Nema modela ${slug}`);
  return seed;
}

async function seedCatalog(t: TestConvex, slugs: readonly string[]) {
  for (const slug of slugs) {
    const seed = seedOf(slug);
    await t.run((ctx) =>
      ctx.db.insert("models", {
        slug: seed.slug,
        provider: seed.provider,
        kind: seed.kind,
        family: seed.family,
        labelSr: seed.labelSr,
        labelEn: seed.labelEn,
        taglineSr: seed.taglineSr,
        taglineEn: seed.taglineEn,
        descriptionSr: seed.descriptionSr,
        descriptionEn: seed.descriptionEn,
        endpoints: JSON.stringify(seed.endpoints),
        inputModes: JSON.stringify(seed.inputModes),
        inputSpec: JSON.stringify(seed.inputSpec),
        paramSpec: JSON.stringify(seed.paramSpec),
        priceRule: JSON.stringify(seed.priceRule),
        capabilities: JSON.stringify(seed.capabilities),
        isEnabled: true,
        sortOrder: seed.sortOrder,
        updatedAt: 1,
      }),
    );
  }
}

async function seedUser(t: TestConvex) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "recept@example.com",
      name: "Recept",
      username: "recept",
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const courseId = await ctx.db.insert("courses", {
      slug: "recept-kurs",
      titleSr: "Kurs",
      titleEn: "Course",
      subtitleSr: "P",
      subtitleEn: "S",
      descriptionSr: "O",
      descriptionEn: "D",
      status: "published" as const,
      sortOrder: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("enrollments", { userId, courseId, status: "active" as const, startedAt: 1, updatedAt: 1 });
    return userId;
  });
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 1000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });
  return { userId, as: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

/** Fotka okačena kao iz alata (dozvola → upload → prijava). */
async function uploadImage(as: TestUser) {
  const storageId = await as.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["slika"]));
    await ctx.db.patch(id as unknown as Id<"studioUploads">, { contentType: "image/jpeg" } as never);
    return id;
  });
  const { grantId } = await as.mutation(api.studio.createInputUploadUrl, { slot: "image" });
  await as.mutation(api.studio.registerInputUpload, { storageId, grantId });
  return storageId;
}

/** Lik sa tri pinovane slike (kao posle čuvanja u „Likovima", K14). */
async function seedCharacter(t: TestConvex, as: TestUser, userId: Id<"users">) {
  const images = [await uploadImage(as), await uploadImage(as), await uploadImage(as)];
  await t.run(async (ctx) => {
    for (const storageId of images) {
      const row = await ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .first();
      await ctx.db.patch("studioUploads", row!._id, { pinnedAt: 1, expiresAt: undefined });
    }
    await ctx.db.insert("creaElements", {
      userId,
      kind: "lik",
      name: "Maja",
      handle: "maja",
      imageStorageIds: images,
      coverStorageId: images[0],
      origin: "foto",
      consentAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  return images;
}

/**
 * Pušta zakazane funkcije korak po korak: predaja, pa mock odgovor posle 3 s.
 * Čuvanje izlaza test zove direktno - `convex-test` ne ume upis u storage iz
 * ZAKAZANE akcije („Write outside of transaction"), a direktan poziv ume (kao u
 * `studioActions.test.ts`).
 */
async function drainScheduled(t: TestConvex) {
  for (let round = 0; round < 2; round += 1) {
    vi.advanceTimersByTime(3_000);
    await t.finishInProgressScheduledFunctions();
  }
}

async function balanceOf(t: TestConvex, userId: Id<"users">) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );
  return row?.balance ?? 0;
}

/** Cena na dugmetu: ista formula kao server, nad parametrima koje recept gradi. */
function shownPrice(model: CreaRecipeModel, params: Record<string, unknown>, inputMode: string) {
  const seed = seedOf(model);
  const sanitized = sanitizeSpecParams(seed.paramSpec, seed.priceRule, params, inputMode);
  if (!sanitized.ok) throw new Error(sanitized.reason);
  return computeCredits(seed.priceRule, sanitized.params, inputMode);
}

async function runRecipe(recipe: CreaRecipe) {
  const t = makeT();
  const { userId, as } = await seedUser(t);
  await seedCatalog(t, ["nano-banana-2", "nano-banana-pro", "recraft-41"]);
  const model = recipe.models[0]!;

  // Brend kit sa logom (pinovan upload) - recepti za firmu ga sami koriste.
  const logo = await uploadImage(as);
  await as.mutation(api.creaBrandKit.saveMine, {
    name: "Pekara Klas",
    colors: ["#c8402f", "#f4be30"],
    fonts: { heading: "lora", body: "nunito" },
    tone: "topao",
    logoStorageId: logo,
  });
  const kit = (await as.query(api.creaBrandKit.getMine, {}))!;

  // Polja: primer u tekst, fotka u svako polje za sliku, Lik u polje za lik.
  const files: Record<string, Id<"_storage">[]> = {};
  for (const field of recipe.fields) {
    if (field.kind === "image") files[field.key] = [await uploadImage(as)];
    if (field.kind === "element") files[field.key] = await seedCharacter(t, as, userId);
  }
  const attached = Object.fromEntries(Object.entries(files).map(([key, ids]) => [key, ids.length]));
  const values = recipeExampleValues(recipe, "sr", recipeDefaults(recipe));
  const request = recipeRequest(recipe, model, { values, attached, brand: kit, brandLogo: true, imageSize: { width: 1200, height: 900 } });
  const used = new Map<string, number>();
  const image = request.imageOrder.map((key) => {
    if (key === "brand-logo") return logo;
    const index = used.get(key) ?? 0;
    used.set(key, index + 1);
    return files[key]![index]!;
  });

  const price = shownPrice(model, request.params, request.inputMode);
  // Fiksna cena: i bez brenda, bez priloga koji nisu obavezni i sa podrazumevanim izborima - isto.
  const bare = recipeRequest(recipe, model, { values: recipeDefaults(recipe), attached: {}, brand: null, brandLogo: false });
  expect(shownPrice(model, bare.params, bare.inputMode), recipe.id).toBe(price);

  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  const before = await balanceOf(t, userId);
  const jobId = (await as.mutation(api.studio.createJob, {
    modelSlug: request.modelSlug,
    params: JSON.stringify(request.params),
    inputMode: request.inputMode,
    ...(image.length > 0 ? { inputs: JSON.stringify({ image }) } : {}),
  })) as Id<"generationJobs">;
  expect(typeof jobId, recipe.id).toBe("string");

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job, recipe.id).toMatchObject({ status: "reserved", modelSlug: model, inputMode: request.inputMode, creditCost: price });
  expect(await balanceOf(t, userId), recipe.id).toBe(before - price);
  if (image.length > 0) expect(JSON.parse(job!.inputs ?? "{}"), recipe.id).toEqual({ image });
  const stored = JSON.parse(job!.params) as { prompt: string };
  if (recipe.brand !== "none") expect(stored.prompt, recipe.id).toContain(brandPromptLine(kit, recipe.brand === "full" && model !== "recraft-41" ? { logoImage: image.length } : {}));

  // DEMO bez ključa: isti tok kao sa provajderom (createJob zakazuje predaju), samo simuliran.
  await drainScheduled(t);
  await t.action(internal.studioActions.persistOutput, { jobId });
  const finished = await t.run((ctx) => ctx.db.get(jobId));
  if (mockJobSucceeds(jobId)) {
    expect(finished, recipe.id).toMatchObject({ status: "done" });
    expect(finished?.outputStorageId, recipe.id).toBeDefined();
  } else {
    // Mock ume da „padne" (kao pravi provajder) - krediti se tada vraćaju.
    expect(finished?.status, recipe.id).toBe("refunded");
    expect(await balanceOf(t, userId), recipe.id).toBe(before);
  }
  return price;
}

test("svaki recept radi od kartice do rezultata (DEMO) po fiksnoj ceni", async () => {
  expect(CREA_RECIPES.length).toBeGreaterThanOrEqual(15);
  const prices: Record<string, number> = {};
  for (const recipe of CREA_RECIPES) prices[recipe.id] = await runRecipe(recipe);
  expect(Object.keys(prices)).toHaveLength(CREA_RECIPES.length);
  expect(prices).toMatchObject({ profilna: 33, "cv-fotka": 33, "foto-dump": 34, logo: 8, jelovnik: 23, bojanka: 16 });
}, 120_000);
