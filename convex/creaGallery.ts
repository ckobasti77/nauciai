import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { REJECT_REASON_MAX } from "../lib/crea-community";
import { validatePrompt } from "./creditsCore";
import {
  galleryEnabled,
  publicAuthor,
  publicWorkView,
  publishJobFor,
  requireCommunityActor,
  requireGallery,
  requireStaff,
} from "./creaCommunityCore";
import { awardCreaXp } from "./creaGameCore";
import { currentUserId, effectiveRoleForProfile } from "./helpers";
import { syncLeaderboardSourceEvent } from "./leaderboardCore";
import { isStudioStaff } from "./studioCore";

/**
 * Javna galerija Cree (K27, G8; O6): objava sopstvenog rada (opt-in), moderacija kroz
 * moderation grid, lajkovi, „Napravi svoju verziju" (remiks sa zaslugom autoru i
 * stablom remiksa) i deljeni stilovi (G11). Sve je iza flega `crea_public_gallery`:
 * dok je isključen, upiti vraćaju prazno, a objava, lajk i deljenje bacaju.
 */

const sortValidator = v.union(v.literal("novo"), v.literal("popularno"));
const kindValidator = v.union(v.literal("image"), v.literal("video"), v.literal("audio"));

async function viewerOf(ctx: QueryCtx): Promise<{ userId: Id<"users"> | null; isStaff: boolean }> {
  const userId = await currentUserId(ctx);
  if (!userId) return { userId: null, isStaff: false };
  const user = await ctx.db.get("users", userId);
  const role = user ? effectiveRoleForProfile(String(user.email ?? "").toLowerCase(), user.role) : null;
  return { userId, isStaff: isStudioStaff(role) };
}

/** Da li je galerija upaljena (dugmad „Objavi", linkovi) i da li gledalac moderira. */
export const galleryState = query({
  args: {},
  handler: async (ctx) => {
    const [enabled, viewer] = await Promise.all([galleryEnabled(ctx), viewerOf(ctx)]);
    return { enabled, isStaff: viewer.isStaff, signedIn: viewer.userId !== null };
  },
});

/** Odobreni radovi, najnoviji ili najomiljeniji. Gost ih vidi; isključen fleg = prazno. */
export const listPublicWorks = query({
  args: { paginationOpts: paginationOptsValidator, sort: sortValidator, kind: v.optional(kindValidator) },
  handler: async (ctx, args) => {
    if (!(await galleryEnabled(ctx))) return { page: [], isDone: true, continueCursor: "" };
    const viewerId = await currentUserId(ctx);
    const base =
      args.sort === "popularno"
        ? ctx.db.query("creaPublicWorks").withIndex("by_status_and_likes", (q) => q.eq("status", "approved"))
        : args.kind
          ? ctx.db
              .query("creaPublicWorks")
              .withIndex("by_status_and_kind_and_publishedAt", (q) => q.eq("status", "approved").eq("kind", args.kind!))
          : ctx.db.query("creaPublicWorks").withIndex("by_status_and_publishedAt", (q) => q.eq("status", "approved"));
    const filtered = args.sort === "popularno" && args.kind ? base.filter((q) => q.eq(q.field("kind"), args.kind!)) : base;
    const result = await filtered.order("desc").paginate(args.paginationOpts);
    const page = (await Promise.all(result.page.map((work) => publicWorkView(ctx, work, viewerId)))).filter(
      (work): work is NonNullable<typeof work> => work !== null,
    );
    return { ...result, page };
  },
});

async function thumbOf(ctx: QueryCtx, work: Doc<"creaPublicWorks">) {
  const author = await publicAuthor(ctx, work.userId);
  const job = await ctx.db.get("generationJobs", work.jobId);
  if (!author || !job?.outputStorageId) return null;
  const thumbStorage = work.kind === "image" ? job.outputStorageId : job.posterStorageId;
  return {
    _id: work._id,
    kind: work.kind,
    title: work.title ?? null,
    author: author.name,
    thumbUrl: thumbStorage ? await ctx.storage.getUrl(thumbStorage) : null,
  };
}

/**
 * Jedan javni rad sa stablom remiksa (od čega je nastao i odobrene „svoje verzije").
 * Drugi vide samo odobren rad; vlasnik vidi i svoj rad na čekanju ili odbijen (sa razlogom).
 */
export const getPublicWork = query({
  args: { workId: v.id("creaPublicWorks") },
  handler: async (ctx, args) => {
    if (!(await galleryEnabled(ctx))) return null;
    const viewerId = await currentUserId(ctx);
    const work = await ctx.db.get("creaPublicWorks", args.workId);
    if (!work || work.status === "withdrawn") return null;
    const isOwner = viewerId === work.userId;
    if (work.status !== "approved" && !isOwner) return null;
    const view = await publicWorkView(ctx, work, viewerId, { withRemix: true });
    if (!view) return null;
    const parentRow = work.remixOfWorkId ? await ctx.db.get("creaPublicWorks", work.remixOfWorkId) : null;
    const childRows = await ctx.db
      .query("creaPublicWorks")
      .withIndex("by_remixOfWorkId_and_status", (q) => q.eq("remixOfWorkId", work._id).eq("status", "approved"))
      .order("desc")
      .take(12);
    const [parent, children] = await Promise.all([
      parentRow && parentRow.status === "approved" ? thumbOf(ctx, parentRow) : Promise.resolve(null),
      Promise.all(childRows.map((row) => thumbOf(ctx, row))),
    ]);
    return {
      ...view,
      status: work.status,
      rejectReason: isOwner ? (work.rejectReason ?? null) : null,
      parent,
      children: children.filter((child): child is NonNullable<typeof child> => child !== null),
    };
  },
});

/** Moji objavljeni radovi (sa stanjem moderacije). */
export const myPublicWorks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId || !(await galleryEnabled(ctx))) return [];
    const rows = await ctx.db
      .query("creaPublicWorks")
      .withIndex("by_userId_and_publishedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(60);
    const visible = rows.filter((row) => row.status !== "withdrawn");
    const thumbs = await Promise.all(visible.map((row) => thumbOf(ctx, row)));
    return visible.flatMap((row, index) => {
      const thumb = thumbs[index];
      return thumb
        ? [{ ...thumb, status: row.status, likes: row.likes, remixes: row.remixes, rejectReason: row.rejectReason ?? null, challengeDayKey: row.challengeDayKey ?? null }]
        : [];
    });
  },
});

/** Stanje deljenja jednog mog rada (panel u detalju rada). */
export const myWorkShare = query({
  args: { jobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const enabled = await galleryEnabled(ctx);
    const userId = await currentUserId(ctx);
    if (!enabled || !userId) return { enabled, work: null };
    const work = await ctx.db
      .query("creaPublicWorks")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();
    if (!work || work.userId !== userId || work.status === "withdrawn") return { enabled, work: null };
    return {
      enabled,
      work: {
        _id: work._id,
        status: work.status,
        title: work.title ?? null,
        sharePrompt: work.sharePrompt,
        likes: work.likes,
        remixes: work.remixes,
        rejectReason: work.rejectReason ?? null,
        challengeDayKey: work.challengeDayKey ?? null,
      },
    };
  },
});

/** Objavi svoj gotov rad (ide na moderaciju). Opis se deli samo uz `sharePrompt`. */
export const publishWork = mutation({
  args: { jobId: v.id("generationJobs"), title: v.optional(v.string()), sharePrompt: v.boolean() },
  handler: async (ctx, args) => {
    await requireGallery(ctx);
    const { userId } = await requireCommunityActor(ctx);
    const { work } = await publishJobFor(ctx, userId, args.jobId, { title: args.title, sharePrompt: args.sharePrompt });
    return { workId: work._id, status: work.status };
  },
});

/** Povuci svoj rad iz galerije (i sa izazova). Lajkovi i remiksi ostaju zapisani. */
export const withdrawWork = mutation({
  args: { workId: v.id("creaPublicWorks") },
  handler: async (ctx, args) => {
    const { userId } = await requireCommunityActor(ctx);
    const work = await ctx.db.get("creaPublicWorks", args.workId);
    if (!work || work.userId !== userId) throw new Error("NEMA_PRISTUPA");
    if (work.status !== "withdrawn") await ctx.db.patch("creaPublicWorks", work._id, { status: "withdrawn" });
    return null;
  },
});

/** Lajk / poništi lajk. Samo odobren tuđ rad; jedan lajk po osobi (ne donosi nagradu). */
export const toggleLike = mutation({
  args: { workId: v.id("creaPublicWorks") },
  handler: async (ctx, args) => {
    await requireGallery(ctx);
    const { userId } = await requireCommunityActor(ctx);
    const work = await ctx.db.get("creaPublicWorks", args.workId);
    if (!work || work.status !== "approved") throw new Error("RAD_NIJE_JAVAN");
    if (work.userId === userId) throw new Error("SVOJ_RAD");
    const existing = await ctx.db
      .query("creaLikes")
      .withIndex("by_workId_and_userId", (q) => q.eq("workId", work._id).eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.delete("creaLikes", existing._id);
      await ctx.db.patch("creaPublicWorks", work._id, { likes: Math.max(0, work.likes - 1) });
      return { liked: false, likes: Math.max(0, work.likes - 1) };
    }
    await ctx.db.insert("creaLikes", { workId: work._id, userId, createdAt: Date.now() });
    await ctx.db.patch("creaPublicWorks", work._id, { likes: work.likes + 1 });
    return { liked: true, likes: work.likes + 1 };
  },
});

// ── Deljeni stilovi (G11) ────────────────────────────────────────────────────

function styleView(style: Doc<"creaUserStyles">) {
  return {
    _id: style._id,
    name: style.name,
    styleId: style.styleId ?? null,
    camera: style.camera ?? null,
    palette: style.palette ?? [],
    promptFragment: style.promptFragment,
    uses: style.uses,
  };
}

/** Podeli svoj stil sa zajednicom (ide na moderaciju) ili ga vrati u privatne. */
export const setStyleShared = mutation({
  args: { styleId: v.id("creaUserStyles"), shared: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await requireCommunityActor(ctx);
    const style = await ctx.db.get("creaUserStyles", args.styleId);
    if (!style || style.userId !== userId) throw new Error("NEMA_PRISTUPA");
    if (!args.shared) {
      await ctx.db.patch("creaUserStyles", style._id, { isPublic: false, publicStatus: undefined });
      return null;
    }
    await requireGallery(ctx);
    if (!validatePrompt([style.name, style.promptFragment].join(". "), 1000).ok) throw new Error("NEPRIKLADAN_STIL");
    if (style.isPublic && style.publicStatus) return null;
    await ctx.db.patch("creaUserStyles", style._id, { isPublic: true, publicStatus: "pending", publishedAt: Date.now() });
    return null;
  },
});

/** Odobreni deljeni stilovi, najkorišćeniji prvi. */
export const listPublicStyles = query({
  args: {},
  handler: async (ctx) => {
    if (!(await galleryEnabled(ctx))) return [];
    const viewerId = await currentUserId(ctx);
    const rows = await ctx.db
      .query("creaUserStyles")
      .withIndex("by_publicStatus_and_uses", (q) => q.eq("publicStatus", "approved"))
      .order("desc")
      .take(60);
    const shared = rows.filter((row) => row.isPublic);
    const authors = await Promise.all(shared.map((row) => publicAuthor(ctx, row.userId)));
    return shared.flatMap((row, index) => {
      const author = authors[index];
      return author ? [{ ...styleView(row), author, isMine: row.userId === viewerId }] : [];
    });
  },
});

/** Jedan deljen stil („Koristi stil" u radionici). */
export const getSharedStyle = query({
  args: { styleId: v.id("creaUserStyles") },
  handler: async (ctx, args) => {
    if (!(await galleryEnabled(ctx))) return null;
    const style = await ctx.db.get("creaUserStyles", args.styleId);
    if (!style || !style.isPublic || style.publicStatus !== "approved") return null;
    const author = await publicAuthor(ctx, style.userId);
    return author ? { ...styleView(style), author } : null;
  },
});

// ── Moderacija (moderation grid, osoblje) ────────────────────────────────────

const moderationStatus = v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"));

/**
 * Red za moderaciju: javni radovi ili deljeni stilovi po stanju. Osoblje vidi izlaz i
 * naslov; opis samo ako ga je autor podelio (isto što bi videli svi posle odobrenja).
 */
export const moderationQueue = query({
  args: { kind: v.union(v.literal("radovi"), v.literal("stilovi")), status: moderationStatus },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (args.kind === "stilovi") {
      const rows = await ctx.db
        .query("creaUserStyles")
        .withIndex("by_publicStatus_and_publishedAt", (q) => q.eq("publicStatus", args.status))
        .order("desc")
        .take(50);
      const authors = await Promise.all(rows.map((row) => publicAuthor(ctx, row.userId)));
      return {
        works: [],
        styles: rows.flatMap((row, index) => (authors[index] && row.isPublic ? [{ ...styleView(row), author: authors[index]! }] : [])),
      };
    }
    const rows = await ctx.db
      .query("creaPublicWorks")
      .withIndex("by_status_and_publishedAt", (q) => q.eq("status", args.status))
      .order("desc")
      .take(50);
    const works = await Promise.all(
      rows.map(async (row) => {
        const view = await publicWorkView(ctx, row, null);
        return view ? { ...view, status: row.status, rejectReason: row.rejectReason ?? null } : null;
      }),
    );
    return { works: works.filter((work): work is NonNullable<typeof work> => work !== null), styles: [] };
  },
});

const decisionValidator = v.union(v.literal("approve"), v.literal("reject"));

function cleanReason(raw: string | undefined): string | undefined {
  const reason = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, REJECT_REASON_MAX);
  return reason || undefined;
}

/**
 * Odobri ili odbij javni rad (odbijanje važi i za već odobren rad - skidanje). Prvo
 * odobrenje prijave na izazov donosi XP učešća (`crea_challenge`, jednom po danu).
 */
export const moderateWork = mutation({
  args: { workId: v.id("creaPublicWorks"), decision: decisionValidator, reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId: staffId } = await requireStaff(ctx);
    const work = await ctx.db.get("creaPublicWorks", args.workId);
    if (!work || work.status === "withdrawn") throw new Error("RAD_NIJE_PRONADJEN");
    const now = Date.now();
    if (args.decision === "approve") {
      await ctx.db.patch("creaPublicWorks", work._id, { status: "approved", moderatedBy: staffId, moderatedAt: now, rejectReason: undefined });
      if (work.challengeDayKey) {
        await awardCreaXp(ctx, { userId: work.userId, type: "crea_challenge", sourceId: work.challengeDayKey, occurredAt: now });
      }
    } else {
      await ctx.db.patch("creaPublicWorks", work._id, { status: "rejected", moderatedBy: staffId, moderatedAt: now, rejectReason: cleanReason(args.reason) });
      // Skinuta prijava ne nosi XP učešća.
      if (work.challengeDayKey && work.status === "approved") {
        await syncLeaderboardSourceEvent(ctx, { userId: work.userId, sourceType: "crea_challenge", sourceId: work.challengeDayKey, active: false });
      }
    }
    return null;
  },
});

export const moderateStyle = mutation({
  args: { styleId: v.id("creaUserStyles"), decision: decisionValidator },
  handler: async (ctx, args) => {
    const { userId: staffId } = await requireStaff(ctx);
    const style = await ctx.db.get("creaUserStyles", args.styleId);
    if (!style || !style.isPublic) throw new Error("STIL_NIJE_PRONADJEN");
    await ctx.db.patch("creaUserStyles", style._id, {
      publicStatus: args.decision === "approve" ? "approved" : "rejected",
      moderatedBy: staffId,
      moderatedAt: Date.now(),
    });
    return null;
  },
});
