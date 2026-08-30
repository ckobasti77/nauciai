/// <reference types="vite/client" />

/**
 * RED-TEAM dokazni testovi (feat/studio-redteam).
 *
 * Cilj napadača: dobiti kredite/generacije koje NIJE platio, ili oboriti
 * rate-limit / moderaciju / bonus zaštitu. Svaki test je JEDAN vektor.
 *
 * Konvencija: test koji PROLAZI dokazuje ono što tvrdi njegov naslov.
 *   - "ZATVORENO": test izvede napad i pokaže da ODBRANA puca (napad odbijen /
 *     nema duplog kredita). Zeleno = vektor zatvoren.
 *   - "RUPA": test izvede napad i pokaže da napad USPEVA. Zeleno = rupa postoji.
 *
 * Empirijski utvrđeno (probe u ovom runu): convex-test@0.0.54 POŠTUJE OCC -
 * dve istovremene mutacije koje čitaju-pa-pišu iste redove se sudaraju i jedna
 * se ponavlja (dva istovremena spendCredits od 20 nad balansom 20 => tačno
 * jedan prolazi, balans nikad ne ode u minus). Zato su V1/V7 trke DOKAZIVO
 * zatvorene u ovom harness-u.
 */

import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { canonicalizeEmailForAntiFarm, validatePrompt } from "./creditsCore";

const modules = import.meta.glob("./**/*.ts");

const previousAdmins = process.env.INITIAL_ADMIN_EMAILS;
beforeAll(() => {
  process.env.INITIAL_ADMIN_EMAILS = "admin@example.com";
});
afterAll(() => {
  if (previousAdmins === undefined) delete process.env.INITIAL_ADMIN_EMAILS;
  else process.env.INITIAL_ADMIN_EMAILS = previousAdmins;
});

const MODEL_SLUG = "flux-2-flash";
const MODEL_COST = 20;
const MODEL_COST_USD = 0.005;

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

function promptParams(prompt: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ prompt, ...extra });
}

async function seedUser(
  t: TestConvex,
  opts: {
    enrolled?: boolean;
    role?: "student" | "moderator" | "admin";
    email?: string;
    username?: string;
    emailVerified?: boolean;
    acceptedTerms?: boolean;
  } = {},
) {
  const email = opts.email ?? "student@example.com";
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert("users", {
      email,
      // Kao pravi signup (helpers.upsertProfileFromAuthUser): anti-farm ključ se
      // upisuje uz email, pa alias-braća iz istog Gmail inboxa nose isti ključ.
      emailCanonical: canonicalizeEmailForAntiFarm(email),
      name: "Studio Student",
      username: opts.username ?? "studio_student",
      role: opts.role ?? "student",
      language: "sr" as const,
      ...(opts.acceptedTerms === false ? {} : { acceptedStudioTermsAt: 1 }),
      ...(opts.emailVerified ? { emailVerificationTime: 1 } : {}),
      createdAt: 1,
      updatedAt: 1,
    });
  });
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function seedModel(
  t: TestConvex,
  overrides: Partial<{ slug: string; creditCost: number; paramSchema: string; estimatedCostUsd: number }> = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("modelCatalog", {
      slug: overrides.slug ?? MODEL_SLUG,
      kind: "image" as const,
      labelSr: "FLUX.2 Flash",
      labelEn: "FLUX.2 Flash",
      descriptionSr: "Najjeftiniji.",
      descriptionEn: "Cheapest.",
      provider: "fal",
      falEndpoint: "fal-ai/flux-2/flash",
      defaultParams: JSON.stringify({ aspect_ratio: "1:1" }),
      paramSchema: overrides.paramSchema ?? "[]",
      creditCost: overrides.creditCost ?? MODEL_COST,
      estimatedCostUsd: overrides.estimatedCostUsd ?? MODEL_COST_USD,
      isEnabled: true,
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

async function setPublicFlag(t: TestConvex, enabled: boolean) {
  await t.run((ctx) => ctx.db.insert("platformFlags", { key: "studio_public", enabled }));
}

async function balanceOf(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) => {
    const row = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return row?.balance ?? 0;
  });
}

async function lotsBySource(t: TestConvex, userId: Id<"users">, source: string) {
  return t.run(async (ctx) =>
    ctx.db
      .query("creditLots")
      .withIndex("by_user_source", (q) => q.eq("userId", userId).eq("source", source as never))
      .collect(),
  );
}

async function jobsOf(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db.query("generationJobs").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  );
}

async function txOf(t: TestConvex, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db.query("creditTransactions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VEKTOR 1 — TRKA STANJA / DOUBLE-SPEND  →  ZATVORENO (OCC)
// ════════════════════════════════════════════════════════════════════════════

test("V1 ZATVORENO: dva istovremena createJob nad balansom za JEDAN posao — samo jedan prolazi, balans ne ide u minus", async () => {
  const t = makeT();
  const { userId, asUser } = await seedUser(t, { role: "moderator", email: "mod@example.com" });
  await seedModel(t);
  await grant(t, userId, MODEL_COST); // tačno za jedan posao

  const results = await Promise.allSettled([
    asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("a") }),
    asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("b") }),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").length;

  expect(ok).toBe(1); // OCC serializuje — drugi vidi 0 kredita i pada
  expect(await balanceOf(t, userId)).toBe(0);
  expect(await balanceOf(t, userId)).toBeGreaterThanOrEqual(0); // NIKAD minus
  expect(await jobsOf(t, userId)).toHaveLength(1);
});

test("V1 ZATVORENO: dva istovremena claimSignupBonus daju TAČNO jedan bonus lot (25, ne 50)", async () => {
  const t = makeT();
  await setPublicFlag(t, true);
  const { userId, asUser } = await seedUser(t, {
    enrolled: false,
    emailVerified: true,
    email: "solo@example.com",
    username: "solo",
  });

  const results = await Promise.allSettled([
    asUser.mutation(api.studio.claimSignupBonus, {}),
    asUser.mutation(api.studio.claimSignupBonus, {}),
  ]);
  expect(results.every((r) => r.status === "fulfilled")).toBe(true);

  const lots = await lotsBySource(t, userId, "signup_bonus");
  expect(lots).toHaveLength(1); // idempotencija + OCC drže jedan lot
  expect(await balanceOf(t, userId)).toBe(25);
});

// ════════════════════════════════════════════════════════════════════════════
// VEKTOR 2 — CENA  →  ZATVORENO (cena isključivo iz kataloga)
// ════════════════════════════════════════════════════════════════════════════

test("V2 ZATVORENO: klijentski creditCost/num_images/duration u params NE menjaju naplatu — naplaćuje se cena iz kataloga", async () => {
  const t = makeT();
  const { userId, asUser } = await seedUser(t, { role: "moderator", email: "mod2@example.com" });
  await seedModel(t); // paramSchema "[]" — nijedna kontrola nije priznata
  await grant(t, userId, 1000);

  await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("lisica", {
      creditCost: 1,
      creditcost: 1,
      price: 0,
      num_images: 999,
      duration: 0.0001,
      aspect_ratio: "zlonamerno",
    }),
  });

  const jobs = await jobsOf(t, userId);
  expect(jobs).toHaveLength(1);
  expect(jobs[0].creditCost).toBe(MODEL_COST); // cena iz kataloga, ne iz params
  // Očišćeni params sadrže SAMO prompt — svaki nepoznat ključ je ispao.
  expect(JSON.parse(jobs[0].params)).toEqual({ prompt: "lisica" });
  const spend = (await txOf(t, userId)).filter((x) => x.type === "spend");
  expect(spend).toHaveLength(1);
  expect(spend[0].amount).toBe(-MODEL_COST);
  expect(await balanceOf(t, userId)).toBe(1000 - MODEL_COST);
});

test("V2 ZATVORENO: model van kataloga se odbija (MODEL_NEDOSTUPAN), ništa se ne skida", async () => {
  const t = makeT();
  const { userId, asUser } = await seedUser(t, { role: "moderator", email: "mod3@example.com" });
  await seedModel(t);
  await grant(t, userId, 100);

  await expect(
    asUser.mutation(api.studio.createJob, { modelSlug: "ne-postoji-model", params: promptParams("x") }),
  ).rejects.toThrow(/MODEL_NEDOSTUPAN/);
  expect(await balanceOf(t, userId)).toBe(100);
  expect(await jobsOf(t, userId)).toHaveLength(0);
});

// ════════════════════════════════════════════════════════════════════════════
// VEKTOR 3 — REFUND / FAIL  →  ZATVORENO (idempotentno po by_job_type)
// ════════════════════════════════════════════════════════════════════════════

test("V3 ZATVORENO: dupli failJob refundira TAČNO jednom (nema duplog kredita)", async () => {
  const t = makeT();
  const { userId, asUser } = await seedUser(t, { role: "moderator", email: "mod4@example.com" });
  await seedModel(t);
  await grant(t, userId, 100);

  const jobId = (await asUser.mutation(api.studio.createJob, {
    modelSlug: MODEL_SLUG,
    params: promptParams("x"),
  })) as Id<"generationJobs">;
  expect(await balanceOf(t, userId)).toBe(100 - MODEL_COST);

  await t.mutation(internal.studio.failJob, { jobId, error: "boom" });
  await t.mutation(internal.studio.failJob, { jobId, error: "boom-opet" }); // drugi poziv

  // Refund je vraćen jednom: balans nazad na 100, ne 120.
  expect(await balanceOf(t, userId)).toBe(100);
  const refunds = (await txOf(t, userId)).filter((x) => x.type === "refund");
  expect(refunds).toHaveLength(1);
  const refundLots = await lotsBySource(t, userId, "refund");
  expect(refundLots).toHaveLength(1);
});

// ════════════════════════════════════════════════════════════════════════════
// VEKTOR 4 — SIGNUP BONUS FARM  →  RUPA (anti-farm ne kanonizuje Gmail alias/tačku)
// ════════════════════════════════════════════════════════════════════════════

test("V4 ZATVORENO (tačan duplikat): dva naloga sa ISTIM emailom — drugi claim je DUPLIRAN_EMAIL", async () => {
  const t = makeT();
  await setPublicFlag(t, true);
  const a = await seedUser(t, { enrolled: false, emailVerified: true, email: "dup@example.com", username: "a1" });
  await seedUser(t, { enrolled: false, emailVerified: true, email: "dup@example.com", username: "a2" });

  const res = await a.asUser.mutation(api.studio.claimSignupBonus, {});
  // Dok drugi živ nalog sa istim emailom postoji, bonus se ne daje.
  expect(res).toEqual({ granted: false, reason: "DUPLIRAN_EMAIL" });
});

test("V4 ZATVORENO: Gmail +alias vidi raniji nalog iz istog inboxa — drugi je DUPLIRAN_EMAIL", async () => {
  const t = makeT();
  await setPublicFlag(t, true);
  // "red+1@gmail.com" i "red+2@gmail.com" stižu u ISTI Gmail inbox (Gmail
  // ignoriše sve posle "+"). Kanonizacija (canonicalizeEmailForAntiFarm) ih
  // svodi na isti "red@gmail.com", pa ih anti-farm vidi kao jednu osobu.
  const a = await seedUser(t, { enrolled: false, emailVerified: true, email: "red+1@gmail.com", username: "red1" });
  // Prvi nalog je SAM u trenutku claim-a -> legitiman bonus prolazi.
  expect(await a.asUser.mutation(api.studio.claimSignupBonus, {})).toEqual({ granted: true, amount: 25 });
  expect(await balanceOf(t, a.userId)).toBe(25);

  // Alias-brat iz istog inboxa registrovan POSLE -> vidi raniji nalog i pada.
  const b = await seedUser(t, { enrolled: false, emailVerified: true, email: "red+2@gmail.com", username: "red2" });
  expect(await b.asUser.mutation(api.studio.claimSignupBonus, {})).toEqual({
    granted: false,
    reason: "DUPLIRAN_EMAIL",
  });
  expect(await balanceOf(t, b.userId)).toBe(0);
  // Iz jednog inboxa: TAČNO 25 kr, ne po 25 na svaki alias.
});

test("V4 ZATVORENO: Gmail tačka-varijanta ('r.ed@gmail.com') vidi raniji 'red@gmail.com'", async () => {
  const t = makeT();
  await setPublicFlag(t, true);
  const a = await seedUser(t, { enrolled: false, emailVerified: true, email: "red@gmail.com", username: "d1" });
  expect(await a.asUser.mutation(api.studio.claimSignupBonus, {})).toEqual({ granted: true, amount: 25 });

  const b = await seedUser(t, { enrolled: false, emailVerified: true, email: "r.ed@gmail.com", username: "d2" });
  expect(await b.asUser.mutation(api.studio.claimSignupBonus, {})).toEqual({
    granted: false,
    reason: "DUPLIRAN_EMAIL",
  });
  expect(await balanceOf(t, b.userId)).toBe(0);
});

test("V4 čista funkcija: canonicalizeEmailForAntiFarm svodi sve Gmail varijante iz izveštaja na isti ključ", () => {
  // Sve varijante iz izveštaja stižu u isti inbox -> isti kanonski ključ.
  const canonical = "red@gmail.com";
  expect(canonicalizeEmailForAntiFarm("red@gmail.com")).toBe(canonical);
  expect(canonicalizeEmailForAntiFarm("red+1@gmail.com")).toBe(canonical);
  expect(canonicalizeEmailForAntiFarm("red+promo+2@gmail.com")).toBe(canonical);
  expect(canonicalizeEmailForAntiFarm("r.ed@gmail.com")).toBe(canonical);
  expect(canonicalizeEmailForAntiFarm("re.d@gmail.com")).toBe(canonical);
  expect(canonicalizeEmailForAntiFarm("r.e.d@gmail.com")).toBe(canonical);
  expect(canonicalizeEmailForAntiFarm("  RED+X@GMAIL.COM  ")).toBe(canonical);
  // googlemail.com je isti Gmail sandučić.
  expect(canonicalizeEmailForAntiFarm("r.ed+x@googlemail.com")).toBe(canonical);

  // Drugi provajderi NE diraju tačku/plus (tamo su različite adrese) - ključ je
  // samo normalizovan, ne kanonizovan, pa se legitimni nalozi ne spajaju.
  expect(canonicalizeEmailForAntiFarm("r.ed@example.com")).toBe("r.ed@example.com");
  expect(canonicalizeEmailForAntiFarm("red+1@outlook.com")).toBe("red+1@outlook.com");
  // Degenerativno / bez domena ostaje netaknuto.
  expect(canonicalizeEmailForAntiFarm("+tag@gmail.com")).toBe("+tag@gmail.com");
  expect(canonicalizeEmailForAntiFarm("")).toBe("");
  expect(canonicalizeEmailForAntiFarm(undefined)).toBe("");
});

// ════════════════════════════════════════════════════════════════════════════
// VEKTOR 5 — PRISTUP BEZ GEJTA  →  ZATVORENO (svaka write-mutacija gejtovana)
// ════════════════════════════════════════════════════════════════════════════

test("V5 ZATVORENO: NEverifikovan javni korisnik ne može ni createJob, ni upload URL, ni register, ni projekat", async () => {
  const t = makeT();
  await setPublicFlag(t, true);
  const { userId, asUser } = await seedUser(t, {
    enrolled: false,
    emailVerified: false, // NIJE potvrđen email
    email: "noverify@example.com",
    username: "nover",
    acceptedTerms: true,
  });
  await seedModel(t);
  await grant(t, userId, 100);

  await expect(
    asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("x") }),
  ).rejects.toThrow(/EMAIL_NIJE_POTVRDJEN/);
  await expect(asUser.mutation(api.studio.createInputUploadUrl, { slot: "image" })).rejects.toThrow(
    /EMAIL_NIJE_POTVRDJEN/,
  );
  await expect(asUser.mutation(api.studioProjects.createProject, { name: "moj" })).rejects.toThrow(
    /EMAIL_NIJE_POTVRDJEN/,
  );
  // registerInputUpload zahteva _storage id; gejt puca PRE svega ostalog.
  const fakeStorage = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
  const grantRow = await t.run((ctx) =>
    ctx.db.insert("studioUploadGrants", { userId, slot: "image", createdAt: 1, expiresAt: 2 ** 42 }),
  );
  await expect(
    asUser.mutation(api.studio.registerInputUpload, { storageId: fakeStorage, grantId: grantRow }),
  ).rejects.toThrow(/EMAIL_NIJE_POTVRDJEN/);

  // Ništa nije napravljeno.
  expect(await jobsOf(t, userId)).toHaveLength(0);
  const uploads = await t.run((ctx) =>
    ctx.db.query("studioUploads").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  );
  expect(uploads).toHaveLength(0);
});

// ════════════════════════════════════════════════════════════════════════════
// VEKTOR 6 — STRIPE IDEMPOTENCIJA  →  ZATVORENO
// ════════════════════════════════════════════════════════════════════════════

const SYNC_SECRET = "test-webhook-secret";

test("V6 ZATVORENO: applyStripeGrant dvaput sa istim session ID daje JEDAN lot; pogrešan secret je Forbidden", async () => {
  const previous = process.env.WEBHOOK_SYNC_SECRET;
  process.env.WEBHOOK_SYNC_SECRET = SYNC_SECRET;
  try {
    const t = makeT();
    const { userId } = await seedUser(t, { email: "buyer@example.com", username: "buyer" });

    const args = {
      syncSecret: SYNC_SECRET,
      userId,
      amount: 200,
      source: "purchase" as const,
      stripeSessionId: "cs_test_123",
    };
    const lot1 = await t.mutation(api.credits.applyStripeGrant, args);
    const lot2 = await t.mutation(api.credits.applyStripeGrant, args); // replay
    expect(lot1).toBe(lot2); // isti lot, ne novi

    expect(await balanceOf(t, userId)).toBe(200); // kreditirano JEDNOM
    const purchases = await lotsBySource(t, userId, "purchase");
    expect(purchases).toHaveLength(1);

    // Falsifikovan potpis se odbija pre ijednog upisa.
    await expect(
      t.mutation(api.credits.applyStripeGrant, { ...args, stripeSessionId: "cs_evil", syncSecret: "pogresno" }),
    ).rejects.toThrow(/Forbidden/);
    expect(await balanceOf(t, userId)).toBe(200);
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SYNC_SECRET;
    else process.env.WEBHOOK_SYNC_SECRET = previous;
  }
});

test("V6 ZATVORENO: applyStripeReversal dvaput sa istim eventId oduzme kredite JEDNOM", async () => {
  const previous = process.env.WEBHOOK_SYNC_SECRET;
  process.env.WEBHOOK_SYNC_SECRET = SYNC_SECRET;
  try {
    const t = makeT();
    const { userId } = await seedUser(t, { email: "buyer2@example.com", username: "buyer2" });
    await t.mutation(api.credits.applyStripeGrant, {
      syncSecret: SYNC_SECRET,
      userId,
      amount: 200,
      source: "purchase" as const,
      stripeSessionId: "cs_rev_1",
    });
    expect(await balanceOf(t, userId)).toBe(200);

    const revArgs = {
      syncSecret: SYNC_SECRET,
      eventId: "evt_1",
      kind: "refund" as const,
      stripeSessionId: "cs_rev_1",
    };
    await t.mutation(api.credits.applyStripeReversal, revArgs);
    await t.mutation(api.credits.applyStripeReversal, revArgs); // replay istog eventa

    expect(await balanceOf(t, userId)).toBe(0); // oduzeto jednom (ne -200)
  } finally {
    if (previous === undefined) delete process.env.WEBHOOK_SYNC_SECRET;
    else process.env.WEBHOOK_SYNC_SECRET = previous;
  }
});

// ════════════════════════════════════════════════════════════════════════════
// VEKTOR 7 — RATE LIMIT  →  ZATVORENO
// ════════════════════════════════════════════════════════════════════════════

test("V7 ZATVORENO: negativan/nevalidan iznos granta se odbija (NEVALIDAN_IZNOS)", async () => {
  const t = makeT();
  const { userId } = await seedUser(t, { email: "neg@example.com", username: "neg" });
  await expect(
    t.mutation(internal.credits.grantCredits, {
      userId,
      amount: -50,
      source: "admin_grant",
      idempotencyKey: { field: "stripeSessionId", value: "neg-1" },
    }),
  ).rejects.toThrow(/NEVALIDAN_IZNOS/);
  await expect(
    t.mutation(internal.credits.grantCredits, {
      userId,
      amount: 5.5,
      source: "admin_grant",
      idempotencyKey: { field: "stripeSessionId", value: "frac-1" },
    }),
  ).rejects.toThrow(/NEVALIDAN_IZNOS/);
  expect(await balanceOf(t, userId)).toBe(0);
});

test("V7 ZATVORENO: dnevni brojač trke — dva istovremena posla uz maxJobsPerDay=1 puštaju samo jedan", async () => {
  const t = makeT();
  await setPublicFlag(t, true);
  await t.run((ctx) =>
    ctx.db.insert("platformFlags", { key: "studio_public_max_jobs_per_day", enabled: true, value: 1 }),
  );
  const { userId, asUser } = await seedUser(t, {
    enrolled: false,
    emailVerified: true,
    email: "day@example.com",
    username: "day",
  });
  await seedModel(t);
  await grant(t, userId, 1000);

  const previous = process.env.FAL_KEY;
  process.env.FAL_KEY = "test-fal-key"; // da R10 DEMO-guard ne obori javni fal posao
  try {
    const results = await Promise.allSettled([
      asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("a") }),
      asUser.mutation(api.studio.createJob, { modelSlug: MODEL_SLUG, params: promptParams("b") }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(1); // dnevni kap od 1 važi i pod konkurentnošću (OCC)
    expect(await jobsOf(t, userId)).toHaveLength(1);
  } finally {
    if (previous === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = previous;
  }
});

// ════════════════════════════════════════════════════════════════════════════
// VEKTOR 8 — MODERACIJA  →  RUPA (keyword filter: samo početak reči, bez homoglifa)
// ════════════════════════════════════════════════════════════════════════════

test("V8 kontrola: čist zabranjen pojam JESTE blokiran", () => {
  expect(validatePrompt("napravi porn sliku")).toMatchObject({ ok: false, reason: "ZABRANJEN_POJAM" });
  expect(validatePrompt("child porn")).toMatchObject({ ok: false, reason: "ZABRANJEN_POJAM" });
});

test("V8 RUPA: leetspeak/razmaci/spajanje/homoglif ZAOBILAZE moderaciju", () => {
  // Svaki od ovih PROĐE validatePrompt (ok:true), a provajder ih i dalje čita
  // kao zabranjen sadržaj.
  expect(validatePrompt("p0rn scene")).toEqual({ ok: true }); // leetspeak (nula)
  expect(validatePrompt("p o r n")).toEqual({ ok: true }); // razmaci između slova
  expect(validatePrompt("childporn")).toEqual({ ok: true }); // spajanje (vs "child porn")
  expect(validatePrompt("pоrn")).toEqual({ ok: true }); // ćirilično 'о' (U+043E)
  // Reč u kojoj zabranjen koren NIJE na početku prolazi (poklapa se od početka reči).
  expect(validatePrompt("notporn")).toEqual({ ok: true });
});
