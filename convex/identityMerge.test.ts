/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("password identifiers resolve email, username, and @username server-side", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "student@example.com", username: "čitalac_1" });
    await ctx.db.insert("profiles", {
      userId,
      email: "student@example.com",
      name: "Student",
      username: "čitalac_1",
      role: "student",
      language: "sr",
      searchText: "Student čitalac_1 student@example.com",
      createdAt: 1,
      updatedAt: 1,
    });
  });

  await expect(t.query(internal.authInternal.resolvePasswordIdentifier, { identifier: "STUDENT@EXAMPLE.COM" })).resolves.toBe("student@example.com");
  await expect(t.query(internal.authInternal.resolvePasswordIdentifier, { identifier: "čitalac_1" })).resolves.toBe("student@example.com");
  await expect(t.query(internal.authInternal.resolvePasswordIdentifier, { identifier: "@ČITALAC_1" })).resolves.toBe("student@example.com");
  await expect(t.query(internal.authInternal.resolvePasswordIdentifier, { identifier: "missing_user" })).resolves.toBeNull();
});

test("verified duplicate accounts merge data and providers idempotently", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const canonicalUserId = await ctx.db.insert("users", {
      email: "linked@example.com",
      appEmailVerificationTime: 10,
    });
    const duplicateUserId = await ctx.db.insert("users", {
      email: "linked@example.com",
      emailVerificationTime: 9,
    });
    await ctx.db.insert("authAccounts", { userId: canonicalUserId, provider: "google", providerAccountId: "google-linked" });
    await ctx.db.insert("authAccounts", { userId: duplicateUserId, provider: "password", providerAccountId: "linked@example.com", secret: "hashed" });
    await ctx.db.insert("profiles", {
      userId: canonicalUserId,
      email: "linked@example.com",
      name: "Linked User",
      username: "linked_user",
      role: "student",
      language: "sr",
      searchText: "Linked User linked_user linked@example.com",
      createdAt: 1,
      updatedAt: 10,
    });
    await ctx.db.insert("profileStats", { userId: duplicateUserId, completedLessons: 7, updatedAt: 9 });
    return { canonicalUserId, duplicateUserId };
  });

  await expect(t.mutation(internal.identityMerge.mergeVerifiedUsers, ids)).resolves.toMatchObject({ merged: true });
  await expect(t.mutation(internal.identityMerge.mergeVerifiedUsers, ids)).resolves.toEqual({ merged: false, reason: "already_merged" });

  const state = await t.run(async (ctx) => ({
    duplicate: await ctx.db.get(ids.duplicateUserId),
    password: await ctx.db.query("authAccounts").withIndex("providerAndAccountId", (q) => q.eq("provider", "password").eq("providerAccountId", "linked@example.com")).unique(),
    stats: await ctx.db.query("profileStats").withIndex("by_userId", (q) => q.eq("userId", ids.canonicalUserId)).unique(),
  }));
  expect(state.duplicate).toMatchObject({ mergedInto: ids.canonicalUserId });
  expect(state.duplicate?.email).toBeUndefined();
  expect(state.password?.userId).toBe(ids.canonicalUserId);
  expect(state.stats?.completedLessons).toBe(7);
});

test("admin dry-run chooses complete profile before older incomplete duplicate", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.com", emailVerificationTime: 1 });
    await ctx.db.insert("profiles", { userId: adminUserId, email: "admin@example.com", name: "Admin", username: "admin_user", role: "admin", language: "sr", searchText: "Admin", createdAt: 1, updatedAt: 1 });
    const olderUserId = await ctx.db.insert("users", { email: "choice@example.com", emailVerificationTime: 1 });
    const completeUserId = await ctx.db.insert("users", { email: "choice@example.com", emailVerificationTime: 2 });
    await ctx.db.insert("authAccounts", { userId: olderUserId, provider: "password", providerAccountId: "choice@example.com" });
    await ctx.db.insert("authAccounts", { userId: completeUserId, provider: "google", providerAccountId: "google-choice" });
    await ctx.db.insert("profiles", { userId: completeUserId, email: "choice@example.com", name: "Complete", username: "complete_user", role: "student", language: "sr", searchText: "Complete", createdAt: 2, updatedAt: 2 });
    return { adminUserId, completeUserId };
  });
  const asAdmin = t.withIdentity({ subject: ids.adminUserId, tokenIdentifier: `test|${ids.adminUserId}` });
  const preview = await asAdmin.query(api.identityMerge.previewVerifiedDuplicateAccounts, {});
  expect(preview.groups).toHaveLength(1);
  expect(preview.groups[0].canonicalUserId).toBe(ids.completeUserId);
});
