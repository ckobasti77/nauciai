/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  computeCreditCost,
  computeMargin,
  dayKey,
  dayStart,
  MAX_DAILY_COST_USD,
  mockJobSucceeds,
  mockOutputDataUrl,
  sanitizeParams,
} from "./studioCore";

const modules = import.meta.glob("./**/*.ts");

type TestConvex = ReturnType<typeof convexTest>;

/** Slug jedinog uključenog modela u testovima; fiksna cena 20 kredita. */
const MODEL_SLUG = "flux-2-flash";
const MODEL_COST = 20;
const MODEL_COST_USD = 0.005;

function promptParams(prompt: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ prompt, ...extra });
}

async function seedUser(t: TestConvex, opts: { enrolled?: boolean; blocked?: boolean } = {}) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "student@example.com",
      name: "Studio Student",
      username: "studio_student",
      role: "student",
      language: "sr" as const,
      createdAt: 1,
      updatedAt: 1,
    });

    if (opts.enrolled !== false) {
      const courseId = await ctx.db.insert("courses", {
        slug: "studio-course",
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
      await ctx.db.insert("enrollments", {
        userId,
        courseId,
        status: opts.blocked ? ("blocked" as const) : ("active" as const),
        startedAt: 1,
        updatedAt: 1,
      });
    }

    return userId;
  });

  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function seedModel(
  t: TestConvex,
  overrides: Partial<{
    slug: string;
    kind: "image" | "video" | "audio";
    creditCost: number;
    costPerSecond: number;
    isEnabled: boolean;
    paramSchema: string;
    defaultParams: string;
    estimatedCostUsd: number;
  }> = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("modelCatalog", {
      slug: overrides.slug ?? MODEL_SLUG,
      kind: overrides.kind ?? ("image" as const),
      labelSr: "FLUX.2 Flash",
      labelEn: "FLUX.2 Flash",
      descriptionSr: "Najjeftiniji model.",
      descriptionEn: "Cheapest model.",
      provider: "fal",
      falEndpoint: "fal-ai/flux-2/flash",
      defaultParams: overrides.defaultParams ?? JSON.stringify({ aspect_ratio: "1:1" }),
      paramSchema: overrides.paramSchema ?? "[]",
      creditCost: overrides.creditCost ?? MODEL_COST,
      costPerSecond: overrides.costPerSecond,
      estimatedCostUsd: overrides.estimatedCostUsd ?? MODEL_COST_USD,
      isEnabled: overrides.isEnabled ?? true,
      sortOrder: 10,
      updatedAt: 1,
    }),
  );
}

async function grant(t: TestConvex, userId: Id<"users">, amount: number) {
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}-${amount}` },
  });
}

async function ledger(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) => {
    const balanceRow = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const transactions = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return { balance: balanceRow?.balance ?? 0, transactions, jobs };
  });
}

/** Puna postavka za srećan tok: upisan korisnik, uključen model, krediti. */
async function seedWorld(t: TestConvex, credits = 100) {
  const { userId, asUser } = await seedUser(t);
  await seedModel(t);
  await grant(t, userId, credits);
  return { userId, asUser };
}

// ── srećan tok ─────────────────────────────────────────────────────────────

test("createJob rezerviše posao, skida kredite i zakazuje slanje - sve u jednoj transakciji", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica u snegu"),
  });

  const { balance, transactions, jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]._id).toBe(jobId);
  expect(jobs[0].status).toBe("reserved");
  expect(jobs[0].kind).toBe("image");
  expect(jobs[0].modelSlug).toBe(MODEL_SLUG);
  expect(jobs[0].creditCost).toBe(MODEL_COST);
  expect(jobs[0].promptHash).toMatch(/^[0-9a-f]{16}$/);
  // `params` su prošli kroz `sanitizeParams` - to je objekat koji ide fal-u.
  expect(JSON.parse(jobs[0].params)).toEqual({ prompt: "lisica u snegu" });

  const spend = transactions.filter((transaction) => transaction.type === "spend");
  expect(spend).toHaveLength(1);
  expect(spend[0].amount).toBe(-MODEL_COST);
  expect(spend[0].jobId).toBe(jobId);
  expect(balance).toBe(100 - MODEL_COST);

  const usage = await t.run((ctx) =>
    ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayKey(Date.now())))
      .unique(),
  );
  expect(usage?.generations).toBe(1);
  expect(usage?.creditsSpent).toBe(MODEL_COST);
  expect(usage?.costUsd).toBeCloseTo(MODEL_COST_USD);

  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0].name).toContain("submitJob");
  expect(scheduled[0].args[0]).toEqual({ jobId });
});

// ── 1. nedovoljno kredita ──────────────────────────────────────────────────

test("nedovoljno kredita: nema posla, nema transakcije, balans nepromenjen", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t, MODEL_COST - 1);
  const before = await ledger(t, userId);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).rejects.toThrow(/NEDOVOLJNO_KREDITA/);

  const after = await ledger(t, userId);
  expect(after.jobs).toHaveLength(0);
  expect(after.transactions).toHaveLength(before.transactions.length);
  expect(after.transactions.some((transaction) => transaction.type === "spend")).toBe(false);
  expect(after.balance).toBe(before.balance);
  expect(after.balance).toBe(MODEL_COST - 1);

  // Ni dnevni brojač ni zakazana akcija ne smeju da prežive rollback.
  const usage = await t.run((ctx) => ctx.db.query("studioUsageDaily").collect());
  expect(usage).toHaveLength(0);
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled).toHaveLength(0);
});

// ── 2. paralelni poslovi ───────────────────────────────────────────────────

test("četvrti paralelni posao je odbijen, prva tri prolaze", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t, 200);

  for (let index = 0; index < 3; index += 1) {
    await asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams(`posao ${index}`),
    });
  }

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("cetvrti"),
    }),
  ).rejects.toThrow(/PREVISE_POSLOVA/);

  const { balance, jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(3);
  expect(balance).toBe(200 - 3 * MODEL_COST);
});

test("posao koji je izašao iz reda (running -> done) oslobađa mesto za nov", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t, 200);

  const jobIds: Id<"generationJobs">[] = [];
  for (let index = 0; index < 3; index += 1) {
    jobIds.push(
      await asUser.mutation(api.studio.createJob, {
        modelSlug: MODEL_SLUG,
        params: promptParams(`posao ${index}`),
      }),
    );
  }

  // `running` se i dalje broji u limit, `done` ne.
  await t.mutation(internal.studio.markJobRunning, { jobId: jobIds[0], providerRequestId: "req_1" });
  await expect(
    asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("jos") }),
  ).rejects.toThrow(/PREVISE_POSLOVA/);

  await t.run((ctx) => ctx.db.patch(jobIds[0], { status: "done" }));
  await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("cetvrti posle zavrsenog"),
  });

  const { jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(4);
});

// ── 3. moderacija prompta ──────────────────────────────────────────────────

test("zabranjen pojam je odbijen pre nego što se skine ijedan kredit", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("napravi deepfake predsednika"),
    }),
  ).rejects.toThrow(/NEISPRAVAN_PROMPT:ZABRANJEN_POJAM/);

  const { balance, transactions, jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(0);
  expect(transactions.some((transaction) => transaction.type === "spend")).toBe(false);
  expect(balance).toBe(100);
});

test("prazan i predugačak prompt su odbijeni sa svojim razlogom", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);

  await expect(
    asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("   ") }),
  ).rejects.toThrow(/NEISPRAVAN_PROMPT:PRAZAN_PROMPT/);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("a".repeat(2001)),
    }),
  ).rejects.toThrow(/NEISPRAVAN_PROMPT:PREDUGACAK_PROMPT/);

  // Prompt koji uopšte nije poslat pada na istu proveru kao prazan.
  await expect(
    asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: JSON.stringify({}) }),
  ).rejects.toThrow(/NEISPRAVAN_PROMPT:PRAZAN_PROMPT/);

  expect((await ledger(t, userId)).balance).toBe(100);
});

// ── 4. isključen model ─────────────────────────────────────────────────────

test("isključen model i model van kataloga su odbijeni bez trošenja kredita", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedModel(t, { slug: "ugasen-model", isEnabled: false });
  await grant(t, userId, 100);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "ugasen-model",
      params: promptParams("lisica"),
    }),
  ).rejects.toThrow(/MODEL_NEDOSTUPAN/);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "ne-postoji",
      params: promptParams("lisica"),
    }),
  ).rejects.toThrow(/MODEL_NEDOSTUPAN/);

  const { balance, jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(0);
  expect(balance).toBe(100);
});

// ── 5. cena se računa serverski ────────────────────────────────────────────

test("cena dolazi iz kataloga i kad klijent pošalje svoju vrednost u params", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica", { creditCost: 1, credits: 1, price: 0 }),
  });

  const { balance, transactions } = await ledger(t, userId);
  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.creditCost).toBe(MODEL_COST);
  expect(balance).toBe(100 - MODEL_COST);
  expect(transactions.find((transaction) => transaction.type === "spend")?.amount).toBe(-MODEL_COST);
});

test("video model se naplaćuje ceil(costPerSecond * duration), a ne fiksnom cenom", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedModel(t, {
    slug: "veo-3-1-lite",
    kind: "video",
    creditCost: 4,
    costPerSecond: 4.5,
    // Model koji naplaćuje po sekundi MORA da izloži `duration` u šemi: cena
    // se računa iz očišćenih parametara, iz istog objekta koji ide fal-u.
    paramSchema: JSON.stringify([
      { key: "prompt", type: "textarea" },
      { key: "duration", type: "number", min: 1, max: 10 },
    ]),
  });
  await grant(t, userId, 100);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: "veo-3-1-lite",
    params: promptParams("dron nad gradom", { duration: 6, creditCost: 1 }),
  });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.creditCost).toBe(27);
  expect((await ledger(t, userId)).balance).toBe(100 - 27);

  // Bez trajanja se ne pogađa - naplatiti baznu cenu za klip nepoznate
  // dužine bi značilo tiho potkradanje kase.
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "veo-3-1-lite",
      params: promptParams("dron nad gradom"),
    }),
  ).rejects.toThrow(/NEISPRAVNO_TRAJANJE/);
});

// ── 6. i 7. failJob i refund ───────────────────────────────────────────────

test("failJob vrati tačno onoliko kredita koliko je posao skinuo", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica"),
  });
  expect((await ledger(t, userId)).balance).toBe(100 - MODEL_COST);

  await t.mutation(internal.studio.failJob, {
    jobId,
    error: "fal request failed (422): bad prompt",
  });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("refunded");
  expect(job?.error).toBe("fal request failed (422): bad prompt");

  const { balance, transactions } = await ledger(t, userId);
  expect(balance).toBe(100);
  const refunds = transactions.filter((transaction) => transaction.type === "refund");
  expect(refunds).toHaveLength(1);
  expect(refunds[0].amount).toBe(MODEL_COST);
});

test("failJob pozvan dvaput vrati kredite samo jednom", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica"),
  });

  await t.mutation(internal.studio.failJob, { jobId, error: "prvi put" });
  await t.mutation(internal.studio.failJob, { jobId, error: "drugi put" });

  const { balance, transactions } = await ledger(t, userId);
  expect(balance).toBe(100);
  expect(transactions.filter((transaction) => transaction.type === "refund")).toHaveLength(1);
});

test("markJobRunning postavlja status running i oba polja sa ID-jem zahteva", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica"),
  });
  await t.mutation(internal.studio.markJobRunning, { jobId, providerRequestId: "req_1" });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("running");
  // Prelazna faza: staro polje drži fal webhook (`by_fal_request`), novo drži
  // BytePlus callback (`by_provider_request`). Oba moraju da nose isti ID.
  expect(job?.falRequestId).toBe("req_1");
  expect(job?.providerRequestId).toBe("req_1");
});

// ── 8. dnevni limit ────────────────────────────────────────────────────────

test("prekoračen dnevni limit je odbijen, a 49. generacija tog dana prolazi", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t, 2000);
  const day = dayKey(Date.now());

  await t.run((ctx) =>
    ctx.db.insert("studioUsageDaily", {
      userId,
      day,
      generations: 49,
      creditsSpent: 49 * MODEL_COST,
      costUsd: 49 * MODEL_COST_USD,
    }),
  );

  await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("pedeseta"),
  });
  const usage = await t.run((ctx) =>
    ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .unique(),
  );
  expect(usage?.generations).toBe(50);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("pedeset prva"),
    }),
  ).rejects.toThrow(/DNEVNI_LIMIT/);

  const { jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(1);
});

test("dnevni limit je vezan za dan - jučerašnjih 50 ne blokira danas", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);

  await t.run((ctx) =>
    ctx.db.insert("studioUsageDaily", {
      userId,
      day: dayKey(Date.now() - 24 * 60 * 60 * 1000),
      generations: 50,
      creditsSpent: 50 * MODEL_COST,
      costUsd: 50 * MODEL_COST_USD,
    }),
  );

  await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("danasnja prva"),
  });

  expect((await ledger(t, userId)).jobs).toHaveLength(1);
});

// ── kill switch i enrollment ───────────────────────────────────────────────

test("kill switch: studio_enabled false odbija sve pre bilo koje druge provere", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: "studio_enabled", enabled: false }));

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica"),
    }),
  ).rejects.toThrow(/STUDIO_PAUZIRAN/);

  const { balance, jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(0);
  expect(balance).toBe(100);
});

test("seedovan studio_enabled true pušta posao (kao i red koji ne postoji)", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: "studio_enabled", enabled: true }));

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica"),
    }),
  ).resolves.toBeDefined();
});

test("neupisan i blokiran korisnik ne mogu da generišu", async () => {
  const t = convexTest(schema, modules);
  const withoutEnrollment = await seedUser(t, { enrolled: false });
  await seedModel(t);
  await grant(t, withoutEnrollment.userId, 100);

  await expect(
    withoutEnrollment.asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica"),
    }),
  ).rejects.toThrow(/NIJE_UPISAN/);

  const t2 = convexTest(schema, modules);
  const blocked = await seedUser(t2, { blocked: true });
  await seedModel(t2);
  await grant(t2, blocked.userId, 100);

  await expect(
    blocked.asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica"),
    }),
  ).rejects.toThrow(/NIJE_UPISAN/);
});

test("neprijavljen korisnik ne može da rezerviše posao", async () => {
  const t = convexTest(schema, modules);
  await seedWorld(t);

  await expect(
    t.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("lisica") }),
  ).rejects.toThrow(/Unauthorized/);
});

test("neispravan JSON u params je odbijen pre moderacije i pre ledgera", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);

  await expect(
    asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: "nije json" }),
  ).rejects.toThrow(/NEISPRAVNI_PARAMETRI/);
  await expect(
    asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: "[1,2]" }),
  ).rejects.toThrow(/NEISPRAVNI_PARAMETRI/);

  expect((await ledger(t, userId)).balance).toBe(100);
});

// ── listMyJobs ─────────────────────────────────────────────────────────────

test("listMyJobs vraća samo svoje poslove, najnoviji prvi, bez internih polja", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);
  const stranac = await t.run((ctx) =>
    ctx.db.insert("users", { email: "drugi@example.com", name: "Drugi" }),
  );
  await t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId: stranac,
      modelSlug: MODEL_SLUG,
      kind: "image" as const,
      params: "{}",
      promptHash: "tudji",
      status: "reserved" as const,
      creditCost: MODEL_COST,
      createdAt: Date.now(),
    }),
  );

  const first = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("prvi"),
  });
  const second = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("drugi"),
  });
  await t.mutation(internal.studio.markJobRunning, { jobId: second, providerRequestId: "req_tajni" });

  const page = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
  });

  expect(page.page.map((job) => job._id)).toEqual([second, first]);
  expect(page.page[0]).not.toHaveProperty("falRequestId");
  expect(page.page[0]).not.toHaveProperty("actualCostUsd");
  expect(page.page[0]).not.toHaveProperty("userId");
  expect(page.page[0].status).toBe("running");
});

// ── sanitizacija parametara ────────────────────────────────────────────────

/** Ista šema koju `seed.ts` daje svakom modelu za slike. */
const IMAGE_SCHEMA = JSON.stringify([
  { key: "prompt", type: "textarea", label: "Prompt", required: true, maxLength: 2000 },
  {
    key: "aspect_ratio",
    type: "select",
    label: "Format",
    options: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  },
  { key: "num_images", type: "number", label: "Broj slika", min: 1, max: 4 },
]);

test("sanitizeParams odseca broj na min/max iz šeme", () => {
  expect(sanitizeParams(IMAGE_SCHEMA, { prompt: "lisica", num_images: 20 })).toEqual({
    ok: true,
    params: { prompt: "lisica", num_images: 4 },
  });
  // Ispod `min` se samo podiže: prazno polje u formi nije napad na fal račun.
  expect(sanitizeParams(IMAGE_SCHEMA, { prompt: "lisica", num_images: 0 })).toEqual({
    ok: true,
    params: { prompt: "lisica", num_images: 1 },
  });
  expect(sanitizeParams(IMAGE_SCHEMA, { prompt: "lisica", num_images: 3 })).toEqual({
    ok: true,
    params: { prompt: "lisica", num_images: 3 },
  });
});

test("sanitizeParams odbija broj koji je van reda veličine, umesto da ga odseče", () => {
  expect(sanitizeParams(IMAGE_SCHEMA, { prompt: "lisica", num_images: 200 })).toEqual({
    ok: false,
    reason: "VAN_OPSEGA:num_images",
  });
  // Nije broj - ispada kao i nepoznat ključ, pa važi podrazumevana vrednost.
  expect(sanitizeParams(IMAGE_SCHEMA, { prompt: "lisica", num_images: "4" })).toEqual({
    ok: true,
    params: { prompt: "lisica" },
  });
});

test("sanitizeParams tiho izbacuje ključ koji šema ne poznaje", () => {
  expect(
    sanitizeParams(IMAGE_SCHEMA, {
      prompt: "lisica",
      resolution: "4K",
      num_inference_steps: 50,
      image_size: "square_hd",
    }),
  ).toEqual({ ok: true, params: { prompt: "lisica" } });
});

test("sanitizeParams propušta select samo iz dozvoljenog skupa", () => {
  expect(sanitizeParams(IMAGE_SCHEMA, { prompt: "lisica", aspect_ratio: "16:9" })).toEqual({
    ok: true,
    params: { prompt: "lisica", aspect_ratio: "16:9" },
  });
  expect(sanitizeParams(IMAGE_SCHEMA, { prompt: "lisica", aspect_ratio: "32:9" })).toEqual({
    ok: false,
    reason: "NEDOZVOLJENA_VREDNOST:aspect_ratio",
  });
});

test("prazna šema propušta samo prompt; šema koja nije JSON niz se odbija", () => {
  expect(sanitizeParams("[]", { prompt: "lisica", num_images: 4, seed: 7 })).toEqual({
    ok: true,
    params: { prompt: "lisica" },
  });
  expect(sanitizeParams("{}", { prompt: "lisica" })).toEqual({
    ok: false,
    reason: "NEISPRAVNA_SEMA",
  });
  expect(sanitizeParams("nije json", { prompt: "lisica" })).toEqual({
    ok: false,
    reason: "NEISPRAVNA_SEMA",
  });
});

test("mockJobSucceeds: oko 85% od 2000 sintetičkih jobId-eva uspe, deterministički", () => {
  let successes = 0;
  for (let index = 0; index < 2000; index += 1) {
    if (mockJobSucceeds(`job_${index}`)) successes += 1;
  }
  const rate = successes / 2000;
  expect(rate).toBeGreaterThan(0.8);
  expect(rate).toBeLessThan(0.9);

  // Isti jobId poziv za pozivom daje isti ishod (nikad Math.random()).
  expect(mockJobSucceeds("job_42")).toBe(mockJobSucceeds("job_42"));
});

test("mockOutputDataUrl vraća SVG data URL sa promptom, bez mrežnog poziva", () => {
  const url = mockOutputDataUrl("lisica u snegu", "a1b2c3d4");
  expect(url.startsWith("data:image/svg+xml;utf8,")).toBe(true);
  const svg = decodeURIComponent(url.slice("data:image/svg+xml;utf8,".length));
  expect(svg).toContain("<svg");
  expect(svg).toContain("lisica u snegu");
  // Boja je izvedena iz hash-a, ne nasumična - isti hash daje isti SVG.
  expect(mockOutputDataUrl("lisica u snegu", "a1b2c3d4")).toBe(url);
  // Prazan prompt pada na "DEMO", a ne na prazan tekst čvor.
  expect(decodeURIComponent(mockOutputDataUrl("", "ffff0000").slice("data:image/svg+xml;utf8,".length))).toContain(
    "DEMO",
  );
});

test("computeMargin: nano-banana-2 iz STUDIO-PLAN §2.3 daje maržu blizu 2,9x", () => {
  // 20 kr = 0,20 €; nabavno $0,08 * 0,865 = 0,0692 € -> ~2,89x.
  const margin = computeMargin(20, 0.08);
  expect(margin).not.toBeNull();
  expect(margin!).toBeGreaterThan(2.8);
  expect(margin!).toBeLessThan(3);
});

test("computeMargin: nula ili negativna nabavna cena daje null, ne Infinity", () => {
  expect(computeMargin(20, 0)).toBeNull();
  expect(computeMargin(20, -0.01)).toBeNull();
});

test("dayStart vraća UTC ponoć dana kom `now` pripada", () => {
  const noon = Date.parse("2026-08-19T15:42:07.123Z");
  expect(dayStart(noon)).toBe(Date.parse("2026-08-19T00:00:00.000Z"));
  expect(dayKey(dayStart(noon))).toBe("2026-08-19");
});

test("createJob upisuje očišćene parametre - to je isto ono što ide fal-u", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedModel(t, { paramSchema: IMAGE_SCHEMA });
  await grant(t, userId, 100);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica u snegu", {
      num_images: 20,
      aspect_ratio: "16:9",
      // Rezolucija je deo identiteta skupljeg sluga; klijent je ne sme dizati.
      resolution: "4K",
    }),
  });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(JSON.parse(job?.params ?? "{}")).toEqual({
    prompt: "lisica u snegu",
    num_images: 4,
    aspect_ratio: "16:9",
  });
  // Odsečen `num_images` i dalje množi cenu: naplaćuje se ono što će fal
  // isporučiti (4 slike), ne ono što je klijent zatražio (20).
  expect(job?.creditCost).toBe(4 * MODEL_COST);
});

test("num_images: 4 naplaćuje 4x cenu iz kataloga - i u ledgeru i u dnevnom trošku", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedModel(t, { paramSchema: IMAGE_SCHEMA });
  await grant(t, userId, 200);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("cetiri lisice", { num_images: 4 }),
  });

  const { balance, transactions } = await ledger(t, userId);
  const job = await t.run((ctx) => ctx.db.get(jobId));
  // fal naplaćuje po IZLAZNOJ slici. Dok je cena bila fiksna po pozivu, marža
  // je padala ispod 1x već na trećoj slici, jednim klikom na strelicu gore.
  expect(job?.creditCost).toBe(4 * MODEL_COST);
  expect(balance).toBe(200 - 4 * MODEL_COST);
  expect(transactions.find((transaction) => transaction.type === "spend")?.amount).toBe(
    -4 * MODEL_COST,
  );

  const usage = await t.run((ctx) =>
    ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayKey(Date.now())))
      .unique(),
  );
  expect(usage?.creditsSpent).toBe(4 * MODEL_COST);
  // Plafon od 5 USD je bio plafon od 20 USD dok je ovo bilo `estimatedCostUsd`
  // po pozivu.
  expect(usage?.costUsd).toBeCloseTo(4 * MODEL_COST_USD);
});

test("odsutan num_images je jedna slika: cena i dnevni trošak ostaju 1x", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedModel(t, { paramSchema: IMAGE_SCHEMA });
  await grant(t, userId, 200);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("jedna lisica"),
  });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.creditCost).toBe(MODEL_COST);
  expect((await ledger(t, userId)).balance).toBe(200 - MODEL_COST);

  const usage = await t.run((ctx) =>
    ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayKey(Date.now())))
      .unique(),
  );
  expect(usage?.creditsSpent).toBe(MODEL_COST);
  expect(usage?.costUsd).toBeCloseTo(MODEL_COST_USD);
});

test("dnevni plafon troška računa pomnožen trošak, pa 4 slike obara isti posao koji jedna prolazi", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  // 2 USD po slici: jedna slika staje u plafon od 5 USD, četiri (8 USD) ne.
  await seedModel(t, {
    slug: "skupi-model",
    creditCost: 10,
    estimatedCostUsd: 2,
    paramSchema: IMAGE_SCHEMA,
  });
  await grant(t, userId, 200);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "skupi-model",
      params: promptParams("cetiri skupe", { num_images: 4 }),
    }),
  ).rejects.toThrow(/DNEVNI_LIMIT_TROSKA/);
  expect((await ledger(t, userId)).jobs).toHaveLength(0);

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "skupi-model",
    params: promptParams("jedna skupa", { num_images: 1 }),
  });
  expect((await ledger(t, userId)).jobs).toHaveLength(1);
});

test("computeCreditCost: num_images množi i granu sa costPerSecond", () => {
  const perCall = { creditCost: 20 };
  expect(computeCreditCost(perCall, { prompt: "x" })).toBe(20);
  expect(computeCreditCost(perCall, { prompt: "x", num_images: 3 })).toBe(60);
  // Vrednost koja nije upotrebljiv broj je jedna slika, nikad nula generacija.
  expect(computeCreditCost(perCall, { num_images: "4" })).toBe(20);
  expect(computeCreditCost(perCall, { num_images: 0 })).toBe(20);

  const perSecond = { creditCost: 4, costPerSecond: 4.5 };
  expect(computeCreditCost(perSecond, { duration: 6 })).toBe(27);
  expect(computeCreditCost(perSecond, { duration: 6, num_images: 2 })).toBe(54);
});

test("createJob odbija nedozvoljen select pre nego što skine ijedan kredit", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedModel(t, { paramSchema: IMAGE_SCHEMA });
  await grant(t, userId, 100);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica", { aspect_ratio: "32:9" }),
    }),
  ).rejects.toThrow(/NEISPRAVNI_PARAMETRI:NEDOZVOLJENA_VREDNOST:aspect_ratio/);

  const { balance, jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(0);
  expect(balance).toBe(100);
});

// ── dnevni limit troška (STUDIO-PLAN 4.4) ──────────────────────────────────

test("dnevni limit troška odbija posao koji bi prešao 5 USD tog dana", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedModel(t, { slug: "skupi-model", creditCost: 10, estimatedCostUsd: 2 });
  await grant(t, userId, 100);
  const day = dayKey(Date.now());

  const usageId = await t.run((ctx) =>
    ctx.db.insert("studioUsageDaily", {
      userId,
      day,
      generations: 3,
      creditsSpent: 30,
      costUsd: 4,
    }),
  );

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "skupi-model",
      params: promptParams("preko limita"),
    }),
  ).rejects.toThrow(/DNEVNI_LIMIT_TROSKA/);

  const blocked = await ledger(t, userId);
  expect(blocked.jobs).toHaveLength(0);
  expect(blocked.balance).toBe(100);
  expect(await t.run((ctx) => ctx.db.get(usageId))).toMatchObject({ costUsd: 4, generations: 3 });

  // Tačno na pragu se još prolazi - odbija se tek prelazak preko njega.
  await t.run((ctx) => ctx.db.patch(usageId, { costUsd: MAX_DAILY_COST_USD - 2 }));
  await asUser.mutation(api.studio.createJob, {
    modelSlug: "skupi-model",
    params: promptParams("tacno na pragu"),
  });

  const passed = await ledger(t, userId);
  expect(passed.jobs).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.get(usageId))).toMatchObject({
    costUsd: MAX_DAILY_COST_USD,
    generations: 4,
  });

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "skupi-model",
      params: promptParams("preko praga"),
    }),
  ).rejects.toThrow(/DNEVNI_LIMIT_TROSKA/);
});

test("dnevni limit troška je vezan za dan", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedModel(t, { slug: "skupi-model", creditCost: 10, estimatedCostUsd: 2 });
  await grant(t, userId, 100);

  await t.run((ctx) =>
    ctx.db.insert("studioUsageDaily", {
      userId,
      day: dayKey(Date.now() - 24 * 60 * 60 * 1000),
      generations: 5,
      creditsSpent: 50,
      costUsd: 10,
    }),
  );

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "skupi-model",
    params: promptParams("danasnja prva"),
  });

  expect((await ledger(t, userId)).jobs).toHaveLength(1);
});

// ── prelaz statusa (rizik b iz noćne revizije) ─────────────────────────────

test("markJobRunning odbija prelaz kad posao nije reserved", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica"),
  });
  // Zakasneli `markJobRunning` posle refunda bi korisniku dao i kredite i sliku.
  await t.mutation(internal.studio.failJob, { jobId, error: "reaper" });

  await expect(
    t.mutation(internal.studio.markJobRunning, { jobId, providerRequestId: "req_kasni" }),
  ).rejects.toThrow(/POSAO_NIJE_REZERVISAN:refunded/);

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("refunded");
  expect(job?.falRequestId).toBeUndefined();
  expect((await ledger(t, userId)).balance).toBe(100);
});

test("markJobRunning odbija i drugi poziv za isti posao", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica"),
  });
  await t.mutation(internal.studio.markJobRunning, { jobId, providerRequestId: "req_prvi" });

  await expect(
    t.mutation(internal.studio.markJobRunning, { jobId, providerRequestId: "req_drugi" }),
  ).rejects.toThrow(/POSAO_NIJE_REZERVISAN:running/);

  // `falRequestId` prve predaje ostaje - inače bi njen webhook ostao siroče.
  expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({ falRequestId: "req_prvi" });
});

// ── kontekst lekcije (STUDIO-PLAN 1.1) ─────────────────────────────────────

/**
 * Lekcija u kursu na koji korisnik ima pristup. `assertLessonAccess` traži
 * verifikovan email i objavljen kurs, pa se oboje seeduje - inače bi test
 * padao na proveri prava, a ne na onome što meri.
 */
async function seedLessonWorld(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_slug", (q) => q.eq("slug", "studio-course"))
      .unique();
    if (!course) throw new Error("Kurs iz seedUser nije pronađen.");
    await ctx.db.patch(userId, { appEmailVerificationTime: 1 });

    const lessonId = await ctx.db.insert("lessons", {
      courseId: course._id,
      slug: "lekcija-1",
      titleSr: "Lekcija",
      titleEn: "Lesson",
      summarySr: "Sažetak",
      summaryEn: "Summary",
      durationSeconds: 600,
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });
    const stepId = await ctx.db.insert("lessonSteps", {
      courseId: course._id,
      lessonId,
      slug: "korak-1",
      titleSr: "Korak",
      titleEn: "Step",
      bodySr: "Telo",
      bodyEn: "Body",
      outputKind: "image" as const,
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });
    const taskId = await ctx.db.insert("lessonTasks", {
      courseId: course._id,
      lessonId,
      stepId,
      promptSr: "Napravi sliku",
      promptEn: "Generate an image",
      required: true,
      completionMode: "automatic" as const,
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });

    return { courseId: course._id, lessonId, stepId, taskId };
  });
}

test("createJob upisuje lessonId i taskId na posao", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  const { lessonId, taskId } = await seedLessonWorld(t, userId);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica u snegu"),
    lessonId,
    taskId,
  });

  // Bez ove veze `persistOutput` nikad ne može da zeleni zadatak.
  expect(await t.run((ctx) => ctx.db.get(jobId))).toMatchObject({ lessonId, taskId });
});

test("createJob odbija zadatak koji nije u poslatoj lekciji, bez ijednog upisa", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  const { lessonId, courseId, stepId } = await seedLessonWorld(t, userId);
  const before = await ledger(t, userId);
  const tudjiTaskId = await t.run(async (ctx) => {
    const drugaLekcija = await ctx.db.insert("lessons", {
      courseId,
      slug: "lekcija-2",
      titleSr: "Druga",
      titleEn: "Second",
      summarySr: "Sažetak",
      summaryEn: "Summary",
      durationSeconds: 600,
      isPublished: true,
      sortOrder: 2,
      updatedAt: 1,
    });
    return ctx.db.insert("lessonTasks", {
      courseId,
      lessonId: drugaLekcija,
      stepId,
      promptSr: "Tudji zadatak",
      promptEn: "Other task",
      required: true,
      completionMode: "automatic" as const,
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });
  });

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
      lessonId,
      taskId: tudjiTaskId,
    }),
  ).rejects.toThrow(/ZADATAK_NIJE_U_LEKCIJI/);

  const after = await ledger(t, userId);
  expect(after.jobs).toHaveLength(0);
  expect(after.balance).toBe(before.balance);
});

test("createJob odbija taskId bez lessonId - labOutputs bez lekcije ne postoji", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  const { taskId } = await seedLessonWorld(t, userId);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
      taskId,
    }),
  ).rejects.toThrow(/ZADATAK_BEZ_LEKCIJE/);

  expect((await ledger(t, userId)).jobs).toHaveLength(0);
});

test("createJob odbija lekciju iz kursa koji korisnik ne sme da otvori", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  await seedLessonWorld(t, userId);
  const tudjaLekcijaId = await t.run(async (ctx) => {
    const tudjiKurs = await ctx.db.insert("courses", {
      slug: "tudji-kurs",
      titleSr: "Tudji",
      titleEn: "Other",
      subtitleSr: "Podnaslov",
      subtitleEn: "Subtitle",
      descriptionSr: "Opis",
      descriptionEn: "Description",
      // Neobjavljen kurs: `requireCourseAccess` ga ne propušta.
      status: "draft" as const,
      sortOrder: 2,
      updatedAt: 1,
    });
    return ctx.db.insert("lessons", {
      courseId: tudjiKurs,
      slug: "tudja-lekcija",
      titleSr: "Tudja",
      titleEn: "Other",
      summarySr: "Sažetak",
      summaryEn: "Summary",
      durationSeconds: 600,
      isPublished: true,
      sortOrder: 1,
      updatedAt: 1,
    });
  });

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
      lessonId: tudjaLekcijaId,
    }),
  ).rejects.toThrow(/Course not found/);

  expect((await ledger(t, userId)).jobs).toHaveLength(0);
});

// ── listMyJobs i getStudioState: ono što playground (P6) čita ───────────────

test("listMyJobs vraća potpisan URL izlaza, a ne samo storageId", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica u snegu"),
  });
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["slika"], { type: "image/png" }));
    await ctx.db.patch(jobId, { status: "done" as const, outputStorageId: storageId });
  });

  const page = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
  });

  expect(page.page).toHaveLength(1);
  expect(page.page[0].outputStorageId).toBeDefined();
  expect(typeof page.page[0].outputUrl).toBe("string");
  expect(page.page[0].outputUrl).toContain("http");
});

test("listMyJobs vraća outputUrl null dok fajla nema", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);

  await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica u snegu"),
  });

  const page = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(page.page[0].outputUrl).toBeNull();
});

test("listMyJobs označava mock posao, a pravi falRequestId ne izlazi napolje", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t, 200);

  const mockJobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("demo posao"),
  });
  const realJobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("pravi posao"),
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(mockJobId, { falRequestId: `mock-${mockJobId}` });
    await ctx.db.patch(realJobId, { falRequestId: "9d1f2c30-fal-request" });
  });

  const page = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  const byId = new Map(page.page.map((job) => [job._id, job]));
  expect(byId.get(mockJobId)?.isMock).toBe(true);
  expect(byId.get(realJobId)?.isMock).toBe(false);
  // DEMO značka je jedino što se iz `falRequestId`-ja izvodi; sam trag ka
  // fal-u i naša nabavna cena i dalje ostaju u backendu.
  for (const job of page.page) {
    expect(job).not.toHaveProperty("falRequestId");
    expect(job).not.toHaveProperty("actualCostUsd");
  }
});

test("listMyJobs vraća samo poslove prijavljenog korisnika", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);
  await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("moj posao"),
  });

  const drugi = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "drugi@example.com",
      name: "Drugi",
      username: "drugi",
      role: "student" as const,
      language: "sr" as const,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const asDrugi = t.withIdentity({ subject: drugi, tokenIdentifier: `test|${drugi}` });

  const page = await asDrugi.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(page.page).toHaveLength(0);
});

test("getStudioState: upaljen Studio, upisan korisnik, nijedan posao u letu", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);

  const state = await asUser.query(api.studio.getStudioState, {});
  expect(state).toEqual({ enabled: true, isEnrolled: true, activeJobs: 0, maxActiveJobs: 3 });
});

test("getStudioState čita kill switch isto kao createJob", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: "studio_enabled", enabled: false }));

  expect((await asUser.query(api.studio.getStudioState, {})).enabled).toBe(false);
  // UI koji panel zamenjuje porukom i server koji baca moraju da se slažu.
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).rejects.toThrow(/STUDIO_PAUZIRAN/);
});

test("getStudioState broji poslove u letu do iste granice na kojoj createJob staje", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t, 200);

  for (const prompt of ["prvi", "drugi", "treci"]) {
    await asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams(prompt) });
  }

  const state = await asUser.query(api.studio.getStudioState, {});
  expect(state.activeJobs).toBe(3);
  expect(state.activeJobs).toBeGreaterThanOrEqual(state.maxActiveJobs);
  // Dugme se gasi po istom pravilu po kojem bi server odbio četvrti posao.
  await expect(
    asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("cetvrti") }),
  ).rejects.toThrow(/PREVISE_POSLOVA/);
});

test("getStudioState broji i `running` posao, ne samo `reserved`", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t, 200);

  const prviId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("prvi"),
  });
  await asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("drugi") });
  // Posao koji je fal već primio i dalje drži jedno od tri mesta - kad se ne
  // bi brojao, dugme bi bilo upaljeno a `createJob` bi vratio PREVISE_POSLOVA.
  await t.run((ctx) => ctx.db.patch(prviId, { status: "running" as const, falRequestId: "fal-1" }));

  expect((await asUser.query(api.studio.getStudioState, {})).activeJobs).toBe(2);
});

test("getStudioState: završen posao više se ne broji u letu", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t, 200);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica u snegu"),
  });
  expect((await asUser.query(api.studio.getStudioState, {})).activeJobs).toBe(1);

  await t.run((ctx) => ctx.db.patch(jobId, { status: "done" as const }));
  expect((await asUser.query(api.studio.getStudioState, {})).activeJobs).toBe(0);
});

test("getStudioState prijavljuje neupisanog korisnika pre nego što klikne dugme", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t, { enrolled: false });
  await seedModel(t);

  const state = await asUser.query(api.studio.getStudioState, {});
  expect(state.isEnrolled).toBe(false);
  expect(state.enabled).toBe(true);
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).rejects.toThrow(/NIJE_UPISAN/);
});

test("getStudioState ne odgovara neprijavljenom korisniku", async () => {
  const t = convexTest(schema, modules);
  await seedWorld(t);

  await expect(t.query(api.studio.getStudioState, {})).rejects.toThrow();
});

// ── listMyJobs filteri (galerija, P7) ───────────────────────────────────────

test("listMyJobs filtrira po kind, modelSlug i createdAfter", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t, 200);
  await seedModel(t, { slug: "video-model", kind: "video", costPerSecond: undefined, creditCost: 40 });

  const oldJobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("stari posao"),
  });
  await t.run((ctx) => ctx.db.patch(oldJobId, { createdAt: 1000 }));

  const imageJobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("nov posao"),
  });
  const videoJobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: "video-model",
    params: promptParams("video posao"),
  });

  const onlyVideo = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
    kind: "video",
  });
  expect(onlyVideo.page.map((job) => job._id)).toEqual([videoJobId]);

  const onlyModel = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
    modelSlug: MODEL_SLUG,
  });
  expect(onlyModel.page.map((job) => job._id).sort()).toEqual([imageJobId, oldJobId].sort());

  const onlyRecent = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
    createdAfter: 5000,
  });
  expect(onlyRecent.page.map((job) => job._id).sort()).toEqual([imageJobId, videoJobId].sort());

  const combined = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
    kind: "image",
    createdAfter: 5000,
  });
  expect(combined.page.map((job) => job._id)).toEqual([imageJobId]);
});

// ── deleteJob (galerija, P7) ─────────────────────────────────────────────────

test("deleteJob briše posao i fajl iz storage-a", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica"),
  });
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["slika"], { type: "image/png" }));
    await ctx.db.patch(jobId, { status: "done" as const, outputStorageId: id });
    return id;
  });

  await asUser.mutation(api.studio.deleteJob, { jobId });

  expect(await t.run((ctx) => ctx.db.get(jobId))).toBeNull();
  expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
});

test("deleteJob odbija posao koji je još u letu", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);

  const reservedId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica"),
  });
  await expect(asUser.mutation(api.studio.deleteJob, { jobId: reservedId })).rejects.toThrow(
    /POSAO_U_TOKU/,
  );

  await t.mutation(internal.studio.markJobRunning, { jobId: reservedId, providerRequestId: "req_1" });
  await expect(asUser.mutation(api.studio.deleteJob, { jobId: reservedId })).rejects.toThrow(
    /POSAO_U_TOKU/,
  );
  expect(await t.run((ctx) => ctx.db.get(reservedId))).not.toBeNull();
});

test("deleteJob odbija posao povezan sa lekcijom, da dokaz zadatka ne nestane", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  const { lessonId, taskId } = await seedLessonWorld(t, userId);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica u snegu"),
    lessonId,
    taskId,
  });
  const { courseId, storageId } = await t.run(async (ctx) => {
    const lesson = await ctx.db.get(lessonId);
    const id = await ctx.storage.store(new Blob(["slika"], { type: "image/png" }));
    await ctx.db.patch(jobId, { status: "done" as const, outputStorageId: id });
    return { courseId: lesson!.courseId, storageId: id };
  });
  // `finalizeOutput` (P3) je van dosega ovog testa (traži pravu fal predaju);
  // `labOutputId` se ovde postavlja ručno da se proveri isključivo `deleteJob`.
  const labOutputId = await t.run((ctx) =>
    ctx.db.insert("labOutputs", {
      userId,
      courseId,
      lessonId,
      taskId,
      kind: "image" as const,
      status: "ready" as const,
      title: "Lisica",
      storageId,
      byteSize: 5,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.run((ctx) => ctx.db.patch(jobId, { labOutputId }));

  await expect(asUser.mutation(api.studio.deleteJob, { jobId })).rejects.toThrow(
    /POSAO_POVEZAN_SA_LEKCIJOM/,
  );
  expect(await t.run((ctx) => ctx.db.get(jobId))).not.toBeNull();
});

test("deleteJob odbija tudji posao i nepostojeći posao", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);
  const other = await seedUser(t);
  await grant(t, other.userId, 100);

  const jobId = await other.asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("tudji"),
  });
  await t.run((ctx) => ctx.db.patch(jobId, { status: "done" as const }));

  await expect(asUser.mutation(api.studio.deleteJob, { jobId })).rejects.toThrow(
    /Posao nije pronađen/,
  );
});
