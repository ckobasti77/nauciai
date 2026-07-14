import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

const RESEND_COOLDOWN_MS = 60 * 1000;

type VerificationResult =
  | { status: "verified"; email: string }
  | { status: "invalid" | "expired" | "used" | "email_changed" };

function normalizeEmail(value: string | undefined | null) {
  return String(value ?? "").trim().toLowerCase();
}

export const getPasswordSetupState = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .take(20);
    const hasPassword = accounts.some((account) => account.provider === "password");
    const hasGoogle = accounts.some((account) => account.provider === "google");
    const isGoogleOnly = hasGoogle && !hasPassword;
    const email = normalizeEmail(user.email);
    const emailVerifiedForCourses = isGoogleOnly
      ? Boolean(user.appEmailVerificationTime || user.passwordEmailVerificationTime)
      : Boolean(user.appEmailVerificationTime || user.passwordEmailVerificationTime || user.emailVerificationTime);

    return {
      email,
      name: String(user.name ?? email.split("@")[0] ?? "Student").trim(),
      hasEmail: Boolean(email),
      hasPassword,
      hasGoogle,
      isGoogleOnly,
      emailVerifiedForCourses,
      emailVerifiedForPassword: emailVerifiedForCourses,
    };
  },
});

export const createRequest = internalMutation({
  args: {
    userId: v.id("users"),
    tokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const currentEmail = normalizeEmail(user?.email);
    if (!user || !currentEmail) {
      throw new Error("A verified account email is required before requesting verification.");
    }
    const recent = await ctx.db
      .query("emailVerificationTokens")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(1);
    if (recent[0] && args.createdAt - recent[0].createdAt < RESEND_COOLDOWN_MS) {
      throw new Error("Verification email was sent recently. Please wait a minute before trying again.");
    }

    const previous = await ctx.db
      .query("emailVerificationTokens")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", args.userId))
      .take(50);
    for (const token of previous) await ctx.db.delete(token._id);

    await ctx.db.insert("emailVerificationTokens", {
      userId: args.userId,
      email: currentEmail,
      tokenHash: args.tokenHash,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });

    return { email: currentEmail, expiresAt: args.expiresAt };
  },
});

export const removeRequest = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("emailVerificationTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (token) await ctx.db.delete(token._id);
    return null;
  },
});

export const consumeRequest = internalMutation({
  args: { tokenHash: v.string(), now: v.number() },
  handler: async (ctx, args): Promise<VerificationResult> => {
    const token = await ctx.db
      .query("emailVerificationTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!token) return { status: "invalid" };
    if (token.consumedAt) return { status: "used" };
    if (token.expiresAt <= args.now) return { status: "expired" };

    const user = await ctx.db.get(token.userId);
    if (!user || normalizeEmail(user.email) !== token.email) {
      return { status: "email_changed" };
    }

    await ctx.db.patch(user._id, {
      emailVerificationTime: user.emailVerificationTime ?? args.now,
      passwordEmailVerificationTime: args.now,
      appEmailVerificationTime: args.now,
    });

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
      .take(20);
    for (const account of accounts) {
      if (account.provider === "password") {
        await ctx.db.patch(account._id, { emailVerified: token.email });
      }
    }

    await ctx.db.patch(token._id, { consumedAt: args.now });
    return { status: "verified", email: token.email };
  },
});
