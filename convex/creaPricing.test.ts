/// <reference types="vite/client" />

/**
 * Crea K07 kroz pravi `createJob` (convex-test): fleg cena v2, faktor na poslu i
 * u poravnanju, seme za Proba → Usavrši i keš istih zahteva (C4).
 */

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";
import { MOCK_REQUEST_PREFIX } from "./studioCore";
import { CREDIT_FACTOR } from "./studioPricing";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

async function seedModel(t: TestConvex, slug: string) {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(slug);

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

async function seedUser(t: TestConvex, email = "crea@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Crea",
      username: email.split("@")[0],
      // Osoblje prolazi kapiju pristupa; ovaj fajl meri cenu, ne pristup.
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 10000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });

  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function create(
  asUser: ReturnType<TestConvex["withIdentity"]>,
  modelSlug: string,
  params: Record<string, unknown>,
  extra: { inputMode?: string; parentJobId?: Id<"generationJobs">; derivation?: "usavrsavanje" } = {},
): Promise<Id<"generationJobs">> {
  const result = await asUser.mutation(api.studio.createJob, {
    modelSlug,
    params: JSON.stringify(params),
    inputMode: extra.inputMode ?? "text",
    ...(extra.parentJobId ? { parentJobId: extra.parentJobId } : {}),
    ...(extra.derivation ? { derivation: extra.derivation } : {}),
  });
  if (typeof result !== "string") throw new Error(`očekivan jobId: ${JSON.stringify(result)}`);

  return result;
}

/** Osoblje sme najviše tri posla u letu - test ih zatvara da bi pravio sledeće. */
async function finish(t: TestConvex, jobId: Id<"generationJobs">) {
  await t.run((ctx) => ctx.db.patch(jobId, { status: "done" }));

  return jobId;
}

async function job(t: TestConvex, jobId: Id<"generationJobs">) {
  const row = await t.run((ctx) => ctx.db.get(jobId));
  if (!row) throw new Error("nema posla");

  return row;
}

async function balance(t: TestConvex, userId: Id<"users">) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );

  return row?.balance ?? 0;
}

const NB2_1K = { prompt: "mačka na krovu", resolution: "1K", aspect_ratio: "1:1" };

test("fleg isključen: cena je današnja, posao ne pamti faktor, stanje kaže pricingV2=false", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const { asUser } = await seedUser(t);

  const jobId = await create(asUser, "nano-banana-2", NB2_1K);
  const row = await job(t, jobId);
  expect(row.creditCost).toBe(16);
  expect(row.creditFactor).toBeUndefined();

  const state = await asUser.query(api.studio.getStudioState, {});
  expect(state.pricingV2).toBe(false);
});

test("fleg uključen: slika i video po ×1,5, zvuk ostaje, posao pamti faktor", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  await seedModel(t, "tts");
  const { asUser } = await seedUser(t);
  await t.mutation(internal.creaFlags.setCreaFlag, { key: "crea_pricing_v2", enabled: true });

  const image = await job(t, await finish(t, await create(asUser, "nano-banana-2", NB2_1K)));
  expect(image.creditCost).toBe(10);
  expect(image.creditFactor).toBe(129.75);

  const speech = await job(
    t,
    await create(asUser, "tts", { text: "Dobar dan svima. ".repeat(59), voice: "Aria" }),
  );
  expect(speech.creditCost).toBe(22);
  expect(speech.creditFactor).toBeUndefined();

  expect((await asUser.query(api.studio.getStudioState, {})).pricingV2).toBe(true);

  // Gašenje vraća današnje cene istog trenutka.
  await t.mutation(internal.creaFlags.setCreaFlag, { key: "crea_pricing_v2", enabled: false });
  expect((await job(t, await create(asUser, "nano-banana-2", NB2_1K))).creditCost).toBe(16);
});

test("poravnanje v2 posla ide po NJEGOVOM faktoru, ne po v1", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const { userId, asUser } = await seedUser(t);
  await t.mutation(internal.creaFlags.setCreaFlag, { key: "crea_pricing_v2", enabled: true });

  const jobId = await create(asUser, "nano-banana-2", NB2_1K);
  expect(await balance(t, userId)).toBe(10000 - 10);

  // Provajder je prijavio stvaran trošak od 0,10 $: v2 = ceil(0,10 × 129,75) = 13 kr.
  await t.run((ctx) => ctx.db.patch(jobId, { status: "done", actualCostUsd: 0.1 }));
  await t.mutation(internal.studio.settleJobCredits, { jobId });

  expect(await balance(t, userId)).toBe(10000 - 13);
  // Po v1 bi bilo ceil(0,10 × 216,25) = 22 kr - poravnanje to NE sme da uradi.
  expect(Math.ceil(0.1 * CREDIT_FACTOR)).toBe(22);
});

test("seme: server ga dodeljuje, a Usavrši iste porodice nasleđuje seme probe", async () => {
  const t = makeT();
  await seedModel(t, "flux-2-klein");
  await seedModel(t, "flux-2-pro");
  await seedModel(t, "z-image-turbo");
  await seedModel(t, "nano-banana-2");
  const { asUser } = await seedUser(t);

  const draftId = await finish(t, await create(asUser, "flux-2-klein", { prompt: "brod", image_size: "square_hd" }));
  const draftSeed = JSON.parse((await job(t, draftId)).params).seed as number;
  expect(Number.isInteger(draftSeed)).toBe(true);

  // Klijent seme ne može da podmetne - nije kontrola forme.
  const forced = await finish(t, await create(asUser, "flux-2-klein", { prompt: "brod", seed: 5 }));
  expect(JSON.parse((await job(t, forced)).params).seed).not.toBe(5);

  const refined = await job(
    t,
    await finish(
      t,
      await create(asUser, "flux-2-pro", { prompt: "brod", image_size: "square_hd" }, {
        parentJobId: draftId,
        derivation: "usavrsavanje",
      }),
    ),
  );
  expect(JSON.parse(refined.params).seed).toBe(draftSeed);
  expect(refined.parentJobId).toBe(draftId);
  expect(refined.derivation).toBe("usavrsavanje");

  // Model bez semena (Google) ga ni ne dobija.
  const nb2 = await job(t, await create(asUser, "nano-banana-2", NB2_1K));
  expect(JSON.parse(nb2.params)).not.toHaveProperty("seed");
});

test("keš: isti zahtev istog korisnika nudi postojeći rad, sve ostalo ne", async () => {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  const { userId, asUser } = await seedUser(t);
  const { asUser: other } = await seedUser(t, "drugi@example.com");

  const jobId = await create(asUser, "nano-banana-2", NB2_1K);
  const ask = (as: typeof asUser, params: Record<string, unknown>) =>
    as.query(api.creaCache.findIdenticalJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify(params),
      inputMode: "text",
      now: Date.now(),
    });

  // Dok rad nije gotov, nema šta da se ponudi.
  expect(await ask(asUser, NB2_1K)).toBeNull();

  const outputId = await t.run((ctx) => ctx.storage.store(new Blob(["png"], { type: "image/png" })));
  await t.run((ctx) => ctx.db.patch(jobId, { status: "done", outputStorageId: outputId, falRequestId: "google-1" }));

  expect(await ask(asUser, NB2_1K)).toEqual({ jobId, creditCost: 16 });
  // Redosled ključeva i podrazumevane vrednosti ne menjaju otisak.
  expect(await ask(asUser, { aspect_ratio: "1:1", prompt: "mačka na krovu" })).toEqual({ jobId, creditCost: 16 });
  expect(await ask(asUser, { ...NB2_1K, prompt: "pas na krovu" })).toBeNull();
  expect(await ask(asUser, { ...NB2_1K, resolution: "2K" })).toBeNull();
  // Nikad između korisnika (K01-13).
  expect(await ask(other, NB2_1K)).toBeNull();

  // Probni (DEMO) izlaz se ne nudi.
  await t.run((ctx) => ctx.db.patch(jobId, { falRequestId: `${MOCK_REQUEST_PREFIX}${jobId}` }));
  expect(await ask(asUser, NB2_1K)).toBeNull();

  expect((await job(t, jobId)).userId).toBe(userId);
});
