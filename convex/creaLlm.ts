import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
import {
  buildPromptHelperRequest,
  CREA_LLM_DAILY_LIMIT,
  demoPromptHelper,
  geminiGenerateUrl,
  llmCostUsd,
  llmUsageFrom,
  parsePromptHelperResponse,
  PROMPT_HELPER_INPUT_MAX,
  type PromptHelperResult,
} from "./creaLlmCore";
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
