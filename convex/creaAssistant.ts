import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, mutation, query, type MutationCtx } from "./_generated/server";
import {
  ASSISTANT_LIMITS,
  buildAssistantRequest,
  demoAssistant,
  isConfirmation,
  parseAssistantResponse,
  planProblem,
  type AssistantStep,
} from "./creaAssistantCore";
import { geminiGenerateUrl, llmCostUsd, llmUsageFrom } from "./creaLlmCore";
import { adoptJobOutput } from "./creaVersions";
import { validatePrompt, type ModerationCategory } from "./creditsCore";
import { requireUserId } from "./helpers";
import { createJobForUser } from "./studio";

/**
 * Pomoćnik Cree (K28, U12). Tri koraka, i samo treći troši kredite:
 * 1. `draftPlan` (akcija): rečenica → koraci, jeftin LLM preko Google ključa (0 kr,
 *    dnevni limit pomoćnika). Ne upisuje plan i ne pravi posao.
 * 2. Klijent bira model i cenu svakog koraka (Auto, `lib/crea-auto.ts`) i pokaže ukupnu cenu.
 * 3. `confirmPlan` (mutacija) tek uz izričito „da": plan + PRVI posao. Sledeći korak
 *    pokreće `advancePlan` kad prethodni stigne. Svaki posao ide kroz
 *    `studio.createJobForUser` - isto telo kao MCP `create_generation`
 *    (`createJobInternal`) - sa gornjom granicom cene koju je korisnik video.
 */

const localeValidator = v.union(v.literal("sr"), v.literal("en"));

export type DraftReply =
  | { ok: true; demo: boolean; remaining: number; reply: string; steps: AssistantStep[] }
  | { ok: false; reason: "PRAZNO" | "LIMIT" | "GRESKA" }
  | { ok: false; reason: "PROVERA"; category: ModerationCategory };

/** C7 i za pomoćnika: zahtev i svaki korak prolaze istu proveru kao `createJob` (lokalna pravila). */
function blockedCategory(texts: readonly string[]): ModerationCategory | null {
  for (const text of texts) {
    const check = validatePrompt(text, 5000);
    if (!check.ok && check.reason === "ZABRANJEN_POJAM" && check.category) return check.category;
  }
  return null;
}

export const draftPlan = action({
  args: { text: v.string(), locale: localeValidator },
  handler: async (ctx, args): Promise<DraftReply> => {
    const text = args.text.trim().slice(0, ASSISTANT_LIMITS.textChars);
    if (text.length === 0) return { ok: false, reason: "PRAZNO" };
    const asked = blockedCategory([text]);
    if (asked) return { ok: false, reason: "PROVERA", category: asked };
    const slot = await ctx.runMutation(internal.creaLlm.beginCall, {});
    if (!slot.ok) return { ok: false, reason: "LIMIT" };

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    let plan = apiKey ? null : demoAssistant(text, args.locale);
    if (apiKey) {
      let raw: unknown;
      try {
        const response = await fetch(geminiGenerateUrl(), {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(buildAssistantRequest(text, args.locale)),
        });
        if (!response.ok) {
          console.warn(`Pomoćnik: Gemini je vratio ${response.status}.`);
          return { ok: false, reason: "GRESKA" };
        }
        raw = await response.json();
      } catch (error) {
        console.warn(`Pomoćnik: mreža - ${error instanceof Error ? error.message : String(error)}`);
        return { ok: false, reason: "GRESKA" };
      }
      const usage = llmUsageFrom(raw);
      await ctx.runMutation(internal.creaLlm.recordCall, { userId: slot.userId, day: slot.day, ...usage, costUsd: llmCostUsd(usage) });
      plan = parseAssistantResponse(raw);
    }
    if (!plan) return { ok: false, reason: "GRESKA" };
    const stepBlock = blockedCategory(plan.steps.map((step) => step.prompt));
    if (stepBlock) return { ok: false, reason: "PROVERA", category: stepBlock };
    return { ok: true, demo: !apiKey, remaining: slot.remaining, reply: plan.reply, steps: plan.steps };
  },
});

const stepInput = v.object({
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
  title: v.string(),
  modelSlug: v.string(),
  inputMode: v.string(),
  params: v.string(),
  maxCredits: v.number(),
  fromStep: v.optional(v.number()),
});

/** Pokreće korak `index`: posao sa granicom cene; video iz slike dobija izlaz te slike kao ulaz. */
async function startStep(ctx: MutationCtx, plan: Doc<"creaAssistantPlans">, index: number) {
  const step = plan.steps[index];
  if (!step) throw new Error("NEISPRAVAN_PLAN");
  let inputs: string | undefined;
  let lineage: { parentJobId: Id<"generationJobs">; derivation: "animacija" } | Record<string, never> = {};
  if (step.fromStep !== undefined) {
    const sourceId = plan.steps[step.fromStep]?.jobId;
    const source = sourceId ? await ctx.db.get("generationJobs", sourceId) : null;
    if (!source || source.status !== "done" || !source.outputStorageId) throw new Error("IZVOR_NIJE_DOSTUPAN");
    const adopted = await adoptJobOutput(ctx, plan.userId, source, source.outputStorageId);
    inputs = JSON.stringify({ [adopted.slot]: [adopted.storageId] });
    lineage = { parentJobId: source._id, derivation: "animacija" };
  }
  const result = await createJobForUser(
    ctx,
    plan.userId,
    {
      modelSlug: step.modelSlug,
      params: step.params,
      inputMode: step.inputMode,
      ...(inputs ? { inputs } : {}),
      ...(plan.projectId ? { projectId: plan.projectId } : {}),
      ...lineage,
      creaTool: "slika.pomocnik",
    },
    { maxCreditCost: step.maxCredits },
  );
  if (typeof result !== "string") throw new Error("NEISPRAVAN_PROMPT:ZABRANJEN_POJAM");
  const steps = plan.steps.map((entry, at) => (at === index ? { ...entry, jobId: result } : entry));
  await ctx.db.patch("creaAssistantPlans", plan._id, { steps });
  return result;
}

/**
 * Potvrda plana. Bez izričitog „da" se ništa ne upisuje i ništa ne plaća. Plan i
 * prvi posao su ista transakcija: ako prvi posao ne prođe (krediti, limit, cena
 * porasla), ne ostaje ni plan.
 */
export const confirmPlan = mutation({
  args: {
    answer: v.string(),
    request: v.string(),
    steps: v.array(stepInput),
    projectId: v.optional(v.id("studioProjects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!isConfirmation(args.answer)) throw new Error("POTVRDA_POTREBNA");
    const problem = planProblem(args.steps);
    if (problem) throw new Error(problem);
    const planId = await ctx.db.insert("creaAssistantPlans", {
      userId,
      request: args.request.trim().slice(0, ASSISTANT_LIMITS.textChars),
      steps: args.steps.map((step) => ({
        kind: step.kind,
        title: step.title.slice(0, ASSISTANT_LIMITS.titleChars),
        modelSlug: step.modelSlug,
        inputMode: step.inputMode,
        params: step.params,
        maxCredits: step.maxCredits,
        ...(step.fromStep !== undefined ? { fromStep: step.fromStep } : {}),
      })),
      totalCredits: args.steps.reduce((sum, step) => sum + step.maxCredits, 0),
      status: "running",
      ...(args.projectId ? { projectId: args.projectId } : {}),
      createdAt: Date.now(),
    });
    const plan = await ctx.db.get("creaAssistantPlans", planId);
    if (!plan) throw new Error("NEISPRAVAN_PLAN");
    await startStep(ctx, plan, 0);
    return planId;
  },
});

/**
 * Sledeći korak potvrđenog plana, kad je prethodni gotov (i izlaz sačuvan). Pao
 * korak zaustavlja plan - ostali se ne pokreću i ne plaćaju. Idempotentno: korak
 * koji već ima posao se ne pokreće ponovo.
 */
export const advancePlan = mutation({
  args: { planId: v.id("creaAssistantPlans") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const plan = await ctx.db.get("creaAssistantPlans", args.planId);
    if (!plan || plan.userId !== userId) throw new Error("NEMA_PRISTUPA");
    if (plan.status !== "running") return plan.status;
    const current = plan.steps.reduce((last, step, index) => (step.jobId ? index : last), -1);
    const jobId = plan.steps[current]?.jobId;
    const job = jobId ? await ctx.db.get("generationJobs", jobId) : null;
    if (!job || job.status === "failed" || job.status === "refunded") {
      await ctx.db.patch("creaAssistantPlans", plan._id, { status: "stopped", error: job?.error ?? "POSAO_NIJE_USPEO" });
      return "stopped";
    }
    if (job.status !== "done" || !job.outputStorageId) return "running";
    if (current === plan.steps.length - 1) {
      await ctx.db.patch("creaAssistantPlans", plan._id, { status: "done" });
      return "done";
    }
    await startStep(ctx, plan, current + 1);
    return "running";
  },
});

/** Korisnik odustaje od ostatka plana; posao koji već radi ostaje (otkazuje se posebno). */
export const stopPlan = mutation({
  args: { planId: v.id("creaAssistantPlans") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const plan = await ctx.db.get("creaAssistantPlans", args.planId);
    if (!plan || plan.userId !== userId) throw new Error("NEMA_PRISTUPA");
    if (plan.status === "running") await ctx.db.patch("creaAssistantPlans", plan._id, { status: "stopped", error: "ZAUSTAVLJENO" });
    return null;
  },
});

/** Poslednji plan korisnika sa stanjem svakog koraka (za ekran pomoćnika). */
export const getLatestPlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const plan = await ctx.db
      .query("creaAssistantPlans")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (!plan) return null;
    const steps = await Promise.all(
      plan.steps.map(async (step) => {
        const job = step.jobId ? await ctx.db.get("generationJobs", step.jobId) : null;
        return {
          kind: step.kind,
          title: step.title,
          modelSlug: step.modelSlug,
          maxCredits: step.maxCredits,
          jobId: step.jobId ?? null,
          status: job?.status ?? null,
          creditCost: job?.creditCost ?? null,
          outputUrl: job?.outputStorageId ? await ctx.storage.getUrl(job.outputStorageId) : null,
          ready: job?.status === "done" && job.outputStorageId !== undefined,
        };
      }),
    );
    return { _id: plan._id, request: plan.request, status: plan.status, error: plan.error ?? null, totalCredits: plan.totalCredits, steps };
  },
});
