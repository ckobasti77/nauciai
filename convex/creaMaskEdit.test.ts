/// <reference types="vite/client" />

/**
 * Četkica i opis (S11, K11): plaćena izmena sa maskom ide kroz POSTOJEĆI tok
 * posla - `createJob` (rezervacija, cena, ulazi, roditelj) pa `submitJob`
 * (zahtev ka fal-u). Parametri i opis dolaze iz iste čiste logike koju zove UI
 * (`lib/crea-paid-edit.ts`).
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { BRUSH_ROUTES, paidEditParams, paidEditPrompt } from "../lib/crea-paid-edit";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUDIO_MODELS } from "./providers/catalogModels";
import type { StudioModelSeed } from "./providers/modelSeed";
import schema from "./schema";
import { computeCredits } from "./studioPricing";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type TestUser = ReturnType<TestConvex["withIdentity"]>;

const previousFalKey = process.env.FAL_KEY;
const previousSiteUrl = process.env.CONVEX_SITE_URL;
const previousStudioMock = process.env.STUDIO_MOCK;

beforeEach(() => {
  delete process.env.FAL_KEY;
  delete process.env.CONVEX_SITE_URL;
  delete process.env.STUDIO_MOCK;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousFalKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = previousFalKey;
  if (previousSiteUrl === undefined) delete process.env.CONVEX_SITE_URL;
  else process.env.CONVEX_SITE_URL = previousSiteUrl;
  if (previousStudioMock === undefined) delete process.env.STUDIO_MOCK;
  else process.env.STUDIO_MOCK = previousStudioMock;
});

function seedOf(slug: string): StudioModelSeed {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(`Nema modela ${slug} u katalogu`);
  return seed;
}

/** Red kataloga u bazi - ista polja koja upisuje `seedStudioModels`. */
async function seedCatalogModel(t: TestConvex, slug: string) {
  const seed = seedOf(slug);
  return t.run((ctx) =>
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

/** Korisnik sa pristupom Crei, prihvaćenim uslovima i kreditima (isto kao `studioCatalogJob.test.ts`). */
async function seedUser(t: TestConvex) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "maska@example.com",
      name: "Maska Student",
      username: "maska_student",
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const courseId = await ctx.db.insert("courses", {
      slug: "maska-course",
      titleSr: "Kurs",
      titleEn: "Course",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
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
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

/** Fajl okačen istim putem kao iz alata: dozvola za slot → upload → prijava. */
async function storeFile(as: TestUser, type: string, slot: string) {
  const storageId = await as.run((ctx) => ctx.storage.store(new Blob(["x"], { type })));
  const { grantId } = await as.mutation(api.studio.createInputUploadUrl, { slot });
  await as.mutation(api.studio.registerInputUpload, { storageId, grantId });
  return storageId;
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

const MASK_ROUTE = BRUSH_ROUTES[0];
const ZONE_ROUTE = BRUSH_ROUTES[1];

test("maska: posao se rezerviše sa slikom i maskom, po ceni režima maske", async () => {
  const t = makeT();
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "ideogram-45");
  const image = await storeFile(asUser, "image/jpeg", "image");
  const mask = await storeFile(asUser, "image/png", "mask");
  const params = paidEditParams(MASK_ROUTE, { prompt: paidEditPrompt(MASK_ROUTE, "edit", "crvena kapa", "sr"), width: 1200, height: 800 });

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MASK_ROUTE.modelSlug,
    params: JSON.stringify(params),
    inputMode: MASK_ROUTE.inputMode,
    inputs: JSON.stringify({ image: [image], mask: [mask] }),
  });

  const job = await t.run((ctx) => ctx.db.get(jobId as Id<"generationJobs">));
  expect(job).toMatchObject({ status: "reserved", modelSlug: "ideogram-45", inputMode: "mask", provider: "fal" });
  expect(JSON.parse(job!.inputs ?? "{}")).toEqual({ image: [image], mask: [mask] });
  const stored = JSON.parse(job!.params) as Record<string, unknown>;
  expect(stored).toMatchObject({ prompt: "crvena kapa", quality: "low" });
  // Sa maskom fal prima samo `image_size: auto` - kontrola veličine ne ide uz režim maske.
  expect(stored).not.toHaveProperty("image_size");
  // $0,03 (nizak kvalitet izmene) × 0,865 × 2,5 × 100 = 7 kr - i tačno to je skinuto.
  const expected = computeCredits(seedOf("ideogram-45").priceRule, { quality: "low" }, "mask");
  expect(expected).toBe(7);
  expect(job!.creditCost).toBe(expected);
  expect(await balanceOf(t, userId)).toBe(1000 - expected);
});

test("maska: zahtev ka fal-u ide na `ideogram/v4.5/edit` sa `image_url` i `mask_url`", async () => {
  const t = makeT();
  const { asUser } = await seedUser(t);
  await seedCatalogModel(t, "ideogram-45");
  const image = await storeFile(asUser, "image/jpeg", "image");
  const mask = await storeFile(asUser, "image/png", "mask");
  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: "ideogram-45",
    params: JSON.stringify(paidEditParams(MASK_ROUTE, { prompt: "suncokret u vazi", quality: "very_low", width: 1, height: 1 })),
    inputMode: "mask",
    inputs: JSON.stringify({ image: [image], mask: [mask] }),
  });

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  const imageUrl = await t.run((ctx) => ctx.storage.getUrl(image));
  const maskUrl = await t.run((ctx) => ctx.storage.getUrl(mask));
  let sent: { url: string; body: Record<string, unknown> } | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(init.body as string) as Record<string, unknown> };
      return { ok: true, status: 200, text: async () => "", json: async () => ({ request_id: "req_maska" }) } as Response;
    }),
  );

  await t.action(internal.studioActions.submitJob, { jobId: jobId as Id<"generationJobs"> });

  expect(sent).not.toBeNull();
  const request = sent as unknown as { url: string; body: Record<string, unknown> };
  expect(request.url.startsWith("https://queue.fal.run/ideogram/v4.5/edit?")).toBe(true);
  expect(request.body).toMatchObject({
    prompt: "suncokret u vazi",
    quality: "very_low",
    image_url: imageUrl,
    mask_url: maskUrl,
    enable_prompt_expansion: false,
  });
  expect(request.body).not.toHaveProperty("image_size");
  expect(typeof request.body.seed).toBe("number");
  const job = await t.run((ctx) => ctx.db.get(jobId as Id<"generationJobs">));
  expect(job).toMatchObject({ status: "running", falRequestId: "req_maska" });
});

test("maska je nova verzija svoje slike (stablo, K05)", async () => {
  const t = makeT();
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "ideogram-45");
  const parentId = await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "local:slika.format",
      provider: "local",
      kind: "image",
      status: "done",
      params: "{}",
      promptHash: "0".repeat(16),
      creditCost: 0,
      createdAt: 1,
    }),
  );
  const image = await storeFile(asUser, "image/jpeg", "image");
  const mask = await storeFile(asUser, "image/png", "mask");

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: "ideogram-45",
    params: JSON.stringify(paidEditParams(MASK_ROUTE, { prompt: "more", width: 1, height: 1 })),
    inputMode: "mask",
    inputs: JSON.stringify({ image: [image], mask: [mask] }),
    parentJobId: parentId,
    derivation: "izmena",
  });

  const job = await t.run((ctx) => ctx.db.get(jobId as Id<"generationJobs">));
  expect(job).toMatchObject({ parentJobId: parentId, rootJobId: parentId, derivation: "izmena" });
});

test("maska ne prolazi u režimu bez maske, a slika ne ide u slot maske kao drugi fajl", async () => {
  const t = makeT();
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "ideogram-45");
  const mask = await storeFile(asUser, "image/png", "mask");
  const second = await storeFile(asUser, "image/png", "mask");

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "ideogram-45",
      params: JSON.stringify({ prompt: "x" }),
      inputMode: "text",
      inputs: JSON.stringify({ mask: [mask] }),
    }),
  ).rejects.toThrow("NEISPRAVNI_ULAZI:NEPOZNAT_SLOT:mask");
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "ideogram-45",
      params: JSON.stringify({ prompt: "x" }),
      inputMode: "mask",
      inputs: JSON.stringify({ mask: [mask, second] }),
    }),
  ).rejects.toThrow("NEISPRAVNI_ULAZI:PREVISE_FAJLOVA:mask");
  // Kvalitet „very_low" postoji samo uz masku.
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "ideogram-45",
      params: JSON.stringify({ prompt: "x", quality: "very_low" }),
      inputMode: "text",
    }),
  ).rejects.toThrow("NEISPRAVNI_PARAMETRI");
  expect(await balanceOf(t, userId)).toBe(1000);
});

test("obojena zona (Nano Banana 2): original pa oznaka, odnos stranica fotke", async () => {
  const t = makeT();
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");
  const original = await storeFile(asUser, "image/jpeg", "image");
  const marked = await storeFile(asUser, "image/png", "image");
  const params = paidEditParams(ZONE_ROUTE, {
    prompt: paidEditPrompt(ZONE_ROUTE, "edit", "crvena kapa", "sr"),
    width: 800,
    height: 1200,
  });

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: "nano-banana-2",
    params: JSON.stringify(params),
    inputMode: "image_multi",
    inputs: JSON.stringify({ image: [original, marked] }),
  });

  const job = await t.run((ctx) => ctx.db.get(jobId as Id<"generationJobs">));
  expect(JSON.parse(job!.inputs ?? "{}")).toEqual({ image: [original, marked] });
  const stored = JSON.parse(job!.params) as Record<string, unknown>;
  expect(stored).toMatchObject({ aspect_ratio: "2:3", resolution: "1K" });
  expect(String(stored.prompt)).toContain("crvenom označen");
  expect(job!.creditCost).toBe(computeCredits(seedOf("nano-banana-2").priceRule, stored, "image_multi"));
  expect(await balanceOf(t, userId)).toBe(1000 - job!.creditCost);
});
