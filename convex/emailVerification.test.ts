/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedGoogleUser(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "verify@example.com",
      name: "Verify User",
    });
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "google",
      providerAccountId: "google-verify-user",
    });
    return userId;
  });
}

test("email verification tokens are replaced, rate limited, and consumed once", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedGoogleUser(t);
  const baseTime = 1_000_000;

  await t.mutation(internal.emailVerificationInternal.createRequest, {
    userId,
    tokenHash: "first-hash",
    createdAt: baseTime,
    expiresAt: baseTime + 30 * 60 * 1000,
  });

  await expect(
    t.mutation(internal.emailVerificationInternal.createRequest, {
      userId,
      tokenHash: "too-soon",
      createdAt: baseTime + 59_000,
      expiresAt: baseTime + 30 * 60 * 1000,
    }),
  ).rejects.toThrow("sent recently");

  await t.mutation(internal.emailVerificationInternal.createRequest, {
    userId,
    tokenHash: "second-hash",
    createdAt: baseTime + 61_000,
    expiresAt: baseTime + 31 * 60 * 1000,
  });

  const oldToken = await t.run(async (ctx) =>
    ctx.db
      .query("emailVerificationTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", "first-hash"))
      .unique(),
  );
  expect(oldToken).toBeNull();

  const verified = await t.mutation(internal.emailVerificationInternal.consumeRequest, {
    tokenHash: "second-hash",
    now: baseTime + 62_000,
  });
  expect(verified).toEqual({ status: "verified", email: "verify@example.com" });

  const used = await t.mutation(internal.emailVerificationInternal.consumeRequest, {
    tokenHash: "second-hash",
    now: baseTime + 63_000,
  });
  expect(used).toEqual({ status: "used" });

  const setupState = await t.query(internal.emailVerificationInternal.getPasswordSetupState, { userId });
  expect(setupState).toMatchObject({
    isGoogleOnly: true,
    hasPassword: false,
    emailVerifiedForCourses: true,
    emailVerifiedForPassword: true,
  });
});

test("expired tokens and email changes cannot verify an account", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedGoogleUser(t);
  const baseTime = 2_000_000;

  await t.mutation(internal.emailVerificationInternal.createRequest, {
    userId,
    tokenHash: "expired-hash",
    createdAt: baseTime,
    expiresAt: baseTime + 100,
  });
  await expect(
    t.mutation(internal.emailVerificationInternal.consumeRequest, {
      tokenHash: "expired-hash",
      now: baseTime + 101,
    }),
  ).resolves.toEqual({ status: "expired" });

  await t.mutation(internal.emailVerificationInternal.createRequest, {
    userId,
    tokenHash: "changed-email-hash",
    createdAt: baseTime + 61_000,
    expiresAt: baseTime + 31 * 60 * 1000,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, { email: "changed@example.com" });
  });

  await expect(
    t.mutation(internal.emailVerificationInternal.consumeRequest, {
      tokenHash: "changed-email-hash",
      now: baseTime + 62_000,
    }),
  ).resolves.toEqual({ status: "email_changed" });
});

test("a verified Google user can attach a password to the existing account", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedGoogleUser(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, {
      emailVerificationTime: 3_000_000,
      appEmailVerificationTime: 3_000_000,
      passwordEmailVerificationTime: 3_000_000,
    });
  });

  const asUser = t.withIdentity({
    subject: userId,
    tokenIdentifier: `test|${userId}`,
  });
  await expect(
    asUser.action(api.auth.setViewerPassword, { password: "StrongPass1!" }),
  ).resolves.toEqual({ hasPassword: true });

  const passwordAccount = await t.run(async (ctx) =>
    ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", "verify@example.com"),
      )
      .unique(),
  );
  expect(passwordAccount).toMatchObject({
    userId,
    provider: "password",
    providerAccountId: "verify@example.com",
  });
  expect(passwordAccount?.secret).not.toBe("StrongPass1!");
});

test("an existing password cannot be changed through the direct setup action", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      email: "existing@example.com",
      emailVerificationTime: 4_000_000,
      appEmailVerificationTime: 4_000_000,
    });
    await ctx.db.insert("authAccounts", {
      userId: id,
      provider: "password",
      providerAccountId: "existing@example.com",
      secret: "already-hashed",
      emailVerified: "existing@example.com",
    });
    return id;
  });
  const asUser = t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });

  await expect(asUser.action(api.auth.setViewerPassword, { password: "AnotherPass1!" })).rejects.toThrow(
    "Use the password reset email",
  );
});
