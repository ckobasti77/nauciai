import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { releaseImages } from "./creaElements";
import { uniqueHandle } from "./creaElementsCore";

/**
 * Spajanje naloga za Crea tabele (K30, nalaz K29-11). `identityMerge` je do sada
 * prebacivao samo radove, kredite i uploade, pa su posle automatskog spajanja
 * (`mergePasswordDuplicateForUser`) Likovi, brend kit, stilovi, montaže, album i
 * lični limit ostajali na mrtvom nalogu - a pinovani fajlovi elemenata prelazili
 * na novi bez ikoga ko bi ih ikad oslobodio.
 *
 * Pravila: sadržaj se prebacuje; tabele „jedan red po osobi" se spajaju (album i
 * sličice kao unija, preuzeta nagrada ostaje preuzeta; stroži lični limit; noviji
 * brend kit); dnevni zbirovi se sabiraju. Lajkovi, glasovi i mesto u ligi nemaju
 * indeks po korisniku i ostaju kakvi jesu (ODLUKA K30: glas/lajk mrtvog naloga se
 * ne broji dvaput u budućnosti jer je nalog spojen, a istorija izazova je zatvorena).
 */

const MERGE_ROW_LIMIT = 1000;

function bounded<T>(rows: T[], label: string): T[] {
  if (rows.length > MERGE_ROW_LIMIT) throw new Error(`Spajanje naloga: previše redova (${label}).`);
  return rows;
}

export async function mergeCreaRows(ctx: MutationCtx, canonicalUserId: Id<"users">, duplicateUserId: Id<"users">) {
  const take = MERGE_ROW_LIMIT + 1;

  // ── Sadržaj: prosto prebacivanje vlasnika ──────────────────────────────────
  for (const row of bounded(
    await ctx.db.query("creaUserStyles").withIndex("by_user", (q) => q.eq("userId", duplicateUserId)).take(take),
    "stilovi",
  )) {
    await ctx.db.patch("creaUserStyles", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaMontages").withIndex("by_user_updated", (q) => q.eq("userId", duplicateUserId)).take(take),
    "montaže",
  )) {
    await ctx.db.patch("creaMontages", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaStoryboards").withIndex("by_user_updated", (q) => q.eq("userId", duplicateUserId)).take(take),
    "stripovi",
  )) {
    await ctx.db.patch("creaStoryboards", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaBoardItems").withIndex("by_userId", (q) => q.eq("userId", duplicateUserId)).take(take),
    "tabla",
  )) {
    await ctx.db.patch("creaBoardItems", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaVoicePresets").withIndex("by_user_created", (q) => q.eq("userId", duplicateUserId)).take(take),
    "podešavanja glasa",
  )) {
    await ctx.db.patch("creaVoicePresets", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaAssistantPlans").withIndex("by_userId_and_createdAt", (q) => q.eq("userId", duplicateUserId)).take(take),
    "planovi pomoćnika",
  )) {
    await ctx.db.patch("creaAssistantPlans", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaPublicWorks").withIndex("by_userId_and_publishedAt", (q) => q.eq("userId", duplicateUserId)).take(take),
    "javni radovi",
  )) {
    await ctx.db.patch("creaPublicWorks", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaFreeJobs").withIndex("by_userId_and_kind_and_createdAt", (q) => q.eq("userId", duplicateUserId)).take(take),
    "besplatni poslovi",
  )) {
    await ctx.db.patch("creaFreeJobs", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaVoiceConsents").withIndex("by_user_created", (q) => q.eq("userId", duplicateUserId)).take(take),
    "pristanci glasa",
  )) {
    await ctx.db.patch("creaVoiceConsents", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaEmbeddings").withIndex("by_userId", (q) => q.eq("userId", duplicateUserId)).take(take),
    "vektori pretrage",
  )) {
    await ctx.db.patch("creaEmbeddings", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaChallengeResults").withIndex("by_winnerUserId_and_dayKey", (q) => q.eq("winnerUserId", duplicateUserId)).take(take),
    "rezultati izazova",
  )) {
    await ctx.db.patch("creaChallengeResults", row._id, { winnerUserId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaAuthorRewards").withIndex("by_authorId_and_dayKey", (q) => q.eq("authorId", duplicateUserId)).take(take),
    "nagrade autoru",
  )) {
    await ctx.db.patch("creaAuthorRewards", row._id, { authorId: canonicalUserId });
  }

  // Likovi: pominjanje (`@ime`) mora da ostane jedinstveno po osobi.
  const canonicalElements = await ctx.db
    .query("creaElements")
    .withIndex("by_user_updated", (q) => q.eq("userId", canonicalUserId))
    .take(take);
  const handles = new Set(bounded(canonicalElements, "likovi").map((row) => row.handle));
  for (const row of bounded(
    await ctx.db.query("creaElements").withIndex("by_user_updated", (q) => q.eq("userId", duplicateUserId)).take(take),
    "likovi",
  )) {
    const handle = uniqueHandle(row.handle, handles);
    handles.add(handle);
    await ctx.db.patch("creaElements", row._id, { userId: canonicalUserId, handle });
  }

  // ── Jedan red po osobi ─────────────────────────────────────────────────────
  // Brend kit: ostaje noviji; logo starijeg se oslobađa (pinovan fajl inače curi).
  const [keptKit, otherKit] = await Promise.all([
    ctx.db.query("creaBrandKits").withIndex("by_user", (q) => q.eq("userId", canonicalUserId)).unique(),
    ctx.db.query("creaBrandKits").withIndex("by_user", (q) => q.eq("userId", duplicateUserId)).unique(),
  ]);
  if (otherKit) {
    if (!keptKit) await ctx.db.patch("creaBrandKits", otherKit._id, { userId: canonicalUserId });
    else {
      const [newer, older] = otherKit.updatedAt > keptKit.updatedAt ? [otherKit, keptKit] : [keptKit, otherKit];
      if (older.logoStorageId && older.logoStorageId !== newer.logoStorageId) {
        await releaseImages(ctx, canonicalUserId, [older.logoStorageId]);
      }
      await ctx.db.delete("creaBrandKits", older._id);
      if (newer.userId !== canonicalUserId) await ctx.db.patch("creaBrandKits", newer._id, { userId: canonicalUserId });
    }
  }

  // Lični dnevni limit: važi stroži (alat za samokontrolu ne sme da nestane spajanjem).
  const [keptLimit, otherLimit] = await Promise.all([
    ctx.db.query("creaSpendLimits").withIndex("by_userId", (q) => q.eq("userId", canonicalUserId)).unique(),
    ctx.db.query("creaSpendLimits").withIndex("by_userId", (q) => q.eq("userId", duplicateUserId)).unique(),
  ]);
  if (otherLimit) {
    if (!keptLimit) await ctx.db.patch("creaSpendLimits", otherLimit._id, { userId: canonicalUserId });
    else {
      await ctx.db.patch("creaSpendLimits", keptLimit._id, {
        dailyCredits: Math.min(keptLimit.dailyCredits, otherLimit.dailyCredits),
        updatedAt: Date.now(),
      });
      await ctx.db.delete("creaSpendLimits", otherLimit._id);
    }
  }

  // Profil Cree: kod poziva ostaje (link koji je već deljen i dalje radi).
  const [keptProfile, otherProfile] = await Promise.all([
    ctx.db.query("creaProfiles").withIndex("by_userId", (q) => q.eq("userId", canonicalUserId)).unique(),
    ctx.db.query("creaProfiles").withIndex("by_userId", (q) => q.eq("userId", duplicateUserId)).unique(),
  ]);
  if (otherProfile) {
    if (!keptProfile) await ctx.db.patch("creaProfiles", otherProfile._id, { userId: canonicalUserId });
    else {
      await ctx.db.delete("creaProfiles", otherProfile._id);
      if (!keptProfile.inviteCode && otherProfile.inviteCode) {
        await ctx.db.patch("creaProfiles", keptProfile._id, { inviteCode: otherProfile.inviteCode, updatedAt: Date.now() });
      }
    }
  }

  // Album: unija sličica i strana; preuzeta nagrada ostaje preuzeta (inače bi se
  // ista strana platila dvaput - ključ lota sadrži id korisnika).
  for (const row of bounded(
    await ctx.db.query("creaStickers").withIndex("by_userId_and_stickerId", (q) => q.eq("userId", duplicateUserId)).take(take),
    "sličice",
  )) {
    const kept = await ctx.db
      .query("creaStickers")
      .withIndex("by_userId_and_stickerId", (q) => q.eq("userId", canonicalUserId).eq("stickerId", row.stickerId))
      .first();
    if (kept) await ctx.db.delete("creaStickers", row._id);
    else await ctx.db.patch("creaStickers", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaAlbumPages").withIndex("by_userId_and_pageId", (q) => q.eq("userId", duplicateUserId)).take(take),
    "strane albuma",
  )) {
    const kept = await ctx.db
      .query("creaAlbumPages")
      .withIndex("by_userId_and_pageId", (q) => q.eq("userId", canonicalUserId).eq("pageId", row.pageId))
      .first();
    if (!kept) {
      await ctx.db.patch("creaAlbumPages", row._id, { userId: canonicalUserId });
      continue;
    }
    if (kept.rewardLotId === undefined && row.rewardLotId !== undefined) {
      await ctx.db.patch("creaAlbumPages", kept._id, {
        rewardLotId: row.rewardLotId,
        rewardCredits: row.rewardCredits,
        ...(row.rewardedAt !== undefined ? { rewardedAt: row.rewardedAt } : {}),
        ...(row.rewardDayKey !== undefined ? { rewardDayKey: row.rewardDayKey } : {}),
      });
    }
    await ctx.db.delete("creaAlbumPages", row._id);
  }
  for (const row of bounded(
    await ctx.db.query("creaMiniLessonProgress").withIndex("by_userId_and_lessonId", (q) => q.eq("userId", duplicateUserId)).take(take),
    "mini-lekcije",
  )) {
    const kept = await ctx.db
      .query("creaMiniLessonProgress")
      .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", canonicalUserId).eq("lessonId", row.lessonId))
      .first();
    if (kept) await ctx.db.delete("creaMiniLessonProgress", row._id);
    else await ctx.db.patch("creaMiniLessonProgress", row._id, { userId: canonicalUserId });
  }
  // Besplatne probe: ista lekcija na oba naloga = proba se ne udvostručava.
  for (const row of bounded(
    await ctx.db.query("creaFreeTries").withIndex("by_userId_and_lessonId", (q) => q.eq("userId", duplicateUserId)).take(take),
    "besplatne probe",
  )) {
    const kept = await ctx.db
      .query("creaFreeTries")
      .withIndex("by_userId_and_lessonId", (q) => q.eq("userId", canonicalUserId).eq("lessonId", row.lessonId))
      .first();
    if (kept) {
      await ctx.db.patch("creaFreeTries", kept._id, { remaining: Math.min(kept.remaining, row.remaining), updatedAt: Date.now() });
      await ctx.db.delete("creaFreeTries", row._id);
    } else await ctx.db.patch("creaFreeTries", row._id, { userId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaVoiceFavorites").withIndex("by_user_engine_voice", (q) => q.eq("userId", duplicateUserId)).take(take),
    "omiljeni glasovi",
  )) {
    const kept = await ctx.db
      .query("creaVoiceFavorites")
      .withIndex("by_user_engine_voice", (q) => q.eq("userId", canonicalUserId).eq("engine", row.engine).eq("voiceId", row.voiceId))
      .first();
    if (kept) await ctx.db.delete("creaVoiceFavorites", row._id);
    else await ctx.db.patch("creaVoiceFavorites", row._id, { userId: canonicalUserId });
  }
  // Dnevni broj LLM poziva se sabira (inače bi spajanje resetovalo dnevni limit).
  for (const row of bounded(
    await ctx.db.query("creaLlmUsage").withIndex("by_user_day", (q) => q.eq("userId", duplicateUserId)).take(take),
    "LLM pozivi",
  )) {
    const kept = await ctx.db
      .query("creaLlmUsage")
      .withIndex("by_user_day", (q) => q.eq("userId", canonicalUserId).eq("day", row.day))
      .unique();
    if (!kept) {
      await ctx.db.patch("creaLlmUsage", row._id, { userId: canonicalUserId });
      continue;
    }
    await ctx.db.patch("creaLlmUsage", kept._id, {
      calls: kept.calls + row.calls,
      inputTokens: kept.inputTokens + row.inputTokens,
      outputTokens: kept.outputTokens + row.outputTokens,
      costUsd: kept.costUsd + row.costUsd,
    });
    await ctx.db.delete("creaLlmUsage", row._id);
  }

  // ── Parovi i pozivi ────────────────────────────────────────────────────────
  for (const row of bounded(
    await ctx.db.query("creaInvites").withIndex("by_inviterId_and_acceptedAt", (q) => q.eq("inviterId", duplicateUserId)).take(take),
    "pozivi (pozivalac)",
  )) {
    await ctx.db.patch("creaInvites", row._id, { inviterId: canonicalUserId });
  }
  for (const row of bounded(
    await ctx.db.query("creaInvites").withIndex("by_inviteeId", (q) => q.eq("inviteeId", duplicateUserId)).take(take),
    "pozivi (prijatelj)",
  )) {
    // Jedan poziv po prijatelju: ako ga kanonski nalog već ima, ovaj se briše.
    const kept = await ctx.db.query("creaInvites").withIndex("by_inviteeId", (q) => q.eq("inviteeId", canonicalUserId)).first();
    if (kept) await ctx.db.delete("creaInvites", row._id);
    else await ctx.db.patch("creaInvites", row._id, { inviteeId: canonicalUserId });
  }
  const now = Date.now();
  for (const side of ["userAId", "userBId"] as const) {
    const index = side === "userAId" ? "by_userAId_and_endedAt" : "by_userBId_and_endedAt";
    const rows = await ctx.db
      .query("creaPairs")
      .withIndex(index, (q) => q.eq(side, duplicateUserId))
      .take(take);
    for (const row of bounded(rows, "parovi")) {
      const next = { ...row, [side]: canonicalUserId };
      // Par sa samim sobom (oba naloga bila u paru) se završava.
      const self = next.userAId === next.userBId;
      await ctx.db.patch("creaPairs", row._id, {
        [side]: canonicalUserId,
        ...(self && row.endedAt === undefined ? { endedAt: now } : {}),
      });
    }
  }
}
