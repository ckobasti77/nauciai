import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  parseStoredShots,
  parseStoryboardSettings,
  sanitizeShots,
  STORYBOARD_JOB_KINDS,
  STORYBOARD_LIMITS,
  storyboardJobIds,
  type StoryShot,
} from "./creaStoryboardsCore";
import { requireUserId } from "./helpers";
import { requireStudioAccess } from "./studio";
import { isMockRequestId } from "./studioCore";

/**
 * Strip → film (Crea K21, V10; plan K17 §4.2). Strip pravi `creaLlm.planStoryboard`
 * (`insertPlan`); ovde su izmena kadrova, vezivanje poslova za kadrove i čitanje
 * stanja, da tok od više minuta preživi zatvaranje strane. Poslovi idu kroz
 * postojeći `studio.createJob` (cena, limiti, DEMO) - ovde se samo pamti koji
 * posao pripada kom kadru, i to samo SOPSTVENI posao prave vrste.
 */

const jobKind = v.union(v.literal("image"), v.literal("video"));

/** Likovi za strip: samo SVOJI elementi (handle, ime, opis). */
export const charactersFor = internalQuery({
  args: { userId: v.id("users"), elementIds: v.array(v.id("creaElements")) },
  handler: async (ctx, args) => {
    const out: Array<{ id: Id<"creaElements">; handle: string; name: string; description: string | null }> = [];
    for (const elementId of args.elementIds.slice(0, STORYBOARD_LIMITS.elementsMax)) {
      const element = await ctx.db.get("creaElements", elementId);
      if (!element || element.userId !== args.userId) continue;
      out.push({ id: element._id, handle: element.handle, name: element.name, description: element.description ?? null });
    }
    return out;
  },
});

/** Handle-ovi Likova stripa (iz podešavanja) - samo oni smeju u kadrove. */
async function handlesOf(ctx: QueryCtx | MutationCtx, row: Doc<"creaStoryboards">): Promise<string[]> {
  const settings = parseStoryboardSettings(row.settings);
  const handles: string[] = [];
  for (const raw of settings.elementIds) {
    const elementId = ctx.db.normalizeId("creaElements", raw);
    const element = elementId ? await ctx.db.get("creaElements", elementId) : null;
    if (element && element.userId === row.userId) handles.push(element.handle);
  }
  return handles;
}

/** Nov strip iz odgovora LLM-a. Najviše 30 po korisniku: najstariji odlazi (radovi u galeriji ostaju). */
export const insertPlan = internalMutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    story: v.string(),
    settings: v.string(),
    shots: v.string(),
    projectId: v.optional(v.id("studioProjects")),
  },
  handler: async (ctx, args) => {
    const mine = await ctx.db
      .query("creaStoryboards")
      .withIndex("by_user_updated", (q) => q.eq("userId", args.userId))
      .order("asc")
      .take(STORYBOARD_LIMITS.perUser + 1);
    for (const old of mine.slice(0, Math.max(0, mine.length - STORYBOARD_LIMITS.perUser + 1))) await ctx.db.delete("creaStoryboards", old._id);
    const project = args.projectId ? await ctx.db.get("studioProjects", args.projectId) : null;
    const now = Date.now();
    return ctx.db.insert("creaStoryboards", {
      userId: args.userId,
      title: args.title.slice(0, STORYBOARD_LIMITS.titleChars),
      story: args.story.slice(0, STORYBOARD_LIMITS.storyChars),
      settings: args.settings.slice(0, 2000),
      shots: args.shots.slice(0, STORYBOARD_LIMITS.shotsJsonChars),
      ...(project && project.userId === args.userId && project.archivedAt === undefined ? { projectId: project._id } : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Posao sme u kadar: moj i prave vrste (slika za crtež kadra, video za oživljen kadar). */
async function ownJobOfKind(ctx: QueryCtx | MutationCtx, userId: Id<"users">, rawId: string, kind: "image" | "video") {
  const jobId = ctx.db.normalizeId("generationJobs", rawId);
  const job = jobId ? await ctx.db.get("generationJobs", jobId) : null;
  return job && job.userId === userId && job.kind === kind ? job : null;
}

/** Kadrovi sa klijenta: sređeni, a posao koji nije moj (ili je pogrešne vrste) se skida sa kadra. */
async function verifiedShots(ctx: MutationCtx, row: Doc<"creaStoryboards">, raw: unknown): Promise<StoryShot[]> {
  const shots = sanitizeShots(raw, await handlesOf(ctx, row));
  for (const shot of shots) {
    for (const kind of STORYBOARD_JOB_KINDS) {
      const key = kind === "image" ? "imageJobId" : "videoJobId";
      const id = shot[key];
      if (id && !(await ownJobOfKind(ctx, row.userId, id, kind))) delete shot[key];
    }
  }
  return shots;
}

async function ownStoryboard(ctx: QueryCtx | MutationCtx, userId: Id<"users">, id: Id<"creaStoryboards">) {
  const row = await ctx.db.get("creaStoryboards", id);
  return row && row.userId === userId ? row : null;
}

/** Izmena kadrova (tekst, redosled, brisanje, dodavanje) i naslova. 3-8 kadrova. */
export const updateShots = mutation({
  args: { storyboardId: v.id("creaStoryboards"), shots: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; reason: "NIJE_DOSTUPAN" | "NEISPRAVNO" }> => {
    const { userId } = await requireStudioAccess(ctx);
    const row = await ownStoryboard(ctx, userId, args.storyboardId);
    if (!row) return { ok: false, reason: "NIJE_DOSTUPAN" };
    if (args.shots.length > STORYBOARD_LIMITS.shotsJsonChars) return { ok: false, reason: "NEISPRAVNO" };
    let raw: unknown;
    try {
      raw = JSON.parse(args.shots);
    } catch {
      return { ok: false, reason: "NEISPRAVNO" };
    }
    if (!Array.isArray(raw) || raw.length > STORYBOARD_LIMITS.shotsMax) return { ok: false, reason: "NEISPRAVNO" };
    const shots = await verifiedShots(ctx, row, raw);
    if (shots.length < STORYBOARD_LIMITS.shotsMin) return { ok: false, reason: "NEISPRAVNO" };
    const title = args.title?.replace(/\s+/g, " ").trim().slice(0, STORYBOARD_LIMITS.titleChars);
    await ctx.db.patch("creaStoryboards", row._id, { shots: JSON.stringify(shots), ...(title ? { title } : {}), updatedAt: Date.now() });
    return { ok: true };
  },
});

/** Posao (slika ili video) postaje deo kadra. Tuđ posao ili pogrešna vrsta se odbija. */
export const attachJob = mutation({
  args: { storyboardId: v.id("creaStoryboards"), shotIndex: v.number(), kind: jobKind, jobId: v.id("generationJobs") },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; reason: "NIJE_DOSTUPAN" | "NEMA_KADRA" | "POGRESAN_RAD" }> => {
    const { userId } = await requireStudioAccess(ctx);
    const row = await ownStoryboard(ctx, userId, args.storyboardId);
    if (!row) return { ok: false, reason: "NIJE_DOSTUPAN" };
    const shots = parseStoredShots(row.shots, await handlesOf(ctx, row));
    const shot = Number.isInteger(args.shotIndex) ? shots[args.shotIndex] : undefined;
    if (!shot) return { ok: false, reason: "NEMA_KADRA" };
    if (!(await ownJobOfKind(ctx, userId, args.jobId, args.kind))) return { ok: false, reason: "POGRESAN_RAD" };
    if (args.kind === "image") {
      shot.imageJobId = args.jobId;
      // Nov crtež kadra znači da stari video više ne odgovara slici.
      delete shot.videoJobId;
    } else {
      shot.videoJobId = args.jobId;
    }
    await ctx.db.patch("creaStoryboards", row._id, { shots: JSON.stringify(shots), updatedAt: Date.now() });
    return { ok: true };
  },
});

/** Montaža napravljena od stripa (posle „Spoji u montažu"). */
export const setMontage = mutation({
  args: { storyboardId: v.id("creaStoryboards"), montageId: v.id("creaMontages") },
  handler: async (ctx, args) => {
    const { userId } = await requireStudioAccess(ctx);
    const row = await ownStoryboard(ctx, userId, args.storyboardId);
    const montage = await ctx.db.get("creaMontages", args.montageId);
    if (!row || !montage || montage.userId !== userId) return { ok: false as const };
    await ctx.db.patch("creaStoryboards", row._id, { montageId: args.montageId, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

export type StoryboardJobView = {
  kind: Doc<"generationJobs">["kind"];
  status: Doc<"generationJobs">["status"];
  isMock: boolean;
  outputUrl: string | null;
  storageId: Id<"_storage"> | null;
};

/** Strip sa kadrovima i stanjem njihovih poslova (najviše 16 poslova); tuđ = `null`. */
export const get = query({
  args: { storyboardId: v.id("creaStoryboards") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ownStoryboard(ctx, userId, args.storyboardId);
    if (!row) return null;
    const shots = parseStoredShots(row.shots, await handlesOf(ctx, row));
    const jobs: Record<string, StoryboardJobView> = {};
    for (const jobId of storyboardJobIds(shots).slice(0, STORYBOARD_LIMITS.shotsMax * 2)) {
      const id = ctx.db.normalizeId("generationJobs", jobId);
      const job = id ? await ctx.db.get("generationJobs", id) : null;
      if (!job || job.userId !== userId) continue;
      jobs[jobId] = {
        kind: job.kind,
        status: job.status,
        isMock: isMockRequestId(job.falRequestId),
        outputUrl: job.outputStorageId ? await ctx.storage.getUrl(job.outputStorageId) : null,
        storageId: job.outputStorageId ?? null,
      };
    }
    return {
      _id: row._id,
      title: row.title,
      story: row.story,
      settings: parseStoryboardSettings(row.settings),
      shots,
      jobs,
      ...(row.montageId ? { montageId: row.montageId } : {}),
      ...(row.projectId ? { projectId: row.projectId } : {}),
      updatedAt: row.updatedAt,
    };
  },
});

/** Moji stripovi (najviše 30), bez kadrova. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("creaStoryboards")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(STORYBOARD_LIMITS.perUser);
    return rows.map((row) => ({ _id: row._id, title: row.title, updatedAt: row.updatedAt, shotCount: parseStoredShots(row.shots, []).length }));
  },
});

/** Briše SAMO strip - slike i videi ostaju u galeriji. */
export const remove = mutation({
  args: { storyboardId: v.id("creaStoryboards") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ownStoryboard(ctx, userId, args.storyboardId);
    if (!row) return { ok: false as const };
    await ctx.db.delete("creaStoryboards", row._id);
    return { ok: true as const };
  },
});
