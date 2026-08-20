/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUDIO_MODELS } from "./providers/catalogModels";
import type { StudioModelSeed } from "./providers/modelSeed";
import schema from "./schema";
import { computeCredits } from "./studioPricing";

const modules = import.meta.glob("./**/*.ts");

type TestConvex = ReturnType<typeof convexTest>;
type TestUser = ReturnType<TestConvex["withIdentity"]>;

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

/**
 * Fajl u storage-u PRIJAVLJEN na korisnika, istim putem kojim ide klijent:
 * upload, pa `registerInputUpload`. Neprijavljen `storageId` `createJob` više
 * ne prima (nalaz R4), pa ni test ne sme da preskoči drugi korak.
 *
 * Fajl okačen ovim putem NIJE izmeren: `durationS` mu se ne upisuje, pa model
 * koji se naplaćuje po trajanju na njemu pada. Za to je `storeMeasured` ispod.
 * Slot se podrazumeva iz MIME tipa - jedini put na kojem to nije tačno (proba
 * odeće) ga navodi izričito.
 */
async function storeFile(as: TestUser, type: string, bytes = 1, slot = type.split("/")[0]) {
  const storageId = await as.run((ctx) =>
    ctx.storage.store(new Blob(["x".repeat(bytes)], { type })),
  );
  await as.mutation(api.studio.registerInputUpload, { storageId, slot });

  return storageId;
}

/**
 * MP4 fajl čiji `mvhd` atom tvrdi tačno zadato trajanje - jedini podatak koji
 * `measureInputUpload` iz njega čita. Skala je 1 000 otkucaja u sekundi, pa
 * 4,2 s ide kao 4 200 otkucaja i deljenje je tačno.
 */
function mp4Bytes(seconds: number): Uint8Array {
  const u32 = (value: number) => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
  const chars = (text: string) => [...text].map((letter) => letter.charCodeAt(0));
  const mvhd = [
    ...u32(108),
    ...chars("mvhd"),
    0,
    0,
    0,
    0,
    ...u32(0),
    ...u32(0),
    ...u32(1000),
    ...u32(Math.round(seconds * 1000)),
    ...new Array(80).fill(0),
  ];

  return Uint8Array.from([
    ...u32(16),
    ...chars("ftyp"),
    ...chars("isom"),
    ...u32(512),
    ...u32(mvhd.length + 8),
    ...chars("moov"),
    ...mvhd,
  ]);
}

/**
 * Fajl okačen, prijavljen i IZMEREN - ceo put kojim ide klijent, uključujući
 * akciju koja čita zaglavlje. Convex storage se u produkciji čita `Range`
 * zahtevom preko potpisanog URL-a, pa se `fetch` zamenjuje serverom koji taj
 * zahtev poštuje nad istim bajtovima koji su i upisani.
 */
async function storeMeasured(as: TestUser, type: string, seconds: number, slot = type.split("/")[0]) {
  const data = mp4Bytes(seconds);
  const storageId = await as.run((ctx) => ctx.storage.store(new Blob([data], { type })));
  await as.mutation(api.studio.registerInputUpload, { storageId, slot });

  vi.stubGlobal("fetch", rangeServer(data));
  try {
    const measured = await as.action(api.studioActions.measureInputUpload, { storageId });

    return { storageId, measured };
  } finally {
    vi.unstubAllGlobals();
  }
}

/** `fetch` koji poštuje `Range` zaglavlje i vraća 206, kao Convex storage. */
function rangeServer(data: Uint8Array) {
  return (_url: string, init?: { headers?: Record<string, string> }) => {
    const range = /bytes=(\d+)-(\d+)/.exec(init?.headers?.Range ?? "");
    if (!range) return Promise.resolve(new Response(null, { status: 400 }));
    const slice = data.slice(Number(range[1]), Number(range[2]) + 1);

    return Promise.resolve(new Response(slice, { status: 206 }));
  };
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
  const first = await storeFile(asUser, "image/png");
  const second = await storeFile(asUser, "image/png");

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
    await storeFile(asUser, "image/png"),
    await storeFile(asUser, "image/png"),
    await storeFile(asUser, "image/png"),
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

test("Seedance sa video referencom NEMA popust dok se ulazni video ne naplaćuje", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "seedance-25");
  const video = await storeFile(asUser, "video/mp4");

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "seedance-25",
    params: JSON.stringify({ prompt: "reklama", resolution: "480p", duration: 5 }),
    inputMode: "reference",
    inputs: JSON.stringify({ video: [video] }),
  });

  const jobs = await jobsOf(t, userId);
  const params = JSON.parse(jobs[0].params) as Record<string, unknown>;
  // Snižena tarifa iz kataloga 3.4 postoji ZATO ŠTO se naplaćuje i ulazni
  // video. Trajanje tog videa server ne meri, pa se ne naplaćuje - i popusta
  // nema. Sa popustom a bez naplaćenog ulaza marža pada na 0,50x.
  expect(jobs[0].creditCost).toBe(
    computeCredits(seedOf("seedance-25").priceRule, params, "reference"),
  );
  expect(jobs[0].creditCost).toBe(
    computeCredits(seedOf("seedance-25").priceRule, params, "reference_with_video"),
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
  });

  const jobs = await jobsOf(t, userId);
  const params = JSON.parse(jobs[0].params) as Record<string, unknown>;
  // Poslati `char_count` ne prolazi - meri se tekst.
  expect(params.char_count).toBe(1000);
  expect(jobs[0].creditCost).toBe(computeCredits(seedOf("tts").priceRule, params, "text"));
});

test("posao koji se naplaćuje po dužini fajla bez SERVERSKOG merenja ne prolazi", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "kling-motion");
  // Okačen i prijavljen, ali neizmeren: `durationS` mu nema.
  const video = await storeFile(asUser, "video/mp4");
  const image = await storeFile(asUser, "image/png");

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "kling-motion",
      params: JSON.stringify({ resolution: "720p" }),
      inputMode: "video_image",
      inputs: JSON.stringify({ video: [video], image: [image] }),
    }),
  ).rejects.toThrow("MERENJE_NIJE_DOSTUPNO");

  expect(await jobsOf(t, userId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(100000);
});

test("izmerena dužina se zaokružuje naviše pre naplate", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "kling-motion");
  const { storageId: video, measured } = await storeMeasured(asUser, "video/mp4", 4.2);
  const image = await storeFile(asUser, "image/png");

  expect(measured).toEqual({ ok: true, seconds: 4.2 });

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "kling-motion",
    params: JSON.stringify({ resolution: "720p" }),
    inputMode: "video_image",
    inputs: JSON.stringify({ video: [video], image: [image] }),
  });

  const jobs = await jobsOf(t, userId);
  expect((JSON.parse(jobs[0].params) as Record<string, unknown>).duration).toBe(5);
});

test("naplaćuje se IZMERENO trajanje, a klijent nema čime da prijavi svoje", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "dubbing");
  // Sedam minuta govora, prijavljenih kao 0,1 - to je nalaz R3 u malom.
  // (Dva sata iz izveštaja bi pala na dnevnom plafonu troška od 5 $, dakle na
  // kapiji koja nema veze sa merenjem.)
  const { storageId: audio } = await storeMeasured(asUser, "audio/mp4", 420);

  // `measuredQuantity` više nije argument `createJob`-a: validator ga odbija,
  // pa put kojim je klijent birao cenu ne postoji ni da se zaobiđe.
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "dubbing",
      params: JSON.stringify({ target_language: "en" }),
      inputMode: "audio",
      inputs: JSON.stringify({ audio: [audio] }),
      measuredQuantity: 0.1,
    } as unknown as { modelSlug: string; params: string }),
  ).rejects.toThrow();

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "dubbing",
    params: JSON.stringify({ target_language: "en", minutes: 0.1 }),
    inputMode: "audio",
    inputs: JSON.stringify({ audio: [audio] }),
  });

  const jobs = await jobsOf(t, userId);
  const params = JSON.parse(jobs[0].params) as Record<string, unknown>;
  // Ni `minutes` poslat kroz `params` ne prolazi - upisuje se izmereno.
  expect(params.minutes).toBe(7);
  expect(jobs[0].creditCost).toBe(computeCredits(seedOf("dubbing").priceRule, params, "audio"));
  expect(await balanceOf(t, userId)).toBe(100000 - jobs[0].creditCost);
});

test("model sa merenom količinom bez ijednog serverski vidljivog fajla se odbija", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "kling-motion");
  const image = await storeFile(asUser, "image/png");

  // Slika je tu, video - iz kojeg se meri - nije. Nema se šta izmeriti.
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "kling-motion",
      params: JSON.stringify({ resolution: "720p" }),
      inputMode: "video_image",
      inputs: JSON.stringify({ image: [image] }),
    }),
  ).rejects.toThrow("MERENJE_NIJE_DOSTUPNO");

  // `storageId` koji nije ID pada ranije, na vlasništvu (nalaz R4): fajl bez
  // prijave nije ničiji, pa se ne meri ni koliko traje.
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "kling-motion",
      params: JSON.stringify({ resolution: "720p" }),
      inputMode: "video_image",
      inputs: JSON.stringify({ video: ["izmisljen-id"], image: [image] }),
    }),
  ).rejects.toThrow("TUDJI_FAJL");

  expect(await jobsOf(t, userId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(100000);
});

test("fajl čije se zaglavlje ne čita ostaje neizmeren i posao na njemu pada", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "dubbing");

  const junk = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, ...new Array(200).fill(7)]);
  const storageId = await asUser.run((ctx) =>
    ctx.storage.store(new Blob([junk], { type: "audio/mp4" })),
  );
  await asUser.mutation(api.studio.registerInputUpload, { storageId, slot: "audio" });

  vi.stubGlobal("fetch", rangeServer(junk));
  const measured = await asUser.action(api.studioActions.measureInputUpload, { storageId });
  vi.unstubAllGlobals();

  expect(measured).toEqual({ ok: false, reason: "NEPOZNAT_FORMAT" });
  // Neuspelo merenje NE upisuje trajanje, pa se posao ne može naplatiti.
  const upload = await t.run((ctx) =>
    ctx.db
      .query("studioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first(),
  );
  expect(upload?.durationS).toBeUndefined();

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "dubbing",
      params: JSON.stringify({ target_language: "en" }),
      inputMode: "audio",
      inputs: JSON.stringify({ audio: [storageId] }),
    }),
  ).rejects.toThrow("MERENJE_NIJE_DOSTUPNO");

  expect(await jobsOf(t, userId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(100000);
});

test("tuđi fajl se ne meri - trajanje je podatak o tuđem fajlu", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  const other = await t.run(async (ctx) =>
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
  const asOther = t.withIdentity({ subject: other, tokenIdentifier: `test|${other}` });

  const { storageId } = await storeMeasured(asUser, "audio/mp4", 30);

  expect(await asOther.action(api.studioActions.measureInputUpload, { storageId })).toEqual({
    ok: false,
    reason: "TUDJI_FAJL",
  });
});

test("ponovljeno merenje istog fajla vraća isti broj i ne čita bajtove opet", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  const { storageId, measured } = await storeMeasured(asUser, "audio/mp4", 12.5);
  expect(measured).toEqual({ ok: true, seconds: 12.5 });

  // Bez ijednog `fetch`-a: drugi poziv čita gotov `durationS` iz reda. Fajl u
  // Convex storage-u je nepromenljiv, pa drugi rezultat ne postoji.
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const again = await asUser.action(api.studioActions.measureInputUpload, { storageId });
  vi.unstubAllGlobals();

  expect(again).toEqual({ ok: true, seconds: 12.5 });
  expect(fetchMock).not.toHaveBeenCalled();
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
  const audio = await storeFile(asUser, "audio/mpeg");

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
  const person = await storeFile(asUser, "image/png", 1, "person");
  const garment = await storeFile(asUser, "image/png", 1, "garment");
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
    await storeFile(asUser, "image/png"),
    await storeFile(asUser, "image/png"),
    await storeFile(asUser, "image/png"),
    await storeFile(asUser, "image/png"),
    await storeFile(asUser, "image/png"),
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
  // Slika se ne meri, pa trajanja nema - polje postoji samo tamo gde ga ima.
  expect(seed?.inputs[0].durationS).toBeUndefined();
});

test("`Generiši ponovo` nosi i IZMERENO trajanje, da forma ne traži merenje opet", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "kling-motion");
  const { storageId: video } = await storeMeasured(asUser, "video/mp4", 9);
  const image = await storeFile(asUser, "image/png");

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "kling-motion",
    params: JSON.stringify({ resolution: "720p" }),
    inputMode: "video_image",
    inputs: JSON.stringify({ video: [video], image: [image] }),
  });

  const jobs = await jobsOf(t, userId);
  const seed = await asUser.query(api.studio.getJobForRegenerate, { jobId: jobs[0]._id });
  // Bez ovog polja bi forma posle "Generiši ponovo" mislila da fajl nije
  // izmeren i zaključala dugme, iako bi `createJob` na njemu prošao.
  expect(seed?.inputs.find((input) => input.slot === "video")?.durationS).toBe(9);
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

// ── vlasništvo nad okačenim fajlovima (nalaz R4) ───────────────────────────

/** Drugi prijavljen korisnik, sa svojim identitetom - "tuđi" u testovima ispod. */
async function seedStranger(t: TestConvex): Promise<TestUser> {
  const strangerId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "tudji@example.com",
      name: "Tudji",
      username: "tudji",
      role: "student" as const,
      language: "sr" as const,
      createdAt: 1,
      updatedAt: 1,
    }),
  );

  return t.withIdentity({ subject: strangerId, tokenIdentifier: `test|${strangerId}` });
}

function uploadsOf(t: TestConvex) {
  return t.run((ctx) => ctx.db.query("studioUploads").collect());
}

test("tuđi `storageId` se odbija PRE nego što skine ijedan kredit", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");
  const stranger = await seedStranger(t);
  const strangersFile = await storeFile(stranger, "image/png");

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "vrati mi tudju sliku" }),
      inputMode: "image_multi",
      inputs: JSON.stringify({ image: [strangersFile] }),
    }),
  ).rejects.toThrow("TUDJI_FAJL");

  // Ni posla ni naplate: galerija i "Generiši ponovo" potpisuju svaki
  // `storageId` koji posao nosi, pa bi upisan posao bio čitanje tuđeg fajla.
  expect(await jobsOf(t, userId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(100000);
  // Tuđi upload je ostao netaknut - i dalje nevezan, sa svojim rokom.
  const uploads = await uploadsOf(t);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].expiresAt).toBeGreaterThan(0);
});

test("okačen ali neprijavljen `storageId` ne prolazi kroz naplatu", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");
  // Fajl POSTOJI u storage-u, ali ga niko nije prijavio - dakle nije ničiji.
  const unregistered = await t.run((ctx) =>
    ctx.storage.store(new Blob(["x"], { type: "image/png" })),
  );

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "spoji" }),
      inputMode: "image_multi",
      inputs: JSON.stringify({ image: [unregistered] }),
    }),
  ).rejects.toThrow("TUDJI_FAJL");

  expect(await jobsOf(t, userId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(100000);
});

test("`storageId` koji ne postoji pada pre naplate, ne tek na predaji", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "spoji" }),
      inputMode: "image_multi",
      inputs: JSON.stringify({ image: ["nema-ovakvog-fajla"] }),
    }),
  ).rejects.toThrow("TUDJI_FAJL");

  // Ranije je ovakav posao prolazio, skidao kredite i refundirao se tek pošto
  // predaja provajderu pukne (druga polovina nalaza R4).
  expect(await jobsOf(t, userId)).toHaveLength(0);
  expect(await balanceOf(t, userId)).toBe(100000);
});

test("svoj fajl prolazi, a posao mu skida rok isteka", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");
  const own = await storeFile(asUser, "image/png");

  const before = await uploadsOf(t);
  expect(before[0].expiresAt).toBeGreaterThan(0);
  expect(before[0].userId).toBe(userId);

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "nano-banana-2",
    params: JSON.stringify({ prompt: "spoji" }),
    inputMode: "image_multi",
    inputs: JSON.stringify({ image: [own] }),
  });

  expect(await jobsOf(t, userId)).toHaveLength(1);
  // Ulaz posla mora da preživi koliko i posao - "Generiši ponovo" ga potpisuje
  // i mnogo kasnije.
  const after = await uploadsOf(t);
  expect(after[0].expiresAt).toBeUndefined();
});

test("prijava ne prepisuje vlasnika, a fajl koji ne postoji se ne prijavljuje", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  const stranger = await seedStranger(t);
  const strangersFile = await storeFile(stranger, "image/png");

  await expect(
    asUser.mutation(api.studio.registerInputUpload, { storageId: strangersFile, slot: "image" }),
  ).rejects.toThrow("TUDJI_FAJL");

  // Ponovljena prijava istog fajla od istog korisnika nije greška i ne pravi
  // drugi red - mrežni ponovni pokušaj sme da prođe dvaput.
  await stranger.mutation(api.studio.registerInputUpload, { storageId: strangersFile, slot: "image" });
  expect(await uploadsOf(t)).toHaveLength(1);

  const deleted = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["x"], { type: "image/png" }));
    await ctx.storage.delete(storageId);

    return storageId;
  });
  await expect(
    asUser.mutation(api.studio.registerInputUpload, { storageId: deleted, slot: "image" }),
  ).rejects.toThrow("FAJL_NE_POSTOJI");
});

test("prijavljena veličina dolazi iz storage-a, ne iz onoga što je klijent rekao", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  await storeFile(asUser, "audio/mpeg", 2_000_000);

  // Isti broj kasnije nosi granicu prijavljenog trajanja (W3), pa se veličina
  // fajla čita jednom - ovde - a ne po drugi put u `createJob`-u.
  const [upload] = await uploadsOf(t);
  expect(upload.bytes).toBe(2_000_000);
  expect(upload.slot).toBe("audio");
});
