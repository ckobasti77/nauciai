import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  buildVersionTree,
  derivationFor,
  flattenVersionTree,
  isCreaDerivation,
  lineageFrom,
  VERSION_TREE_MAX_NODES,
  type CreaDerivation,
} from "./creaVersionsCore";
import { requireUserId } from "./helpers";
import { requireStudioAccess } from "./studio";
import { acceptForSlot, slotFileProblem } from "./studioJobCore";

/**
 * Stablo verzija Cree (K05, plan K01 §5): koji rad je nastao iz kojeg, upit za
 * stablo jednog rada i „izlaz kao ulaz" (alias red u `studioUploads`, K01-10).
 *
 * Roditelj uvek pripada istom korisniku - zato je vlasništvo nad celim stablom
 * jedna provera (vlasnik rada), a tuđ rad se ne može ni navesti kao roditelj.
 */

/** Roditelj koji pozivalac navodi: postoji i njegov je. Inače ista greška kao za tuđ izvor. */
export async function ensureOwnedParent(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  parentJobId: Id<"generationJobs">,
): Promise<Doc<"generationJobs">> {
  const parent = await ctx.db.get("generationJobs", parentJobId);
  if (!parent || parent.userId !== userId) throw new Error("IZVOR_NIJE_DOSTUPAN");
  return parent;
}

type Lineage = { parentJobId?: Id<"generationJobs">; rootJobId?: Id<"generationJobs">; derivation?: CreaDerivation };

/**
 * Veze novog plaćenog posla (`createJob`) ka roditelju, redom prednosti:
 * 1. eksplicitan `parentJobId` (npr. „Napravi ponovo" iz detalja: `regeneracija`);
 * 2. `sourceJobId` (Omni nastavak - izabran raniji rad);
 * 3. prvi ulaz koji je alias nad izlazom nekog rada („Koristi kao ulaz", „Animiraj").
 * Treći put je na serveru namerno: ko god pošalje izlaz rada kao ulaz, dete dobija
 * roditelja, bez obzira na to da li je klijent to naveo.
 */
export async function resolveJobLineage(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    parentJobId?: Id<"generationJobs">;
    derivation?: CreaDerivation;
    sourceJobId?: Id<"generationJobs">;
    uploadIds: ReadonlyArray<Id<"studioUploads">>;
    kind: Doc<"generationJobs">["kind"];
  },
): Promise<Lineage> {
  let parent: Doc<"generationJobs"> | null = null;
  if (args.parentJobId) {
    parent = await ensureOwnedParent(ctx, userId, args.parentJobId);
  } else if (args.sourceJobId) {
    parent = await ensureOwnedParent(ctx, userId, args.sourceJobId);
  } else {
    for (const uploadId of args.uploadIds) {
      const upload = await ctx.db.get("studioUploads", uploadId);
      if (!upload?.sourceJobId) continue;
      const source = await ctx.db.get("generationJobs", upload.sourceJobId);
      // Obrisan izvor: dete ostaje bez roditelja (alias red je i tako siroče).
      if (source && source.userId === userId) {
        parent = source;
        break;
      }
    }
  }
  if (!parent) return {};
  const derivation = args.parentJobId && args.derivation ? args.derivation : derivationFor(parent.kind, args.kind);
  return { ...lineageFrom(parent), derivation };
}

/**
 * Stablo jednog rada: koren, svi radovi sa istim korenom (najviše
 * `VERSION_TREE_MAX_NODES`, od najstarijeg), sam rad i njegov roditelj. Tuđ ili
 * nepostojeći rad je `null`, kao u `getJobForDetail`. Potpisuju se samo slike (i
 * poster videa); zvuk dobija ikonu u UI-ju.
 */
export const getVersionTree = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId) return null;

    const rootId = job.rootJobId ?? job._id;
    const docs = new Map<Id<"generationJobs">, Doc<"generationJobs">>();
    const own = (doc: Doc<"generationJobs"> | null) => {
      if (doc && doc.userId === userId) docs.set(doc._id, doc);
    };

    own(rootId === job._id ? job : await ctx.db.get("generationJobs", rootId));
    const members = await ctx.db
      .query("generationJobs")
      .withIndex("by_root_created", (q) => q.eq("rootJobId", rootId))
      .take(VERSION_TREE_MAX_NODES);
    for (const member of members) own(member);
    own(job);
    if (job.parentJobId && !docs.has(job.parentJobId)) own(await ctx.db.get("generationJobs", job.parentJobId));

    const tree = buildVersionTree([...docs.values()], rootId);
    if (!tree) return null;

    const nodes = [];
    for (const row of flattenVersionTree(tree)) {
      const thumbStorageId =
        row.kind === "image" ? row.outputStorageId : row.kind === "video" ? row.posterStorageId : undefined;
      nodes.push({
        _id: row._id,
        parentJobId: row.parentJobId ?? null,
        treeParentId: row.treeParentId as Id<"generationJobs"> | null,
        depth: row.depth,
        derivation: isCreaDerivation(row.derivation) ? row.derivation : null,
        kind: row.kind,
        modelSlug: row.modelSlug,
        status: row.status,
        createdAt: row.createdAt,
        hasOutput: row.outputStorageId !== undefined,
        thumbUrl: thumbStorageId ? await ctx.storage.getUrl(thumbStorageId) : null,
      });
    }

    return {
      rootId: tree.root._id,
      jobId: job._id,
      // Stablo veće od granice: UI kaže da nisu prikazani svi radovi.
      truncated: members.length >= VERSION_TREE_MAX_NODES,
      nodes,
    };
  },
});

/**
 * „Koristi kao ulaz" (K01-10): izlaz gotovog rada postaje ulaz bez kopiranja bloba -
 * alias red u `studioUploads` sa `sourceJobId`. Isti blob ostaje u vlasništvu posla:
 * `deleteJob`, `finalizeOutput` i `crons.expireGenerationFiles` nikad ne brišu blob
 * alias reda niti mu postavljaju rok. Tip i veličina prolaze istu proveru kao upload
 * u taj slot (`slotFileProblem`), jer `createJob` alias ne razlikuje od uploada.
 *
 * Video i zvuk se posle ovoga mere kroz postojeći `studioActions.measureInputUpload`,
 * koji radi nad redom u `studioUploads`.
 */
export const adoptOutputAsInput = mutation({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const { userId } = await requireStudioAccess(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId || job.status !== "done" || !job.outputStorageId) {
      throw new Error("IZVOR_NIJE_DOSTUPAN");
    }
    const adopted = await adoptJobOutput(ctx, userId, job, job.outputStorageId);
    return { ...adopted, url: await ctx.storage.getUrl(adopted.storageId) };
  },
});

/**
 * Telo „izlaz kao ulaz" (deli ga i K20 `creaFaceJobs`): alias red za izlaz
 * gotovog rada OVOG korisnika, uz istu proveru tipa i veličine kao upload.
 */
export async function adoptJobOutput(
  ctx: MutationCtx,
  userId: Id<"users">,
  job: Doc<"generationJobs">,
  storageId: Id<"_storage">,
) {
  const meta = await ctx.db.system.get("_storage", storageId);
  if (!meta) throw new Error("IZVOR_NIJE_DOSTUPAN");

  const slot = job.kind;
  const problem = slotFileProblem({ type: meta.contentType, size: meta.size }, acceptForSlot(slot));
  if (problem) {
    if (problem.code === "NEISPRAVAN_TIP_FAJLA") throw new Error(`${problem.code}:${problem.accept.join(",")}`);
    if (problem.code === "FAJL_PREVELIK") throw new Error(`${problem.code}:${problem.limit}`);
    throw new Error(problem.code);
  }

  const existing = await ctx.db
    .query("studioUploads")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (existing && existing.userId !== userId) throw new Error("TUDJI_FAJL");
  if (!existing) {
    await ctx.db.insert("studioUploads", {
      userId,
      storageId,
      slot,
      bytes: meta.size,
      ...(meta.contentType ? { mimeType: meta.contentType } : {}),
      sourceJobId: job._id,
      createdAt: Date.now(),
    });
  }

  return {
    storageId,
    slot,
    mime: meta.contentType ?? "",
    size: meta.size,
    durationS: existing?.durationS ?? null,
  };
}
