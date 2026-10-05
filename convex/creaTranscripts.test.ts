/// <reference types="vite/client" />

/**
 * Transkript `stt` posla (Crea K21, plan K17-13): do sada se bacao (posao `done`
 * bez ičega, a plaćen). Webhook ga upisuje u `creaTranscripts`, DEMO (bez
 * `FAL_KEY`) daje transkript preko celog snimka, ponovljen webhook ne pravi
 * duplikat, brisanje rada briše i transkript, a „Kratki klipovi" (V26) čitaju
 * samo SOPSTVENI transkript.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { transcriptForStorage } from "./creaTranscriptsCore";
import { extractTranscript } from "./falWebhookCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";
import { mockJobSucceeds } from "./studioCore";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;
type TestUser = ReturnType<TestConvex["withIdentity"]>;

const previousGoogle = process.env.GOOGLE_AI_API_KEY;
const previousFal = process.env.FAL_KEY;

beforeEach(() => {
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.FAL_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousGoogle === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = previousGoogle;
  if (previousFal === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = previousFal;
});

const SCRIBE_PAYLOAD = {
  text: "Zdravo, Beograde! Danas učimo montažu.",
  language_code: "srp",
  words: [
    { text: "Zdravo,", start: 0.079, end: 0.539, type: "word", speaker_id: "speaker_0" },
    { text: " ", start: 0.539, end: 0.6, type: "spacing", speaker_id: "speaker_0" },
    { text: "Beograde!", start: 0.6, end: 1.2, type: "word", speaker_id: "speaker_0" },
    { text: "Danas", start: 2.1, end: 2.4, type: "word", speaker_id: "speaker_1" },
    { text: "učimo", start: 2.45, end: 2.8, type: "word", speaker_id: "speaker_1" },
    { text: "montažu.", start: 2.85, end: 3.5, type: "word", speaker_id: "speaker_1" },
  ],
};

async function seedUser(t: TestConvex, email = "vesna@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Vesna Crea",
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
    amount: 5_000,
    source: "admin_grant",
    idempotencyKey: { field: "stripeSessionId", value: `seed-${userId}` },
  });
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

async function seedModels(t: TestConvex, slugs: readonly string[]) {
  for (const slug of slugs) {
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
}

/** Okačen video sa izmerenim trajanjem (server po njemu naplaćuje minute). */
async function uploadVideo(t: TestConvex, as: TestUser, seconds: number) {
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["x".repeat(200_000)]));
    await ctx.db.patch(id as unknown as Id<"studioUploads">, { contentType: "video/mp4" } as never);
    return id;
  });
  const { grantId } = await as.mutation(api.studio.createInputUploadUrl, { slot: "video" });
  await as.mutation(api.studio.registerInputUpload, { storageId, grantId });
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("studioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    await ctx.db.patch(row!._id, { durationS: seconds });
  });
  return storageId;
}

async function settle(t: TestConvex) {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

/** `stt` posao u toku, kao posle predaje fal-u. */
async function runningJob(t: TestConvex, userId: Id<"users">, modelSlug = "stt", falRequestId = "fal-req-1") {
  return t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug,
      kind: "audio" as const,
      params: JSON.stringify({ minutes: 1 }),
      promptHash: "0123456789abcdef",
      status: "running" as const,
      creditCost: 2,
      falRequestId,
      createdAt: Date.now(),
    }),
  );
}

const transcriptArg = () => transcriptForStorage(extractTranscript(SCRIBE_PAYLOAD)!);

describe("transkript stiže uz webhook", () => {
  test("Scribe odgovor → red u `creaTranscripts` + posao `done`; ponovljen webhook ne pravi duplikat", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedModels(t, ["stt"]);
    const jobId = await runningJob(t, userId);

    await t.mutation(internal.falWebhook.applyWebhookResult, { falRequestId: "fal-req-1", status: "OK", transcript: transcriptArg() });
    await t.mutation(internal.falWebhook.applyWebhookResult, { falRequestId: "fal-req-1", status: "OK", transcript: transcriptArg() });
    // I kad bi posao nekako ponovo bio „u toku", drugi red se ne pravi.
    await t.run((ctx) => ctx.db.patch(jobId, { status: "running" }));
    await t.mutation(internal.falWebhook.applyWebhookResult, { falRequestId: "fal-req-1", status: "OK", transcript: transcriptArg() });

    const rows = await t.run((ctx) => ctx.db.query("creaTranscripts").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobId, userId, language: "srp", text: "Zdravo, Beograde! Danas učimo montažu." });
    const view = await asUser.query(api.creaTranscripts.getForJob, { jobId });
    expect(view).toMatchObject({ state: "ready", demo: false, textOnly: false });
    if (view?.state !== "ready") throw new Error("transkript");
    expect(view.words.map((word) => word.w)).toEqual(["Zdravo,", "Beograde!", "Danas", "učimo", "montažu."]);
    await settle(t);
    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job?.status).toBe("done");
    expect(job?.outputStorageId).toBeUndefined();
  });

  test("model koji ne vraća transkript ne dobija red; preveliki transkript ostaje samo tekst", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedModels(t, ["stt", "tts"]);
    await runningJob(t, userId, "tts", "fal-tts");
    await t.mutation(internal.falWebhook.applyWebhookResult, { falRequestId: "fal-tts", status: "OK", transcript: transcriptArg() });
    expect(await t.run((ctx) => ctx.db.query("creaTranscripts").collect())).toHaveLength(0);

    const jobId = await runningJob(t, userId, "stt", "fal-big");
    await t.mutation(internal.falWebhook.applyWebhookResult, { falRequestId: "fal-big", status: "OK", transcript: { text: "samo tekst" } });
    expect(await asUser.query(api.creaTranscripts.getForJob, { jobId })).toMatchObject({ state: "ready", textOnly: true, words: [] });
  });

  test("tuđ rad je `null`; stariji `stt` rad bez transkripta je „missing”; u toku je „waiting”", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedModels(t, ["stt"]);
    const jobId = await runningJob(t, userId);
    expect(await asUser.query(api.creaTranscripts.getForJob, { jobId })).toEqual({ state: "waiting" });
    await t.run((ctx) => ctx.db.patch(jobId, { status: "done" }));
    expect(await asUser.query(api.creaTranscripts.getForJob, { jobId })).toEqual({ state: "missing" });
    expect(await other.asUser.query(api.creaTranscripts.getForJob, { jobId })).toBeNull();
  });

  test("brisanje rada briše i transkript", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedModels(t, ["stt"]);
    const jobId = await runningJob(t, userId);
    await t.mutation(internal.falWebhook.applyWebhookResult, { falRequestId: "fal-req-1", status: "OK", transcript: transcriptArg() });
    await settle(t);
    await asUser.mutation(api.studio.deleteJob, { jobId });
    expect(await t.run((ctx) => ctx.db.query("creaTranscripts").collect())).toHaveLength(0);
  });
});

describe("DEMO bez ključa (O3)", () => {
  test("`stt` iz videa: naplata po minutu, DEMO transkript preko celog snimka, bez plakata", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await seedModels(t, ["stt"]);
    let jobId: Id<"generationJobs"> | null = null;
    for (let attempt = 0; attempt < 20 && !jobId; attempt += 1) {
      const video = await uploadVideo(t, asUser, 12);
      const id = (await asUser.mutation(api.studio.createJob, {
        modelSlug: "stt",
        params: JSON.stringify({}),
        inputMode: "video",
        inputs: JSON.stringify({ video: [video] }),
      })) as Id<"generationJobs">;
      if (mockJobSucceeds(id)) jobId = id;
    }
    expect(jobId).not.toBeNull();
    await settle(t);
    await t.action(internal.studioActions.completeMockJob, { jobId: jobId! });
    await settle(t);

    const job = await asUser.query(api.studio.getJobForDetail, { jobId: jobId! });
    expect(job).toMatchObject({ status: "done", isMock: true, outputUrl: null });
    expect(job!.creditCost).toBeGreaterThan(0);
    const view = await asUser.query(api.creaTranscripts.getForJob, { jobId: jobId! });
    expect(view).toMatchObject({ state: "ready", demo: true });
    if (view?.state !== "ready") throw new Error("transkript");
    expect(view.words.length).toBeGreaterThan(15);
    expect(view.words[view.words.length - 1]!.e).toBeLessThanOrEqual(12.0001);
    expect(view.words[view.words.length - 1]!.e).toBeGreaterThan(9);
  });

  test("najbolji momenti čitaju samo SOPSTVENI transkript; DEMO momenti bez mreže, 15-60 s", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedModels(t, ["stt"]);
    const jobId = await runningJob(t, userId);
    await t.mutation(internal.falWebhook.applyWebhookResult, {
      falRequestId: "fal-req-1",
      status: "OK",
      transcript: { ...transcriptForStorage({ text: "demo", language: "srp", words: Array.from({ length: 400 }, (_, i) => ({ w: i % 9 === 8 ? "kraj." : "reč", s: i * 0.4, e: i * 0.4 + 0.3 })) }), demo: true },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await other.asUser.action(api.creaLlm.findMoments, { transcriptJobId: jobId, durationS: 160, locale: "sr" })).toEqual({
      ok: false,
      reason: "NEMA_TRANSKRIPTA",
    });
    const reply = await asUser.action(api.creaLlm.findMoments, { transcriptJobId: jobId, durationS: 160, locale: "sr" });
    expect(reply).toMatchObject({ ok: true, demo: true });
    if (!reply.ok) throw new Error("momenti");
    expect(reply.moments.length).toBeGreaterThan(0);
    for (const moment of reply.moments) {
      expect(moment.end - moment.start).toBeGreaterThanOrEqual(14.5);
      expect(moment.end - moment.start).toBeLessThanOrEqual(60);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("creditTransactions").filter((q) => q.eq(q.field("type"), "spend")).collect())).toHaveLength(0);
  });
});
