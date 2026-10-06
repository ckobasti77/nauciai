import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { canSwapWith } from "./creaElementsCore";
import {
  FACE_JOB_MODELS,
  FACE_TRACE_DEPTH,
  faceInputIds,
  jobMayCarryFace,
  VIDEO_SWAP_REFS,
  videoSwapPrompt,
  type FaceJobKind,
} from "./creaFaceJobsCore";
import { adoptJobOutput } from "./creaVersions";
import { requireUserId } from "./helpers";
import { createJobForUser } from "./studio";
import { parseJobInputs } from "./providers/jobInputs";

/**
 * Lice u video alatima Cree (K20; plan K17-15, O5): Lik koji govori (V21/V23),
 * lipsync (V22), Odglumi (V20) i zamena lika u videu (V14). Lice bira SERVER -
 * klijent šalje samo „koji Lik" ili „koji rad", nikad fajl lica:
 *
 * - Lik: samo sopstveni, sa pristankom (`canSwapWith`); ide prva slika Lika.
 * - Rad: sopstveni, gotov, pravi (ne DEMO), a svaki ulaz koji nosi lice je slika
 *   tvog Lika sa pristankom ili izlaz drugog takvog rada (`isFaceSafeJob`).
 *   Rad samo iz opisa nema ulaza, pa prolazi.
 *
 * Pristanak (`consent: true`) se traži pri svakom poslu. Sve ostalo - cena,
 * limiti, DEMO bez ključa (O3), stablo verzija - je postojeći `createJob`.
 */

const faceSource = v.union(v.object({ elementId: v.id("creaElements") }), v.object({ jobId: v.id("generationJobs") }));

/** Slike svih Likova ovog korisnika koji imaju pristanak. */
async function consentedLikImages(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<Set<string>> {
  const rows = await ctx.db
    .query("creaElements")
    .withIndex("by_user_updated", (q) => q.eq("userId", userId))
    .take(100);
  const images = new Set<string>();
  for (const row of rows) if (canSwapWith(row)) for (const id of row.imageStorageIds) images.add(id);
  return images;
}

/**
 * Da li rad sme da nosi lice: pravila reda (`jobMayCarryFace`) i poreklo svakog
 * ulaza koji nosi lice - slika Lika sa pristankom, ili izlaz drugog takvog rada
 * (alias red sa `sourceJobId`), najviše `FACE_TRACE_DEPTH` koraka unazad.
 */
async function isFaceSafeJob(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  job: Doc<"generationJobs">,
  kinds: readonly string[],
  likImages: ReadonlySet<string>,
  depth = FACE_TRACE_DEPTH,
): Promise<boolean> {
  if (depth <= 0 || !jobMayCarryFace(job, userId, kinds)) return false;
  if (job.provider === "local") {
    // Lokalni alat ne pamti ulaze - nasleđuje poreklo roditelja (bilo koje vrste).
    const parent = job.parentJobId ? await ctx.db.get("generationJobs", job.parentJobId) : null;
    return parent !== null && isFaceSafeJob(ctx, userId, parent, ["image", "video"], likImages, depth - 1);
  }
  for (const id of faceInputIds(parseJobInputs(job.inputs))) {
    if (likImages.has(id)) continue;
    const storageId = ctx.db.system.normalizeId("_storage", id);
    const upload = storageId
      ? await ctx.db
          .query("studioUploads")
          .withIndex("by_storage", (q) => q.eq("storageId", storageId))
          .first()
      : null;
    if (!upload || upload.userId !== userId || !upload.sourceJobId) return false;
    const source = await ctx.db.get("generationJobs", upload.sourceJobId);
    if (!source || !(await isFaceSafeJob(ctx, userId, source, ["image", "video"], likImages, depth - 1))) return false;
  }
  return true;
}

type ResolvedFace = {
  storageIds: Id<"_storage">[];
  parentJobId?: Id<"generationJobs">;
};

/** Lice za posao: slika Lika (pristanak) ili izlaz bezbednog rada (alias, bez kopije). */
async function resolveFace(
  ctx: MutationCtx,
  userId: Id<"users">,
  face: { elementId: Id<"creaElements"> } | { jobId: Id<"generationJobs"> },
  kind: "image" | "video",
): Promise<ResolvedFace> {
  if ("elementId" in face) {
    if (kind !== "image") throw new Error("LICE_NIJE_DOZVOLJENO");
    const element = await ctx.db.get("creaElements", face.elementId);
    if (!element || element.userId !== userId || !canSwapWith(element) || element.imageStorageIds.length === 0) {
      throw new Error("LIK_NIJE_DOSTUPAN");
    }
    return { storageIds: [element.imageStorageIds[0]!] };
  }
  const job = await ctx.db.get("generationJobs", face.jobId);
  if (!job || !(await isFaceSafeJob(ctx, userId, job, [kind], await consentedLikImages(ctx, userId)))) {
    throw new Error("LICE_NIJE_DOZVOLJENO");
  }
  const adopted = await adoptJobOutput(ctx, userId, job, job.outputStorageId!);
  return { storageIds: [adopted.storageId], parentJobId: job._id };
}

/** Alat Cree po vrsti posla sa licem (sličica u albumu, K26). */
const FACE_JOB_TOOL: Record<FaceJobKind, string> = {
  avatar: "video.lik-govori",
  pokret: "video.odglumi",
  usne: "video.lik-govori",
  zamena: "video.zameni",
};

async function startFaceJob(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: FaceJobKind,
  inputs: Record<string, Id<"_storage">[]>,
  params: Record<string, unknown>,
  extra: { projectId?: Id<"studioProjects">; parentJobId?: Id<"generationJobs">; derivation: "animacija" | "izmena" },
) {
  const model = FACE_JOB_MODELS[kind];
  return createJobForUser(ctx, userId, {
    // Album (K26): alat Cree iz kojeg posao dolazi.
    creaTool: FACE_JOB_TOOL[kind],
    modelSlug: model.slug,
    params: JSON.stringify(params),
    inputMode: model.inputMode,
    inputs: JSON.stringify(inputs),
    ...(extra.projectId ? { projectId: extra.projectId } : {}),
    ...(extra.parentJobId ? { parentJobId: extra.parentJobId, derivation: extra.derivation } : {}),
  });
}

/**
 * Lik koji govori (V21, V23): slika (Lik ili bezbedan rad, npr. scena iz Nano
 * Banane sa tvojim Likom) + tvoj glas (`audioStorageId`, izmeren upload ili izlaz
 * govora) → Kling avatar. Trajanje (= cena) meri server iz zvuka.
 */
export const startTalking = mutation({
  args: {
    face: faceSource,
    audioStorageId: v.id("_storage"),
    quality: v.union(v.literal("720p"), v.literal("1080p")),
    consent: v.literal(true),
    projectId: v.optional(v.id("studioProjects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const face = await resolveFace(ctx, userId, args.face, "image");
    return startFaceJob(
      ctx,
      userId,
      "avatar",
      { image: face.storageIds, audio: [args.audioStorageId] },
      { quality: args.quality },
      { projectId: args.projectId, parentJobId: face.parentJobId, derivation: "animacija" },
    );
  },
});

/**
 * Lipsync (V22): TVOJ video koji je napravila Crea (bezbedan rad vrste video) +
 * glas → Kling lipsync. Tuđ snimak se ovim putem ne „ozvučava" tuđim rečima.
 */
export const startLipsync = mutation({
  args: {
    videoJobId: v.id("generationJobs"),
    audioStorageId: v.id("_storage"),
    consent: v.literal(true),
    projectId: v.optional(v.id("studioProjects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const face = await resolveFace(ctx, userId, { jobId: args.videoJobId }, "video");
    return startFaceJob(
      ctx,
      userId,
      "usne",
      { video: face.storageIds, audio: [args.audioStorageId] },
      { source: "audio" },
      { projectId: args.projectId, parentJobId: face.parentJobId, derivation: "izmena" },
    );
  },
});

/**
 * Odglumi (V20): tvoj snimak pokreta (`videoStorageId`; kamera = uvek ti, čekboks
 * na klijentu) + lice (Lik ili bezbedan rad) → Kling prenos pokreta.
 */
export const startMotion = mutation({
  args: {
    face: faceSource,
    videoStorageId: v.id("_storage"),
    resolution: v.union(v.literal("720p"), v.literal("1080p")),
    consent: v.literal(true),
    projectId: v.optional(v.id("studioProjects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const face = await resolveFace(ctx, userId, args.face, "image");
    return startFaceJob(
      ctx,
      userId,
      "pokret",
      { video: [args.videoStorageId], image: face.storageIds },
      { resolution: args.resolution },
      { projectId: args.projectId, parentJobId: face.parentJobId, derivation: "animacija" },
    );
  },
});

/**
 * Zameni lik u videu (V14): glavna osoba u tvom videu postaje tvoj Lik (samo
 * Lik sa pristankom). Opis i slike Lika dodaje server (kao „Zameni lik" na slici).
 */
export const startVideoSwap = mutation({
  args: {
    elementId: v.id("creaElements"),
    videoStorageId: v.id("_storage"),
    resolution: v.union(v.literal("720p"), v.literal("1080p")),
    consent: v.literal(true),
    projectId: v.optional(v.id("studioProjects")),
    parentJobId: v.optional(v.id("generationJobs")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const element = await ctx.db.get("creaElements", args.elementId);
    if (!element || element.userId !== userId || !canSwapWith(element) || element.imageStorageIds.length === 0) {
      throw new Error("LIK_NIJE_DOSTUPAN");
    }
    const refs = element.imageStorageIds.slice(0, VIDEO_SWAP_REFS);
    return startFaceJob(
      ctx,
      userId,
      "zamena",
      { video: [args.videoStorageId], image: refs },
      { prompt: videoSwapPrompt(element, refs.length), resolution: args.resolution },
      { projectId: args.projectId, parentJobId: args.parentJobId, derivation: "izmena" },
    );
  },
});

/** Koliko poslednjih gotovih radova se gleda za spisak lica. */
const FACE_SOURCE_SCAN = 80;
const FACE_SOURCE_MAX = 24;

/**
 * Lica koja alat sme da ponudi: Likovi sa pristankom (samo za sliku) i
 * bezbedni radovi tražene vrste (najnoviji prvo), sa potpisanim adresama.
 */
export const listFaceSources = query({
  args: { kind: v.union(v.literal("image"), v.literal("video")) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const likImages = await consentedLikImages(ctx, userId);
    const elements =
      args.kind === "image"
        ? (
            await ctx.db
              .query("creaElements")
              .withIndex("by_user_updated", (q) => q.eq("userId", userId))
              .order("desc")
              .take(100)
          ).filter((row) => canSwapWith(row) && row.imageStorageIds.length > 0)
        : [];
    const liks = await Promise.all(
      elements.map(async (row) => ({
        _id: row._id,
        name: row.name,
        description: row.description ?? null,
        // Slike Lika su korisnikovi upload-i: scena (Nano Banana 2) ih dobija kao reference.
        imageIds: row.imageStorageIds,
        url: await ctx.storage.getUrl(row.coverStorageId ?? row.imageStorageIds[0]!),
      })),
    );

    const recent = await ctx.db
      .query("generationJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "done"))
      .order("desc")
      .take(FACE_SOURCE_SCAN);
    const jobs: Array<{ _id: Id<"generationJobs">; url: string; posterUrl: string | null; createdAt: number }> = [];
    for (const job of recent) {
      if (jobs.length >= FACE_SOURCE_MAX) break;
      if (!(await isFaceSafeJob(ctx, userId, job, [args.kind], likImages))) continue;
      const url = await ctx.storage.getUrl(job.outputStorageId!);
      if (!url) continue;
      jobs.push({
        _id: job._id,
        url,
        posterUrl: job.posterStorageId ? await ctx.storage.getUrl(job.posterStorageId) : null,
        createdAt: job.createdAt,
      });
    }
    return { liks, jobs };
  },
});
