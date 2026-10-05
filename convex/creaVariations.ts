import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { extraOutputChildren } from "./creaLayers";
import { layerNumberOf, VARIATION_PARAM } from "./creaLayersCore";
import { requireUserId } from "./helpers";
import { isMockRequestId } from "./studioCore";

/** Najviše poslova jednog probnog lista (16 skica = 4 posla × 4, ili 16 × 1). */
export const SHEET_MAX_JOBS = 16;

/**
 * Probni list i varijacije (Crea K13, S4/S5): za spisak poslova vraća sve slike
 * - izlaz posla i njegove varijacije (`derivation: "varijacija"`, više slika
 * jednog poziva) - redom. Tuđ ili nepostojeći posao se preskače.
 */
export const getSheet = query({
  args: { jobIds: v.array(v.id("generationJobs")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const out: Array<{
      jobId: Id<"generationJobs">;
      status: string;
      error: string | null;
      isMock: boolean;
      images: Array<{ jobId: Id<"generationJobs">; number: number; url: string }>;
    }> = [];
    for (const jobId of args.jobIds.slice(0, SHEET_MAX_JOBS)) {
      const job = await ctx.db.get("generationJobs", jobId);
      if (!job || job.userId !== userId) continue;
      const children = job.status === "done" ? await extraOutputChildren(ctx, job, "varijacija") : [];
      const images: Array<{ jobId: Id<"generationJobs">; number: number; url: string }> = [];
      for (const entry of [job, ...children]) {
        const url = entry.outputStorageId ? await ctx.storage.getUrl(entry.outputStorageId) : null;
        if (url) images.push({ jobId: entry._id, number: entry._id === job._id ? 1 : layerNumberOf(entry.params, VARIATION_PARAM), url });
      }
      images.sort((a, b) => a.number - b.number);
      out.push({ jobId: job._id, status: job.status, error: job.error ?? null, isMock: isMockRequestId(job.falRequestId), images });
    }
    return out;
  },
});
