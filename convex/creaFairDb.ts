import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { FAIR_UNLIMITED, fairUnlimitedBlock } from "./creaFairCore";
import { CREA_FLAG_KEYS, readCreaFlag } from "./creaFlags";

/**
 * Pošteni krediti (K28) - čitanja i upisi koje deli `studio.createJobForUser`
 * (i preko njega MCP i pomoćnik) sa `creaFair.ts`. Ne uvozi `studio.ts`, da
 * `studio.ts` može da uvozi ovaj modul bez kružnog uvoza.
 */

/** Lični dnevni limit potrošnje ili `null` kad ga korisnik nije postavio. */
export async function personalDailyLimit(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<number | null> {
  const row = await ctx.db
    .query("creaSpendLimits")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return row?.dailyCredits ?? null;
}

/** Plan od €24,99 = aktivan upis sa planom `premium` (isti izvor kao pristup kursu). */
export async function hasPremiumPlan(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<boolean> {
  const enrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(50);
  return enrollments.some((row) => row.status === "active" && row.plan === "premium");
}

/** Koliko besplatnih poslova te vrste je korisnik napravio od `since` (najviše `limit`). */
export async function countFreeJobs(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  kind: "redo" | "fair",
  since: number,
  limit: number,
): Promise<number> {
  const rows = await ctx.db
    .query("creaFreeJobs")
    .withIndex("by_userId_and_kind_and_createdAt", (q) => q.eq("userId", userId).eq("kind", kind).gte("createdAt", since))
    .take(limit);
  return rows.length;
}

/**
 * C8: sme li ovaj posao kao „neograničen". Baca kod iz `fairUnlimitedBlock` -
 * pre ijednog upisa posla, pa odbijanje ne ostavlja ništa.
 */
export async function assertFairUnlimited(
  ctx: MutationCtx,
  input: {
    userId: Id<"users">;
    modelSlug: string;
    estimatedCostUsd: number;
    params: Record<string, unknown>;
    otherDiscount: boolean;
    now: number;
  },
) {
  const inFlight = (
    await Promise.all(
      (["reserved", "running"] as const).map((status) =>
        ctx.db
          .query("generationJobs")
          .withIndex("by_user_status", (q) => q.eq("userId", input.userId).eq("status", status))
          .take(20),
      ),
    )
  )
    .flat()
    .filter((job) => job.fairUnlimited === true).length;
  const numImages = typeof input.params.num_images === "number" ? input.params.num_images : 1;
  const block = fairUnlimitedBlock({
    flagOn: await readCreaFlag(ctx, CREA_FLAG_KEYS.fairUnlimited),
    premium: await hasPremiumPlan(ctx, input.userId),
    modelSlug: input.modelSlug,
    estimatedCostUsd: input.estimatedCostUsd,
    numImages,
    otherDiscount: input.otherDiscount,
    inFlight,
    used: await countFreeJobs(ctx, input.userId, "fair", input.now - FAIR_UNLIMITED.windowMs, FAIR_UNLIMITED.monthlyJobs),
  });
  if (block) throw new Error(block);
}

/** Neuspeo besplatan posao (ponavljanje ili „neograničeno") se ne broji u limit. */
export async function releaseFreeJob(ctx: MutationCtx, job: Doc<"generationJobs">) {
  const row = await ctx.db
    .query("creaFreeJobs")
    .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
    .unique();
  if (row) await ctx.db.delete("creaFreeJobs", row._id);
}
