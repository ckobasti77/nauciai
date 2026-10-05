/// <reference types="vite/client" />

/**
 * K13 (S6, K01-19): pomoćnik za opis ne troši kredite, ima dnevni limit po
 * korisniku, a trošak ide u `creaLlmUsage` i `studioUsageDaily.costUsd`. Bez
 * ključa vraća DEMO. Mreža je uvek lažna - dev ima pravi Google ključ.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { CREA_LLM_DAILY_LIMIT } from "./creaLlmCore";
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

async function seedUser(t: TestConvex, role: "moderator" | "student" = "moderator") {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: `${role}@example.com`,
      name: "Pomocnik",
      username: role,
      role,
      language: "sr" as const,
      acceptedStudioTermsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, asUser: t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` }) };
}

const GEMINI_REPLY = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              parts: [
                { kind: "ko", text: "a black cat", gloss: "crna mačka" },
                { kind: "svetlo", text: "moonlight", gloss: "mesečina" },
              ],
              explanation: "Dodato je svetlo.",
            }),
          },
        ],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 400 },
};

describe("pomoćnik za opis", () => {
  test("bez ključa: DEMO odgovor, bez mreže, bez kredita i bez troška", async () => {
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const reply = await asUser.action(api.creaLlm.improvePrompt, { text: "mačka na krovu", locale: "sr" });
    expect(reply).toMatchObject({ ok: true, demo: true, remaining: CREA_LLM_DAILY_LIMIT - 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
    const ledger = await t.run((ctx) => ctx.db.query("creditTransactions").collect());
    expect(ledger).toHaveLength(0);
    const daily = await t.run((ctx) => ctx.db.query("studioUsageDaily").collect());
    expect(daily).toHaveLength(0);
    expect(await asUser.query(api.creaLlm.getPromptHelperQuota, { now: Date.now() })).toEqual({ used: 1, limit: CREA_LLM_DAILY_LIMIT });
    void userId;
  });

  test("sa ključem: Gemini zahtev, delovi i opis, trošak u oba dnevna zbira, krediti netaknuti", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-kljuc";
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(GEMINI_REPLY), { status: 200 });
    }) as unknown as typeof fetch);

    const reply = await asUser.action(api.creaLlm.improvePrompt, { text: "crna mačka noću", locale: "sr" });
    expect(reply).toMatchObject({ ok: true, demo: false, prompt: "a black cat, moonlight", explanation: "Dodato je svetlo." });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain(":generateContent");
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-kljuc");

    const expectedCost = (1000 * 0.3 + 400 * 2.5) / 1_000_000;
    const usage = await t.run((ctx) => ctx.db.query("creaLlmUsage").collect());
    expect(usage).toMatchObject([{ userId, day: dayKey(Date.now()), calls: 1, inputTokens: 1000, outputTokens: 400 }]);
    expect(usage[0]!.costUsd).toBeCloseTo(expectedCost, 12);
    const daily = await t.run((ctx) => ctx.db.query("studioUsageDaily").collect());
    expect(daily).toMatchObject([{ userId, generations: 0, creditsSpent: 0 }]);
    expect(daily[0]!.costUsd).toBeCloseTo(expectedCost, 12);
    expect(await t.run((ctx) => ctx.db.query("creditTransactions").collect())).toHaveLength(0);
  });

  test("greška provajdera: `GRESKA`, poziv se ipak broji (nema ponavljanja u krug)", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-kljuc";
    const t = makeT();
    const { asUser } = await seedUser(t);
    vi.stubGlobal("fetch", (async () => new Response("pao", { status: 503 })) as unknown as typeof fetch);
    expect(await asUser.action(api.creaLlm.improvePrompt, { text: "x", locale: "sr" })).toEqual({ ok: false, reason: "GRESKA" });
    expect((await asUser.query(api.creaLlm.getPromptHelperQuota, { now: Date.now() })).used).toBe(1);
  });

  test("dnevni limit: posle limita `LIMIT` bez mreže", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-kljuc";
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    await t.run((ctx) =>
      ctx.db.insert("creaLlmUsage", { userId, day: dayKey(Date.now()), calls: CREA_LLM_DAILY_LIMIT, inputTokens: 0, outputTokens: 0, costUsd: 0 }),
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await asUser.action(api.creaLlm.improvePrompt, { text: "x", locale: "sr" })).toEqual({ ok: false, reason: "LIMIT" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("prazan unos se ne broji; bez pristupa Crei poziv pada", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    expect(await asUser.action(api.creaLlm.improvePrompt, { text: "   ", locale: "sr" })).toEqual({ ok: false, reason: "PRAZNO" });
    expect((await asUser.query(api.creaLlm.getPromptHelperQuota, { now: Date.now() })).used).toBe(0);

    const student = await seedUser(t, "student");
    await expect(student.asUser.action(api.creaLlm.improvePrompt, { text: "x", locale: "sr" })).rejects.toThrow();
    await expect(t.action(api.creaLlm.improvePrompt, { text: "x", locale: "sr" })).rejects.toThrow();
  });

  test("`recordCall` bez troška ne pravi red u `studioUsageDaily`", async () => {
    const t = makeT();
    const { userId } = await seedUser(t);
    await t.mutation(internal.creaLlm.recordCall, { userId, day: "2026-10-05", inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(await t.run((ctx) => ctx.db.query("studioUsageDaily").collect())).toHaveLength(0);
  });
});

describe("opis slike (K16, S45 „Kako je ovo napravljeno?“)", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).buffer;

  test("bez ključa: DEMO opis po delovima, bez mreže", async () => {
    const t = makeT();
    const { asUser } = await seedUser(t);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const reply = await asUser.action(api.creaLlm.describeImage, { image: JPEG, mimeType: "image/jpeg", locale: "sr" });
    expect(reply).toMatchObject({ ok: true, demo: true });
    if (!reply.ok) throw new Error("DEMO");
    expect(reply.parts.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("sa ključem: slika ide inline (base64), opis se čita isto kao pomoćnik, trošak se upisuje, 0 kredita", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-kljuc";
    const t = makeT();
    const { asUser } = await seedUser(t);
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(GEMINI_REPLY), { status: 200 });
    }) as unknown as typeof fetch);

    const reply = await asUser.action(api.creaLlm.describeImage, { image: JPEG, mimeType: "image/jpeg", locale: "sr" });
    expect(reply).toMatchObject({ ok: true, demo: false, prompt: "a black cat, moonlight" });
    const parts = (bodies[0] as { contents: Array<{ parts: Array<{ inlineData?: { mimeType: string; data: string } }> }> }).contents[0]!.parts;
    expect(parts[0]!.inlineData).toEqual({ mimeType: "image/jpeg", data: btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3)) });
    expect((await t.run((ctx) => ctx.db.query("creaLlmUsage").collect()))[0]).toMatchObject({ calls: 1, inputTokens: 1000 });
    expect(await t.run((ctx) => ctx.db.query("creditTransactions").collect())).toHaveLength(0);
  });

  test("prazna, prevelika ili ne-slika se odbija bez trošenja limita; isti dnevni limit kao pomoćnik", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-kljuc";
    const t = makeT();
    const { userId, asUser } = await seedUser(t);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await asUser.action(api.creaLlm.describeImage, { image: new ArrayBuffer(0), mimeType: "image/jpeg", locale: "sr" })).toEqual({ ok: false, reason: "PRAZNO" });
    expect(await asUser.action(api.creaLlm.describeImage, { image: JPEG, mimeType: "image/svg+xml", locale: "sr" })).toEqual({ ok: false, reason: "GRESKA" });
    expect(await asUser.action(api.creaLlm.describeImage, { image: new ArrayBuffer(1_600_000), mimeType: "image/png", locale: "sr" })).toEqual({ ok: false, reason: "GRESKA" });
    expect((await asUser.query(api.creaLlm.getPromptHelperQuota, { now: Date.now() })).used).toBe(0);

    await t.run((ctx) =>
      ctx.db.insert("creaLlmUsage", { userId, day: dayKey(Date.now()), calls: CREA_LLM_DAILY_LIMIT, inputTokens: 0, outputTokens: 0, costUsd: 0 }),
    );
    expect(await asUser.action(api.creaLlm.describeImage, { image: JPEG, mimeType: "image/jpeg", locale: "sr" })).toEqual({ ok: false, reason: "LIMIT" });
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(t.action(api.creaLlm.describeImage, { image: JPEG, mimeType: "image/jpeg", locale: "sr" })).rejects.toThrow();
  });
});
