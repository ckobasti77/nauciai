import { v } from "convex/values";

import { styleById } from "../lib/crea-styles";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, query, type ActionCtx } from "./_generated/server";
import {
  buildDescribeRequest,
  buildPromptHelperRequest,
  bytesToBase64,
  CREA_LLM_DAILY_LIMIT,
  DESCRIBE_IMAGE_MAX_BYTES,
  DESCRIBE_IMAGE_TYPES,
  demoDescribe,
  demoPromptHelper,
  geminiGenerateUrl,
  llmCostUsd,
  llmUsageFrom,
  parsePromptHelperResponse,
  PROMPT_HELPER_INPUT_MAX,
  type PromptHelperResult,
} from "./creaLlmCore";
import {
  AD_LIMITS,
  buildAdRequest,
  buildExplainerRequest,
  buildMomentsRequest,
  buildStoryboardRequest,
  demoAd,
  demoExplainer,
  demoMoments,
  demoStoryboard,
  EXPLAINER_LIMITS,
  parseAdResponse,
  parseExplainerResponse,
  parseMomentsResponse,
  parseStoryboardResponse,
  type AdScript,
  type ExplainerPlan,
  type Moment,
} from "./creaLlmVideoCore";
import { buildPodcastRequest, demoPodcast, parsePodcastResponse, PODCAST_LIMITS, type PodcastScript } from "./creaLlmVoiceCore";
import { STORYBOARD_LIMITS, type StoryShot } from "./creaStoryboardsCore";
import { sentencesFromWords, transcriptDigest } from "./creaTranscriptsCore";
import { requireUserId } from "./helpers";
import { requireStudioAccess } from "./studio";
import { dayKey } from "./studioCore";

/**
 * Jeftin LLM Cree (K13, K01-19): jedan modul za ceo run. Prvi korisnik je S6
 * „Pomoćnik za opis" (srpski unos → precizan opis po delovima). Korisnik ne
 * plaća kredite; poziv broji dnevni limit (`CREA_LLM_DAILY_LIMIT`), a trošak se
 * upisuje u `creaLlmUsage` i u `studioUsageDaily.costUsd` (plafoni ga vide).
 * Bez `GOOGLE_AI_API_KEY` odgovor je deterministički DEMO.
 */

const localeValidator = v.union(v.literal("sr"), v.literal("en"));

/**
 * Zauzme jedan poziv iz dnevnog limita PRE mreže (dva brza klika ne mogu da
 * pređu limit). Pristup Crei je ista kapija kao za upload (`requireStudioAccess`).
 */
export const beginCall = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireStudioAccess(ctx);
    const day = dayKey(Date.now());
    const usage = await ctx.db
      .query("creaLlmUsage")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .unique();
    const used = usage?.calls ?? 0;
    if (used >= CREA_LLM_DAILY_LIMIT) return { ok: false as const };
    if (usage) await ctx.db.patch(usage._id, { calls: used + 1 });
    else await ctx.db.insert("creaLlmUsage", { userId, day, calls: 1, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    return { ok: true as const, userId, day, remaining: CREA_LLM_DAILY_LIMIT - used - 1 };
  },
});

/** Upiše tokene i trošak poziva - i u `studioUsageDaily.costUsd` (bez `generations`, bez kredita). */
export const recordCall = internalMutation({
  args: { userId: v.id("users"), day: v.string(), inputTokens: v.number(), outputTokens: v.number(), costUsd: v.number() },
  handler: async (ctx, args) => {
    const usage = await ctx.db
      .query("creaLlmUsage")
      .withIndex("by_user_day", (q) => q.eq("userId", args.userId).eq("day", args.day))
      .unique();
    if (usage) {
      await ctx.db.patch(usage._id, {
        inputTokens: usage.inputTokens + args.inputTokens,
        outputTokens: usage.outputTokens + args.outputTokens,
        costUsd: usage.costUsd + args.costUsd,
      });
    }
    if (args.costUsd <= 0) return null;
    const daily = await ctx.db
      .query("studioUsageDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", args.userId).eq("day", args.day))
      .unique();
    if (daily) await ctx.db.patch(daily._id, { costUsd: daily.costUsd + args.costUsd });
    else await ctx.db.insert("studioUsageDaily", { userId: args.userId, day: args.day, generations: 0, creditsSpent: 0, costUsd: args.costUsd });
    return null;
  },
});

export type PromptHelperReply =
  | ({ ok: true; demo: boolean; remaining: number } & PromptHelperResult)
  | { ok: false; reason: "PRAZNO" | "LIMIT" | "GRESKA" };

/** S6: srpski (ili engleski) unos → precizan opis po delovima + objašnjenje. 0 kredita. */
export const improvePrompt = action({
  args: { text: v.string(), locale: localeValidator },
  handler: async (ctx, args): Promise<PromptHelperReply> => {
    const text = args.text.trim();
    if (text.length === 0) return { ok: false, reason: "PRAZNO" };
    const slot = await ctx.runMutation(internal.creaLlm.beginCall, {});
    if (!slot.ok) return { ok: false, reason: "LIMIT" };

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return { ok: true, demo: true, remaining: slot.remaining, ...demoPromptHelper(text, args.locale) };

    let raw: unknown;
    try {
      const response = await fetch(geminiGenerateUrl(), {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(buildPromptHelperRequest(text.slice(0, PROMPT_HELPER_INPUT_MAX), args.locale)),
      });
      if (!response.ok) {
        console.warn(`Pomoćnik za opis: Gemini je vratio ${response.status}.`);
        return { ok: false, reason: "GRESKA" };
      }
      raw = await response.json();
    } catch (error) {
      console.warn(`Pomoćnik za opis: mreža - ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, reason: "GRESKA" };
    }

    // Trošak se upisuje i kad odgovor ne valja - Google ga je svejedno naplatio.
    const usage = llmUsageFrom(raw);
    await ctx.runMutation(internal.creaLlm.recordCall, {
      userId: slot.userId,
      day: slot.day,
      ...usage,
      costUsd: llmCostUsd(usage),
    });
    const result = parsePromptHelperResponse(raw);
    if (!result) return { ok: false, reason: "GRESKA" };
    return { ok: true, demo: false, remaining: slot.remaining, ...result };
  },
});

/**
 * S45 „Kako je ovo napravljeno?" za sliku bez opisa (okačena fotka, rad besplatnog
 * alata): Gemini Flash-Lite pogleda sliku i vrati opis po delovima, isti oblik kao
 * pomoćnik. Jeftino (~$0,001) - korisnik ne plaća kredite, broji se u isti dnevni
 * limit kao pomoćnik. Slika stiže kao bajtovi (klijent je smanji), ne ostaje nigde.
 */
export const describeImage = action({
  args: { image: v.bytes(), mimeType: v.string(), locale: localeValidator },
  handler: async (ctx, args): Promise<PromptHelperReply> => {
    if (args.image.byteLength === 0) return { ok: false, reason: "PRAZNO" };
    if (args.image.byteLength > DESCRIBE_IMAGE_MAX_BYTES || !(DESCRIBE_IMAGE_TYPES as readonly string[]).includes(args.mimeType)) {
      return { ok: false, reason: "GRESKA" };
    }
    const slot = await ctx.runMutation(internal.creaLlm.beginCall, {});
    if (!slot.ok) return { ok: false, reason: "LIMIT" };

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return { ok: true, demo: true, remaining: slot.remaining, ...demoDescribe(args.locale) };

    let raw: unknown;
    try {
      const response = await fetch(geminiGenerateUrl(), {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(buildDescribeRequest(bytesToBase64(new Uint8Array(args.image)), args.mimeType, args.locale)),
      });
      if (!response.ok) {
        console.warn(`Opis slike: Gemini je vratio ${response.status}.`);
        return { ok: false, reason: "GRESKA" };
      }
      raw = await response.json();
    } catch (error) {
      console.warn(`Opis slike: mreža - ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, reason: "GRESKA" };
    }

    const usage = llmUsageFrom(raw);
    await ctx.runMutation(internal.creaLlm.recordCall, {
      userId: slot.userId,
      day: slot.day,
      ...usage,
      costUsd: llmCostUsd(usage),
    });
    const result = parsePromptHelperResponse(raw);
    if (!result) return { ok: false, reason: "GRESKA" };
    return { ok: true, demo: false, remaining: slot.remaining, ...result };
  },
});

/** Koliko poziva pomoćnika je ostalo danas. `now` šalje klijent (upit ne čita sat). */
export const getPromptHelperQuota = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const usage = await ctx.db
      .query("creaLlmUsage")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayKey(args.now)))
      .unique();
    return { used: usage?.calls ?? 0, limit: CREA_LLM_DAILY_LIMIT };
  },
});

// ── Video tokovi (K21): strip, momenti, objašnjenje, reklama ─────────────────

type LlmSlot = { userId: Id<"users">; day: string; remaining: number };

/**
 * Jedan poziv Gemini-ja za video tokove (trošak je naš, korisniku 0 kr): mreža,
 * upis tokena i troška (i kad odgovor ne valja), pa čitanje. `null` = greška.
 */
async function callGemini<T>(ctx: ActionCtx, slot: LlmSlot, apiKey: string, body: unknown, parse: (raw: unknown) => T | null, label: string): Promise<T | null> {
  let raw: unknown;
  try {
    const response = await fetch(geminiGenerateUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn(`${label}: Gemini je vratio ${response.status}.`);
      return null;
    }
    raw = await response.json();
  } catch (error) {
    console.warn(`${label}: mreža - ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const usage = llmUsageFrom(raw);
  await ctx.runMutation(internal.creaLlm.recordCall, { userId: slot.userId, day: slot.day, ...usage, costUsd: llmCostUsd(usage) });
  return parse(raw);
}

export type StoryboardReply =
  | { ok: true; demo: boolean; remaining: number; storyboardId: Id<"creaStoryboards">; title: string; shots: StoryShot[] }
  | { ok: false; reason: "PRAZNO" | "LIMIT" | "GRESKA" };

/**
 * V10: priča → strip od 3-8 kadrova (0 kredita, dnevni limit). Likove (≤ 3) čita
 * server iz SVOJIH elemenata korisnika; strip se odmah čuva (`creaStoryboards`), da
 * tok preživi zatvaranje strane.
 */
export const planStoryboard = action({
  args: {
    story: v.string(),
    shots: v.number(),
    styleId: v.optional(v.string()),
    aspect: v.union(v.literal("9:16"), v.literal("16:9"), v.literal("1:1")),
    quality: v.union(v.literal("jeftino"), v.literal("lepse")),
    elementIds: v.array(v.id("creaElements")),
    locale: localeValidator,
    projectId: v.optional(v.id("studioProjects")),
  },
  handler: async (ctx, args): Promise<StoryboardReply> => {
    const story = args.story.trim().slice(0, STORYBOARD_LIMITS.storyChars);
    if (story.length === 0) return { ok: false, reason: "PRAZNO" };
    const slot = await ctx.runMutation(internal.creaLlm.beginCall, {});
    if (!slot.ok) return { ok: false, reason: "LIMIT" };
    const characters = await ctx.runQuery(internal.creaStoryboards.charactersFor, {
      userId: slot.userId,
      elementIds: args.elementIds.slice(0, STORYBOARD_LIMITS.elementsMax),
    });
    const input = {
      story,
      shots: Math.round(Math.min(STORYBOARD_LIMITS.shotsMax, Math.max(STORYBOARD_LIMITS.shotsMin, Number.isFinite(args.shots) ? args.shots : 4))),
      style: styleById(args.styleId)?.fragment ?? null,
      characters,
      locale: args.locale,
    };
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    const handles = characters.map((character) => character.handle);
    const plan = apiKey
      ? await callGemini(ctx, slot, apiKey, buildStoryboardRequest(input), (raw) => parseStoryboardResponse(raw, { shots: input.shots, handles }), "Strip")
      : demoStoryboard(input);
    if (!plan) return { ok: false, reason: "GRESKA" };
    const storyboardId: Id<"creaStoryboards"> = await ctx.runMutation(internal.creaStoryboards.insertPlan, {
      userId: slot.userId,
      title: plan.title,
      story,
      settings: JSON.stringify({ styleId: args.styleId ?? null, aspect: args.aspect, quality: args.quality, elementIds: characters.map((character) => character.id) }),
      shots: JSON.stringify(plan.shots),
      ...(args.projectId ? { projectId: args.projectId } : {}),
    });
    return { ok: true, demo: !apiKey, remaining: slot.remaining, storyboardId, title: plan.title, shots: plan.shots };
  },
});

export type MomentsReply =
  | { ok: true; demo: boolean; remaining: number; moments: Moment[] }
  | { ok: false; reason: "PRAZNO" | "LIMIT" | "GRESKA" | "NEMA_TRANSKRIPTA" };

/**
 * V26: najbolji momenti dugog snimka. Server sam čita SOPSTVENI transkript
 * korisnika (`creaTranscripts`), seče ga na ~24 000 znakova sa vremenima rečenica,
 * a odgovor vezuje za granice rečenica (15-60 s, bez preklapanja).
 */
export const findMoments = action({
  args: { transcriptJobId: v.id("generationJobs"), durationS: v.number(), locale: localeValidator },
  handler: async (ctx, args): Promise<MomentsReply> => {
    const slot = await ctx.runMutation(internal.creaLlm.beginCall, {});
    if (!slot.ok) return { ok: false, reason: "LIMIT" };
    const transcript = await ctx.runQuery(internal.creaTranscripts.getOwnInternal, { userId: slot.userId, jobId: args.transcriptJobId });
    if (!transcript || transcript.state !== "ready" || transcript.words.length === 0) return { ok: false, reason: "NEMA_TRANSKRIPTA" };
    const sentences = sentencesFromWords(transcript.words);
    const lastWord = transcript.words[transcript.words.length - 1]!.e;
    const durationS = Math.min(30 * 60, Math.max(lastWord, Number.isFinite(args.durationS) ? args.durationS : 0));
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    // DEMO transkript nema smisla slati modelu - momenti se biraju ravnomerno.
    if (!apiKey || transcript.demo) {
      const moments = demoMoments(sentences, durationS, args.locale);
      return moments.length > 0 ? { ok: true, demo: true, remaining: slot.remaining, moments } : { ok: false, reason: "PRAZNO" };
    }
    const moments = await callGemini(
      ctx,
      slot,
      apiKey,
      buildMomentsRequest(transcriptDigest(sentences), durationS, args.locale),
      (raw) => parseMomentsResponse(raw, sentences, durationS),
      "Momenti",
    );
    return moments ? { ok: true, demo: false, remaining: slot.remaining, moments } : { ok: false, reason: "GRESKA" };
  },
});

export type ExplainerReply = ({ ok: true; demo: boolean; remaining: number } & ExplainerPlan) | { ok: false; reason: "PRAZNO" | "LIMIT" | "GRESKA" };

/** V28: lekcija ili tekst → scene objašnjavajućeg videa (naracija + slika u stilu). */
export const planExplainer = action({
  args: {
    text: v.string(),
    seconds: v.union(v.literal(30), v.literal(60), v.literal(90)),
    styleId: v.union(v.literal("tabla"), v.literal("stapici"), v.literal("papir"), v.literal("glina"), v.literal("pikseli")),
    locale: localeValidator,
  },
  handler: async (ctx, args): Promise<ExplainerReply> => {
    const text = args.text.trim().slice(0, EXPLAINER_LIMITS.textChars);
    if (text.length === 0) return { ok: false, reason: "PRAZNO" };
    const slot = await ctx.runMutation(internal.creaLlm.beginCall, {});
    if (!slot.ok) return { ok: false, reason: "LIMIT" };
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return { ok: true, demo: true, remaining: slot.remaining, ...demoExplainer({ text, seconds: args.seconds, locale: args.locale }) };
    const plan = await callGemini(
      ctx,
      slot,
      apiKey,
      buildExplainerRequest({ text, seconds: args.seconds, styleId: args.styleId, locale: args.locale }),
      (raw) => parseExplainerResponse(raw, args.seconds),
      "Objašnjenje",
    );
    return plan ? { ok: true, demo: false, remaining: slot.remaining, ...plan } : { ok: false, reason: "GRESKA" };
  },
});

export type AdReply = ({ ok: true; demo: boolean; remaining: number } & AdScript) | { ok: false; reason: "PRAZNO" | "LIMIT" | "GRESKA" };

/** V31: dve rečenice o proizvodu → scenario oglasa od 15-20 s + opis pokreta proizvoda. */
export const writeAdScript = action({
  args: { product: v.string(), brand: v.optional(v.string()), locale: localeValidator },
  handler: async (ctx, args): Promise<AdReply> => {
    const product = args.product.trim().slice(0, AD_LIMITS.productChars);
    if (product.length === 0) return { ok: false, reason: "PRAZNO" };
    const slot = await ctx.runMutation(internal.creaLlm.beginCall, {});
    if (!slot.ok) return { ok: false, reason: "LIMIT" };
    const input = { product, brand: args.brand?.trim().slice(0, AD_LIMITS.brandChars) || null, locale: args.locale };
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return { ok: true, demo: true, remaining: slot.remaining, ...demoAd(input) };
    const script = await callGemini(ctx, slot, apiKey, buildAdRequest(input), parseAdResponse, "Reklama");
    return script ? { ok: true, demo: false, remaining: slot.remaining, ...script } : { ok: false, reason: "GRESKA" };
  },
});

// ── Podkast iz lekcije (K22, A6) ─────────────────────────────────────────────

export type PodcastReply = ({ ok: true; demo: boolean; remaining: number } & PodcastScript) | { ok: false; reason: "PRAZNO" | "LIMIT" | "GRESKA" };

/** A6: tekst lekcije → razgovor dva voditelja (0 kredita, dnevni limit). Glas ide posle, po replikama. */
export const writePodcast = action({
  args: {
    text: v.string(),
    minutes: v.union(v.literal(1), v.literal(2), v.literal(3)),
    hosts: v.array(v.string()),
    locale: localeValidator,
  },
  handler: async (ctx, args): Promise<PodcastReply> => {
    const text = args.text.trim().slice(0, PODCAST_LIMITS.textChars);
    if (text.length === 0) return { ok: false, reason: "PRAZNO" };
    const slot = await ctx.runMutation(internal.creaLlm.beginCall, {});
    if (!slot.ok) return { ok: false, reason: "LIMIT" };
    const host = (index: number, fallback: string) => args.hosts[index]?.trim().slice(0, PODCAST_LIMITS.hostChars) || fallback;
    const input = { text, minutes: args.minutes, hosts: [host(0, "Ana"), host(1, "Marko")] as const, locale: args.locale };
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return { ok: true, demo: true, remaining: slot.remaining, ...demoPodcast(input) };
    const script = await callGemini(ctx, slot, apiKey, buildPodcastRequest(input), parsePodcastResponse, "Podkast");
    return script ? { ok: true, demo: false, remaining: slot.remaining, ...script } : { ok: false, reason: "GRESKA" };
  },
});
