/// <reference types="vite/client" />

/**
 * Više scena u jednom klipu (Crea K18, V11): kartice iz alata postaju JEDAN Kling 3.0
 * posao kroz postojeći tok - `createJob` (rezervacija po ukupnom trajanju) pa
 * `submitJob` (fal dobija `multi_prompt`, bez pojedinačnog opisa). Parametri dolaze
 * iz iste čiste logike koju zove alat (`lib/crea-scenes.ts`).
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { scenesParams, type SceneCard } from "../lib/crea-scenes";
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

const KLING = "kling-3";

function seedOf(slug: string): StudioModelSeed {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(`Nema modela ${slug} u katalogu`);
  return seed;
}

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

async function seedUser(t: TestConvex) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "scene@example.com",
      name: "Scena Crea",
      username: "scena_crea",
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 1000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

const CARDS: SceneCard[] = [
  { text: "Devojka otvara prozor", move: "the camera slowly dollies in toward the subject", seconds: 3 },
  { text: "Golubovi poleću sa krova", move: "", seconds: 2 },
  { text: "Sunce izlazi iznad reke", move: "aerial drone shot flying forward over the landscape", seconds: 3 },
];

function stubFal() {
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> });
      return { ok: true, status: 200, text: async () => "", json: async () => ({ request_id: "req_scene" }) } as Response;
    }),
  );
  return sent;
}

test("scene: jedan posao, cena po ukupnom trajanju, fal dobija multi_prompt umesto opisa", async () => {
  const t = makeT();
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, KLING);
  const params = { ...scenesParams(CARDS), resolution: "720p", audio: false };

  const jobId = (await asUser.mutation(api.studio.createJob, {
    modelSlug: KLING,
    params: JSON.stringify(params),
    inputMode: "text",
  })) as Id<"generationJobs">;
  const job = await t.run((ctx) => ctx.db.get(jobId));
  // 8 s × $0,084 (720p bez zvuka) = isto kao jedan klip od 8 s.
  const expected = computeCredits(seedOf(KLING).priceRule, { resolution: "720p", audio: false, voice_control: false, duration: 8 }, "text");
  expect(job!.creditCost).toBe(expected);
  const balance = await t.run(async (ctx) =>
    (await ctx.db.query("creditBalances").withIndex("by_user", (q) => q.eq("userId", userId)).unique())?.balance,
  );
  expect(balance).toBe(1000 - expected);
  expect(JSON.parse(job!.params)).toMatchObject({ duration: 8, scenes: params.scenes });

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  const sent = stubFal();
  await t.action(internal.studioActions.submitJob, { jobId });

  // Zakazana predaja iz `createJob` može da stigne pre ručne - oba zahteva su isti posao.
  expect(sent.length).toBeGreaterThanOrEqual(1);
  expect(sent[0].url.startsWith("https://queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video?")).toBe(true);
  expect(sent[0].body).toMatchObject({
    multi_prompt: [
      { prompt: "Devojka otvara prozor, the camera slowly dollies in toward the subject", duration: "3" },
      { prompt: "Golubovi poleću sa krova", duration: "2" },
      { prompt: "Sunce izlazi iznad reke, aerial drone shot flying forward over the landscape", duration: "3" },
    ],
    shot_type: "customize",
    generate_audio: false,
    duration: 8,
  });
  expect(sent[0].body).not.toHaveProperty("prompt");
  expect(sent[0].body).not.toHaveProperty("scenes");
  expect(sent[0].body).not.toHaveProperty("audio");
});

test("scene sa početnom slikom: `image` režim šalje sliku kao `start_image_url`", async () => {
  const t = makeT();
  const { asUser } = await seedUser(t);
  await seedCatalogModel(t, KLING);
  const image = await asUser.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "image/png" })));
  const { grantId } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "image" });
  await asUser.mutation(api.studio.registerInputUpload, { storageId: image, grantId });

  const jobId = (await asUser.mutation(api.studio.createJob, {
    modelSlug: KLING,
    params: JSON.stringify({ ...scenesParams(CARDS), resolution: "720p", audio: true }),
    inputMode: "image",
    inputs: JSON.stringify({ image: [image] }),
  })) as Id<"generationJobs">;

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  const imageUrl = await t.run((ctx) => ctx.storage.getUrl(image));
  const sent = stubFal();
  await t.action(internal.studioActions.submitJob, { jobId });

  expect(sent[0].url.startsWith("https://queue.fal.run/fal-ai/kling-video/v3/standard/image-to-video?")).toBe(true);
  expect(sent[0].body.start_image_url).toBe(imageUrl);
  expect(sent[0].body).not.toHaveProperty("image_url");
  expect(sent[0].body.generate_audio).toBe(true);
  expect(Array.isArray(sent[0].body.multi_prompt)).toBe(true);
});

test("običan Kling posao (bez scena) i dalje šalje opis, ne prazne scene", async () => {
  const t = makeT();
  const { asUser } = await seedUser(t);
  await seedCatalogModel(t, KLING);
  const jobId = (await asUser.mutation(api.studio.createJob, {
    modelSlug: KLING,
    params: JSON.stringify({ prompt: "Mačka na krovu", duration: 5, resolution: "720p", audio: true }),
    inputMode: "text",
  })) as Id<"generationJobs">;

  process.env.FAL_KEY = "test-fal-key";
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  const sent = stubFal();
  await t.action(internal.studioActions.submitJob, { jobId });

  expect(sent[0].body).toMatchObject({ prompt: "Mačka na krovu", duration: 5, generate_audio: true });
  expect(sent[0].body).not.toHaveProperty("multi_prompt");
  expect(sent[0].body).not.toHaveProperty("scenes");
});
