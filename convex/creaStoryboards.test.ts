/// <reference types="vite/client" />

/**
 * Strip → film (Crea K21, V10) i ostali LLM planovi za video (V28, V31): plan je
 * besplatan (0 kredita, isti dnevni limit kao pomoćnik), strip se čuva odmah, a
 * za kadar se vezuje samo SOPSTVENI posao prave vrste. Mreža je uvek lažna -
 * dev ima pravi Google ključ.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CREA_LLM_DAILY_LIMIT } from "./creaLlmCore";
import { LLM_OUTPUT_TOKENS } from "./creaLlmVideoCore";
import schema from "./schema";
import { dayKey } from "./studioCore";

const modules = import.meta.glob("./**/*.ts");

function makeT() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof makeT>;

const previousKey = process.env.GOOGLE_AI_API_KEY;

beforeEach(() => {
  delete process.env.GOOGLE_AI_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousKey === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = previousKey;
});

async function seedUser(t: TestConvex, email = "lazar@example.com") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email,
      name: "Lazar Strip",
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

async function seedLik(t: TestConvex, userId: Id<"users">, handle: string) {
  return t.run(async (ctx) => {
    const image = await ctx.storage.store(new Blob(["slika"]));
    return ctx.db.insert("creaElements", {
      userId,
      kind: "lik",
      name: handle.charAt(0).toUpperCase() + handle.slice(1),
      handle,
      description: "devojčica sa kikama",
      imageStorageIds: [image],
      origin: "foto",
      consentAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
  });
}

async function doneJob(t: TestConvex, userId: Id<"users">, kind: "image" | "video") {
  return t.run((ctx) =>
    ctx.db.insert("generationJobs", {
      userId,
      modelSlug: kind === "image" ? "nano-banana-2-lite" : "hailuo-23-fast",
      kind,
      params: JSON.stringify({ prompt: "kadar" }),
      promptHash: "0123456789abcdef",
      status: "done" as const,
      creditCost: 8,
      falRequestId: "fal-real",
      createdAt: Date.now(),
    }),
  );
}

function geminiReply(json: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 1200 } };
}

const SHOT = { caption: "Maja nalazi ključ.", shotType: "detalj", imagePrompt: "@maja finds a glowing key", motionPrompt: "the key glints", move: "do-detalja", durationS: 6, elements: ["@maja"] };

describe("strip: plan", () => {
  test("bez ključa: DEMO strip se čuva odmah, samo sa MOJIM Likom, bez mreže i bez kredita", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const other = await seedUser(t, "drugi@example.com");
    const maja = await seedLik(t, userId, "maja");
    const foreign = await seedLik(t, other.userId, "tudji");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const reply = await asUser.action(api.creaLlm.planStoryboard, {
      story: "Maja pronalazi čarobni ključ u parku.",
      shots: 5,
      aspect: "9:16",
      quality: "jeftino",
      elementIds: [maja, foreign],
      locale: "sr",
    });
    expect(reply).toMatchObject({ ok: true, demo: true, remaining: CREA_LLM_DAILY_LIMIT - 1 });
    if (!reply.ok) throw new Error("strip");
    expect(reply.shots).toHaveLength(5);
    expect(reply.shots.every((shot) => shot.elements.join() === "maja")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    const saved = await asUser.query(api.creaStoryboards.get, { storyboardId: reply.storyboardId });
    expect(saved?.shots).toHaveLength(5);
    expect(saved?.settings).toEqual({ styleId: null, aspect: "9:16", quality: "jeftino", elementIds: [maja] });
    expect(await other.asUser.query(api.creaStoryboards.get, { storyboardId: reply.storyboardId })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("creditTransactions").collect())).toHaveLength(0);
  });

  test("sa ključem: Gemini dobija Likove i 3000 tokena, trošak ide u `creaLlmUsage`, krediti netaknuti", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-kljuc";
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const maja = await seedLik(t, userId, "maja");
    const bodies: Array<{ generationConfig: { maxOutputTokens: number }; contents: Array<{ parts: Array<{ text: string }> }> }> = [];
    vi.stubGlobal("fetch", (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(geminiReply({ title: "Ključ", shots: [SHOT, SHOT, { ...SHOT, move: "nepoznat" }] })), { status: 200 });
    }) as unknown as typeof fetch);

    const reply = await asUser.action(api.creaLlm.planStoryboard, { story: "Maja i ključ.", shots: 3, styleId: "foto-film", aspect: "16:9", quality: "lepse", elementIds: [maja], locale: "sr" });
    expect(reply).toMatchObject({ ok: true, demo: false, title: "Ključ" });
    if (!reply.ok) throw new Error("strip");
    expect(reply.shots[2]!.move).toBe("staticno");
    expect(bodies[0]!.generationConfig.maxOutputTokens).toBe(LLM_OUTPUT_TOKENS.storyboard);
    expect(bodies[0]!.contents[0]!.parts[0]!.text).toContain("@maja: Maja");
    expect(bodies[0]!.contents[0]!.parts[0]!.text).toContain("35mm analog film");
    expect((await t.run((ctx) => ctx.db.query("creaLlmUsage").collect()))[0]).toMatchObject({ calls: 1, inputTokens: 900, outputTokens: 1200 });
    expect(await t.run((ctx) => ctx.db.query("creditTransactions").collect())).toHaveLength(0);
  });

  test("loš odgovor: `GRESKA` i ništa se ne čuva; prazna priča se ne broji", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-kljuc";
    const t = makeT();
    const { asUser } = await seedUser(t);
    vi.stubGlobal("fetch", (async () => new Response(JSON.stringify(geminiReply({ shots: [SHOT] })), { status: 200 })) as unknown as typeof fetch);
    const args = { shots: 3, aspect: "9:16" as const, quality: "jeftino" as const, elementIds: [], locale: "sr" as const };
    expect(await asUser.action(api.creaLlm.planStoryboard, { story: "x", ...args })).toEqual({ ok: false, reason: "GRESKA" });
    expect(await asUser.action(api.creaLlm.planStoryboard, { story: "   ", ...args })).toEqual({ ok: false, reason: "PRAZNO" });
    expect(await t.run((ctx) => ctx.db.query("creaStoryboards").collect())).toHaveLength(0);
    expect((await asUser.query(api.creaLlm.getPromptHelperQuota, { now: Date.now() })).used).toBe(1);
  });
});

describe("strip: kadrovi i poslovi", () => {
  async function seededStoryboard(t: TestConvex) {
    const user = await seedUser(t);
    const maja = await seedLik(t, user.userId, "maja");
    const reply = await user.asUser.action(api.creaLlm.planStoryboard, { story: "Priča.", shots: 4, aspect: "9:16", quality: "jeftino", elementIds: [maja], locale: "sr" });
    if (!reply.ok) throw new Error("strip");
    return { ...user, storyboardId: reply.storyboardId };
  }

  test("svoj posao prave vrste se vezuje; tuđ, pogrešne vrste i nepostojeći kadar se odbijaju; nov crtež skida stari video", async () => {
    const t = makeT();
    const { userId, asUser, storyboardId } = await seededStoryboard(t);
    const other = await seedUser(t, "drugi@example.com");
    const image = await doneJob(t, userId, "image");
    const video = await doneJob(t, userId, "video");
    const foreign = await doneJob(t, other.userId, "image");

    expect(await asUser.mutation(api.creaStoryboards.attachJob, { storyboardId, shotIndex: 0, kind: "image", jobId: image })).toEqual({ ok: true });
    expect(await asUser.mutation(api.creaStoryboards.attachJob, { storyboardId, shotIndex: 0, kind: "video", jobId: video })).toEqual({ ok: true });
    expect(await asUser.mutation(api.creaStoryboards.attachJob, { storyboardId, shotIndex: 1, kind: "image", jobId: foreign })).toEqual({ ok: false, reason: "POGRESAN_RAD" });
    expect(await asUser.mutation(api.creaStoryboards.attachJob, { storyboardId, shotIndex: 1, kind: "image", jobId: video })).toEqual({ ok: false, reason: "POGRESAN_RAD" });
    expect(await asUser.mutation(api.creaStoryboards.attachJob, { storyboardId, shotIndex: 9, kind: "image", jobId: image })).toEqual({ ok: false, reason: "NEMA_KADRA" });
    expect(await other.asUser.mutation(api.creaStoryboards.attachJob, { storyboardId, shotIndex: 0, kind: "image", jobId: foreign })).toEqual({ ok: false, reason: "NIJE_DOSTUPAN" });

    let saved = await asUser.query(api.creaStoryboards.get, { storyboardId });
    expect(saved?.shots[0]).toMatchObject({ imageJobId: image, videoJobId: video });
    expect(saved?.jobs[image]).toMatchObject({ kind: "image", status: "done", isMock: false });

    const image2 = await doneJob(t, userId, "image");
    await asUser.mutation(api.creaStoryboards.attachJob, { storyboardId, shotIndex: 0, kind: "image", jobId: image2 });
    saved = await asUser.query(api.creaStoryboards.get, { storyboardId });
    expect(saved?.shots[0]!.imageJobId).toBe(image2);
    expect(saved?.shots[0]!.videoJobId).toBeUndefined();
  });

  test("izmena kadrova: 3-8 kadrova, tuđ posao sa klijenta se skida, nepoznat Lik ispada", async () => {
    const t = makeT();
    const { userId, asUser, storyboardId } = await seededStoryboard(t);
    const other = await seedUser(t, "drugi@example.com");
    const mine = await doneJob(t, userId, "image");
    const foreign = await doneJob(t, other.userId, "image");
    const shots = [
      { ...SHOT, elements: ["maja", "neko"], imageJobId: mine },
      { ...SHOT, imageJobId: foreign },
      SHOT,
    ];
    expect(await asUser.mutation(api.creaStoryboards.updateShots, { storyboardId, shots: JSON.stringify(shots), title: "  Novi   naslov " })).toEqual({ ok: true });
    const saved = await asUser.query(api.creaStoryboards.get, { storyboardId });
    expect(saved?.title).toBe("Novi naslov");
    expect(saved?.shots[0]).toMatchObject({ elements: ["maja"], imageJobId: mine });
    expect(saved?.shots[1]!.imageJobId).toBeUndefined();

    expect(await asUser.mutation(api.creaStoryboards.updateShots, { storyboardId, shots: JSON.stringify([SHOT, SHOT]) })).toEqual({ ok: false, reason: "NEISPRAVNO" });
    expect(await asUser.mutation(api.creaStoryboards.updateShots, { storyboardId, shots: JSON.stringify(Array(9).fill(SHOT)) })).toEqual({ ok: false, reason: "NEISPRAVNO" });
    expect(await asUser.mutation(api.creaStoryboards.updateShots, { storyboardId, shots: "nije json" })).toEqual({ ok: false, reason: "NEISPRAVNO" });
  });

  test("spisak i brisanje: briše se samo strip, radovi ostaju", async () => {
    const t = makeT();
    const { userId, asUser, storyboardId } = await seededStoryboard(t);
    const image = await doneJob(t, userId, "image");
    await asUser.mutation(api.creaStoryboards.attachJob, { storyboardId, shotIndex: 0, kind: "image", jobId: image });
    expect((await asUser.query(api.creaStoryboards.listMine, {})).map((row) => row.shotCount)).toEqual([4]);
    expect(await asUser.mutation(api.creaStoryboards.remove, { storyboardId })).toEqual({ ok: true });
    expect(await asUser.query(api.creaStoryboards.listMine, {})).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(image))).not.toBeNull();
  });

  test("najviše 30 stripova: najstariji odlazi", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    for (let index = 0; index < 31; index += 1) {
      await t.mutation(internal.creaStoryboards.insertPlan, { userId, title: `S${index}`, story: "p", settings: "{}", shots: "[]" });
    }
    const rows = await t.run((ctx) => ctx.db.query("creaStoryboards").collect());
    expect(rows).toHaveLength(30);
    expect(rows.some((row) => row.title === "S0")).toBe(false);
  });
});

describe("objašnjenje i reklama", () => {
  test("bez ključa: DEMO plan i DEMO scenario, 0 kredita; dnevni limit je zajednički", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const explainer = await asUser.action(api.creaLlm.planExplainer, { text: "AI uči iz primera. Zato su primeri važni.", seconds: 60, styleId: "tabla", locale: "sr" });
    expect(explainer).toMatchObject({ ok: true, demo: true });
    if (!explainer.ok) throw new Error("plan");
    expect(explainer.scenes).toHaveLength(3);
    const ad = await asUser.action(api.creaLlm.writeAdScript, { product: "Pečemo hleb svako jutro.", brand: "Pekara Mika", locale: "sr" });
    expect(ad).toMatchObject({ ok: true, demo: true, cta: "Svrati danas!" });

    await t.run(async (ctx) => {
      const usage = await ctx.db
        .query("creaLlmUsage")
        .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayKey(Date.now())))
        .unique();
      await ctx.db.patch(usage!._id, { calls: CREA_LLM_DAILY_LIMIT });
    });
    expect(await asUser.action(api.creaLlm.writeAdScript, { product: "x", locale: "sr" })).toEqual({ ok: false, reason: "LIMIT" });
    expect(await asUser.action(api.creaLlm.planExplainer, { text: "x", seconds: 30, styleId: "glina", locale: "sr" })).toEqual({ ok: false, reason: "LIMIT" });
    expect(await t.run((ctx) => ctx.db.query("creditTransactions").collect())).toHaveLength(0);
  });
});
