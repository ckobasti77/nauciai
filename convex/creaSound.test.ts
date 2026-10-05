/// <reference types="vite/client" />

/**
 * Zvuk II (Crea K23) kroz prave Convex funkcije (convex-test):
 * - A11: pesma po delovima pravi posao sa ISPRAVNOM cenom (pravi `createJob`);
 * - A10: prevod rečenica je 0 kredita, ide u dnevni limit, vraća samo poslate id-jeve;
 * - A12: predlog muzike iz kadrova (0 kredita, provera ulaza);
 * - A18: trake razdvajanja kao glas + deca, samo vlasniku.
 * Mreža je uvek lažna - dev ima pravi Google ključ.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { musicCredits, musicJob, musicTemplate, type MusicDoc, type MusicEngineId } from "../lib/crea-music";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

const previous = { google: process.env.GOOGLE_AI_API_KEY, fal: process.env.FAL_KEY };
beforeEach(() => {
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.FAL_KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (previous.google === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = previous.google;
  if (previous.fal === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = previous.fal;
});

async function seedModel(t: TestConvex, slug: string) {
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

async function seedUser(t: TestConvex, email = "zvuk@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Zvuk",
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
    amount: 1000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function balance(t: TestConvex, userId: Id<"users">) {
  const row = await t.run((ctx) => ctx.db.query("creditBalances").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
  return row?.balance ?? 0;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function song(): MusicDoc {
  const doc = musicTemplate("pesma");
  return {
    ...doc,
    style: "Pop sa gitarom",
    mood: "vedro",
    sections: doc.sections.map((section) => (section.kind === "refren" ? { ...section, text: "Hajde, pevaj sa mnom" } : section.kind === "strofa" ? { ...section, text: "Jutro miriše na kafu" } : section)),
  };
}

describe("pesma po delovima (A11) kroz pravi createJob", () => {
  test("ElevenLabs: zbir delova (104 s) = 2 započeta minuta = 260 kr; Lyria pesma 18, klip 9 - isto kao dugme", async () => {
    const t = makeT();
    for (const slug of ["music", "lyria-35", "lyria-3-clip"]) await seedModel(t, slug);
    const { userId, asUser } = await seedUser(t);
    const catalog = STUDIO_MODELS.filter((model) => ["music", "lyria-35", "lyria-3-clip"].includes(model.slug));
    const jingle = { ...musicTemplate("dzingl"), style: "Radio džingl" };
    const cases: Array<{ doc: MusicDoc; engine: MusicEngineId; credits: number }> = [
      { doc: song(), engine: "eleven", credits: 260 },
      { doc: song(), engine: "lyria-song", credits: 18 },
      { doc: jingle, engine: "lyria-clip", credits: 9 },
    ];
    let spent = 0;
    for (const entry of cases) {
      const job = musicJob(entry.doc, entry.engine);
      const result = await asUser.mutation(api.studio.createJob, { modelSlug: job.modelSlug, params: JSON.stringify(job.params), inputMode: job.inputMode });
      if (typeof result !== "string") throw new Error(JSON.stringify(result));
      const row = await t.run((ctx) => ctx.db.get(result as Id<"generationJobs">));
      expect(row?.creditCost, entry.engine).toBe(entry.credits);
      // Dugme računa istom funkcijom kao server.
      expect(musicCredits(entry.doc, entry.engine, catalog), entry.engine).toBe(entry.credits);
      // Delovi i tekst stižu do motora u opisu, a ElevenLabs dobija toliko minuta koliko je plaćeno.
      const params = JSON.parse(row!.params) as Record<string, unknown>;
      expect(String(params.prompt)).toContain(entry.engine === "lyria-clip" ? "[Chorus]" : "[Chorus 1]");
      if (entry.engine === "eleven") expect(params.minutes).toBe(2);
      spent += entry.credits;
    }
    expect(await balance(t, userId)).toBe(1000 - spent);
  });

  test("klijent ne može da plati manje: ElevenLabs uvek naplaćuje ceo započeti minut koji i pravi", async () => {
    const t = makeT();
    await seedModel(t, "music");
    const { asUser } = await seedUser(t);
    const result = await asUser.mutation(api.studio.createJob, { modelSlug: "music", params: JSON.stringify({ prompt: "Pop", minutes: 0.4 }), inputMode: "text" });
    const row = await t.run((ctx) => ctx.db.get(result as Id<"generationJobs">));
    expect(row?.creditCost).toBe(130);
    expect(JSON.parse(row!.params).minutes).toBe(1);
  });
});

describe("prevod uz pregled (A10): rečenice se prevode za 0 kredita", () => {
  test("bez ključa DEMO; sa ključem prevod po id-ju, trošak je naš, krediti netaknuti", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const segments = [
      { id: "s1", text: "Dobar dan." },
      { id: "s2", text: "Šta ima toplo?" },
    ];
    const demo = await asUser.action(api.creaLlm.translateSegments, { segments, to: "en" });
    expect(demo).toMatchObject({ ok: true, demo: true, translations: { s1: "[EN DEMO] Dobar dan.", s2: "[EN DEMO] Šta ima toplo?" } });

    process.env.GOOGLE_AI_API_KEY = "test-key";
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit = {}) => {
        bodies.push(String(init.body));
        return json({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ id: "s1", text: "Good afternoon." }, { id: "s2", text: "What's warm?" }, { id: "s7", text: "uljez" }] }) }] } }],
          usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 40 },
        });
      }) as unknown as typeof fetch,
    );
    const real = await asUser.action(api.creaLlm.translateSegments, { segments, to: "en", from: "srp" });
    expect(real).toMatchObject({ ok: true, demo: false, translations: { s1: "Good afternoon.", s2: "What's warm?" } });
    if (!real.ok) throw new Error("prevod");
    expect(Object.keys(real.translations)).toEqual(["s1", "s2"]);
    expect(bodies[0]).toContain("Target language: English.");
    const usage = await t.run((ctx) => ctx.db.query("creaLlmUsage").withIndex("by_user_day", (q) => q.eq("userId", userId)).collect());
    expect(usage[0]?.calls).toBe(2);
    expect(usage[0]?.costUsd).toBeGreaterThan(0);
    expect(await balance(t, userId)).toBe(1000);
    expect(await asUser.action(api.creaLlm.translateSegments, { segments: [{ id: "s1", text: "  " }], to: "en" })).toEqual({ ok: false, reason: "PRAZNO" });
  });
});

describe("ozvuči moj video (A12): predlog muzike iz kadrova", () => {
  test("DEMO bez ključa (4 numere), loš ulaz se odbija pre mreže", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const frame = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
    const demo = await asUser.action(api.creaLlm.planScore, { frames: [frame, frame], mimeType: "image/jpeg", durationS: 12, locale: "sr" });
    expect(demo.ok && demo.demo && demo.tracks.length).toBe(4);
    expect(await asUser.action(api.creaLlm.planScore, { frames: [], mimeType: "image/jpeg", durationS: 12, locale: "sr" })).toEqual({ ok: false, reason: "PRAZNO" });
    expect(await asUser.action(api.creaLlm.planScore, { frames: [frame], mimeType: "image/svg+xml", durationS: 12, locale: "sr" })).toEqual({ ok: false, reason: "GRESKA" });
    expect(await asUser.action(api.creaLlm.planScore, { frames: [new Uint8Array(500_000).buffer], mimeType: "image/jpeg", durationS: 12, locale: "sr" })).toEqual({
      ok: false,
      reason: "GRESKA",
    });
  });
});

describe("razdvoji na trake (A18)", () => {
  test("glas je izlaz posla, bubanj/bas/ostalo su deca (`traka`); tuđi korisnik ne vidi ništa", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const stored = async () => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" })));
    const main = await t.run(async (ctx) =>
      ctx.db.insert("generationJobs", {
        userId,
        modelSlug: "stems",
        kind: "audio",
        provider: "fal",
        params: JSON.stringify({ minutes: 1 }),
        promptHash: "0123456789abcdef",
        status: "done" as const,
        creditCost: 10,
        inputMode: "audio",
        outputStorageId: await ctx.storage.store(new Blob([new Uint8Array([0])], { type: "audio/mpeg" })),
        createdAt: 1,
      }),
    );
    // Redosled upisa dece ne mora da prati redosled traka.
    for (const layerNumber of [4, 2, 3]) {
      await t.mutation(internal.creaLayers.insertExtraOutput, { parentJobId: main, layerNumber, storageId: await stored(), byteSize: 3 });
    }
    const stems = await asUser.query(api.creaLayers.getStems, { jobId: main });
    expect(stems?.tracks.map((track) => track.key)).toEqual(["vocals", "drums", "bass", "other"]);
    const children = await t.run((ctx) => ctx.db.query("generationJobs").collect());
    expect(children.filter((job) => job._id !== main).every((job) => job.derivation === "traka" && job.creditCost === 0 && job.parentJobId === main)).toBe(true);
    // I preko dece se dobija isti spisak.
    const drums = stems!.tracks.find((track) => track.key === "drums")!;
    expect((await asUser.query(api.creaLayers.getStems, { jobId: drums.jobId }))?.mainJobId).toBe(main);

    const other = await seedUser(t, "drugi@example.com");
    expect(await other.asUser.query(api.creaLayers.getStems, { jobId: main })).toBeNull();
  });
});
