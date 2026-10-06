import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  canSwapWith,
  cleanElementDescription,
  cleanElementName,
  ELEMENT_IMAGES_MAX,
  ELEMENTS_MAX,
  handleBase,
  isCharacterSheetPrompt,
  isValidPhotoCheck,
  photoCheckAllowsLik,
  SWAP_MODEL_SLUGS,
  swapPrompt,
  swapRefCount,
  uniqueHandle,
  type ElementKind,
} from "./creaElementsCore";
import { requireUserId } from "./helpers";
import { IMAGE_ACCEPT } from "./providers/modelControls";
import { createJobForUser, requireStudioAccess, storageIdsUsedByOtherJobs } from "./studio";
import { extractPrompt, isMockRequestId, outputExpiresAt } from "./studioCore";
import { parseInputSpec } from "./studioJobCore";

/**
 * Likovi i elementi (Crea K14, S34; plan K01 §7.1). Lik, mesto ili predmet se
 * sačuva jednom - ime, 1-8 slika, opis - i poziva se kao `@pominjanje` u opisu.
 * Composer tada šalje slike elementa kao reference kroz POSTOJEĆI `studio.createJob`
 * (`creaElementsCore.elementInputs`): slike su `studioUploads` redovi ovog
 * korisnika, pa ih `createJob` prima, a tuđe odbija (`TUDJI_FAJL`).
 *
 * Slike elementa su „pinovane" (`studioUploads.pinnedAt`): bez roka, i ni
 * brisanje rada, ni rok izlaza, ni noćni cron ih ne diraju - samo brisanje
 * elementa. Lice je lični podatak: element vidi samo vlasnik; Lik se čuva samo uz
 * pristanak (O5) i proveru fotke (S35), i samo takav Lik ide u „Zameni lik" (S24).
 */

const kindValidator = v.union(v.literal("lik"), v.literal("mesto"), v.literal("predmet"));
const photoCheckValidator = v.object({ faces: v.number(), faceRatio: v.number(), sharpness: v.number(), ok: v.boolean() });

async function myElements(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("creaElements")
    .withIndex("by_user_updated", (q) => q.eq("userId", userId))
    .order("desc")
    .take(ELEMENTS_MAX + 1);
}

/** Moji likovi, mesta i predmeti (najnoviji prvo), sa potpisanim slikama. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await myElements(ctx, userId);
    return Promise.all(
      rows.slice(0, ELEMENTS_MAX).map(async (row) => ({
        _id: row._id,
        kind: row.kind,
        name: row.name,
        handle: row.handle,
        description: row.description ?? null,
        origin: row.origin,
        consentAt: row.consentAt ?? null,
        photoCheck: row.photoCheck ?? null,
        canSwap: canSwapWith(row),
        updatedAt: row.updatedAt,
        images: await Promise.all(
          row.imageStorageIds.map(async (storageId) => {
            const meta = await ctx.db.system.get("_storage", storageId);
            return {
              storageId: storageId as string,
              url: meta ? await ctx.storage.getUrl(storageId) : null,
              mime: meta?.contentType ?? "image/jpeg",
              size: meta?.size ?? 0,
            };
          }),
        ),
      })),
    );
  },
});

/**
 * Slika sme u element ako je SVOJ prijavljen upload slike (ne alias nad izlazom
 * rada, K05) i ne drži je drugi element. Vraća red uploada.
 */
async function claimableUpload(
  ctx: MutationCtx,
  userId: Id<"users">,
  storageId: Id<"_storage">,
  current: ReadonlySet<string>,
): Promise<Doc<"studioUploads">> {
  const upload = await ctx.db
    .query("studioUploads")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (!upload || upload.userId !== userId) throw new Error("TUDJI_FAJL");
  if (upload.sourceJobId) throw new Error("NEISPRAVNA_SLIKA_ELEMENTA");
  if (!upload.mimeType || !IMAGE_ACCEPT.includes(upload.mimeType)) throw new Error("NEISPRAVNA_SLIKA_ELEMENTA");
  if (upload.pinnedAt !== undefined && !current.has(storageId)) throw new Error("SLIKA_ZAUZETA");
  return upload;
}

/**
 * Slike koje element više ne drži: fajl koji je ušao u neki rad ostaje uz taj
 * rad (rok kao izlaz napravljen sada - `crons.expireGenerationFiles` ga posle
 * briše), a ostale se brišu odmah - i fajl i red.
 */
export async function releaseImages(ctx: MutationCtx, userId: Id<"users">, storageIds: readonly Id<"_storage">[]) {
  if (storageIds.length === 0) return;
  const usedByJobs = await storageIdsUsedByOtherJobs(ctx, userId);
  const now = Date.now();
  for (const storageId of storageIds) {
    const upload = await ctx.db
      .query("studioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    const own = upload !== null && upload.userId === userId;
    if (usedByJobs.has(storageId)) {
      if (own) await ctx.db.patch("studioUploads", upload._id, { pinnedAt: undefined, expiresAt: outputExpiresAt("image", now) });
      continue;
    }
    if (await ctx.db.system.get("_storage", storageId)) await ctx.storage.delete(storageId);
    if (own) await ctx.db.delete("studioUploads", upload._id);
  }
}

/** Ime → jedinstveno pominjanje među elementima ovog korisnika (osim samog elementa). */
function handleFor(name: string, kind: ElementKind, others: readonly Doc<"creaElements">[]) {
  return uniqueHandle(handleBase(name, kind), new Set(others.map((row) => row.handle)));
}

/**
 * Novi element ili izmena postojećeg (`elementId`). Lik traži pristanak pri
 * svakom čuvanju (O5); Lik od fotki traži i prošlu proveru fotke kad se slike ili
 * vrsta menjaju (S35). List iz kreatora (`origin: "kreator"`) menja samo ime i opis.
 */
export const saveElement = mutation({
  args: {
    elementId: v.optional(v.id("creaElements")),
    kind: kindValidator,
    name: v.string(),
    description: v.optional(v.string()),
    imageStorageIds: v.array(v.id("_storage")),
    consent: v.optional(v.boolean()),
    photoCheck: v.optional(photoCheckValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStudioAccess(ctx);
    const name = cleanElementName(args.name);
    if (!name) throw new Error("NEISPRAVNO_IME_ELEMENTA");
    const description = cleanElementDescription(args.description);
    if (description === null) throw new Error("PREDUG_OPIS_ELEMENTA");

    const images = args.imageStorageIds;
    if (images.length === 0 || images.length > ELEMENT_IMAGES_MAX) throw new Error("BROJ_SLIKA_ELEMENTA");
    if (new Set(images).size !== images.length) throw new Error("BROJ_SLIKA_ELEMENTA");

    const existing = args.elementId ? await ctx.db.get("creaElements", args.elementId) : null;
    if (args.elementId && (!existing || existing.userId !== userId)) throw new Error("ELEMENT_NIJE_PRONADJEN");

    const all = await myElements(ctx, userId);
    if (!existing && all.length >= ELEMENTS_MAX) throw new Error("PREVISE_LIKOVA");

    const before = new Set<string>(existing?.imageStorageIds ?? []);
    const imagesChanged = !existing || images.length !== before.size || images.some((id) => !before.has(id));
    const origin = existing?.origin ?? "foto";
    if (origin === "kreator" && (imagesChanged || args.kind !== "lik")) throw new Error("SLIKE_ZAKLJUCANE");

    if (args.kind === "lik" && args.consent !== true) throw new Error("PRISTANAK_OBAVEZAN");
    if (args.photoCheck && !isValidPhotoCheck(args.photoCheck)) throw new Error("PROVERA_FOTKE");
    const needsCheck = args.kind === "lik" && origin === "foto" && (imagesChanged || existing?.kind !== "lik");
    if (needsCheck && !photoCheckAllowsLik(args.photoCheck)) throw new Error("PROVERA_FOTKE");

    const uploads = [];
    for (const storageId of images) uploads.push(await claimableUpload(ctx, userId, storageId, before));

    const now = Date.now();
    const others = all.filter((row) => row._id !== existing?._id);
    const handle = existing && existing.name === name ? existing.handle : handleFor(name, args.kind, others);
    const fields = {
      kind: args.kind,
      name,
      handle,
      description: description || undefined,
      imageStorageIds: images,
      coverStorageId: images[0],
      consentAt: args.kind === "lik" ? now : undefined,
      photoCheck: args.kind === "lik" ? (args.photoCheck ?? existing?.photoCheck) : undefined,
      updatedAt: now,
    };

    let elementId: Id<"creaElements">;
    if (existing) {
      await ctx.db.patch("creaElements", existing._id, fields);
      elementId = existing._id;
    } else {
      elementId = await ctx.db.insert("creaElements", { userId, origin, createdAt: now, ...fields });
    }

    for (const upload of uploads) {
      if (!before.has(upload.storageId)) await ctx.db.patch("studioUploads", upload._id, { pinnedAt: now, expiresAt: undefined });
    }
    await releaseImages(
      ctx,
      userId,
      (existing?.imageStorageIds ?? []).filter((id) => !images.includes(id)),
    );

    return { elementId, handle };
  },
});

/** Briše element i njegove slike (slika koju koristi neki rad ostaje uz taj rad, sa rokom). */
export const deleteElement = mutation({
  args: { elementId: v.id("creaElements") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("creaElements", args.elementId);
    if (!row || row.userId !== userId) return false;
    await ctx.db.delete("creaElements", row._id);
    await releaseImages(ctx, userId, row.imageStorageIds);
    return true;
  },
});

/**
 * Zameni lik (S24, O5): samo SVOJ Lik sa pristankom, i pristanak se potvrđuje
 * pri svakoj zameni (`consent: true`). Opis sastavlja server - klijent ne može
 * da podmetne drugi; slike Lika dodaje server, pa tuđe lice ne može da uđe ovim
 * putem. Fotka koja se menja je prva slika i mora biti upload ovog korisnika
 * (proverava `createJob`). Ostalo - cena, limiti, DEMO, stablo - je `createJob`.
 */
export const startFaceSwap = mutation({
  args: {
    elementId: v.id("creaElements"),
    targetStorageId: v.id("_storage"),
    modelSlug: v.string(),
    params: v.string(),
    consent: v.literal(true),
    projectId: v.optional(v.id("studioProjects")),
    parentJobId: v.optional(v.id("generationJobs")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const element = await ctx.db.get("creaElements", args.elementId);
    if (!element || element.userId !== userId || !canSwapWith(element)) throw new Error("LIK_NIJE_DOSTUPAN");
    if (!(SWAP_MODEL_SLUGS as readonly string[]).includes(args.modelSlug)) throw new Error("MODEL_NE_MENJA_LIK");

    const model = await ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", args.modelSlug))
      .unique();
    const slotMax = model ? (parseInputSpec(model.inputSpec).image_multi?.image?.max ?? 0) : 0;
    const refCount = swapRefCount(element.imageStorageIds.length, slotMax);
    if (refCount === 0) throw new Error("MODEL_NE_MENJA_LIK");

    let params: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(args.params);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      params = parsed as Record<string, unknown>;
    } catch {
      throw new Error("NEISPRAVNI_PARAMETRI");
    }
    params.prompt = swapPrompt(element, refCount);

    return createJobForUser(ctx, userId, {
      // Album (K26): „Zameni lik" je alat Cree.
      creaTool: "slika.zameni-lik",
      modelSlug: args.modelSlug,
      params: JSON.stringify(params),
      inputMode: "image_multi",
      inputs: JSON.stringify({
        image: [args.targetStorageId, ...element.imageStorageIds.slice(0, refCount)],
      }),
      ...(args.projectId ? { projectId: args.projectId } : {}),
      ...(args.parentJobId ? { parentJobId: args.parentJobId, derivation: "izmena" as const } : {}),
    });
  },
});

// ── „Sačuvaj kao Lik" iz kreatora (S36) ──────────────────────────────────────

/**
 * Gotov list iz kreatora ovog korisnika: pravi izlaz (ne DEMO SVG), slika, i opis
 * počinje oznakom kreatora - samo takav rad postaje izmišljen Lik bez provere fotke.
 */
export const creatorSheetSource = internalQuery({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const { userId } = await requireStudioAccess(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId || job.kind !== "image" || job.status !== "done" || !job.outputStorageId) {
      throw new Error("IZVOR_NIJE_DOSTUPAN");
    }
    let prompt = "";
    try {
      prompt = extractPrompt(JSON.parse(job.params) as Record<string, unknown>);
    } catch {
      prompt = "";
    }
    if (!isCharacterSheetPrompt(prompt)) throw new Error("NIJE_LIST_LIKA");
    if (isMockRequestId(job.falRequestId)) throw new Error("DEMO_LIST_LIKA");
    const meta = await ctx.db.system.get("_storage", job.outputStorageId);
    if (!meta?.contentType || !IMAGE_ACCEPT.includes(meta.contentType)) throw new Error("DEMO_LIST_LIKA");
    return { storageId: job.outputStorageId, mimeType: meta.contentType, bytes: meta.size };
  },
});

/** Kopija lista je već u storage-u; ovde postaje pinovan upload i Lik (`origin: "kreator"`). */
export const insertCreatorElement = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    bytes: v.number(),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStudioAccess(ctx);
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.userId !== userId) throw new Error("IZVOR_NIJE_DOSTUPAN");
    const name = cleanElementName(args.name);
    if (!name) throw new Error("NEISPRAVNO_IME_ELEMENTA");
    const description = cleanElementDescription(args.description);
    if (description === null) throw new Error("PREDUG_OPIS_ELEMENTA");
    const all = await myElements(ctx, userId);
    if (all.length >= ELEMENTS_MAX) throw new Error("PREVISE_LIKOVA");

    const now = Date.now();
    await ctx.db.insert("studioUploads", {
      userId,
      storageId: args.storageId,
      slot: "image",
      bytes: args.bytes,
      mimeType: args.mimeType,
      pinnedAt: now,
      createdAt: now,
    });
    const handle = handleFor(name, "lik", all);
    const elementId = await ctx.db.insert("creaElements", {
      userId,
      kind: "lik",
      name,
      handle,
      ...(description ? { description } : {}),
      imageStorageIds: [args.storageId],
      coverStorageId: args.storageId,
      origin: "kreator",
      consentAt: now,
      sourceJobId: job._id,
      createdAt: now,
      updatedAt: now,
    });
    return { elementId, handle };
  },
});

/**
 * „Sačuvaj kao Lik" (S36): list iz kreatora se KOPIRA u nov fajl - izlaz rada
 * ističe i briše se sa radom, a Lik mora da ostane. Pristanak je potvrda da lik
 * nije napravljen da liči na stvarnu osobu (O5).
 */
export const saveFromJob = action({
  args: {
    jobId: v.id("generationJobs"),
    name: v.string(),
    description: v.optional(v.string()),
    consent: v.literal(true),
  },
  handler: async (ctx, args): Promise<{ elementId: Id<"creaElements">; handle: string }> => {
    const source: { storageId: Id<"_storage">; mimeType: string; bytes: number } = await ctx.runQuery(
      internal.creaElements.creatorSheetSource,
      { jobId: args.jobId },
    );
    const blob = await ctx.storage.get(source.storageId);
    if (!blob) throw new Error("IZVOR_NIJE_DOSTUPAN");
    const copyId = await ctx.storage.store(blob);
    try {
      return await ctx.runMutation(internal.creaElements.insertCreatorElement, {
        jobId: args.jobId,
        storageId: copyId,
        mimeType: source.mimeType,
        bytes: source.bytes,
        name: args.name,
        ...(args.description !== undefined ? { description: args.description } : {}),
      });
    } catch (error) {
      await ctx.storage.delete(copyId);
      throw error;
    }
  },
});
