import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { requireUserId } from "./helpers";
import { deleteJobForUser, jobDeleteProblem, storageIdsUsedByOtherJobs } from "./studio";

/**
 * Galerija 2.0 (Crea K16, U9 + S43): omiljeno i masovne akcije nad radovima
 * prijavljenog korisnika. Preuzimanje ide sa klijenta (potpisani URL-ovi), a
 * premeštanje i brisanje su ovde, uvek samo nad sopstvenim radovima.
 */

/** Najviše radova po pozivu premeštanja (jedan upis po radu). */
export const MOVE_BATCH_MAX = 100;
/**
 * Najviše radova po pozivu brisanja. Brisanje čita celu istoriju korisnika da bi
 * znalo koji ulazi su još u upotrebi (`storageIdsUsedByOtherJobs`), pa paket
 * mora da bude mali; klijent šalje izbor u paketima.
 */
export const DELETE_BATCH_MAX = 20;

/** Uključi/isključi „Omiljeno"; vraća novo stanje. */
export const toggleFavorite = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId) throw new Error("Posao nije pronađen.");
    const favorite = job.favoriteAt === undefined;
    await ctx.db.patch("generationJobs", job._id, { favoriteAt: favorite ? Date.now() : undefined });
    return favorite;
  },
});

/** Premesti radove u projekat (`null` = bez projekta). Tuđi i nepostojeći radovi se preskaču. */
export const moveJobs = mutation({
  args: {
    jobIds: v.array(v.id("generationJobs")),
    projectId: v.union(v.id("studioProjects"), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.jobIds.length > MOVE_BATCH_MAX) throw new Error("PREVISE_STAVKI");
    if (args.projectId !== null) {
      const project = await ctx.db.get("studioProjects", args.projectId);
      if (!project || project.userId !== userId || project.archivedAt !== undefined) {
        throw new Error("PROJEKAT_NIJE_DOSTUPAN");
      }
    }
    let moved = 0;
    for (const jobId of new Set(args.jobIds)) {
      const job = await ctx.db.get("generationJobs", jobId);
      if (!job || job.userId !== userId) continue;
      if ((job.projectId ?? null) === args.projectId) continue;
      await ctx.db.patch("generationJobs", job._id, { projectId: args.projectId ?? undefined });
      moved += 1;
    }
    return { moved };
  },
});

export type DeleteSkipReason = "NIJE_PRONADJEN" | "POSAO_U_TOKU" | "POSAO_POVEZAN_SA_LEKCIJOM";

/**
 * Obriši izabrane radove (paket do `DELETE_BATCH_MAX`). Isto pravilo kao jedan
 * „Obriši": rad u toku i rad vezan za lekciju se NE brišu - ovde se preskaču sa
 * razlogom umesto da obore ceo paket. Ulaz koji drži neki rad van brisanja ostaje.
 */
export const deleteJobs = mutation({
  args: { jobIds: v.array(v.id("generationJobs")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.jobIds.length > DELETE_BATCH_MAX) throw new Error("PREVISE_STAVKI");

    const doomed: Doc<"generationJobs">[] = [];
    const skipped: Array<{ jobId: Id<"generationJobs">; reason: DeleteSkipReason }> = [];
    for (const jobId of new Set(args.jobIds)) {
      const job = await ctx.db.get("generationJobs", jobId);
      if (!job || job.userId !== userId) {
        skipped.push({ jobId, reason: "NIJE_PRONADJEN" });
        continue;
      }
      const problem = jobDeleteProblem(job);
      if (problem) skipped.push({ jobId, reason: problem });
      else doomed.push(job);
    }

    if (doomed.length > 0) {
      const stillUsed = await storageIdsUsedByOtherJobs(ctx, userId, new Set(doomed.map((job) => job._id)));
      for (const job of doomed) await deleteJobForUser(ctx, userId, job, stillUsed);
    }
    return { deleted: doomed.length, skipped };
  },
});
