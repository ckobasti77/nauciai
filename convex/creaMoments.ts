import { v } from "convex/values";

import { query } from "./_generated/server";
import { CREA_MOMENT_SCAN_LIMIT, momentFor, type CreaMoment } from "./creaMomentsCore";
import { requireUserId } from "./helpers";

/**
 * Da li je ovaj gotov rad poseban trenutak (K25, U4): prvi rad, prvi video/zvuk/slika ili
 * okrugao broj radova. Klijent pita JEDNOM, kad vidi da je rad upravo stigao, pa konfete
 * ne zavise od toga koliko je istorije učitano.
 *
 * Čitanje je ograničeno: najviše `CREA_MOMENT_SCAN_LIMIT` (101) gotovih radova kroz
 * `by_user_status`. Kad ih ima više, jubileji su prošli, a „prvi od vrste" se ne tvrdi
 * (`exact: false`) - bolje bez konfeta nego lažne.
 */
export const momentForJob = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args): Promise<CreaMoment | null> => {
    const userId = await requireUserId(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId || job.status !== "done" || job.provider === "local") return null;

    const done = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "done"))
      .take(CREA_MOMENT_SCAN_LIMIT);
    const generated = done.filter((row) => row.provider !== "local");
    return momentFor(
      {
        total: generated.length,
        ofKind: generated.filter((row) => row.kind === job.kind).length,
        exact: done.length < CREA_MOMENT_SCAN_LIMIT,
      },
      job.kind,
    );
  },
});
