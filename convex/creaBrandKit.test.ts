/// <reference types="vite/client" />

/**
 * Brend kit (S38, K15): jedan po korisniku, provere imena/boja/fontova/tona,
 * logo je SVOJ upload slike koji se pinuje (bez roka), a zamena i brisanje ga
 * oslobađaju. Tuđ fajl i alias nad izlazom rada ne mogu da postanu logo.
 */

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type TestUser = ReturnType<TestConvex["withIdentity"]>;

async function seedUser(t: TestConvex, email: string) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email,
      name: "Brend",
      username: email.split("@")[0]!,
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const courseId = await ctx.db.insert("courses", {
      slug: `kurs-${email}`,
      titleSr: "Kurs",
      titleEn: "Course",
      subtitleSr: "P",
      subtitleEn: "S",
      descriptionSr: "O",
      descriptionEn: "D",
      status: "published" as const,
      sortOrder: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("enrollments", { userId, courseId, status: "active" as const, startedAt: 1, updatedAt: 1 });
    return userId;
  });
  return { userId, as: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

/** Logo okačen kao iz alata; `convex-test` tip iz `Blob`-a ne prenosi, pa se upisuje ručno (kao u `creaElements.test.ts`). */
async function storeImage(as: TestUser, type = "image/png", slot = "image") {
  const storageId = await as.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["logo"]));
    await ctx.db.patch(id as unknown as Id<"studioUploads">, { contentType: type } as never);
    return id;
  });
  const digest = await as.run(async (ctx) => {
    const meta = await ctx.db.system.get("_storage", storageId);
    return { sha256: meta!.sha256, size: meta!.size };
  });
  const { grantId } = await as.mutation(api.studio.createInputUploadUrl, { slot, ...digest });
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

const KIT = { name: "  Pekara   Klas ", colors: ["#C8402F", "f4be30"], fonts: { heading: "lora", body: "nunito" }, tone: " topao " };

test("čuvanje: jedan kit po korisniku, sređene vrednosti, logo se pinuje", async () => {
  const t = makeT();
  const { as } = await seedUser(t, "klas@example.com");
  expect(await as.query(api.creaBrandKit.getMine, {})).toBeNull();

  const logo = await storeImage(as);
  expect((await uploadRow(t, logo))?.expiresAt).toBeDefined();
  await as.mutation(api.creaBrandKit.saveMine, { ...KIT, logoStorageId: logo });

  const kit = await as.query(api.creaBrandKit.getMine, {});
  expect(kit).toMatchObject({
    name: "Pekara Klas",
    colors: ["#c8402f", "#f4be30"],
    fonts: { heading: "lora", body: "nunito" },
    tone: "topao",
    logoStorageId: logo,
  });
  expect(kit?.logoUrl).toBeTruthy();
  const row = await uploadRow(t, logo);
  expect(row?.pinnedAt).toBeDefined();
  expect(row?.expiresAt).toBeUndefined();

  // Druga izmena menja isti red; logo se ne dira kad nije poslat.
  await as.mutation(api.creaBrandKit.saveMine, { ...KIT, name: "Klas 2" });
  const kits = await t.run((ctx) => ctx.db.query("creaBrandKits").collect());
  expect(kits).toHaveLength(1);
  expect(kits[0]).toMatchObject({ name: "Klas 2", logoStorageId: logo });
});

test("zamena logoa oslobađa stari (nekorišćen se briše), brisanje kita oslobađa logo", async () => {
  const t = makeT();
  const { as } = await seedUser(t, "zamena@example.com");
  const first = await storeImage(as);
  await as.mutation(api.creaBrandKit.saveMine, { ...KIT, logoStorageId: first });
  const second = await storeImage(as, "image/jpeg");
  await as.mutation(api.creaBrandKit.saveMine, { ...KIT, logoStorageId: second });

  expect(await uploadRow(t, first)).toBeNull();
  expect(await t.run((ctx) => ctx.storage.getUrl(first))).toBeNull();
  expect((await uploadRow(t, second))?.pinnedAt).toBeDefined();

  await as.mutation(api.creaBrandKit.saveMine, { ...KIT, logoStorageId: null });
  expect(await uploadRow(t, second)).toBeNull();
  expect((await as.query(api.creaBrandKit.getMine, {}))?.logoStorageId).toBeNull();

  const third = await storeImage(as);
  await as.mutation(api.creaBrandKit.saveMine, { ...KIT, logoStorageId: third });
  expect(await as.mutation(api.creaBrandKit.deleteMine, {})).toBe(true);
  expect(await as.query(api.creaBrandKit.getMine, {})).toBeNull();
  expect(await uploadRow(t, third)).toBeNull();
});

test("loše vrednosti i tuđ logo se odbijaju", async () => {
  const t = makeT();
  const { as } = await seedUser(t, "a@example.com");
  const { as: other } = await seedUser(t, "b@example.com");

  await expect(as.mutation(api.creaBrandKit.saveMine, { ...KIT, name: "  " })).rejects.toThrow("NEISPRAVNO_IME_BRENDA");
  await expect(as.mutation(api.creaBrandKit.saveMine, { ...KIT, colors: ["plava"] })).rejects.toThrow("NEISPRAVNE_BOJE_BRENDA");
  await expect(as.mutation(api.creaBrandKit.saveMine, { ...KIT, fonts: { heading: "comic", body: "nunito" } })).rejects.toThrow(
    "NEISPRAVAN_FONT_BRENDA",
  );
  await expect(as.mutation(api.creaBrandKit.saveMine, { ...KIT, tone: "x".repeat(301) })).rejects.toThrow("PREDUG_TON_BRENDA");

  const foreign = await storeImage(other);
  await expect(as.mutation(api.creaBrandKit.saveMine, { ...KIT, logoStorageId: foreign })).rejects.toThrow("TUDJI_FAJL");
  const video = await storeImage(as, "video/mp4", "video");
  await expect(as.mutation(api.creaBrandKit.saveMine, { ...KIT, logoStorageId: video })).rejects.toThrow("NEISPRAVAN_LOGO");

  // Kit drugog korisnika se ne vidi.
  await other.mutation(api.creaBrandKit.saveMine, KIT);
  expect(await as.query(api.creaBrandKit.getMine, {})).toBeNull();
});
