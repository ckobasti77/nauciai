/// <reference types="vite/client" />

/**
 * Lice u video alatima (K20: V14, V20, V21-V23; plan K17-15, O5). Lik koji
 * govori, lipsync, Odglumi i zamena lika u videu idu kroz POSTOJEĆI `createJob`,
 * ali lice bira server: samo sopstveni Lik sa pristankom ili rad koji je Crea
 * napravila od tvojih Likova / samo iz opisa. Tuđ Lik, Lik bez pristanka, tuđ rad,
 * DEMO plakat i rad od okačene tuđe fotke se odbijaju pre naplate.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { demoSpeechWav, estimateSpeechSeconds, talkingNext } from "../lib/crea-talking";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { faceInputIds, jobMayCarryFace, videoSwapPrompt } from "./creaFaceJobsCore";
import { STUDIO_MODELS } from "./providers/catalogModels";
import schema from "./schema";
import { mockJobSucceeds } from "./studioCore";

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

async function seedModels(t: TestConvex) {
  for (const slug of ["kling-avatar", "kling-motion", "kling-lipsync", "kling-o3-edit", "nano-banana-2", "tts"]) {
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

/**
 * Blob sa tipom u `_storage` (`convex-test` tip iz `Blob`-a ne prenosi). Veličina je
 * takva da izmereno trajanje prolazi granice iz bajtova (`boundedInputSeconds`).
 */
async function storeBlob(t: TestConvex, contentType: string) {
  const bytes = contentType.startsWith("video/") ? 200_000 : contentType.startsWith("audio/") ? 20_000 : 4_000;
  return t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["x".repeat(bytes)]));
    await ctx.db.patch(id as unknown as Id<"studioUploads">, { contentType } as never);
    return id;
  });
}

/** Upload kao iz alata (dozvola → upload → prijava); zvuk i video dobijaju izmereno trajanje. */
async function upload(t: TestConvex, as: TestUser, slot: "image" | "audio" | "video", seconds?: number) {
  const type = slot === "image" ? "image/jpeg" : slot === "audio" ? "audio/mpeg" : "video/mp4";
  const storageId = await storeBlob(t, type);
  const { grantId } = await as.mutation(api.studio.createInputUploadUrl, { slot });
  await as.mutation(api.studio.registerInputUpload, { storageId, grantId });
  if (seconds !== undefined) {
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId))
        .first();
      await ctx.db.patch(row!._id, { durationS: seconds });
    });
  }
  return storageId;
}

async function saveLik(t: TestConvex, as: TestUser, name = "Maja") {
  const images = [await upload(t, as, "image"), await upload(t, as, "image")];
  const saved = await as.mutation(api.creaElements.saveElement, {
    kind: "lik",
    name,
    imageStorageIds: images,
    consent: true,
    photoCheck: GOOD_CHECK,
  });
  return { elementId: saved.elementId as Id<"creaElements">, images };
}

/** Gotov rad sa izlazom (kao posle `finalizeOutput`). */
async function doneJob(
  t: TestConvex,
  userId: Id<"users">,
  opts: { kind?: "image" | "video"; inputs?: Record<string, string[]>; mock?: boolean; provider?: "fal" | "local"; parent?: Id<"generationJobs"> } = {},
): Promise<Doc<"generationJobs">> {
  const kind = opts.kind ?? "image";
  const outputStorageId = await storeBlob(t, kind === "image" ? "image/png" : "video/mp4");
  return t.run(async (ctx) => {
    const id = await ctx.db.insert("generationJobs", {
      userId,
      modelSlug: kind === "image" ? "nano-banana-2" : "kling-avatar",
      kind,
      params: JSON.stringify({ prompt: "scena" }),
      promptHash: "0".repeat(16),
      status: "done",
      creditCost: 10,
      provider: opts.provider ?? "fal",
      outputStorageId,
      ...(opts.mock ? { falRequestId: "mock-123" } : { falRequestId: "fal-123" }),
      ...(opts.inputs ? { inputs: JSON.stringify(opts.inputs) } : {}),
      ...(opts.parent ? { parentJobId: opts.parent, rootJobId: opts.parent, derivation: "lokalni-alat" } : {}),
      createdAt: Date.now(),
    });
    return (await ctx.db.get(id))!;
  });
}

async function job(t: TestConvex, id: unknown) {
  return t.run((ctx) => ctx.db.get(id as Id<"generationJobs">));
}

describe("pravila lica (čista)", () => {
  test("ulazi koji nose lice, rad koji sme da nosi lice, opis zamene", () => {
    expect(faceInputIds({ image: ["a", "b"], audio: ["c"], mask: ["d"], video: ["e"] })).toEqual(["a", "b", "e"]);
    const base = { userId: "u", status: "done", kind: "image", outputStorageId: "s", falRequestId: "fal-1" };
    expect(jobMayCarryFace(base, "u", ["image"])).toBe(true);
    expect(jobMayCarryFace({ ...base, userId: "x" }, "u", ["image"])).toBe(false);
    expect(jobMayCarryFace({ ...base, falRequestId: "mock-1" }, "u", ["image"])).toBe(false);
    expect(jobMayCarryFace({ ...base, status: "running" }, "u", ["image"])).toBe(false);
    expect(jobMayCarryFace(base, "u", ["video"])).toBe(false);
    expect(jobMayCarryFace({ ...base, provider: "local" }, "u", ["image"])).toBe(false);
    expect(jobMayCarryFace({ ...base, provider: "local", parentJobId: "p" }, "u", ["image"])).toBe(true);
    expect(videoSwapPrompt({ name: "Maja" }, 2)).toMatch(/^Replace the main person in the video with Maja, shown in @Image1 and @Image2\./);
  });
});

describe("Lik koji govori (V21/V23)", () => {
  test("Lik sa pristankom + izmeren glas → Kling avatar; cena po sekundi glasa", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedModels(t);
    const lik = await saveLik(t, asUser);
    const audio = await upload(t, asUser, "audio", 7.2);

    const id = await asUser.mutation(api.creaFaceJobs.startTalking, {
      face: { elementId: lik.elementId },
      audioStorageId: audio,
      quality: "720p",
      consent: true,
    });
    const row = await job(t, id);
    expect(row).toMatchObject({ userId, modelSlug: "kling-avatar", inputMode: "image_audio", status: "reserved" });
    expect(JSON.parse(row!.inputs!)).toEqual({ image: [lik.images[0]], audio: [audio] });
    // 8 s (naviše) × $0,0562 × 216,25 = 98 kr.
    expect(JSON.parse(row!.params)).toMatchObject({ quality: "720p", duration: 8 });
    expect(row!.creditCost).toBe(98);
  });

  test("glas bez izmerenog trajanja se ne naplaćuje", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await seedModels(t);
    const lik = await saveLik(t, asUser);
    const audio = await upload(t, asUser, "audio");
    await expect(
      asUser.mutation(api.creaFaceJobs.startTalking, { face: { elementId: lik.elementId }, audioStorageId: audio, quality: "720p", consent: true }),
    ).rejects.toThrow("MERENJE_NIJE_DOSTUPNO");
  });

  test("tuđ Lik, Lik bez pristanka i pristanak koji nije `true` se odbijaju", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedModels(t);
    const otherLik = await saveLik(t, other.asUser, "Tuđa");
    const audio = await upload(t, asUser, "audio", 5);
    await expect(
      asUser.mutation(api.creaFaceJobs.startTalking, { face: { elementId: otherLik.elementId }, audioStorageId: audio, quality: "720p", consent: true }),
    ).rejects.toThrow("LIK_NIJE_DOSTUPAN");

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
    await expect(
      asUser.mutation(api.creaFaceJobs.startTalking, { face: { elementId: noConsent }, audioStorageId: audio, quality: "720p", consent: true }),
    ).rejects.toThrow("LIK_NIJE_DOSTUPAN");

    const lik = await saveLik(t, asUser);
    await expect(
      asUser.mutation(api.creaFaceJobs.startTalking, {
        face: { elementId: lik.elementId },
        audioStorageId: audio,
        quality: "720p",
        consent: false as unknown as true,
      }),
    ).rejects.toThrow();
    // Tuđ glas: `createJob` ga ne prima.
    const otherAudio = await upload(t, other.asUser, "audio", 5);
    await expect(
      asUser.mutation(api.creaFaceJobs.startTalking, { face: { elementId: lik.elementId }, audioStorageId: otherAudio, quality: "720p", consent: true }),
    ).rejects.toThrow("TUDJI_FAJL");
  });

  test("scena napravljena od Lika i rad samo iz opisa smeju; DEMO, tuđ rad i rad od okačene fotke ne", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedModels(t);
    const lik = await saveLik(t, asUser);
    const audio = await upload(t, asUser, "audio", 4);
    const start = (jobId: Id<"generationJobs">) =>
      asUser.mutation(api.creaFaceJobs.startTalking, { face: { jobId }, audioStorageId: audio, quality: "720p", consent: true });

    const scene = await doneJob(t, userId, { inputs: { image: lik.images } });
    const id = await start(scene._id);
    const row = await job(t, id);
    expect(JSON.parse(row!.inputs!).image).toEqual([scene.outputStorageId]);
    expect(row).toMatchObject({ parentJobId: scene._id, derivation: "animacija" });

    const fromText = await doneJob(t, userId);
    await expect(start(fromText._id)).resolves.toBeTruthy();

    const strangerPhoto = await upload(t, asUser, "image");
    const fromUpload = await doneJob(t, userId, { inputs: { image: [strangerPhoto] } });
    await expect(start(fromUpload._id)).rejects.toThrow("LICE_NIJE_DOZVOLJENO");

    const demo = await doneJob(t, userId, { mock: true });
    await expect(start(demo._id)).rejects.toThrow("LICE_NIJE_DOZVOLJENO");

    const foreign = await doneJob(t, other.userId);
    await expect(start(foreign._id)).rejects.toThrow("LICE_NIJE_DOZVOLJENO");

    // Lokalni alat bez roditelja (fajl sa uređaja) ne; kao verzija bezbednog rada da.
    const localNoParent = await doneJob(t, userId, { provider: "local" });
    await expect(start(localNoParent._id)).rejects.toThrow("LICE_NIJE_DOZVOLJENO");
    const localFromScene = await doneJob(t, userId, { provider: "local", parent: scene._id });
    await expect(start(localFromScene._id)).resolves.toBeTruthy();
  });
});

describe("Lipsync (V22), Odglumi (V20), zamena lika u videu (V14)", () => {
  test("lipsync: samo video koji je Crea napravila od tvog Lika (i kroz lanac izlaza)", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedModels(t);
    const lik = await saveLik(t, asUser);
    const audio = await upload(t, asUser, "audio", 6);
    const scene = await doneJob(t, userId, { inputs: { image: lik.images } });

    // Avatar od izlaza scene (alias kao posle „izlaz kao ulaz") je bezbedan video.
    const avatarId = await asUser.mutation(api.creaFaceJobs.startTalking, {
      face: { jobId: scene._id },
      audioStorageId: audio,
      quality: "720p",
      consent: true,
    });
    const sceneAlias = JSON.parse((await job(t, avatarId))!.inputs!).image as string[];
    const avatarVideo = await doneJob(t, userId, { kind: "video", inputs: { image: sceneAlias, audio: [audio] } });

    // Klijent pre posla napravi alias izlaza i izmeri ga (`adoptOutputAsInput` + `measureInputUpload`).
    const alias = await asUser.mutation(api.creaVersions.adoptOutputAsInput, { jobId: avatarVideo._id });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", alias.storageId))
        .first();
      await ctx.db.patch(row!._id, { durationS: 6 });
    });
    const voice = await upload(t, asUser, "audio", 3);
    const id = await asUser.mutation(api.creaFaceJobs.startLipsync, { videoJobId: avatarVideo._id, audioStorageId: voice, consent: true });
    const row = await job(t, id);
    expect(row).toMatchObject({ modelSlug: "kling-lipsync", inputMode: "video_audio", parentJobId: avatarVideo._id, derivation: "izmena" });
    expect(JSON.parse(row!.inputs!)).toEqual({ video: [avatarVideo.outputStorageId], audio: [voice] });
    // Naplata po sekundi VIDEA, zaokruženo na pet: 6 s → 10 s.
    expect(JSON.parse(row!.params)).toMatchObject({ source: "audio", duration: 6 });

    // Video od okačenog tuđeg snimka ne.
    const strangerVideo = await upload(t, asUser, "video", 5);
    const edited = await doneJob(t, userId, { kind: "video", inputs: { video: [strangerVideo] } });
    await expect(asUser.mutation(api.creaFaceJobs.startLipsync, { videoJobId: edited._id, audioStorageId: voice, consent: true })).rejects.toThrow(
      "LICE_NIJE_DOZVOLJENO",
    );
  });

  test("Odglumi: snimak pokreta + Lik → Kling prenos pokreta (`video_image`); tuđ snimak i tuđ Lik ne", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    await seedModels(t);
    const lik = await saveLik(t, asUser);
    const recording = await upload(t, asUser, "video", 5);
    const id = await asUser.mutation(api.creaFaceJobs.startMotion, {
      face: { elementId: lik.elementId },
      videoStorageId: recording,
      resolution: "720p",
      consent: true,
    });
    const row = await job(t, id);
    expect(row).toMatchObject({ userId, modelSlug: "kling-motion", inputMode: "video_image", status: "reserved" });
    expect(JSON.parse(row!.inputs!)).toEqual({ video: [recording], image: [lik.images[0]] });
    // 5 s × $0,126 × 216,25 = 137 kr (cena po sekundi, kao na dugmetu).
    expect(row!.creditCost).toBe(137);

    const otherRecording = await upload(t, other.asUser, "video", 5);
    await expect(
      asUser.mutation(api.creaFaceJobs.startMotion, { face: { elementId: lik.elementId }, videoStorageId: otherRecording, resolution: "720p", consent: true }),
    ).rejects.toThrow("TUDJI_FAJL");
    const otherLik = await saveLik(t, other.asUser, "Tuđa");
    await expect(
      asUser.mutation(api.creaFaceJobs.startMotion, { face: { elementId: otherLik.elementId }, videoStorageId: recording, resolution: "720p", consent: true }),
    ).rejects.toThrow("LIK_NIJE_DOSTUPAN");
  });

  test("zamena lika u videu: slike Lika i opis dodaje server; video se naplaćuje po sekundi", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await seedModels(t);
    const lik = await saveLik(t, asUser);
    const video = await upload(t, asUser, "video", 6);
    const id = await asUser.mutation(api.creaFaceJobs.startVideoSwap, {
      elementId: lik.elementId,
      videoStorageId: video,
      resolution: "720p",
      consent: true,
    });
    const row = await job(t, id);
    expect(row).toMatchObject({ modelSlug: "kling-o3-edit", inputMode: "video" });
    expect(JSON.parse(row!.inputs!)).toEqual({ video: [video], image: lik.images });
    const params = JSON.parse(row!.params) as { prompt: string; duration: number };
    expect(params.prompt).toMatch(/^Replace the main person in the video with Maja, shown in @Image1 and @Image2\./);
    expect(params.duration).toBe(6);
    // 6 s × $0,126 × 216,25 = 164 kr.
    expect(row!.creditCost).toBe(164);

    const tooShort = await upload(t, asUser, "video", 1);
    const short = await asUser.mutation(api.creaFaceJobs.startVideoSwap, {
      elementId: lik.elementId,
      videoStorageId: tooShort,
      resolution: "720p",
      consent: true,
    });
    // Najmanje 3 s (fal granica) - kraći snimak se naplaćuje kao 3 s, provajder ga odbija pa ide povraćaj.
    expect(JSON.parse((await job(t, short))!.params).duration).toBe(3);
  });

  test("spisak lica: Likovi sa pristankom i samo bezbedni radovi tražene vrste", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await seedModels(t);
    const lik = await saveLik(t, asUser);
    const scene = await doneJob(t, userId, { inputs: { image: lik.images } });
    await doneJob(t, userId, { inputs: { image: [await upload(t, asUser, "image")] } });
    await doneJob(t, userId, { mock: true });
    const video = await doneJob(t, userId, { kind: "video", inputs: { image: lik.images } });

    const images = await asUser.query(api.creaFaceJobs.listFaceSources, { kind: "image" });
    expect(images.liks.map((row) => row._id)).toEqual([lik.elementId]);
    expect(images.jobs.map((row) => row._id)).toEqual([scene._id]);
    const videos = await asUser.query(api.creaFaceJobs.listFaceSources, { kind: "video" });
    expect(videos.liks).toEqual([]);
    expect(videos.jobs.map((row) => row._id)).toEqual([video._id]);
  });
});

async function settle(t: TestConvex) {
  for (let round = 0; round < 5; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }
}

describe("DEMO bez ključa (O3): napiši → izgovori → oživi do kraja", () => {
  test("tekst → govor (DEMO plakat) → probni WAV procenjene dužine → avatar (DEMO)", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    await seedModels(t);
    const lik = await saveLik(t, asUser);

    // 1) Govor: bez FAL_KEY posao ide kroz mock (deterministički ishod po id-ju - uzima se uspešan).
    const text = "Zdravo! Ja sam Maja i danas pričamo o veštačkoj inteligenciji.";
    let ttsId: Id<"generationJobs"> | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = (await asUser.mutation(api.studio.createJob, {
        modelSlug: "tts",
        params: JSON.stringify({ text: `${text}${" ".repeat(attempt)}`, voice: "Aria" }),
        inputMode: "text",
        inputs: JSON.stringify({}),
      })) as Id<"generationJobs">;
      if (mockJobSucceeds(id)) {
        ttsId = id;
        break;
      }
    }
    expect(ttsId).not.toBeNull();
    await settle(t);
    await t.action(internal.studioActions.completeMockJob, { jobId: ttsId! });
    await settle(t);
    const tts = await asUser.query(api.studio.getJobForDetail, { jobId: ttsId! });
    expect(tts).toMatchObject({ status: "done", isMock: true, modelSlug: "tts" });

    // 2) Lanac traži probni zvuk (DEMO glas je plakat, ne zvuk); uređaj ga pravi i okači, server ga meri.
    expect(talkingNext({ scene: "skip", voice: "demo", audioReady: false, final: "idle" })).toEqual({ kind: "prepare-voice", demo: true });
    const seconds = estimateSpeechSeconds(text);
    const wav = demoSpeechWav(seconds, 8000);
    const audioId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([wav as BlobPart]));
      await ctx.db.patch(id as unknown as Id<"studioUploads">, { contentType: "audio/wav" } as never);
      return id;
    });
    const { grantId } = await asUser.mutation(api.studio.createInputUploadUrl, { slot: "audio" });
    await asUser.mutation(api.studio.registerInputUpload, { storageId: audioId, grantId });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("studioUploads")
        .withIndex("by_storage", (q) => q.eq("storageId", audioId))
        .first();
      await ctx.db.patch(row!._id, { durationS: seconds });
    });

    // 3) Avatar sa Likom: DEMO posao do kraja.
    let avatarId: Id<"generationJobs"> | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const id = (await asUser.mutation(api.creaFaceJobs.startTalking, {
        face: { elementId: lik.elementId },
        audioStorageId: audioId,
        quality: "720p",
        consent: true,
      })) as Id<"generationJobs">;
      if (mockJobSucceeds(id)) {
        avatarId = id;
        break;
      }
    }
    expect(avatarId).not.toBeNull();
    const reserved = await job(t, avatarId);
    expect(JSON.parse(reserved!.params)).toMatchObject({ duration: seconds });
    await settle(t);
    await t.action(internal.studioActions.completeMockJob, { jobId: avatarId! });
    await settle(t);
    const avatar = await asUser.query(api.studio.getJobForDetail, { jobId: avatarId! });
    expect(avatar).toMatchObject({ status: "done", isMock: true, modelSlug: "kling-avatar" });
    expect(talkingNext({ scene: "skip", voice: "demo", audioReady: true, final: "demo" })).toEqual({ kind: "done" });
  });
});
