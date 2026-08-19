/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { dayKey } from "./studioCore";

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
      defaultParams: JSON.stringify({ aspect_ratio: "1:1" }),
      paramSchema: "[]",
      creditCost: overrides.creditCost ?? MODEL_COST,
      costPerSecond: overrides.costPerSecond,
      estimatedCostUsd: MODEL_COST_USD,
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
  // `params` se čuvaju doslovno - `submitJob` ih prosleđuje fal-u.
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
  await t.mutation(internal.studio.markJobRunning, { jobId: jobIds[0], falRequestId: "req_1" });
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

test("markJobRunning postavlja status running i falRequestId", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica"),
  });
  await t.mutation(internal.studio.markJobRunning, { jobId, falRequestId: "req_1" });

  const job = await t.run((ctx) => ctx.db.get(jobId));
  expect(job?.status).toBe("running");
  expect(job?.falRequestId).toBe("req_1");
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
  await t.mutation(internal.studio.markJobRunning, { jobId: second, falRequestId: "req_tajni" });

  const page = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
  });

  expect(page.page.map((job) => job._id)).toEqual([second, first]);
  expect(page.page[0]).not.toHaveProperty("falRequestId");
  expect(page.page[0]).not.toHaveProperty("actualCostUsd");
  expect(page.page[0]).not.toHaveProperty("userId");
  expect(page.page[0].status).toBe("running");
});
