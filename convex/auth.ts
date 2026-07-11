import type { OIDCConfig } from "@auth/core/providers";
import type { GoogleProfile } from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { createAccount, getAuthUserId, modifyAccountCredentials } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { upsertProfileFromAuthUser } from "./helpers";
import { isStrongPassword } from "../lib/password-policy";

const googleClientId = process.env.AUTH_GOOGLE_ID?.trim();
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET?.trim();
const resendApiKey = process.env.AUTH_RESEND_KEY?.trim();
const resendFrom = process.env.AUTH_RESEND_FROM?.trim() || "Nauci AI <onboarding@resend.dev>";
const passwordEmailProvider = resendApiKey
  ? Resend({
      apiKey: resendApiKey,
      from: resendFrom,
    })
  : undefined;
const googleProvider: OIDCConfig<GoogleProfile> | null =
  googleClientId && googleClientSecret
    ? {
        id: "google",
        name: "Google",
        type: "oidc",
        issuer: "https://accounts.google.com",
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        authorization: {
          url: "https://accounts.google.com/o/oauth2/v2/auth",
          params: {
            prompt: "select_account",
            response_type: "code",
            scope: "openid profile email",
          },
        },
        token: "https://oauth2.googleapis.com/token",
        userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
        checks: ["pkce"],
        profile(profile) {
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
          };
        },
      }
    : null;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: passwordEmailProvider,
      verify: passwordEmailProvider,
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        const name = String(params.name ?? email.split("@")[0] ?? "Student").trim();
        const username = String(params.username ?? "").trim().toLowerCase();

        return {
          email,
          name,
          ...(username ? { username } : {}),
        };
      },
      validatePasswordRequirements(password) {
        if (!isStrongPassword(password)) {
          throw new Error("Password must be at least 8 characters and include an uppercase letter, a number, and a special character.");
        }
      },
    }),
    ...(googleProvider ? [googleProvider] : []),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, profile }) {
      await upsertProfileFromAuthUser(
        ctx as unknown as MutationCtx,
        userId as Id<"users">,
        profile,
      );
    },
  },
});

export const setViewerPassword = action({
  args: { password: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    if (!isStrongPassword(args.password)) {
      throw new Error("Password must be at least 8 characters and include an uppercase letter, a number, and a special character.");
    }

    const identity = await ctx.auth.getUserIdentity();
    const email = String(identity?.email ?? "").trim().toLowerCase();
    if (!email) {
      throw new Error("A verified account email is required before setting a password.");
    }

    const created = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        name: String(identity?.name ?? email.split("@")[0] ?? "Student"),
      },
      shouldLinkViaEmail: true,
      shouldLinkViaPhone: false,
    });
    if (String(created.user._id) !== String(userId)) {
      throw new Error("Password credential could not be linked to the current user.");
    }

    return { hasPassword: true };
  },
});

export const changeViewerPassword = action({
  args: { password: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    if (!isStrongPassword(args.password)) {
      throw new Error("Password must be at least 8 characters and include an uppercase letter, a number, and a special character.");
    }

    const identity = await ctx.auth.getUserIdentity();
    const email = String(identity?.email ?? "").trim().toLowerCase();
    if (!email) {
      throw new Error("A verified account email is required before changing a password.");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
    });
    return { hasPassword: true };
  },
});
