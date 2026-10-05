/// <reference types="vite/client" />

/**
 * K13 (S5, K01-17; ispravka K01 0.2-5): `num_images` > 1 vraća više slika, a do
 * sada se čuvala samo prva. Sada je prva izlaz posla (nosi cenu), a ostale su
 * zasebni radovi - deca sa `derivation: "varijacija"`, 0 kr. Probni list ih čita
 * kroz `creaVariations.getSheet`.
 */

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { extractOutputUrl, extractOutputUrls } from "./falWebhookCore";
import { extraOutputKind, layerNumberOf, mockVariationDataUrls, VARIATION_PARAM } from "./creaLayersCore";
import schema from "./schema";
import { MOCK_REQUEST_PREFIX, mockJobSucceeds, mockOutputDataUrl } from "./studioCore";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

afterEach(() => {
  vi.unstubAllGlobals();
});

async function settle(t: TestConvex) {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

async function seedUser(t: TestConvex, email = "varijacije@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Varijacije",
      username: email.split("@")[0],
      role: "moderator",
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function seedRunningJob(t: TestConvex, userId: Id<"users">, falRequestId: string, numImages: number) {
  return t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: "z-image-turbo",
      kind: "image",
      provider: "fal",
      params: JSON.stringify({ prompt: "mačka na krovu", image_size: "landscape_4_3", num_images: numImages }),
      promptHash: "abcdef0123456789",
      status: "running" as const,
      creditCost: 5,
      inputMode: "text",
      falRequestId,
      createdAt: Date.now(),
    }),
  );
}

async function childrenOf(t: TestConvex, jobId: Id<"generationJobs">) {
  return t.run(async (ctx) =>
    (await ctx.db.query("generationJobs").collect()).filter((job) => job.parentJobId === jobId),
  );
}

describe("fal: svi izlazi poziva", () => {
  test("`extractOutputUrls` vraća celu listu, prvi je isti kao `extractOutputUrl`", () => {
    const payload = { images: [{ url: "https://a/1.png" }, { url: "https://a/2.png" }, { nije: "slika" }, { url: "https://a/3.png" }] };
    expect(extractOutputUrls(payload)).toEqual(["https://a/1.png", "https://a/2.png", "https://a/3.png"]);
    expect(extractOutputUrls(payload)[0]).toBe(extractOutputUrl(payload));
    expect(extractOutputUrls({ video: { url: "https://a/klip.mp4" } })).toEqual(["https://a/klip.mp4"]);
    expect(extractOutputUrls({ images: [] })).toEqual([]);
    expect(extractOutputUrls(null)).toEqual([]);
  });

  test("tri slike → glavni rad + 2 varijacije (0 kr, isti model, redni broj), krediti netaknuti", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const jobId = await seedRunningJob(t, userId, "fal-req-3", 3);
    vi.stubGlobal("fetch", (async () => new Response(new Blob(["png"], { type: "image/png" }))) as unknown as typeof fetch);

    await t.mutation(internal.falWebhook.applyWebhookResult, {
      falRequestId: "fal-req-3",
      status: "OK",
      outputUrl: "https://fal.media/1.png",
      extraOutputUrls: ["https://fal.media/2.png", "https://fal.media/3.png"],
    });
    await settle(t);

    const main = await t.run((ctx) => ctx.db.get(jobId));
    expect(main?.status).toBe("done");
    expect(main?.outputStorageId).toBeDefined();
    const children = await childrenOf(t, jobId);
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child).toMatchObject({ derivation: "varijacija", creditCost: 0, modelSlug: "z-image-turbo", status: "done", rootJobId: jobId });
      expect(child.falRequestId).toBeUndefined();
    }
    expect(children.map((child) => layerNumberOf(child.params, VARIATION_PARAM)).sort()).toEqual([2, 3]);

    const sheet = await asUser.query(api.creaVariations.getSheet, { jobIds: [jobId] });
    expect(sheet).toHaveLength(1);
    expect(sheet[0]!.images.map((image) => image.number)).toEqual([1, 2, 3]);
    expect(sheet[0]!.images[0]!.jobId).toBe(jobId);

    // Ponovljen upis istog broja ne pravi duplikat.
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    expect(
      await t.mutation(internal.creaLayers.insertExtraOutput, { parentJobId: jobId, layerNumber: 2, storageId, byteSize: 1 }),
    ).toBe(false);
  });

  test("jedna slika ostaje jedan rad, bez dece", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    const jobId = await seedRunningJob(t, userId, "fal-req-1", 1);
    vi.stubGlobal("fetch", (async () => new Response(new Blob(["png"], { type: "image/png" }))) as unknown as typeof fetch);
    await t.mutation(internal.falWebhook.applyWebhookResult, { falRequestId: "fal-req-1", status: "OK", outputUrl: "https://fal.media/1.png" });
    await settle(t);
    expect(await childrenOf(t, jobId)).toHaveLength(0);
  });

  test("tuđ posao se u probnom listu ne vidi", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const jobId = await seedRunningJob(t, userId, "fal-req-x", 2);
    expect(await other.asUser.query(api.creaVariations.getSheet, { jobIds: [jobId] })).toEqual([]);
  });
});

describe("DEMO bez ključa (O3)", () => {
  test("`num_images: 3` daje tri plakata različite boje, pa tri rada", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    let jobId = await seedRunningJob(t, userId, "x", 3);
    for (let attempt = 0; attempt < 20 && !mockJobSucceeds(jobId); attempt += 1) jobId = await seedRunningJob(t, userId, `x${attempt}`, 3);
    await t.run((ctx) => ctx.db.patch(jobId, { falRequestId: `${MOCK_REQUEST_PREFIX}${jobId}` }));

    await t.action(internal.studioActions.completeMockJob, { jobId });
    await settle(t);

    const children = await childrenOf(t, jobId);
    expect(children).toHaveLength(2);
    for (const child of children) expect(child.falRequestId?.startsWith(MOCK_REQUEST_PREFIX)).toBe(true);
    const sheet = await asUser.query(api.creaVariations.getSheet, { jobIds: [jobId] });
    expect(sheet[0]).toMatchObject({ isMock: true, status: "done" });
    expect(sheet[0]!.images).toHaveLength(3);
  });

  test("DEMO plakati: prvi je isti kao do sada, ostali drugačiji; broj se svodi na 1-17", () => {
    const poster = (hash: string) => mockOutputDataUrl("mačka", hash, "image");
    const urls = mockVariationDataUrls(poster, "abcd1234", 4);
    expect(urls).toHaveLength(4);
    expect(urls[0]).toBe(poster("abcd1234"));
    expect(new Set(urls).size).toBe(4);
    expect(mockVariationDataUrls(poster, "0", 0)).toHaveLength(1);
    expect(mockVariationDataUrls(poster, "0", 99)).toHaveLength(17);
  });

  test("dete razlaganja je i dalje „sloj”, a sve ostalo „varijacija”", () => {
    expect(extraOutputKind({ inputMode: "layerize" })).toEqual({ derivation: "sloj", param: "sloj" });
    expect(extraOutputKind({ inputMode: "text" })).toEqual({ derivation: "varijacija", param: "varijacija" });
    expect(extraOutputKind({})).toEqual({ derivation: "varijacija", param: "varijacija" });
  });
});
