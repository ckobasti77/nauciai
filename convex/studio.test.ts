/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  computeCreditCost,
  computeMargin,
  dayKey,
  dayStart,
  hasStudioAccess,
  isStudioStaff,
  MAX_DAILY_COST_USD,
  mockJobSucceeds,
  mockOutputDataUrl,
  providerKeyPresent,
  providerStatus,
  ownerHandle,
  sanitizeParams,
} from "./studioCore";

const modules = import.meta.glob("./**/*.ts");

// Uloga `admin` ne dolazi iz reda u `users` nego iz `INITIAL_ADMIN_EMAILS`
// (`effectiveRoleForProfile` u `helpers.ts` prima samo `student`, `pro_student`
// i `moderator` iz baze). Isti obrazac kao `creditPacks.test.ts`.
const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;

beforeAll(() => {
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
});

afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

/** Slug jedinog uključenog modela u testovima; fiksna cena 20 kredita. */
const MODEL_SLUG = "flux-2-flash";
const MODEL_COST = 20;
const MODEL_COST_USD = 0.005;

function promptParams(prompt: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ prompt, ...extra });
}

async function seedUser(
  t: TestConvex,
  opts: {
    enrolled?: boolean;
    blocked?: boolean;
    role?: "student" | "moderator" | "admin";
    email?: string;
    username?: string;
    /**
     * Pečat o prihvatanju uslova Studija (X7). Podrazumevano JE prihvaćen, jer
     * je to zatečeno stanje svakog korisnika koji je već prošao kapiju - test
     * koji meri nešto drugo ne treba da je prolazi ponovo. Testovi same kapije
     * ga isključuju sa `acceptedTerms: false`.
     */
    acceptedTerms?: boolean;
  } = {},
) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: opts.email ?? "student@example.com",
      name: "Studio Student",
      username: opts.username ?? "studio_student",
      role: opts.role ?? "student",
      language: "sr" as const,
      ...(opts.acceptedTerms === false ? {} : { acceptedStudioTermsAt: 1 }),
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

/**
 * Puna postavka za srećan tok: uključen model, krediti, i korisnik koji SME u
 * Studio. Dok je `STUDIO_STAFF_ONLY` upaljeno, sam upis to više ne obezbeđuje
 * (vidi "kill switch i enrollment" i "W1" ispod) - zato je ovde `moderator`,
 * ne obican `student`. Testovi kojima treba baš NEupisan/NEosoblje glumac
 * zovu `seedUser` direktno, sa svojom ulogom.
 */
async function seedWorld(t: TestConvex, credits = 100) {
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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
  // Stari `modelCatalog` ide isključivo na fal (katalog §7) - poller ovo polje
  // koristi da SAMO google poslove ispituje (nalaz W7-6, `by_provider_status`).
  expect(jobs[0].provider).toBe("fal");
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
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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
  ).rejects.toThrow(/NEMA_PRISTUPA/);

  const t2 = convexTest(schema, modules);
  const blocked = await seedUser(t2, { blocked: true });
  await seedModel(t2);
  await grant(t2, blocked.userId, 100);

  await expect(
    blocked.asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica"),
    }),
  ).rejects.toThrow(/NEMA_PRISTUPA/);
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
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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
  const { userId, asUser } = await seedUser(t, { role: "moderator" });
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

test("getStudioState: upaljen Studio, osoblje bez posla u letu", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedWorld(t);

  const state = await asUser.query(api.studio.getStudioState, {});
  expect(state).toEqual({
    enabled: true,
    hasStudioAccess: true,
    hasAcceptedTerms: true,
    isStaff: true,
    isStudioAdmin: false,
    activeJobs: 0,
    maxActiveJobs: 3,
    providerStatus: providerStatus(process.env),
  });
});

test("upisan korisnik bez uloge NE prolazi dok je STUDIO_STAFF_ONLY upaljen - server i UI se slažu", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t, { role: "student" });
  await seedModel(t);
  await grant(t, userId, 100);

  const state = await asUser.query(api.studio.getStudioState, {});
  expect(state.hasStudioAccess).toBe(false);
  expect(state.isStaff).toBe(false);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).rejects.toThrow(/NEMA_PRISTUPA/);

  expect((await ledger(t, userId)).jobs).toHaveLength(0);
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
  expect(state.hasStudioAccess).toBe(false);
  expect(state.enabled).toBe(true);
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).rejects.toThrow(/NEMA_PRISTUPA/);
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
  const other = await seedUser(t, { role: "moderator" });
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

// ── deleteJob i ulazni fajlovi (X6, nalaz N7) ──────────────────────────────

/**
 * Upload prijavljen na korisnika, direktno u bazi - isti oblik reda kao
 * `registerInputUpload`, bez celog puta uploada koji ovim testovima ne treba.
 */
async function seedRegisteredUpload(t: TestConvex, userId: Id<"users">, bytes = "slika") {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
    const uploadId = await ctx.db.insert("studioUploads", {
      userId,
      storageId,
      slot: "image",
      bytes: bytes.length,
      createdAt: 1,
      // Ušao je u posao - `createJob` bi ovde sklonio rok.
      expiresAt: undefined,
    });
    return { storageId, uploadId };
  });
}

/** Posao v4 kataloga upisan direktno, sa ulazom u dati slot - `deleteJob` ne zna niti mari za katalog. */
async function seedJobWithInput(
  t: TestConvex,
  userId: Id<"users">,
  storageId: Id<"_storage">,
  opts: { status?: "done" | "failed" | "refunded" } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "nano-banana-2",
      kind: "image" as const,
      params: JSON.stringify({ prompt: "spoji" }),
      promptHash: "0123456789abcdef",
      status: opts.status ?? ("done" as const),
      creditCost: 20,
      inputs: JSON.stringify({ image: [storageId] }),
      createdAt: 1,
    }),
  );
}

test("deleteJob briše ulaz koji koristi samo taj posao", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  const { storageId, uploadId } = await seedRegisteredUpload(t, userId);
  const jobId = await seedJobWithInput(t, userId, storageId);

  await asUser.mutation(api.studio.deleteJob, { jobId });

  expect(await t.run((ctx) => ctx.db.get(jobId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(uploadId))).toBeNull();
  expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
});

test("deleteJob NE briše ulaz koji koristi i drugi posao istog korisnika", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  const { storageId, uploadId } = await seedRegisteredUpload(t, userId);
  // Isti storageId u dva posla - "Generiši ponovo" nad istim fajlom.
  const jobId = await seedJobWithInput(t, userId, storageId);
  const otherJobId = await seedJobWithInput(t, userId, storageId);

  await asUser.mutation(api.studio.deleteJob, { jobId });

  expect(await t.run((ctx) => ctx.db.get(jobId))).toBeNull();
  // Drugi posao i njegov ulaz su netaknuti.
  expect(await t.run((ctx) => ctx.db.get(otherJobId))).not.toBeNull();
  expect(await t.run((ctx) => ctx.db.get(uploadId))).not.toBeNull();
  expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
});

// ── W1: pristup bez upisa i pregled tudjih poslova ─────────────────────────

test("hasStudioAccess: dok je STUDIO_STAFF_ONLY upaljen, upis ništa ne menja - samo uloga osoblja ulazi", () => {
  // Upis više NE pušta - Studio je zatvoreno testiranje (STUDIO_STAFF_ONLY).
  expect(hasStudioAccess("student", { _id: "enr" })).toBe(false);
  expect(hasStudioAccess("student", null)).toBe(false);
  expect(hasStudioAccess("pro_student", { _id: "enr" })).toBe(false);
  expect(hasStudioAccess(undefined, undefined)).toBe(false);
  // Admin i moderator i dalje ulaze, upisani ili ne - fleg proverava SAMO ulogu.
  expect(hasStudioAccess("admin", null)).toBe(true);
  expect(hasStudioAccess("moderator", null)).toBe(true);
  expect(hasStudioAccess("admin", { _id: "enr" })).toBe(true);
  expect(hasStudioAccess("moderator", { _id: "enr" })).toBe(true);

  expect(isStudioStaff("admin")).toBe(true);
  expect(isStudioStaff("moderator")).toBe(true);
  expect(isStudioStaff("pro_student")).toBe(false);
  expect(isStudioStaff(undefined)).toBe(false);
});

async function seedStaff(t: TestConvex, role: "admin" | "moderator", credits = 100) {
  const seeded = await seedUser(t, {
    enrolled: false,
    role,
    email: `${role}@example.com`,
    username: `studio_${role}`,
  });
  await grant(t, seeded.userId, credits);
  return seeded;
}

test("admin bez upisa pravi posao - i plaća ga kao svi ostali", async () => {
  const t = convexTest(schema, modules);
  await seedModel(t);
  const admin = await seedStaff(t, "admin");

  const jobId = await admin.asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica u snegu"),
  });

  const { balance, transactions, jobs } = await ledger(t, admin.userId);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]._id).toBe(jobId);
  // Pristup nije popust: skinuto je tačno onoliko koliko bi bilo i korisniku.
  const spend = transactions.filter((transaction) => transaction.type === "spend");
  expect(spend).toHaveLength(1);
  expect(spend[0].amount).toBe(-MODEL_COST);
  expect(balance).toBe(100 - MODEL_COST);
});

test("moderator bez upisa pravi posao, a obican korisnik bez upisa i dalje ne", async () => {
  const t = convexTest(schema, modules);
  await seedModel(t);
  const moderator = await seedStaff(t, "moderator");

  await expect(
    moderator.asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica"),
    }),
  ).resolves.toBeDefined();

  const student = await seedUser(t, {
    enrolled: false,
    email: "neupisan@example.com",
    username: "studio_neupisan",
  });
  await grant(t, student.userId, 100);
  await expect(
    student.asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica"),
    }),
  ).rejects.toThrow(/NEMA_PRISTUPA/);
});

test("getStudioState pušta admina bez upisa i prijavljuje ga kao osoblje", async () => {
  const t = convexTest(schema, modules);
  await seedModel(t);
  const admin = await seedStaff(t, "admin");

  const state = await admin.asUser.query(api.studio.getStudioState, {});
  expect(state.hasStudioAccess).toBe(true);
  expect(state.isStaff).toBe(true);
  expect(state.isStudioAdmin).toBe(true);

  // Moderator je osoblje, ali nije admin - dugme "Prikazi detalje" ne dobija (X4).
  const moderator = await seedStaff(t, "moderator");
  const moderatorState = await moderator.asUser.query(api.studio.getStudioState, {});
  expect(moderatorState.isStaff).toBe(true);
  expect(moderatorState.isStudioAdmin).toBe(false);
});

/** Red posla bez `createJob`-a: query se testira nad zadatim vlasnikom, slugom i statusom. */
async function insertJob(
  t: TestConvex,
  userId: Id<"users">,
  overrides: {
    modelSlug: string;
    status: "reserved" | "running" | "done" | "failed" | "refunded";
    createdAt: number;
    prompt?: string;
    inputs?: string;
  },
) {
  return t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: overrides.modelSlug,
      kind: "image" as const,
      params: JSON.stringify({ prompt: overrides.prompt ?? "posao" }),
      promptHash: "0".repeat(16),
      status: overrides.status,
      creditCost: 10,
      ...(overrides.inputs ? { inputs: overrides.inputs } : {}),
      createdAt: overrides.createdAt,
    }),
  );
}

/** Minimalan red v4 kataloga - `listAllJobs` iz njega čita samo `slug` i `provider`. */
async function insertCatalogModel(
  t: TestConvex,
  slug: string,
  provider: "fal" | "google" | "byteplus",
) {
  return t.run((ctx) =>
    ctx.db.insert("models", {
      slug,
      provider,
      kind: "image" as const,
      family: "test",
      labelSr: slug,
      labelEn: slug,
      taglineSr: "",
      taglineEn: "",
      descriptionSr: "",
      descriptionEn: "",
      endpoints: "{}",
      inputModes: JSON.stringify(["text"]),
      inputSpec: "{}",
      paramSpec: "[]",
      priceRule: "{}",
      capabilities: "{}",
      isEnabled: true,
      sortOrder: 1,
      updatedAt: 1,
    }),
  );
}

test("listAllJobs: admin vidi tudje poslove sa mejlom vlasnika i provajderom", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedWorld(t);
  const admin = await seedStaff(t, "admin");
  await insertCatalogModel(t, "m-fal", "fal");

  await insertJob(t, userId, { modelSlug: "m-fal", status: "done", createdAt: 1_000 });
  await insertJob(t, admin.userId, { modelSlug: "m-fal", status: "failed", createdAt: 2_000 });

  const page = await admin.asUser.query(api.studio.listAllJobs, {
    paginationOpts: { numItems: 10, cursor: null },
  });

  expect(page.page).toHaveLength(2);
  expect([...page.page].map((job) => job.ownerEmail).sort()).toEqual([
    "admin@example.com",
    "student@example.com",
  ]);
  expect(page.page.every((job) => job.provider === "fal")).toBe(true);
  // Najnoviji prvi - isti poredak koji `listMyJobs` daje za jedan nalog.
  expect(page.page[0].createdAt).toBeGreaterThanOrEqual(page.page[1].createdAt);
});

test("listAllJobs filtrira po korisniku, statusu i provajderu", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedWorld(t);
  const admin = await seedStaff(t, "admin");
  await insertCatalogModel(t, "m-fal", "fal");
  await insertCatalogModel(t, "m-google", "google");

  await insertJob(t, userId, { modelSlug: "m-fal", status: "done", createdAt: 1_000 });
  await insertJob(t, userId, { modelSlug: "m-google", status: "running", createdAt: 2_000 });
  await insertJob(t, admin.userId, { modelSlug: "m-fal", status: "failed", createdAt: 3_000 });

  const opts = { numItems: 10, cursor: null };
  const byUser = await admin.asUser.query(api.studio.listAllJobs, { paginationOpts: opts, userId });
  expect(byUser.page).toHaveLength(2);
  expect(byUser.page.every((job) => job.ownerEmail === "student@example.com")).toBe(true);
  // `by_user` indeks nosi `createdAt`, pa je poredak ovde tvrd.
  expect(byUser.page.map((job) => job.createdAt)).toEqual([2_000, 1_000]);

  const byStatus = await admin.asUser.query(api.studio.listAllJobs, {
    paginationOpts: opts,
    status: "running",
  });
  expect(byStatus.page).toHaveLength(1);
  expect(byStatus.page[0].modelSlug).toBe("m-google");
  expect(byStatus.page[0].provider).toBe("google");

  const byProvider = await admin.asUser.query(api.studio.listAllJobs, {
    paginationOpts: opts,
    provider: "fal",
  });
  expect(byProvider.page.map((job) => job.modelSlug)).toEqual(["m-fal", "m-fal"]);

  // Dva filtera se seku, ne sabiraju.
  const crossed = await admin.asUser.query(api.studio.listAllJobs, {
    paginationOpts: opts,
    provider: "google",
    status: "done",
  });
  expect(crossed.page).toHaveLength(0);

  // Provajder bez ijednog modela u katalogu vraća praznu stranu, ne sve poslove.
  const empty = await admin.asUser.query(api.studio.listAllJobs, {
    paginationOpts: opts,
    provider: "byteplus",
  });
  expect(empty.page).toHaveLength(0);
  expect(empty.isDone).toBe(true);
});

test("listAllJobs i listJobOwners su iza uloge na SERVERU, ne u UI-ju", async () => {
  const t = convexTest(schema, modules);
  // `seedWorld` je osoblje (STUDIO_STAFF_ONLY) - ovom testu treba baš OBICAN
  // korisnik, pa ide direktno preko `seedUser` (podrazumevana uloga `student`).
  const { userId, asUser } = await seedUser(t);
  await insertCatalogModel(t, "m-fal", "fal");
  const jobId = await insertJob(t, userId, { modelSlug: "m-fal", status: "done", createdAt: 1_000 });

  const opts = { numItems: 10, cursor: null };
  await expect(asUser.query(api.studio.listAllJobs, { paginationOpts: opts })).rejects.toThrow(
    /Forbidden/,
  );
  await expect(asUser.query(api.studio.listJobOwners, {})).rejects.toThrow(/Forbidden/);
  await expect(t.query(api.studio.listAllJobs, { paginationOpts: opts })).rejects.toThrow();

  // Ni sopstveni posao: `revealJobDetail` je alat moderacije, ne jos jedan put
  // do svojih parametara (X4). Obican korisnik na sve tri dobija Forbidden.
  await expect(asUser.mutation(api.studio.revealJobDetail, { jobId })).rejects.toThrow(/Forbidden/);
  await expect(t.mutation(api.studio.revealJobDetail, { jobId })).rejects.toThrow();

  // Ista tabela kroz korisnički upit i dalje vraća samo svoje.
  const mine = await asUser.query(api.studio.listMyJobs, { paginationOpts: opts });
  expect(mine.page).toHaveLength(1);
});

// -- X4: dva nivoa uvida u tudje poslove (nalaz N1) -------------------------

/** Posao sa jednim stvarnim okacenim fajlom - `inputThumbs` se tada stvarno potpisuju. */
async function insertJobWithInput(
  t: TestConvex,
  userId: Id<"users">,
  overrides: { modelSlug: string; createdAt: number; prompt: string },
) {
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["lice"], { type: "image/png" })),
  );

  return insertJob(t, userId, {
    modelSlug: overrides.modelSlug,
    status: "done",
    createdAt: overrides.createdAt,
    prompt: overrides.prompt,
    inputs: JSON.stringify({ image: [storageId] }),
  });
}

test("listAllJobs: moderator dobija red bez prompta i bez ulaznih slicica, admin pun red", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedWorld(t);
  const admin = await seedStaff(t, "admin");
  const moderator = await seedStaff(t, "moderator");
  await insertCatalogModel(t, "m-fal", "fal");
  await insertJobWithInput(t, userId, {
    modelSlug: "m-fal",
    createdAt: 1_000,
    prompt: "moj privatan prompt",
  });

  const opts = { numItems: 10, cursor: null };

  const forModerator = await moderator.asUser.query(api.studio.listAllJobs, {
    paginationOpts: opts,
  });
  expect(forModerator.page).toHaveLength(1);
  const moderatorRow = forModerator.page[0];
  // Podatak koji ne izadje iz Convex-a ne moze da iscuri: polja NEMA, nije prazno.
  expect(moderatorRow.params).toBeUndefined();
  expect(moderatorRow.inputThumbs).toBeUndefined();
  expect(JSON.stringify(moderatorRow)).not.toContain("moj privatan prompt");
  // Ono sto moderacija trazi je i dalje tu: model, provajder, status, kredit,
  // vlasnik, vreme i izlaz.
  expect(moderatorRow.modelSlug).toBe("m-fal");
  expect(moderatorRow.provider).toBe("fal");
  expect(moderatorRow.status).toBe("done");
  expect(moderatorRow.creditCost).toBe(10);
  expect(moderatorRow.ownerEmail).toBe("student@example.com");
  expect(moderatorRow.createdAt).toBe(1_000);
  expect(moderatorRow).toHaveProperty("outputUrl");

  const forAdmin = await admin.asUser.query(api.studio.listAllJobs, { paginationOpts: opts });
  const adminRow = forAdmin.page[0];
  expect(adminRow.params).toContain("moj privatan prompt");
  expect(adminRow.inputThumbs?.total).toBe(1);
});

test("revealJobDetail: moderatoru Forbidden, adminu prompt i ulazi", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedWorld(t);
  const admin = await seedStaff(t, "admin");
  const moderator = await seedStaff(t, "moderator");
  await insertCatalogModel(t, "m-fal", "fal");
  const jobId = await insertJobWithInput(t, userId, {
    modelSlug: "m-fal",
    createdAt: 1_000,
    prompt: "lisica u snegu",
  });

  await expect(moderator.asUser.mutation(api.studio.revealJobDetail, { jobId })).rejects.toThrow(
    /Forbidden/,
  );
  // Odbijen poziv ne sme da ostavi red - dnevnik bi inace brojao i pokusaje.
  expect(await t.run((ctx) => ctx.db.query("studioAuditLog").collect())).toHaveLength(0);

  const detail = await admin.asUser.mutation(api.studio.revealJobDetail, { jobId });
  expect(JSON.parse(detail.params).prompt).toBe("lisica u snegu");
  expect(detail.inputThumbs.items).toHaveLength(1);
  expect(detail.inputThumbs.items[0].slot).toBe("image");
  expect(detail.inputThumbs.items[0].url).not.toBeNull();
});

test("revealJobDetail: svako otkrivanje upisuje tacno jedan red u studioAuditLog", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedWorld(t);
  const admin = await seedStaff(t, "admin");
  await insertCatalogModel(t, "m-fal", "fal");
  const withInput = await insertJobWithInput(t, userId, {
    modelSlug: "m-fal",
    createdAt: 1_000,
    prompt: "sa ulazom",
  });
  const withoutInput = await insertJob(t, userId, {
    modelSlug: "m-fal",
    status: "done",
    createdAt: 2_000,
    prompt: "bez ulaza",
  });

  await admin.asUser.mutation(api.studio.revealJobDetail, { jobId: withInput });
  const afterFirst = await t.run((ctx) => ctx.db.query("studioAuditLog").collect());
  expect(afterFirst).toHaveLength(1);
  expect(afterFirst[0].actorId).toBe(admin.userId);
  expect(afterFirst[0].jobId).toBe(withInput);
  expect(afterFirst[0].ownerId).toBe(userId);
  expect(afterFirst[0].revealed).toEqual(["params", "inputs"]);

  // Drugi klik na ISTI posao je drugi pristup, dakle drugi red - dnevnik se ne
  // deduplikuje, inace bi drugo gledanje bilo nevidljivo.
  await admin.asUser.mutation(api.studio.revealJobDetail, { jobId: withInput });
  await admin.asUser.mutation(api.studio.revealJobDetail, { jobId: withoutInput });
  const all = await t.run((ctx) => ctx.db.query("studioAuditLog").collect());
  expect(all).toHaveLength(3);
  // Posao bez okacenih fajlova otkriva samo parametre, i tako i stoji u dnevniku.
  expect(all.filter((row) => row.jobId === withoutInput)[0].revealed).toEqual(["params"]);

  // Oba indeksa vracaju svoje redove kroz svoju putanju.
  const byActor = await t.run((ctx) =>
    ctx.db
      .query("studioAuditLog")
      .withIndex("by_actor", (q) => q.eq("actorId", admin.userId))
      .collect(),
  );
  expect(byActor).toHaveLength(3);
  const byJob = await t.run((ctx) =>
    ctx.db
      .query("studioAuditLog")
      .withIndex("by_job", (q) => q.eq("jobId", withInput))
      .collect(),
  );
  expect(byJob).toHaveLength(2);
});

test("listJobOwners: moderator dobija otisak bez ijednog znaka @, admin mejl", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedWorld(t);
  const admin = await seedStaff(t, "admin");
  const moderator = await seedStaff(t, "moderator");
  await insertCatalogModel(t, "m-fal", "fal");
  await insertJob(t, userId, { modelSlug: "m-fal", status: "done", createdAt: 1_000 });
  await insertJob(t, admin.userId, { modelSlug: "m-fal", status: "done", createdAt: 2_000 });

  const forModerator = await moderator.asUser.query(api.studio.listJobOwners, {});
  expect(forModerator).toHaveLength(2);
  expect(JSON.stringify(forModerator)).not.toContain("@");
  // Otisak je stabilan i razlicit po korisniku - filter po njemu i dalje radi.
  expect(forModerator.map((owner) => owner.label).sort()).toEqual(
    [ownerHandle(admin.userId), ownerHandle(userId)].sort(),
  );
  expect(new Set(forModerator.map((owner) => owner.label)).size).toBe(2);
  expect(forModerator.every((owner) => owner.label.length === 6)).toBe(true);

  const forAdmin = await admin.asUser.query(api.studio.listJobOwners, {});
  expect(forAdmin.map((owner) => owner.label)).toEqual([
    "admin@example.com",
    "student@example.com",
  ]);
});

test("listJobOwners adminu vraća vlasnike sa mejlom i brojem poslova, sortirane po mejlu", async () => {
  const t = convexTest(schema, modules);
  const { userId } = await seedWorld(t);
  const admin = await seedStaff(t, "admin");
  await insertCatalogModel(t, "m-fal", "fal");

  await insertJob(t, userId, { modelSlug: "m-fal", status: "done", createdAt: 1_000 });
  await insertJob(t, userId, { modelSlug: "m-fal", status: "done", createdAt: 2_000 });
  await insertJob(t, admin.userId, { modelSlug: "m-fal", status: "done", createdAt: 3_000 });

  const owners = await admin.asUser.query(api.studio.listJobOwners, {});
  expect(owners.map((owner) => owner.label)).toEqual(["admin@example.com", "student@example.com"]);
  expect(owners.map((owner) => owner.jobCount)).toEqual([1, 2]);
});

// ── 18. uslovi korišćenja pred prvim poslom (X7) ───────────────────────────

test("bez prihvaćenih uslova nema prvog posla - ni kredit se ne skine", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t, { role: "moderator", acceptedTerms: false });
  await seedModel(t);
  await grant(t, userId, 100);

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).rejects.toThrow(/USLOVI_NEPRIHVACENI/);

  const { balance, jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(0);
  expect(balance).toBe(100);
  // Ekran mora da zna isto što i server, inače forma stoji otvorena korisniku
  // kojem bi prvi klik svakako pao.
  expect((await asUser.query(api.studio.getStudioState, {})).hasAcceptedTerms).toBe(false);
});

test("posle prihvatanja uslova isti poziv prolazi", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t, { role: "moderator", acceptedTerms: false });
  await seedModel(t);
  await grant(t, userId, 100);

  await asUser.mutation(api.studio.acceptStudioTerms, {});

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica u snegu"),
  });

  const { balance, jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]._id).toBe(jobId);
  expect(balance).toBe(100 - MODEL_COST);
  expect((await asUser.query(api.studio.getStudioState, {})).hasAcceptedTerms).toBe(true);
});

test("pečat se upisuje jednom - drugo prihvatanje vraća isto vreme i ne pomera ga", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t, { acceptedTerms: false });

  const first = await asUser.mutation(api.studio.acceptStudioTerms, {});
  const second = await asUser.mutation(api.studio.acceptStudioTerms, {});

  expect(typeof first).toBe("number");
  // Datum pristanka je dokaz na koju je VERZIJU uslova pristanak dat; dokaz
  // koji se osvežava svakim klikom nije dokaz.
  expect(second).toBe(first);
  const stamp = await t.run(async (ctx) => (await ctx.db.get(userId))?.acceptedStudioTermsAt);
  expect(stamp).toBe(first);
});

test("ni admin ni moderator nisu izuzetak od uslova", async () => {
  for (const role of ["admin", "moderator"] as const) {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedUser(t, {
      role,
      enrolled: false,
      acceptedTerms: false,
      email: role === "admin" ? "admin@example.com" : "moderator@example.com",
    });
    await seedModel(t);
    await grant(t, userId, 100);

    await expect(
      asUser.mutation(api.studio.createJob, {
        modelSlug: MODEL_SLUG,
        params: promptParams("lisica u snegu"),
      }),
    ).rejects.toThrow(/USLOVI_NEPRIHVACENI/);

    await asUser.mutation(api.studio.acceptStudioTerms, {});
    await expect(
      asUser.mutation(api.studio.createJob, {
        modelSlug: MODEL_SLUG,
        params: promptParams("lisica u snegu"),
      }),
    ).resolves.toBeDefined();
  }
});

// ── 19. osporena i refundirana uplata zatvaraju Studio (X7) ────────────────

test("spor po kartici blokira nove poslove i posle dopune kredita", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  await t.run((ctx) =>
    ctx.db.insert("creditReversals", {
      eventId: "evt_dispute_1",
      userId,
      kind: "dispute" as const,
      revokedCredits: 500,
      stripeSessionId: "cs_spor",
      createdAt: Date.now(),
    }),
  );

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).rejects.toThrow(/SPOR_U_TOKU/);

  // Dopuna ne skida bravu: spor traje nedeljama i skida ga tek njegov ishod.
  await grant(t, userId, 5000);
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).rejects.toThrow(/SPOR_U_TOKU/);

  const { jobs } = await ledger(t, userId);
  expect(jobs).toHaveLength(0);
});

test("red o refundaciji ne blokira - blokira samo spor", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t);
  await t.run((ctx) =>
    ctx.db.insert("creditReversals", {
      eventId: "evt_refund_1",
      userId,
      kind: "refund" as const,
      revokedCredits: 500,
      stripeSessionId: "cs_refund",
      createdAt: Date.now(),
    }),
  );

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).resolves.toBeDefined();
});

test("negativan saldo zatvara Studio dok se ne poravna", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedWorld(t, 100);
  // Ovo je stanje koje `applyStripeReversal` ostavlja kad refundacija oduzme
  // kredite koji su već potrošeni: upotrebljivi lotovi postoje, a saldo je u
  // minusu. `applySpend` sam to ne bi uhvatio - on gleda lotove.
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (row) await ctx.db.patch(row._id, { balance: -20 });
  });

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).rejects.toThrow(/SALDO_U_MINUSU/);

  // Poravnanje: saldo nazad iznad nule i Studio radi.
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (row) await ctx.db.patch(row._id, { balance: 100 });
  });
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: MODEL_SLUG,
      params: promptParams("lisica u snegu"),
    }),
  ).resolves.toBeDefined();
});

// ── SP2: jedna mock kapija za sva tri provajdera ────────────────────────────

test("providerKeyPresent: prisustvo ključa po provajderu, STUDIO_MOCK=1 obara sve", () => {
  const env = { FAL_KEY: "k", GOOGLE_AI_API_KEY: "  ", BYTEPLUS_API_KEY: undefined };
  expect(providerKeyPresent("fal", env)).toBe(true);
  // Prazan/whitespace ključ nije ključ.
  expect(providerKeyPresent("google", env)).toBe(false);
  expect(providerKeyPresent("byteplus", env)).toBe(false);
  expect(providerStatus(env)).toEqual({ fal: true, google: false, byteplus: false });
  expect(providerStatus({ ...env, STUDIO_MOCK: "1" })).toEqual({ fal: false, google: false, byteplus: false });
  // Bilo koja druga vrednost STUDIO_MOCK-a nije override.
  expect(providerStatus({ ...env, STUDIO_MOCK: "0" }).fal).toBe(true);
});

test("mockOutputDataUrl: natpis 'DEMO · vrsta' stoji i kad prompt postoji", () => {
  const svg = decodeURIComponent(
    mockOutputDataUrl("lisica u snegu", "a1b2c3d4", "video").slice("data:image/svg+xml;utf8,".length),
  );
  expect(svg).toContain("DEMO · video");
  expect(svg).toContain("lisica u snegu");
});
