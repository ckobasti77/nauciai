/// <reference types="vite/client" />

/**
 * Spajanje naloga za Crea tabele (K30, nalaz K29-11): sadržaj prelazi na
 * kanonski nalog, album je unija (preuzeta nagrada ostaje preuzeta), važi stroži
 * lični limit, brend kit ostaje noviji, a pominjanje Lika ostaje jedinstveno.
 */

import aggregateTest from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "chatInbox");
  aggregateTest.register(t, "studyHub");
  return t;
}

test("Crea podaci drugog naloga prelaze na kanonski, bez duplih nagrada i sa jedinstvenim @pominjanjem", async () => {
  const t = createTest();
  const ids = await t.run(async (ctx) => {
    const canonicalUserId = await ctx.db.insert("users", {
      email: "spoj@example.com", appEmailVerificationTime: 1, name: "Kanon", username: "spoj_kanon", role: "student", createdAt: 1, updatedAt: 1,
    });
    const duplicateUserId = await ctx.db.insert("users", { email: "spoj@example.com" });
    await ctx.db.insert("authAccounts", { userId: canonicalUserId, provider: "google", providerAccountId: "spoj-google" });
    await ctx.db.insert("authAccounts", { userId: duplicateUserId, provider: "password", providerAccountId: "spoj@example.com", secret: "hashed" });

    const image = await ctx.storage.store(new Blob(["lik"]));
    for (const userId of [canonicalUserId, duplicateUserId]) {
      await ctx.db.insert("creaElements", {
        userId, kind: "mesto", name: "Kafana", handle: "kafana", imageStorageIds: [image], origin: "foto", createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("creaAlbumPages", { userId, pageId: "prvi-koraci", completedAt: 1, rewardCredits: 0 });
      await ctx.db.insert("creaStickers", { userId, stickerId: "prvi:slika", pageId: "prvi-koraci", earnedAt: 1 });
    }
    // Nagrada za istu stranu je preuzeta na drugom nalogu.
    const lot = await ctx.db.insert("creditLots", {
      userId: duplicateUserId, source: "reward", granted: 5, remaining: 5, grantedAt: 1, expiresAt: Date.now() + 1e9,
    });
    const duplicatePage = await ctx.db
      .query("creaAlbumPages")
      .withIndex("by_userId_and_pageId", (q) => q.eq("userId", duplicateUserId).eq("pageId", "prvi-koraci"))
      .unique();
    await ctx.db.patch(duplicatePage!._id, { rewardLotId: lot, rewardCredits: 5, rewardedAt: 2 });
    await ctx.db.insert("creaStickers", { userId: duplicateUserId, stickerId: "alat:slika.format", pageId: "alati-1", earnedAt: 1 });
    await ctx.db.insert("creaSpendLimits", { userId: canonicalUserId, dailyCredits: 500, updatedAt: 1 });
    await ctx.db.insert("creaSpendLimits", { userId: duplicateUserId, dailyCredits: 50, updatedAt: 1 });
    await ctx.db.insert("creaBrandKits", { userId: duplicateUserId, name: "Pekara", colors: [], fonts: { heading: "nunito", body: "nunito" }, updatedAt: 5 });
    await ctx.db.insert("creaUserStyles", {
      userId: duplicateUserId, name: "Moj stil", promptFragment: "toplo", uses: 0, isPublic: false, createdAt: 1,
    } as never);
    return { canonicalUserId, duplicateUserId };
  });

  await t.mutation(internal.identityMerge.mergeVerifiedUsers, ids);

  const state = await t.run(async (ctx) => ({
    elements: await ctx.db.query("creaElements").withIndex("by_user_updated", (q) => q.eq("userId", ids.canonicalUserId)).collect(),
    pages: await ctx.db.query("creaAlbumPages").collect(),
    stickers: await ctx.db.query("creaStickers").collect(),
    limits: await ctx.db.query("creaSpendLimits").collect(),
    kits: await ctx.db.query("creaBrandKits").collect(),
    styles: await ctx.db.query("creaUserStyles").collect(),
  }));

  expect(state.elements.map((row) => row.handle).sort()).toEqual(["kafana", "kafana2"]);
  expect(state.pages).toHaveLength(1);
  expect(state.pages[0]).toMatchObject({ userId: ids.canonicalUserId, rewardCredits: 5 });
  expect(state.pages[0]!.rewardLotId).toBeDefined();
  expect(state.stickers.map((row) => row.stickerId).sort()).toEqual(["alat:slika.format", "prvi:slika"]);
  expect(state.stickers.every((row) => row.userId === ids.canonicalUserId)).toBe(true);
  expect(state.limits).toEqual([expect.objectContaining({ userId: ids.canonicalUserId, dailyCredits: 50 })]);
  expect(state.kits).toEqual([expect.objectContaining({ userId: ids.canonicalUserId, name: "Pekara" })]);
  expect(state.styles.every((row) => row.userId === ids.canonicalUserId)).toBe(true);
});
