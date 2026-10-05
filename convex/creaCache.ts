import { v } from "convex/values";

import { query } from "./_generated/server";
import { isReusableJob, requestHash } from "./creaCacheCore";
import { requireUserId } from "./helpers";
import { inputShasOf } from "./studio";
import {
  parseClientInputs,
  parseContinuationSource,
  parseInputModes,
  parseInputSpec,
  sanitizeJobInputs,
} from "./studioJobCore";
import { isMockRequestId } from "./studioCore";
import { parseParamSpec, sanitizeSpecParams } from "./studioParamSpec";
import { parsePriceRule } from "./studioPricing";

/** Koliko poslova sa istim otiskom se gleda - dovoljno za „najnoviji upotrebljiv". */
const MAX_CANDIDATES = 10;

/**
 * Keš istih zahteva (Crea C4). Pre plaćanja UI pita: „da li ovaj korisnik VEĆ
 * ima isti rad?" - isti model, režim, parametri i SADRŽAJ ulaza. Ako ima,
 * nudi „otvori (0 kr)" ili „napravi novu varijantu".
 *
 * Otisak se računa ISTIM putem kao u `createJob` (`buildCatalogOrder`):
 * očišćeni parametri, očišćeni ulazi, sha256 iz `_storage`. Upit nikad ne
 * baca zbog neispravnog zahteva - tada samo kaže „nema" (`null`), a pravu
 * grešku vrati `createJob`.
 *
 * Gleda se samo indeks `by_user_requestHash` ovog korisnika: keš nikad ne ide
 * između korisnika (K01-13), a ulazi koje korisnik ne poseduje se ne heširaju.
 * `now` šalje klijent (upit ne čita sat); pogrešan `now` može samo da ponudi
 * ili ne ponudi SOPSTVENI rad.
 */
export const findIdenticalJob = query({
  args: {
    modelSlug: v.string(),
    params: v.string(),
    inputMode: v.string(),
    inputs: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const model = await ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", args.modelSlug))
      .unique();
    if (!model || !model.isEnabled) return null;
    const spec = parseParamSpec(model.paramSpec);
    const rule = parsePriceRule(model.priceRule);
    if (!spec || !rule || !parseInputModes(model.inputModes).includes(args.inputMode)) return null;

    const continuation = parseContinuationSource(model.capabilities);
    if (continuation && continuation.mode === args.inputMode) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(args.params);
    } catch {
      return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const sanitized = sanitizeSpecParams(spec, rule, raw as Record<string, unknown>, args.inputMode);
    if (!sanitized.ok) return null;

    const parsedInputs = parseClientInputs(args.inputs);
    if (!parsedInputs) return null;
    const inputs = sanitizeJobInputs(parsedInputs, parseInputSpec(model.inputSpec), args.inputMode);
    if (!inputs.ok) return null;

    // Samo sopstveni fajlovi - isti uslov po kojem bi `createJob` posao primio.
    for (const ids of Object.values(inputs.inputs)) {
      for (const rawId of ids) {
        const storageId = ctx.db.system.normalizeId("_storage", rawId);
        if (!storageId) return null;
        const upload = await ctx.db
          .query("studioUploads")
          .withIndex("by_storage", (q) => q.eq("storageId", storageId))
          .first();
        if (!upload || upload.userId !== userId) return null;
      }
    }

    const hash = requestHash({
      modelSlug: model.slug,
      inputMode: args.inputMode,
      params: sanitized.params,
      inputShas: await inputShasOf(ctx, inputs.inputs),
    });

    const candidates = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_requestHash", (q) => q.eq("userId", userId).eq("requestHash", hash))
      .order("desc")
      .take(MAX_CANDIDATES);
    const hit = candidates.find((job) =>
      isReusableJob(
        {
          userId: job.userId,
          status: job.status,
          provider: job.provider ?? "fal",
          ...(job.outputStorageId ? { outputStorageId: job.outputStorageId } : {}),
          ...(job.expiresAt !== undefined ? { expiresAt: job.expiresAt } : {}),
          isMock: isMockRequestId(job.falRequestId),
        },
        userId,
        args.now,
      ),
    );

    return hit ? { jobId: hit._id, creditCost: hit.creditCost } : null;
  },
});
