import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { parseStoredWords } from "./creaTranscriptsCore";
import { requireUserId } from "./helpers";

/**
 * Transkripti `stt` poslova (Crea K21, plan K17-13). Upisuje ih webhook
 * (`falWebhook.applyWebhookResult`); ovde je samo čitanje - za titlove (V25),
 * kratke klipove (V26) i detalj rada („Preuzmi SRT/VTT"). Samo vlasnik.
 */

export type TranscriptView =
  | { state: "waiting" }
  | { state: "failed" }
  /** Rad je gotov, a transkripta nema - napravljen pre K21 (tada se bacao). */
  | { state: "missing" }
  | {
      state: "ready";
      text: string;
      words: Array<{ w: string; s: number; e: number; speaker?: string }>;
      language: string | null;
      demo: boolean;
      /** Reči nisu sačuvane (transkript preko 800 KB) - ostaje samo tekst. */
      textOnly: boolean;
    };

async function transcriptFor(ctx: QueryCtx, userId: Id<"users">, jobId: Id<"generationJobs">): Promise<TranscriptView | null> {
  const job = await ctx.db.get(jobId);
  if (!job || job.userId !== userId) return null;
  const row = await ctx.db
    .query("creaTranscripts")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .first();
  if (row) {
    const words = parseStoredWords(row.words);
    return { state: "ready", text: row.text, words, language: row.language ?? null, demo: row.demo === true, textOnly: words.length === 0 && row.text.length > 0 };
  }
  if (job.status === "failed" || job.status === "refunded") return { state: "failed" };
  if (job.status !== "done") return { state: "waiting" };
  return { state: "missing" };
}

/** Transkript mog rada; tuđ ili nepostojeći rad = `null`. */
export const getForJob = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => transcriptFor(ctx, await requireUserId(ctx), args.jobId),
});

/** Isto za akciju (`creaLlm.findMoments`): server sam čita SOPSTVENI transkript korisnika. */
export const getOwnInternal = internalQuery({
  args: { userId: v.id("users"), jobId: v.id("generationJobs") },
  handler: async (ctx, args) => transcriptFor(ctx, args.userId, args.jobId),
});
