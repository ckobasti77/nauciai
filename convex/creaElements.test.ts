/// <reference types="vite/client" />

/**
 * Likovi i elementi (K14, S34/S35/S36/S24): čuvanje (pristanak, provera fotke,
 * pominjanje, limit), vlasništvo (tuđe slike i tuđi Lik se ne primaju), slike
 * elementa kao reference kroz POSTOJEĆI `createJob`, pinovane slike koje ni
 * brisanje rada ni rokovi ne diraju, „Zameni lik" i „Sačuvaj kao Lik" iz kreatora.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { characterSheetPrompt, DEFAULT_CHARACTER } from "../lib/crea-character";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { elementInputs, ELEMENTS_MAX, promptWithElements } from "./creaElementsCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";
import { parseInputModes, parseInputSpec } from "./studioJobCore";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type TestUser = ReturnType<TestConvex["withIdentity"]>;

const GOOD_CHECK = { faces: 1, faceRatio: 0.32, sharpness: 180, ok: true };

async function seedUser(t: TestConvex, email = "mila@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Mila Crea",
      username: email.split("@")[0],
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.mutation(internal.credits.grantCredits, {
    userId,
    amount: 10_000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function seedCatalogModel(t: TestConvex, slug: string) {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug)!;
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

/** Blob sa tipom u `_storage` (`convex-test` tip iz `Blob`-a ne prenosi). */
async function storeBlob(t: TestConvex, contentType = "image/jpeg") {
  return t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["slika"]));
    await ctx.db.patch(id as unknown as Id<"studioUploads">, { contentType } as never);
    return id;
  });
}

/** Fotka okačena kao iz alata: dozvola → upload → prijava. */
async function uploadPhoto(t: TestConvex, as: TestUser, contentType = "image/jpeg") {
  const storageId = await storeBlob(t, contentType);
  const { grantId } = await as.mutation(api.studio.createInputUploadUrl, { slot: "image" });
  await as.mutation(api.studio.registerInputUpload, { storageId, grantId });
  return storageId;
}

async function uploadRow(t: TestConvex, storageId: Id<"_storage">) {
  return t.run((ctx) =>
    ctx.db
      .query("studioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first(),
  );
}

async function fileExists(t: TestConvex, storageId: Id<"_storage">) {
  return t.run(async (ctx) => (await ctx.db.system.get("_storage", storageId)) !== null);
}

async function saveLik(t: TestConvex, as: TestUser, name = "Maja", count = 2) {
  const images = [];
  for (let index = 0; index < count; index += 1) images.push(await uploadPhoto(t, as));
  const saved = await as.mutation(api.creaElements.saveElement, {
    kind: "lik",
    name,
    imageStorageIds: images,
    consent: true,
    photoCheck: GOOD_CHECK,
  });
  return { ...saved, images };
}

function catalogModel(slug: string) {
  const seed = STUDIO_MODELS.find((model) => model.slug === slug)!;
  return { inputModes: parseInputModes(JSON.stringify(seed.inputModes)), inputSpec: parseInputSpec(JSON.stringify(seed.inputSpec)) };
}

describe("čuvanje elementa", () => {
  test("Lik traži pristanak i prošlu proveru fotke; sačuvan Lik pinuje slike", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const photo = await uploadPhoto(t, asUser);
    const base = { kind: "lik" as const, name: "Maja", imageStorageIds: [photo] };

    await expect(asUser.mutation(api.creaElements.saveElement, { ...base, photoCheck: GOOD_CHECK })).rejects.toThrow(
      "PRISTANAK_OBAVEZAN",
    );
    await expect(asUser.mutation(api.creaElements.saveElement, { ...base, consent: false, photoCheck: GOOD_CHECK })).rejects.toThrow(
      "PRISTANAK_OBAVEZAN",
    );
    await expect(asUser.mutation(api.creaElements.saveElement, { ...base, consent: true })).rejects.toThrow("PROVERA_FOTKE");
    await expect(
      asUser.mutation(api.creaElements.saveElement, { ...base, consent: true, photoCheck: { ...GOOD_CHECK, ok: false } }),
    ).rejects.toThrow("PROVERA_FOTKE");
    await expect(
      asUser.mutation(api.creaElements.saveElement, { ...base, consent: true, photoCheck: { ...GOOD_CHECK, faces: 2 } }),
    ).rejects.toThrow("PROVERA_FOTKE");

    const saved = await asUser.mutation(api.creaElements.saveElement, { ...base, consent: true, photoCheck: GOOD_CHECK });
    expect(saved.handle).toBe("maja");
    const row = await t.run((ctx) => ctx.db.get(saved.elementId));
    expect(row).toMatchObject({ kind: "lik", origin: "foto", imageStorageIds: [photo], coverStorageId: photo, photoCheck: GOOD_CHECK });
    expect(typeof row?.consentAt).toBe("number");
    const upload = await uploadRow(t, photo);
    expect(typeof upload?.pinnedAt).toBe("number");
    expect(upload?.expiresAt).toBeUndefined();
  });

  test("mesto i predmet ne traže pristanak ni proveru; isto ime dobija drugo pominjanje", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const first = await asUser.mutation(api.creaElements.saveElement, {
      kind: "mesto",
      name: "Кафана код Мике",
      description: "drveni stolovi",
      imageStorageIds: [await uploadPhoto(t, asUser)],
    });
    expect(first.handle).toBe("kafana_kod_mike");
    const second = await asUser.mutation(api.creaElements.saveElement, {
      kind: "predmet",
      name: "Kafana kod Mike",
      imageStorageIds: [await uploadPhoto(t, asUser, "image/png")],
    });
    expect(second.handle).toBe("kafana_kod_mike2");
    const row = await t.run((ctx) => ctx.db.get(first.elementId));
    expect(row?.consentAt).toBeUndefined();
    expect(row?.description).toBe("drveni stolovi");
  });

  test("slike: samo svoje, samo slike, bez aliasa, ne tuđeg elementa, 1-8", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const foreign = await uploadPhoto(t, other.asUser);
    const mesto = (imageStorageIds: Id<"_storage">[]) =>
      asUser.mutation(api.creaElements.saveElement, { kind: "mesto", name: "Park", imageStorageIds });

    await expect(mesto([foreign])).rejects.toThrow("TUDJI_FAJL");
    // Fajl bez prijave (nije upload ovog korisnika) takođe.
    await expect(mesto([await storeBlob(t)])).rejects.toThrow("TUDJI_FAJL");
    await expect(mesto([])).rejects.toThrow("BROJ_SLIKA_ELEMENTA");
    const photo = await uploadPhoto(t, asUser);
    await expect(mesto([photo, photo])).rejects.toThrow("BROJ_SLIKA_ELEMENTA");
    const nine = [];
    for (let index = 0; index < 9; index += 1) nine.push(await uploadPhoto(t, asUser));
    await expect(mesto(nine)).rejects.toThrow("BROJ_SLIKA_ELEMENTA");

    // Slika koju već drži drugi element.
    await mesto([photo]);
    await expect(mesto([photo])).rejects.toThrow("SLIKA_ZAUZETA");

    // Alias (izlaz rada kao ulaz, K05) nije slika elementa: blob pripada radu.
    const output = await storeBlob(t);
    await t.run(async (ctx) => {
      const jobId = await ctx.db.insert("generationJobs", {
        userId,
        modelSlug: "nano-banana-2",
        kind: "image",
        params: "{}",
        promptHash: "0".repeat(16),
        status: "done",
        creditCost: 1,
        outputStorageId: output,
        createdAt: 1,
      });
      await ctx.db.insert("studioUploads", {
        userId,
        storageId: output,
        slot: "image",
        bytes: 5,
        mimeType: "image/jpeg",
        sourceJobId: jobId,
        createdAt: 1,
      });
    });
    await expect(mesto([output])).rejects.toThrow("NEISPRAVNA_SLIKA_ELEMENTA");
  });

  test("najviše 30 elemenata po korisniku", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < ELEMENTS_MAX; index += 1) {
        const storageId = await ctx.storage.store(new Blob(["x"]));
        await ctx.db.insert("creaElements", {
          userId,
          kind: "predmet",
          name: `Predmet ${index}`,
          handle: `predmet${index}`,
          imageStorageIds: [storageId],
          origin: "foto",
          createdAt: index,
          updatedAt: index,
        });
      }
    });
    await expect(
      asUser.mutation(api.creaElements.saveElement, { kind: "mesto", name: "Još", imageStorageIds: [await uploadPhoto(t, asUser)] }),
    ).rejects.toThrow("PREVISE_LIKOVA");
  });

  test("spisak vidi samo vlasnik; gost dobija grešku", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await saveLik(t, asUser);
    const mine = await asUser.query(api.creaElements.listMine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: "Maja", handle: "maja", kind: "lik", canSwap: true });
    expect(mine[0].images).toHaveLength(2);
    expect(mine[0].images[0].url).toBeTruthy();
    expect(await other.asUser.query(api.creaElements.listMine, {})).toEqual([]);
    await expect(t.query(api.creaElements.listMine, {})).rejects.toThrow();
  });

  test("izmena: uklonjena slika se briše, nova pinuje; tuđ element se ne menja ni ne briše", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const lik = await saveLik(t, asUser, "Maja", 2);
    const added = await uploadPhoto(t, asUser);

    await expect(
      other.asUser.mutation(api.creaElements.saveElement, {
        elementId: lik.elementId,
        kind: "lik",
        name: "Tuđa",
        imageStorageIds: [await uploadPhoto(t, other.asUser)],
        consent: true,
        photoCheck: GOOD_CHECK,
      }),
    ).rejects.toThrow("ELEMENT_NIJE_PRONADJEN");
    expect(await other.asUser.mutation(api.creaElements.deleteElement, { elementId: lik.elementId })).toBe(false);

    // Nove slike Lika traže novu proveru.
    await expect(
      asUser.mutation(api.creaElements.saveElement, {
        elementId: lik.elementId,
        kind: "lik",
        name: "Maja",
        imageStorageIds: [lik.images[0], added],
        consent: true,
      }),
    ).rejects.toThrow("PROVERA_FOTKE");
    await asUser.mutation(api.creaElements.saveElement, {
      elementId: lik.elementId,
      kind: "lik",
      name: "Maja",
      imageStorageIds: [lik.images[0], added],
      consent: true,
      photoCheck: GOOD_CHECK,
    });
    expect(await fileExists(t, lik.images[1])).toBe(false);
    expect(await uploadRow(t, lik.images[1])).toBeNull();
    expect(typeof (await uploadRow(t, added))?.pinnedAt).toBe("number");

    // Samo novo ime: bez nove provere, pominjanje prati ime.
    const renamed = await asUser.mutation(api.creaElements.saveElement, {
      elementId: lik.elementId,
      kind: "lik",
      name: "Maja Đokić",
      imageStorageIds: [lik.images[0], added],
      consent: true,
    });
    expect(renamed.handle).toBe("maja_djokic");
  });
});

describe("element kao referenca u poslu (mapiranje i vlasništvo)", () => {
  test("@maja šalje slike Lika kroz createJob; drugi korisnik ih ne može poslati", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedCatalogModel(t, "nano-banana-2");
    await saveLik(t, asUser, "Maja", 2);
    const [maja] = await asUser.query(api.creaElements.listMine, {});

    const mapping = elementInputs([maja], catalogModel("nano-banana-2"), { currentMode: "text", existingImages: 0 });
    if (!mapping.ok) throw new Error(mapping.reason);
    const prompt = promptWithElements("@maja na plaži", [maja], mapping.refs);
    const inputs = { image: mapping.images.map((image) => image.storageId) };

    const jobId = await asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt }),
      inputMode: mapping.inputMode,
      inputs: JSON.stringify(inputs),
    });
    const job = await t.run((ctx) => ctx.db.get(jobId as Id<"generationJobs">));
    expect(job).toMatchObject({ status: "reserved", inputMode: "image_multi" });
    expect(JSON.parse(job!.inputs!)).toEqual(inputs);
    expect(JSON.parse(job!.params).prompt).toContain("Images 1-2 show Maja, the character");
    // Ulaz posla ne skida pin.
    expect(typeof (await uploadRow(t, inputs.image[0] as Id<"_storage">))?.pinnedAt).toBe("number");

    await seedCatalogModel(t, "nano-banana-pro");
    await expect(
      other.asUser.mutation(api.studio.createJob, {
        modelSlug: "nano-banana-2",
        params: JSON.stringify({ prompt: "tuđ lik" }),
        inputMode: "image_multi",
        inputs: JSON.stringify(inputs),
      }),
    ).rejects.toThrow("TUDJI_FAJL");
  });

  test("ni rok izlaza, ni brisanje rada, ni cron ne diraju slike Lika", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await seedCatalogModel(t, "nano-banana-2");
    const lik = await saveLik(t, asUser, "Maja", 1);
    const jobId = (await asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "Maja u parku" }),
      inputMode: "image_multi",
      inputs: JSON.stringify({ image: lik.images }),
    })) as Id<"generationJobs">;

    const output = await storeBlob(t, "image/png");
    await t.run((ctx) => ctx.db.patch(jobId, { status: "done" }));
    await t.mutation(internal.studio.finalizeOutput, { jobId, storageId: output, mimeType: "image/png", byteSize: 5 });
    expect((await uploadRow(t, lik.images[0]))?.expiresAt).toBeUndefined();

    await asUser.mutation(api.studio.deleteJob, { jobId });
    expect(await fileExists(t, lik.images[0])).toBe(true);
    expect(await uploadRow(t, lik.images[0])).not.toBeNull();

    // Odbrana: i da nekako dobije rok, cron ga ne briše.
    const row = await uploadRow(t, lik.images[0]);
    await t.run((ctx) => ctx.db.patch(row!._id, { expiresAt: 1 }));
    await t.mutation(internal.crons.expireGenerationFiles, {});
    expect(await fileExists(t, lik.images[0])).toBe(true);
    expect((await uploadRow(t, lik.images[0]))?.expiresAt).toBeUndefined();
  });

  test("brisanje Lika briše slike; slika koju koristi rad ostaje uz rad, sa rokom", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await seedCatalogModel(t, "nano-banana-2");
    const lik = await saveLik(t, asUser, "Maja", 2);
    await asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-2",
      params: JSON.stringify({ prompt: "Maja" }),
      inputMode: "image_multi",
      inputs: JSON.stringify({ image: [lik.images[0]] }),
    });

    expect(await asUser.mutation(api.creaElements.deleteElement, { elementId: lik.elementId })).toBe(true);
    expect(await asUser.query(api.creaElements.listMine, {})).toEqual([]);
    // Koristi je rad: fajl ostaje, više nije pinovan, ima rok.
    expect(await fileExists(t, lik.images[0])).toBe(true);
    const used = await uploadRow(t, lik.images[0]);
    expect(used?.pinnedAt).toBeUndefined();
    expect(typeof used?.expiresAt).toBe("number");
    // Ne koristi je niko: obrisana.
    expect(await fileExists(t, lik.images[1])).toBe(false);
    expect(await uploadRow(t, lik.images[1])).toBeNull();
  });
});

describe("Zameni lik (S24)", () => {
  test("samo svoj Lik sa pristankom; opis i slike Lika dodaje server", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedCatalogModel(t, "nano-banana-pro");
    await seedCatalogModel(t, "nano-banana-2");
    const lik = await saveLik(t, asUser, "Maja", 2);
    const target = await uploadPhoto(t, asUser);
    const args = {
      elementId: lik.elementId,
      targetStorageId: target,
      modelSlug: "nano-banana-pro",
      params: JSON.stringify({ prompt: "podmetnut opis", resolution: "2K" }),
      consent: true as const,
    };

    const jobId = await asUser.mutation(api.creaElements.startFaceSwap, args);
    const job = await t.run((ctx) => ctx.db.get(jobId as Id<"generationJobs">));
    expect(job).toMatchObject({ userId, modelSlug: "nano-banana-pro", inputMode: "image_multi", status: "reserved" });
    expect(JSON.parse(job!.inputs!)).toEqual({ image: [target, ...lik.images] });
    const params = JSON.parse(job!.params) as { prompt: string };
    expect(params.prompt).not.toContain("podmetnut");
    expect(params.prompt).toContain("Image 1 is the photo to change. Images 2-3 show Maja.");
    expect(job!.creditCost).toBeGreaterThan(0);

    // Tuđi Lik, tuđa fotka, pogrešan model, pristanak koji nije `true`.
    await expect(other.asUser.mutation(api.creaElements.startFaceSwap, { ...args, targetStorageId: await uploadPhoto(t, other.asUser) })).rejects.toThrow(
      "LIK_NIJE_DOSTUPAN",
    );
    await expect(asUser.mutation(api.creaElements.startFaceSwap, { ...args, targetStorageId: await uploadPhoto(t, other.asUser) })).rejects.toThrow(
      "TUDJI_FAJL",
    );
    await expect(asUser.mutation(api.creaElements.startFaceSwap, { ...args, modelSlug: "gpt-image-2" })).rejects.toThrow("MODEL_NE_MENJA_LIK");
    await expect(
      asUser.mutation(api.creaElements.startFaceSwap, { ...args, consent: false as unknown as true }),
    ).rejects.toThrow();
  });

  test("mesto, predmet i Lik bez pristanka se ne menjaju", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedCatalogModel(t, "nano-banana-pro");
    const mesto = await asUser.mutation(api.creaElements.saveElement, {
      kind: "mesto",
      name: "Plaža",
      imageStorageIds: [await uploadPhoto(t, asUser)],
    });
    const noConsent = await t.run(async (ctx) =>
      ctx.db.insert("creaElements", {
        userId,
        kind: "lik",
        name: "Bez pristanka",
        handle: "bez_pristanka",
        imageStorageIds: [await ctx.storage.store(new Blob(["x"]))],
        origin: "foto",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const target = await uploadPhoto(t, asUser);
    for (const elementId of [mesto.elementId, noConsent]) {
      await expect(
        asUser.mutation(api.creaElements.startFaceSwap, {
          elementId,
          targetStorageId: target,
          modelSlug: "nano-banana-pro",
          params: "{}",
          consent: true,
        }),
      ).rejects.toThrow("LIK_NIJE_DOSTUPAN");
    }
  });
});

describe("Sačuvaj kao Lik iz kreatora (S36)", () => {
  test("list lika se naručuje kroz createJob iz opisa, bez slika (isti zahtev kao alat)", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await seedCatalogModel(t, "nano-banana-pro");
    const prompt = characterSheetPrompt(DEFAULT_CHARACTER);
    const jobId = await asUser.mutation(api.studio.createJob, {
      modelSlug: "nano-banana-pro",
      params: JSON.stringify({ prompt, aspect_ratio: "16:9" }),
      inputMode: "text",
      inputs: JSON.stringify({}),
    });
    const job = await t.run((ctx) => ctx.db.get(jobId as Id<"generationJobs">));
    expect(job).toMatchObject({ status: "reserved", modelSlug: "nano-banana-pro" });
    expect(JSON.parse(job!.params)).toMatchObject({ prompt, aspect_ratio: "16:9" });
    expect(job!.creditCost).toBeGreaterThan(0);
  });

  async function creatorJob(t: TestConvex, userId: Id<"users">, opts: { prompt?: string; mock?: boolean; contentType?: string } = {}) {
    const output = await storeBlob(t, opts.contentType ?? "image/png");
    const jobId = await t.run((ctx) =>
      ctx.db.insert("generationJobs", {
        userId,
        modelSlug: "nano-banana-pro",
        kind: "image",
        params: JSON.stringify({ prompt: opts.prompt ?? characterSheetPrompt(DEFAULT_CHARACTER), aspect_ratio: "16:9" }),
        promptHash: "0".repeat(16),
        status: "done",
        creditCost: 33,
        outputStorageId: output,
        ...(opts.mock ? { falRequestId: "mock-list" } : {}),
        createdAt: 1,
      }),
    );
    return { jobId, output };
  }

  test("list se kopira u nov fajl i postaje izmišljen Lik sa pristankom", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const { jobId, output } = await creatorJob(t, userId);

    const saved = await asUser.action(api.creaElements.saveFromJob, { jobId, name: "Mila", consent: true });
    expect(saved.handle).toBe("mila");
    const row = await t.run((ctx) => ctx.db.get(saved.elementId));
    expect(row).toMatchObject({ kind: "lik", origin: "kreator", sourceJobId: jobId });
    expect(typeof row?.consentAt).toBe("number");
    const copy = row!.imageStorageIds[0];
    expect(copy).not.toBe(output);
    expect(await uploadRow(t, copy)).toMatchObject({ mimeType: "image/png", slot: "image" });
    expect(typeof (await uploadRow(t, copy))?.pinnedAt).toBe("number");

    // Rad sa listom može da se obriše - Lik ostaje.
    await asUser.mutation(api.studio.deleteJob, { jobId });
    expect(await fileExists(t, copy)).toBe(true);
    expect((await asUser.query(api.creaElements.listMine, {}))[0]).toMatchObject({ canSwap: true, origin: "kreator" });

    // Slike lista se ne menjaju (ime da).
    await expect(
      asUser.mutation(api.creaElements.saveElement, {
        elementId: saved.elementId,
        kind: "lik",
        name: "Mila",
        imageStorageIds: [await uploadPhoto(t, asUser)],
        consent: true,
        photoCheck: GOOD_CHECK,
      }),
    ).rejects.toThrow("SLIKE_ZAKLJUCANE");
    const renamed = await asUser.mutation(api.creaElements.saveElement, {
      elementId: saved.elementId,
      kind: "lik",
      name: "Mila Ratnica",
      imageStorageIds: [copy],
      consent: true,
    });
    expect(renamed.handle).toBe("mila_ratnica");
  });

  test("običan rad, DEMO list i tuđ rad se ne primaju", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const plain = await creatorJob(t, userId, { prompt: "portret žene" });
    const demo = await creatorJob(t, userId, { mock: true });
    const svg = await creatorJob(t, userId, { contentType: "image/svg+xml" });
    const foreign = await creatorJob(t, other.userId);

    await expect(asUser.action(api.creaElements.saveFromJob, { jobId: plain.jobId, name: "X", consent: true })).rejects.toThrow("NIJE_LIST_LIKA");
    await expect(asUser.action(api.creaElements.saveFromJob, { jobId: demo.jobId, name: "X", consent: true })).rejects.toThrow("DEMO_LIST_LIKA");
    await expect(asUser.action(api.creaElements.saveFromJob, { jobId: svg.jobId, name: "X", consent: true })).rejects.toThrow("DEMO_LIST_LIKA");
    await expect(asUser.action(api.creaElements.saveFromJob, { jobId: foreign.jobId, name: "X", consent: true })).rejects.toThrow(
      "IZVOR_NIJE_DOSTUPAN",
    );
    expect(await asUser.query(api.creaElements.listMine, {})).toEqual([]);
  });

  test("neuspeo upis briše kopiju (npr. loše ime)", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const { jobId } = await creatorJob(t, userId);
    const before = await t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length);
    await expect(asUser.action(api.creaElements.saveFromJob, { jobId, name: "   ", consent: true })).rejects.toThrow(
      "NEISPRAVNO_IME_ELEMENTA",
    );
    const after = await t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length);
    expect(after).toBe(before);
  });
});
