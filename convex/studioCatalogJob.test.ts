/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MIN_PLAUSIBLE_BITRATE_BPS } from "../lib/media-duration";
import { STUDIO_MODELS } from "./providers/catalogModels";
import type { StudioModelSeed } from "./providers/modelSeed";
import schema from "./schema";
import {
  dayKey,
  MEASURE_UPLOAD_HOURLY_LIMIT,
  UPLOAD_GRANT_CLOCK_SLACK_MS,
} from "./studioCore";
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
  const { grantId } = await as.mutation(api.studio.createInputUploadUrl, { slot });
  await as.mutation(api.studio.registerInputUpload, { storageId, grantId });

  return storageId;
}

/**
 * MP4 fajl čiji `mvhd` atom tvrdi tačno zadato trajanje - jedini podatak koji
 * `measureInputUpload` iz njega čita. Skala je 1 000 otkucaja u sekundi, pa
 * 4,2 s ide kao 4 200 otkucaja i deljenje je tačno.
 *
 * Fajl se dopunjava nulama do veličine koju gornja granica iz X1 traži: sedam
 * minuta zvuka u fajlu od 150 bajtova je fizički nemoguće i `createJob` ga sada
 * odbija sa `ZAGLAVLJE_NEMOGUCE`, pa fixture mora da bude bar toliko velik
 * koliko medij te dužine mora da bude. `padBytes` tu veličinu prepisuje: nula
 * pravi baš takav nemoguć fajl, a veći broj fajl na kojem donja granica
 * nadjačava zaglavlje.
 */
function mp4Bytes(seconds: number, type: string, padBytes?: number): Uint8Array {
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

  const header = Uint8Array.from([
    ...u32(16),
    ...chars("ftyp"),
    ...chars("isom"),
    ...u32(512),
    ...u32(mvhd.length + 8),
    ...chars("moov"),
    ...mvhd,
  ]);

  // Jedan bajt preko granice, da zaokruživanje ne odlučuje ishod testa.
  const minBytes = padBytes ?? Math.ceil((seconds * (MIN_PLAUSIBLE_BITRATE_BPS[type] ?? 0)) / 8) + 1;
  if (header.length >= minBytes) return header;
  const padded = new Uint8Array(minBytes);
  padded.set(header, 0);

  return padded;
}

/**
 * Fajl okačen, prijavljen i IZMEREN - ceo put kojim ide klijent, uključujući
 * akciju koja čita zaglavlje. Convex storage se u produkciji čita `Range`
 * zahtevom preko potpisanog URL-a, pa se `fetch` zamenjuje serverom koji taj
 * zahtev poštuje nad istim bajtovima koji su i upisani.
 */
async function storeMeasured(
  as: TestUser,
  type: string,
  seconds: number,
  // Veličina fajla, kad je baš ona predmet testa (granice iz X1). Bez nje se
  // fajl dopunjava do najmanje veličine koju zaglavlje čini mogućom.
  padBytes?: number,
  slot = type.split("/")[0],
) {
  const data = mp4Bytes(seconds, type, padBytes);
  const storageId = await as.run((ctx) => ctx.storage.store(new Blob([data], { type })));
  const { grantId } = await as.mutation(api.studio.createInputUploadUrl, { slot });
  await as.mutation(api.studio.registerInputUpload, { storageId, grantId });
  // `convex-test` ne prenosi `contentType` u `_storage` metapodatke, pa red
  // ostane bez `mimeType`-a - a granice iz X1 se računaju baš po njemu. U
  // produkciji ga upisuje sam `registerInputUpload`, iz `_storage`.
  await as.run(async (ctx) => {
    const upload = await ctx.db
      .query("studioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    if (upload) await ctx.db.patch(upload._id, { mimeType: type });
  });

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
  // Upisano sa reda kataloga (nalaz W7-6) - poller kroz `by_provider_status`
  // ispituje SAMO ovaj provajder, bez skeniranja svih "running" poslova.
  expect(jobs[0].provider).toBe(seedOf("nano-banana-2").provider);
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
  const { grantId } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "audio" });
  await asUser.mutation(api.studio.registerInputUpload, { storageId, grantId });

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

test("fajl veći nego što mu zaglavlje tvrdi se naplaćuje po donjoj granici", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "kling-avatar");
  // Zaglavlje kaže sekundu, a u fajlu je 200 kB zvuka - na 512 kbps, najvišoj
  // tarifi koju AAC nosi, to je 3,125 s. Naplaćuje se granica, ne zaglavlje.
  const { storageId: audio, measured } = await storeMeasured(asUser, "audio/mp4", 1, 200_000);
  const image = await storeFile(asUser, "image/png");

  // Merenje i dalje vraća ono što u zaglavlju piše - granica je stvar naplate.
  expect(measured).toEqual({ ok: true, seconds: 1 });

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "kling-avatar",
    params: JSON.stringify({ quality: "720p" }),
    inputMode: "image_audio",
    inputs: JSON.stringify({ image: [image], audio: [audio] }),
  });

  const jobs = await jobsOf(t, userId);
  const params = JSON.parse(jobs[0].params) as Record<string, unknown>;
  expect(params.duration).toBe(4);
  expect(jobs[0].creditCost).toBe(
    computeCredits(seedOf("kling-avatar").priceRule, params, "image_audio"),
  );
  // Trag ostaje uz posao: po `durationSource`-u se prepoznaje ko je zaglavlje
  // prepravljao, a oba broja kažu koliko je razlika bila.
  expect(jobs[0].durationSource).toBe("lower_bound");
  expect(jobs[0].headerDurationS).toBe(1);
  expect(jobs[0].billedDurationS).toBeCloseTo(3.125, 3);
});

test("pošten fajl nosi `durationSource: header` i nijedan drugi broj", async () => {
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
  expect((JSON.parse(jobs[0].params) as Record<string, unknown>).duration).toBe(9);
  expect(jobs[0].durationSource).toBe("header");
  // Kad zaglavlje pobedi, oba broja bi bila isti podatak koji već stoji u
  // naplaćenoj količini - ne upisuju se.
  expect(jobs[0].headerDurationS).toBeUndefined();
  expect(jobs[0].billedDurationS).toBeUndefined();
});

test("posao bez merene količine nema izvor trajanja", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "nano-banana-2");

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "nano-banana-2",
    params: JSON.stringify({ prompt: "lisica u snegu", resolution: "2K" }),
    inputMode: "text",
  });

  const jobs = await jobsOf(t, userId);
  expect(jobs[0].durationSource).toBeUndefined();
});

test("zaglavlje duže nego što fajl te veličine može da traje obara posao pre naplate", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "dubbing");
  // Deset sati u fajlu od dvesta bajtova: `studioUsageDaily` bi upisao 600
  // minuta i pojeo tuđi dnevni plafon, a fal ne bi obradio ništa.
  const { storageId: audio, measured } = await storeMeasured(asUser, "audio/mp4", 36_000, 0);

  expect(measured).toEqual({ ok: true, seconds: 36_000 });

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "dubbing",
      params: JSON.stringify({ target_language: "en" }),
      inputMode: "audio",
      inputs: JSON.stringify({ audio: [audio] }),
    }),
  ).rejects.toThrow("ZAGLAVLJE_NEMOGUCE");

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

// ── Gemini Omni: nastavak prethodne generacije (nalaz S3, W7) ──────────────

/** Posao koji izgleda kao gotova ranija generacija - ono na šta `sourceJobId` pokazuje. */
async function seedDoneJob(
  t: TestConvex,
  userId: Id<"users">,
  overrides: Partial<{
    modelSlug: string;
    status: "reserved" | "running" | "done" | "failed" | "refunded";
    providerRequestId: string;
  }> = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: overrides.modelSlug ?? "gemini-omni",
      kind: "video" as const,
      params: JSON.stringify({ prompt: "prva generacija" }),
      promptHash: "0123456789abcdef",
      status: overrides.status ?? "done",
      creditCost: 66,
      inputMode: "text",
      ...(overrides.providerRequestId ? { providerRequestId: overrides.providerRequestId } : {}),
      createdAt: 1,
      completedAt: 1,
    }),
  );
}

test("Gemini Omni video rezim bez izabranog izvora se odbija", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "gemini-omni");

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "gemini-omni",
      params: JSON.stringify({ prompt: "nastavi klip", aspect_ratio: "16:9", duration: 5 }),
      inputMode: "video",
    }),
  ).rejects.toThrow("IZVOR_NIJE_IZABRAN");

  expect(await jobsOf(t, userId)).toHaveLength(0);
});

test("izvor mora biti GOTOVA generacija ISTOG modela, u vlasništvu istog korisnika", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "gemini-omni");

  const wrongModel = await seedDoneJob(t, userId, {
    modelSlug: "veo-31-fast",
    providerRequestId: "models/veo/operations/1",
  });
  const notDone = await seedDoneJob(t, userId, {
    status: "running",
    providerRequestId: "interactions/intr_u_letu",
  });

  const strangerId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "tudji-omni@example.com",
      name: "Tudji",
      username: "tudji_omni",
      role: "student" as const,
      language: "sr" as const,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const strangersJob = await seedDoneJob(t, strangerId, { providerRequestId: "interactions/intr_tudji" });

  for (const sourceJobId of [wrongModel, notDone, strangersJob]) {
    await expect(
      asUser.mutation(api.studio.createJob, {
        modelSlug: "gemini-omni",
        params: JSON.stringify({ prompt: "nastavi klip", aspect_ratio: "16:9", duration: 5 }),
        inputMode: "video",
        sourceJobId,
      }),
    ).rejects.toThrow("IZVOR_NIJE_DOSTUPAN");
  }

  // Samo `wrongModel` i `notDone` su seedovani direktno na `userId` - nijedan
  // pokušaj gore nije uspeo da doda treći.
  expect(await jobsOf(t, userId)).toHaveLength(2);
});

test("važeći izvor upisuje njegov providerRequestId u previous_interaction_id", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "gemini-omni");
  const sourceJobId = await seedDoneJob(t, userId, { providerRequestId: "interactions/intr_prvi" });

  await asUser.mutation(api.studio.createJob, {
    modelSlug: "gemini-omni",
    params: JSON.stringify({ prompt: "nastavi klip", aspect_ratio: "16:9", duration: 5 }),
    inputMode: "video",
    sourceJobId,
  });

  const jobs = await jobsOf(t, userId);
  // Novi posao, ne izmena starog - `sourceJobId` se ne pamti kao veza u šemi,
  // samo se njegov `providerRequestId` prenosi kao ulaz sledećeg zahteva
  // (`providers/google.ts` ga tumači i skida "interactions/" prefiks).
  const newJob = jobs.find((job) => job._id !== sourceJobId);
  const params = JSON.parse(newJob!.params) as Record<string, unknown>;
  expect(params.previous_interaction_id).toBe("interactions/intr_prvi");
});

test("sourceJobId poslat za rezim koji ga ne traži se odbija", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "gemini-omni");
  const sourceJobId = await seedDoneJob(t, userId, { providerRequestId: "interactions/intr_prvi" });

  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "gemini-omni",
      params: JSON.stringify({ prompt: "obicna slika" }),
      inputMode: "text",
      sourceJobId,
    }),
  ).rejects.toThrow("IZVOR_NIJE_PODRZAN");

  expect(await jobsOf(t, userId)).toHaveLength(1);
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

  const { grantId } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "image" });
  await expect(
    asUser.mutation(api.studio.registerInputUpload, { storageId: strangersFile, grantId }),
  ).rejects.toThrow("TUDJI_FAJL");

  // Ponovljena prijava istog fajla od istog korisnika nije greška i ne pravi
  // drugi red - mrežni ponovni pokušaj sme da prođe dvaput. Dozvola je već
  // potrošena, pa se druga prijava oslanja na postojeći red, ne na nju.
  const strangersGrant = await stranger.mutation(api.studio.createInputUploadUrl, { slot: "image" });
  await stranger.mutation(api.studio.registerInputUpload, {
    storageId: strangersFile,
    grantId: strangersGrant.grantId,
  });
  expect(await uploadsOf(t)).toHaveLength(1);

  const deleted = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["x"], { type: "image/png" }));
    await ctx.storage.delete(storageId);

    return storageId;
  });
  await expect(
    asUser.mutation(api.studio.registerInputUpload, { storageId: deleted, grantId }),
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

// -- N3: prijava se prima samo uz dozvolu koju je server izdao (X5) ---------

/** Gol fajl u storage-u, bez ijednog reda u `studioUploads` - "sirov" ID. */
function rawFile(t: TestConvex, type = "image/png") {
  return t.run((ctx) => ctx.storage.store(new Blob(["x"], { type })));
}

function grantsOf(t: TestConvex) {
  return t.run((ctx) => ctx.db.query("studioUploadGrants").collect());
}

test("bez dozvole se ne prijavljuje ni sopstveni fajl", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  // Naslovna slika kursa i avatar zive u ISTOM `_storage` imenskom prostoru kao
  // studijski uploadi, pa sirov ID mora da bude bezvredan sam po sebi.
  const foreign = await rawFile(t);

  const { grantId } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "image" });
  // Izmisljena dozvola: ispravan oblik ID-ja, ali reda nema.
  const bogus = await t.run(async (ctx) => {
    const id = await ctx.db.insert("studioUploadGrants", {
      userId,
      slot: "image",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    await ctx.db.delete(id);

    return id;
  });

  await expect(
    asUser.mutation(api.studio.registerInputUpload, { storageId: foreign, grantId: bogus }),
  ).rejects.toThrow("NEDOZVOLJEN_UPLOAD");
  expect(await uploadsOf(t)).toHaveLength(0);

  // Sa svojom dozvolom isti fajl prolazi - dozvola je jedina razlika.
  await asUser.mutation(api.studio.registerInputUpload, { storageId: foreign, grantId });
  expect(await uploadsOf(t)).toHaveLength(1);
});

test("dozvola drugog korisnika ne vredi", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  const stranger = await seedStranger(t);
  const file = await rawFile(t);

  const strangersGrant = await stranger.mutation(api.studio.createInputUploadUrl, {
    slot: "image",
  });

  await expect(
    asUser.mutation(api.studio.registerInputUpload, {
      storageId: file,
      grantId: strangersGrant.grantId,
    }),
  ).rejects.toThrow("NEDOZVOLJEN_UPLOAD");
  expect(await uploadsOf(t)).toHaveLength(0);
});

test("dozvola vredi jednom: drugi fajl na istu dozvolu pada", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  const first = await rawFile(t);
  const second = await rawFile(t, "image/jpeg");

  const { grantId } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "image" });
  await asUser.mutation(api.studio.registerInputUpload, { storageId: first, grantId });
  expect((await grantsOf(t))[0].usedAt).toBeGreaterThan(0);

  await expect(
    asUser.mutation(api.studio.registerInputUpload, { storageId: second, grantId }),
  ).rejects.toThrow("NEDOZVOLJEN_UPLOAD");
  expect(await uploadsOf(t)).toHaveLength(1);
});

test("istekla dozvola pada", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  const file = await rawFile(t);

  const { grantId } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "image" });
  // Forma je stajala otvorena duze od sata; rok je prosao pre nego sto je
  // upload zavrsen.
  await t.run((ctx) => ctx.db.patch(grantId, { expiresAt: Date.now() - 60_000 }));

  await expect(
    asUser.mutation(api.studio.registerInputUpload, { storageId: file, grantId }),
  ).rejects.toThrow("NEDOZVOLJEN_UPLOAD");
  expect(await uploadsOf(t)).toHaveLength(0);
});

test("dozvola ne pokriva fajl koji je u storage-u stajao pre nje", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  // Zatecen tudji fajl: naslovna slika kursa, avatar, slika objave. Napadac ga
  // vidi, pa TEK ONDA traži svoju dozvolu - i to je jedini put koji je
  // dozvola sama po sebi ostavljala otvorenim.
  const older = await rawFile(t);

  const { grantId } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "image" });
  // `convex-test` ne ume da unazadi `_creationTime` fajla, pa se ista razlika
  // pravi sa druge strane: dozvola izdata posle fajla, preko tolerancije.
  await t.run((ctx) =>
    ctx.db.patch(grantId, { createdAt: Date.now() + UPLOAD_GRANT_CLOCK_SLACK_MS + 60_000 }),
  );

  await expect(
    asUser.mutation(api.studio.registerInputUpload, { storageId: older, grantId }),
  ).rejects.toThrow("NEDOZVOLJEN_UPLOAD");
  expect(await uploadsOf(t)).toHaveLength(0);
});

test("posten tok prolazi, a slot dolazi iz dozvole a ne sa klijenta", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  const file = await rawFile(t, "audio/mpeg");

  const { uploadUrl, grantId } = await asUser.mutation(api.studio.createInputUploadUrl, {
    slot: "audio",
  });
  expect(uploadUrl).toContain("http");
  await asUser.mutation(api.studio.registerInputUpload, { storageId: file, grantId });

  const [upload] = await uploadsOf(t);
  expect(upload.userId).toBe(userId);
  expect(upload.storageId).toBe(file);
  expect(upload.slot).toBe("audio");
});

// -- N4: merenje ne sme da se ponavlja u petlji (X5) ------------------------

/**
 * `fetch` koji broji pozive i vraca bajtove koje merenje ne ume da procita -
 * tacno slucaj iz nalaza: `durationS` se nikad ne upise, pa bez brojaca svaki
 * naredni poziv iznova povlaci bajtove.
 */
function countingRangeServer(data: Uint8Array) {
  const calls = { count: 0 };
  const inner = rangeServer(data);
  const server = (url: string, init?: { headers?: Record<string, string> }) => {
    calls.count += 1;

    return inner(url, init);
  };

  return { calls, server };
}

const UNREADABLE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, ...new Array(200).fill(7)]);

async function storeUnreadable(t: TestConvex, as: TestUser) {
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([UNREADABLE], { type: "audio/mp4" })),
  );
  const { grantId } = await as.mutation(api.studio.createInputUploadUrl, { slot: "audio" });
  await as.mutation(api.studio.registerInputUpload, { storageId, grantId });

  return storageId;
}

test("cetvrto merenje istog neparsabilnog fajla ne dira storage", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  const storageId = await storeUnreadable(t, asUser);

  const { calls, server } = countingRangeServer(UNREADABLE);
  vi.stubGlobal("fetch", server);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await asUser.action(api.studioActions.measureInputUpload, { storageId });
      expect(result).toEqual({ ok: false, reason: "NEPOZNAT_FORMAT" });
    }
    const readsAfterThree = calls.count;
    expect(readsAfterThree).toBeGreaterThan(0);

    const fourth = await asUser.action(api.studioActions.measureInputUpload, { storageId });

    expect(fourth).toEqual({ ok: false, reason: "MERENJE_ODBIJENO" });
    // Kljuc nalaza: odbijeno merenje ne sme da povuce nijedan bajt.
    expect(calls.count).toBe(readsAfterThree);
  } finally {
    vi.unstubAllGlobals();
  }

  const [upload] = await uploadsOf(t);
  expect(upload.measureFailures).toBe(3);
});

test("uspesno merenje brise brojac neuspeha", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await seedUser(t);
  const data = mp4Bytes(4.2, "video/mp4");
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([data], { type: "video/mp4" })),
  );
  const { grantId } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "video" });
  await asUser.mutation(api.studio.registerInputUpload, { storageId, grantId });
  // Dva ranija neuspeha (mreza), pa fajl koji se ipak procita.
  await t.run(async (ctx) => {
    const [upload] = await ctx.db.query("studioUploads").collect();
    await ctx.db.patch(upload._id, { measureFailures: 2 });
  });

  vi.stubGlobal("fetch", rangeServer(data));
  try {
    const measured = await asUser.action(api.studioActions.measureInputUpload, { storageId });
    expect(measured).toEqual({ ok: true, seconds: 4.2 });
  } finally {
    vi.unstubAllGlobals();
  }

  const [upload] = await uploadsOf(t);
  expect(upload.durationS).toBe(4.2);
  expect(upload.measureFailures).toBeUndefined();
});

test("preko 30 uploada na sat merenje se odbija bez citanja", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  const storageId = await storeUnreadable(t, asUser);
  // Grubi rate limit po korisniku: svaki poziv koji stvarno cita bajtove mora
  // da ima svoj red u `studioUploads`, pa se broje redovi iz poslednjeg sata.
  await t.run(async (ctx) => {
    for (let index = 0; index < MEASURE_UPLOAD_HOURLY_LIMIT; index += 1) {
      const file = await ctx.storage.store(new Blob(["x"], { type: "image/png" }));
      await ctx.db.insert("studioUploads", {
        userId,
        storageId: file,
        slot: "image",
        bytes: 1,
        createdAt: Date.now(),
      });
    }
  });

  const { calls, server } = countingRangeServer(UNREADABLE);
  vi.stubGlobal("fetch", server);
  try {
    const result = await asUser.action(api.studioActions.measureInputUpload, { storageId });

    expect(result).toEqual({ ok: false, reason: "MERENJE_ODBIJENO" });
    expect(calls.count).toBe(0);
  } finally {
    vi.unstubAllGlobals();
  }
});

// -- N2 od pocetka do kraja (X2) --------------------------------------------

test("napad iz N2 zavrsava naplacenih 120 minuta, nikad 0,1", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "dubbing");
  // Zaglavlje kaze sest sekundi i fajl je toliko velik da granica iz X1 nema
  // sta da podigne - dakle rezervacija JESTE 0,1 minut, kao u izvestaju.
  const { storageId: audio } = await storeMeasured(asUser, "audio/mp4", 6);

  const jobId = await asUser.mutation(api.studio.createJob, {
    modelSlug: "dubbing",
    params: JSON.stringify({ target_language: "en" }),
    inputMode: "audio",
    inputs: JSON.stringify({ audio: [audio] }),
  });

  const reserved = await jobsOf(t, userId);
  expect((JSON.parse(reserved[0].params) as Record<string, unknown>).minutes).toBe(0.1);
  expect(reserved[0].creditCost).toBe(13);
  expect(reserved[0].estimatedCostUsd).toBeCloseTo(0.06, 6);

  // fal je obradio dva sata i toliko ce i naplatiti.
  await t.mutation(internal.studio.settleJobCredits, { jobId, reportedSeconds: 7200 });

  // Skinuto je 120 minuta, a oba plafona od sada gledaju 72 $, a ne 0,06 $.
  expect(await balanceOf(t, userId)).toBe(100000 - 15570);
  const usage = await t.run((ctx) =>
    ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayKey(Date.now())))
      .unique(),
  );
  expect(usage?.costUsd).toBeCloseTo(72, 6);
});

test("zbir neporavnatih poslova u letu blokira sledeci posao", async () => {
  const t = convexTest(schema, modules);
  const { userId, asUser } = await seedUser(t);
  await seedCatalogModel(t, "dubbing");
  // 160 s -> 2,7 minuta -> 1,62 $ po poslu; dva takva su 3,24 $ u vazduhu.
  const { storageId: audio } = await storeMeasured(asUser, "audio/mp4", 160);
  const { storageId: kratak } = await storeMeasured(asUser, "audio/mp4", 6);

  for (let round = 0; round < 2; round += 1) {
    await asUser.mutation(api.studio.createJob, {
      modelSlug: "dubbing",
      params: JSON.stringify({ target_language: "en" }),
      inputMode: "audio",
      inputs: JSON.stringify({ audio: [audio] }),
    });
  }
  expect(await jobsOf(t, userId)).toHaveLength(2);

  // Treci posao kosta 0,06 $, dakle ni dnevni plafon od 5 $ ni granica od tri
  // paralelna posla ga ne bi odbili - odbija ga bas neporavnata izlozenost.
  await expect(
    asUser.mutation(api.studio.createJob, {
      modelSlug: "dubbing",
      params: JSON.stringify({ target_language: "en" }),
      inputMode: "audio",
      inputs: JSON.stringify({ audio: [kratak] }),
    }),
  ).rejects.toThrow("PREVISE_NEPORAVNATOG");
  expect(await jobsOf(t, userId)).toHaveLength(2);
});
