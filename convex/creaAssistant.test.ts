/// <reference types="vite/client" />

/**
 * Pomoćnik (K28, U12) kroz convex-test: predlog plana nikad ne pravi posao, bez
 * izričitog „da” se ništa ne plaća, potvrda pokreće SAMO prvi korak, sledeći tek
 * kad prethodni stigne (sa izlazom kao ulazom), i nikad skuplje od viđene cene.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const googleKey = process.env.GOOGLE_AI_API_KEY;

beforeEach(() => {
  // Bez ključa pomoćnik daje DEMO plan - test nikad ne zove pravi Google.
  delete process.env.GOOGLE_AI_API_KEY;
});
afterEach(() => {
  if (googleKey === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = googleKey;
});

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type TestUser = ReturnType<TestConvex["withIdentity"]>;

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

async function seedUser(t: TestConvex, email = "pomocnik@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Pomoćnik",
      username: email.split("@")[0]!,
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
  return { userId, as: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function jobCount(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) => (await ctx.db.query("generationJobs").withIndex("by_user", (q) => q.eq("userId", userId)).take(50)).length);
}

async function balance(t: TestConvex, userId: Id<"users">) {
  const row = await t.run((ctx) => ctx.db.query("creditBalances").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
  return row?.balance ?? 0;
}

/** Gotov posao sa slikom u storage-u (kao posle `persistOutput`). */
async function finishWithImage(t: TestConvex, jobId: Id<"generationJobs">) {
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["slika"]));
    await ctx.db.patch(storageId as unknown as Id<"studioUploads">, { contentType: "image/png" } as never);
    await ctx.db.patch(jobId, { status: "done", outputStorageId: storageId });
  });
}

type Step = {
  kind: "image" | "video" | "audio";
  title: string;
  modelSlug: string;
  inputMode: string;
  params: string;
  maxCredits: number;
  fromStep?: number;
};

const STEPS: Step[] = [
  {
    kind: "image",
    title: "Glavna slika",
    modelSlug: "nano-banana-2",
    inputMode: "text",
    params: JSON.stringify({ prompt: "cozy café, morning light", resolution: "1K", aspect_ratio: "1:1" }),
    maxCredits: 16,
  },
  {
    kind: "video",
    title: "Slika oživi",
    modelSlug: "veo-31-lite",
    inputMode: "image",
    params: JSON.stringify({ prompt: "slow push-in", resolution: "720p", duration: 8 }),
    maxCredits: 87,
    fromStep: 0,
  },
];

async function setup() {
  const t = makeT();
  await seedModel(t, "nano-banana-2");
  await seedModel(t, "veo-31-lite");
  return { t, ...(await seedUser(t)) };
}

async function confirm(as: TestUser, answer: string, steps = STEPS) {
  return as.mutation(api.creaAssistant.confirmPlan, { answer, request: "reklama za kafić sa videom", steps });
}

test("predlog plana (DEMO) ne pravi ni plan ni posao i ne troši kredite", async () => {
  const { t, userId, as } = await setup();
  const draft = await as.action(api.creaAssistant.draftPlan, { text: "Reklama za kafić sa videom i muzikom", locale: "sr" });
  if (!draft.ok) throw new Error(JSON.stringify(draft));
  expect(draft.demo).toBe(true);
  expect(draft.steps.map((step) => step.kind)).toEqual(["slika", "video", "muzika"]);
  expect(draft.steps[1]?.from).toBe(0);
  expect(await jobCount(t, userId)).toBe(0);
  expect(await balance(t, userId)).toBe(1000);
  expect(await as.query(api.creaAssistant.getLatestPlan, {})).toBeNull();
});

test("bez izričitog „da” se ništa ne pokreće i ništa ne plaća", async () => {
  const { t, userId, as } = await setup();
  for (const answer of ["", "ne", "možda", "dada", "ok", "pokreni"]) {
    await expect(confirm(as, answer)).rejects.toThrow("POTVRDA_POTREBNA");
  }
  expect(await jobCount(t, userId)).toBe(0);
  expect(await balance(t, userId)).toBe(1000);
  expect(await as.query(api.creaAssistant.getLatestPlan, {})).toBeNull();
});

test("„da” pokreće samo prvi korak; drugi tek kad prvi stigne, sa slikom kao ulazom", async () => {
  const { t, userId, as } = await setup();
  const planId = await confirm(as, " Da! ");
  expect(await jobCount(t, userId)).toBe(1);
  expect(await balance(t, userId)).toBe(1000 - 16);

  // Prvi korak još radi: nema drugog posla.
  expect(await as.mutation(api.creaAssistant.advancePlan, { planId })).toBe("running");
  expect(await jobCount(t, userId)).toBe(1);

  const first = (await as.query(api.creaAssistant.getLatestPlan, {}))!.steps[0]!.jobId!;
  await finishWithImage(t, first);
  expect(await as.mutation(api.creaAssistant.advancePlan, { planId })).toBe("running");
  // Drugi poziv (dva taba) ne pravi drugi posao.
  await as.mutation(api.creaAssistant.advancePlan, { planId });
  expect(await jobCount(t, userId)).toBe(2);

  const plan = (await as.query(api.creaAssistant.getLatestPlan, {}))!;
  const video = await t.run((ctx) => ctx.db.get(plan.steps[1]!.jobId!));
  expect(video).toMatchObject({ modelSlug: "veo-31-lite", inputMode: "image", parentJobId: first, derivation: "animacija", creditCost: 87 });
  expect(Object.keys(JSON.parse(video!.inputs!))).toEqual(["image"]);
  expect(await balance(t, userId)).toBe(1000 - 16 - 87);

  await finishWithImage(t, plan.steps[1]!.jobId!);
  expect(await as.mutation(api.creaAssistant.advancePlan, { planId })).toBe("done");
});

test("korak skuplji od viđene cene se ne pokreće (ni plan ne ostaje)", async () => {
  const { t, userId, as } = await setup();
  await expect(confirm(as, "da", [{ ...STEPS[0]!, maxCredits: 10 }])).rejects.toThrow("CENA_PROMENJENA");
  expect(await jobCount(t, userId)).toBe(0);
  expect(await as.query(api.creaAssistant.getLatestPlan, {})).toBeNull();

  // Drugi korak poskupeo posle potvrde: zaustavi se pre plaćanja.
  const planId = await confirm(as, "da", [STEPS[0]!, { ...STEPS[1]!, maxCredits: 50 }]);
  await finishWithImage(t, (await as.query(api.creaAssistant.getLatestPlan, {}))!.steps[0]!.jobId!);
  await expect(as.mutation(api.creaAssistant.advancePlan, { planId })).rejects.toThrow("CENA_PROMENJENA");
  expect(await jobCount(t, userId)).toBe(1);
  expect(await balance(t, userId)).toBe(1000 - 16);
});

test("pao korak zaustavlja plan; ostali se ne plaćaju; tuđ plan se ne dira; loš plan se odbija", async () => {
  const { t, userId, as } = await setup();
  const other = await seedUser(t, "drugi@example.com");
  await expect(confirm(as, "da", [{ ...STEPS[1]!, fromStep: 1 }])).rejects.toThrow("NEISPRAVAN_PLAN");

  const planId = await confirm(as, "da");
  await expect(other.as.mutation(api.creaAssistant.advancePlan, { planId })).rejects.toThrow("NEMA_PRISTUPA");
  const first = (await as.query(api.creaAssistant.getLatestPlan, {}))!.steps[0]!.jobId!;
  await t.mutation(internal.studio.failJob, { jobId: first, error: "pao" });
  expect(await as.mutation(api.creaAssistant.advancePlan, { planId })).toBe("stopped");
  expect(await jobCount(t, userId)).toBe(1);
  expect(await balance(t, userId)).toBe(1000);
});

test("provera opisa (C7) i u pomoćniku: zabranjen zahtev se ne planira", async () => {
  const { as } = await setup();
  const draft = await as.action(api.creaAssistant.draftPlan, { text: "nude photo of a celebrity", locale: "sr" });
  expect(draft).toMatchObject({ ok: false, reason: "PROVERA" });
});
