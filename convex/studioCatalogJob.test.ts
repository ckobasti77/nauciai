/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUDIO_MODELS } from "./providers/catalogModels";
import type { StudioModelSeed } from "./providers/modelSeed";
import schema from "./schema";
import { computeCredits } from "./studioPricing";

const modules = import.meta.glob("./**/*.ts");

type TestConvex = ReturnType<typeof convexTest>;

function seedOf(slug: string): StudioModelSeed {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug);
  if (!seed) throw new Error(`Nema modela ${slug} u katalogu`);

  return seed;
}

/** Red v4 kataloga u bazi - ista polja koja upisuje `seedStudioModels`. */
async function seedCatalogModel(t: TestConvex, slug: string, isEnabled = true) {
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
      isEnabled,
      sortOrder: seed.sortOrder,
      updatedAt: 1,
    }),
  );
}

async function seedUser(t: TestConvex) {
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
      status: "active" as const,
      startedAt: 1,
      updatedAt: 1,
    });

    return userId;
  });

  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 100000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });

  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function jobsOf(t: TestConvex, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("generationJobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
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

/** Fajl u storage-u, da `inputs` pokazuju na nešto što stvarno postoji. */
async function storeFile(t: TestConvex, type: string) {
  return t.run((ctx) => ctx.storage.store(new Blob(["x"], { type })));
}

// ── srećan tok ─────────────────────────────────────────────────────────────

test("v4 model se naplaćuje po `computeCredits`-u nad istim parametrima koje upisuje", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "nano-banana-2",
    params: JSON.stringify({ prompt: "lisica u snegu", resolution: "4K", num_images: 2 }),
    inputMode: "text",
  });

  const jobs = await jobsOf(t, userId);
  expect(jobs).toHaveLength(1);
  const params = JSON.parse(jobs[0].params) as Record<string, unknown>;
  expect(params.resolution).toBe("4K");
  expect(params.num_images).toBe(2);
  expect(jobs[0].inputMode).toBe("text");
  // Cifra na dugmetu i naplaćena cifra izlaze iz ISTE funkcije nad ISTIM
  // objektom - katalog 1.3 zabranjuje drugu računicu.
  expect(jobs[0].creditCost).toBe(computeCredits(seedOf("nano-banana-2").priceRule, params, "text"));
  expect(await balanceOf(t, userId)).toBe(100000 - jobs[0].creditCost);
});

test("ulazi se upisuju uz posao, sa slotom i redosledom", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");
  const first = await storeFile(t, "image/png");
  const second = await storeFile(t, "image/png");

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "nano-banana-2",
    params: JSON.stringify({ prompt: "spoji ove dve slike" }),
    inputMode: "image_multi",
    inputs: JSON.stringify({ image: [first, second] }),
  });

  const jobs = await jobsOf(t, userId);
  expect(jobs[0].inputMode).toBe("image_multi");
  expect(JSON.parse(jobs[0].inputs ?? "{}")).toEqual({ image: [first, second] });
});

test("dodatne ulazne slike broji SERVER, ne ono što je klijent prijavio", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "seedream-5-pro");
  const ids = [
    await storeFile(t, "image/png"),
    await storeFile(t, "image/png"),
    await storeFile(t, "image/png"),
  ];

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "seedream-5-pro",
    params: JSON.stringify({ prompt: "spoji", resolution: "1.5K", num_images: 1, input_images: 0 }),
    inputMode: "image_multi",
    inputs: JSON.stringify({ image: ids }),
  });

  const jobs = await jobsOf(t, userId);
  const params = JSON.parse(jobs[0].params) as Record<string, unknown>;
  // Klijent je poslao nulu; naplaćeno je tri (jedna besplatna + dve po $0,003).
  expect(params.input_images).toBe(3);
  expect(jobs[0].creditCost).toBe(
    computeCredits(seedOf("seedream-5-pro").priceRule, params, "image_multi"),
  );
});

test("Seedance sa video referencom ide po sniženoj tarifi - i to iz ULAZA, ne iz zahteva", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "seedance-25");
  const video = await storeFile(t, "video/mp4");

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "seedance-25",
    params: JSON.stringify({ prompt: "reklama", resolution: "480p", duration: 5 }),
    inputMode: "reference",
    inputs: JSON.stringify({ video: [video] }),
  });

  const jobs = await jobsOf(t, userId);
  const params = JSON.parse(jobs[0].params) as Record<string, unknown>;
  expect(jobs[0].creditCost).toBe(
    computeCredits(seedOf("seedance-25").priceRule, params, "reference_with_video"),
  );
  // Bez video ulaza ista kombinacija košta više.
  expect(jobs[0].creditCost).toBeLessThan(
    computeCredits(seedOf("seedance-25").priceRule, params, "reference"),
  );
});

// ── merena količina ────────────────────────────────────────────────────────

test("TTS se naplaćuje po broju znakova koje server prebroji sam", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "tts");
  const text = "a".repeat(1000);

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "tts",
    params: JSON.stringify({ text, char_count: 1 }),
    inputMode: "text",
    measuredQuantity: 1,
  });

  const jobs = await jobsOf(t, userId);
  const params = JSON.parse(jobs[0].params) as Record<string, unknown>;
  // Ni prijavljena količina ni poslati `char_count` ne prolaze - meri se tekst.
  expect(params.char_count).toBe(1000);
  expect(jobs[0].creditCost).toBe(computeCredits(seedOf("tts").priceRule, params, "text"));
});

test("posao koji se naplaćuje po dužini fajla bez izmerene dužine ne prolazi", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "kling-motion");
  const video = await storeFile(t, "video/mp4");
  const image = await storeFile(t, "image/png");

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "kling-motion",
      params: JSON.stringify({ resolution: "720p" }),
      inputMode: "video_image",
      inputs: JSON.stringify({ video: [video], image: [image] }),
    }),
  ).rejects.toThrow("NEDOSTAJE_KOLICINA:duration");

  expect(await jobsOf(t, userId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(100000);
});

test("prijavljena dužina se zaokružuje naviše pre naplate", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "kling-motion");
  const video = await storeFile(t, "video/mp4");
  const image = await storeFile(t, "image/png");

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "kling-motion",
    params: JSON.stringify({ resolution: "720p" }),
    inputMode: "video_image",
    inputs: JSON.stringify({ video: [video], image: [image] }),
    measuredQuantity: 4.2,
  });

  const jobs = await jobsOf(t, userId);
  expect((JSON.parse(jobs[0].params) as Record<string, unknown>).duration).toBe(5);
});

// ── kapije ─────────────────────────────────────────────────────────────────

test("kombinacija koju katalog ne nudi se odbija PRE nego što skine ijedan kredit", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "seedance-20");

  // Mini nema 1080p - ne postoji kao ključ u `lookup` mapi.
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "seedance-20",
      params: JSON.stringify({ prompt: "klip", tier: "mini", resolution: "1080p", duration: 5 }),
      inputMode: "text",
    }),
  ).rejects.toThrow("NEISPRAVNI_PARAMETRI");

  expect(await jobsOf(t, userId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(100000);
});

test("slot kojeg režim nema i režim kojeg model nema se odbijaju", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");
  const audio = await storeFile(t, "audio/mpeg");

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "nešto" }),
      inputMode: "image_multi",
      inputs: JSON.stringify({ audio: [audio] }),
    }),
  ).rejects.toThrow("NEISPRAVNI_ULAZI:NEPOZNAT_SLOT:audio");

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "nešto" }),
      inputMode: "video",
    }),
  ).rejects.toThrow("NEISPRAVAN_REZIM");

  expect(await jobsOf(t, userId)).toHaveLength(0);
});

test("model koji je admin ugasio ne pada nazad na stari katalog sa istim slugom", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "seedream-45", false);
  // Isti slug postoji i u starom katalogu; v4 red ima prednost, pa ugašen
  // model ostaje ugašen umesto da se naruči po staroj ceni.
  await t.run((ctx) =>
    ctx.db.insert("modelCatalog", {
      slug: "seedream-45",
      kind: "image" as const,
      labelSr: "Seedream",
      labelEn: "Seedream",
      descriptionSr: "Stari red.",
      descriptionEn: "Legacy row.",
      provider: "fal",
      falEndpoint: "fal-ai/seedream",
      defaultParams: "{}",
      paramSchema: "[]",
      creditCost: 10,
      estimatedCostUsd: 0.04,
      isEnabled: true,
      sortOrder: 10,
      updatedAt: 1,
    }),
  );

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "seedream-45",
      params: JSON.stringify({ prompt: "nešto" }),
    }),
  ).rejects.toThrow("MODEL_NEDOSTUPAN");

  expect(await jobsOf(t, userId)).toHaveLength(0);
});

test("prompt je obavezan samo tamo gde je jedini ulaz", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");
  await seedCatalogModel(t, "kling-tryon");

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "   " }),
      inputMode: "text",
    }),
  ).rejects.toThrow("NEISPRAVAN_PROMPT:PRAZAN_PROMPT");

  // Proba odeće nema nijednu tekstualnu kontrolu - i ne mora da je ima.
  const person = await storeFile(t, "image/png");
  const garment = await storeFile(t, "image/png");
  await asUser.mutation(api.studio.createJob, {
    modelSlug: "kling-tryon",
    params: "{}",
    inputMode: "image_multi",
    inputs: JSON.stringify({ person: [person], garment: [garment] }),
  });

  const jobs = await jobsOf(t, userId);
  expect(jobs).toHaveLength(1);
  expect(jobs[0].modelSlug).toBe("kling-tryon");
});

test("ElevenLabs tekst preko 2 000 znakova prolazi, jer je granica granica te kontrole", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "tts");

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "tts",
    params: JSON.stringify({ text: "a".repeat(3000) }),
    inputMode: "text",
  });

  const jobs = await jobsOf(t, userId);
  expect((JSON.parse(jobs[0].params) as Record<string, unknown>).char_count).toBe(3000);
});

// ── čitanje za galeriju i "Generiši ponovo" ────────────────────────────────

test("galerija dobija ulaze kao sličice, a `getJobForRegenerate` ceo spisak", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");
  const ids = [
    await storeFile(t, "image/png"),
    await storeFile(t, "image/png"),
    await storeFile(t, "image/png"),
    await storeFile(t, "image/png"),
    await storeFile(t, "image/png"),
  ];

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "nano-banana-2",
    params: JSON.stringify({ prompt: "spoji" }),
    inputMode: "image_multi",
    inputs: JSON.stringify({ image: ids }),
  });

  const page = await asUser.query(api.studio.listMyJobs, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(page.page[0].inputMode).toBe("image_multi");
  // Kartica potpisuje najviše četiri sličice, ali kaže koliko ih ima ukupno.
  expect(page.page[0].inputThumbs.items).toHaveLength(4);
  expect(page.page[0].inputThumbs.total).toBe(5);

  const jobs = await jobsOf(t, userId);
  const seed = await asUser.query(api.studio.getJobForRegenerate, { jobId: jobs[0]._id });
  expect(seed?.modelSlug).toBe("nano-banana-2");
  expect(seed?.inputMode).toBe("image_multi");
  expect(seed?.inputs.map((input) => input.storageId)).toEqual(ids);
  // Tip i veličina dolaze iz storage metapodatka, ne iz imena slota.
  // (`convex-test` ne pamti `contentType` blob-a, pa se ovde tvrdi oblik i
  // veličina; nad pravim storage-om isto polje nosi pravi MIME.)
  expect(typeof seed?.inputs[0].mime).toBe("string");
  expect(seed?.inputs[0].size).toBe(1);
});

test("tuđi posao se ne vraća u formu", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");
  await asUser.mutation(api.studio.createJob, {
    modelSlug: "nano-banana-2",
    params: JSON.stringify({ prompt: "moje" }),
    inputMode: "text",
  });
  const jobs = await jobsOf(t, userId);

  const strangerId = await t.run((ctx) =>
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
  const stranger = t.withIdentity({ subject: strangerId, tokenIdentifier: `test|${strangerId}` });

  expect(await stranger.query(api.studio.getJobForRegenerate, { jobId: jobs[0]._id })).toBeNull();
});
